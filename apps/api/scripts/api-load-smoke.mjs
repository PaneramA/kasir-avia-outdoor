import { randomBytes } from 'node:crypto';
import { prisma } from '../src/data/prisma.js';
import {
  evaluateLoadGate,
  summarizeMeasurements,
} from './api-load-smoke-utils.mjs';

const baseUrl = String(process.env.API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const tenantId = String(process.env.LOAD_TEST_TENANT_ID || '').trim();
const branchId = String(process.env.LOAD_TEST_BRANCH_ID || '').trim();
const providedToken = String(process.env.LOAD_TEST_TOKEN || '').trim();
const username = String(process.env.LOAD_TEST_USERNAME || '').trim();
const password = String(process.env.LOAD_TEST_PASSWORD || '');
const itemId = String(process.env.LOAD_TEST_ITEM_ID || '').trim();
const concurrency = boundedInteger(process.env.LOAD_TEST_CONCURRENCY, 5, 1, 50);
const iterations = boundedInteger(process.env.LOAD_TEST_ITERATIONS, 10, 1, 1_000);
const cycleCount = boundedInteger(process.env.LOAD_TEST_CYCLE_COUNT, 0, 0, 25);
const thresholds = {
  maxErrorRate: boundedNumber(process.env.LOAD_TEST_MAX_ERROR_RATE, 0.01, 0, 1),
  maxReadP95Ms: boundedInteger(process.env.LOAD_TEST_MAX_P95_MS, 1_500, 1, 60_000),
  maxStockMismatchCount: 0,
};

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  const normalized = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(maximum, Math.max(minimum, normalized));
}

function boundedNumber(value, fallback, minimum, maximum) {
  const parsed = Number.parseFloat(String(value ?? ''));
  const normalized = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(maximum, Math.max(minimum, normalized));
}

function fail(message) {
  throw new Error(`[api-load-smoke] ${message}`);
}

function requestHeaders(token, { json = false } = {}) {
  return {
    Authorization: `Bearer ${token}`,
    'x-tenant-id': tenantId,
    'x-branch-id': branchId,
    'Accept-Encoding': 'gzip',
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function getToken() {
  if (providedToken) return providedToken;
  if (!username || !password) {
    fail('Set LOAD_TEST_TOKEN atau LOAD_TEST_USERNAME dan LOAD_TEST_PASSWORD.');
  }

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.data?.token) {
    fail(`Login gagal (${response.status}): ${payload?.message || 'token tidak tersedia'}`);
  }
  return payload.data.token;
}

async function requestEndpoint(path, token, options = {}) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...requestHeaders(token, { json: typeof options.body !== 'undefined' }),
      ...options.headers,
    },
  });
  const responseBytes = await response.arrayBuffer();
  let payload = {};
  try {
    payload = JSON.parse(Buffer.from(responseBytes).toString('utf8'));
  } catch {
    payload = {};
  }

  return {
    path,
    durationMs: performance.now() - startedAt,
    status: response.status,
    bytes: responseBytes.byteLength,
    data: payload?.data,
    message: payload?.message || '',
  };
}

async function runReadLoad(token) {
  const endpoints = [
    '/api/dashboard/summary',
    '/api/items/page?limit=50',
    '/api/rentals/history?limit=50',
  ];
  const jobs = Array.from({ length: concurrency }, async () => {
    const measurements = [];
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      for (const endpoint of endpoints) {
        measurements.push(await requestEndpoint(endpoint, token));
      }
    }
    return measurements;
  });
  const results = (await Promise.all(jobs)).flat();
  return {
    endpoints,
    results,
    summary: summarizeMeasurements(results),
  };
}

async function getCycleItem() {
  if (cycleCount === 0) return null;
  if (!itemId) {
    fail('Set LOAD_TEST_ITEM_ID saat LOAD_TEST_CYCLE_COUNT lebih dari 0.');
  }

  const item = await prisma.item.findFirst({
    where: { id: itemId, tenantId, branchId, archivedAt: null },
    select: { id: true, name: true, stock: true },
  });
  if (!item) {
    fail('LOAD_TEST_ITEM_ID tidak aktif atau bukan milik tenant/cabang pengujian.');
  }
  if (item.stock < cycleCount) {
    fail(`Stok ${item.name} (${item.stock}) lebih kecil dari LOAD_TEST_CYCLE_COUNT (${cycleCount}).`);
  }
  return item;
}

async function runRentalCycles(token, item, runPrefix, tracking) {
  if (!item) return;

  const { measurements, rentalIds, customerPhones } = tracking;
  const jobs = Array.from({ length: cycleCount }, async (_, index) => {
    const suffix = String(index + 1).padStart(2, '0');
    const rentalId = `${runPrefix}-${suffix}`;
    const customerPhone = `LOAD-${runPrefix.slice(-12)}-${suffix}`;
    rentalIds.push(rentalId);
    customerPhones.push(customerPhone);

    const checkout = await requestEndpoint('/api/rentals', token, {
      method: 'POST',
      body: JSON.stringify({
        id: rentalId,
        customer: {
          name: `Load Smoke ${suffix}`,
          phone: customerPhone,
          guarantee: 'KTP',
        },
        items: [{ id: item.id, qty: 1, notes: runPrefix }],
        duration: 1,
        payment: { status: 'LUNAS', method: 'TUNAI' },
      }),
    });
    measurements.push(checkout);
    if (checkout.status !== 201) {
      throw new Error(`checkout ${rentalId} gagal (${checkout.status}): ${checkout.message}`);
    }

    const returned = await requestEndpoint('/api/returns', token, {
      method: 'POST',
      body: JSON.stringify({ rentalId, additionalFee: 0, returnNotes: runPrefix }),
    });
    measurements.push(returned);
    if (returned.status !== 200) {
      throw new Error(`return ${rentalId} gagal (${returned.status}): ${returned.message}`);
    }
  });

  const outcomes = await Promise.allSettled(jobs);
  const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
  if (rejected) {
    throw rejected.reason;
  }

}

async function cleanupCycles(rentalIds, customerPhones) {
  if (rentalIds.length === 0) return;

  await prisma.$transaction(async (tx) => {
    const rentals = await tx.rental.findMany({
      where: { id: { in: rentalIds }, tenantId, branchId },
      include: { items: true },
    });
    for (const rental of rentals) {
      if (String(rental.status).toLowerCase() === 'active' && !rental.deletedAt) {
        for (const rentalItem of rental.items) {
          await tx.item.updateMany({
            where: { id: rentalItem.itemId, tenantId, branchId },
            data: { stock: { increment: rentalItem.qty } },
          });
        }
      }
    }

    await tx.returnRecord.deleteMany({ where: { rentalId: { in: rentalIds }, tenantId, branchId } });
    await tx.rental.deleteMany({ where: { id: { in: rentalIds }, tenantId, branchId } });
    await tx.customer.deleteMany({
      where: {
        tenantId,
        branchId,
        phone: { in: customerPhones },
        rentals: { none: {} },
      },
    });
  });
}

async function run() {
  if (!tenantId || !branchId) {
    fail('Set LOAD_TEST_TENANT_ID dan LOAD_TEST_BRANCH_ID.');
  }

  const token = await getToken();
  const cycleItem = await getCycleItem();
  const initialStock = cycleItem?.stock ?? null;
  const runPrefix = `LOAD-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const cycleResult = { measurements: [], rentalIds: [], customerPhones: [] };
  let cycleError = null;

  const readLoad = await runReadLoad(token);
  try {
    await runRentalCycles(token, cycleItem, runPrefix, cycleResult);
  } catch (error) {
    cycleError = error;
  } finally {
    await cleanupCycles(cycleResult.rentalIds, cycleResult.customerPhones);
  }

  const finalItem = cycleItem
    ? await prisma.item.findFirst({
        where: { id: cycleItem.id, tenantId, branchId },
        select: { stock: true },
      })
    : null;
  const stockMismatchCount = cycleItem && finalItem?.stock !== initialStock ? 1 : 0;
  const allMeasurements = [...readLoad.results, ...cycleResult.measurements];
  const allSummary = summarizeMeasurements(allMeasurements);
  const summary = {
    baseUrl,
    tenantId,
    branchId,
    concurrency,
    iterations,
    cycleCount,
    requests: allSummary.requests,
    failures: allSummary.failures,
    errorRate: allSummary.errorRate,
    readLatency: {
      averageMs: readLoad.summary.averageMs,
      p50Ms: readLoad.summary.p50Ms,
      p95Ms: readLoad.summary.p95Ms,
      maxMs: readLoad.summary.maxMs,
    },
    stock: {
      itemId: cycleItem?.id || null,
      initial: initialStock,
      final: finalItem?.stock ?? null,
      mismatchCount: stockMismatchCount,
    },
    endpoints: Object.fromEntries(readLoad.endpoints.map((endpoint) => {
      const measurements = readLoad.results.filter((entry) => entry.path === endpoint);
      return [endpoint, summarizeMeasurements(measurements)];
    })),
    cycleError: cycleError instanceof Error ? cycleError.message : null,
  };

  console.log(JSON.stringify(summary, null, 2));
  const gateFailures = evaluateLoadGate({
    errorRate: summary.errorRate,
    p95Ms: summary.readLatency.p95Ms,
    stockMismatchCount,
  }, thresholds);
  if (cycleError) gateFailures.push(summary.cycleError);
  if (gateFailures.length > 0) {
    fail(gateFailures.join('; '));
  }
}

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

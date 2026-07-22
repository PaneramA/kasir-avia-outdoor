import { randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  buildCyclePlan,
  buildRecoveryManifest,
  createCleanupController,
  evaluateLoadGate,
  fetchWithTimeout,
  isSuccessfulReturnCleanup,
  summarizeMeasurements,
  validateRecoveryManifest,
  verifyGzipEncoding,
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
const requestTimeoutMs = boundedInteger(process.env.LOAD_TEST_REQUEST_TIMEOUT_MS, 10_000, 100, 60_000);
const cleanupTimeoutMs = boundedInteger(process.env.LOAD_TEST_CLEANUP_TIMEOUT_MS, 20_000, 2_000, 120_000);
const expectGzip = parseBoolean(process.env.LOAD_TEST_EXPECT_GZIP, false);
const gzipPath = normalizeApiPath(process.env.LOAD_TEST_GZIP_PATH || '/api/items');
const requestedRecoveryFile = String(process.env.LOAD_TEST_RECOVERY_FILE || '').trim();
const recoveryDirectory = resolve(
  String(process.env.LOAD_TEST_RECOVERY_DIR || '').trim()
    || join(process.cwd(), '.load-smoke-recovery'),
);
const thresholds = {
  maxErrorRate: boundedNumber(process.env.LOAD_TEST_MAX_ERROR_RATE, 0.01, 0, 1),
  maxReadP95Ms: boundedInteger(process.env.LOAD_TEST_MAX_P95_MS, 1_500, 1, 60_000),
  maxStockMismatchCount: 0,
};
const requestAbortController = new AbortController();
let activeCleanupController = null;
let activeMutationPromise = null;
let activeRecoveryFile = '';
let terminationStarted = false;
let mutationOutcomeUncertain = false;

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

function parseBoolean(value, fallback) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  fail(`Nilai boolean tidak valid: ${value}`);
}

function normalizeApiPath(value) {
  const path = String(value || '').trim();
  if (!path.startsWith('/api/')) {
    fail('LOAD_TEST_GZIP_PATH harus berupa path API yang diawali /api/.');
  }
  return path;
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

  const response = await fetchWithTimeout(globalThis.fetch, `${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    signal: requestAbortController.signal,
  }, requestTimeoutMs);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.data?.token) {
    fail(`Login gagal (${response.status}): ${payload?.message || 'token tidak tersedia'}`);
  }
  return payload.data.token;
}

async function requestEndpoint(path, token, options = {}) {
  const {
    requireGzip = false,
    requestSignal = requestAbortController.signal,
    ...fetchOptions
  } = options;
  const startedAt = performance.now();
  const url = `${baseUrl}${path}`;
  const response = await fetchWithTimeout(globalThis.fetch, url, {
    ...fetchOptions,
    headers: {
      ...requestHeaders(token, { json: typeof fetchOptions.body !== 'undefined' }),
      ...fetchOptions.headers,
    },
    signal: requestSignal,
  }, requestTimeoutMs);
  let contentEncoding = null;
  try {
    contentEncoding = verifyGzipEncoding(response.headers, { required: requireGzip, url });
  } catch (error) {
    await response.body?.cancel().catch(() => {});
    throw error;
  }
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
    contentEncoding,
    data: payload?.data,
    message: payload?.message || '',
  };
}

function assertSuccessfulResponse(response, label) {
  if (response.status < 200 || response.status >= 300) {
    fail(`${label} gagal (${response.status}): ${response.message || 'response tidak valid'}`);
  }
  return response.data;
}

async function verifyPublicProxyCompression(token) {
  if (!expectGzip) return null;
  const response = await requestEndpoint(gzipPath, token, { requireGzip: true });
  assertSuccessfulResponse(response, 'Verifikasi gzip');
  return {
    path: gzipPath,
    contentEncoding: response.contentEncoding,
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

async function findApiItem(token, targetItemId, { requestSignal } = {}) {
  let cursor = '';
  for (let page = 0; page < 100; page += 1) {
    const query = new URLSearchParams({
      status: 'all',
      limit: '100',
      ...(cursor ? { cursor } : {}),
    });
    const response = await requestEndpoint(`/api/items/page?${query.toString()}`, token, {
      requestSignal,
    });
    const data = assertSuccessfulResponse(response, 'Pencarian item load-smoke');
    const found = Array.isArray(data?.items)
      ? data.items.find((entry) => entry.id === targetItemId)
      : null;
    if (found) return found;
    cursor = String(data?.nextCursor || '');
    if (!cursor) break;
  }
  fail('Item load-smoke tidak ditemukan melalui API pada tenant/cabang yang dikonfigurasi.');
}

async function getCycleItem(token) {
  if (cycleCount === 0) return null;
  if (!itemId) {
    fail('Set LOAD_TEST_ITEM_ID saat LOAD_TEST_CYCLE_COUNT lebih dari 0.');
  }
  const item = await findApiItem(token, itemId);
  if (item.archivedAt) {
    fail('LOAD_TEST_ITEM_ID sudah diarsipkan.');
  }
  if (item.stock < cycleCount) {
    fail(`Stok ${item.name} (${item.stock}) lebih kecil dari LOAD_TEST_CYCLE_COUNT (${cycleCount}).`);
  }
  return item;
}

async function runRentalCycles(token, item, runPrefix, cyclePlan, tracking) {
  if (!item) return;

  const { measurements } = tracking;
  const jobs = cyclePlan.map(async ({ suffix, rentalId, customerPhone }) => {
    let checkout;
    try {
      checkout = await requestEndpoint('/api/rentals', token, {
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
    } catch (error) {
      mutationOutcomeUncertain = true;
      throw error;
    }
    measurements.push(checkout);
    if (checkout.status !== 201) {
      if (checkout.status >= 500) mutationOutcomeUncertain = true;
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

function wait(delayMs, signal) {
  return new Promise((resolveWait, reject) => {
    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(signal.reason);
    };
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolveWait();
    }, delayMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function cleanupCycles(token, manifest, reason) {
  const cleanupSignal = AbortSignal.timeout(Math.max(1_000, cleanupTimeoutMs - 500));
  const waitForLateMutation = mutationOutcomeUncertain || reason === 'recovery';
  const settleDurationMs = Math.max(
    1_000,
    Math.min(requestTimeoutMs + 1_000, cleanupTimeoutMs - 2_000),
  );
  const settleUntil = waitForLateMutation ? Date.now() + settleDurationMs : Date.now();
  let finalStock = null;
  let lastErrors = [];
  let retryDelayMs = 250;

  do {
    const outcomes = await Promise.all(manifest.cyclePlan.map(async ({ rentalId }) => {
      const response = await requestEndpoint('/api/returns', token, {
        method: 'POST',
        body: JSON.stringify({
          rentalId,
          additionalFee: 0,
          returnNotes: `${manifest.runPrefix} cleanup`,
        }),
        requestSignal: cleanupSignal,
      });
      if (isSuccessfulReturnCleanup(response)) return null;
      return `${rentalId}: ${response.status} ${response.message || 'cleanup gagal'}`;
    }));
    lastErrors = outcomes.filter(Boolean);
    if (lastErrors.length > 0) {
      throw new Error(`Cleanup API ditolak: ${lastErrors.join('; ')}`);
    }
    const finalItem = await findApiItem(token, manifest.itemId, { requestSignal: cleanupSignal });
    finalStock = Number(finalItem.stock);

    if (
      lastErrors.length === 0
      && finalStock === manifest.initialStock
      && Date.now() >= settleUntil
    ) {
      return { finalStock };
    }
    await wait(retryDelayMs, cleanupSignal);
    retryDelayMs = Math.min(2_000, retryDelayMs * 2);
  } while (!cleanupSignal.aborted);

  const details = [
    ...lastErrors,
    ...(finalStock !== manifest.initialStock
      ? [`stock ${finalStock} belum kembali ke ${manifest.initialStock}`]
      : []),
  ];
  throw new Error(`Cleanup API tidak selesai: ${details.join('; ') || 'timeout'}`);
}

function printRecoveryInstructions(recoveryFile) {
  if (!recoveryFile) return;
  console.error('[api-load-smoke] Cleanup belum terkonfirmasi. Jangan mulai run mutasi baru.');
  console.error(`[api-load-smoke] Manifest recovery: ${recoveryFile}`);
  console.error(
    `[api-load-smoke] Jalankan ulang dengan API dan kredensial yang sama serta LOAD_TEST_RECOVERY_FILE="${recoveryFile}".`,
  );
}

async function persistRecoveryManifest(manifest) {
  await mkdir(recoveryDirectory, { recursive: true });
  const recoveryFile = join(recoveryDirectory, `${manifest.runPrefix}.json`);
  await writeFile(recoveryFile, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  return recoveryFile;
}

function configureCleanup(token, manifest, recoveryFile) {
  activeRecoveryFile = recoveryFile;
  activeCleanupController = createCleanupController({
    timeoutMs: cleanupTimeoutMs,
    recoveryFile,
    cleanup: async (reason) => {
      console.error(`[api-load-smoke] Cleanup dimulai (${reason}) untuk ${manifest.runPrefix}.`);
      await cleanupCycles(token, manifest, reason);
      await unlink(recoveryFile).catch((error) => {
        if (error?.code !== 'ENOENT') throw error;
      });
      console.error(`[api-load-smoke] Cleanup selesai untuk ${manifest.runPrefix}.`);
    },
  });
  return activeCleanupController;
}

async function loadRecoveryManifest() {
  const recoveryFile = resolve(requestedRecoveryFile);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(recoveryFile, 'utf8'));
  } catch (error) {
    fail(`Manifest recovery tidak dapat dibaca: ${error instanceof Error ? error.message : error}`);
  }
  validateRecoveryManifest(manifest, { baseUrl, tenantId, branchId });
  return { manifest, recoveryFile };
}

async function waitForMutationToSettle() {
  if (!activeMutationPromise) return;
  let timeoutId;
  await Promise.race([
    activeMutationPromise.catch(() => {}),
    new Promise((resolveTimeout) => {
      timeoutId = setTimeout(resolveTimeout, requestTimeoutMs + 1_000);
    }),
  ]).finally(() => clearTimeout(timeoutId));
}

async function handleTermination(signal) {
  const exitCode = signal === 'SIGINT' ? 130 : 143;
  if (terminationStarted) {
    console.error(`[api-load-smoke] ${signal} diterima lagi; proses dihentikan paksa.`);
    process.exit(exitCode);
  }
  terminationStarted = true;
  mutationOutcomeUncertain = true;
  console.error(`[api-load-smoke] ${signal} diterima; request dihentikan dan cleanup dicoba.`);
  requestAbortController.abort(new Error(`Load smoke interrupted by ${signal}`));
  try {
    await waitForMutationToSettle();
    if (activeCleanupController) {
      await activeCleanupController.run(signal);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    printRecoveryInstructions(activeRecoveryFile);
  } finally {
    process.exit(exitCode);
  }
}

process.on('SIGINT', () => void handleTermination('SIGINT'));
process.on('SIGTERM', () => void handleTermination('SIGTERM'));

async function runRecovery(token) {
  const { manifest, recoveryFile } = await loadRecoveryManifest();
  console.error(`[api-load-smoke] Recovery prefix: ${manifest.runPrefix}`);
  const cleanupController = configureCleanup(token, manifest, recoveryFile);
  try {
    await cleanupController.run('recovery');
  } catch (error) {
    printRecoveryInstructions(recoveryFile);
    throw error;
  }
  console.log(JSON.stringify({
    recovered: true,
    runPrefix: manifest.runPrefix,
    targetBinding: 'api-only',
  }, null, 2));
}

async function run() {
  if (!tenantId || !branchId) {
    fail('Set LOAD_TEST_TENANT_ID dan LOAD_TEST_BRANCH_ID.');
  }

  const token = await getToken();
  if (requestedRecoveryFile) {
    await runRecovery(token);
    return;
  }

  const compression = await verifyPublicProxyCompression(token);
  const cycleItem = await getCycleItem(token);
  const initialStock = cycleItem?.stock ?? null;
  let runPrefix = null;
  let recoveryFile = null;
  let cyclePlan = [];
  const cycleResult = { measurements: [] };
  let cycleError = null;

  const readLoad = await runReadLoad(token);
  if (cycleItem) {
    runPrefix = `LOAD-${Date.now()}-${randomBytes(4).toString('hex')}`;
    cyclePlan = buildCyclePlan(runPrefix, cycleCount);
    const manifest = buildRecoveryManifest({
      runPrefix,
      baseUrl,
      tenantId,
      branchId,
      itemId: cycleItem.id,
      initialStock,
      cyclePlan,
    });
    recoveryFile = await persistRecoveryManifest(manifest);
    console.error(`[api-load-smoke] Run prefix: ${runPrefix}`);
    console.error(`[api-load-smoke] Recovery manifest: ${recoveryFile}`);
    console.error('[api-load-smoke] Target binding: API-only (mutasi, cleanup, dan stok).');

    const cleanupController = configureCleanup(token, manifest, recoveryFile);
    try {
      activeMutationPromise = runRentalCycles(
        token,
        cycleItem,
        runPrefix,
        cyclePlan,
        cycleResult,
      );
      await activeMutationPromise;
    } catch (error) {
      cycleError = error;
    } finally {
      try {
        await cleanupController.run('finally');
      } catch (cleanupError) {
        printRecoveryInstructions(recoveryFile);
        cycleError = cycleError
          ? new Error(`${cycleError.message}; ${cleanupError.message}`)
          : cleanupError;
      }
      activeMutationPromise = null;
    }
  }

  const finalItem = cycleItem
    ? await findApiItem(token, cycleItem.id)
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
    runPrefix,
    targetBinding: 'api-only',
    recoveryFile,
    compression,
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
  });

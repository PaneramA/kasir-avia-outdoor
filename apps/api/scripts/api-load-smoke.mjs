const baseUrl = String(process.env.API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const tenantId = String(process.env.LOAD_TEST_TENANT_ID || '').trim();
const branchId = String(process.env.LOAD_TEST_BRANCH_ID || '').trim();
const providedToken = String(process.env.LOAD_TEST_TOKEN || '').trim();
const username = String(process.env.LOAD_TEST_USERNAME || '').trim();
const password = String(process.env.LOAD_TEST_PASSWORD || '');
const concurrency = Math.min(50, Math.max(1, Number.parseInt(process.env.LOAD_TEST_CONCURRENCY || '5', 10) || 5));
const iterations = Math.min(1_000, Math.max(1, Number.parseInt(process.env.LOAD_TEST_ITERATIONS || '10', 10) || 10));
const maxP95Ms = Number.parseInt(process.env.LOAD_TEST_MAX_P95_MS || '0', 10) || 0;

function fail(message) {
  throw new Error(`[api-load-smoke] ${message}`);
}

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
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

async function requestEndpoint(path, token) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenantId,
      'x-branch-id': branchId,
      'Accept-Encoding': 'gzip',
    },
  });
  await response.arrayBuffer();
  return {
    path,
    durationMs: performance.now() - startedAt,
    status: response.status,
    bytes: Number(response.headers.get('content-length') || 0),
    serverTiming: response.headers.get('server-timing') || '',
  };
}

async function run() {
  if (!tenantId || !branchId) {
    fail('Set LOAD_TEST_TENANT_ID dan LOAD_TEST_BRANCH_ID.');
  }

  const token = await getToken();
  const endpoints = [
    '/api/dashboard/summary',
    '/api/items/page?limit=50',
    '/api/rentals/history?limit=50',
    '/api/financial/recap?limit=50',
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
  const failures = results.filter((entry) => entry.status < 200 || entry.status >= 300);
  const durations = results.map((entry) => entry.durationMs);
  const summary = {
    baseUrl,
    concurrency,
    iterations,
    requests: results.length,
    failures: failures.length,
    averageMs: Math.round(durations.reduce((sum, value) => sum + value, 0) / Math.max(1, durations.length)),
    p95Ms: Math.round(percentile(durations, 0.95)),
    maxMs: Math.round(Math.max(...durations, 0)),
    averageBytes: Math.round(results.reduce((sum, entry) => sum + entry.bytes, 0) / Math.max(1, results.length)),
    endpoints: Object.fromEntries(endpoints.map((endpoint) => {
      const measurements = results.filter((entry) => entry.path === endpoint);
      return [endpoint, {
        requests: measurements.length,
        averageMs: Math.round(measurements.reduce((sum, entry) => sum + entry.durationMs, 0) / Math.max(1, measurements.length)),
        p95Ms: Math.round(percentile(measurements.map((entry) => entry.durationMs), 0.95)),
        averageBytes: Math.round(measurements.reduce((sum, entry) => sum + entry.bytes, 0) / Math.max(1, measurements.length)),
      }];
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
  if (failures.length > 0) {
    fail(`${failures.length} request gagal, contoh: ${failures[0].path} -> ${failures[0].status}`);
  }
  if (maxP95Ms > 0 && summary.p95Ms > maxP95Ms) {
    fail(`p95 ${summary.p95Ms}ms melampaui LOAD_TEST_MAX_P95_MS=${maxP95Ms}.`);
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

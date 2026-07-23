export function percentile(values, ratio) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1),
  );
  return sorted[index];
}

export function summarizeMeasurements(measurements = []) {
  const durations = measurements.map((entry) => Number(entry.durationMs) || 0);
  const failures = measurements.filter((entry) => entry.status < 200 || entry.status >= 300);
  const requests = measurements.length;

  return {
    requests,
    failures: failures.length,
    errorRate: requests > 0 ? failures.length / requests : 0,
    averageMs: Math.round(
      durations.reduce((sum, value) => sum + value, 0) / Math.max(1, requests),
    ),
    p50Ms: Math.round(percentile(durations, 0.5)),
    p95Ms: Math.round(percentile(durations, 0.95)),
    maxMs: Math.round(Math.max(...durations, 0)),
  };
}

export function evaluateLoadGate(summary, thresholds) {
  const failures = [];
  if (summary.errorRate > thresholds.maxErrorRate) {
    failures.push(
      `error rate ${(summary.errorRate * 100).toFixed(2)}% exceeds ${(thresholds.maxErrorRate * 100).toFixed(2)}%`,
    );
  }
  if (summary.p95Ms > thresholds.maxReadP95Ms) {
    failures.push(`read p95 ${summary.p95Ms}ms exceeds ${thresholds.maxReadP95Ms}ms`);
  }
  if (summary.stockMismatchCount > thresholds.maxStockMismatchCount) {
    failures.push(
      `stock mismatch count ${summary.stockMismatchCount} exceeds ${thresholds.maxStockMismatchCount}`,
    );
  }
  return failures;
}

export async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = 10_000) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;
  try {
    return await fetchImpl(url, { ...options, signal });
  } catch (error) {
    if (timeoutSignal.aborted) {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`, { cause: error });
    }
    throw error;
  }
}

export function verifyGzipEncoding(headers, { required = false, url = '' } = {}) {
  if (!required) return null;
  const encoding = String(headers?.get?.('content-encoding') || '').trim().toLowerCase();
  const encodings = encoding.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (!encodings.includes('gzip')) {
    throw new Error(
      `Expected Content-Encoding gzip from ${url || 'configured public proxy'}, received ${encoding || 'none'}.`,
    );
  }
  return 'gzip';
}

export function isSuccessfulReturnCleanup({ status, message } = {}) {
  return status === 200 || (
    status === 400
    && /rental (?:already returned|not found)/i.test(String(message || ''))
  );
}

export function buildCyclePlan(runPrefix, cycleCount) {
  return Array.from({ length: cycleCount }, (_, index) => {
    const suffix = String(index + 1).padStart(2, '0');
    const rentalId = `${runPrefix}-${suffix}`;
    return {
      suffix,
      rentalId,
      customerPhone: rentalId,
    };
  });
}

export function buildRecoveryManifest({
  runPrefix,
  baseUrl,
  tenantId,
  branchId,
  itemId,
  initialStock,
  cyclePlan,
}) {
  let parsedBaseUrl;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    throw new Error('Recovery manifest API base URL is invalid.');
  }
  if (parsedBaseUrl.username || parsedBaseUrl.password) {
    throw new Error('Recovery manifest must not contain credentials in its API base URL.');
  }
  return {
    version: 1,
    runPrefix,
    createdAt: new Date().toISOString(),
    baseUrl,
    tenantId,
    branchId,
    itemId,
    initialStock,
    cyclePlan,
  };
}

export function assertRecoveryManifestOldEnough(manifest, {
  minimumAgeMs,
  nowMs = Date.now(),
} = {}) {
  const createdAtMs = Date.parse(String(manifest?.createdAt || ''));
  if (!Number.isFinite(createdAtMs)) {
    throw new Error('Recovery manifest creation time is invalid.');
  }
  const remainingMs = createdAtMs + minimumAgeMs - nowMs;
  if (remainingMs > 0) {
    throw new Error(`Wait before finalizing recovery (${remainingMs}ms remaining).`);
  }
}

export function validateRecoveryManifest(manifest, { baseUrl, tenantId, branchId }) {
  if (!manifest || manifest.version !== 1) {
    throw new Error('Unsupported load-smoke recovery manifest.');
  }
  const credentialKey = Object.keys(manifest).find((key) => (
    /token|password|secret|database.?url/i.test(key)
  ));
  if (credentialKey) {
    throw new Error('Recovery manifest must not contain credentials.');
  }
  if (manifest.baseUrl !== baseUrl) {
    throw new Error('Recovery manifest does not match the configured API target.');
  }
  if (manifest.tenantId !== tenantId || manifest.branchId !== branchId) {
    throw new Error('Recovery manifest does not match the configured tenant and branch.');
  }
  const runPrefix = String(manifest.runPrefix || '');
  if (!/^LOAD-[A-Za-z0-9-]+$/.test(runPrefix) || runPrefix.length > 100) {
    throw new Error('Recovery manifest has an unsafe run prefix.');
  }
  if (!String(manifest.itemId || '').trim()) {
    throw new Error('Recovery manifest does not identify its load-test item.');
  }
  if (!Number.isFinite(manifest.initialStock) || manifest.initialStock < 0) {
    throw new Error('Recovery manifest has an invalid initial stock.');
  }
  if (
    !Array.isArray(manifest.cyclePlan)
    || manifest.cyclePlan.length < 1
    || manifest.cyclePlan.length > 25
  ) {
    throw new Error('Recovery manifest has an invalid cycle plan.');
  }
  const expectedPlan = buildCyclePlan(runPrefix, manifest.cyclePlan.length);
  const unsafeEntry = manifest.cyclePlan.some((entry, index) => (
    entry?.suffix !== expectedPlan[index].suffix
    || entry?.rentalId !== expectedPlan[index].rentalId
    || entry?.customerPhone !== expectedPlan[index].customerPhone
  ));
  if (unsafeEntry) {
    throw new Error('Recovery manifest contains an unsafe recovery identifier.');
  }
  return manifest;
}

export function createCleanupController({ cleanup, timeoutMs, recoveryFile }) {
  let cleanupPromise;
  return {
    run(reason = 'cleanup') {
      if (!cleanupPromise) {
        let timeoutId;
        const timeout = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(
              `Cleanup timed out after ${timeoutMs}ms. Recovery manifest: ${recoveryFile}`,
            ));
          }, timeoutMs);
        });
        cleanupPromise = Promise.race([
          Promise.resolve().then(() => cleanup(reason)),
          timeout,
        ]).finally(() => clearTimeout(timeoutId));
      }
      return cleanupPromise;
    },
  };
}

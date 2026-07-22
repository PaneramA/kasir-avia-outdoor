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

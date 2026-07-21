export function attachRequestLogger(req, res, { enabled }) {
  res.__aviaRequestStartedAt = Date.now();

  if (!enabled) {
    return;
  }

  const startedAt = Date.now();
  const { method, url } = req;

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const status = res.statusCode;
    const responseBytes = Number(res.__aviaResponseBytes || 0);
    const rawResponseBytes = Number(res.__aviaResponseUncompressedBytes || responseBytes);
    const sizeSummary = rawResponseBytes > responseBytes
      ? `${responseBytes}b gzip (raw ${rawResponseBytes}b)`
      : `${responseBytes}b`;
    console.log(`[api] ${method} ${url} -> ${status} (${durationMs}ms, ${sizeSummary})`);
  });
}

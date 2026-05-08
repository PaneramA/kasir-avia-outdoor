export function attachRequestLogger(req, res, { enabled }) {
  if (!enabled) {
    return;
  }

  const startedAt = Date.now();
  const { method, url } = req;

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const status = res.statusCode;
    console.log(`[api] ${method} ${url} -> ${status} (${durationMs}ms)`);
  });
}

function requirePositiveInteger(name, value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${name} must be at least 1`);
  }
}

export function applyHttpServerLimits(server, env) {
  requirePositiveInteger('SERVER_REQUEST_TIMEOUT_MS', env.serverRequestTimeoutMs);
  requirePositiveInteger('SERVER_HEADERS_TIMEOUT_MS', env.serverHeadersTimeoutMs);
  requirePositiveInteger('SERVER_KEEP_ALIVE_TIMEOUT_MS', env.serverKeepAliveTimeoutMs);
  requirePositiveInteger('SERVER_MAX_REQUESTS_PER_SOCKET', env.serverMaxRequestsPerSocket);

  if (env.serverHeadersTimeoutMs > env.serverRequestTimeoutMs) {
    throw new Error('SERVER_HEADERS_TIMEOUT_MS must not exceed SERVER_REQUEST_TIMEOUT_MS');
  }

  server.requestTimeout = env.serverRequestTimeoutMs;
  server.headersTimeout = env.serverHeadersTimeoutMs;
  server.keepAliveTimeout = env.serverKeepAliveTimeoutMs;
  server.maxRequestsPerSocket = env.serverMaxRequestsPerSocket;
  return server;
}

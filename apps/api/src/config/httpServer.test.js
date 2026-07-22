import { describe, expect, it } from 'vitest';
import { applyHttpServerLimits } from './httpServer.js';

describe('applyHttpServerLimits', () => {
  it('applies bounded request and connection lifetimes', () => {
    const server = {};

    applyHttpServerLimits(server, {
      serverRequestTimeoutMs: 15_000,
      serverHeadersTimeoutMs: 10_000,
      serverKeepAliveTimeoutMs: 5_000,
      serverMaxRequestsPerSocket: 1_000,
    });

    expect(server).toMatchObject({
      requestTimeout: 15_000,
      headersTimeout: 10_000,
      keepAliveTimeout: 5_000,
      maxRequestsPerSocket: 1_000,
    });
  });

  it('rejects headers timeout longer than total request timeout', () => {
    expect(() => applyHttpServerLimits({}, {
      serverRequestTimeoutMs: 5_000,
      serverHeadersTimeoutMs: 6_000,
      serverKeepAliveTimeoutMs: 1_000,
      serverMaxRequestsPerSocket: 10,
    })).toThrow('SERVER_HEADERS_TIMEOUT_MS must not exceed SERVER_REQUEST_TIMEOUT_MS');
  });
});

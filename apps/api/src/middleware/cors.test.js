import { describe, expect, it, vi } from 'vitest';
import { withCors } from './cors.js';

function createResponse() {
  return { setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() };
}

describe('CORS middleware', () => {
  it('answers an allowed preflight request', () => {
    const req = { method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } };
    const res = createResponse();

    expect(withCors(req, res, 'http://localhost:5173,http://localhost:5174')).toBe(true);
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'http://localhost:5173');
    expect(res.writeHead).toHaveBeenCalledWith(204, expect.any(Object));
  });

  it('blocks a disallowed preflight request', () => {
    const req = { method: 'OPTIONS', headers: { origin: 'https://evil.test' } };
    const res = createResponse();

    expect(withCors(req, res, 'https://kasir.test')).toBe(true);
    expect(res.writeHead).toHaveBeenCalledWith(403, expect.any(Object));
    expect(res.end.mock.calls[0][0]).toContain('CORS origin is not allowed');
  });

  it('supports wildcard origins and lets normal requests continue', () => {
    const req = { method: 'GET', headers: { origin: 'https://kasir.test' } };
    const res = createResponse();

    expect(withCors(req, res, '*')).toBe(false);
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
  });

  it('handles server-to-server requests without an Origin header', () => {
    expect(withCors({ method: 'GET', headers: {} }, createResponse(), 'https://kasir.test')).toBe(false);
  });
});

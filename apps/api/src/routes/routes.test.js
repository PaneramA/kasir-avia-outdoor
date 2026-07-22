import { Readable } from 'node:stream';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../data/prisma.js';
import { apiRoute } from './api.js';
import { healthRoute } from './health.js';

function createResponse() {
  return { setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('top-level API routes', () => {
  it('keeps public registration removed', async () => {
    const req = { method: 'POST', url: '/api/auth/register', headers: {} };
    const res = createResponse();
    const handled = await apiRoute(req, res, {});

    expect(handled).toBe(true);
    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    expect(res.end.mock.calls[0][0]).toContain('Route not found');
  });

  it('returns service health without authentication', () => {
    const req = { method: 'GET', url: '/health' };
    const res = createResponse();
    expect(healthRoute(req, res)).toBe(true);
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(JSON.parse(res.end.mock.calls[0][0])).toMatchObject({ ok: true, service: 'avia-api' });
  });

  it('returns 413 when a request body exceeds the configured limit', async () => {
    const req = Readable.from([Buffer.from('123456')]);
    req.method = 'POST';
    req.url = '/api/auth/login';
    req.headers = {};
    req.socket = { remoteAddress: '127.0.0.1' };
    const res = createResponse();

    await apiRoute(req, res, {
      requestBodyLimitBytes: 5,
      requestBodyTimeoutMs: 100,
    });

    expect(res.writeHead).toHaveBeenCalledWith(413, expect.any(Object));
    expect(res.end.mock.calls[0][0]).toContain('Request body too large');
  });
});

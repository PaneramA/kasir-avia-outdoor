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
});

import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { parsePath, readJsonBody, sendJson } from './http.js';

describe('HTTP utilities', () => {
  it('parses paths and query parameters', () => {
    const parsed = parsePath({ url: '/api/customers?q=Fuad%20Test' });
    expect(parsed.pathname).toBe('/api/customers');
    expect(parsed.searchParams.get('q')).toBe('Fuad Test');
  });

  it('reads JSON streams and handles empty bodies', async () => {
    expect(await readJsonBody(Readable.from([]))).toEqual({});
    expect(await readJsonBody(Readable.from([Buffer.from(' {"qty":'), Buffer.from('3} ') ]))).toEqual({ qty: 3 });
  });

  it('rejects malformed JSON', async () => {
    await expect(readJsonBody(Readable.from([Buffer.from('{bad-json}')]))).rejects.toThrow('Invalid JSON body');
  });

  it('writes no-store JSON responses', () => {
    const res = { writeHead: vi.fn(), end: vi.fn() };
    sendJson(res, 201, { ok: true });
    expect(res.writeHead).toHaveBeenCalledWith(201, expect.objectContaining({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    }));
    expect(res.end).toHaveBeenCalledWith('{"ok":true}');
  });

  it('compresses sufficiently large JSON when the caller accepts gzip', () => {
    const res = {
      __aviaAcceptEncoding: 'br, gzip, deflate',
      writeHead: vi.fn(),
      end: vi.fn(),
    };
    sendJson(res, 200, { message: 'x'.repeat(4_000) });
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'Content-Encoding': 'gzip',
      Vary: 'Accept-Encoding',
    }));
    expect(Buffer.isBuffer(res.end.mock.calls[0][0])).toBe(true);
    expect(res.__aviaResponseBytes).toBeLessThan(res.__aviaResponseUncompressedBytes);
  });

  it('does not send a response body for 204 responses', () => {
    const res = { writeHead: vi.fn(), end: vi.fn() };
    sendJson(res, 204, {});
    expect(res.writeHead).toHaveBeenCalledWith(204, { 'Cache-Control': 'no-store' });
    expect(res.end).toHaveBeenCalledWith();
  });
});

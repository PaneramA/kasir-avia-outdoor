import { PassThrough, Readable } from 'node:stream';
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
    await expect(readJsonBody(Readable.from([Buffer.from('{bad-json}')]))).rejects.toMatchObject({
      message: 'Invalid JSON body',
      statusCode: 400,
    });
  });

  it('rejects request bodies larger than the configured byte limit', async () => {
    const stream = new PassThrough();
    const bodyPromise = readJsonBody(stream, {
      limitBytes: 5,
      timeoutMs: 100,
    });
    stream.write('123456');

    await expect(bodyPromise).rejects.toMatchObject({
      message: 'Request body too large',
      statusCode: 413,
    });
    expect(stream.destroyed).toBe(true);
  });

  it('times out body streams that never finish', async () => {
    vi.useFakeTimers();
    const stream = new PassThrough();
    try {
      const bodyPromise = readJsonBody(stream, { limitBytes: 100, timeoutMs: 50 });
      const timeoutAssertion = expect(bodyPromise).rejects.toMatchObject({
        message: 'Request body timeout',
        statusCode: 408,
      });
      await vi.advanceTimersByTimeAsync(51);
      await timeoutAssertion;
      expect(stream.destroyed).toBe(true);
    } finally {
      stream.destroy();
      vi.useRealTimers();
    }
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

  it('leaves JSON compression to the reverse proxy', () => {
    const res = {
      __aviaAcceptEncoding: 'br, gzip, deflate',
      writeHead: vi.fn(),
      end: vi.fn(),
    };
    sendJson(res, 200, { message: 'x'.repeat(4_000) });
    const headers = res.writeHead.mock.calls[0][1];
    expect(headers).not.toHaveProperty('Content-Encoding');
    expect(headers).not.toHaveProperty('Vary');
    expect(typeof res.end.mock.calls[0][0]).toBe('string');
    expect(res.__aviaResponseBytes).toBe(res.__aviaResponseUncompressedBytes);
  });

  it('does not send a response body for 204 responses', () => {
    const res = { writeHead: vi.fn(), end: vi.fn() };
    sendJson(res, 204, {});
    expect(res.writeHead).toHaveBeenCalledWith(204, { 'Cache-Control': 'no-store' });
    expect(res.end).toHaveBeenCalledWith();
  });
});

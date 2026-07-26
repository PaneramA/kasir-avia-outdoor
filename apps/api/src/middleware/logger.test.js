import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { attachRequestLogger } from './logger.js';

describe('request logger', () => {
  it('logs production-safe request metadata without query values', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const req = { method: 'GET', url: '/api/customers?q=secret-phone' };
    const res = Object.assign(new EventEmitter(), {
      statusCode: 200,
      __aviaResponseBytes: 42,
    });

    attachRequestLogger(req, res, { enabled: true });
    res.emit('finish');

    expect(log).toHaveBeenCalledWith(expect.stringContaining('GET /api/customers -> 200'));
    expect(log.mock.calls.flat().join(' ')).not.toContain('secret-phone');
    log.mockRestore();
  });
});

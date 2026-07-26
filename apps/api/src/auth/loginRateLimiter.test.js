import { describe, expect, it } from 'vitest';
import { createLoginRateLimiter, resolveLoginClientIp } from './loginRateLimiter.js';

describe('resolveLoginClientIp', () => {
  it('ignores forwarded headers unless the reverse proxy is trusted', () => {
    const request = {
      headers: { 'x-forwarded-for': '203.0.113.8, 10.0.0.2' },
      socket: { remoteAddress: '127.0.0.1' },
    };

    expect(resolveLoginClientIp(request, { trustProxy: false })).toBe('127.0.0.1');
    expect(resolveLoginClientIp(request, { trustProxy: true })).toBe('203.0.113.8');
  });

  it('ignores forwarded headers from a non-loopback peer even when proxy mode is enabled', () => {
    const request = {
      headers: { 'x-forwarded-for': '198.51.100.22' },
      socket: { remoteAddress: '203.0.113.9' },
    };

    expect(resolveLoginClientIp(request, { trustProxy: true })).toBe('203.0.113.9');
  });

  it('ignores malformed forwarded addresses from the trusted proxy', () => {
    const request = {
      headers: { 'x-forwarded-for': 'spoofed-value' },
      socket: { remoteAddress: '::ffff:127.0.0.1' },
    };

    expect(resolveLoginClientIp(request, { trustProxy: true })).toBe('::ffff:127.0.0.1');
  });

  it('falls back to an unknown identity when no client address is available', () => {
    expect(resolveLoginClientIp({ headers: {} }, { trustProxy: false })).toBe('unknown');
  });
});

describe('createLoginRateLimiter', () => {
  it('blocks after maxAttempts and returns rounded retry seconds', () => {
    let now = 1_000;
    const limiter = createLoginRateLimiter({
      windowMs: 10_000,
      blockMs: 2_001,
      maxAttempts: 3,
      maxBuckets: 10,
      now: () => now,
    });

    expect(limiter.registerFailure('user-1')).toBe(0);
    expect(limiter.registerFailure('user-1')).toBe(0);
    expect(limiter.registerFailure('user-1')).toBe(3);
    expect(limiter.retryAfter('user-1')).toBe(3);

    now += 1_002;
    expect(limiter.retryAfter('user-1')).toBe(1);
  });

  it('does not extend an active block when another failure is registered', () => {
    let now = 0;
    const limiter = createLoginRateLimiter({
      windowMs: 10_000,
      blockMs: 2_000,
      maxAttempts: 1,
      maxBuckets: 10,
      now: () => now,
    });

    expect(limiter.registerFailure('user-1')).toBe(2);
    now = 1_000;
    expect(limiter.registerFailure('user-1')).toBe(1);
    now = 2_000;
    expect(limiter.retryAfter('user-1')).toBe(0);
  });

  it('preserves an active block after the failure window expires', () => {
    let now = 0;
    const limiter = createLoginRateLimiter({
      windowMs: 1_000,
      blockMs: 2_000,
      maxAttempts: 1,
      maxBuckets: 10,
      now: () => now,
    });

    expect(limiter.registerFailure('user-1')).toBe(2);
    now = 1_000;
    expect(limiter.retryAfter('user-1')).toBe(1);
    now = 2_000;
    expect(limiter.retryAfter('user-1')).toBe(0);
  });

  it('resets attempts after block expiry and after the failure window expires', () => {
    let now = 0;
    const limiter = createLoginRateLimiter({
      windowMs: 1_000,
      blockMs: 2_000,
      maxAttempts: 2,
      maxBuckets: 10,
      now: () => now,
    });

    expect(limiter.registerFailure('user-1')).toBe(0);
    expect(limiter.registerFailure('user-1')).toBe(2);
    now = 2_000;
    expect(limiter.retryAfter('user-1')).toBe(0);
    expect(limiter.registerFailure('user-1')).toBe(0);
    now = 3_001;
    expect(limiter.registerFailure('user-1')).toBe(0);
    expect(limiter.registerFailure('user-1')).toBe(2);
  });

  it('clears a key and reports its bucket count', () => {
    const limiter = createLoginRateLimiter({
      windowMs: 10_000,
      blockMs: 10_000,
      maxAttempts: 2,
      maxBuckets: 2,
      now: () => 0,
    });

    limiter.registerFailure('user-1');
    limiter.registerFailure('user-2');
    expect(limiter.size()).toBe(2);
    limiter.clear('user-1');
    expect(limiter.size()).toBe(1);
    expect(limiter.retryAfter('user-1')).toBe(0);
  });

  it('evicts the least recently updated bucket when capacity is full', () => {
    let now = 0;
    const limiter = createLoginRateLimiter({
      windowMs: 10_000,
      blockMs: 10_000,
      maxAttempts: 2,
      maxBuckets: 2,
      now: () => now,
    });

    limiter.registerFailure('oldest');
    now = 1;
    limiter.registerFailure('newer');
    now = 2;
    limiter.registerFailure('newer');
    now = 3;
    limiter.registerFailure('latest');

    expect(limiter.size()).toBe(2);
    expect(limiter.retryAfter('oldest')).toBe(0);
    expect(limiter.retryAfter('newer')).toBe(10);
    expect(limiter.retryAfter('latest')).toBe(0);
  });

  it('does not evict an active block when every bucket is occupied', () => {
    let now = 0;
    const limiter = createLoginRateLimiter({
      windowMs: 10_000,
      blockMs: 10_000,
      maxAttempts: 1,
      maxBuckets: 1,
      now: () => now,
    });

    expect(limiter.registerFailure('blocked-user')).toBe(10);
    now = 1_000;
    expect(limiter.registerFailure('new-user')).toBe(9);
    expect(limiter.retryAfter('blocked-user')).toBe(9);
    expect(limiter.retryAfter('new-user')).toBe(0);
    expect(limiter.size()).toBe(1);
  });

  it('requires numeric options to be at least one', () => {
    for (const option of ['windowMs', 'blockMs', 'maxAttempts', 'maxBuckets']) {
      expect(() => createLoginRateLimiter({
        windowMs: 1,
        blockMs: 1,
        maxAttempts: 1,
        maxBuckets: 1,
        [option]: 0,
      })).toThrow(`${option} must be at least 1`);
    }
  });
});

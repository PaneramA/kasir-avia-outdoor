import { describe, expect, it } from 'vitest';
import { createLoginRateLimiter } from './loginRateLimiter.js';

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

import { describe, expect, it } from 'vitest';
import { createExpiringVerificationStore } from './verificationStore.js';

describe('createExpiringVerificationStore', () => {
  it('consumes valid entries once and rejects expired entries', () => {
    let now = 1_000;
    const store = createExpiringVerificationStore({
      ttlMs: 500,
      maxEntries: 10,
      now: () => now,
    });

    store.mark('first');
    expect(store.consume('first')).toBe(true);
    expect(store.consume('first')).toBe(false);

    store.mark('expired');
    now = 1_501;
    expect(store.consume('expired')).toBe(false);
    expect(store.size()).toBe(0);
  });

  it('keeps memory bounded by evicting the oldest pending verification', () => {
    let now = 0;
    const store = createExpiringVerificationStore({
      ttlMs: 10_000,
      maxEntries: 2,
      now: () => now,
    });

    store.mark('oldest');
    now = 1;
    store.mark('newer');
    now = 2;
    store.mark('latest');

    expect(store.size()).toBe(2);
    expect(store.consume('oldest')).toBe(false);
    expect(store.consume('newer')).toBe(true);
    expect(store.consume('latest')).toBe(true);
  });

  it('validates capacity and expiry options', () => {
    expect(() => createExpiringVerificationStore({ ttlMs: 0, maxEntries: 1 }))
      .toThrow('ttlMs must be at least 1');
    expect(() => createExpiringVerificationStore({ ttlMs: 1, maxEntries: 0 }))
      .toThrow('maxEntries must be at least 1');
  });
});

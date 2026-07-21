import { describe, expect, it } from 'vitest';
import { ADMIN_CACHE_KEYS, ADMIN_SWR_OPTIONS } from './adminCache.js';

describe('admin SWR cache policy', () => {
  it('uses stable, distinct keys', () => {
    expect(ADMIN_CACHE_KEYS.tenants).not.toBe(ADMIN_CACHE_KEYS.plans);
    expect(Object.values(ADMIN_CACHE_KEYS).every(Boolean)).toBe(true);
  });

  it('keeps previous data and deduplicates repeated requests', () => {
    expect(ADMIN_SWR_OPTIONS.keepPreviousData).toBe(true);
    expect(ADMIN_SWR_OPTIONS.dedupingInterval).toBeGreaterThanOrEqual(1_000);
    expect(ADMIN_SWR_OPTIONS.errorRetryCount).toBeLessThanOrEqual(3);
    expect(ADMIN_SWR_OPTIONS.revalidateOnReconnect).toBe(true);
  });
});

import { describe, expect, it } from 'vitest'
import { APP_CACHE_KEYS, APP_SWR_OPTIONS, isInventoryMutationKeyForScope } from './appCache.js'

describe('application SWR cache policy', () => {
  it('scopes operational keys by tenant and branch', () => {
    expect(APP_CACHE_KEYS.items('tenant-a', 'branch-a')).not.toEqual(
      APP_CACHE_KEYS.items('tenant-a', 'branch-b'),
    )
    expect(APP_CACHE_KEYS.rentals('tenant-a', 'branch-a')).not.toEqual(
      APP_CACHE_KEYS.rentals('tenant-b', 'branch-a'),
    )
    expect(APP_CACHE_KEYS.rentalHistory('tenant-a', 'branch-a', { status: 'Active' })).not.toEqual(
      APP_CACHE_KEYS.rentalHistory('tenant-a', 'branch-a', { status: 'Returned' }),
    )
    expect(APP_CACHE_KEYS.financialRecap('tenant-a', 'branch-a', { startDate: '2026-01-01' })).not.toEqual(
      APP_CACHE_KEYS.financialRecap('tenant-a', 'branch-a', { startDate: '2026-02-01' }),
    )
    expect(APP_CACHE_KEYS.inventoryPage('tenant-a', 'branch-a', 'tenda')).not.toEqual(
      APP_CACHE_KEYS.inventoryPage('tenant-a', 'branch-a', 'carrier'),
    )
    expect(APP_CACHE_KEYS.inventoryPage('tenant-a', 'branch-a', '', '', 'active')).not.toEqual(
      APP_CACHE_KEYS.inventoryPage('tenant-a', 'branch-a', '', '', 'archived'),
    )
  })

  it('keeps cached data while revalidating safely', () => {
    expect(APP_SWR_OPTIONS.keepPreviousData).toBe(true)
    expect(APP_SWR_OPTIONS.revalidateOnFocus).toBe(true)
    expect(APP_SWR_OPTIONS.refreshWhenHidden).toBe(false)
    expect(APP_SWR_OPTIONS.errorRetryCount).toBeLessThanOrEqual(3)
  })

  it('matches inventory mutation keys only within the active tenant and branch', () => {
    const matches = (key) => isInventoryMutationKeyForScope(key, 'tenant-a', 'branch-a')

    expect(matches(APP_CACHE_KEYS.items('tenant-a', 'branch-a'))).toBe(true)
    expect(matches(APP_CACHE_KEYS.inventoryPage('tenant-a', 'branch-a'))).toBe(true)
    expect(matches(APP_CACHE_KEYS.dashboard('tenant-a', 'branch-a'))).toBe(true)
    expect(matches(APP_CACHE_KEYS.items('tenant-b', 'branch-a'))).toBe(false)
    expect(matches(APP_CACHE_KEYS.inventoryPage('tenant-a', 'branch-b'))).toBe(false)
    expect(matches(APP_CACHE_KEYS.rentals('tenant-a', 'branch-a'))).toBe(false)
  })
})

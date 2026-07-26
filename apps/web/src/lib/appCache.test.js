import { describe, expect, it } from 'vitest'
import * as appCache from './appCache.js'

const { APP_CACHE_KEYS, APP_SWR_OPTIONS, isInventoryMutationKeyForScope } = appCache

describe('application SWR cache policy', () => {
  it('normalizes the operational identity and business scope', () => {
    expect(appCache.createOperationalScope).toBeTypeOf('function')
    expect(appCache.createOperationalScope(' user-a ', ' tenant-a ', ' branch-a ')).toEqual([
      'user-a',
      'tenant-a',
      'branch-a',
    ])
  })

  it('puts normalized user identity immediately after each operational namespace', () => {
    expect(APP_CACHE_KEYS.items(' user-a ', ' tenant-a ', ' branch-a ')).toEqual([
      'app/items',
      'user-a',
      'tenant-a',
      'branch-a',
    ])
    expect(APP_CACHE_KEYS.inventoryPage(' user-a ', ' tenant-a ', ' branch-a ', ' tenda ', ' cursor ', ' active ')).toEqual([
      'app/inventory-page',
      'user-a',
      'tenant-a',
      'branch-a',
      'tenda',
      'cursor',
      'active',
    ])
  })

  it('isolates every operational resource across users, tenants, and branches', () => {
    const scopedKeyFactories = [
      ['branches', () => APP_CACHE_KEYS.branches('user-a', 'tenant-a')],
      ['items', () => APP_CACHE_KEYS.items('user-a', 'tenant-a', 'branch-a')],
      ['inventory pagination', () => APP_CACHE_KEYS.inventoryPage('user-a', 'tenant-a', 'branch-a')],
      ['categories', () => APP_CACHE_KEYS.categories('user-a', 'tenant-a', 'branch-a')],
      ['rentals', () => APP_CACHE_KEYS.rentals('user-a', 'tenant-a', 'branch-a')],
      ['dashboard', () => APP_CACHE_KEYS.dashboard('user-a', 'tenant-a', 'branch-a')],
      ['financial recap', () => APP_CACHE_KEYS.financialRecap('user-a', 'tenant-a', 'branch-a', {})],
      ['rental history', () => APP_CACHE_KEYS.rentalHistory('user-a', 'tenant-a', 'branch-a', {})],
      ['tenant settings', () => APP_CACHE_KEYS.tenantSettings('user-a', 'tenant-a', 'branch-a')],
      ['branch settings', () => APP_CACHE_KEYS.branchSettings('user-a', 'tenant-a', 'branch-a')],
      ['subscription', () => APP_CACHE_KEYS.subscription('user-a', 'tenant-a', 'branch-a')],
      ['customers', () => APP_CACHE_KEYS.customers('user-a', 'tenant-a', 'branch-a', 'andi')],
      ['tenant users', () => APP_CACHE_KEYS.tenantUsers('user-a', 'tenant-a', 'branch-a')],
      ['memberships', () => APP_CACHE_KEYS.tenantMemberships('user-a', 'tenant-a', 'branch-a')],
      ['branch access', () => APP_CACHE_KEYS.branchAccess('user-a', 'tenant-a', 'branch-a')],
    ]

    scopedKeyFactories.forEach(([, createKey]) => {
      const key = createKey()
      expect(key[1]).toBe('user-a')
      expect(key).not.toEqual(key.map((value, index) => (index === 1 ? 'user-b' : value)))
      expect(key).not.toEqual(key.map((value, index) => (index === 2 ? 'tenant-b' : value)))
      expect(key).not.toEqual(key.map((value, index) => (index === 3 ? 'branch-b' : value)))
    })

    expect(APP_CACHE_KEYS.users).toBeTypeOf('function')
    expect(APP_CACHE_KEYS.users('user-a')).toEqual(['app/users', 'user-a'])
  })

  it('isolates customer searches by normalized query and returns null for incomplete scope', () => {
    expect(APP_CACHE_KEYS.customers('user-a', 'tenant-a', 'branch-a', ' Andi ')).toEqual([
      'app/customers',
      'user-a',
      'tenant-a',
      'branch-a',
      'andi',
    ])
    expect(APP_CACHE_KEYS.customers('user-a', 'tenant-a', 'branch-a', 'andi')).not.toEqual(
      APP_CACHE_KEYS.customers('user-a', 'tenant-a', 'branch-a', 'budi'),
    )
    expect(APP_CACHE_KEYS.items('', 'tenant-a', 'branch-a')).toBeNull()
    expect(APP_CACHE_KEYS.items('user-a', '', 'branch-a')).toBeNull()
    expect(APP_CACHE_KEYS.items('user-a', 'tenant-a', '')).toBeNull()
  })

  it('disables global previous data while retaining safe revalidation defaults', () => {
    expect(APP_SWR_OPTIONS.keepPreviousData).toBe(false)
    expect(APP_SWR_OPTIONS.revalidateOnFocus).toBe(true)
    expect(APP_SWR_OPTIONS.refreshWhenHidden).toBe(false)
    expect(APP_SWR_OPTIONS.errorRetryCount).toBeLessThanOrEqual(3)
  })

  it('matches inventory mutation keys only within the active user tenant and branch', () => {
    const matches = (key) => isInventoryMutationKeyForScope(key, 'user-a', 'tenant-a', 'branch-a')

    expect(matches(APP_CACHE_KEYS.items('user-a', 'tenant-a', 'branch-a'))).toBe(true)
    expect(matches(APP_CACHE_KEYS.inventoryPage('user-a', 'tenant-a', 'branch-a'))).toBe(true)
    expect(matches(APP_CACHE_KEYS.dashboard('user-a', 'tenant-a', 'branch-a'))).toBe(true)
    expect(matches(APP_CACHE_KEYS.items('user-b', 'tenant-a', 'branch-a'))).toBe(false)
    expect(matches(APP_CACHE_KEYS.items('user-a', 'tenant-b', 'branch-a'))).toBe(false)
    expect(matches(APP_CACHE_KEYS.inventoryPage('user-a', 'tenant-a', 'branch-b'))).toBe(false)
    expect(matches(APP_CACHE_KEYS.rentals('user-a', 'tenant-a', 'branch-a'))).toBe(false)
  })
})

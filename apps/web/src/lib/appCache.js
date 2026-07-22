export const APP_CACHE_KEYS = {
  currentUser: 'app/auth/me',
  tenants: 'app/tenants',
  branches: (tenantId = 'current') => ['app/branches', tenantId],
  items: (tenantId, branchId) => ['app/items', tenantId, branchId],
  inventoryPage: (tenantId, branchId, query = '', cursor = '', status = 'active') => [
    'app/inventory-page', tenantId, branchId, query, cursor, status,
  ],
  categories: (tenantId) => ['app/categories', tenantId],
  rentals: (tenantId, branchId) => ['app/rentals', tenantId, branchId],
  dashboard: (tenantId, branchId, recentStatus = '') => ['app/dashboard', tenantId, branchId, recentStatus],
  financialRecap: (tenantId, branchId, filters, cursor = '') => ['app/financial-recap', tenantId, branchId, filters, cursor],
  rentalHistory: (tenantId, branchId, filters, cursor = '') => ['app/rental-history', tenantId, branchId, filters, cursor],
  tenantSettings: (tenantId) => ['app/tenant-settings', tenantId],
  branchSettings: (tenantId, branchId) => ['app/branch-settings', tenantId, branchId],
  subscription: (tenantId) => ['app/subscription', tenantId],
  customers: (query = '') => ['app/customers', String(query || '').trim()],
  users: 'app/users',
  tenantUsers: (tenantId = 'current') => ['app/tenant-users', tenantId],
  tenantMemberships: (tenantId = 'current') => ['app/tenant-memberships', tenantId],
  branchAccess: (tenantId = 'current') => ['app/branch-access', tenantId],
}

const INVENTORY_MUTATION_NAMESPACES = new Set([
  'app/items',
  'app/inventory-page',
  'app/dashboard',
])

export function isInventoryMutationKeyForScope(key, tenantId, branchId) {
  return Array.isArray(key)
    && INVENTORY_MUTATION_NAMESPACES.has(key[0])
    && key[1] === tenantId
    && key[2] === branchId
}

export const APP_SWR_OPTIONS = {
  dedupingInterval: 5000,
  errorRetryCount: 2,
  keepPreviousData: true,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  refreshWhenHidden: false,
  refreshWhenOffline: false,
}

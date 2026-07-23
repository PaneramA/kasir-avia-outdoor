const normalizeCacheScopeValue = (value) => String(value ?? '').trim()

export function createOperationalScope(userId, tenantId, branchId = '') {
  return [userId, tenantId, branchId].map(normalizeCacheScopeValue)
}

function createIdentityKey(namespace, userId) {
  const normalizedUserId = normalizeCacheScopeValue(userId)
  return normalizedUserId ? [namespace, normalizedUserId] : null
}

function createTenantKey(namespace, userId, tenantId, branchId = '') {
  const scope = createOperationalScope(userId, tenantId, branchId)
  return scope[0] && scope[1] ? [namespace, ...scope] : null
}

function createBranchKey(namespace, userId, tenantId, branchId, ...parameters) {
  const scope = createOperationalScope(userId, tenantId, branchId)
  return scope.every(Boolean) ? [namespace, ...scope, ...parameters] : null
}

export const APP_CACHE_KEYS = {
  currentUser: 'app/auth/me',
  tenants: (userId) => createIdentityKey('app/tenants', userId),
  branches: (userId, tenantId, branchId = '') => createTenantKey('app/branches', userId, tenantId, branchId),
  items: (userId, tenantId, branchId) => createBranchKey('app/items', userId, tenantId, branchId),
  inventoryPage: (userId, tenantId, branchId, query = '', cursor = '', status = 'active') => createBranchKey(
    'app/inventory-page',
    userId,
    tenantId,
    branchId,
    normalizeCacheScopeValue(query),
    normalizeCacheScopeValue(cursor),
    normalizeCacheScopeValue(status),
  ),
  categories: (userId, tenantId, branchId) => createBranchKey('app/categories', userId, tenantId, branchId),
  rentals: (userId, tenantId, branchId) => createBranchKey('app/rentals', userId, tenantId, branchId),
  dashboard: (userId, tenantId, branchId, recentStatus = '') => createBranchKey(
    'app/dashboard',
    userId,
    tenantId,
    branchId,
    normalizeCacheScopeValue(recentStatus),
  ),
  financialRecap: (userId, tenantId, branchId, filters, cursor = '') => createBranchKey(
    'app/financial-recap',
    userId,
    tenantId,
    branchId,
    filters,
    normalizeCacheScopeValue(cursor),
  ),
  rentalHistory: (userId, tenantId, branchId, filters, cursor = '') => createBranchKey(
    'app/rental-history',
    userId,
    tenantId,
    branchId,
    filters,
    normalizeCacheScopeValue(cursor),
  ),
  tenantSettings: (userId, tenantId, branchId) => createBranchKey('app/tenant-settings', userId, tenantId, branchId),
  branchSettings: (userId, tenantId, branchId) => createBranchKey('app/branch-settings', userId, tenantId, branchId),
  subscription: (userId, tenantId, branchId) => createBranchKey('app/subscription', userId, tenantId, branchId),
  customers: (userId, tenantId, branchId, query = '') => createBranchKey(
    'app/customers',
    userId,
    tenantId,
    branchId,
    normalizeCacheScopeValue(query).toLowerCase(),
  ),
  users: (userId) => createIdentityKey('app/users', userId),
  tenantUsers: (userId, tenantId, branchId) => createBranchKey('app/tenant-users', userId, tenantId, branchId),
  tenantMemberships: (userId, tenantId, branchId) => createBranchKey('app/tenant-memberships', userId, tenantId, branchId),
  branchAccess: (userId, tenantId, branchId) => createBranchKey('app/branch-access', userId, tenantId, branchId),
}

const INVENTORY_MUTATION_NAMESPACES = new Set([
  'app/items',
  'app/inventory-page',
  'app/dashboard',
])

export function isInventoryMutationKeyForScope(key, userId, tenantId, branchId) {
  const [normalizedUserId, normalizedTenantId, normalizedBranchId] = createOperationalScope(userId, tenantId, branchId)
  return Array.isArray(key)
    && INVENTORY_MUTATION_NAMESPACES.has(key[0])
    && key[1] === normalizedUserId
    && key[2] === normalizedTenantId
    && key[3] === normalizedBranchId
}

export const APP_SWR_OPTIONS = {
  dedupingInterval: 5000,
  errorRetryCount: 2,
  keepPreviousData: false,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  refreshWhenHidden: false,
  refreshWhenOffline: false,
}

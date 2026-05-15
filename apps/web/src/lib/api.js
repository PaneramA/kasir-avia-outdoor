const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const TOKEN_KEY = 'avia_api_token';
const USER_KEY = 'avia_api_user';
const TENANT_CONTEXT_KEY = 'avia_tenant_context_v1';

let accessToken = localStorage.getItem(TOKEN_KEY) || '';
let activeTenantId = '';
let activeBranchId = '';

function readStoredTenantContext() {
  const raw = localStorage.getItem(TENANT_CONTEXT_KEY);
  if (!raw) {
    return { tenantId: '', branchId: '' };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      tenantId: String(parsed?.tenantId || '').trim(),
      branchId: String(parsed?.branchId || '').trim(),
    };
  } catch {
    localStorage.removeItem(TENANT_CONTEXT_KEY);
    return { tenantId: '', branchId: '' };
  }
}

{
  const initialContext = readStoredTenantContext();
  activeTenantId = initialContext.tenantId;
  activeBranchId = initialContext.branchId;
}

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

function normalizeRentalStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  const returnedStatuses = new Set(['returned', 'selesai', 'completed', 'done']);
  return returnedStatuses.has(normalized) ? 'Returned' : 'Active';
}

function normalizeRentalRecord(record) {
  if (!record || typeof record !== 'object') {
    return record;
  }

  return {
    ...record,
    status: normalizeRentalStatus(record.status),
  };
}

function parseStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

function emitAuthExpired() {
  window.dispatchEvent(new CustomEvent('avia-auth-expired'));
}

function setSession(token, user) {
  accessToken = token || '';

  if (accessToken) {
    localStorage.setItem(TOKEN_KEY, accessToken);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }

  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_KEY);
  }
}

function setTenantContext(context = {}) {
  activeTenantId = String(context.tenantId || '').trim();
  activeBranchId = String(context.branchId || '').trim();

  localStorage.setItem(TENANT_CONTEXT_KEY, JSON.stringify({
    tenantId: activeTenantId,
    branchId: activeBranchId,
  }));
}

async function request(path, options = {}, config = { auth: false }) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (config.auth) {
    if (!accessToken) {
      throw new Error('Unauthorized');
    }

    headers.Authorization = `Bearer ${accessToken}`;
  }

  if (activeTenantId) {
    headers['x-tenant-id'] = activeTenantId;
  }

  if (activeBranchId) {
    headers['x-branch-id'] = activeBranchId;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    cache: 'no-store',
    headers,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (response.status === 401 && config.auth) {
      setSession('', null);
      emitAuthExpired();
    }

    const message = payload?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload?.data;
}

export function getStoredSession() {
  return {
    token: accessToken,
    user: parseStoredUser(),
  };
}

export async function login(username, password) {
  const loginData = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

  const normalizedUser = {
    ...loginData.user,
    role: normalizeRole(loginData?.user?.role),
  };

  setSession(loginData.token, normalizedUser);
  return normalizedUser;
}

export function logout() {
  setSession('', null);
}

export function getActiveTenantContext() {
  return {
    tenantId: activeTenantId,
    branchId: activeBranchId,
  };
}

export function setActiveTenantContext(context) {
  setTenantContext(context || {});
}

export function fetchCategories() {
  return request('/api/categories', {}, { auth: true });
}

export function fetchCustomers(query = '') {
  const keyword = String(query || '').trim();
  const suffix = keyword ? `?q=${encodeURIComponent(keyword)}` : '';
  return request(`/api/customers${suffix}`, {}, { auth: true });
}

export function createCustomerRecord(payload) {
  return request('/api/customers', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, { auth: true });
}

export function updateCustomerRecord(customerId, payload) {
  return request(`/api/customers/${encodeURIComponent(customerId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, { auth: true });
}

export function removeCustomerRecord(customerId) {
  return request(`/api/customers/${encodeURIComponent(customerId)}`, {
    method: 'DELETE',
  }, { auth: true });
}

export function createCategory(name) {
  return request('/api/categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
  }, { auth: true });
}

export function removeCategory(name) {
  return request(`/api/categories/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  }, { auth: true });
}

export function fetchItems() {
  return request('/api/items', {}, { auth: true });
}

export function createItem(item) {
  return request('/api/items', {
    method: 'POST',
    body: JSON.stringify(item),
  }, { auth: true });
}

export function updateItem(id, item) {
  return request(`/api/items/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(item),
  }, { auth: true });
}

export function removeItem(id) {
  return request(`/api/items/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }, { auth: true });
}

export function fetchRentals() {
  return request('/api/rentals', {}, { auth: true }).then((rentals) => (
    Array.isArray(rentals) ? rentals.map(normalizeRentalRecord) : []
  ));
}

export function createRental(rental) {
  return request('/api/rentals', {
    method: 'POST',
    body: JSON.stringify(rental),
  }, { auth: true });
}

export function processReturn(payload) {
  return request('/api/returns', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, { auth: true });
}

export function verifyRentalDelete(rentalId, password) {
  return request(`/api/rentals/${encodeURIComponent(rentalId)}/delete-verify`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  }, { auth: true });
}

export function deleteRentalByAdmin(rentalId, payload) {
  return request(`/api/rentals/${encodeURIComponent(rentalId)}`, {
    method: 'DELETE',
    body: JSON.stringify(payload),
  }, { auth: true });
}

export function fetchReturns() {
  return request('/api/returns', {}, { auth: true });
}

export function fetchCurrentUser() {
  return request('/api/auth/me', {}, { auth: true }).then((user) => ({
    ...user,
    role: normalizeRole(user?.role),
  }));
}

export function fetchCurrentTenantSettings() {
  return request('/api/tenants/current/settings', {}, { auth: true });
}

export function fetchTenants() {
  return request('/api/tenants', {}, { auth: true });
}

export function createTenant(payload) {
  return request('/api/tenants', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, { auth: true });
}

export function updateTenant(tenantId, payload) {
  return request(`/api/tenants/${encodeURIComponent(tenantId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, { auth: true });
}

export function fetchBranches(tenantId = 'current') {
  const suffix = `?tenantId=${encodeURIComponent(tenantId)}`;
  return request(`/api/branches${suffix}`, {}, { auth: true });
}

export function createBranch(payload) {
  return request('/api/branches', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, { auth: true });
}

export function updateBranch(branchId, payload) {
  return request(`/api/branches/${encodeURIComponent(branchId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, { auth: true });
}

export function fetchTenantMemberships(tenantId = 'current') {
  const suffix = `?tenantId=${encodeURIComponent(tenantId)}`;
  return request(`/api/tenant-memberships${suffix}`, {}, { auth: true });
}

export function createOrUpdateTenantMembership(payload) {
  return request('/api/tenant-memberships', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, { auth: true });
}

export function updateTenantMembership(membershipId, payload) {
  return request(`/api/tenant-memberships/${encodeURIComponent(membershipId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, { auth: true });
}

export function fetchBranchAccess(tenantId = 'current') {
  const suffix = `?tenantId=${encodeURIComponent(tenantId)}`;
  return request(`/api/branch-access${suffix}`, {}, { auth: true });
}

export function createOrUpdateBranchAccess(payload) {
  return request('/api/branch-access', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, { auth: true });
}

export function removeBranchAccess(accessId) {
  return request(`/api/branch-access/${encodeURIComponent(accessId)}`, {
    method: 'DELETE',
  }, { auth: true });
}

export function updateCurrentTenantSettings(payload) {
  return request('/api/tenants/current/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, { auth: true });
}

export function fetchCurrentBranchSettings() {
  return request('/api/branches/current/settings', {}, { auth: true });
}

export function updateCurrentBranchSettings(payload) {
  return request('/api/branches/current/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, { auth: true });
}

export function fetchUsers() {
  return request('/api/users', {}, { auth: true });
}

export function fetchTenantUsers(tenantId = 'current') {
  const suffix = `?tenantId=${encodeURIComponent(tenantId)}`;
  return request(`/api/users/tenant${suffix}`, {}, { auth: true });
}

export function createTenantUserAccount(payload) {
  return request('/api/users/tenant', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, { auth: true });
}

export function createUserAccount(payload) {
  return request('/api/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, { auth: true });
}

export function updateUserAccount(userId, payload) {
  return request(`/api/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, { auth: true });
}

export function removeUserAccount(userId) {
  return request(`/api/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  }, { auth: true });
}

export function resetUserPassword(userId, newPassword) {
  return request(`/api/users/${encodeURIComponent(userId)}/password`, {
    method: 'PATCH',
    body: JSON.stringify({ newPassword }),
  }, { auth: true });
}

export function changeMyPassword(currentPassword, newPassword) {
  return request('/api/users/me/password', {
    method: 'PATCH',
    body: JSON.stringify({ currentPassword, newPassword }),
  }, { auth: true });
}

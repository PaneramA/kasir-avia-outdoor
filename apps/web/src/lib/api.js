const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const TOKEN_KEY = 'avia_api_token';
const USER_KEY = 'avia_api_user';

let accessToken = localStorage.getItem(TOKEN_KEY) || '';

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

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
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

  setSession(loginData.token, loginData.user);
  return loginData.user;
}

export function logout() {
  setSession('', null);
}

export function fetchCategories() {
  return request('/api/categories');
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
  return request('/api/items');
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
  return request('/api/rentals', {}, { auth: true });
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

export function fetchReturns() {
  return request('/api/returns', {}, { auth: true });
}

export function fetchCurrentUser() {
  return request('/api/auth/me', {}, { auth: true });
}

export function fetchUsers() {
  return request('/api/users', {}, { auth: true });
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

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

function jsonResponse(data, { ok = true, status = 200, message } = {}) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(ok ? { ok: true, data } : { ok: false, message }),
  };
}

async function loadApi() {
  return import('./api.js');
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn());
});

describe('web API client state and requests', () => {
  it('refuses authenticated requests without a stored token', async () => {
    const api = await loadApi();
    await expect(api.fetchItems()).rejects.toThrow('Unauthorized');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stores login sessions and normalizes user roles', async () => {
    fetch.mockResolvedValue(jsonResponse({
      token: 'token-1',
      user: { id: 'user-1', username: 'Admin', role: ' SUPERUSER ' },
    }));
    const api = await loadApi();

    await expect(api.login('Admin', 'secret')).resolves.toMatchObject({ role: 'superuser' });
    expect(api.getStoredSession()).toMatchObject({ token: 'token-1', user: { role: 'superuser' } });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ username: 'Admin', password: 'secret' });
  });

  it('attaches auth and active tenant context headers', async () => {
    localStorage.setItem('avia_api_token', 'token-tenant');
    fetch.mockResolvedValue(jsonResponse([{ id: 'item-1' }]));
    const api = await loadApi();
    api.setActiveTenantContext({ tenantId: 'tenant-1', branchId: 'branch-1' });

    await expect(api.fetchItems()).resolves.toEqual([{ id: 'item-1' }]);
    expect(fetch).toHaveBeenCalledWith('http://localhost:4000/api/items', expect.objectContaining({
      cache: 'no-store',
      headers: expect.objectContaining({
        Authorization: 'Bearer token-tenant',
        'x-tenant-id': 'tenant-1',
        'x-branch-id': 'branch-1',
      }),
    }));
  });

  it('clears the session and emits auth expiry after a 401', async () => {
    localStorage.setItem('avia_api_token', 'expired-token');
    localStorage.setItem('avia_api_user', JSON.stringify({ id: 'user-1' }));
    fetch.mockResolvedValue(jsonResponse(null, { ok: false, status: 401, message: 'Expired' }));
    const expiredListener = vi.fn();
    window.addEventListener('avia-auth-expired', expiredListener);
    const api = await loadApi();

    await expect(api.fetchItems()).rejects.toThrow('Expired');
    expect(api.getStoredSession()).toEqual({ token: '', user: null });
    expect(expiredListener).toHaveBeenCalledOnce();
  });

  it('does not let a stale 401 clear a newer login session', async () => {
    localStorage.setItem('avia_api_token', 'token-a');
    localStorage.setItem('avia_api_user', JSON.stringify({ id: 'user-a' }));
    let resolveOldRequest;
    fetch
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveOldRequest = resolve;
      }))
      .mockResolvedValueOnce(jsonResponse({
        token: 'token-b',
        user: { id: 'user-b', username: 'baru', role: 'kasir' },
      }));
    const expiredListener = vi.fn();
    window.addEventListener('avia-auth-expired', expiredListener);
    const api = await loadApi();

    const oldRequest = api.fetchItems();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await api.login('baru', 'password-baru');
    resolveOldRequest(jsonResponse(null, { ok: false, status: 401, message: 'Expired' }));

    await expect(oldRequest).rejects.toThrow('Expired');
    expect(api.getStoredSession()).toMatchObject({
      token: 'token-b',
      user: { id: 'user-b' },
    });
    expect(expiredListener).not.toHaveBeenCalled();
  });

  it('encodes search parameters', async () => {
    localStorage.setItem('avia_api_token', 'token-1');
    fetch.mockResolvedValue(jsonResponse([]));
    const api = await loadApi();

    await api.fetchCustomers('Fuad & Avia');
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:4000/api/customers?q=Fuad%20%26%20Avia');
  });

  it('requests archived inventory pages and restores an item', async () => {
    localStorage.setItem('avia_api_token', 'token-1');
    fetch
      .mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }))
      .mockResolvedValueOnce(jsonResponse({ id: 'item-1', archivedAt: null }));
    const api = await loadApi();

    await api.fetchItemsPage({ query: 'tenda', status: 'archived', limit: 25 });
    expect(fetch.mock.calls[0][0]).toBe(
      'http://localhost:4000/api/items/page?query=tenda&limit=25&status=archived',
    );

    await expect(api.restoreItem('item-1')).resolves.toMatchObject({ id: 'item-1', archivedAt: null });
    expect(fetch.mock.calls[1]).toEqual([
      'http://localhost:4000/api/items/item-1/restore',
      expect.objectContaining({ method: 'POST' }),
    ]);
  });

  it('normalizes historical returned rental statuses', async () => {
    localStorage.setItem('avia_api_token', 'token-1');
    fetch.mockResolvedValue(jsonResponse([
      { id: 'r1', status: 'completed' },
      { id: 'r2', status: 'active' },
    ]));
    const api = await loadApi();

    await expect(api.fetchRentals()).resolves.toEqual([
      { id: 'r1', status: 'Returned' },
      { id: 'r2', status: 'Active' },
    ]);
  });

  it('removes corrupt stored user and tenant context values', async () => {
    localStorage.setItem('avia_api_user', '{bad}');
    localStorage.setItem('avia_tenant_context_v1', '{bad}');
    const api = await loadApi();

    expect(api.getStoredSession().user).toBeNull();
    expect(api.getActiveTenantContext()).toEqual({ tenantId: '', branchId: '' });
    expect(localStorage.getItem('avia_api_user')).toBeNull();
    expect(localStorage.getItem('avia_tenant_context_v1')).toBeNull();
  });
});

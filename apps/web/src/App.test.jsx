// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';
import {
  fetchBranches,
  fetchCategories,
  fetchCurrentBranchSettings,
  fetchCurrentTenantSettings,
  fetchCurrentTenantSubscriptionSummary,
  fetchCurrentUser,
  fetchDashboardSummary,
  fetchItems,
  fetchPlans,
  fetchRentals,
  fetchTenants,
  getActiveTenantContext,
  getStoredSession,
  setActiveTenantContext,
} from './lib/api.js';

vi.mock('./lib/api.js', () => ({
  changeMyPassword: vi.fn(),
  createBranch: vi.fn(),
  createCategory: vi.fn(),
  createCustomerRecord: vi.fn(),
  createItem: vi.fn(),
  createOrUpdateBranchAccess: vi.fn(),
  createOrUpdateTenantMembership: vi.fn(),
  createPlanDefinition: vi.fn(),
  createRental: vi.fn(),
  createTenantUserAccount: vi.fn(),
  createUserAccount: vi.fn(),
  deleteRentalByAdmin: vi.fn(),
  deleteTenant: vi.fn(),
  fetchBranchAccess: vi.fn(),
  fetchBranches: vi.fn(),
  fetchCategories: vi.fn(),
  fetchCustomers: vi.fn(),
  fetchDashboardSummary: vi.fn(),
  fetchCurrentBranchSettings: vi.fn(),
  fetchCurrentTenantSettings: vi.fn(),
  fetchCurrentTenantSubscriptionSummary: vi.fn(),
  fetchCurrentUser: vi.fn(),
  fetchItems: vi.fn(),
  fetchPlans: vi.fn(),
  fetchRentals: vi.fn(),
  fetchTenantMemberships: vi.fn(),
  fetchTenantUsers: vi.fn(),
  fetchTenants: vi.fn(),
  fetchUsers: vi.fn(),
  getActiveTenantContext: vi.fn(),
  getStoredSession: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  onboardTenant: vi.fn(),
  processReturn: vi.fn(),
  removeBranchAccess: vi.fn(),
  removeCategory: vi.fn(),
  removeCustomerRecord: vi.fn(),
  removeItem: vi.fn(),
  removeUserAccount: vi.fn(),
  resetUserPassword: vi.fn(),
  setActiveTenantContext: vi.fn(),
  updateBranch: vi.fn(),
  updateCustomerRecord: vi.fn(),
  updateCurrentBranchSettings: vi.fn(),
  updateCurrentTenantSettings: vi.fn(),
  updateItem: vi.fn(),
  updatePlanDefinition: vi.fn(),
  updateTenant: vi.fn(),
  updateTenantMembership: vi.fn(),
  updateTenantSubscription: vi.fn(),
  updateUserAccount: vi.fn(),
  verifyRentalDelete: vi.fn(),
}));

function renderApp(path) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </SWRConfig>,
  );
}

beforeEach(() => {
  getActiveTenantContext.mockReturnValue({ tenantId: '', branchId: '' });
  fetchTenants.mockResolvedValue([]);
  fetchBranches.mockResolvedValue([]);
  fetchItems.mockResolvedValue([]);
  fetchCategories.mockResolvedValue([]);
  fetchRentals.mockResolvedValue([]);
  fetchCurrentTenantSettings.mockResolvedValue(null);
  fetchCurrentBranchSettings.mockResolvedValue(null);
  fetchCurrentTenantSubscriptionSummary.mockResolvedValue(null);
  fetchDashboardSummary.mockResolvedValue({ stats: {}, period: {}, recentRentals: [] });
  fetchPlans.mockResolvedValue([]);
});

describe('application state orchestration', () => {
  it('shows store login without loading operational data for an anonymous session', () => {
    getStoredSession.mockReturnValue({ token: '', user: null });
    renderApp('/login');

    expect(screen.getByRole('heading', { name: 'Masuk ke akun' })).toBeInTheDocument();
    expect(fetchItems).not.toHaveBeenCalled();
  });

  it('routes platform administrators into the isolated admin shell', async () => {
    const admin = { id: 'admin-1', username: 'platform', role: 'superuser' };
    getStoredSession.mockReturnValue({ token: 'admin-token', user: admin });
    fetchCurrentUser.mockResolvedValue(admin);
    fetchTenants.mockResolvedValue([]);
    fetchPlans.mockResolvedValue([]);
    renderApp('/admin');

    expect(await screen.findByText('Avia Admin')).toBeInTheDocument();
    expect(await screen.findByText('Ringkasan platform')).toBeInTheDocument();
    await waitFor(() => expect(fetchCurrentUser).toHaveBeenCalledOnce());
    expect(fetchItems).not.toHaveBeenCalled();
  });

  it('keeps an administrator in the cashier app when the URL is not /admin', async () => {
    const admin = { id: 'admin-1', username: 'platform', role: 'admin' };
    getStoredSession.mockReturnValue({ token: 'admin-token', user: admin });
    fetchCurrentUser.mockResolvedValue(admin);
    fetchTenants.mockResolvedValue([{ id: 'tenant-1', name: 'Toko Uji' }]);
    fetchBranches.mockResolvedValue([{ id: 'branch-1', tenantId: 'tenant-1', name: 'Pusat' }]);
    renderApp('/dashboard');

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByText('Avia Admin')).not.toBeInTheDocument();
    await waitFor(() => expect(fetchDashboardSummary).toHaveBeenCalledWith('all'));
    expect(fetchItems).not.toHaveBeenCalled();
  });

  it('does not allow tenant admin accounts into the platform admin panel', async () => {
    const tenantAdmin = { id: 'admin-tenant-1', username: 'tenant-admin', role: 'admin' };
    getStoredSession.mockReturnValue({ token: 'tenant-admin-token', user: tenantAdmin });
    fetchCurrentUser.mockResolvedValue(tenantAdmin);
    renderApp('/admin');

    expect(await screen.findByRole('heading', { name: 'Login administrator' })).toBeInTheDocument();
    expect(screen.getByText(/bukan akun administrator/i)).toBeInTheDocument();
    expect(fetchPlans).not.toHaveBeenCalled();
  });

  it('restores tenant context and loads the dashboard summary without full operational datasets', async () => {
    const owner = { id: 'owner-1', username: 'owner', role: 'kasir' };
    getStoredSession.mockReturnValue({ token: 'owner-token', user: owner });
    fetchCurrentUser.mockResolvedValue(owner);
    fetchTenants.mockResolvedValue([{ id: 'tenant-1', name: 'Toko Uji' }]);
    fetchBranches.mockResolvedValue([{ id: 'branch-1', tenantId: 'tenant-1', name: 'Pusat' }]);
    renderApp('/dashboard');

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchDashboardSummary).toHaveBeenCalledWith('all');
    });
    expect(fetchItems).not.toHaveBeenCalled();
    expect(fetchCategories).not.toHaveBeenCalled();
    expect(fetchRentals).not.toHaveBeenCalled();
    expect(fetchBranches).toHaveBeenCalledWith('tenant-1');
    expect(setActiveTenantContext).toHaveBeenCalledWith({ tenantId: 'tenant-1', branchId: 'branch-1' });
    expect(screen.getAllByDisplayValue('Toko Uji')).toHaveLength(2);
    expect(screen.getAllByDisplayValue('Pusat')).toHaveLength(2);
  });
});

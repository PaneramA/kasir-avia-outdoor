// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  logout,
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

const operationalUser = { id: 'owner-1', username: 'owner', role: 'kasir' };
const tenantOptions = [
  { id: 'tenant-1', name: 'Tenant Satu' },
  { id: 'tenant-2', name: 'Tenant Dua' },
];
const branchOptionsByTenant = {
  'tenant-1': [
    { id: 'branch-1', tenantId: 'tenant-1', name: 'Pusat' },
    { id: 'branch-2', tenantId: 'tenant-1', name: 'Cabang' },
  ],
  'tenant-2': [
    { id: 'branch-3', tenantId: 'tenant-2', name: 'Tenant Dua Pusat' },
  ],
};

function mockOperationalSession() {
  getStoredSession.mockReturnValue({ token: 'owner-token', user: operationalUser });
  getActiveTenantContext.mockReturnValue({ tenantId: 'tenant-1', branchId: 'branch-1' });
  fetchCurrentUser.mockResolvedValue(operationalUser);
  fetchTenants.mockResolvedValue(tenantOptions);
  fetchBranches.mockImplementation(async (tenantId) => branchOptionsByTenant[tenantId] || []);
}

beforeEach(() => {
  window.localStorage.clear();
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
    const admin = { id: 'admin-1', username: 'admin@aviaoutdoor.com', role: 'superuser' };
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

  it('redirects platform administrators away from the cashier shell', async () => {
    const admin = { id: 'admin-1', username: 'admin@aviaoutdoor.com', role: 'superuser' };
    getStoredSession.mockReturnValue({ token: 'admin-token', user: admin });
    fetchCurrentUser.mockResolvedValue(admin);
    fetchPlans.mockResolvedValue([]);
    renderApp('/dashboard');

    expect(await screen.findByText('Avia Admin')).toBeInTheDocument();
    expect(await screen.findByText('Ringkasan platform')).toBeInTheDocument();
    expect(fetchTenants).toHaveBeenCalledWith('admin/tenants');
    expect(fetchBranches).not.toHaveBeenCalled();
    expect(fetchDashboardSummary).not.toHaveBeenCalled();
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

  it('treats legacy non-admin superuser sessions as cashier sessions', async () => {
    const cashier = { id: 'cashier-1', username: 'aviaoutdoor2022', role: 'superuser' };
    getStoredSession.mockReturnValue({ token: 'cashier-token', user: cashier });
    fetchCurrentUser.mockResolvedValue({ ...cashier, role: 'kasir' });
    fetchTenants.mockResolvedValue([{ id: 'tenant-1', name: 'AviaOutdoor' }]);
    fetchBranches.mockResolvedValue([{ id: 'branch-1', tenantId: 'tenant-1', name: 'Pusat' }]);
    renderApp('/dashboard');

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByText('Avia Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument();
    expect(await screen.findByText('kasir')).toBeInTheDocument();
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

  it('ignores stale auth expiry events but clears the matching active session', async () => {
    const owner = { id: 'owner-1', username: 'owner', role: 'kasir' };
    getStoredSession.mockReturnValue({ token: 'token-b', user: owner });
    fetchCurrentUser.mockResolvedValue(owner);
    fetchTenants.mockResolvedValue([{ id: 'tenant-1', name: 'Toko Uji' }]);
    fetchBranches.mockResolvedValue([{ id: 'branch-1', tenantId: 'tenant-1', name: 'Pusat' }]);
    renderApp('/dashboard');

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new CustomEvent('avia-auth-expired', {
        detail: { token: 'token-a' },
      }));
    });
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new CustomEvent('avia-auth-expired', {
        detail: { token: 'token-b' },
      }));
    });
    expect(await screen.findByRole('heading', { name: 'Masuk ke akun' })).toBeInTheDocument();
    expect(logout).toHaveBeenCalledOnce();
  });

  it('clears the rental cart when the active branch changes', async () => {
    mockOperationalSession();
    fetchItems.mockResolvedValue([{
      id: 'item-1',
      name: 'Tenda Dome',
      category: 'Tenda',
      price: 100000,
      stock: 3,
      image: '',
    }]);
    fetchCategories.mockResolvedValue(['Tenda']);

    renderApp('/rental');

    expect(await screen.findByRole('heading', { name: 'Sewa Barang' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Tenda Dome/i }));
    expect(screen.getByText('x1 di keranjang')).toBeInTheDocument();

    fireEvent.change(screen.getAllByDisplayValue('Pusat')[0], {
      target: { value: 'branch-2' },
    });

    await waitFor(() => {
      expect(fetchItems).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByText('x1 di keranjang')).not.toBeInTheDocument();
    expect(screen.getByText('Belum ada barang dipilih.')).toBeInTheDocument();
  });

  it('remounts the return form when the active tenant changes', async () => {
    mockOperationalSession();
    fetchRentals.mockResolvedValue([{
      id: 'RET-1',
      status: 'Active',
      date: '2026-07-01T08:00:00.000Z',
      rentalEndAt: '2026-07-02T08:00:00.000Z',
      duration: 1,
      total: 100000,
      customer: { name: 'Budi', phone: '08123456789' },
      items: [{ id: 'item-1', name: 'Tenda Dome', qty: 1, price: 100000 }],
      payment: { status: 'LUNAS', paidAmount: 100000, totalDue: 100000, remainingAmount: 0 },
    }]);

    renderApp('/return');

    expect(await screen.findByRole('heading', { name: 'Pengembalian' })).toBeInTheDocument();
    fireEvent.click(await screen.findByText('RET-1'));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '25000' } });
    expect(screen.getByDisplayValue('25000')).toBeInTheDocument();

    fireEvent.change(screen.getAllByDisplayValue('Tenant Satu')[0], {
      target: { value: 'tenant-2' },
    });

    await waitFor(() => {
      expect(screen.queryByDisplayValue('25000')).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Pilih transaksi di sebelah kiri/i)).toBeInTheDocument();
  });

  it('loads each operational resource once for the resolved branch after a switch', async () => {
    mockOperationalSession();

    renderApp('/rental');

    expect(await screen.findByRole('heading', { name: 'Sewa Barang' })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchItems).toHaveBeenCalledTimes(1);
      expect(fetchCategories).toHaveBeenCalledTimes(1);
      expect(fetchRentals).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getAllByDisplayValue('Pusat')[0], {
      target: { value: 'branch-2' },
    });

    await waitFor(() => {
      expect(fetchItems).toHaveBeenCalledTimes(2);
      expect(fetchCategories).toHaveBeenCalledTimes(2);
      expect(fetchRentals).toHaveBeenCalledTimes(2);
    });
  });

  it('does not restore an unscoped legacy rental draft after a branch switch', async () => {
    mockOperationalSession();
    fetchItems.mockResolvedValue([{
      id: 'item-1',
      name: 'Tenda Dome',
      category: 'Tenda',
      price: 100000,
      stock: 3,
      image: '',
    }]);
    fetchCategories.mockResolvedValue(['Tenda']);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    window.localStorage.setItem('avia_rental_inventory_view_mode', 'list');

    renderApp('/rental');

    expect(await screen.findByRole('heading', { name: 'Sewa Barang' })).toBeInTheDocument();
    await screen.findByRole('button', { name: /Tenda Dome/i });
    window.localStorage.setItem('avia_rental_draft_v1', JSON.stringify({
      customer: { name: 'Pelanggan Lama', phone: '0811111111' },
      items: [{ id: 'item-1', qty: 1, notes: 'Draft cabang lama' }],
      duration: 1,
      payment: { status: 'LUNAS', method: 'TUNAI', paidAmount: '' },
    }));

    fireEvent.change(screen.getAllByDisplayValue('Pusat')[0], {
      target: { value: 'branch-2' },
    });

    await waitFor(() => {
      expect(fetchItems).toHaveBeenCalledTimes(2);
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('avia_rental_draft_v1')).toBeNull();
    expect(window.localStorage.getItem('avia_rental_inventory_view_mode')).toBe('list');
    expect(screen.queryByDisplayValue('Pelanggan Lama')).not.toBeInTheDocument();
    expect(screen.queryByText('x1 di keranjang')).not.toBeInTheDocument();
  });
});

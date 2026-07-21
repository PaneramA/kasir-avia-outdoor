// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import { describe, expect, it, vi } from 'vitest';
import Account from './Account.jsx';
import AdminAccount from './AdminAccount.jsx';
import AdminLogin from './AdminLogin.jsx';
import AdminPlans from './AdminPlans.jsx';
import AdminRegistrations from './AdminRegistrations.jsx';
import Branches from './Branches.jsx';
import Customers from './Customers.jsx';
import Dashboard from './Dashboard.jsx';
import FinancialRecap from './FinancialRecap.jsx';
import History from './History.jsx';
import Inventory from './Inventory.jsx';
import Rental from './Rental.jsx';
import Return from './Return.jsx';
import TeamSettings from './TeamSettings.jsx';
import Users from './Users.jsx';

vi.mock('../lib/api.js', () => ({
  changeMyPassword: vi.fn().mockResolvedValue({}),
  createBranch: vi.fn().mockResolvedValue({}),
  createCustomerRecord: vi.fn().mockResolvedValue({}),
  createOrUpdateBranchAccess: vi.fn().mockResolvedValue({}),
  createOrUpdateTenantMembership: vi.fn().mockResolvedValue({}),
  createPlanDefinition: vi.fn().mockResolvedValue({}),
  createTenantUserAccount: vi.fn().mockResolvedValue({}),
  createUserAccount: vi.fn().mockResolvedValue({}),
  deleteTenant: vi.fn().mockResolvedValue({}),
  fetchBranchAccess: vi.fn().mockResolvedValue([]),
  fetchBranches: vi.fn().mockResolvedValue([]),
  fetchCurrentTenantSubscriptionSummary: vi.fn().mockResolvedValue({
    plan: { name: 'Basic' }, usage: {}, features: {},
  }),
  fetchCustomers: vi.fn().mockResolvedValue([]),
  fetchDashboardSummary: vi.fn().mockResolvedValue({ stats: {}, period: {}, recentRentals: [] }),
  fetchFinancialRecapPage: vi.fn().mockResolvedValue({ items: [], nextCursor: null, summary: {} }),
  fetchItemsPage: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  fetchRentalHistoryPage: vi.fn().mockResolvedValue({ items: [], nextCursor: null, summary: {} }),
  fetchPlans: vi.fn().mockResolvedValue([]),
  fetchTenantMemberships: vi.fn().mockResolvedValue([]),
  fetchTenants: vi.fn().mockResolvedValue([]),
  fetchTenantUsers: vi.fn().mockResolvedValue([]),
  fetchUsers: vi.fn().mockResolvedValue([]),
  getActiveTenantContext: vi.fn(() => ({ tenantId: 'tenant-1', branchId: 'branch-1' })),
  getStoredSession: vi.fn(() => ({ token: 'test', user: { id: 'admin-1', username: 'admin', role: 'admin' } })),
  onboardTenant: vi.fn().mockResolvedValue({}),
  removeBranchAccess: vi.fn().mockResolvedValue({}),
  removeCustomerRecord: vi.fn().mockResolvedValue({}),
  removeUserAccount: vi.fn().mockResolvedValue({}),
  resetUserPassword: vi.fn().mockResolvedValue({}),
  updateBranch: vi.fn().mockResolvedValue({}),
  updateCustomerRecord: vi.fn().mockResolvedValue({}),
  updatePlanDefinition: vi.fn().mockResolvedValue({}),
  updateTenant: vi.fn().mockResolvedValue({}),
  updateTenantMembership: vi.fn().mockResolvedValue({}),
  updateTenantSubscription: vi.fn().mockResolvedValue({}),
  updateUserAccount: vi.fn().mockResolvedValue({}),
}));

const fn = vi.fn();
const pageCases = [
  ['Account', <Account currentUser={{ username: 'owner', role: 'kasir' }} tenantSettings={null} branchSettings={null} onUpdateTenantSettings={fn} onUpdateBranchSettings={fn} />],
  ['AdminAccount', <AdminAccount currentUser={{ username: 'admin', role: 'admin' }} />],
  ['AdminLogin', <AdminLogin onLogin={fn} isSubmitting={false} errorMessage="" currentUser={null} onClearSession={fn} />],
  ['AdminPlans', <AdminPlans />],
  ['AdminRegistrations', <AdminRegistrations />],
  ['Branches', <Branches />],
  ['Customers', <Customers />],
  ['Dashboard', <Dashboard inventory={[]} rentals={[]} tenantSettings={null} />],
  ['FinancialRecap', <FinancialRecap tenantId="tenant-1" branchId="branch-1" tenantSettings={null} canExportData />],
  ['History', <History rentals={[]} currentUser={{ role: 'admin' }} onVerifyRentalDelete={fn} onDeleteRentalByAdmin={fn} />],
  ['Inventory', <Inventory tenantId="tenant-1" branchId="branch-1" categories={[]} onSaveItem={fn} onImportItems={fn} onDeleteItem={fn} onAddCategory={fn} onDeleteCategory={fn} />],
  ['Rental', <Rental inventory={[]} categories={[]} cart={[]} setCart={fn} onCheckout={fn} currentUser={{ username: 'kasir' }} tenantSettings={null} />],
  ['Return', <Return rentals={[]} onProcessReturn={fn} />],
  ['TeamSettings', <TeamSettings />],
  ['Users', <Users />],
];

function renderPage(page) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MemoryRouter>{page}</MemoryRouter>
    </SWRConfig>,
  );
}

describe('page render smoke tests', () => {
  it.each(pageCases)('%s renders without crashing', async (_name, page) => {
    const { container } = renderPage(page);
    await waitFor(() => expect(container.firstElementChild).toBeTruthy());
  });
});

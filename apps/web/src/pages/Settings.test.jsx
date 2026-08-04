// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { SWRConfig } from 'swr';
import { describe, expect, it, vi } from 'vitest';
import Settings from './Settings.jsx';

vi.mock('../lib/api.js', () => ({
  changeMyPassword: vi.fn().mockResolvedValue({}),
  createBranch: vi.fn().mockResolvedValue({}),
  createOrUpdateBranchAccess: vi.fn().mockResolvedValue({}),
  createOrUpdateTenantMembership: vi.fn().mockResolvedValue({}),
  createTenantUserAccount: vi.fn().mockResolvedValue({}),
  fetchBranchAccess: vi.fn().mockResolvedValue([]),
  fetchBranches: vi.fn().mockResolvedValue([]),
  fetchTenantMemberships: vi.fn().mockResolvedValue([]),
  fetchTenantUsers: vi.fn().mockResolvedValue([]),
  getStoredSession: vi.fn(() => ({
    token: 'token',
    user: { id: 'owner-1', username: 'owner', role: 'kasir' },
  })),
  removeBranchAccess: vi.fn().mockResolvedValue({}),
  updateBranch: vi.fn().mockResolvedValue({}),
  updateTenantMembership: vi.fn().mockResolvedValue({}),
}));

function renderSettings(initialEntry = '/pengaturan') {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Settings
          currentUser={{ id: 'owner-1', username: 'aviaoutdoor2022', role: 'kasir' }}
          tenantSettings={{
            storeName: 'Sewantara',
            dashboardName: 'Sewa',
            addressLines: ['Jl. Toko'],
            phone: '0812',
            rentalDayCountMode: 'ROLLING_24H',
            rentalCutoffHour: 8,
            rentalCutoffMinute: 0,
            financialClosingDay: 31,
          }}
          branchSettings={{ storeName: 'Toko Pusat', addressLines: [], phone: '', legalFooterLines: [] }}
          subscriptionSummary={{
            subscription: { status: 'active', plan: { name: 'Growth', pricePeriod: 'monthly' } },
            tenantStatus: 'active',
            tenantName: 'Sewantara',
            usage: {},
            features: { canManageBranches: true, canManageStaff: true, canUseFinancialRecap: true },
          }}
          isSubscriptionLoading={false}
          subscriptionErrorMessage=""
          onUpdateTenantSettings={vi.fn().mockResolvedValue({})}
          onUpdateBranchSettings={vi.fn().mockResolvedValue({})}
          userId="owner-1"
          tenantId="tenant-1"
          branchId="branch-1"
          onLogout={vi.fn()}
        />
      </MemoryRouter>
    </SWRConfig>,
  );
}

describe('Settings page', () => {
  it('groups cashier settings into Indonesian accordion cards', async () => {
    const user = userEvent.setup();
    renderSettings();

    expect(screen.getByText(/Semua pengaturan toko dikumpulkan di sini/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Profil & Keamanan/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Identitas Toko/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cabang Toko/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tim & Akses/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Identitas Toko/i }));
    expect(screen.getByLabelText(/Nama Dashboard/i)).toBeInTheDocument();
  });

  it('keeps all accordion cards closed by default in a dense full-width grid', () => {
    renderSettings();

    expect(screen.getByRole('button', { name: /Profil & Keamanan/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /Identitas Toko/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText(/Password Lama/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Logout dari Aplikasi/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-card-grid').className).toContain('xl:grid-cols-2');
    expect(screen.getByTestId('settings-card-grid').className).not.toContain('max-w-[980px]');
  });

  it('opens a requested section from the query string', () => {
    renderSettings('/pengaturan?bagian=tim');

    expect(screen.getByRole('button', { name: /Tim & Akses/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: /Buat User Toko/i })).toBeInTheDocument();
  });

  it('uses green hover treatment on closed accordion cards', () => {
    renderSettings();

    const profileButton = screen.getByRole('button', { name: /Profil & Keamanan/i });
    expect(profileButton.className).toContain('hover:bg-accent');
    expect(profileButton.className).toContain('group');

    const profileIcon = screen.getByTestId('settings-card-icon-profil');
    expect(profileIcon.className).toContain('group-hover:bg-white');
    expect(profileIcon.className).toContain('group-hover:text-accent');
  });
});

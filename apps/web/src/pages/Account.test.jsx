// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Account from './Account.jsx';

vi.mock('../lib/api', () => ({
  changeMyPassword: vi.fn().mockResolvedValue({}),
}));

const baseTenantSettings = {
  storeName: 'Sewantara',
  dashboardName: 'Sewa',
  addressLines: [],
  phone: '',
  legalFooterLines: ['Barang sewa wajib dikembalikan sesuai jadwal.'],
  rentalDayCountMode: 'ROLLING_24H',
  rentalCutoffHour: 8,
  rentalCutoffMinute: 0,
  financialClosingDay: 31,
};

function renderAccount(props = {}) {
  return render(
    <Account
      currentUser={{ username: 'aviaoutdoor2022', role: 'kasir' }}
      tenantSettings={baseTenantSettings}
      branchSettings={null}
      subscriptionSummary={null}
      onUpdateTenantSettings={vi.fn().mockResolvedValue({})}
      onUpdateBranchSettings={vi.fn().mockResolvedValue({})}
      {...props}
    />,
  );
}

describe('Account tenant settings', () => {
  it('submits the dashboard name with tenant settings', async () => {
    const user = userEvent.setup();
    const onUpdateTenantSettings = vi.fn().mockResolvedValue({});
    renderAccount({ onUpdateTenantSettings });

    const input = screen.getByLabelText(/nama dashboard/i);
    await user.clear(input);
    await user.type(input, 'KASIR#2026!');
    await user.click(screen.getByRole('button', { name: /simpan pengaturan toko/i }));

    await waitFor(() => expect(onUpdateTenantSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        dashboardName: 'KASIR#2026!',
      }),
    ));
  });

  it('blocks dashboard names longer than 11 characters', async () => {
    const user = userEvent.setup();
    const onUpdateTenantSettings = vi.fn().mockResolvedValue({});
    renderAccount({ onUpdateTenantSettings });

    const input = screen.getByLabelText(/nama dashboard/i);
    fireEvent.change(input, { target: { value: 'SEWANTARA123' } });
    await user.click(screen.getByRole('button', { name: /simpan pengaturan toko/i }));

    expect(await screen.findByText('Nama dashboard maksimal 11 karakter.')).toBeInTheDocument();
    expect(onUpdateTenantSettings).not.toHaveBeenCalled();
  });

  it('submits receipt footer lines and shows WhatsApp plus print previews', async () => {
    const user = userEvent.setup();
    const onUpdateTenantSettings = vi.fn().mockResolvedValue({});
    renderAccount({
      onUpdateTenantSettings,
      hideSectionHeading: true,
      visibleSections: ['receiptPolicy'],
    });

    const previewPanel = screen.getByTestId('receipt-settings-preview');
    expect(previewPanel).toBeInTheDocument();
    expect(within(previewPanel).getByText(/Preview WhatsApp/i)).toBeInTheDocument();
    expect(within(previewPanel).getByTitle(/Preview print struk/i)).toBeInTheDocument();

    const footerInput = screen.getByLabelText(/Footer Legal Struk/i);
    await user.clear(footerInput);
    await user.type(footerInput, 'Cek barang sebelum dibawa{enter}Telat kembali kena biaya');

    expect(within(previewPanel).getByText(/Cek barang sebelum dibawa/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Simpan Pengaturan Struk/i }));

    await waitFor(() => expect(onUpdateTenantSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        legalFooterLines: ['Cek barang sebelum dibawa', 'Telat kembali kena biaya'],
      }),
    ));
  });
});

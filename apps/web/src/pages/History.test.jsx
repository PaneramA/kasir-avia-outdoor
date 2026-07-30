// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import History from './History.jsx';
import { fetchRentalHistoryPage } from '../lib/api';

vi.mock('../lib/api', () => ({
  fetchRentalHistoryPage: vi.fn(),
}));

vi.mock('../lib/receipt', () => ({
  openReceiptWhatsApp: vi.fn(),
  printReceipt: vi.fn(),
}));

const historyRental = {
  id: 'TX-HOLD-001',
  status: 'Active',
  date: '2026-07-30T03:00:00.000Z',
  plannedReturnDate: '2026-07-31T03:00:00.000Z',
  duration: 1,
  total: 55000,
  customer: {
    name: 'Naufal Ramadhani',
    phone: '081234567890',
    guarantee: 'KTP',
    idNumber: '1234567890',
    identityCardHeld: false,
  },
  items: [
    {
      id: 'item-1',
      name: 'Tenda Dome 4p',
      qty: 1,
      price: 55000,
    },
  ],
  payment: {
    status: 'LUNAS',
    method: 'TUNAI',
    paidAmount: 55000,
    remainingAmount: 0,
  },
};

function renderHistory() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <History
        currentUser={{ id: 'user-1', username: 'kasir', role: 'kasir' }}
        tenantId="tenant-1"
        branchId="branch-1"
        onVerifyRentalDelete={vi.fn()}
        onDeleteRentalByAdmin={vi.fn()}
      />
    </SWRConfig>,
  );
}

describe('History identity card status', () => {
  beforeEach(() => {
    fetchRentalHistoryPage.mockReset();
    fetchRentalHistoryPage.mockResolvedValue({
      items: [historyRental],
      nextCursor: null,
      summary: {
        totalTransactions: 1,
        activeTransactions: 1,
        returnedTransactions: 0,
        totalRevenue: 55000,
      },
    });
  });

  it('shows the identity card hold badge in the transaction status area', async () => {
    renderHistory();

    await waitFor(() => expect(fetchRentalHistoryPage).toHaveBeenCalled());

    const statusCell = await screen.findByTestId('history-status-TX-HOLD-001');
    expect(within(statusCell).getByText('Aktif')).toBeInTheDocument();
    expect(within(statusCell).getByText('Kartu tidak ditahan')).toBeInTheDocument();
  });
});

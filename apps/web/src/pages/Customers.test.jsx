// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Customers from './Customers.jsx';

const swr = vi.hoisted(() => ({
  data: [],
}));

vi.mock('swr', () => ({
  default: () => ({
    data: swr.data,
    error: null,
    isLoading: false,
    mutate: vi.fn(),
  }),
}));

vi.mock('../lib/api', () => ({
  createCustomerRecord: vi.fn(),
  fetchCustomers: vi.fn(),
  removeCustomerRecord: vi.fn(),
  updateCustomerRecord: vi.fn(),
}));

const customerRows = [
  {
    id: 'customer-1',
    name: 'Asfiyana Dewi',
    phone: '081112400185',
    address: 'Kalimanggis RT1/1',
    guarantee: 'SIM',
    idNumber: '13250207001113',
    updatedAt: '2026-07-30T05:04:52.000Z',
  },
  {
    id: 'customer-2',
    name: 'Saginah',
    phone: '087899586569',
    address: '',
    guarantee: 'KTP',
    idNumber: '',
    updatedAt: '2026-07-29T06:28:31.000Z',
  },
];

function renderCustomers() {
  return render(
    <Customers
      userId="user-1"
      tenantId="tenant-1"
      branchId="branch-1"
    />,
  );
}

describe('Customers page layout', () => {
  beforeEach(() => {
    swr.data = customerRows;
  });

  it('uses a compact one-line toolbar without a repeated Data Customer title', () => {
    renderCustomers();

    expect(screen.queryByRole('heading', { name: 'Data Customer' })).not.toBeInTheDocument();
    expect(screen.queryByText(/simpan customer lebih awal/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('customer-toolbar')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Cari nama, nomor HP, alamat, atau identitas')).toBeInTheDocument();
    expect(screen.getByText('Total hasil:')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add customer/i })).toBeInTheDocument();
  });

  it('keeps the customer table in an independent scroll region', () => {
    renderCustomers();

    expect(screen.getByTestId('customer-page-shell').className).toContain('lg:overflow-hidden');
    expect(screen.getByTestId('customer-page-shell').className).toContain('lg:h-[calc(100%_-_2.5rem)]');
    expect(screen.getByTestId('customer-page-shell').className).toContain('lg:pb-0');
    expect(screen.getByTestId('customer-table-panel').className).toContain('min-h-0');
    expect(screen.getByTestId('customer-table-panel').className).toContain('flex-1');
    expect(screen.getByTestId('customer-table-scroll').className).toContain('overflow-y-auto');
    expect(screen.getByTestId('customer-table-scroll').className).toContain('overflow-x-auto');
    expect(screen.getByTestId('customer-table-head').className).toContain('sticky');
  });
});

// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Customers from './Customers.jsx';
import { removeCustomerRecord } from '../lib/api';

const swr = vi.hoisted(() => ({
  data: null,
  mutate: vi.fn(),
  useSWR: vi.fn(),
}));

vi.mock('swr', () => ({
  default: (...args) => swr.useSWR(...args),
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

const createCustomerPage = (items = customerRows, pagination = {}) => ({
  items,
  pagination: {
    page: 1,
    pageSize: 50,
    totalItems: 121,
    totalPages: 3,
    ...pagination,
  },
});

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
    vi.clearAllMocks();
    swr.data = createCustomerPage();
    swr.mutate = vi.fn();
    swr.useSWR.mockImplementation(() => ({
      data: swr.data,
      error: null,
      isLoading: false,
      mutate: swr.mutate,
    }));
  });

  it('uses a compact one-line toolbar without a repeated Data Customer title', () => {
    renderCustomers();

    expect(screen.queryByRole('heading', { name: 'Data Customer' })).not.toBeInTheDocument();
    expect(screen.queryByText(/simpan customer lebih awal/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('customer-toolbar')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Cari nama, nomor HP, alamat, atau identitas')).toBeInTheDocument();
    expect(screen.getByText('Total hasil:')).toBeInTheDocument();
    expect(screen.getByText('121')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add customer/i })).toBeInTheDocument();
  });

  it('renders page metadata and enabled navigation from the page contract', () => {
    swr.data = createCustomerPage(customerRows, { page: 2 });
    renderCustomers();

    expect(screen.getByText('Halaman 2 dari 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sebelumnya' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Berikutnya' })).toBeEnabled();
  });

  it('keeps stale rows and page controls available while customer data revalidates', () => {
    swr.data = createCustomerPage(customerRows, { page: 2 });
    swr.useSWR.mockImplementation(() => ({
      data: swr.data,
      error: null,
      isLoading: false,
      isValidating: true,
      mutate: swr.mutate,
    }));

    renderCustomers();

    expect(screen.getAllByText('Asfiyana Dewi')).not.toHaveLength(0);
    expect(screen.getByTestId('customer-revalidation-status')).toHaveTextContent('Memperbarui data customer...');
    expect(screen.getByRole('button', { name: 'Sebelumnya' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Berikutnya' })).toBeEnabled();
    expect(screen.getByTestId('customer-pagination-footer')).toBeInTheDocument();
  });

  it('uses fixed 50-row page requests and changes pages through navigation', () => {
    renderCustomers();

    expect(swr.useSWR).toHaveBeenLastCalledWith(
      ['app/customers', 'user-1', 'tenant-1', 'branch-1', '', 1, 50],
      expect.any(Function),
      { keepPreviousData: true },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Berikutnya' }));

    expect(swr.useSWR).toHaveBeenLastCalledWith(
      ['app/customers', 'user-1', 'tenant-1', 'branch-1', '', 2, 50],
      expect.any(Function),
      { keepPreviousData: true },
    );
  });

  it('resets requested pages to one when a search debounces', () => {
    vi.useFakeTimers();
    renderCustomers();
    fireEvent.click(screen.getByRole('button', { name: 'Berikutnya' }));
    fireEvent.change(screen.getByPlaceholderText('Cari nama, nomor HP, alamat, atau identitas'), {
      target: { value: 'Dewi' },
    });

    act(() => vi.advanceTimersByTime(300));

    expect(swr.useSWR).toHaveBeenLastCalledWith(
      ['app/customers', 'user-1', 'tenant-1', 'branch-1', 'dewi', 1, 50],
      expect.any(Function),
      { keepPreviousData: true },
    );
    vi.useRealTimers();
  });

  it('returns to the previous page after deleting its only customer', async () => {
    const finalPageCustomer = customerRows[0];
    swr.useSWR.mockImplementation((key) => {
      const requestedPage = key?.[5] || 1;
      const isFinalPage = requestedPage === 3;
      return {
        data: createCustomerPage(isFinalPage ? [finalPageCustomer] : customerRows, {
          page: requestedPage,
          totalItems: isFinalPage ? 101 : 121,
          totalPages: 3,
        }),
        error: null,
        isLoading: false,
        mutate: swr.mutate,
      };
    });
    removeCustomerRecord.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderCustomers();
    fireEvent.click(screen.getByRole('button', { name: 'Berikutnya' }));
    fireEvent.click(screen.getByRole('button', { name: 'Berikutnya' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Hapus' })[0]);

    await waitFor(() => expect(removeCustomerRecord).toHaveBeenCalledWith(finalPageCustomer.id));
    expect(swr.mutate).toHaveBeenCalledWith(expect.any(Function), { revalidate: false });
    expect(swr.useSWR).toHaveBeenLastCalledWith(
      ['app/customers', 'user-1', 'tenant-1', 'branch-1', '', 2, 50],
      expect.any(Function),
      { keepPreviousData: true },
    );
  });

  it('keeps the customer table in an independent scroll region with a fixed footer', () => {
    renderCustomers();

    expect(screen.getByTestId('customer-page-shell').className).toContain('lg:overflow-hidden');
    expect(screen.getByTestId('customer-page-shell').className).toContain('lg:h-[calc(100%_-_2.5rem)]');
    expect(screen.getByTestId('customer-page-shell').className).toContain('lg:pb-0');
    expect(screen.getByTestId('customer-table-panel').className).toContain('min-h-0');
    expect(screen.getByTestId('customer-table-panel').className).toContain('flex-1');
    expect(screen.getByTestId('customer-table-scroll').className).toContain('overflow-y-auto');
    expect(screen.getByTestId('customer-table-scroll').className).toContain('overflow-x-auto');
    expect(screen.getByTestId('customer-table-head').className).toContain('sticky');
    expect(screen.getByTestId('customer-pagination-footer').className).not.toContain('overflow-y-auto');
  });
});
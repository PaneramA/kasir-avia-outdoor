// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Return from './Return.jsx';

const activeOverdueRental = {
  id: 'RTR-001',
  status: 'Active',
  date: '2026-07-20T03:00:00.000Z',
  plannedReturnDate: '2026-07-24T03:00:00.000Z',
  duration: 2,
  total: 200000,
  customer: {
    name: 'Ayu Pratiwi',
    phone: '08123456789',
  },
  items: [
    {
      id: 'item-1',
      name: 'Tenda Dome',
      qty: 1,
      price: 100000,
    },
  ],
  payment: {
    status: 'DP',
    paidAmount: 50000,
    totalDue: 200000,
    remainingAmount: 150000,
  },
};

const dueTodayRental = {
  id: 'RTR-002',
  status: 'Active',
  date: '2026-07-25T03:00:00.000Z',
  plannedReturnDate: '2026-07-26T03:00:00.000Z',
  duration: 1,
  total: 75000,
  customer: {
    name: 'Bima Santoso',
    phone: '089912345678',
  },
  items: [
    {
      id: 'item-2',
      name: 'Carrier 60L',
      qty: 1,
      price: 75000,
    },
  ],
  payment: {
    status: 'LUNAS',
    paidAmount: 75000,
    totalDue: 75000,
    remainingAmount: 0,
  },
};

const upcomingRental = {
  id: 'RTR-003',
  status: 'Active',
  date: '2026-07-25T04:00:00.000Z',
  plannedReturnDate: '2026-07-29T03:00:00.000Z',
  duration: 3,
  total: 165000,
  customer: {
    name: 'Citra Lestari',
    phone: '087700001111',
  },
  items: [
    {
      id: 'item-3',
      name: 'Trekking Pole',
      qty: 1,
      price: 55000,
    },
  ],
  payment: {
    status: 'LUNAS',
    paidAmount: 165000,
    totalDue: 165000,
    remainingAmount: 0,
  },
};

const missingItemsRental = {
  id: 'RTR-004',
  status: 'Active',
  date: '2026-07-25T05:00:00.000Z',
  plannedReturnDate: '2026-07-30T03:00:00.000Z',
  duration: 1,
  total: 20000,
  customer: {
    name: 'Dewi Anggraini',
    phone: '081100002222',
  },
  payment: {
    status: 'LUNAS',
    paidAmount: 20000,
    totalDue: 20000,
    remainingAmount: 0,
  },
};

function getClassNames(container) {
  return Array.from(container.querySelectorAll('[class]'))
    .map((element) => element.className)
    .join(' ');
}

describe('Return page theme', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-26T05:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the solid white-green theme instead of the legacy orange return styling', () => {
    const { container } = render(
      <Return rentals={[activeOverdueRental]} onProcessReturn={vi.fn()} />,
    );

    fireEvent.click(screen.getByText('Ayu Pratiwi'));

    const classNames = getClassNames(container);
    expect(classNames).not.toMatch(/#d97706|#ffedd5|#fff3e6|#fff1e5|#c76410|#8f4100|#2ecc71|#27ae60/);
    expect(classNames).not.toContain('shadow-[0_4px_15px');
    expect(classNames).not.toContain('rounded-lg');

    const submitButton = screen.getByRole('button', { name: /selesaikan pengembalian/i });
    expect(submitButton.className).toContain('rounded-md');
    expect(submitButton.className).toContain('bg-accent');
    expect(submitButton.className).toContain('hover:bg-accent-hover');
  });

  it('searches active rentals by customer phone and item name', () => {
    render(
      <Return
        rentals={[activeOverdueRental, dueTodayRental, upcomingRental]}
        onProcessReturn={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Cari customer, nomor HP, ID, atau barang...'), {
      target: { value: 'carrier' },
    });

    expect(screen.getByText('Bima Santoso')).toBeInTheDocument();
    expect(screen.queryByText('Ayu Pratiwi')).not.toBeInTheDocument();
    expect(screen.queryByText('Citra Lestari')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Cari customer, nomor HP, ID, atau barang...'), {
      target: { value: '087700001111' },
    });

    expect(screen.getByText('Citra Lestari')).toBeInTheDocument();
    expect(screen.queryByText('Bima Santoso')).not.toBeInTheDocument();
  });

  it('filters active rentals by due status and unpaid payment state', () => {
    render(
      <Return
        rentals={[activeOverdueRental, dueTodayRental, upcomingRental]}
        onProcessReturn={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/filter status pengembalian/i), {
      target: { value: 'dueToday' },
    });

    expect(screen.getByText('Bima Santoso')).toBeInTheDocument();
    expect(screen.queryByText('Ayu Pratiwi')).not.toBeInTheDocument();
    expect(screen.queryByText('Citra Lestari')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/filter status pengembalian/i), {
      target: { value: 'unpaid' },
    });

    expect(screen.getByText('Ayu Pratiwi')).toBeInTheDocument();
    expect(screen.queryByText('Bima Santoso')).not.toBeInTheDocument();
  });

  it('uses independent desktop scroll regions for the return list and detail panel', () => {
    render(
      <Return
        rentals={[activeOverdueRental, dueTodayRental, upcomingRental]}
        onProcessReturn={vi.fn()}
      />,
    );

    expect(screen.getByTestId('return-page-shell').className).toContain('lg:h-[calc(100vh-8rem)]');
    expect(screen.getByTestId('return-list-panel').className).toContain('min-h-0');
    expect(screen.getByTestId('return-list-scroll').className).toContain('overflow-y-auto');
    expect(screen.getByTestId('return-detail-panel').className).toContain('min-h-0');
    expect(screen.getByTestId('return-detail-scroll').className).toContain('overflow-y-auto');
  });

  it('keeps the return action area anchored inside the detail panel', () => {
    render(<Return rentals={[activeOverdueRental]} onProcessReturn={vi.fn()} />);

    fireEvent.click(screen.getByText('Ayu Pratiwi'));

    const actionArea = screen.getByTestId('return-detail-actions');
    expect(actionArea.className).toContain('border-t');
    expect(actionArea.className).toContain('bg-white');
    expect(screen.getByRole('button', { name: /selesaikan pengembalian/i })).toBeInTheDocument();
  });

  it('orders active rentals by overdue, due today, then upcoming', () => {
    render(
      <Return
        rentals={[upcomingRental, dueTodayRental, activeOverdueRental]}
        onProcessReturn={vi.fn()}
      />,
    );

    const rows = screen.getAllByRole('button').filter((button) => (
      button.textContent.includes('RTR-')
    ));

    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Ayu Pratiwi'),
      expect.stringContaining('Bima Santoso'),
      expect.stringContaining('Citra Lestari'),
    ]);
  });

  it('does not crash when an active rental has no item list', () => {
    render(
      <Return
        rentals={[missingItemsRental]}
        onProcessReturn={vi.fn()}
      />,
    );

    expect(screen.getByText('Dewi Anggraini')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Cari customer, nomor HP, ID, atau barang...'), {
      target: { value: 'Dewi' },
    });
    expect(screen.getByText('Dewi Anggraini')).toBeInTheDocument();
  });

  it('blocks unpaid return processing until settlement is confirmed', () => {
    const onProcessReturn = vi.fn();
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('confirm', vi.fn(() => true));

    render(<Return rentals={[activeOverdueRental]} onProcessReturn={onProcessReturn} />);

    fireEvent.click(screen.getByText('Ayu Pratiwi'));
    fireEvent.click(screen.getByRole('button', { name: /selesaikan pengembalian/i }));

    expect(onProcessReturn).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('masih punya sisa pembayaran'));
    expect(window.confirm).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReturnCalendar from './ReturnCalendar.jsx';

const rental = {
  id: 'rental-1',
  status: 'Active',
  plannedReturnDate: '2026-09-10T12:00:00.000Z',
  customer: { name: 'Bambang', identityCardHeld: false },
  items: [{ name: 'Tenda Dome', qty: 2 }],
  total: 200_000,
  payment: { status: 'BELUM_BAYAR', remainingAmount: 200_000 },
};

describe('ReturnCalendar', () => {
  it('renders view controls and rental events', () => {
    render(<ReturnCalendar rentals={[rental]} onViewChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Bulan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Minggu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hari' })).toBeInTheDocument();
    expect(screen.getByText('Bambang')).toBeInTheDocument();
    expect(screen.getByText(/Kartu tidak ditahan/)).toBeInTheDocument();
  });

  it('notifies the parent when a view is selected', () => {
    const onViewChange = vi.fn();
    render(<ReturnCalendar rentals={[]} onViewChange={onViewChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Minggu' }));
    expect(onViewChange).toHaveBeenCalledWith('timeGridWeek');
  });

  it('shows loading and error states without replacing the calendar shell', () => {
    render(<ReturnCalendar rentals={[]} isLoading error="Gagal memuat jadwal." />);

    expect(screen.getByTestId('return-calendar-shell')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Gagal memuat jadwal.');
    expect(screen.getByLabelText('Memuat kalender')).toBeInTheDocument();
  });
});

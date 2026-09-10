// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RentalInitialPaymentModal from './RentalInitialPaymentModal.jsx';

const rentalSummary = {
  total: 220000,
  customer: { name: 'Budi' },
};

describe('RentalInitialPaymentModal', () => {
  it('submits a QRIS down payment before the receipt is opened', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({});

    render(<RentalInitialPaymentModal isOpen rental={rentalSummary} onClose={vi.fn()} onSubmit={onSubmit} />);

    await user.selectOptions(screen.getByLabelText('Status pembayaran'), 'DP');
    await user.clear(screen.getByLabelText('Nominal pembayaran'));
    await user.type(screen.getByLabelText('Nominal pembayaran'), '50000');
    await user.selectOptions(screen.getByLabelText('Metode pembayaran'), 'QRIS');
    await user.click(screen.getByRole('button', { name: 'Simpan Pembayaran & Buat Sewa' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      status: 'DP',
      amount: 50000,
      method: 'QRIS',
      idempotencyKey: expect.any(String),
    }));
  });

  it('submits pay later without creating a payment row', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({});

    render(<RentalInitialPaymentModal isOpen rental={rentalSummary} onClose={vi.fn()} onSubmit={onSubmit} />);

    await user.selectOptions(screen.getByLabelText('Status pembayaran'), 'BELUM_BAYAR');
    await user.click(screen.getByRole('button', { name: 'Simpan Pembayaran & Buat Sewa' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      status: 'BELUM_BAYAR',
      amount: 0,
      method: 'TUNAI',
    }));
  });

  it('rejects a down payment equal to or above the rental total', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<RentalInitialPaymentModal isOpen rental={rentalSummary} onClose={vi.fn()} onSubmit={onSubmit} />);

    await user.selectOptions(screen.getByLabelText('Status pembayaran'), 'DP');
    await user.clear(screen.getByLabelText('Nominal pembayaran'));
    await user.type(screen.getByLabelText('Nominal pembayaran'), '220000');
    await user.click(screen.getByRole('button', { name: 'Simpan Pembayaran & Buat Sewa' }));

    expect(screen.getByText('Nominal DP harus lebih kecil dari total sewa.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RentalPaymentModal from './RentalPaymentModal.jsx';

const unpaidRental = {
  id: 'rental-1',
  customer: { name: 'Budi' },
  payment: {
    status: 'BELUM_BAYAR',
    paidAmount: 0,
    remainingAmount: 100000,
    totalDue: 100000,
  },
};

describe('RentalPaymentModal', () => {
  it('submits an Indonesian payment payload with the selected method', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({});

    render(<RentalPaymentModal isOpen rental={unpaidRental} onClose={vi.fn()} onSubmit={onSubmit} />);

    expect(screen.getByText('Sisa tagihan')).toBeInTheDocument();
    expect(screen.getByLabelText('Nominal pembayaran')).toHaveValue('100000');
    await user.clear(screen.getByLabelText('Nominal pembayaran'));
    await user.type(screen.getByLabelText('Nominal pembayaran'), '40000');
    await user.selectOptions(screen.getByLabelText('Metode pembayaran'), 'QRIS');
    await user.click(screen.getByRole('button', { name: 'Simpan Pembayaran' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      amount: 40000,
      method: 'QRIS',
      note: '',
      idempotencyKey: expect.any(String),
      paidAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    }));
  });

  it('rejects a payment above the remaining balance before submitting', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<RentalPaymentModal isOpen rental={unpaidRental} onClose={vi.fn()} onSubmit={onSubmit} />);

    const amountInput = screen.getByLabelText('Nominal pembayaran');
    await user.clear(amountInput);
    await user.type(amountInput, '100001');
    await user.click(screen.getByRole('button', { name: 'Simpan Pembayaran' }));

    expect(screen.getByText('Nominal pembayaran melebihi sisa tagihan.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('reuses the idempotency key when a submission can be retried', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn()
      .mockRejectedValueOnce(new Error('Server sedang sibuk.'))
      .mockResolvedValueOnce({});
    const onClose = vi.fn();

    render(<RentalPaymentModal isOpen rental={unpaidRental} onClose={onClose} onSubmit={onSubmit} />);

    const submitButton = screen.getByRole('button', { name: 'Simpan Pembayaran' });
    await user.click(submitButton);
    expect(await screen.findByText('Server sedang sibuk.')).toBeInTheDocument();
    await user.click(submitButton);

    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit.mock.calls[0][0].idempotencyKey).toBe(onSubmit.mock.calls[1][0].idempotencyKey);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not render when closed or without a rental', () => {
    const { rerender } = render(<RentalPaymentModal isOpen={false} rental={unpaidRental} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(<RentalPaymentModal isOpen rental={null} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

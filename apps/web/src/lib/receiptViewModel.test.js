import { describe, expect, it } from 'vitest';
import { buildReceiptViewModel } from './receiptViewModel.js';

const rentalWithCharge = {
  id: 'INV-CHARGE',
  date: '2026-07-01T10:00:00Z',
  duration: 1,
  total: 110_000,
  additionalFee: 999_000,
  customer: { name: 'Fuad', phone: '0812-3456-7890' },
  items: [{ id: 'item-1', name: 'Tenda', qty: 1, price: 110_000 }],
  charges: [
    {
      id: 'charge-1',
      description: 'Keterlambatan 2 hari x Rp 55.000',
      amount: 110_000,
    },
  ],
  returnNotes: 'Tenda dikembalikan lengkap, ada sedikit tanah.',
  payment: {
    status: 'SEBAGIAN',
    method: 'QRIS',
    paidAmount: 50_000,
    remainingAmount: 170_000,
    totalDue: 220_000,
  },
};

describe('buildReceiptViewModel', () => {
  it('prefers ledger charges and derives invoice payment amounts', () => {
    const model = buildReceiptViewModel(rentalWithCharge);

    expect(model).toMatchObject({
      baseSubtotal: 110_000,
      invoiceTotal: 220_000,
      paidAmount: 50_000,
      remainingAmount: 170_000,
      paymentStatus: 'SEBAGIAN',
      paymentMethod: 'QRIS',
    });
    expect(model.chargeRows).toHaveLength(1);
    expect(model.chargeRows[0]).toMatchObject({
      id: 'charge-1',
      label: 'Keterlambatan 2 hari x Rp 55.000',
      amount: 110_000,
    });
    expect(model.returnNotes).toBe('Tenda dikembalikan lengkap, ada sedikit tanah.');
  });

  it('falls back to the legacy additional fee when no ledger charges exist', () => {
    const model = buildReceiptViewModel({
      ...rentalWithCharge,
      total: 100_000,
      additionalFee: 25_000,
      charges: [],
      payment: { status: 'LUNAS', method: 'TUNAI', paidAmount: 125_000 },
    });

    expect(model).toMatchObject({
      baseSubtotal: 100_000,
      invoiceTotal: 125_000,
      paidAmount: 125_000,
      remainingAmount: 0,
    });
    expect(model.chargeRows[0]).toMatchObject({
      id: 'legacy-additional-fee',
      label: 'Denda/biaya tambahan',
      amount: 25_000,
    });
  });
});

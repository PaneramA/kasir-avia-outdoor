// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildReceiptPrintHtml,
  buildReceiptWhatsAppText,
  getReceiptDueDate,
  getReceiptTotal,
  openReceiptWhatsApp,
  resolveReceiptProfile,
  setReceiptProfile,
} from './receipt.js';

const rental = {
  id: 'INV-1',
  date: '2026-07-01T10:00:00Z',
  duration: 2,
  total: 200_000,
  customer: { name: 'Fuad', phone: '0812-3456-7890' },
  items: [{ name: 'Tenda', qty: 2, price: 50_000 }],
  payment: { status: 'LUNAS', method: 'QRIS', paidAmount: 200_000 },
};

const rentalWithCharge = {
  ...rental,
  id: 'INV-CHARGE',
  duration: 1,
  total: 110_000,
  items: [{ id: 'item-1', name: 'Tenda', qty: 1, price: 110_000 }],
  charges: [
    {
      id: 'charge-1',
      description: 'Keterlambatan 2 hari x Rp 55.000',
      amount: 110_000,
    },
  ],
  payment: {
    status: 'SEBAGIAN',
    method: 'QRIS',
    paidAmount: 50_000,
    remainingAmount: 170_000,
    totalDue: 220_000,
  },
};

beforeEach(() => setReceiptProfile(null));

describe('receipt generation', () => {
  it('merges runtime and per-call store profiles', () => {
    setReceiptProfile({ storeName: 'Cabang Runtime', phone: '081' });
    expect(resolveReceiptProfile({ storeName: 'Cabang Pilihan' })).toMatchObject({
      storeName: 'Cabang Pilihan',
      phone: '081',
    });
  });

  it('uses Sewantara as the default receipt brand', () => {
    expect(resolveReceiptProfile()).toMatchObject({
      storeName: 'Sewantara',
    });
  });

  it('uses final totals and derives due dates', () => {
    expect(getReceiptTotal({ total: 10, finalTotal: 12 })).toBe(12);
    expect(getReceiptDueDate(rental).toISOString()).toBe('2026-07-03T10:00:00.000Z');
  });

  it('creates a complete WhatsApp receipt', () => {
    const text = buildReceiptWhatsAppText(rental, { storeName: 'Sewa Test', cashierName: 'Admin' });
    expect(text).toContain('*Sewa Test - Receipt Sewa*');
    expect(text).toContain('Kasir: Admin');
    expect(text).toContain('Tenda x2');
    expect(text).toContain('*TOTAL: Rp 200.000*');
  });

  it('itemizes ledger charges in the WhatsApp receipt totals', () => {
    const text = buildReceiptWhatsAppText(rentalWithCharge);

    expect(text).toContain('Subtotal Sewa: Rp 110.000');
    expect(text).toContain('Keterlambatan 2 hari x Rp 55.000: Rp 110.000');
    expect(text).toContain('*TOTAL: Rp 220.000*');
    expect(text).toContain('Terbayar: Rp 50.000');
    expect(text).toContain('Sisa: Rp 170.000');
    expect(text.indexOf('Subtotal Sewa')).toBeLessThan(text.indexOf('Keterlambatan 2 hari'));
    expect(text.indexOf('Keterlambatan 2 hari')).toBeLessThan(text.indexOf('*TOTAL'));
  });

  it('escapes user-controlled content in printable HTML', () => {
    const html = buildReceiptPrintHtml({
      ...rental,
      customer: { ...rental.customer, name: '<script>alert(1)</script>' },
      items: [{ ...rental.items[0], name: '<b>Tenda</b>' }],
      charges: [{ id: 'charge-escape', description: '<b>Biaya</b>', amount: 10_000 }],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;Tenda&lt;/b&gt;');
    expect(html).toContain('&lt;b&gt;Biaya&lt;/b&gt;');
  });

  it('itemizes ledger charges in printable receipt totals', () => {
    const html = buildReceiptPrintHtml(rentalWithCharge);

    expect(html).toContain('Subtotal Sewa');
    expect(html).toContain('Keterlambatan 2 hari x Rp 55.000');
    expect(html).toContain('TOTAL: Rp 220.000');
    expect(html).toContain('Terbayar: Rp 50.000');
    expect(html).toContain('Sisa: Rp 170.000');
  });

  it('opens WhatsApp with an Indonesian international phone number', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({});
    openReceiptWhatsApp(rental);
    expect(open.mock.calls[0][0]).toMatch(/^https:\/\/wa\.me\/6281234567890\?text=/);
  });
});
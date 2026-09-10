import { describe, expect, it } from 'vitest';
import {
  calculateBillableLateDays,
  calculateRentalDurationFromRange,
  deriveRentalAccounting,
  resolveRentalDayPolicy,
} from './rentalAccounting.js';

describe('deriveRentalAccounting', () => {
  it('derives unpaid, partial, and paid states from immutable rows', () => {
    expect(deriveRentalAccounting({ baseTotal: 100_000, charges: [], payments: [] }))
      .toMatchObject({
        invoiceTotal: 100_000,
        paidAmount: 0,
        remainingAmount: 100_000,
        paymentStatus: 'BELUM_BAYAR',
        latestPaymentMethod: 'TUNAI',
      });

    expect(deriveRentalAccounting({
      baseTotal: 100_000,
      charges: [{ amount: 20_000 }],
      payments: [{ amount: 50_000, method: 'QRIS', paidAt: new Date('2026-09-02') }],
    })).toMatchObject({
      invoiceTotal: 120_000,
      paidAmount: 50_000,
      remainingAmount: 70_000,
      paymentStatus: 'SEBAGIAN',
      latestPaymentMethod: 'QRIS',
    });

    expect(deriveRentalAccounting({
      baseTotal: 100_000,
      charges: [],
      payments: [{ amount: 100_000, method: 'BANK', paidAt: new Date('2026-09-02') }],
    })).toMatchObject({
      remainingAmount: 0,
      paymentStatus: 'LUNAS',
      latestPaymentMethod: 'BANK',
    });
  });

  it('normalizes integer totals and uses the latest payment method by paid date', () => {
    expect(deriveRentalAccounting({
      baseTotal: 100_000.9,
      charges: [
        { amount: 20_000.9 },
        { amount: -10_000 },
        { amount: '15_000' },
      ],
      payments: [
        { amount: 25_000.9, method: 'TUNAI', paidAt: new Date('2026-09-01T03:00:00.000Z') },
        { amount: 50_000.1, method: 'QRIS', paidAt: new Date('2026-09-02T03:00:00.000Z') },
        { amount: 55_000.8, method: 'BANK', paidAt: new Date('2026-09-03T03:00:00.000Z') },
        { amount: -20_000, method: 'TUNAI', paidAt: new Date('2026-09-01T01:00:00.000Z') },
      ],
    })).toMatchObject({
      invoiceTotal: 120_000,
      paidAmount: 130_000,
      remainingAmount: 0,
      paymentStatus: 'LUNAS',
      latestPaymentMethod: 'BANK',
    });
  });
});

describe('resolveRentalDayPolicy', () => {
  it('normalizes stored settings and resolved policy input', () => {
    expect(resolveRentalDayPolicy({
      rentalDayCountMode: ' daily_cutoff ',
      rentalCutoffHour: 25.9,
      rentalCutoffMinute: -4,
    })).toEqual({
      mode: 'DAILY_CUTOFF',
      cutoffHour: 23,
      cutoffMinute: 0,
    });

    expect(resolveRentalDayPolicy({
      rentalDayCountMode: 'weekly',
      rentalCutoffHour: 'bad',
      rentalCutoffMinute: Number.NaN,
    })).toEqual({
      mode: 'ROLLING_24H',
      cutoffHour: 8,
      cutoffMinute: 0,
    });

    expect(resolveRentalDayPolicy({
      mode: 'DAILY_CUTOFF',
      cutoffHour: 7.9,
      cutoffMinute: 15.9,
    })).toEqual({
      mode: 'DAILY_CUTOFF',
      cutoffHour: 7,
      cutoffMinute: 15,
    });
  });
});

describe('calculateRentalDurationFromRange', () => {
  it('calculates rolling and daily-cutoff rental days', () => {
    expect(calculateRentalDurationFromRange(
      new Date('2026-09-01T01:00:00.000Z'),
      new Date('2026-09-02T01:00:00.000Z'),
      { mode: 'ROLLING_24H', cutoffHour: 8, cutoffMinute: 0 },
    )).toBe(1);

    expect(calculateRentalDurationFromRange(
      new Date('2026-09-01T01:00:00.000Z'),
      new Date('2026-09-02T01:00:00.001Z'),
      { mode: 'ROLLING_24H', cutoffHour: 8, cutoffMinute: 0 },
    )).toBe(2);

    expect(calculateRentalDurationFromRange(
      new Date(2026, 8, 1, 9, 0, 0, 0),
      new Date(2026, 8, 2, 7, 59, 59, 999),
      { mode: 'DAILY_CUTOFF', cutoffHour: 8, cutoffMinute: 0 },
    )).toBe(1);

    expect(calculateRentalDurationFromRange(
      new Date(2026, 8, 1, 9, 0, 0, 0),
      new Date(2026, 8, 2, 8, 0, 0, 0),
      { mode: 'DAILY_CUTOFF', cutoffHour: 8, cutoffMinute: 0 },
    )).toBe(2);
  });

  it('rejects invalid or reversed rental ranges', () => {
    expect(() => calculateRentalDurationFromRange(
      new Date('invalid'),
      new Date('2026-09-02T01:00:00.000Z'),
      { mode: 'ROLLING_24H', cutoffHour: 8, cutoffMinute: 0 },
    )).toThrow('rentalStartAt is invalid');

    expect(() => calculateRentalDurationFromRange(
      new Date('2026-09-01T01:00:00.000Z'),
      new Date('invalid'),
      { mode: 'ROLLING_24H', cutoffHour: 8, cutoffMinute: 0 },
    )).toThrow('rentalEndAt is invalid');

    expect(() => calculateRentalDurationFromRange(
      new Date('2026-09-02T01:00:00.000Z'),
      new Date('2026-09-01T01:00:00.000Z'),
      { mode: 'ROLLING_24H', cutoffHour: 8, cutoffMinute: 0 },
    )).toThrow('rentalEndAt must be after rentalStartAt');
  });
});

describe('calculateBillableLateDays', () => {
  it('charges two rolling days after more than 24 hours late', () => {
    expect(calculateBillableLateDays(
      new Date('2026-09-01T01:00:00.000Z'),
      new Date('2026-09-02T02:00:00.000Z'),
      { mode: 'ROLLING_24H', cutoffHour: 8, cutoffMinute: 0 },
    )).toBe(2);
  });

  it('does not charge when return is on time or dates are invalid', () => {
    expect(calculateBillableLateDays(
      new Date('2026-09-01T01:00:00.000Z'),
      new Date('2026-09-01T01:00:00.000Z'),
      { mode: 'ROLLING_24H', cutoffHour: 8, cutoffMinute: 0 },
    )).toBe(0);

    expect(calculateBillableLateDays(
      new Date('invalid'),
      new Date('2026-09-02T02:00:00.000Z'),
      { mode: 'ROLLING_24H', cutoffHour: 8, cutoffMinute: 0 },
    )).toBe(0);

    expect(calculateBillableLateDays(
      new Date('2026-09-01T01:00:00.000Z'),
      new Date('invalid'),
      { mode: 'ROLLING_24H', cutoffHour: 8, cutoffMinute: 0 },
    )).toBe(0);
  });
});

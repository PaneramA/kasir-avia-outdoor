import { describe, expect, it } from 'vitest';
import {
  filterRentalsByTransactionDate,
  formatMonthLabel,
  getFinancialClosingDay,
  getFinancialMonthKeyForDate,
  getFinancialMonthRangeDateKeys,
  getFinancialRecap,
  getMonthRangeDateKeys,
  toJakartaDateKey,
} from './financial.js';

describe('financial calculations', () => {
  it('converts timestamps using the Jakarta timezone', () => {
    expect(toJakartaDateKey('2026-01-31T18:00:00.000Z')).toBe('2026-02-01');
    expect(toJakartaDateKey('invalid')).toBe('');
  });

  it('builds calendar month ranges including leap years', () => {
    expect(getMonthRangeDateKeys('2028-02')).toEqual({ startDate: '2028-02-01', endDate: '2028-02-29' });
    expect(getMonthRangeDateKeys('bad')).toEqual({ startDate: '', endDate: '' });
    expect(formatMonthLabel('2026-07')).toBe('Juli 2026');
  });

  it('clamps financial closing days', () => {
    expect(getFinancialClosingDay(0)).toBe(1);
    expect(getFinancialClosingDay(40)).toBe(31);
    expect(getFinancialClosingDay({ financialClosingDay: 25 })).toBe(25);
  });

  it('builds cross-month financial periods', () => {
    expect(getFinancialMonthRangeDateKeys('2026-02', 25)).toEqual({
      startDate: '2026-01-26',
      endDate: '2026-02-25',
    });
    expect(getFinancialMonthRangeDateKeys('2026-02', 31)).toEqual({
      startDate: '2026-02-01',
      endDate: '2026-02-28',
    });
  });

  it('assigns transactions after closing day to the next financial month', () => {
    expect(getFinancialMonthKeyForDate('2026-01-25T05:00:00Z', 25)).toBe('2026-01');
    expect(getFinancialMonthKeyForDate('2026-01-26T05:00:00Z', 25)).toBe('2026-02');
  });

  it('filters transactions inclusively by Jakarta date', () => {
    const rentals = [
      { id: 'before', date: '2026-06-30T16:59:00Z' },
      { id: 'start', date: '2026-06-30T17:00:00Z' },
      { id: 'end', date: '2026-07-31T16:59:00Z' },
      { id: 'after', date: '2026-07-31T17:00:00Z' },
    ];
    expect(filterRentalsByTransactionDate(rentals, {
      startDate: '2026-07-01',
      endDate: '2026-07-31',
    }).map((rental) => rental.id)).toEqual(['start', 'end']);
  });

  it('summarizes revenue, payment methods, products, and monthly trend', () => {
    const recap = getFinancialRecap([
      {
        id: 'r1', date: '2026-07-10T03:00:00Z', finalTotal: 150_000,
        payment: { method: 'QRIS' },
        items: [{ id: 'tent', name: 'Tenda', qty: 2, price: 50_000 }],
      },
      {
        id: 'r2', date: '2026-07-11T03:00:00Z', total: 50_000,
        payment: { method: 'TUNAI' },
        items: [{ id: 'tent', name: 'Tenda', qty: 1, price: 50_000 }],
      },
    ], { startDate: '2026-07-01', endDate: '2026-07-31', financialClosingDay: 31 });

    expect(recap.totalRevenue).toBe(200_000);
    expect(recap.totalTransactions).toBe(2);
    expect(recap.averageTransaction).toBe(100_000);
    expect(recap.methods.map((entry) => entry.method)).toEqual(['QRIS', 'TUNAI']);
    expect(recap.topItems[0]).toMatchObject({ name: 'Tenda', qty: 3, estimatedRevenue: 150_000 });
    expect(recap.monthlyTrend[0]).toMatchObject({ monthKey: '2026-07', transactions: 2 });
  });
});

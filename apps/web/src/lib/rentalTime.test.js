import { describe, expect, it } from 'vitest';
import {
  calculateRentalDurationDays,
  compareRentalsByClosestReturnDate,
  formatLateDuration,
  getDailyRate,
  getLateDurationMs,
  getPlannedReturnDate,
  resolveRentalDayPolicy,
  toDate,
} from './rentalTime.js';

describe('rental time calculations', () => {
  it('returns null for invalid dates', () => {
    expect(toDate('not-a-date')).toBeNull();
    expect(toDate(new Date('invalid'))).toBeNull();
  });

  it('clamps the daily cutoff configuration', () => {
    expect(resolveRentalDayPolicy({
      rentalDayCountMode: 'daily_cutoff',
      rentalCutoffHour: 99,
      rentalCutoffMinute: -3,
    })).toEqual({ mode: 'DAILY_CUTOFF', cutoffHour: 23, cutoffMinute: 0 });
  });

  it('rounds rolling rental durations up to full days', () => {
    expect(calculateRentalDurationDays('2026-07-01T10:00:00', '2026-07-02T10:00:00')).toBe(1);
    expect(calculateRentalDurationDays('2026-07-01T10:00:00', '2026-07-02T11:00:00')).toBe(2);
    expect(calculateRentalDurationDays('2026-07-02', '2026-07-01')).toBe(0);
  });

  it('uses the configured daily cutoff boundary', () => {
    const policy = { rentalDayCountMode: 'DAILY_CUTOFF', rentalCutoffHour: 8, rentalCutoffMinute: 0 };
    expect(calculateRentalDurationDays('2026-07-01T09:00:00', '2026-07-02T07:00:00', policy)).toBe(1);
    expect(calculateRentalDurationDays('2026-07-01T09:00:00', '2026-07-02T09:00:00', policy)).toBe(2);
  });

  it('prefers explicit planned return dates', () => {
    const explicit = getPlannedReturnDate({
      date: '2026-07-01T10:00:00Z',
      duration: 5,
      plannedReturnDate: '2026-07-03T12:00:00Z',
    });
    expect(explicit.toISOString()).toBe('2026-07-03T12:00:00.000Z');
    expect(getPlannedReturnDate({ date: 'bad', duration: 2 })).toBeNull();
  });

  it('sorts rentals by the closest return timeline', () => {
    const now = new Date('2026-07-10T00:00:00Z');
    const rentals = [
      { id: 'far', plannedReturnDate: '2026-07-20T00:00:00Z' },
      { id: 'close', plannedReturnDate: '2026-07-11T00:00:00Z' },
    ];
    expect(rentals.sort((a, b) => compareRentalsByClosestReturnDate(a, b, now))[0].id).toBe('close');
  });

  it('calculates lateness and readable duration', () => {
    const rental = { plannedReturnDate: '2026-07-08T22:30:00Z' };
    const lateMs = getLateDurationMs(rental, new Date('2026-07-10T00:00:00Z'));
    expect(lateMs).toBe(25.5 * 60 * 60 * 1000);
    expect(formatLateDuration(lateMs)).toBe('1 hari 1 jam 30 menit');
    expect(formatLateDuration(-1)).toBe('0 menit');
  });

  it('derives a safe daily rate', () => {
    expect(getDailyRate({ duration: 3, total: 100_000 })).toBe(33_333);
    expect(getDailyRate({ duration: 0, total: 100_000 })).toBe(0);
  });
});

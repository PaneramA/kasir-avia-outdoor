import { describe, expect, it } from 'vitest';
import {
  filterReturnRentals,
  getReturnDueStatus,
  toReturnCalendarEvent,
  toReturnCalendarEvents,
} from './returnCalendar';

const now = new Date('2026-09-10T04:00:00.000Z');

function rental(overrides = {}) {
  return {
    id: 'rental-1',
    status: 'Active',
    plannedReturnDate: '2026-09-10T12:00:00.000Z',
    customer: { name: 'Bambang', phone: '0812' },
    items: [{ name: 'Tenda Dome', qty: 2 }],
    total: 200_000,
    payment: { status: 'BELUM_BAYAR', remainingAmount: 200_000 },
    ...overrides,
  };
}

describe('return calendar adapter', () => {
  it('classifies due dates using Jakarta date keys', () => {
    expect(getReturnDueStatus(rental({ plannedReturnDate: '2026-09-09T17:00:00.000Z' }), now)).toBe('dueToday');
    expect(getReturnDueStatus(rental({ plannedReturnDate: '2026-09-09T16:59:59.000Z' }), now)).toBe('overdue');
    expect(getReturnDueStatus(rental({ plannedReturnDate: '2026-09-10T17:00:00.000Z' }), now)).toBe('upcoming');
    expect(getReturnDueStatus(rental({ plannedReturnDate: '' }), now)).toBe('unknown');
  });

  it('maps a rental to an event with useful, lightweight metadata', () => {
    const event = toReturnCalendarEvent(rental(), now);
    expect(event).toMatchObject({
      id: 'rental-1',
      title: 'Bambang',
      start: '2026-09-10T12:00:00.000Z',
      allDay: false,
      extendedProps: {
        rentalId: 'rental-1',
        itemCount: 2,
        paymentStatus: 'BELUM_BAYAR',
        remainingAmount: 200_000,
        isUnpaid: true,
        identityCardHeld: true,
        dueStatus: 'dueToday',
      },
    });
    expect(toReturnCalendarEvent(rental({ plannedReturnDate: '' }), now)).toBeNull();
  });

  it('filters active rentals by search and due/payment status', () => {
    const rentals = [
      rental(),
      rental({ id: 'rental-2', customer: { name: 'Siti', phone: '0822' }, plannedReturnDate: '2026-09-15T04:00:00.000Z', payment: { status: 'LUNAS', remainingAmount: 0 } }),
      rental({ id: 'rental-3', status: 'Returned', customer: { name: 'Bambang Lama' } }),
    ];

    expect(filterReturnRentals(rentals, { search: 'siti', now })).toHaveLength(1);
    expect(filterReturnRentals(rentals, { status: 'unpaid', now })).toHaveLength(1);
    expect(filterReturnRentals(rentals, { status: 'upcoming', now })).toHaveLength(1);
    expect(toReturnCalendarEvents(rentals, { now })).toHaveLength(2);
  });
});

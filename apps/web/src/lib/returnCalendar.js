import { toJakartaDateKey, getCurrentJakartaDateKey } from './financial';
import { getPlannedReturnDate, toDate } from './rentalTime';

export const RETURN_DUE_STATUSES = Object.freeze({
  overdue: 'overdue',
  dueToday: 'dueToday',
  upcoming: 'upcoming',
  unknown: 'unknown',
});

function getPaymentInfo(rental) {
  const paidAmount = Number(rental?.payment?.paidAmount || 0) || 0;
  const totalDue = Number(rental?.payment?.totalDue ?? rental?.total ?? 0) || 0;
  const remainingAmount = Number(
    rental?.payment?.remainingAmount ?? Math.max(0, totalDue - paidAmount),
  ) || 0;

  return {
    status: String(rental?.payment?.status || 'LUNAS').toUpperCase(),
    paidAmount,
    totalDue,
    remainingAmount,
    isUnpaid: remainingAmount > 0,
  };
}

export function getReturnDueStatus(rental, now = new Date()) {
  const dueDate = getPlannedReturnDate(rental);
  const dueDateKey = toJakartaDateKey(dueDate);
  if (!dueDateKey) {
    return RETURN_DUE_STATUSES.unknown;
  }

  const todayDateKey = getCurrentJakartaDateKey(now);
  if (dueDateKey < todayDateKey) {
    return RETURN_DUE_STATUSES.overdue;
  }
  if (dueDateKey === todayDateKey) {
    return RETURN_DUE_STATUSES.dueToday;
  }
  return RETURN_DUE_STATUSES.upcoming;
}

export function filterReturnRentals(rentals = [], { search = '', status = 'all', now = new Date() } = {}) {
  const keyword = String(search || '').trim().toLowerCase();
  const normalizedStatus = String(status || 'all').trim();

  return (Array.isArray(rentals) ? rentals : []).filter((rental) => {
    if (String(rental?.status || '').toLowerCase() !== 'active') {
      return false;
    }

    const payment = getPaymentInfo(rental);
    const dueStatus = getReturnDueStatus(rental, now);
    const itemNames = (Array.isArray(rental?.items) ? rental.items : [])
      .map((item) => String(item?.name || '').toLowerCase())
      .join(' ');
    const searchableText = [
      rental?.customer?.name,
      rental?.customer?.phone,
      rental?.id,
      itemNames,
    ].map((value) => String(value || '').toLowerCase()).join(' ');

    return (!keyword || searchableText.includes(keyword))
      && (normalizedStatus === 'all'
        || (normalizedStatus === 'unpaid' && payment.isUnpaid)
        || dueStatus === normalizedStatus);
  });
}

export function toReturnCalendarEvent(rental, now = new Date()) {
  const dueDate = getPlannedReturnDate(rental);
  const dueStatus = getReturnDueStatus(rental, now);
  const payment = getPaymentInfo(rental);
  const items = Array.isArray(rental?.items) ? rental.items : [];

  if (!rental?.id || !toDate(dueDate)) {
    return null;
  }

  const paymentTone = payment.status === 'LUNAS' || payment.remainingAmount <= 0
    ? 'paid'
    : payment.status === 'DP'
      ? 'partial'
      : 'unpaid';

  return {
    id: String(rental.id),
    title: String(rental?.customer?.name || 'Customer tanpa nama'),
    start: dueDate.toISOString(),
    allDay: false,
    classNames: ['return-event--' + dueStatus, 'return-event--payment-' + paymentTone],
    extendedProps: {
      rental,
      rentalId: String(rental.id),
      customerName: String(rental?.customer?.name || 'Customer tanpa nama'),
      itemCount: items.reduce((total, item) => total + (Number(item?.qty) || 0), 0),
      paymentStatus: payment.status,
      remainingAmount: payment.remainingAmount,
      isUnpaid: payment.isUnpaid,
      identityCardHeld: rental?.customer?.identityCardHeld !== false,
      dueStatus,
      dueDate,
    },
  };
}

export function toReturnCalendarEvents(rentals = [], options = {}) {
  return filterReturnRentals(rentals, options)
    .map((rental) => toReturnCalendarEvent(rental, options.now || new Date()))
    .filter(Boolean);
}

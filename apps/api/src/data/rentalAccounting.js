const DAY_MS = 24 * 60 * 60 * 1000;
const RENTAL_DAY_COUNT_MODES = new Set(['ROLLING_24H', 'DAILY_CUTOFF']);
const DEFAULT_RENTAL_DAY_POLICY = {
  mode: 'ROLLING_24H',
  cutoffHour: 8,
  cutoffMinute: 0,
};

function pickPolicyValue(settings, settingsKey, policyKey) {
  if (!settings) {
    return undefined;
  }

  if (Object.prototype.hasOwnProperty.call(settings, settingsKey)) {
    return settings[settingsKey];
  }

  return settings[policyKey];
}

function normalizeRentalDayCountMode(rawMode) {
  const mode = String(rawMode || DEFAULT_RENTAL_DAY_POLICY.mode)
    .trim()
    .toUpperCase();
  return RENTAL_DAY_COUNT_MODES.has(mode)
    ? mode
    : DEFAULT_RENTAL_DAY_POLICY.mode;
}

function normalizeCutoffHour(rawHour) {
  const parsed = Number(rawHour);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_RENTAL_DAY_POLICY.cutoffHour;
  }

  return Math.min(23, Math.max(0, Math.trunc(parsed)));
}

function normalizeCutoffMinute(rawMinute) {
  const parsed = Number(rawMinute);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_RENTAL_DAY_POLICY.cutoffMinute;
  }

  return Math.min(59, Math.max(0, Math.trunc(parsed)));
}

function normalizeAmount(value) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

function toCutoffBucketIndex(targetDate, cutoffHour, cutoffMinute) {
  const boundary = new Date(targetDate);
  boundary.setHours(cutoffHour, cutoffMinute, 0, 0);
  if (targetDate < boundary) {
    boundary.setDate(boundary.getDate() - 1);
  }

  return Math.floor(boundary.getTime() / DAY_MS);
}

export function resolveRentalDayPolicy(settings) {
  return {
    mode: normalizeRentalDayCountMode(pickPolicyValue(settings, 'rentalDayCountMode', 'mode')),
    cutoffHour: normalizeCutoffHour(pickPolicyValue(settings, 'rentalCutoffHour', 'cutoffHour')),
    cutoffMinute: normalizeCutoffMinute(pickPolicyValue(settings, 'rentalCutoffMinute', 'cutoffMinute')),
  };
}

export function calculateRentalDurationFromRange(startDate, endDate, rentalPolicy) {
  if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
    throw new Error('rentalStartAt is invalid');
  }

  if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) {
    throw new Error('rentalEndAt is invalid');
  }

  const diffMs = endDate.getTime() - startDate.getTime();
  if (diffMs <= 0) {
    throw new Error('rentalEndAt must be after rentalStartAt');
  }

  if (rentalPolicy.mode === 'DAILY_CUTOFF') {
    const startBucket = toCutoffBucketIndex(startDate, rentalPolicy.cutoffHour, rentalPolicy.cutoffMinute);
    const endBucket = toCutoffBucketIndex(endDate, rentalPolicy.cutoffHour, rentalPolicy.cutoffMinute);
    return Math.max(1, (endBucket - startBucket) + 1);
  }

  return Math.max(1, Math.ceil(diffMs / DAY_MS));
}

export function calculateBillableLateDays(plannedReturnDate, returnedAt, policyInput) {
  const due = new Date(plannedReturnDate);
  const returned = new Date(returnedAt);
  if (Number.isNaN(due.getTime()) || Number.isNaN(returned.getTime()) || returned <= due) {
    return 0;
  }

  return calculateRentalDurationFromRange(due, returned, resolveRentalDayPolicy(policyInput));
}

export function deriveRentalAccounting({ baseTotal = 0, charges = [], payments = [] } = {}) {
  const invoiceTotal = normalizeAmount(baseTotal)
    + charges.reduce((sum, row) => sum + normalizeAmount(row?.amount), 0);
  const paidAmount = payments.reduce((sum, row) => sum + normalizeAmount(row?.amount), 0);
  const remainingAmount = Math.max(0, invoiceTotal - paidAmount);
  const paymentStatus = remainingAmount === 0
    ? 'LUNAS'
    : paidAmount > 0 ? 'SEBAGIAN' : 'BELUM_BAYAR';
  const latestPayment = [...payments].sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt))[0];

  return {
    invoiceTotal,
    paidAmount,
    remainingAmount,
    paymentStatus,
    latestPaymentMethod: latestPayment?.method || 'TUNAI',
  };
}

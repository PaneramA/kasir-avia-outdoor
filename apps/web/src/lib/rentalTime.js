const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(value) {
  return String(value).padStart(2, '0');
}

export function toDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value || '');
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDateTimeLocalInput(value) {
  const date = toDate(value);
  if (!date) {
    return '';
  }

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function resolveRentalDayPolicy(settings) {
  const modeRaw = String(settings?.rentalDayCountMode || 'ROLLING_24H').trim().toUpperCase();
  const mode = modeRaw === 'DAILY_CUTOFF' ? 'DAILY_CUTOFF' : 'ROLLING_24H';
  const cutoffHour = Number.isFinite(Number(settings?.rentalCutoffHour))
    ? Math.min(23, Math.max(0, Math.trunc(Number(settings.rentalCutoffHour))))
    : 8;
  const cutoffMinute = Number.isFinite(Number(settings?.rentalCutoffMinute))
    ? Math.min(59, Math.max(0, Math.trunc(Number(settings.rentalCutoffMinute))))
    : 0;

  return { mode, cutoffHour, cutoffMinute };
}

function toCutoffBucketIndex(date, cutoffHour, cutoffMinute) {
  const boundary = new Date(date);
  boundary.setHours(cutoffHour, cutoffMinute, 0, 0);
  if (date < boundary) {
    boundary.setDate(boundary.getDate() - 1);
  }

  return Math.floor(boundary.getTime() / DAY_MS);
}

export function calculateRentalDurationDays(startValue, endValue, policyInput) {
  const startDate = toDate(startValue);
  const endDate = toDate(endValue);
  if (!startDate || !endDate) {
    return 0;
  }

  const diffMs = endDate.getTime() - startDate.getTime();
  if (diffMs <= 0) {
    return 0;
  }

  const policy = resolveRentalDayPolicy(policyInput);
  if (policy.mode === 'DAILY_CUTOFF') {
    const startBucket = toCutoffBucketIndex(startDate, policy.cutoffHour, policy.cutoffMinute);
    const endBucket = toCutoffBucketIndex(endDate, policy.cutoffHour, policy.cutoffMinute);
    return Math.max(1, (endBucket - startBucket) + 1);
  }

  return Math.max(1, Math.ceil(diffMs / DAY_MS));
}

export function getPlannedReturnDate(rental) {
  const explicit = toDate(rental?.plannedReturnDate);
  if (explicit) {
    return explicit;
  }

  const startDate = toDate(rental?.date);
  const duration = Number(rental?.duration || 0);
  if (!startDate || !Number.isFinite(duration) || duration < 1) {
    return null;
  }

  return new Date(startDate.getTime() + (Math.trunc(duration) * DAY_MS));
}

export function getRentalReturnTimelineDate(rental) {
  const actualReturnDate = toDate(rental?.returnDate);
  if (actualReturnDate) {
    return actualReturnDate;
  }

  return getPlannedReturnDate(rental);
}

export function compareRentalsByClosestReturnDate(a, b, now = new Date()) {
  const aDate = getRentalReturnTimelineDate(a);
  const bDate = getRentalReturnTimelineDate(b);

  if (!aDate && !bDate) {
    return (toDate(b?.date)?.getTime() || 0) - (toDate(a?.date)?.getTime() || 0);
  }

  if (!aDate) {
    return 1;
  }

  if (!bDate) {
    return -1;
  }

  const distanceDiff = Math.abs(aDate.getTime() - now.getTime()) - Math.abs(bDate.getTime() - now.getTime());
  if (distanceDiff !== 0) {
    return distanceDiff;
  }

  return aDate.getTime() - bDate.getTime();
}

export function getLateDurationMs(rental, now = new Date()) {
  const dueDate = getPlannedReturnDate(rental);
  if (!dueDate) {
    return 0;
  }

  return Math.max(0, now.getTime() - dueDate.getTime());
}

export function formatLateDuration(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / (60 * 1000)));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  const parts = [];
  if (days > 0) {
    parts.push(`${days} hari`);
  }
  if (hours > 0) {
    parts.push(`${hours} jam`);
  }
  parts.push(`${minutes} menit`);

  return parts.join(' ');
}

export function getDailyRate(rental) {
  const duration = Number(rental?.duration || 0);
  const total = Number(rental?.total || 0);
  if (!Number.isFinite(duration) || duration < 1 || !Number.isFinite(total)) {
    return 0;
  }

  return Math.max(0, Math.round(total / duration));
}

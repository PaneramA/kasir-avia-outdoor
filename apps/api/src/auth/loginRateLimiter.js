function validateOption(name, value, requireInteger = false) {
  if (
    !Number.isFinite(value) ||
    value < 1 ||
    (requireInteger && !Number.isInteger(value))
  ) {
    throw new TypeError(`${name} must be at least 1`);
  }
}

function secondsUntil(untilMs, nowMs) {
  return Math.max(0, Math.ceil((untilMs - nowMs) / 1_000));
}

export function resolveLoginClientIp(req, { trustProxy = false } = {}) {
  const forwardedFor = req?.headers?.['x-forwarded-for'];
  if (trustProxy && typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return req?.socket?.remoteAddress || 'unknown';
}

export function createLoginRateLimiter({
  windowMs,
  blockMs,
  maxAttempts,
  maxBuckets,
  now = Date.now,
}) {
  validateOption('windowMs', windowMs);
  validateOption('blockMs', blockMs);
  validateOption('maxAttempts', maxAttempts, true);
  validateOption('maxBuckets', maxBuckets, true);

  const buckets = new Map();

  function removeExpired(nowMs) {
    for (const [key, entry] of buckets) {
      const windowExpired = nowMs >= entry.windowStartedAtMs + windowMs;
      const blockActive = entry.blockedUntilMs > nowMs;
      const blockExpired = entry.blockedUntilMs > 0 && nowMs >= entry.blockedUntilMs;
      if (blockExpired || (windowExpired && !blockActive)) {
        buckets.delete(key);
      }
    }
  }

  function evictOldestUnblocked(nowMs) {
    let oldestKey;
    let oldestUpdatedAtMs = Infinity;

    for (const [key, entry] of buckets) {
      if (entry.blockedUntilMs > nowMs) {
        continue;
      }
      if (entry.updatedAtMs < oldestUpdatedAtMs) {
        oldestKey = key;
        oldestUpdatedAtMs = entry.updatedAtMs;
      }
    }

    if (oldestKey !== undefined) {
      buckets.delete(oldestKey);
      return true;
    }

    return false;
  }

  function getOrCreate(key, nowMs) {
    let entry = buckets.get(key);
    if (entry) {
      return entry;
    }

    if (buckets.size >= maxBuckets && !evictOldestUnblocked(nowMs)) {
      return null;
    }

    entry = {
      attempts: 0,
      windowStartedAtMs: nowMs,
      blockedUntilMs: 0,
      updatedAtMs: nowMs,
    };
    buckets.set(key, entry);
    return entry;
  }

  function retryAfter(key) {
    const nowMs = now();
    removeExpired(nowMs);
    const entry = buckets.get(key);
    if (!entry) {
      return 0;
    }

    entry.updatedAtMs = nowMs;
    return entry.blockedUntilMs > nowMs
      ? secondsUntil(entry.blockedUntilMs, nowMs)
      : 0;
  }

  function registerFailure(key) {
    const nowMs = now();
    removeExpired(nowMs);
    const entry = getOrCreate(key, nowMs);
    if (!entry) {
      let retryAfterSeconds = 0;
      for (const candidate of buckets.values()) {
        retryAfterSeconds = Math.max(
          retryAfterSeconds,
          secondsUntil(candidate.blockedUntilMs, nowMs),
        );
      }
      return retryAfterSeconds;
    }

    if (entry.blockedUntilMs > nowMs) {
      entry.updatedAtMs = nowMs;
      return secondsUntil(entry.blockedUntilMs, nowMs);
    }

    entry.attempts += 1;
    entry.updatedAtMs = nowMs;
    if (entry.attempts >= maxAttempts) {
      entry.blockedUntilMs = nowMs + blockMs;
      return secondsUntil(entry.blockedUntilMs, nowMs);
    }

    return 0;
  }

  function clear(key) {
    buckets.delete(key);
  }

  function size() {
    removeExpired(now());
    return buckets.size;
  }

  return { retryAfter, registerFailure, clear, size };
}

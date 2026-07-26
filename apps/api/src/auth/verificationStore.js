function assertPositiveInteger(name, value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${name} must be at least 1`);
  }
}

export function createExpiringVerificationStore({ ttlMs, maxEntries, now = Date.now }) {
  assertPositiveInteger('ttlMs', ttlMs);
  assertPositiveInteger('maxEntries', maxEntries);

  const entries = new Map();

  function removeExpired(nowMs) {
    for (const [key, entry] of entries) {
      if (entry.expiresAtMs <= nowMs) {
        entries.delete(key);
      }
    }
  }

  function evictOldest() {
    let oldestKey;
    let oldestCreatedAtMs = Infinity;
    for (const [key, entry] of entries) {
      if (entry.createdAtMs < oldestCreatedAtMs) {
        oldestKey = key;
        oldestCreatedAtMs = entry.createdAtMs;
      }
    }
    if (oldestKey !== undefined) {
      entries.delete(oldestKey);
    }
  }

  function mark(key) {
    const nowMs = now();
    removeExpired(nowMs);
    entries.delete(key);
    if (entries.size >= maxEntries) {
      evictOldest();
    }
    entries.set(key, {
      createdAtMs: nowMs,
      expiresAtMs: nowMs + ttlMs,
    });
  }

  function consume(key) {
    const nowMs = now();
    removeExpired(nowMs);
    if (!entries.has(key)) {
      return false;
    }
    entries.delete(key);
    return true;
  }

  function size() {
    removeExpired(now());
    return entries.size;
  }

  return { mark, consume, size };
}

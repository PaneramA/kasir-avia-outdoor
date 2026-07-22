# API Runtime Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound request resource use, reject insecure production configuration, and prevent authentication/compression work from blocking the API event loop.

**Architecture:** Environment parsing produces explicit limits and a production assertion. HTTP parsing enforces bytes and time, password scrypt uses async crypto, response compression moves to the reverse proxy, and login throttling becomes a bounded module with explicit proxy trust.

**Tech Stack:** Node.js 20 HTTP/crypto streams, Zod, Vitest 4, Nginx/PM2 deployment.

## Global Constraints

- Production must fail startup on known default secrets or credentials.
- Development and tests may use explicit development defaults.
- Never log passwords, tokens, or password hashes.
- A single API process may use an in-memory login limiter; multiple replicas require a shared store.
- Oversized requests return `413`; timed-out body reads return `408`.

---

### Task 1: Fail production startup on insecure configuration

**Files:**
- Modify: `apps/api/src/config/env.js`
- Modify: `apps/api/src/config/env.test.js`
- Modify: `apps/api/src/server.js`
- Modify: `apps/api/.env.example`

**Interfaces:**
- Produces: `assertSecureProductionConfig(env): void` and numeric `requestBodyLimitBytes`, `requestBodyTimeoutMs`, `loginRateLimitMaxBuckets`, plus boolean `trustProxy`.

- [ ] **Step 1: Write failing production assertion tests**

```js
expect(() => assertSecureProductionConfig({
  nodeEnv: 'production',
  databaseUrl: 'postgresql://postgres:postgres@localhost:5432/aviaoutdoor',
  corsOrigin: '*', jwtSecret: 'change-me', passwordPepper: 'change-me',
  adminUsername: 'admin@gmail.com', adminPassword: 'adminavo123',
})).toThrow('Insecure production configuration');
```

Also assert a hardened object does not throw.

- [ ] **Step 2: Run config tests and observe missing assertion**

Run: `npx vitest run apps/api/src/config/env.test.js --maxWorkers=1`

Expected: FAIL.

- [ ] **Step 3: Implement strict production validation**

```js
export function assertSecureProductionConfig(env) {
  const warnings = getSecurityWarnings(env);
  if (env.nodeEnv === 'production' && warnings.length > 0) {
    throw new Error(`Insecure production configuration:\n- ${warnings.join('\n- ')}`);
  }
}
```

Parse positive integers with defaults `REQUEST_BODY_LIMIT_BYTES=1048576`, `REQUEST_BODY_TIMEOUT_MS=10000`, `LOGIN_RATE_LIMIT_MAX_BUCKETS=10000`; parse `TRUST_PROXY=false` strictly.

- [ ] **Step 4: Assert before server listen**

In `server.js`, call `assertSecureProductionConfig(env)` before creating/listening on the server. Add all new values to `.env.example` without real secrets.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run apps/api/src/config/env.test.js --maxWorkers=1`

Expected: PASS.

Commit: `fix: reject insecure production configuration`

---

### Task 2: Bound JSON body size and read time

**Files:**
- Modify: `apps/api/src/utils/http.js`
- Modify: `apps/api/src/utils/http.test.js`
- Modify: `apps/api/src/routes/api.js`

**Interfaces:**
- Produces: `readJsonBody(req, { limitBytes, timeoutMs })` and errors with `statusCode` 413/408/400.

- [ ] **Step 1: Write failing limit and timeout tests**

```js
await expect(readJsonBody(Readable.from(['123456']), { limitBytes: 5, timeoutMs: 100 }))
  .rejects.toMatchObject({ statusCode: 413 });
```

Use a `PassThrough` that never ends and fake timers to assert `statusCode: 408`.

- [ ] **Step 2: Run HTTP tests and observe ignored options**

Run: `npx vitest run apps/api/src/utils/http.test.js --maxWorkers=1`

Expected: FAIL.

- [ ] **Step 3: Implement bounded stream reading**

```js
export async function readJsonBody(req, { limitBytes = 1_048_576, timeoutMs = 10_000 } = {}) {
  const chunks = [];
  let size = 0;
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(httpError(408, 'Request body timeout')), timeoutMs);
    });
    const read = (async () => {
      for await (const chunk of req) {
        size += Buffer.byteLength(chunk);
        if (size > limitBytes) throw httpError(413, 'Request body too large');
        chunks.push(Buffer.from(chunk));
      }
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) return {};
      try { return JSON.parse(text); } catch { throw httpError(400, 'Invalid JSON body'); }
    })();
    return await Promise.race([read, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Provide configured parser once per router**

Inside `createApiRouter`, define:

```js
const readBody = (req) => readJsonBody(req, {
  limitBytes: env.requestBodyLimitBytes,
  timeoutMs: env.requestBodyTimeoutMs,
});
```

Replace route calls with `readBody(req)`. In the catch block, send `error.statusCode` when present.

- [ ] **Step 5: Run HTTP/route tests and commit**

Run: `npx vitest run apps/api/src/utils/http.test.js apps/api/src/routes/routes.test.js --maxWorkers=1`

Expected: PASS.

Commit: `fix: bound API request bodies`

---

### Task 3: Remove synchronous CPU work from request paths

**Files:**
- Modify: `apps/api/src/auth/password.js`
- Modify: `apps/api/src/auth/password.test.js`
- Modify: `apps/api/src/utils/http.js`
- Modify: `apps/api/src/utils/http.test.js`
- Modify: `apps/api/src/data/db.js`
- Modify: `README.md`

**Interfaces:**
- Produces: async `hashPassword(password, pepper)` and `verifyPassword(password, encoded, pepper)`.

- [ ] **Step 1: Convert password tests to await and add event-loop progress assertion**

```js
const encoded = await hashPassword('secret', 'pepper');
await expect(verifyPassword('secret', encoded, 'pepper')).resolves.toBe(true);
await expect(verifyPassword('wrong', encoded, 'pepper')).resolves.toBe(false);
```

- [ ] **Step 2: Run password tests before implementation**

Run: `npx vitest run apps/api/src/auth/password.test.js --maxWorkers=1`

Expected: FAIL after requiring Promise behavior.

- [ ] **Step 3: Use async Node scrypt**

```js
import { promisify } from 'node:util';
import { scrypt, timingSafeEqual } from 'node:crypto';

const scryptAsync = promisify(scrypt);
const deriveKey = (value, salt, keyLength) => scryptAsync(value, salt, keyLength);
```

Make hash/verify async, preserve the stored hash format, and await all hash call sites in `db.js` and `prisma/seed.js`.

- [ ] **Step 4: Disable in-process synchronous gzip**

Remove `gzipSync` from `sendJson`; send the JSON buffer with `Content-Length`. Update the compression test to expect no `Content-Encoding`. Document Nginx `gzip on`, `gzip_types application/json`, and `gzip_min_length 1024` as the production compression layer.

- [ ] **Step 5: Run auth/HTTP tests and commit**

Run: `npx vitest run apps/api/src/auth/password.test.js apps/api/src/utils/http.test.js --maxWorkers=1`

Expected: PASS.

Commit: `perf: remove sync crypto compression from API requests`

---

### Task 4: Bound login throttling and make proxy trust explicit

**Files:**
- Create: `apps/api/src/auth/loginRateLimiter.js`
- Create: `apps/api/src/auth/loginRateLimiter.test.js`
- Modify: `apps/api/src/routes/api.js`

**Interfaces:**
- Produces: `createLoginRateLimiter({ windowMs, blockMs, maxAttempts, maxBuckets, now })` with `retryAfter(key)`, `registerFailure(key)`, `clear(key)`, `size()`.

- [ ] **Step 1: Write limiter behavior tests**

Assert blocking after max attempts, expiry cleanup, successful clear, and eviction of the oldest idle bucket when `maxBuckets` is reached.

```js
const limiter = createLoginRateLimiter({ windowMs: 1000, blockMs: 5000, maxAttempts: 2, maxBuckets: 2, now: () => now });
limiter.registerFailure('ip:a');
expect(limiter.registerFailure('ip:a')).toBe(5);
expect(limiter.size()).toBeLessThanOrEqual(2);
```

- [ ] **Step 2: Run limiter tests and observe missing-module failure**

Run: `npx vitest run apps/api/src/auth/loginRateLimiter.test.js --maxWorkers=1`

Expected: FAIL.

- [ ] **Step 3: Implement bounded Map limiter**

Store `{ attempts, windowStartedAtMs, blockedUntilMs, updatedAtMs }`. Sweep expired entries on every 100th operation; when full, delete the entry with the oldest `updatedAtMs` before inserting.

- [ ] **Step 4: Use trusted forwarding only when configured**

```js
function getRequestClientIp(req, env) {
  if (env.trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}
```

Replace route-level Maps with limiter instances. Include a startup log that the limiter is process-local and reject `TRUST_PROXY=true` documentation unless Nginx overwrites forwarded headers.

- [ ] **Step 5: Run route/security tests and commit**

Run: `npx vitest run apps/api/src/auth/loginRateLimiter.test.js apps/api/src/routes/routes.test.js --maxWorkers=1`

Expected: PASS.

Commit: `fix: bound login throttling state`

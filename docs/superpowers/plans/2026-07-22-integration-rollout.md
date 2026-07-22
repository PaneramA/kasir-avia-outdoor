# Production Hardening Integration and Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the independent hardening workstreams, enforce server-side business permissions, and produce a reversible VPS rollout checklist.

**Architecture:** Shared route/data files are integrated serially after each workstream passes focused tests. A schema/access preflight blocks unsafe rollout, then the full suite, build, migration checks, and load/concurrency smoke tests form the release gate.

**Tech Stack:** Node.js 20, Prisma/PostgreSQL, React/Vite/SWR, Vitest, PM2, Docker, Nginx.

## Global Constraints

- Never deploy fail-closed access before the access backfill reports no unresolved cashiers.
- Never edit deployed historical migrations.
- Back up production before schema or access changes.
- Do not deploy when any focused or combined verification gate fails.
- Keep deployment commands non-destructive and include a rollback point.

---

### Task 1: Enforce destructive-action roles and plan features on the API

**Files:**
- Create: `apps/api/src/auth/authorization.js`
- Create: `apps/api/src/auth/authorization.test.js`
- Modify: `apps/api/src/routes/api.js`
- Modify: `apps/api/src/data/db.js`
- Test: `apps/api/src/routes/api.integration.test.js`

**Interfaces:**
- Produces: `assertTenantManager(membershipRole)`, `assertFeatureEnabled(subscription, featureKey)`.

- [ ] **Step 1: Write failing route tests**

As a cashier, attempt item/category/customer deletion and expect `403`. As an owner, expect success. Disable `canUseFinancialRecap` in the tenant plan and call `/api/financial/recap`; expect `403` even though the UI route is hidden.

```js
expect(cashierDelete.status).toBe(403);
expect(ownerDelete.status).toBe(200);
expect(disabledFinancial.status).toBe(403);
```

- [ ] **Step 2: Run route integration tests**

Run: `npx vitest run apps/api/src/routes/api.integration.test.js --maxWorkers=1`

Expected: FAIL because current operational writes require authentication but not manager permission and feature checks are UI-only.

- [ ] **Step 3: Implement pure authorization assertions**

```js
export function assertTenantManager(role) {
  if (!['owner', 'admin'].includes(String(role || '').toLowerCase())) {
    const error = new Error('Tenant manager access is required');
    error.statusCode = 403;
    throw error;
  }
}

export function assertFeatureEnabled(subscription, featureKey) {
  if (subscription?.features?.[featureKey] !== true) {
    const error = new Error('Feature is not available for this subscription');
    error.statusCode = 403;
    throw error;
  }
}
```

- [ ] **Step 4: Resolve request membership once and guard routes**

Extend request context with `membershipRole`. Require tenant manager for item/category/customer destructive actions and team/settings mutations. Resolve subscription features server-side before financial recap/export endpoints.

- [ ] **Step 5: Run authorization tests and commit**

Run: `npx vitest run apps/api/src/auth/authorization.test.js apps/api/src/routes/api.integration.test.js --maxWorkers=1`

Expected: PASS.

Commit: `fix: enforce API business permissions`

---

### Task 2: Add production schema and access preflight

**Files:**
- Create: `apps/api/scripts/production-preflight.mjs`
- Modify: `apps/api/package.json`
- Create: `docs/deployment-production-hardening.md`

**Interfaces:**
- Produces: `npm run db:preflight:production --workspace @avia/api` with nonzero exit on schema/access blockers.

- [ ] **Step 1: Implement read-only schema checks**

Use Prisma `$queryRaw` to verify required tables and `Item.archivedAt`, then call the access planner in dry-run mode. Emit one JSON result:

```js
{
  ok: schema.missing.length === 0 && access.unresolved.length === 0,
  schema,
  access: { assignmentCount: access.assignments.length, unresolved: access.unresolved },
}
```

Exit 1 when `ok` is false; do not mutate data.

- [ ] **Step 2: Register the command**

```json
"db:preflight:production": "node --env-file=.env scripts/production-preflight.mjs"
```

- [ ] **Step 3: Write exact rollout sequence**

Document: database dump, `prisma migrate status`, SQL diff review, migration deploy, Prisma generate, access dry run, access apply, second preflight, application restart, API health check, cashier/admin login checks, archive/restore smoke, and PM2 log review.

Rollback instructions restore the previous application commit while retaining the nullable archival column; data rollback is not required for that additive migration.

- [ ] **Step 4: Execute preflight against integration PostgreSQL and commit**

Run: `npm run db:preflight:production --workspace @avia/api`

Expected: JSON with `ok: true` after migrations/backfill.

Commit: `ops: add production hardening preflight`

---

### Task 3: Run combined regression, concurrency, and load gates

**Files:**
- Modify: `apps/api/scripts/api-load-smoke.mjs`
- Modify: `README.md`
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: all prior hardening tasks.
- Produces: repeatable CI and VPS verification commands.

- [ ] **Step 1: Extend load smoke with bounded scenarios**

Run authenticated parallel reads for dashboard/items/rentals and a controlled set of unique checkout-return cycles. Report p50, p95, error count, and final stock mismatch count. Use unique test prefixes and clean up only those records.

Acceptance values for the single-process VPS smoke:

```js
const thresholds = { errorRate: 0.01, readP95Ms: 1500, stockMismatchCount: 0 };
```

- [ ] **Step 2: Add CI gates in serial-safe order**

CI provisions PostgreSQL, sets non-default test secrets, then runs:

```text
npm ci
npm run prisma:generate --workspace @avia/api
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
npx vitest run --maxWorkers=1
npm run lint
npm run build
npm audit --omit=dev
```

The audit command initially reports known advisories as a separate visible job until dependency remediation has its own tested plan; it must not be silently suppressed.

- [ ] **Step 3: Run complete local verification**

Run: `npx vitest run --maxWorkers=1`

Run: `npm run lint`

Run: `npm run build`

Run: `npx prisma validate --schema apps/api/prisma/schema.prisma`

Run: `npm audit --omit=dev`

Expected: tests/lint/build/schema pass; audit output is recorded with remaining advisories explicitly listed.

- [ ] **Step 4: Run integration load smoke**

Run: `npm run test:load --workspace @avia/api`

Expected: error rate below 1%, read p95 below 1500 ms in the target VPS environment, and zero stock mismatches.

- [ ] **Step 5: Commit verification automation**

Commit: `ci: gate production hardening release`

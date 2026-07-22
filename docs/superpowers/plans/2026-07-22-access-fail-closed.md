# Tenant and Branch Fail-Closed Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every cashier request is authorized by an active tenant membership and explicit active-branch assignment.

**Architecture:** Centralize role-to-scope policy in small pure helpers, then use the same predicates in tenant listing, branch listing, and request-context resolution. An idempotent dry-run-first backfill command prepares legacy accounts before fail-closed code is enabled.

**Tech Stack:** Node.js 20, Prisma 6, PostgreSQL, Vitest 4.

## Global Constraints

- Do not grant platform-admin access during backfill.
- Do not alter existing explicit membership or branch assignments.
- Deny suspended tenants, inactive memberships, inactive branches, and missing cashier branch access.
- Backfill must be idempotent and dry-run by default.
- Keep superuser identity enforcement unchanged.

---

### Task 1: Lock the authorization policy with integration tests

**Files:**
- Modify: `apps/api/src/data/tenantAccess.integration.test.js`

**Interfaces:**
- Specifies: `resolveTenantForUser`, `listBranchesForUser`, and `resolveTenantBranchContextForUser` behavior.

- [ ] **Step 1: Add failing no-membership and no-branch-access cases**

```js
await expect(resolveTenantForUser({
  userId: cashier.id, role: 'kasir', requestedTenantId: tenant.id,
})).rejects.toThrow('Tenant membership is required');

await expect(resolveTenantBranchContextForUser({
  userId: memberWithoutBranch.id,
  role: 'kasir',
  requestedTenantId: tenant.id,
  requestedBranchId: branch.id,
})).rejects.toThrow('Branch access is required');
```

Add cases for suspended tenant, inactive membership, inactive branch, owner access to all active branches, and cashier access to exactly assigned active branches.

- [ ] **Step 2: Run tests and verify fallback behavior fails them**

Run: `npx vitest run apps/api/src/data/tenantAccess.integration.test.js --maxWorkers=1`

Expected: FAIL because cashiers without rules currently inherit the default tenant/all branches.

- [ ] **Step 3: Commit test contract**

Commit: `test: define fail-closed tenant branch access`

---

### Task 2: Implement centralized fail-closed access resolution

**Files:**
- Create: `apps/api/src/data/accessPolicy.js`
- Create: `apps/api/src/data/accessPolicy.test.js`
- Modify: `apps/api/src/data/db.js`
- Test: `apps/api/src/data/tenantAccess.integration.test.js`

**Interfaces:**
- Produces: `normalizeTenantRole(role)`, `canAccessAllTenantBranches(globalRole, membershipRole)`, `isActiveStatus(status)`.

- [ ] **Step 1: Write pure policy tests**

```js
expect(canAccessAllTenantBranches('kasir', 'owner')).toBe(true);
expect(canAccessAllTenantBranches('kasir', 'admin')).toBe(true);
expect(canAccessAllTenantBranches('kasir', 'kasir')).toBe(false);
expect(isActiveStatus('ACTIVE')).toBe(true);
expect(isActiveStatus('suspended')).toBe(false);
```

- [ ] **Step 2: Run the pure tests and observe missing-module failure**

Run: `npx vitest run apps/api/src/data/accessPolicy.test.js --maxWorkers=1`

Expected: FAIL because `accessPolicy.js` does not exist.

- [ ] **Step 3: Implement the policy module**

```js
export function normalizeTenantRole(value) {
  return String(value || '').trim().toLowerCase();
}

export function isActiveStatus(value) {
  return normalizeTenantRole(value) === 'active';
}

export function canAccessAllTenantBranches(globalRole, membershipRole) {
  const global = normalizeTenantRole(globalRole);
  const member = normalizeTenantRole(membershipRole);
  return global === 'superuser' || global === 'admin' || member === 'owner' || member === 'admin';
}
```

- [ ] **Step 4: Remove fallback tenant and default-open branch paths**

In `resolveTenantForUser`, replace the final default-tenant fallback with:

```js
throw new Error('Tenant membership is required');
```

For non-platform users, load the active membership with its active tenant. In branch list/context functions, load the membership role and use `canAccessAllTenantBranches`. Cashiers query only `UserBranchAccess` rows whose branch has `{ tenantId, status: 'active' }`; an empty result throws `Branch access is required`. Every direct branch lookup includes `status: 'active'`.

- [ ] **Step 5: Run policy and integration tests**

Run: `npx vitest run apps/api/src/data/accessPolicy.test.js apps/api/src/data/tenantAccess.integration.test.js --maxWorkers=1`

Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `fix: enforce explicit tenant branch access`

---

### Task 3: Add dry-run-first legacy access backfill

**Files:**
- Create: `apps/api/scripts/backfill-user-access.mjs`
- Modify: `apps/api/package.json`
- Create: `apps/api/src/data/accessBackfill.js`
- Create: `apps/api/src/data/accessBackfill.test.js`
- Modify: `README.md`

**Interfaces:**
- Produces: `planAccessBackfill({ users, tenants, branches })` and command `npm run db:backfill:access --workspace @avia/api -- [--apply]`.

- [ ] **Step 1: Write failing deterministic planner tests**

```js
expect(planAccessBackfill({
  users: [{ id: 'u1', role: 'kasir', memberships: [], branchAccesses: [] }],
  tenants: [{ id: 't1', status: 'active' }],
  branches: [{ id: 'b1', tenantId: 't1', status: 'active' }],
})).toEqual({
  assignments: [{ userId: 'u1', tenantId: 't1', branchId: 'b1' }],
  unresolved: [],
});
```

Also assert multiple active tenants or multiple candidate branches produce an unresolved entry and no assignment.

- [ ] **Step 2: Run planner tests and observe missing-module failure**

Run: `npx vitest run apps/api/src/data/accessBackfill.test.js --maxWorkers=1`

Expected: FAIL.

- [ ] **Step 3: Implement the pure planner**

The planner filters out superusers and already-assigned users. It creates an assignment only when exactly one active tenant and exactly one active branch in it exist; every other legacy user is returned in `unresolved` with reason `ambiguous-tenant` or `ambiguous-branch`.

```js
export function planAccessBackfill({ users, tenants, branches }) {
  const activeTenants = tenants.filter((tenant) => tenant.status === 'active');
  const assignments = [];
  const unresolved = [];
  for (const user of users) {
    if (user.role === 'superuser' || user.memberships.length || user.branchAccesses.length) continue;
    if (activeTenants.length !== 1) {
      unresolved.push({ userId: user.id, reason: 'ambiguous-tenant' });
      continue;
    }
    const tenant = activeTenants[0];
    const candidates = branches.filter((branch) => branch.tenantId === tenant.id && branch.status === 'active');
    if (candidates.length !== 1) {
      unresolved.push({ userId: user.id, reason: 'ambiguous-branch' });
      continue;
    }
    assignments.push({ userId: user.id, tenantId: tenant.id, branchId: candidates[0].id });
  }
  return { assignments, unresolved };
}
```

- [ ] **Step 4: Implement idempotent command**

The command prints JSON in dry-run mode. With `--apply`, use a transaction and `upsert` both records:

```js
await tx.userMembership.upsert({
  where: { userId_tenantId: { userId, tenantId } },
  update: {}, create: { userId, tenantId, role: 'kasir', status: 'active' },
});
await tx.userBranchAccess.upsert({
  where: { userId_branchId: { userId, branchId } },
  update: {}, create: { userId, branchId, role: 'kasir' },
});
```

Exit nonzero in apply mode when unresolved accounts remain.

- [ ] **Step 5: Add script and deployment documentation**

Add:

```json
"db:backfill:access": "node --env-file=.env scripts/backfill-user-access.mjs"
```

Document dry run, manual resolution, apply, second dry run, and only then application restart.

- [ ] **Step 6: Test twice and commit**

Run: `npx vitest run apps/api/src/data/accessBackfill.test.js --maxWorkers=1`

Run the command twice against the integration database and expect the second run to report zero assignments.

Commit: `feat: add legacy access backfill preflight`

# Frontend Session and SWR Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent cached data and transaction drafts from crossing user, tenant, or branch boundaries while keeping same-context navigation fast.

**Architecture:** Cache keys carry a stable user/tenant/branch scope, and session changes clear the SWR provider atomically. Operational screens remount on scope changes, while pagination may retain previous data only when its complete scope is unchanged.

**Tech Stack:** React 19, React Router 7, SWR 2, Vitest 4, Testing Library.

## Global Constraints

- Continue using SWR for server state.
- Keep local form state local to its screen.
- Never display previous tenant or branch data while a new context loads.
- Do not allow an old `401` response to clear a newer login.
- Batch related invalidations instead of triggering duplicate revalidation requests.

---

### Task 1: Make every operational cache key identity-scoped

**Files:**
- Modify: `apps/web/src/lib/appCache.js`
- Modify: `apps/web/src/lib/appCache.test.js`
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/web/src/pages/Dashboard.jsx`
- Modify: `apps/web/src/pages/Inventory.jsx`
- Modify: `apps/web/src/pages/Rental.jsx`
- Modify: `apps/web/src/pages/History.jsx`
- Modify: `apps/web/src/pages/FinancialRecap.jsx`
- Modify: `apps/web/src/pages/Customers.jsx`
- Modify: `apps/web/src/pages/TeamSettings.jsx`
- Modify: `apps/web/src/pages/Branches.jsx`

**Interfaces:**
- Produces: `createOperationalScope(userId, tenantId, branchId)` and cache-key functions whose first two entries remain the resource namespace and normalized user ID.

- [ ] **Step 1: Write failing key-isolation tests**

```js
expect(APP_CACHE_KEYS.items('u1', 't1', 'b1')).not.toEqual(
  APP_CACHE_KEYS.items('u2', 't1', 'b1'),
);
expect(APP_CACHE_KEYS.customers('u1', 't1', 'b1', 'andi')).not.toEqual(
  APP_CACHE_KEYS.customers('u1', 't2', 'b1', 'andi'),
);
expect(APP_CACHE_KEYS.customers('u1', 't1', 'b1', 'andi')).not.toEqual(
  APP_CACHE_KEYS.customers('u1', 't1', 'b1', 'budi'),
);
```

- [ ] **Step 2: Run tests and observe signature failure**

Run: `npx vitest run apps/web/src/lib/appCache.test.js --maxWorkers=1`

Expected: FAIL because current keys omit user identity and customer scope.

- [ ] **Step 3: Add normalized scope helper and scoped keys**

```js
export function createOperationalScope(userId, tenantId, branchId = '') {
  return [userId, tenantId, branchId].map((value) => String(value || '').trim());
}

export const APP_CACHE_KEYS = {
  items: (userId, tenantId, branchId) => ['app/items', ...createOperationalScope(userId, tenantId, branchId)],
  customers: (userId, tenantId, branchId, query = '') => [
    'app/customers', ...createOperationalScope(userId, tenantId, branchId), String(query).trim().toLowerCase(),
  ],
};
```

Apply the same leading scope to branches, categories, rentals, dashboard, inventory page, history, financial recap, settings, subscription, users, memberships, and branch access.

- [ ] **Step 4: Pass `currentUser.id` to screen keys**

Add a `userId` prop to operational pages and update every key call. A key is `null` unless required scope values are present.

- [ ] **Step 5: Limit previous-data retention**

Set global policy:

```js
export const APP_SWR_OPTIONS = {
  keepPreviousData: false,
  revalidateOnFocus: true,
  refreshWhenHidden: false,
  errorRetryCount: 2,
};
```

Keep `keepPreviousData: true` only in inventory/history/financial pagination, whose keys now contain the full identity and business scope.

- [ ] **Step 6: Run tests and commit**

Run: `npx vitest run apps/web/src/lib/appCache.test.js apps/web/src/pages/pages.smoke.test.jsx --maxWorkers=1`

Expected: PASS.

Commit: `fix: scope SWR cache by user tenant branch`

---

### Task 2: Make authentication expiry token-safe and clear cache atomically

**Files:**
- Modify: `apps/web/src/lib/api.js`
- Modify: `apps/web/src/lib/api.test.js`
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/web/src/App.test.jsx`

**Interfaces:**
- Produces: `clearClientSession()` and `avia-auth-expired` event detail `{ token }`.

- [ ] **Step 1: Write a failing stale-401 test**

Start an authenticated request with token A, log in and store token B before its `401` resolves, then assert B remains stored and no expiry event is emitted for the current session.

```js
expect(api.getStoredSession().token).toBe('token-b');
expect(expiredListener).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run API tests and observe token B being cleared**

Run: `npx vitest run apps/web/src/lib/api.test.js --maxWorkers=1`

Expected: FAIL because the current request clears whichever token is current.

- [ ] **Step 3: Capture request identity and guard expiry**

At request start:

```js
const requestToken = config.auth ? accessToken : '';
if (requestToken) headers.Authorization = `Bearer ${requestToken}`;
```

On `401`:

```js
if (response.status === 401 && config.auth && requestToken === accessToken) {
  setSession('', null);
  window.dispatchEvent(new CustomEvent('avia-auth-expired', { detail: { token: requestToken } }));
}
```

- [ ] **Step 4: Centralize App session reset**

Create one callback used by logout, expiry, rejected admin/cashier login, and user replacement:

```js
const clearClientSession = useCallback(async ({ message = '' } = {}) => {
  logout();
  setSession({ token: '', user: null });
  setCart([]);
  setActiveTenantId('');
  setActiveBranchId('');
  setActiveTenantContext({ tenantId: '', branchId: '' });
  await mutateCache(() => true, undefined, { revalidate: false });
  setAuthErrorMessage(message);
}, [mutateCache]);
```

The expiry listener ignores events whose detail token no longer matches the current session.

- [ ] **Step 5: Run API/App tests and commit**

Run: `npx vitest run apps/web/src/lib/api.test.js apps/web/src/App.test.jsx --maxWorkers=1`

Expected: PASS.

Commit: `fix: isolate session expiry from newer login`

---

### Task 3: Reset transaction drafts on tenant or branch change

**Files:**
- Modify: `apps/web/src/App.jsx`
- Modify: `apps/web/src/App.test.jsx`
- Modify: `apps/web/src/pages/Rental.jsx`
- Modify: `apps/web/src/pages/Return.jsx`
- Test: `apps/web/src/pages/pages.smoke.test.jsx`

**Interfaces:**
- Produces: `operationalScopeKey = userId:tenantId:branchId` used as React remount boundary.

- [ ] **Step 1: Write failing context-switch tests**

Add an item to the cart, change branch, and assert the new branch sees an empty cart. Select a rental in Return, change tenant, and assert the selection and fee fields reset.

```js
expect(screen.queryByText('1 item aktif')).not.toBeInTheDocument();
expect(screen.queryByDisplayValue('25000')).not.toBeInTheDocument();
```

- [ ] **Step 2: Run App/page tests and observe retained local state**

Run: `npx vitest run apps/web/src/App.test.jsx apps/web/src/pages/pages.smoke.test.jsx --maxWorkers=1`

Expected: FAIL.

- [ ] **Step 3: Add a scope transition helper**

```js
const resetOperationalDrafts = useCallback(() => {
  setCart([]);
  setErrorMessage('');
  setIsHeaderDataRequested(false);
}, []);
```

Call it before storing a new tenant or branch. Resolve branch to empty during tenant selection, then only set a branch returned by the active-branch query.

- [ ] **Step 4: Remount local forms per operational scope**

```js
const operationalScopeKey = `${currentUser?.id || ''}:${activeTenantId}:${activeBranchId}`;
```

Apply the key to Rental and Return route elements so their local form state is recreated after a context change. Do not key the whole application shell.

- [ ] **Step 5: Verify no request burst**

In `App.test.jsx`, count `fetchItems`, `fetchRentals`, and `fetchCategories`; each should run no more than once for the resolved new context after a branch switch.

- [ ] **Step 6: Run frontend verification and commit**

Run: `npx vitest run apps/web/src --maxWorkers=1`

Run: `npm run build:web`

Expected: PASS and build exits 0.

Commit: `fix: reset drafts when operational scope changes`

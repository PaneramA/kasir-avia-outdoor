# Frontend SWR Cache Isolation Report

## Scope and Changed Files

- `apps/web/src/lib/appCache.js`
- `apps/web/src/lib/appCache.test.js`
- `apps/web/src/App.jsx`
- `apps/web/src/pages/Branches.jsx`
- `apps/web/src/pages/Customers.jsx`
- `apps/web/src/pages/Dashboard.jsx`
- `apps/web/src/pages/FinancialRecap.jsx`
- `apps/web/src/pages/History.jsx`
- `apps/web/src/pages/Inventory.jsx`
- `apps/web/src/pages/Rental.jsx`
- `apps/web/src/pages/TeamSettings.jsx`
- `apps/web/src/pages/Users.jsx`

Implemented `createOperationalScope(userId, tenantId, branchId = '')` with trimmed values. Operational SWR keys now place the namespace first and normalized user ID second, include tenant and branch scope where required, normalize customer search text, and return `null` for incomplete required scope. All operational callers receive and pass the active user ID. Inventory mutation matching now compares normalized user, tenant, and branch scope. Global `APP_SWR_OPTIONS.keepPreviousData` is `false`; only inventory, rental history, and financial recap pagination retain it locally.

## RED Evidence

Command:

```text
npx vitest run apps/web/src/lib/appCache.test.js --maxWorkers=1
```

Result: exit code `1`; all 6 added isolation tests failed as expected. Failures showed the missing `createOperationalScope`, old keys without normalized user/tenant/branch entries, global `keepPreviousData: true`, and inventory mutation matching that ignored user identity.

## GREEN and Verification Evidence

```text
npx vitest run apps/web/src/lib/appCache.test.js apps/web/src/pages/pages.smoke.test.jsx --maxWorkers=1
```

Result: exit code `0`; 2 files and 21 tests passed.

```text
npx vitest run apps/web/src --maxWorkers=1
```

Result: exit code `0`; 16 files and 83 tests passed.

```text
npm run lint:web
```

Result: exit code `0`; ESLint completed with no errors.

```text
npm run build:web
```

Result: exit code `0`; Vite production build completed successfully.

## Self-Review

- Checked every `APP_CACHE_KEYS` call site and confirmed no legacy argument order remains.
- Confirmed pagination fetcher tuple indices account for the inserted user ID.
- Confirmed the cache mutation predicate compares user, tenant, and branch at every inventory caller.
- Confirmed no auth/session source file was changed and commit `c4512c2` remains untouched.
- `git diff --check` reported no whitespace errors; it emitted only existing CRLF conversion warnings.

## Commit

Pending at report creation time.

## Concerns

No implementation concerns. The worktree contains unrelated pre-existing README and API changes; they are not part of this task and will not be staged or committed.

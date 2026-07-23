# Production Hardening Design

**Date:** 2026-07-22
**Status:** Approved for implementation planning

## Context

The application is a React/Vite cashier frontend backed by a custom Node HTTP API and Prisma/PostgreSQL. The current unit suite, lint, and production build pass, but the audit found production risks around destructive item deletion, tenant and branch authorization defaults, concurrent stock changes, cross-context frontend state, request hardening, and deployment reproducibility.

This design deliberately separates those risks into independent workstreams. Each workstream must start with a failing regression test, remain deployable on its own, and avoid broad UI changes because a separate UI/UX refinement is planned later.

## Goals

- Preserve all transaction history when an inventory item is removed from daily use.
- Make tenant and branch authorization fail closed without locking out existing valid users during rollout.
- Make checkout, return, and administrative rental deletion safe under concurrent requests.
- Prevent SWR data, carts, and forms from leaking across users, tenants, or branches.
- Add practical API limits and production configuration checks.
- Provide a migration and rollout path that can be verified before production traffic reaches new code.

## Non-goals

- Redesigning the cashier or admin interface.
- Replacing SWR or the custom Node HTTP server.
- Replacing JWT authentication with cookies in this batch.
- Introducing Redis before a measured need and an operational plan exist.
- Rewriting `db.js` wholesale. Extraction is limited to helpers that reduce risk in touched flows.

## Workstream A: Inventory Archival and Stock Integrity

### Item lifecycle

Add a nullable `archivedAt` field to `Item`. An item with `archivedAt = null` is active; a timestamp means archived. The existing audit log records the actor and action, avoiding an additional user relation on `Item`.

The existing delete action becomes an archive operation:

- It never deletes `RentalItem` records.
- It never physically deletes an `Item` referenced by transaction history.
- Archived items are omitted from normal inventory lists, search results, dashboard stock totals, imports, and rental selection.
- Historical rentals and return records continue to render their stored item snapshot.
- Returning an archived item may restore its stock count, but does not reactivate it.
- Checkout rejects an archived item even if it remains in a stale browser cart.
- Authorized inventory managers can list archived items and restore them.

The public API should expose explicit archive semantics while retaining temporary compatibility for the current frontend:

- `DELETE /api/items/:id` archives the item during the compatibility period.
- `POST /api/items/:id/restore` restores the item.
- `GET /api/items/page?status=active|archived|all` defaults to `active`.
- DTOs include `archivedAt` so the frontend can render and invalidate state correctly.

### Atomic stock changes

Checkout must decrement stock conditionally inside one database transaction. Every item update must include `archivedAt: null` and `stock >= requested quantity`; a failed update aborts the entire rental.

Administrative rental deletion must first claim the undeleted rental with an atomic conditional update. Only the request that changes `deletedAt` from null may restore stock. A concurrent second request receives an already-deleted conflict and performs no stock mutation.

Return processing follows the same one-way state transition rule. Stock restoration happens only after the return record/state transition is successfully claimed.

Manual inventory edits remain a separate concern: the API must reject negative stock and should avoid silently overwriting stock changed by an overlapping checkout. The implementation plan will use either an optimistic `updatedAt` precondition or a dedicated stock-adjustment operation, based on the current form contract.

## Workstream B: Tenant and Branch Authorization

Authorization becomes explicit:

- Platform superusers may select any active tenant and active branch.
- A tenant owner or tenant admin requires an active membership and may access active branches in that tenant.
- A cashier requires both an active tenant membership and an explicit `UserBranchAccess` row for the selected active branch.
- Suspended tenants, inactive memberships, inactive branches, and missing branch access are denied.
- A user without membership no longer falls back to the default tenant.

The stricter rules require a two-step rollout:

1. A preflight/backfill command reports users without active memberships or required branch access. In apply mode it creates only unambiguous default-tenant/default-branch assignments and reports ambiguous accounts for manual review.
2. Fail-closed application code is deployed only after the report contains no unresolved cashier accounts.

The backfill must be idempotent and support a dry run. It must not grant platform-admin access or alter existing explicit assignments.

## Workstream C: Frontend Session and SWR Isolation

Every operational cache key must include the identity and business context that determines its result. Tenant and branch scoped resources include both IDs; customer search includes tenant, branch when the API is branch-scoped, and normalized query text.

Session transitions are atomic:

- Login, logout, token expiry, and user changes clear the previous user's SWR cache and in-memory operational state.
- Tenant changes clear branch selection until a valid branch is resolved.
- Tenant or branch changes reset the rental cart, return form, customer draft, and other transaction forms.
- `keepPreviousData` is allowed for pagination within the same tenant/branch, but not across identity or context changes.
- A late `401` response is associated with the token that initiated the request and cannot clear a newer session.

Mutations update or invalidate all affected keys once: item lists, dashboard, rentals, history, financial recap, and customer search as applicable. Revalidation should be batched to avoid request storms.

## Workstream D: API and Runtime Hardening

### Request safety

- JSON bodies have a configurable byte limit and read timeout.
- The server stops reading and returns `413` for oversized bodies.
- Validation schemas keep field and array limits below the body limit.
- Compression is applied only to eligible responses above a threshold; implementation must avoid synchronous compression on large responses.
- Password verification moves away from synchronous CPU work on the request thread.

### Abuse controls

Login throttling has bounded memory, periodic cleanup, and a documented proxy trust policy. The first implementation may remain process-local for a single API process. A shared store is required before running multiple API replicas; the code and deployment documentation must state that boundary clearly.

### Production configuration

Production startup fails when JWT secrets, password pepper, admin password, database URL, or allowed origins are missing or use known development defaults. Development and tests retain explicit safe defaults.

Error responses expose stable client messages while full details remain in server logs. Sensitive credentials and tokens are never logged.

## Database and Migration Strategy

The new archival migration is append-only. Existing migration files are not edited after deployment. Because the audit found gaps in historical migration reproducibility, production rollout includes a schema preflight:

- Record `prisma migrate status` and the production schema state.
- Confirm whether historical migrations are marked as applied.
- Generate and review the SQL diff before applying the new migration.
- Back up the production database before schema or access backfill changes.
- Run the archival migration, regenerate Prisma Client, apply the access backfill, then deploy fail-closed code.

Repairing the entire historical migration chain is a separate controlled task. It requires a verified production schema baseline and must not be improvised from the local database.

## Test Strategy

### Unit and route tests

- Normal item queries exclude archived records.
- Archive preserves all `RentalItem` rows and historical DTOs.
- Restore returns an item to active results.
- Checkout rejects archived or insufficient-stock items atomically.
- Duplicate concurrent delete/return requests restore stock once.
- Missing membership and missing cashier branch access are denied.
- Owners and tenant admins retain access to active tenant branches.
- Inactive tenant, membership, or branch is denied.
- Cache keys differ across users, tenants, branches, and search terms.
- Logout, expiry, and context switches clear state without a request storm.
- Oversized and timed-out bodies return controlled responses.
- Production config rejects insecure defaults.

### Integration tests

Database-backed tests use isolated records and verify transaction outcomes, not only response codes. Concurrency tests issue overlapping requests and assert final stock, rental state, audit count, and return count.

### Verification gates

Each workstream must pass its focused tests before integration. The combined branch must pass all unit tests serially, database integration tests with PostgreSQL running, lint, the web production build, Prisma validation, and a migration dry run.

## Parallel Delivery Boundaries

Work can proceed in parallel after the implementation plan assigns non-overlapping ownership:

- **A1 Schema and inventory lifecycle:** Prisma schema/migration, inventory data functions, inventory routes, focused tests.
- **A2 Transaction concurrency:** checkout, return, rental deletion, focused integration tests.
- **B Authorization:** tenant/branch resolution, backfill command, authorization integration tests.
- **C Frontend state:** SWR keys, session reset, cart/form resets, frontend tests.
- **D Runtime security:** environment validation, HTTP body handling, auth throttling, unit tests.

Shared files such as `apps/api/src/data/db.js`, `apps/api/src/routes/api.js`, and `apps/web/src/App.jsx` require serialized integration even when research and tests are prepared in parallel. No agent may rewrite unrelated sections of these files.

## Rollout Order

1. Establish green baseline with PostgreSQL-backed tests.
2. Deploy archival schema and archival behavior.
3. Run access preflight/backfill and review its report.
4. Deploy fail-closed tenant and branch authorization.
5. Deploy frontend session/SWR isolation.
6. Deploy request/runtime hardening.
7. Run smoke and concurrency checks on staging or a production-like VPS.
8. Monitor authorization denials, `409` conflicts, request rejections, API latency, and stock discrepancies before UI/UX refinement begins.

## Acceptance Criteria

- Archiving an item never removes or corrupts transaction history.
- Archived items cannot be rented but can still be returned and restored deliberately.
- Repeating checkout, return, or delete requests cannot double-change stock.
- No cashier can access a tenant or branch without explicit active authorization.
- Switching user, tenant, or branch never shows previous-context data or retains a transaction draft.
- Invalid production configuration stops startup with a clear actionable error.
- Request limits fail predictably without crashing or blocking the API process.
- All verification gates pass before deployment instructions are issued.

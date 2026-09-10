# Task 3 Report: Record Payments Safely Through the API

## Delivered

- Added `POST /api/rentals/:rentalId/payments` with authentication, tenant/branch scoping, idempotency, and `201`/`200` semantics.
- Added bounded serializable transaction retries for Prisma `P2034` conflicts.
- Added ledger-derived payment totals, payment records, and charges to the rental DTO returned by the payment endpoint.
- Added independent payment validation and removed payment fields from rental create/update schemas.
- Added focused integration coverage for partial payment, idempotency, invalid inputs, cross-tenant access, deleted and returned rentals, and concurrent overpayment.

## Verification

- Red: `npx vitest run apps/api/src/routes/api.integration.test.js --maxWorkers=1 -t "rental payment"` failed with the unhandled endpoint (`status 0`, expected `201`).
- Green: `npx vitest run apps/api/src/routes/api.integration.test.js apps/api/src/validation/schemas.test.js --maxWorkers=1 -t "rental payment|independent rental"` passed: 2 files, 2 tests passed.
- `node --check apps/api/src/data/db.js` and `node --check apps/api/src/routes/api.js` passed.
- `git diff --check` passed.

## Concern

The unfiltered two-file integration command still has one legacy workflow failure: it expects a deposit supplied in the rental-create payload. That expectation conflicts with Task 3's explicit removal of payment mutation from rental CRUD, so it needs a follow-up migration to record that deposit through the new payment endpoint.
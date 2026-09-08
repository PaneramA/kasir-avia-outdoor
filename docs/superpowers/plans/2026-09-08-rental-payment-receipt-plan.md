# Rental Payment Ledger and Receipt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple rental activation and return from payment, add an append-only payment and charge ledger, and make every receipt show a complete, internally consistent invoice.

**Architecture:** PostgreSQL remains authoritative. `RentalPayment` and `RentalCharge` store immutable money events, while the existing aggregate fields on `Rental` remain synchronized for compatibility. Pure accounting helpers derive invoice, payment status, and late days; the API performs stock, charge, payment, and aggregate updates inside scoped transactions; one frontend receipt view model feeds preview, WhatsApp, and print.

**Tech Stack:** Node.js 20+, Prisma 6.19, PostgreSQL 16, Zod 4, React 19, SWR 2, Vitest 4, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-08-rental-payment-receipt-customer-pagination-design.md`

## Global Constraints

- Confirming a rental immediately makes it `Active` and decrements inventory in the same transaction.
- Rental confirmation creates no payment and starts as `BELUM_BAYAR` with `paidAmount = 0`.
- Payment status values are exactly `BELUM_BAYAR`, `SEBAGIAN`, and `LUNAS`.
- Payment methods are exactly `TUNAI`, `QRIS`, and `BANK`; user-facing `BANK` copy is `Transfer Bank`.
- Money is stored as non-negative integer rupiah; floating-point amounts are not accepted.
- Returning items is allowed with an outstanding balance and restores inventory immediately.
- Payments are allowed for active and returned rentals, but never for soft-deleted rentals.
- Overpayment is rejected and repeated submission with the same idempotency key cannot create duplicate cash.
- Payment editing, deletion, reversal, and refund are outside this release.
- Existing `Rental.paymentStatus`, `paymentMethod`, `paidAmount`, `additionalFee`, and `finalTotal` columns remain synchronized for compatibility.
- Every database read and write is scoped by authenticated `tenantId` and `branchId`.
- Late fees use the tenant's existing `rentalDayCountMode`, `rentalCutoffHour`, and `rentalCutoffMinute` policy.
- All cashier-facing labels and errors are written in Indonesian.
- The calendar return redesign is deferred; `plannedReturnDate`, rental status, payment status, and charge dates remain stable for future calendar queries.

## File Map

- Create `apps/api/src/data/rentalAccounting.js`: pure rental amount, payment status, and billable late-day functions.
- Create `apps/api/src/data/rentalAccounting.test.js`: deterministic accounting and late-day tests.
- Create `apps/api/prisma/migrations/0012_rental_payments_charges/migration.sql`: additive ledger tables, indexes, foreign keys, and idempotent legacy backfill.
- Modify `apps/api/prisma/schema.prisma`: add `RentalPayment` and `RentalCharge` relations.
- Modify `apps/api/src/data/db.js`: include ledgers in rental DTOs, create unpaid rentals, record payments, protect edits, process unpaid returns, and report cash by payment date.
- Modify `apps/api/src/validation/schemas.js`: remove embedded rental payment input and add payment/return schemas.
- Modify `apps/api/src/routes/api.js`: add the payment endpoint and pass actor identity into rental/return services.
- Create `apps/api/src/data/rentalLedgerMigration.test.js`: assert additive tables, deterministic backfill IDs, and conflict guards in the checked-in migration.
- Modify `apps/api/src/routes/api.integration.test.js`: cover unpaid activation, partial payments, idempotency, concurrent overpayment, late charges, unpaid return, post-return payment, edit protection, and reporting.
- Create `apps/web/src/lib/receiptViewModel.js`: canonical receipt rows and totals.
- Create `apps/web/src/lib/receiptViewModel.test.js`: receipt fallback and ledger tests.
- Modify `apps/web/src/lib/receipt.js`: render the canonical model for WhatsApp and print.
- Modify `apps/web/src/lib/receipt.test.js`: assert fee detail and matching totals.
- Modify `apps/web/src/components/ReceiptModal.jsx`: render the same canonical model.
- Create `apps/web/src/components/RentalPaymentModal.jsx`: reusable payment entry dialog.
- Create `apps/web/src/components/RentalPaymentModal.test.jsx`: validation, copy, and submission tests.
- Modify `apps/web/src/lib/api.js`: add `recordRentalPayment` and normalize ledger-backed rental responses.
- Modify `apps/web/src/lib/api.test.js`: verify payment request URL and payload.
- Modify `apps/web/src/lib/appCache.js`: include all rental and financial views in payment revalidation.
- Modify `apps/web/src/lib/appCache.test.js`: prove payment invalidation stays within the active scope.
- Modify `apps/web/src/App.jsx`: centralize payment mutation and pass it to Rental, History, and Return.
- Modify `apps/web/src/App.test.jsx`: verify updated rental data reaches SWR caches.
- Modify `apps/web/src/pages/Rental.jsx`: remove payment fields and expose post-confirmation payment/receipt actions.
- Modify `apps/web/src/pages/Rental.test.jsx`: verify confirmation without payment and post-success actions.
- Modify `apps/web/src/pages/History.jsx`: show separate statuses and allow outstanding payments.
- Modify `apps/web/src/pages/History.test.jsx`: verify payment action for active and returned rentals.
- Modify `apps/web/src/pages/Return.jsx`: remove forced settlement, show late-day breakdown, and permit unpaid return.
- Modify `apps/web/src/pages/Return.test.jsx`: verify multi-day fees and unpaid return.
- Modify `apps/web/src/pages/FinancialRecap.jsx` and `apps/web/src/lib/financial.js`: present invoice, cash, receivable, and method totals with ledger semantics.
- Modify `apps/web/src/pages/FinancialRecap.test.jsx` and `apps/web/src/lib/financial.test.js`: verify payment-date reporting.

---

### Task 1: Pure Rental Accounting Rules

**Files:**
- Create: `apps/api/src/data/rentalAccounting.js`
- Create: `apps/api/src/data/rentalAccounting.test.js`
- Modify: `apps/api/src/data/db.js:411-490`

**Interfaces:**
- Produces: `resolveRentalDayPolicy(settings) -> { mode, cutoffHour, cutoffMinute }`.
- Produces: `calculateRentalDurationFromRange(startDate, endDate, policy) -> integer days`.
- Produces: `calculateBillableLateDays(plannedReturnDate, returnedAt, policy) -> integer days`.
- Produces: `deriveRentalAccounting({ baseTotal, charges, payments }) -> { invoiceTotal, paidAmount, remainingAmount, paymentStatus, latestPaymentMethod }`.
- Consumes later: Tasks 3, 4, and 7 use these exact exports.

- [ ] **Step 1: Write failing accounting tests**

```js
import { describe, expect, it } from 'vitest';
import {
  calculateBillableLateDays,
  deriveRentalAccounting,
} from './rentalAccounting.js';

describe('deriveRentalAccounting', () => {
  it('derives unpaid, partial, and paid states from immutable rows', () => {
    expect(deriveRentalAccounting({ baseTotal: 100_000, charges: [], payments: [] }))
      .toMatchObject({ invoiceTotal: 100_000, paidAmount: 0, remainingAmount: 100_000, paymentStatus: 'BELUM_BAYAR' });
    expect(deriveRentalAccounting({ baseTotal: 100_000, charges: [{ amount: 20_000 }], payments: [{ amount: 50_000, method: 'QRIS', paidAt: new Date('2026-09-02') }] }))
      .toMatchObject({ invoiceTotal: 120_000, paidAmount: 50_000, remainingAmount: 70_000, paymentStatus: 'SEBAGIAN', latestPaymentMethod: 'QRIS' });
    expect(deriveRentalAccounting({ baseTotal: 100_000, charges: [], payments: [{ amount: 100_000, method: 'BANK', paidAt: new Date('2026-09-02') }] }))
      .toMatchObject({ remainingAmount: 0, paymentStatus: 'LUNAS', latestPaymentMethod: 'BANK' });
  });
});

describe('calculateBillableLateDays', () => {
  it('charges two rolling days after more than 24 hours late', () => {
    expect(calculateBillableLateDays(
      new Date('2026-09-01T01:00:00.000Z'),
      new Date('2026-09-02T02:00:00.000Z'),
      { mode: 'ROLLING_24H', cutoffHour: 8, cutoffMinute: 0 },
    )).toBe(2);
  });
});
```

- [ ] **Step 2: Run the new test and confirm the missing-module failure**

Run: `npx vitest run apps/api/src/data/rentalAccounting.test.js --maxWorkers=1`

Expected: FAIL because `rentalAccounting.js` does not exist.

- [ ] **Step 3: Implement normalized integer accounting and existing day-policy semantics**

```js
const DAY_MS = 24 * 60 * 60 * 1000;

export function deriveRentalAccounting({ baseTotal = 0, charges = [], payments = [] } = {}) {
  const invoiceTotal = Math.max(0, Math.trunc(Number(baseTotal) || 0))
    + charges.reduce((sum, row) => sum + Math.max(0, Math.trunc(Number(row?.amount) || 0)), 0);
  const paidAmount = payments.reduce((sum, row) => sum + Math.max(0, Math.trunc(Number(row?.amount) || 0)), 0);
  const remainingAmount = Math.max(0, invoiceTotal - paidAmount);
  const paymentStatus = remainingAmount === 0
    ? 'LUNAS'
    : paidAmount > 0 ? 'SEBAGIAN' : 'BELUM_BAYAR';
  const latestPayment = [...payments].sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt))[0];
  return {
    invoiceTotal,
    paidAmount,
    remainingAmount,
    paymentStatus,
    latestPaymentMethod: latestPayment?.method || 'TUNAI',
  };
}

export function calculateBillableLateDays(plannedReturnDate, returnedAt, policyInput) {
  const due = new Date(plannedReturnDate);
  const returned = new Date(returnedAt);
  if (Number.isNaN(due.getTime()) || Number.isNaN(returned.getTime()) || returned <= due) return 0;
  return calculateRentalDurationFromRange(due, returned, resolveRentalDayPolicy(policyInput));
}
```

Move the existing `resolveRentalDayPolicy` and `calculateRentalDurationFromRange` implementations from `db.js` into this module without changing their existing behavior, then import them back into `db.js`.

- [ ] **Step 4: Run focused accounting tests**

Run: `npx vitest run apps/api/src/data/rentalAccounting.test.js --maxWorkers=1`

Expected: PASS, including rolling and daily-cutoff cases, invalid dates, zero lateness, charge sums, and payment ordering.

- [ ] **Step 5: Commit the accounting helper**

```bash
git add apps/api/src/data/rentalAccounting.js apps/api/src/data/rentalAccounting.test.js apps/api/src/data/db.js
git commit -m "refactor: centralize rental accounting rules"
```

### Task 2: Add Ledger Tables and Backfill Legacy Money

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/0012_rental_payments_charges/migration.sql`
- Create: `apps/api/src/data/rentalLedgerMigration.test.js`

**Interfaces:**
- Produces: Prisma models `RentalPayment` and `RentalCharge`.
- Produces: unique payment identity `@@unique([tenantId, idempotencyKey])`.
- Produces: deterministic legacy IDs `legacy-payment-<rentalId>` and `legacy-charge-<rentalId>`.
- Consumes later: Tasks 3-8 use `prisma.rentalPayment` and `prisma.rentalCharge`.

- [ ] **Step 1: Add a failing migration contract test**

Read the checked-in SQL and assert the additive schema and idempotent legacy mappings:

```js
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('rental ledger migration', () => {
  it('uses additive tables and conflict-safe deterministic backfill IDs', async () => {
    const sql = await readFile(
      new URL('../../prisma/migrations/0012_rental_payments_charges/migration.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE "RentalPayment"');
    expect(sql).toContain('CREATE TABLE "RentalCharge"');
    expect(sql).toContain("'legacy-payment-' || r.\"id\"");
    expect(sql).toContain("'legacy-charge-' || r.\"id\"");
    expect(sql.match(/ON CONFLICT/g)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the migration contract test and confirm the missing-file failure**

Run: `npx vitest run apps/api/src/data/rentalLedgerMigration.test.js --maxWorkers=1`

Expected: FAIL because `0012_rental_payments_charges/migration.sql` does not exist.

- [ ] **Step 3: Add the additive Prisma models and relations**

```prisma
model RentalPayment {
  id              String   @id @default(cuid())
  rentalId        String
  tenantId        String
  branchId        String
  amount          Int
  method          String
  paidAt          DateTime
  note            String?
  idempotencyKey  String
  createdByUserId String?
  createdAt       DateTime @default(now())
  rental          Rental   @relation(fields: [rentalId], references: [id], onDelete: Cascade)
  createdBy       User?    @relation("RentalPaymentCreatedByUser", fields: [createdByUserId], references: [id], onDelete: SetNull)

  @@unique([tenantId, idempotencyKey])
  @@index([rentalId, paidAt])
  @@index([tenantId, branchId, paidAt])
  @@index([createdByUserId])
}

model RentalCharge {
  id              String   @id @default(cuid())
  rentalId        String
  tenantId        String
  branchId        String
  type            String
  description     String
  quantity        Int      @default(1)
  unitAmount      Int
  amount          Int
  chargedAt       DateTime
  createdByUserId String?
  createdAt       DateTime @default(now())
  rental          Rental   @relation(fields: [rentalId], references: [id], onDelete: Cascade)
  createdBy       User?    @relation("RentalChargeCreatedByUser", fields: [createdByUserId], references: [id], onDelete: SetNull)

  @@index([rentalId, chargedAt])
  @@index([tenantId, branchId, chargedAt])
  @@index([createdByUserId])
}
```

Add `payments RentalPayment[]` and `charges RentalCharge[]` to `Rental`, plus the named actor relations to `User`.

- [ ] **Step 4: Write the SQL migration with conflict-safe backfill**

The migration must create both tables/indexes/FKs, alter the `Rental.paymentStatus` default to `BELUM_BAYAR`, and execute these backfill shapes:

```sql
INSERT INTO "RentalPayment" (
  "id", "rentalId", "tenantId", "branchId", "amount", "method",
  "paidAt", "note", "idempotencyKey", "createdByUserId", "createdAt"
)
SELECT
  'legacy-payment-' || r."id", r."id", r."tenantId", r."branchId",
  CASE
    WHEN UPPER(r."paymentStatus") = 'LUNAS' AND r."paidAmount" = 0
      THEN COALESCE(r."finalTotal", r."total")
    ELSE r."paidAmount"
  END,
  CASE WHEN UPPER(r."paymentMethod") IN ('TUNAI', 'QRIS', 'BANK') THEN UPPER(r."paymentMethod") ELSE 'TUNAI' END,
  r."date", 'Migrasi pembayaran lama', 'legacy:' || r."id", NULL, r."createdAt"
FROM "Rental" r
WHERE r."paidAmount" > 0 OR UPPER(r."paymentStatus") = 'LUNAS'
ON CONFLICT ("tenantId", "idempotencyKey") DO NOTHING;

INSERT INTO "RentalCharge" (
  "id", "rentalId", "tenantId", "branchId", "type", "description",
  "quantity", "unitAmount", "amount", "chargedAt", "createdByUserId", "createdAt"
)
SELECT
  'legacy-charge-' || r."id", r."id", r."tenantId", r."branchId",
  'LEGACY_ADDITIONAL_FEE', 'Denda/biaya tambahan lama', 1,
  r."additionalFee", r."additionalFee", COALESCE(r."returnDate", r."updatedAt"), NULL, r."createdAt"
FROM "Rental" r
WHERE r."additionalFee" > 0
ON CONFLICT ("id") DO NOTHING;
```

- [ ] **Step 5: Recreate the test database and verify migration/backfill**

Run: `npx prisma migrate reset --force --skip-seed --schema apps/api/prisma/schema.prisma`

Expected: all migrations apply and both ledger tables and indexes exist.

Run: `npm run prisma:generate --workspace @avia/api`

Expected: Prisma Client generation succeeds.

- [ ] **Step 6: Run the migration contract test**

Run: `npx vitest run apps/api/src/data/rentalLedgerMigration.test.js --maxWorkers=1`

Expected: PASS.

- [ ] **Step 7: Commit schema and migration**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/0012_rental_payments_charges/migration.sql apps/api/src/data/rentalLedgerMigration.test.js
git commit -m "feat: add rental payment and charge ledgers"
```

### Task 3: Record Payments Safely Through the API

**Files:**
- Modify: `apps/api/src/data/db.js:169-240,1771-2022`
- Modify: `apps/api/src/validation/schemas.js:235-265`
- Modify: `apps/api/src/routes/api.js:1251-1336`
- Modify: `apps/api/src/routes/api.integration.test.js`

**Interfaces:**
- Produces: `recordRentalPayment(rentalId, payload, context) -> { rental, payment }`.
- Consumes: `payload = { amount: integer, method: 'TUNAI'|'QRIS'|'BANK', paidAt?: ISO string, note?: string, idempotencyKey: string }`.
- Produces: `POST /api/rentals/:rentalId/payments` with the same result shape.
- Produces: rental DTO `payment = { status, method, paidAmount, remainingAmount, totalDue, records }` and `charges`.

- [ ] **Step 1: Add failing API tests for payment rules**

Add tests that create an unpaid rental and assert:

```js
const partial = await callApi('POST', `/api/rentals/${rentalId}/payments`, {
  token, tenantId, branchId,
  body: { amount: 40_000, method: 'QRIS', idempotencyKey: `test:${rentalId}:1` },
});
expect(partial.status).toBe(201);
expect(partial.body.data.rental.payment).toMatchObject({
  status: 'SEBAGIAN', paidAmount: 40_000, remainingAmount: 60_000,
});

const repeated = await callApi('POST', `/api/rentals/${rentalId}/payments`, {
  token, tenantId, branchId,
  body: { amount: 40_000, method: 'QRIS', idempotencyKey: `test:${rentalId}:1` },
});
expect(repeated.status).toBe(200);
expect(await prisma.rentalPayment.count({ where: { rentalId } })).toBe(1);
```

Also add assertions for zero/negative input, invalid method, cross-tenant rental, deleted rental, payment after return, and two concurrent requests whose combined amount exceeds the balance.

- [ ] **Step 2: Run focused integration tests and confirm endpoint failure**

Run: `npx vitest run apps/api/src/routes/api.integration.test.js --maxWorkers=1 -t "rental payment"`

Expected: FAIL with the payment endpoint unhandled or returning 404.

- [ ] **Step 3: Add payment validation**

```js
export const createRentalPaymentSchema = z.object({
  amount: z.coerce.number().int().positive(),
  method: z.enum(['TUNAI', 'QRIS', 'BANK']),
  paidAt: z.string().datetime().optional(),
  note: z.string().trim().max(300).optional().default(''),
  idempotencyKey: z.string().trim().min(8).max(120),
});
```

Remove `payment` from `createRentalSchema` and `updateRentalSchema` so money cannot be changed through rental CRUD.

- [ ] **Step 4: Implement bounded serializable payment recording**

Add a private transaction helper that retries Prisma `P2034` at most three times. Inside the transaction:

```js
const duplicate = await tx.rentalPayment.findUnique({
  where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: payload.idempotencyKey } },
});
if (duplicate) return loadPaymentResult(tx, duplicate.rentalId, duplicate.id);

const rental = await tx.rental.findFirst({
  where: { id: rentalId, tenantId, branchId, deletedAt: null },
  include: { items: true, payments: true, charges: true },
});
if (!rental) throw createHttpError(404, 'Transaksi sewa tidak ditemukan.');

const accounting = deriveRentalAccounting({
  baseTotal: rental.total,
  charges: rental.charges,
  payments: rental.payments,
});
if (payload.amount > accounting.remainingAmount) {
  throw createHttpError(409, 'Nominal pembayaran melebihi sisa tagihan.');
}
```

Create the payment, recalculate aggregates from rows, update `Rental`, create an audit log with action `RENTAL_PAYMENT_CREATED`, and return the reloaded DTO. Do not persist secrets or raw request headers in the audit snapshot.

- [ ] **Step 5: Add and order the payment route**

Match only `/api/rentals/<id>/payments`, call `ensureAuth()`, then `ensureRequestContext()`, and pass `{ ...context, actorUserId: actor.id }`. Return `201` for a new row and `200` when the idempotency key already exists.

- [ ] **Step 6: Run focused payment and authorization tests**

Run: `npx vitest run apps/api/src/routes/api.integration.test.js apps/api/src/validation/schemas.test.js --maxWorkers=1`

Expected: PASS; concurrent requests never produce a negative balance or ledger sum above the invoice.

- [ ] **Step 7: Commit payment API**

```bash
git add apps/api/src/data/db.js apps/api/src/validation/schemas.js apps/api/src/routes/api.js apps/api/src/routes/api.integration.test.js apps/api/src/validation/schemas.test.js
git commit -m "feat: record rental payments independently"
```

### Task 4: Decouple Rental Confirmation, Editing, and Return

**Files:**
- Modify: `apps/api/src/data/db.js:1771-2360,4629-4745`
- Modify: `apps/api/src/validation/schemas.js:235-265`
- Modify: `apps/api/src/routes/api.js:1251-1336`
- Modify: `apps/api/src/routes/api.integration.test.js`

**Interfaces:**
- `createRental(payload, { tenantId, branchId, actorUserId })` creates no ledger payment.
- `updateRental(rentalId, payload, context)` preserves payments and rejects `newInvoiceTotal < paidAmount`.
- `processReturn({ rentalId, applyLateFee, lateFeeAmount?, returnNotes }, context) -> { rental, returnRecord, charge }`.

- [ ] **Step 1: Add failing lifecycle tests**

```js
expect(createdRental.status).toBe('Active');
expect(createdRental.payment).toMatchObject({
  status: 'BELUM_BAYAR', paidAmount: 0, remainingAmount: createdRental.total,
});
expect(await prisma.rentalPayment.count({ where: { rentalId: createdRental.id } })).toBe(0);

const returned = await processReturn({
  rentalId: createdRental.id,
  applyLateFee: true,
  lateFeeAmount: 110_000,
  returnNotes: 'Dikembalikan lengkap',
}, context);
expect(returned.rental.status).toBe('Returned');
expect(returned.rental.payment.status).toBe('BELUM_BAYAR');
expect(returned.rental.charges[0]).toMatchObject({ type: 'LATE_FEE', quantity: 2, amount: 110_000 });
```

Add stock assertions before/after return and an edit assertion that a `100_000` paid rental cannot be edited down to `90_000`.

- [ ] **Step 2: Run lifecycle tests and confirm current forced-payment behavior fails**

Run: `npx vitest run apps/api/src/routes/api.integration.test.js --maxWorkers=1 -t "unpaid rental lifecycle"`

Expected: FAIL because create defaults to paid and return requires settlement.

- [ ] **Step 3: Make rental creation unpaid and atomic**

Delete payment parsing from `createRental`. Persist:

```js
paymentStatus: 'BELUM_BAYAR',
paymentMethod: 'TUNAI',
paidAmount: 0,
finalTotal: total,
```

Keep customer upsert, item price snapshots, stock decrement, rental creation, and `RENTAL_CREATED` audit insertion in the same transaction.

- [ ] **Step 4: Protect edits against recorded payments**

Load `payments` and `charges` during edit. After calculating the new base total:

```js
const paidAmount = rental.payments.reduce((sum, row) => sum + row.amount, 0);
const chargeAmount = rental.charges.reduce((sum, row) => sum + row.amount, 0);
const nextInvoiceTotal = total + chargeAmount;
if (nextInvoiceTotal < paidAmount) {
  throw createHttpError(409, 'Total sewa tidak boleh lebih kecil dari pembayaran yang sudah diterima.');
}
```

Preserve all ledger rows and synchronize aggregate columns from `deriveRentalAccounting`.

- [ ] **Step 5: Replace forced settlement with an explicit late-fee charge**

Change `processReturnSchema` to:

```js
export const processReturnSchema = z.object({
  rentalId: z.string().trim().min(1),
  applyLateFee: z.boolean().optional().default(false),
  lateFeeAmount: z.coerce.number().int().min(0).optional(),
  returnNotes: z.string().trim().max(500).optional().default(''),
});
```

Inside the existing return claim transaction, calculate `lateDays`, `dailyRate = Math.round(rental.total / rental.duration)`, and `calculatedAmount = lateDays * dailyRate`. Create at most one `LATE_FEE` row with:

```js
{
  type: 'LATE_FEE',
  description: lateFeeAmount === calculatedAmount
    ? `Keterlambatan ${lateDays} hari x Rp ${dailyRate.toLocaleString('id-ID')}`
    : `Keterlambatan ${lateDays} hari (nominal disesuaikan kasir)`,
  quantity: lateDays,
  unitAmount: dailyRate,
  amount: lateFeeAmount,
  chargedAt: returnedAt,
}
```

Restore stock and mark `Returned` without creating a payment. Synchronize `additionalFee`, `finalTotal`, and payment aggregates from ledger rows.

- [ ] **Step 6: Pass actor identity into create and return routes**

Use `const actor = await ensureAuth()` and pass `actorUserId: actor.id` into both services so audit and charge actor relations are populated.

- [ ] **Step 7: Run lifecycle regression tests**

Run: `npx vitest run apps/api/src/routes/api.integration.test.js apps/api/src/validation/schemas.test.js --maxWorkers=1`

Expected: PASS for active stock decrement, unpaid return stock restoration, repeated return conflict safety, multi-day charge details, and post-return payment.

- [ ] **Step 8: Commit lifecycle decoupling**

```bash
git add apps/api/src/data/db.js apps/api/src/routes/api.js apps/api/src/validation/schemas.js apps/api/src/routes/api.integration.test.js apps/api/src/validation/schemas.test.js
git commit -m "feat: decouple rental lifecycle from payment"
```

### Task 5: Build One Canonical Receipt Model

**Files:**
- Create: `apps/web/src/lib/receiptViewModel.js`
- Create: `apps/web/src/lib/receiptViewModel.test.js`
- Modify: `apps/web/src/lib/receipt.js`
- Modify: `apps/web/src/lib/receipt.test.js`
- Modify: `apps/web/src/components/ReceiptModal.jsx`
- Modify: `apps/web/src/components/components.smoke.test.jsx`

**Interfaces:**
- Produces: `buildReceiptViewModel(rental) -> { itemRows, baseSubtotal, chargeRows, invoiceTotal, paymentStatus, paidAmount, remainingAmount, paymentMethod }`.
- Consumes: ledger-aware rental DTO; falls back to legacy `additionalFee` only when `charges` is absent or empty.
- Used by: modal preview, `buildReceiptWhatsAppText`, and `buildReceiptPrintHtml`.

- [ ] **Step 1: Write failing canonical-model and renderer tests**

```js
const model = buildReceiptViewModel({
  ...rental,
  total: 110_000,
  charges: [{ id: 'charge-1', description: 'Keterlambatan 2 hari x Rp 55.000', amount: 110_000 }],
  payment: { status: 'SEBAGIAN', method: 'QRIS', paidAmount: 50_000, remainingAmount: 170_000, totalDue: 220_000 },
});
expect(model).toMatchObject({ baseSubtotal: 110_000, invoiceTotal: 220_000, paidAmount: 50_000, remainingAmount: 170_000 });
expect(model.chargeRows[0].label).toBe('Keterlambatan 2 hari x Rp 55.000');

expect(buildReceiptWhatsAppText(rentalWithCharge)).toContain('Keterlambatan 2 hari x Rp 55.000');
expect(buildReceiptPrintHtml(rentalWithCharge)).toContain('Keterlambatan 2 hari x Rp 55.000');
```

- [ ] **Step 2: Run receipt tests and confirm fee-line failure**

Run: `npx vitest run apps/web/src/lib/receiptViewModel.test.js apps/web/src/lib/receipt.test.js --maxWorkers=1`

Expected: FAIL because the canonical builder does not exist and current output omits charges.

- [ ] **Step 3: Implement the canonical view model with legacy fallback**

```js
export function buildReceiptViewModel(rental = {}) {
  const itemRows = (rental.items || []).map((item) => ({
    id: item.id || `${item.name}-${item.qty}`,
    label: item.name || '-',
    quantity: Number(item.qty || 0),
    unitAmount: Number(item.price || 0),
    amount: Number(item.price || 0) * Number(item.qty || 0) * Math.max(1, Number(rental.duration || 1)),
  }));
  const sourceCharges = Array.isArray(rental.charges) && rental.charges.length > 0
    ? rental.charges
    : Number(rental.additionalFee || 0) > 0
      ? [{ id: 'legacy-additional-fee', description: 'Denda/biaya tambahan', amount: Number(rental.additionalFee) }]
      : [];
  const chargeRows = sourceCharges.map((charge) => ({
    id: charge.id,
    label: charge.description || 'Biaya tambahan',
    amount: Number(charge.amount || 0),
  }));
  const baseSubtotal = Number(rental.total || 0);
  const invoiceTotal = baseSubtotal + chargeRows.reduce((sum, row) => sum + row.amount, 0);
  const paidAmount = Number(rental.payment?.paidAmount || 0);
  return {
    itemRows, baseSubtotal, chargeRows, invoiceTotal, paidAmount,
    remainingAmount: Math.max(0, invoiceTotal - paidAmount),
    paymentStatus: rental.payment?.status || (paidAmount > 0 ? 'SEBAGIAN' : 'BELUM_BAYAR'),
    paymentMethod: rental.payment?.method || 'TUNAI',
  };
}
```

- [ ] **Step 4: Make all three receipt outputs consume the builder**

Remove independent total/payment calculations from `receipt.js` and `ReceiptModal.jsx`. Render item rows, `Subtotal Sewa`, each charge row, `TOTAL`, `Terbayar`, and `Sisa` in the same order. Continue escaping every user-controlled HTML value through the existing escape helper.

- [ ] **Step 5: Run receipt and component tests**

Run: `npx vitest run apps/web/src/lib/receiptViewModel.test.js apps/web/src/lib/receipt.test.js apps/web/src/components/components.smoke.test.jsx --maxWorkers=1`

Expected: PASS; preview, WhatsApp, and print expose identical invoice, paid, and balance values.

- [ ] **Step 6: Commit receipt unification**

```bash
git add apps/web/src/lib/receiptViewModel.js apps/web/src/lib/receiptViewModel.test.js apps/web/src/lib/receipt.js apps/web/src/lib/receipt.test.js apps/web/src/components/ReceiptModal.jsx apps/web/src/components/components.smoke.test.jsx
git commit -m "fix: itemize rental charges on every receipt"
```

### Task 6: Add the Reusable Payment Dialog and Scoped Cache Mutation

**Files:**
- Create: `apps/web/src/components/RentalPaymentModal.jsx`
- Create: `apps/web/src/components/RentalPaymentModal.test.jsx`
- Modify: `apps/web/src/lib/api.js:45-54,300-380`
- Modify: `apps/web/src/lib/api.test.js`
- Modify: `apps/web/src/lib/appCache.js`
- Modify: `apps/web/src/lib/appCache.test.js`
- Modify: `apps/web/src/App.jsx:1-40,470-590,790-850`
- Modify: `apps/web/src/App.test.jsx`

**Interfaces:**
- Produces frontend API: `recordRentalPayment(rentalId, payload) -> Promise<{ rental, payment }>`.
- Produces App handler: `handleRecordRentalPayment(rentalId, payload) -> Promise<{ rental, payment }>`.
- Produces component props: `RentalPaymentModal({ isOpen, rental, onClose, onSubmit })`.
- `onSubmit` receives `{ amount, method, paidAt, note, idempotencyKey }`.

- [ ] **Step 1: Write failing API and modal tests**

```jsx
render(<RentalPaymentModal isOpen rental={unpaidRental} onClose={vi.fn()} onSubmit={onSubmit} />);
expect(screen.getByText('Sisa tagihan')).toBeInTheDocument();
expect(screen.getByLabelText('Nominal pembayaran')).toHaveValue('100000');
await user.clear(screen.getByLabelText('Nominal pembayaran'));
await user.type(screen.getByLabelText('Nominal pembayaran'), '40000');
await user.selectOptions(screen.getByLabelText('Metode pembayaran'), 'QRIS');
await user.click(screen.getByRole('button', { name: 'Simpan Pembayaran' }));
expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amount: 40_000, method: 'QRIS' }));
```

Verify `recordRentalPayment('rental-1', payload)` sends `POST /api/rentals/rental-1/payments` with JSON body.

- [ ] **Step 2: Run focused frontend tests and confirm failures**

Run: `npx vitest run apps/web/src/components/RentalPaymentModal.test.jsx apps/web/src/lib/api.test.js --maxWorkers=1`

Expected: FAIL because the modal and API helper do not exist.

- [ ] **Step 3: Implement dialog validation and idempotency lifecycle**

Generate one `crypto.randomUUID()` when the dialog opens for a rental. Reuse it through retries; generate a new key only after a successful payment or when opening a different rental. Disable submit while pending. Reject empty, non-integer, zero, and above-balance amounts before calling the API.

```js
const payload = {
  amount: parsedAmount,
  method,
  paidAt: new Date(paidAt).toISOString(),
  note: note.trim(),
  idempotencyKey: idempotencyKeyRef.current,
};
```

- [ ] **Step 4: Add App payment mutation and scoped revalidation**

After the API succeeds, replace the matching rental in the `app/rentals` cache, then revalidate keys matched by `isRentalMutationKeyForScope` and `isFinancialMutationKeyForScope`. Do not clear unrelated tenants or branches.

```js
const handleRecordRentalPayment = useCallback(async (rentalId, payload) => {
  const result = await recordRentalPayment(rentalId, payload);
  await rentalQuery.mutate((rows = []) => rows.map((row) => (
    row.id === result.rental.id ? { ...row, ...result.rental } : row
  )), { revalidate: false });
  void mutateCache((key) => (
    isRentalMutationKeyForScope(key, currentUserId, activeTenantId, activeBranchId)
    || isFinancialMutationKeyForScope(key, currentUserId, activeTenantId, activeBranchId)
  ), undefined, { revalidate: true });
  return result;
}, [activeBranchId, activeTenantId, currentUserId, mutateCache, rentalQuery]);
```

- [ ] **Step 5: Run API, cache, modal, and App tests**

Run: `npx vitest run apps/web/src/lib/api.test.js apps/web/src/lib/appCache.test.js apps/web/src/components/RentalPaymentModal.test.jsx apps/web/src/App.test.jsx --maxWorkers=1`

Expected: PASS with no mutation outside the active operational scope.

- [ ] **Step 6: Commit frontend payment infrastructure**

```bash
git add apps/web/src/components/RentalPaymentModal.jsx apps/web/src/components/RentalPaymentModal.test.jsx apps/web/src/lib/api.js apps/web/src/lib/api.test.js apps/web/src/lib/appCache.js apps/web/src/lib/appCache.test.js apps/web/src/App.jsx apps/web/src/App.test.jsx
git commit -m "feat: add reusable rental payment flow"
```

### Task 7: Update Rental, History, and Return Workflows

**Files:**
- Modify: `apps/web/src/pages/Rental.jsx`
- Modify: `apps/web/src/pages/Rental.test.jsx`
- Modify: `apps/web/src/pages/History.jsx`
- Modify: `apps/web/src/pages/History.test.jsx`
- Modify: `apps/web/src/pages/Return.jsx`
- Modify: `apps/web/src/pages/Return.test.jsx`
- Modify: `apps/web/src/App.jsx:790-850`

**Interfaces:**
- `Rental` receives `onRecordPayment` in addition to `onCheckout`.
- `History` receives `onRecordPayment`.
- `Return` receives `onRecordPayment`.
- All pages use `RentalPaymentModal` and the ledger-backed nested `payment` DTO.

- [ ] **Step 1: Add failing user-flow tests**

Rental test:

```jsx
expect(screen.queryByLabelText('Status Pembayaran')).not.toBeInTheDocument();
await completeRentalAndConfirm(user);
expect(onCheckout).toHaveBeenCalledWith(expect.not.objectContaining({ payment: expect.anything() }));
expect(screen.getByRole('button', { name: 'Catat Pembayaran' })).toBeInTheDocument();
expect(screen.getByRole('button', { name: 'Kirim Nota Sewa' })).toBeInTheDocument();
```

History and Return tests assert `Catat Pembayaran` appears when `remainingAmount > 0`, including a returned rental. Return test submits without any settlement checkbox and expects `{ applyLateFee, lateFeeAmount, returnNotes }`.

- [ ] **Step 2: Run page tests and confirm current embedded-payment failures**

Run: `npx vitest run apps/web/src/pages/Rental.test.jsx apps/web/src/pages/History.test.jsx apps/web/src/pages/Return.test.jsx --maxWorkers=1`

Expected: FAIL because Rental still sends payment and Return still blocks unpaid rentals.

- [ ] **Step 3: Remove payment input and draft state from Rental**

Delete `INITIAL_PAYMENT`, payment state/errors/handlers, draft payment serialization, payment validation, payment form controls, and payment review rows. Keep the three mobile steps as `Data Penyewa`, `Pilih Barang`, and `Konfirmasi`. The checkout payload contains only customer, identity-card choice, items, and rental dates/duration.

- [ ] **Step 4: Replace the immediate receipt state with a success panel**

After `onCheckout`, store the returned rental and display:

```jsx
<p>Sewa aktif dan stok inventaris sudah diperbarui.</p>
<p>Total: {formatCurrency(createdRental.payment.totalDue)}</p>
<p>Terbayar: {formatCurrency(createdRental.payment.paidAmount)}</p>
<p>Sisa: {formatCurrency(createdRental.payment.remainingAmount)}</p>
```

Expose `Catat Pembayaran`, `Kirim Nota Sewa`, and `Selesai`. After payment succeeds, replace the success rental with `result.rental` before opening or sharing its receipt.

- [ ] **Step 5: Add payment status and action to History**

Show rental status separately from payment status. Use Indonesian labels `Belum Bayar`, `Sebagian`, and `Lunas`; retain receipt and edit actions. Open the reusable payment dialog whenever the balance is positive, regardless of Active/Returned status.

- [ ] **Step 6: Make Return independent from settlement and explain late fees**

Remove `settleRemainingPayment`, its checkbox, local block, and confirmation copy. Use the selected rental's policy metadata to show billable late days, daily rate, calculated fee, editable actual fee, final invoice, paid, and remaining balance. Submit:

```js
await onProcessReturn({
  rentalId: selectedRental.id,
  applyLateFee,
  ...(applyLateFee ? { lateFeeAmount: additionalFeeValue } : {}),
  returnNotes,
});
```

After a successful unpaid return, keep the returned rental in a completion panel and offer `Catat Pembayaran` and `Selesai`.

- [ ] **Step 7: Run page and App tests**

Run: `npx vitest run apps/web/src/pages/Rental.test.jsx apps/web/src/pages/History.test.jsx apps/web/src/pages/Return.test.jsx apps/web/src/App.test.jsx --maxWorkers=1`

Expected: PASS for unpaid confirmation, payment action, multi-day fee display, and unpaid return.

- [ ] **Step 8: Commit cashier workflow changes**

```bash
git add apps/web/src/pages/Rental.jsx apps/web/src/pages/Rental.test.jsx apps/web/src/pages/History.jsx apps/web/src/pages/History.test.jsx apps/web/src/pages/Return.jsx apps/web/src/pages/Return.test.jsx apps/web/src/App.jsx
git commit -m "feat: separate rental and payment workflows"
```

### Task 8: Align Financial Reporting With Payment Dates

**Files:**
- Modify: `apps/api/src/data/db.js:1350-1694`
- Modify: `apps/api/src/routes/api.integration.test.js`
- Modify: `apps/web/src/lib/financial.js`
- Modify: `apps/web/src/lib/financial.test.js`
- Modify: `apps/web/src/pages/FinancialRecap.jsx`
- Modify: `apps/web/src/pages/FinancialRecap.test.jsx`

**Interfaces:**
- Financial summary retains current response keys where possible.
- `invoiceRevenue` is based on rentals and charges in the rental period.
- `cashReceived` and payment method totals are based on `RentalPayment.paidAt` in the report period.
- `receivables` equals invoice total minus ledger payments for included rentals.

- [ ] **Step 1: Add a failing cross-month reporting test**

Create an August rental and a September payment, then assert:

```js
expect(august.body.data.summary.invoiceRevenue).toBe(100_000);
expect(august.body.data.summary.cashReceived).toBe(0);
expect(september.body.data.summary.cashReceived).toBe(40_000);
expect(september.body.data.summary.paymentMethods.QRIS).toBe(40_000);
```

Add a charge assertion proving invoice revenue includes late fees without counting them twice.

- [ ] **Step 2: Run financial tests and confirm rental-date cash attribution fails**

Run: `npx vitest run apps/api/src/routes/api.integration.test.js apps/web/src/lib/financial.test.js apps/web/src/pages/FinancialRecap.test.jsx --maxWorkers=1 -t "payment date"`

Expected: FAIL because current cash totals come from `Rental.paidAmount` filtered by rental date.

- [ ] **Step 3: Query ledger cash independently from invoice rows**

In `getFinancialRecapPage`, query `RentalPayment` by scoped `paidAt` range and sum by method. Continue querying rentals by rental date for invoice rows, include their charges/payments, and derive each row through `deriveRentalAccounting`.

```js
const cashReceived = periodPayments.reduce((sum, payment) => sum + payment.amount, 0);
const paymentMethods = periodPayments.reduce((totals, payment) => ({
  ...totals,
  [payment.method]: (totals[payment.method] || 0) + payment.amount,
}), { TUNAI: 0, QRIS: 0, BANK: 0 });
```

Keep net cash profit as `cashReceived - totalExpenses`.

- [ ] **Step 4: Update financial labels and export mapping**

Use the labels `Nilai Tagihan`, `Kas Diterima`, `Piutang`, and `Laba Kas Bersih`. Export payment-method totals from ledger cash, not invoice values. Preserve the current visual density and independent scrolling behavior.

- [ ] **Step 5: Run financial and integration tests**

Run: `npx vitest run apps/api/src/routes/api.integration.test.js apps/web/src/lib/financial.test.js apps/web/src/pages/FinancialRecap.test.jsx --maxWorkers=1`

Expected: PASS for cross-month payment, method totals, charges, receivables, and expenses.

- [ ] **Step 6: Commit reporting changes**

```bash
git add apps/api/src/data/db.js apps/api/src/routes/api.integration.test.js apps/web/src/lib/financial.js apps/web/src/lib/financial.test.js apps/web/src/pages/FinancialRecap.jsx apps/web/src/pages/FinancialRecap.test.jsx
git commit -m "fix: report cash from payment ledger dates"
```

### Task 9: Full Verification and VPS Migration Notes

**Files:**
- Modify: `docs/deployment-production-hardening.md`

**Interfaces:**
- Produces an operator checklist for backup, exact-SHA deploy, migration, health check, and smoke test.

- [ ] **Step 1: Document the release sequence**

The runbook must include: create a PostgreSQL dump; deploy an exact 40-character commit SHA; run `prisma generate` with `apps/api/.env`; run `prisma migrate deploy` from `apps/api`; restart API with updated environment; verify `/health`; verify one old paid rental, one new unpaid rental, one partial payment, one unpaid return, and one receipt with a late-fee line.

- [ ] **Step 2: Validate Prisma and migrations**

Run: `npm run prisma:generate --workspace @avia/api`

Expected: PASS.

Run: `npx prisma validate --schema apps/api/prisma/schema.prisma`

Expected: PASS.

- [ ] **Step 3: Run the complete automated suite**

Run: `npx vitest run --maxWorkers=1`

Expected: all tests PASS.

Run: `npm run lint`

Expected: both web and API lint PASS.

Run: `npm run build`

Expected: web production build and API build PASS.

- [ ] **Step 4: Review the final diff for release blockers**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only the intended runbook change remains before the final commit.

- [ ] **Step 5: Commit verification documentation**

```bash
git add docs/deployment-production-hardening.md
git commit -m "docs: add rental ledger release checks"
```

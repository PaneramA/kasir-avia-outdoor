# Rental Payment, Receipt, and Customer Pagination Design

## Status

Approved for implementation.

## Scope

This change fixes three connected production issues:

1. Return fees change the final receipt total without an explanatory line item.
2. Customer data stops at 100 records and the UI treats that partial result as the total.
3. Rental activation and payment are coupled, preventing a rental from being confirmed without payment and preventing an unpaid rental from being returned cleanly.

The calendar-based return page is intentionally deferred. The data produced by this work must be calendar-ready through stable planned-return dates and independent rental/payment statuses.

## Confirmed Product Rules

- Confirming a rental immediately makes it active and reduces inventory in the same database transaction.
- A rental does not require an initial payment.
- Payment state is independent from rental state.
- A customer may pay once or several times until the invoice is settled.
- Returning items is allowed while an invoice is unpaid or partially paid.
- A completed return immediately restores inventory even when money is still owed.
- Payments may be recorded after return.
- Overpayment is rejected. Refund and payment reversal flows are out of scope.
- Customer management uses server-side pages of 50 records.

## Existing Root Causes

### Receipt and Return Fee

The receipt total resolves to `finalTotal` when present, but the WhatsApp and print builders only render item rows and a total. They do not render `additionalFee`, so the number changes without an explanation. The return UI also defaults an overdue rental to one daily rate, regardless of how many billable days late it is.

### Customer Limit

`listCustomers` currently uses `take: 100` for the normal list and `take: 20` for search, then returns a plain array. The customer page displays `customers.length` as the total. There is no way to request the next records or obtain the real database count.

### Coupled Payment State

Payment data currently lives directly on `Rental` as `paymentStatus`, `paymentMethod`, and `paidAmount`. The return operation blocks an outstanding rental unless `settleRemainingPayment` is supplied, then forcefully changes the rental to paid in full. Financial reporting consequently attributes received cash to the rental date instead of the actual payment date.

## Chosen Architecture

Use an append-only payment ledger and explicit rental charge records. Keep existing aggregate columns on `Rental` during the transition for response compatibility and efficient reads, but update those columns only through centralized transaction services.

### RentalPayment

Each received payment is a separate record containing:

- `id`
- `rentalId`
- `tenantId`
- `branchId`
- `amount`
- `method` (`TUNAI`, `QRIS`, or `BANK`)
- `paidAt`
- optional `note`
- `idempotencyKey`, unique within a tenant
- optional `createdByUserId` (legacy backfill rows have no actor)
- `createdAt`

Payments are immutable in this scope. Editing, deleting, reversing, and refunding payments require a separate audited design.

### RentalCharge

Each charge outside the original rental items is a separate record containing:

- `id`
- `rentalId`
- `tenantId`
- `branchId`
- `type` (initially `LATE_FEE` or `LEGACY_ADDITIONAL_FEE`)
- human-readable `description`
- `quantity`, representing billable late days where applicable
- `unitAmount`
- `amount`
- `chargedAt`
- `createdByUserId`
- `createdAt`

The invoice total is the base rental total plus all active charges. The paid amount is the sum of payments. Payment status is derived as:

- `BELUM_BAYAR` when paid amount is zero and a balance remains.
- `SEBAGIAN` when paid amount is greater than zero but below the invoice total.
- `LUNAS` when paid amount equals the invoice total.

## Transaction Rules

### Confirm Rental

The rental form submits customer, rental dates, identity-card handling, and selected inventory only. The API creates the active rental, upserts the customer, snapshots item prices, and decrements stock atomically. It creates no payment unless a later, explicit payment request is made.

The response reports `BELUM_BAYAR`, paid amount zero, and the full invoice balance.

### Record Payment

A dedicated endpoint records payment against a rental. The service verifies tenant and branch ownership, a positive integer amount, an allowed method, a required idempotency key, and that the amount does not exceed the current balance. It creates the payment and refreshes the rental aggregate fields atomically. Repeating the same idempotency key returns the already-created result without recording cash twice.

Concurrent payment attempts must not overpay the invoice. The transaction uses PostgreSQL serializable isolation with bounded retry for serialization conflicts, or an equivalent atomic claim enforced by the final implementation.

Payments are allowed for active and returned rentals, but not soft-deleted rentals.

### Edit Active Rental

Existing active-rental editing remains available. A changed rental total must never become lower than the sum of recorded payments. If it would, the edit is rejected with an Indonesian explanation. Existing payment records are preserved.

### Process Return

Return processing no longer accepts or requires `settleRemainingPayment`. In one transaction it:

1. Claims the active rental for return.
2. Calculates and creates an optional late-fee charge.
3. Marks the rental returned and stores the return snapshot.
4. Restores every rented item to inventory.
5. Refreshes invoice and payment aggregates without inventing a payment.

The rental remains `BELUM_BAYAR` or `SEBAGIAN` when a balance remains.

## Late Fee Calculation

Billable late days use the tenant's existing rental-day policy. The default unit rate is the rental's total daily item rate. The UI shows:

- billable late days;
- rate per late day;
- calculated late fee;
- final invoice total.

The cashier may disable the fee or override the amount. An overridden amount must be stored as the actual charge while retaining the calculated late-day metadata and a description that makes the override visible on the receipt. A zero fee creates no charge.

## Receipt Design

A single receipt view-model builder feeds the modal preview, WhatsApp text, and print HTML. It contains:

- rental item rows and subtotals;
- base rental subtotal;
- every additional charge with description and amount;
- final invoice total;
- payment status;
- total paid;
- remaining balance.

For a late return, the receipt line reads in the form `Keterlambatan 2 hari x Rp 55.000`, followed by its subtotal. This prevents a total from changing without explanation.

## Customer Pagination

`GET /api/customers` accepts:

- `q`, optional server-side search;
- `page`, starting at 1;
- `limit`, defaulting to and capped at 50 for the management page.

It returns:

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 121,
    "totalPages": 3
  }
}
```

The database query applies tenant and branch scope, performs search before pagination, uses a stable `updatedAt DESC, id DESC` order, and fetches the result page and total count together.

The customer page uses an SWR key containing user, tenant, branch, search, page, and page size. Search is debounced and resets the page to 1. Previous page data remains visible during navigation to avoid flicker. Create, update, and delete operations revalidate the active query; deleting the final row on a later page moves to the previous valid page.

Rental customer autocomplete uses the same endpoint with a small first-page limit and searches the entire scoped database. It does not preload every customer.

## User Interface

### Rental Success

After confirmation, show that the rental is active and display total, paid amount, and remaining balance. Available actions are `Catat Pembayaran`, `Kirim Nota Sewa`, and `Selesai`.

### Payment Dialog

The dialog shows invoice total, paid amount, and balance. The amount defaults to the current balance but supports a smaller partial payment. Method selection uses `Tunai`, `QRIS`, and `Transfer Bank`; payment time defaults to now; note is optional.

### History

Show rental status and payment status separately. Transactions with a remaining balance expose `Catat Pembayaran`. Receipt actions remain available for active and returned rentals.

### Return

Remove the forced-settlement checkbox and unpaid-return block. Show the late-day calculation, latest invoice total, paid amount, and balance. After return, offer `Catat Pembayaran` without making it mandatory.

## Financial Reporting

- Invoice revenue is based on rental and charge amounts.
- Cash received is summed from `RentalPayment.paidAt`, not the rental creation date.
- Payment-method totals are based on payment records.
- Receivables use invoice total minus payments.
- Net cash profit remains cash received minus recorded expenses.

This keeps a September payment for an August rental in September cash flow while preserving the original August rental transaction.

## Migration and Compatibility

The schema migration adds payment and charge tables without deleting existing Rental or ReturnRecord columns.

Existing records are backfilled idempotently:

- A deterministic legacy payment is created for each rental with a previously recorded paid amount. Legacy `LUNAS` rentals whose stored paid amount is zero use the existing normalized invoice total.
- A deterministic legacy charge is created for each returned rental with `additionalFee > 0`.
- Deterministic IDs prevent duplicate backfill rows.

API responses retain the existing nested `payment` shape and add payment/charge details where needed, minimizing frontend breakage. Old aggregate columns remain synchronized during this release and can be removed only in a later migration after production verification.

## Error Handling and Security

- All new queries and writes require authenticated tenant and branch context.
- Payment and charge records store tenant and branch IDs for scoped querying and indexes.
- Non-positive payments, unsupported methods, overpayments, deleted rentals, cross-tenant access, and totals below already-paid amounts are rejected.
- Return processing and payment recording remain idempotent or conflict-safe under repeated clicks.
- Financial mutations trigger scoped SWR revalidation rather than global cache clearing.
- Audit logs record rental confirmation, payment creation, rental editing, and return charge creation without storing secrets.

## Test Strategy

Automated coverage includes:

- receipt WhatsApp, print, and preview all show late-fee detail and the same totals;
- two or more late days multiply the correct daily rate;
- 121 customers return pages of 50, 50, and 21 with the correct total;
- customer search finds a record outside the former first 100;
- confirming without payment activates the rental and decrements stock;
- multiple partial payments derive the correct status and balance;
- concurrent payments cannot exceed the invoice total;
- unpaid return restores stock and preserves the outstanding balance;
- payment after return is accepted and updates reports;
- active-rental edits cannot reduce the invoice below recorded payments;
- legacy migration preserves existing financial totals and is idempotent;
- full Vitest suite, lint, web build, API build, and Prisma migration validation pass.

## Delivery Order

1. Add failing regression and behavior tests.
2. Add schema migration and legacy backfill.
3. Implement payment and charge services and API routes.
4. Decouple rental creation and return from payment.
5. Add customer server pagination and SWR pagination UI.
6. Centralize receipt data and display charge details.
7. Update rental, history, return, and financial interfaces.
8. Run full verification and prepare the VPS migration runbook.

## Deferred Work

- Calendar-based return page with desktop month view and mobile agenda view.
- Payment correction, void, refund, and reversal workflows.
- Full invoice accounting and tax support.

# Financial Reporting V1 Design

## Goal

Build a simple, production-safe finance flow for the cashier app:

- Keep the existing rental revenue recap working.
- Add manual expense recording per tenant and branch.
- Show a clear profit/loss summary for a selected period.
- Improve the finance page UI so it matches the simpler rental, return, inventory, and customer layouts.
- Export finance reports in a format that is easier to read.

This V1 is not a full accounting system. Inventory purchases, asset depreciation, tax, payroll automation, and double-entry accounting are intentionally left for a later phase.

## Definitions

For V1, the app uses cash/business-friendly terms:

- `Omzet sewa`: total rental invoice value from `finalTotal` when available, otherwise `total`.
- `Uang diterima`: total paid amount from rentals. If a rental is paid in full, use the invoice value; if it is DP, use `paidAmount`.
- `Piutang`: invoice value minus paid amount, never below zero.
- `Pengeluaran`: manual expenses entered by the store, such as laundry, repair, packaging, fuel, admin fee, rent, salary, utility, marketing, and other operational costs.
- `Laba/rugi sederhana`: `uang diterima - pengeluaran`.

The report should label this as a simple cash-based profit/loss view, not a formal accrual accounting statement.

## Current State

The current finance page is `apps/web/src/pages/FinancialRecap.jsx`.

It fetches `GET /api/financial/recap` through SWR infinite pagination and shows:

- total revenue,
- transaction count,
- average transaction,
- payment methods,
- monthly trend,
- top items,
- transaction list,
- CSV and Excel export based on one mixed worksheet.

The backend calculates this in `getFinancialRecapSummary` and `getFinancialRecapPage` inside `apps/api/src/data/db.js`.

Current gaps:

- no expense data exists,
- no profit/loss calculation exists,
- revenue does not distinguish invoice total from cash received,
- export mixes sections into one sheet,
- page layout is useful but visually busier than the newer rental/inventory/customer direction.

## Data Model

Add an `Expense` model:

- `id`: cuid primary key.
- `tenantId`: required.
- `branchId`: required for V1.
- `createdByUserId`: nullable, references `User`.
- `date`: expense date.
- `category`: short text category.
- `description`: required short description.
- `amount`: integer IDR amount, minimum 0.
- `paymentMethod`: `TUNAI`, `QRIS`, `BANK`, or `LAINNYA`.
- `notes`: optional text.
- `deletedAt`: nullable soft-delete timestamp.
- `createdAt`, `updatedAt`.

Indexes:

- `[tenantId, branchId, date]`
- `[tenantId, branchId, deletedAt, date]`
- `[createdByUserId]`

Tenant deletion should cascade through the tenant relation. Branch deletion should cascade through the branch relation. User deletion should set `createdByUserId` to null.

## API

Reuse the existing tenant/branch request context and feature gate `canUseFinancialRecap`.

Endpoints:

- `GET /api/financial/recap`
  - Keeps the existing paginated rental response.
  - Summary adds `invoiceRevenue`, `cashReceived`, `receivables`, `totalExpenses`, `netProfit`, `profitMargin`, and `expenseCategories`.
  - Cursor pages still return `summary: null`, same as now.

- `GET /api/expenses`
  - Query: `startDate`, `endDate`, `q`, `cursor`, `limit`.
  - Returns `{ items, nextCursor, summary }`.
  - Summary includes total expense and category totals for the active period.

- `POST /api/expenses`
  - Creates one expense in the active tenant and branch.
  - Requires tenant manager role for V1, because expenses affect financial reporting.

- `PATCH /api/expenses/:id`
  - Updates category, description, amount, date, payment method, and notes.
  - Requires tenant manager role.

- `DELETE /api/expenses/:id`
  - Soft deletes the expense.
  - Requires tenant manager role.

Validation:

- category: 1-80 chars.
- description: 1-160 chars.
- amount: integer, 0 or above.
- date: valid datetime or date key converted to Jakarta date boundary.
- payment method: one of the accepted values.
- notes: max 500 chars.

## Backend Calculation

For each rental in the period:

```text
invoiceAmount = max(0, finalTotal ?? total ?? 0)
cashAmount =
  paymentStatus == "DP"
    ? clamp(paidAmount, 0, invoiceAmount)
    : invoiceAmount
receivableAmount = max(0, invoiceAmount - cashAmount)
```

For the period:

```text
invoiceRevenue = sum(invoiceAmount)
cashReceived = sum(cashAmount)
receivables = sum(receivableAmount)
totalExpenses = sum(expenses.amount)
netProfit = cashReceived - totalExpenses
profitMargin = cashReceived > 0 ? netProfit / cashReceived : 0
```

The existing `totalRevenue` field should remain for compatibility and match `invoiceRevenue`.

## Frontend UX

Keep the page simple and operational:

- One compact page header from the app shell remains the only page title.
- Finance content starts with one toolbar row:
  - period quick select,
  - start date,
  - end date,
  - reset button,
  - export button,
  - add expense button.
- KPI row:
  - Omzet sewa,
  - Uang diterima,
  - Piutang,
  - Pengeluaran,
  - Laba/rugi.
- Use a simple segmented control:
  - `Ringkasan`,
  - `Transaksi`,
  - `Pengeluaran`.
- Main content should not make the whole page feel like one long scroll. Tables use their own scroll area, similar to the customer page fix.
- Styling follows the current white/green, solid-color direction, with modest radius and clear borders.

Expense list behavior:

- Search by description/category/notes.
- Date and amount are always visible.
- Category is shown as a small badge.
- Edit and delete actions are available only to tenant managers.
- Delete uses soft-delete and asks for confirmation.

Expense form:

- Date.
- Category.
- Description.
- Amount.
- Payment method.
- Notes.

## State Management

Use SWR consistently:

- `APP_CACHE_KEYS.financialRecap(userId, tenantId, branchId, filters, cursor)`
- `APP_CACHE_KEYS.expenses(userId, tenantId, branchId, filters, cursor)`

After creating, editing, or deleting an expense:

- mutate expense keys for the same tenant/branch,
- mutate financial recap keys for the same tenant/branch,
- do not invalidate unrelated tenants or branches.

Keep infinite pagination page size capped at 100 on the API.

## Export

CSV:

- Export a clean transaction-detail CSV only.
- Columns: tanggal, transaksi, pelanggan, metode bayar, status bayar, omzet, dibayar, piutang.

Excel:

- Sheet `Ringkasan`: period, closing day, omzet, uang diterima, piutang, pengeluaran, laba/rugi, margin.
- Sheet `Transaksi`: one row per rental transaction.
- Sheet `Pengeluaran`: one row per expense.
- Sheet `Kategori Pengeluaran`: category totals.
- Sheet `Barang Terlaris`: top item recap.
- Sheet `Metode Bayar`: payment method recap.
- Sheet `Catatan`: explanation that V1 is simple cash-based reporting and does not include inventory purchases or asset depreciation.

## Testing

Backend:

- Migration applies cleanly.
- Expense CRUD respects tenant/branch scope.
- Cash received and receivable calculations handle `LUNAS` and `DP`.
- Deleted expenses are excluded from summaries.
- Cash-based profit/loss summary is correct.
- Non-manager users cannot mutate expenses.

Frontend:

- Finance page renders with empty data.
- Finance page renders recap and expense data.
- Add/edit/delete expense flows call the correct API helpers and mutate SWR.
- Export builders produce expected sheets/columns.
- Smoke tests continue to pass.

Verification:

- targeted Vitest for finance calculations and page,
- API integration test for expenses and recap,
- `npm run lint`,
- `npm run build`.

## Parallel Work Streams

The implementation can be split into these parallel-friendly streams after this design is approved:

1. Backend data and API.
2. Frontend finance page and expense form.
3. Export builder and tests.

Integration order:

1. Backend migration and endpoint contracts land first.
2. Frontend connects to the agreed contracts.
3. Export uses the same normalized finance data shape.
4. Full test/build runs after all streams are integrated.

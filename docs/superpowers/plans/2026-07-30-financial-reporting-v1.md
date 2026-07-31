# Financial Reporting V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add simple cash-based profit/loss reporting with manual expenses, a cleaner finance UI, and readable exports.

**Architecture:** Extend the existing `/api/financial/recap` endpoint so old consumers keep working while the summary gains cash, receivable, expense, and profit values. Add a new expense API scoped by tenant and branch, then update the React finance page to use SWR for both rentals and expenses. Keep export builders in the finance page until a later split is justified.

**Tech Stack:** Node.js, Prisma, PostgreSQL, Zod, React, SWR, Vite, Vitest, xlsx.

## Global Constraints

- V1 is not a full accounting system.
- Inventory purchases, asset depreciation, tax, payroll automation, and double-entry accounting are intentionally left for a later phase.
- `Laba/rugi sederhana` is `uang diterima - pengeluaran`.
- The report must label the result as a simple cash-based profit/loss view, not a formal accrual accounting statement.
- Expense mutation requires tenant manager role.
- Branch scope is required for V1 expense records.
- Existing `totalRevenue` remains available and matches `invoiceRevenue`.
- API pagination limit remains capped at 100.
- Use SWR keys scoped by user, tenant, branch, filters, and cursor.
- UI follows the current white/green, solid-color direction, modest radius, and clear borders.

---

### Task 1: Backend Expense Data And Financial Summary

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/0008_expenses/migration.sql`
- Modify: `apps/api/src/validation/schemas.js`
- Modify: `apps/api/src/data/db.js`
- Modify: `apps/api/src/routes/api.js`
- Test: `apps/api/src/routes/api.integration.test.js`

**Interfaces:**
- Produces: `listExpensesPage({ startDate, endDate, query, cursor, limit }, context)`
- Produces: `createExpense(payload, context, userId)`
- Produces: `updateExpense(id, payload, context)`
- Produces: `deleteExpense(id, context)`
- Produces: `expenseSchema`, `updateExpenseSchema`
- Updates: `getFinancialRecapPage()` summary fields `invoiceRevenue`, `cashReceived`, `receivables`, `totalExpenses`, `netProfit`, `profitMargin`, `expenseCategories`

- [ ] **Step 1: Write failing API integration tests**

Add tests near the existing financial recap tests in `apps/api/src/routes/api.integration.test.js`:

```js
it('calculates cash-based profit and expenses for the financial recap', async () => {
  const createdExpense = await callApi('POST', '/api/expenses', {
    token: ownerToken,
    tenantId,
    branchId,
    body: {
      date: '2026-07-30',
      category: 'Laundry',
      description: 'Cuci tenda',
      amount: 25000,
      paymentMethod: 'TUNAI',
      notes: 'Setelah sewa weekend',
    },
  });

  expect(createdExpense.status).toBe(201);
  expect(createdExpense.body.data).toMatchObject({
    category: 'Laundry',
    description: 'Cuci tenda',
    amount: 25000,
    paymentMethod: 'TUNAI',
  });

  const recap = await callApi('GET', '/api/financial/recap?startDate=2026-07-01&endDate=2026-07-31', {
    token: ownerToken,
    tenantId,
    branchId,
  });

  expect(recap.status).toBe(200);
  expect(recap.body.data.summary).toMatchObject({
    totalExpenses: 25000,
    netProfit: expect.any(Number),
    expenseCategories: [{ category: 'Laundry', amount: 25000, count: 1 }],
  });
  expect(recap.body.data.summary.cashReceived).toBeGreaterThanOrEqual(0);
  expect(recap.body.data.summary.invoiceRevenue).toBe(recap.body.data.summary.totalRevenue);
});

it('lists, updates, and soft deletes expenses inside tenant branch scope', async () => {
  const created = await callApi('POST', '/api/expenses', {
    token: ownerToken,
    tenantId,
    branchId,
    body: {
      date: '2026-07-30',
      category: 'Perbaikan',
      description: 'Ganti frame',
      amount: 50000,
      paymentMethod: 'BANK',
      notes: '',
    },
  });

  expect(created.status).toBe(201);

  const expenseId = created.body.data.id;
  const updated = await callApi('PATCH', `/api/expenses/${expenseId}`, {
    token: ownerToken,
    tenantId,
    branchId,
    body: {
      date: '2026-07-31',
      category: 'Repair',
      description: 'Ganti frame tenda',
      amount: 60000,
      paymentMethod: 'QRIS',
      notes: 'Naik karena sparepart',
    },
  });

  expect(updated.status).toBe(200);
  expect(updated.body.data).toMatchObject({
    id: expenseId,
    category: 'Repair',
    amount: 60000,
    paymentMethod: 'QRIS',
  });

  const listed = await callApi('GET', '/api/expenses?startDate=2026-07-01&endDate=2026-07-31&q=frame', {
    token: ownerToken,
    tenantId,
    branchId,
  });

  expect(listed.status).toBe(200);
  expect(listed.body.data.items.some((expense) => expense.id === expenseId)).toBe(true);

  const deleted = await callApi('DELETE', `/api/expenses/${expenseId}`, {
    token: ownerToken,
    tenantId,
    branchId,
  });

  expect(deleted.status).toBe(200);

  const afterDelete = await callApi('GET', '/api/expenses?startDate=2026-07-01&endDate=2026-07-31&q=frame', {
    token: ownerToken,
    tenantId,
    branchId,
  });

  expect(afterDelete.body.data.items.some((expense) => expense.id === expenseId)).toBe(false);
});

it('prevents cashiers from mutating expenses', async () => {
  const response = await callApi('POST', '/api/expenses', {
    token: cashierToken,
    tenantId,
    branchId,
    body: {
      date: '2026-07-30',
      category: 'Operasional',
      description: 'Tes kasir',
      amount: 10000,
      paymentMethod: 'TUNAI',
    },
  });

  expect(response.status).toBe(403);
});
```

- [ ] **Step 2: Run the targeted API test and verify it fails**

Run: `npx vitest run apps/api/src/routes/api.integration.test.js --maxWorkers=1`

Expected: FAIL because `/api/expenses` and expense summary fields do not exist yet.

- [ ] **Step 3: Add Prisma model and migration**

In `apps/api/prisma/schema.prisma`, add relations:

```prisma
model Tenant {
  expenses Expense[]
}

model Branch {
  expenses Expense[]
}

model User {
  createdExpenses Expense[] @relation("ExpenseCreatedByUser")
}
```

Add the model:

```prisma
model Expense {
  id              String   @id @default(cuid())
  tenantId        String
  branchId        String
  createdByUserId String?
  date            DateTime
  category        String
  description     String
  amount          Int
  paymentMethod   String   @default("TUNAI")
  notes           String?
  deletedAt       DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  tenant          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  branch          Branch   @relation(fields: [branchId], references: [id], onDelete: Cascade)
  createdBy       User?    @relation("ExpenseCreatedByUser", fields: [createdByUserId], references: [id], onDelete: SetNull)

  @@index([tenantId, branchId, date])
  @@index([tenantId, branchId, deletedAt, date])
  @@index([createdByUserId])
}
```

Create `apps/api/prisma/migrations/0008_expenses/migration.sql`:

```sql
CREATE TABLE IF NOT EXISTS "Expense" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "date" TIMESTAMP(3) NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "paymentMethod" TEXT NOT NULL DEFAULT 'TUNAI',
  "notes" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Expense_tenantId_branchId_date_idx" ON "Expense"("tenantId", "branchId", "date");
CREATE INDEX IF NOT EXISTS "Expense_tenantId_branchId_deletedAt_date_idx" ON "Expense"("tenantId", "branchId", "deletedAt", "date");
CREATE INDEX IF NOT EXISTS "Expense_createdByUserId_idx" ON "Expense"("createdByUserId");

ALTER TABLE "Expense"
ADD CONSTRAINT "Expense_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Expense"
ADD CONSTRAINT "Expense_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Expense"
ADD CONSTRAINT "Expense_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Add expense validation schemas**

In `apps/api/src/validation/schemas.js`, add:

```js
const expensePaymentMethodSchema = z.enum(['QRIS', 'BANK', 'TUNAI', 'LAINNYA']);

export const expenseSchema = z.object({
  date: z.string().trim().min(1),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(160),
  amount: z.coerce.number().int().min(0),
  paymentMethod: expensePaymentMethodSchema.default('TUNAI'),
  notes: z.string().trim().max(500).optional().default(''),
});

export const updateExpenseSchema = expenseSchema;
```

- [ ] **Step 5: Implement backend functions**

In `apps/api/src/data/db.js`, add DTO/calculation helpers:

```js
function getRentalInvoiceAmount(rental) {
  return Math.max(0, Number(rental?.finalTotal ?? rental?.total ?? 0) || 0);
}

function getRentalCashAmount(rental) {
  const invoiceAmount = getRentalInvoiceAmount(rental);
  if (String(rental?.paymentStatus || '').toUpperCase() === 'DP') {
    return Math.min(invoiceAmount, Math.max(0, Number(rental?.paidAmount || 0) || 0));
  }
  return invoiceAmount;
}

function toExpenseDto(expense) {
  return {
    id: expense.id,
    tenantId: expense.tenantId,
    branchId: expense.branchId,
    date: expense.date,
    category: expense.category,
    description: expense.description,
    amount: Number(expense.amount || 0),
    paymentMethod: expense.paymentMethod || 'TUNAI',
    notes: expense.notes || '',
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
  };
}
```

Update `getFinancialRecapSummary` to select `paymentStatus` and `paidAmount`, query expenses for the same period, and return:

```js
invoiceRevenue,
cashReceived,
receivables,
totalExpenses,
netProfit,
profitMargin,
expenseCategories,
totalRevenue: invoiceRevenue,
```

Add exported functions:

```js
export async function listExpensesPage({ startDate, endDate, query, cursor, limit = 50 } = {}, context) {}
export async function createExpense(payload, context, userId) {}
export async function updateExpense(id, payload, context) {}
export async function deleteExpense(id, context) {}
```

Each function must apply `withTenantBranchScope(..., context, { includeBranchNull: false })` and exclude `deletedAt`.

- [ ] **Step 6: Add routes**

In `apps/api/src/routes/api.js`, import the expense functions and schemas. Add routes:

```js
GET /api/expenses
POST /api/expenses
PATCH /api/expenses/:id
DELETE /api/expenses/:id
```

Use `ensureRequestContext` for read and `ensureTenantManagerContext` for create/update/delete. Read route must check `canUseFinancialRecap`.

- [ ] **Step 7: Run backend tests**

Run: `npx vitest run apps/api/src/routes/api.integration.test.js --maxWorkers=1`

Expected: PASS.

- [ ] **Step 8: Commit backend task**

Run:

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/0008_expenses/migration.sql apps/api/src/validation/schemas.js apps/api/src/data/db.js apps/api/src/routes/api.js apps/api/src/routes/api.integration.test.js
git commit -m "feat: add expense reporting backend"
```

---

### Task 2: Frontend API State And Finance Page UX

**Files:**
- Modify: `apps/web/src/lib/api.js`
- Modify: `apps/web/src/lib/appCache.js`
- Modify: `apps/web/src/pages/FinancialRecap.jsx`
- Test: `apps/web/src/pages/pages.smoke.test.jsx`
- Test: `apps/web/src/pages/FinancialRecap.test.jsx`

**Interfaces:**
- Consumes: `GET /api/financial/recap` summary fields from Task 1.
- Consumes: `GET /api/expenses`, `POST /api/expenses`, `PATCH /api/expenses/:id`, `DELETE /api/expenses/:id`.
- Produces: API helpers `fetchExpensesPage`, `createExpense`, `updateExpense`, `deleteExpense`.
- Produces: SWR cache key `APP_CACHE_KEYS.expenses(userId, tenantId, branchId, filters, cursor)`.

- [ ] **Step 1: Write failing frontend tests**

Create `apps/web/src/pages/FinancialRecap.test.jsx`:

```jsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import FinancialRecap from './FinancialRecap.jsx';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  fetchFinancialRecapPage: vi.fn(),
  fetchExpensesPage: vi.fn(),
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  deleteExpense: vi.fn(),
}));

const summary = {
  startDate: '2026-07-01',
  endDate: '2026-07-31',
  totalRevenue: 200000,
  invoiceRevenue: 200000,
  cashReceived: 150000,
  receivables: 50000,
  totalExpenses: 25000,
  netProfit: 125000,
  profitMargin: 0.8333,
  totalTransactions: 2,
  averageTransaction: 100000,
  methods: [],
  topItems: [],
  monthlyTrend: [],
  availableMonths: ['2026-07'],
  expenseCategories: [{ category: 'Laundry', amount: 25000, count: 1 }],
};

describe('FinancialRecap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchFinancialRecapPage.mockResolvedValue({ summary, items: [], nextCursor: null });
    api.fetchExpensesPage.mockResolvedValue({
      summary: { totalExpenses: 25000, categories: [{ category: 'Laundry', amount: 25000, count: 1 }] },
      items: [{
        id: 'expense-1',
        date: '2026-07-30T00:00:00.000Z',
        category: 'Laundry',
        description: 'Cuci tenda',
        amount: 25000,
        paymentMethod: 'TUNAI',
        notes: '',
      }],
      nextCursor: null,
    });
  });

  it('shows cash-based finance KPIs and expense tab', async () => {
    render(<FinancialRecap userId="user-1" tenantId="tenant-1" branchId="branch-1" tenantSettings={{ financialClosingDay: 31 }} canExportData />);

    expect(await screen.findByText('Omzet sewa')).toBeInTheDocument();
    expect(screen.getByText('Uang diterima')).toBeInTheDocument();
    expect(screen.getByText('Piutang')).toBeInTheDocument();
    expect(screen.getByText('Pengeluaran')).toBeInTheDocument();
    expect(screen.getByText('Laba/Rugi')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Pengeluaran/i }));

    expect(await screen.findByText('Cuci tenda')).toBeInTheDocument();
    expect(screen.getByText('Laundry')).toBeInTheDocument();
  });

  it('creates an expense and refreshes finance data', async () => {
    api.createExpense.mockResolvedValue({ id: 'expense-2' });
    const user = userEvent.setup();

    render(<FinancialRecap userId="user-1" tenantId="tenant-1" branchId="branch-1" tenantSettings={{ financialClosingDay: 31 }} canExportData />);

    await user.click(await screen.findByRole('button', { name: /Tambah Pengeluaran/i }));
    await user.type(screen.getByLabelText(/Kategori/i), 'Repair');
    await user.type(screen.getByLabelText(/Deskripsi/i), 'Ganti frame tenda');
    await user.clear(screen.getByLabelText(/Jumlah/i));
    await user.type(screen.getByLabelText(/Jumlah/i), '60000');
    await user.click(screen.getByRole('button', { name: /^Simpan$/i }));

    await waitFor(() => expect(api.createExpense).toHaveBeenCalledWith(expect.objectContaining({
      category: 'Repair',
      description: 'Ganti frame tenda',
      amount: 60000,
    })));
    await waitFor(() => expect(api.fetchExpensesPage).toHaveBeenCalledTimes(2));
  });
});
```

- [ ] **Step 2: Run frontend finance test and verify it fails**

Run: `npx vitest run apps/web/src/pages/FinancialRecap.test.jsx --maxWorkers=1`

Expected: FAIL because expense helpers and UI do not exist yet.

- [ ] **Step 3: Add frontend API helpers and cache key**

In `apps/web/src/lib/appCache.js`, add:

```js
expenses: (userId, tenantId, branchId, filters, cursor = '') => createBranchKey(
  'app/expenses',
  userId,
  tenantId,
  branchId,
  filters,
  normalizeCacheScopeValue(cursor),
),
```

In `apps/web/src/lib/api.js`, add:

```js
export function fetchExpensesPage({ startDate = '', endDate = '', query = '', cursor = '', limit = 50 } = {}) {}
export function createExpense(payload) {}
export function updateExpense(expenseId, payload) {}
export function deleteExpense(expenseId) {}
```

- [ ] **Step 4: Refactor finance page layout**

In `apps/web/src/pages/FinancialRecap.jsx`:

- Replace the repeated card title with a compact toolbar.
- Show KPI cards for `Omzet sewa`, `Uang diterima`, `Piutang`, `Pengeluaran`, and `Laba/Rugi`.
- Add segmented buttons `Ringkasan`, `Transaksi`, `Pengeluaran`.
- Use independent scroll containers for transaction and expense tables.
- Keep rounded corners modest with `rounded-md`.
- Keep colors solid white/green.

- [ ] **Step 5: Add expense list and form**

In `apps/web/src/pages/FinancialRecap.jsx`:

- Fetch expenses with `useSWRInfinite`.
- Search expenses by query.
- Add modal/form for create/edit.
- Add delete confirmation.
- After mutations, call `mutate` for matching financial recap and expenses keys.

- [ ] **Step 6: Run frontend tests**

Run:

```bash
npx vitest run apps/web/src/pages/FinancialRecap.test.jsx --maxWorkers=1
npx vitest run apps/web/src/pages/pages.smoke.test.jsx --maxWorkers=1
```

Expected: PASS.

- [ ] **Step 7: Commit frontend task**

Run:

```bash
git add apps/web/src/lib/api.js apps/web/src/lib/appCache.js apps/web/src/pages/FinancialRecap.jsx apps/web/src/pages/FinancialRecap.test.jsx apps/web/src/pages/pages.smoke.test.jsx
git commit -m "feat: refresh financial reporting UI"
```

---

### Task 3: Export Polish And Full Verification

**Files:**
- Modify: `apps/web/src/pages/FinancialRecap.jsx`
- Test: `apps/web/src/pages/FinancialRecap.test.jsx`

**Interfaces:**
- Consumes: normalized recap and expense data from Task 1 and Task 2.
- Produces: CSV transaction detail export.
- Produces: Excel workbook sheets `Ringkasan`, `Transaksi`, `Pengeluaran`, `Kategori Pengeluaran`, `Barang Terlaris`, `Metode Bayar`, and `Catatan`.

- [ ] **Step 1: Add failing export test**

Extend `apps/web/src/pages/FinancialRecap.test.jsx` with an export-focused test that spies on `xlsx.utils.book_append_sheet` and verifies the expected sheet names are appended.

- [ ] **Step 2: Run export test and verify it fails**

Run: `npx vitest run apps/web/src/pages/FinancialRecap.test.jsx --maxWorkers=1`

Expected: FAIL because the workbook still uses the old single-sheet export.

- [ ] **Step 3: Update export builders**

In `apps/web/src/pages/FinancialRecap.jsx`:

- CSV contains only transaction details.
- Excel creates the seven sheets listed above.
- `Catatan` sheet includes a short note that this is simple cash-based reporting and excludes inventory purchases/depreciation.

- [ ] **Step 4: Run export tests**

Run: `npx vitest run apps/web/src/pages/FinancialRecap.test.jsx --maxWorkers=1`

Expected: PASS.

- [ ] **Step 5: Run full verification**

Run:

```bash
npx vitest run apps/api/src/routes/api.integration.test.js --maxWorkers=1
npx vitest run apps/web/src/pages/FinancialRecap.test.jsx --maxWorkers=1
npx vitest run apps/web/src/pages/pages.smoke.test.jsx --maxWorkers=1
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit export and verification task**

Run:

```bash
git add apps/web/src/pages/FinancialRecap.jsx apps/web/src/pages/FinancialRecap.test.jsx
git commit -m "feat: export financial reports by sheet"
```

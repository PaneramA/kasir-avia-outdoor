# Customer Server Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hidden 100-customer cap with tenant-scoped server pagination of 50 records per page while keeping customer search and rental autocomplete fast and complete.

**Architecture:** `GET /api/customers` becomes a stable page contract backed by a scoped `findMany` plus `count` transaction. The customer management page stores search and page in its SWR key and keeps the previous page visible during navigation. Rental autocomplete uses the same endpoint with a small first page, so it searches the entire scoped database without loading every customer.

**Tech Stack:** Node.js 20+, Prisma 6.19, PostgreSQL 16, React 19, SWR 2, Vitest 4, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-08-rental-payment-receipt-customer-pagination-design.md`

## Global Constraints

- Customer management uses exactly 50 records per page.
- `page` starts at 1; invalid or missing values normalize to 1.
- `limit` defaults to 50 and is capped at 50; autocomplete requests 20.
- Search is applied before count and pagination across name, phone, address, and identity number.
- Every customer query remains scoped by authenticated `tenantId` and `branchId`.
- Ordering is stable: `updatedAt DESC`, then `id DESC`.
- The response shape is `{ items, pagination: { page, pageSize, totalItems, totalPages } }`.
- Search is debounced and resets the management page to page 1.
- SWR keeps the previous page visible during navigation to prevent flicker.
- Create, update, and delete revalidate the active scoped query; deletion from an invalid last page moves to the previous valid page.
- The rental autocomplete never preloads the full customer table.
- All user-facing labels and errors are written in Indonesian.

## File Map

- Modify `apps/api/src/data/db.js`: return a paginated customer contract and stable count.
- Modify `apps/api/src/routes/api.js`: parse `q`, `page`, and `limit`.
- Modify `apps/api/src/routes/api.integration.test.js`: cover 121 records, final page size, search beyond the former cap, and tenant/branch isolation.
- Modify `apps/web/src/lib/api.js`: request and normalize customer pages.
- Modify `apps/web/src/lib/api.test.js`: verify query-string and response normalization.
- Modify `apps/web/src/lib/appCache.js`: include query, page, and page size in customer keys.
- Modify `apps/web/src/lib/appCache.test.js`: prove customer keys are unique and scoped.
- Modify `apps/web/src/pages/Customers.jsx`: add page state, total metadata, navigation, and page-aware mutations.
- Modify `apps/web/src/pages/Customers.test.jsx`: verify 50-row paging, search reset, stable toolbar, and last-page deletion behavior.
- Modify `apps/web/src/pages/Rental.jsx`: consume autocomplete results from `page.items` with `limit = 20`.
- Modify `apps/web/src/pages/Rental.test.jsx`: verify autocomplete uses and renders paginated results.

---

### Task 1: Add the Paginated Customer API Contract

**Files:**
- Modify: `apps/api/src/data/db.js:4415-4455`
- Modify: `apps/api/src/routes/api.js:1021-1026`
- Modify: `apps/api/src/routes/api.integration.test.js`

**Interfaces:**
- Produces: `listCustomers({ query = '', page = 1, limit = 50 }, context) -> { items, pagination }`.
- `pagination = { page, pageSize, totalItems, totalPages }`.
- Produces: `GET /api/customers?q=<text>&page=<n>&limit=<n>`.

- [ ] **Step 1: Write a failing integration test with 121 customers**

Within an isolated tenant and branch fixture, insert 121 customers and assert:

```js
const first = await callApi('GET', '/api/customers?page=1&limit=50', { token, tenantId, branchId });
const second = await callApi('GET', '/api/customers?page=2&limit=50', { token, tenantId, branchId });
const third = await callApi('GET', '/api/customers?page=3&limit=50', { token, tenantId, branchId });

expect(first.body.data.items).toHaveLength(50);
expect(second.body.data.items).toHaveLength(50);
expect(third.body.data.items).toHaveLength(21);
expect(third.body.data.pagination).toEqual({
  page: 3,
  pageSize: 50,
  totalItems: 121,
  totalPages: 3,
});
```

Give the oldest fixture a unique name, search it by `q`, and assert it is returned even though it is outside the former first 100 records. Create another branch's matching customer and assert it is not returned.

- [ ] **Step 2: Run the focused API test and confirm the array-contract failure**

Run: `npx vitest run apps/api/src/routes/api.integration.test.js --maxWorkers=1 -t "customer pagination"`

Expected: FAIL because the endpoint currently returns a plain array capped at 100.

- [ ] **Step 3: Implement bounded pagination in `listCustomers`**

```js
export async function listCustomers({ query = '', page = 1, limit = 50 } = {}, context) {
  const keyword = String(query || '').trim();
  const normalizedPage = Math.max(1, Math.trunc(Number(page) || 1));
  const pageSize = Math.min(50, Math.max(1, Math.trunc(Number(limit) || 50)));
  const where = withTenantBranchScope(keyword ? {
    AND: [{ OR: [
      { name: { contains: keyword, mode: 'insensitive' } },
      { phone: { contains: keyword, mode: 'insensitive' } },
      { idNumber: { contains: keyword, mode: 'insensitive' } },
      { address: { contains: keyword, mode: 'insensitive' } },
    ] }],
  } : {}, context);

  const [customers, totalItems] = await prisma.$transaction([
    prisma.customer.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: (normalizedPage - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  return {
    items: customers.map(toCustomerDto),
    pagination: {
      page: normalizedPage,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    },
  };
}
```

- [ ] **Step 4: Parse route parameters without allowing oversized pages**

```js
const query = (searchParams.get('q') || '').trim();
const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
const limit = Math.min(50, Math.max(1, Number.parseInt(searchParams.get('limit') || '50', 10) || 50));
sendSuccess(res, 200, await listCustomers({ query, page, limit }, context));
```

- [ ] **Step 5: Run pagination and isolation tests**

Run: `npx vitest run apps/api/src/routes/api.integration.test.js --maxWorkers=1 -t "customer pagination"`

Expected: PASS with page sizes 50, 50, and 21; exact total 121; full-database search; and no cross-scope rows.

- [ ] **Step 6: Commit the backend page contract**

```bash
git add apps/api/src/data/db.js apps/api/src/routes/api.js apps/api/src/routes/api.integration.test.js
git commit -m "fix: paginate all scoped customer records"
```

### Task 2: Add Page-Aware Frontend API and SWR Keys

**Files:**
- Modify: `apps/web/src/lib/api.js:280-284`
- Modify: `apps/web/src/lib/api.test.js`
- Modify: `apps/web/src/lib/appCache.js:45-56`
- Modify: `apps/web/src/lib/appCache.test.js`

**Interfaces:**
- Produces: `fetchCustomers({ query = '', page = 1, limit = 50 }) -> Promise<CustomerPage>`.
- Produces: `APP_CACHE_KEYS.customers(userId, tenantId, branchId, query, page, pageSize)`.
- `CustomerPage = { items: Customer[], pagination: { page, pageSize, totalItems, totalPages } }`.

- [ ] **Step 1: Write failing API and cache-key tests**

```js
await fetchCustomers({ query: 'Fuad', page: 3, limit: 50 });
expect(fetch).toHaveBeenCalledWith(
  expect.stringContaining('/api/customers?q=Fuad&page=3&limit=50'),
  expect.anything(),
);

expect(APP_CACHE_KEYS.customers('u1', 't1', 'b1', 'fuad', 1, 50))
  .not.toEqual(APP_CACHE_KEYS.customers('u1', 't1', 'b1', 'fuad', 2, 50));
```

- [ ] **Step 2: Run focused library tests and confirm signature failures**

Run: `npx vitest run apps/web/src/lib/api.test.js apps/web/src/lib/appCache.test.js --maxWorkers=1`

Expected: FAIL because `fetchCustomers` accepts a string and cache keys omit page metadata.

- [ ] **Step 3: Implement the normalized page request**

```js
export function fetchCustomers({ query = '', page = 1, limit = 50 } = {}) {
  const params = new URLSearchParams();
  if (String(query).trim()) params.set('q', String(query).trim());
  params.set('page', String(page));
  params.set('limit', String(limit));
  return request(`/api/customers?${params.toString()}`, {}, { auth: true }).then((result) => ({
    items: Array.isArray(result?.items) ? result.items : [],
    pagination: {
      page: Number(result?.pagination?.page || page),
      pageSize: Number(result?.pagination?.pageSize || limit),
      totalItems: Number(result?.pagination?.totalItems || 0),
      totalPages: Number(result?.pagination?.totalPages || 0),
    },
  }));
}
```

Extend the cache key with normalized lowercase query, numeric page, and numeric page size.

- [ ] **Step 4: Run API and cache tests**

Run: `npx vitest run apps/web/src/lib/api.test.js apps/web/src/lib/appCache.test.js --maxWorkers=1`

Expected: PASS; keys remain isolated by user, tenant, branch, search, and page.

- [ ] **Step 5: Commit the client contract**

```bash
git add apps/web/src/lib/api.js apps/web/src/lib/api.test.js apps/web/src/lib/appCache.js apps/web/src/lib/appCache.test.js
git commit -m "refactor: add customer page API contract"
```

### Task 3: Paginate the Customer Management Page

**Files:**
- Modify: `apps/web/src/pages/Customers.jsx`
- Modify: `apps/web/src/pages/Customers.test.jsx`

**Interfaces:**
- Consumes: `fetchCustomers({ query, page, limit: 50 })`.
- Consumes: `CustomerPage` from Task 2.
- Produces: fixed 50-row management pages with previous/next controls and `Halaman X dari Y`.

- [ ] **Step 1: Replace array mocks with a failing page-contract test**

```jsx
swr.data = {
  items: customerRows,
  pagination: { page: 2, pageSize: 50, totalItems: 121, totalPages: 3 },
};
renderCustomers();
expect(screen.getByText('121')).toBeInTheDocument();
expect(screen.getByText('Halaman 2 dari 3')).toBeInTheDocument();
expect(screen.getByRole('button', { name: 'Sebelumnya' })).toBeEnabled();
expect(screen.getByRole('button', { name: 'Berikutnya' })).toBeEnabled();
```

Add a fake-timer test that changes search and verifies the requested page resets to 1 after the 300 ms debounce. Add a deletion test where page 3 contains one row and successful deletion requests page 2.

- [ ] **Step 2: Run the page test and confirm metadata/control failures**

Run: `npx vitest run apps/web/src/pages/Customers.test.jsx --maxWorkers=1`

Expected: FAIL because the page still treats SWR data as an array and has no navigation.

- [ ] **Step 3: Add page state and keep previous data visible**

```js
const PAGE_SIZE = 50;
const [page, setPage] = useState(1);

const customerQuery = useSWR(
  userId && tenantId && branchId
    ? APP_CACHE_KEYS.customers(userId, tenantId, branchId, debouncedQuery, page, PAGE_SIZE)
    : null,
  ([, , , , searchValue, requestedPage, pageSize]) => fetchCustomers({
    query: searchValue,
    page: requestedPage,
    limit: pageSize,
  }),
  { keepPreviousData: true },
);

const customers = customerQuery.data?.items || [];
const pagination = customerQuery.data?.pagination || {
  page, pageSize: PAGE_SIZE, totalItems: 0, totalPages: 0,
};
```

Set page to 1 whenever the typed search changes before starting the debounce timer.

- [ ] **Step 4: Make create, edit, and delete page-aware**

For edit, map `current.items` and preserve `current.pagination`. For create, await revalidation because ordering/search membership is server-owned. For delete, optimistically remove the row and decrement `totalItems`; if deleting the only row on a page above 1, call `setPage(page - 1)`, otherwise revalidate the same page.

```js
await customerQuery.mutate((current) => current ? ({
  ...current,
  items: current.items.filter((item) => item.id !== customer.id),
  pagination: {
    ...current.pagination,
    totalItems: Math.max(0, current.pagination.totalItems - 1),
  },
}) : current, { revalidate: false });
if (customers.length === 1 && page > 1) setPage((value) => value - 1);
else void customerQuery.mutate();
```

- [ ] **Step 5: Add compact pagination controls inside the table panel**

Keep the toolbar fixed and the table as the only scrolling region. Put pagination in a non-scrolling footer inside `customer-table-panel`, with `Sebelumnya`, `Halaman X dari Y`, and `Berikutnya`. Disable navigation during loading and at bounds.

- [ ] **Step 6: Run customer page tests**

Run: `npx vitest run apps/web/src/pages/Customers.test.jsx --maxWorkers=1`

Expected: PASS for total 121, independent table scroll, page navigation, search reset, and last-page deletion.

- [ ] **Step 7: Commit customer UI pagination**

```bash
git add apps/web/src/pages/Customers.jsx apps/web/src/pages/Customers.test.jsx
git commit -m "feat: paginate customer management by fifty"
```

### Task 4: Adapt Rental Customer Autocomplete

**Files:**
- Modify: `apps/web/src/pages/Rental.jsx:163-188`
- Modify: `apps/web/src/pages/Rental.test.jsx`

**Interfaces:**
- Consumes: `fetchCustomers({ query, page: 1, limit: 20 })`.
- Consumes: `APP_CACHE_KEYS.customers(..., query, 1, 20)`.
- Produces: suggestions from `customerSuggestionQuery.data.items`.

- [ ] **Step 1: Add a failing paginated-autocomplete test**

Mock SWR with:

```js
{
  items: [{ id: 'customer-121', name: 'Customer Lama', phone: '0812000121' }],
  pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
}
```

Type at least two characters and assert `Customer Lama` appears and can still autofill all customer fields.

- [ ] **Step 2: Run the Rental test and confirm suggestions are empty**

Run: `npx vitest run apps/web/src/pages/Rental.test.jsx --maxWorkers=1 -t "customer autocomplete"`

Expected: FAIL because Rental expects SWR data to be an array.

- [ ] **Step 3: Update the SWR key, fetcher, and result selection**

```js
const customerSuggestionQuery = useSWR(
  currentUser?.id && tenantId && branchId && debouncedCustomerSearch.length >= 2
    ? APP_CACHE_KEYS.customers(currentUser.id, tenantId, branchId, debouncedCustomerSearch, 1, 20)
    : null,
  ([, , , , keyword, requestedPage, pageSize]) => fetchCustomers({
    query: keyword,
    page: requestedPage,
    limit: pageSize,
  }),
);

const customerSuggestions = hasFreshCustomerLookup
  ? customerSuggestionQuery.data?.items || []
  : [];
```

Keep the existing stale-dropdown protection when the input is cleared or a suggestion is selected.

- [ ] **Step 4: Run Rental and customer tests**

Run: `npx vitest run apps/web/src/pages/Rental.test.jsx apps/web/src/pages/Customers.test.jsx --maxWorkers=1`

Expected: PASS; autocomplete searches server data without preloading all customers.

- [ ] **Step 5: Commit autocomplete compatibility**

```bash
git add apps/web/src/pages/Rental.jsx apps/web/src/pages/Rental.test.jsx
git commit -m "fix: search all customers from rental autocomplete"
```

### Task 5: Full Pagination Verification

**Files:**
- No production files unless a verification failure identifies a scoped regression.

**Interfaces:**
- Verifies the final API contract and user workflow end to end.

- [ ] **Step 1: Run all customer-related tests**

Run: `npx vitest run apps/api/src/routes/api.integration.test.js apps/web/src/lib/api.test.js apps/web/src/lib/appCache.test.js apps/web/src/pages/Customers.test.jsx apps/web/src/pages/Rental.test.jsx --maxWorkers=1`

Expected: PASS.

- [ ] **Step 2: Run the complete automated suite**

Run: `npx vitest run --maxWorkers=1`

Expected: all tests PASS.

- [ ] **Step 3: Run static and production checks**

Run: `npm run lint`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 4: Confirm the working tree contains only intentional changes**

Run: `git status --short`

Expected: no uncommitted generated files or unrelated changes. If verification exposes a regression, return to the task that owns that behavior, add a failing regression test there, implement the focused fix, and rerun this verification task before committing.

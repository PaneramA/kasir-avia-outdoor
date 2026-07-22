# Inventory Archival and Stock Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve rental history when items leave inventory and make stock transitions safe under duplicate or concurrent requests.

**Architecture:** A nullable `Item.archivedAt` controls visibility without breaking the `RentalItem -> Item` relation. Archive/restore and all stock state transitions run in Prisma transactions; conditional updates claim each one-way transition before changing stock.

**Tech Stack:** Node.js 20, Prisma 6, PostgreSQL, Vitest 4, React 19, SWR 2.

## Global Constraints

- Keep transaction history immutable and queryable.
- Do not edit previously deployed migration files.
- Start every behavior change with a failing test.
- Keep the current UI structure; only add archive status controls and copy.
- Do not rewrite unrelated sections of `apps/api/src/data/db.js` or `apps/api/src/routes/api.js`.

---

### Task 1: Add the item lifecycle field

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/0007_item_archival/migration.sql`
- Test: `apps/api/src/routes/api.integration.test.js`

**Interfaces:**
- Produces: `Item.archivedAt: Date | null` and indexed active-item queries.

- [ ] **Step 1: Write a failing database-backed test**

Add an item with `archivedAt`, then assert Prisma can retrieve it:

```js
const archivedAt = new Date('2026-07-22T00:00:00.000Z');
const archived = await prisma.item.create({
  data: { name: 'Arsip Test', categoryId, tenantId, branchId, stock: 1, price: 1000, archivedAt },
});
expect(archived.archivedAt).toEqual(archivedAt);
```

- [ ] **Step 2: Run the focused test and observe the missing-field failure**

Run: `npx vitest run apps/api/src/routes/api.integration.test.js --maxWorkers=1`

Expected: FAIL because the generated Prisma client does not know `archivedAt`.

- [ ] **Step 3: Add schema and append-only migration**

Add to `model Item`:

```prisma
archivedAt DateTime?

@@index([tenantId, branchId, archivedAt, createdAt])
```

Create migration SQL:

```sql
ALTER TABLE "public"."Item" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Item_tenantId_branchId_archivedAt_createdAt_idx"
ON "public"."Item"("tenantId", "branchId", "archivedAt", "createdAt");
```

- [ ] **Step 4: Generate and validate Prisma**

Run: `npm run prisma:generate --workspace @avia/api`

Run: `npx prisma validate --schema apps/api/prisma/schema.prisma`

Expected: both commands exit 0.

- [ ] **Step 5: Run the focused test and commit**

Run: `npx vitest run apps/api/src/routes/api.integration.test.js --maxWorkers=1`

Expected: PASS.

Commit: `feat: add inventory item archival state`

---

### Task 2: Archive and restore without deleting history

**Files:**
- Modify: `apps/api/src/data/db.js`
- Modify: `apps/api/src/routes/api.js`
- Modify: `apps/web/src/lib/api.js`
- Test: `apps/api/src/routes/api.integration.test.js`
- Test: `apps/web/src/lib/api.test.js`

**Interfaces:**
- Produces: `archiveItem(id, context)`, `restoreItem(id, context)`, `listItemsPage({ query, cursor, limit, status }, context)`.
- Context requires: `{ tenantId, branchId, actorUserId }` for archive/restore audit entries.

- [ ] **Step 1: Write failing archive route tests**

Create a rental, archive its item, and assert history remains while active inventory excludes it:

```js
const archived = await callApi('DELETE', `/api/items/${itemId}`, { token: ownerToken, tenantId, branchId });
expect(archived.status).toBe(200);
expect(archived.body.data.archivedAt).toBeTruthy();
expect(await prisma.rentalItem.count({ where: { itemId } })).toBe(1);

const active = await callApi('GET', '/api/items', { token: ownerToken, tenantId, branchId });
expect(active.body.data.some((item) => item.id === itemId)).toBe(false);

const restored = await callApi('POST', `/api/items/${itemId}/restore`, { token: ownerToken, tenantId, branchId });
expect(restored.status).toBe(200);
expect(restored.body.data.archivedAt).toBeNull();
```

- [ ] **Step 2: Run the test and verify current destructive behavior fails it**

Run: `npx vitest run apps/api/src/routes/api.integration.test.js --maxWorkers=1`

Expected: FAIL because deletion removes `RentalItem`/`Item` and restore does not exist.

- [ ] **Step 3: Implement scoped archive visibility**

Use this visibility mapping in both item list functions:

```js
function itemArchiveWhere(status = 'active') {
  if (status === 'archived') return { archivedAt: { not: null } };
  if (status === 'all') return {};
  return { archivedAt: null };
}
```

Replace physical deletion with transactional archive and audit:

```js
export async function archiveItem(id, context) {
  const existing = await requireScopedItem(id, context);
  if (existing.archivedAt) return toItemDto(existing);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.item.update({
      where: { id: existing.id },
      data: { archivedAt: new Date() },
      include: { category: true },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: context.actorUserId,
        tenantId: context.tenantId,
        branchId: context.branchId,
        action: 'item.archive', targetType: 'item', targetId: existing.id,
        snapshotBefore: toItemDto(existing),
      },
    });
    return toItemDto(updated);
  });
}
```

Implement `restoreItem` identically with `archivedAt: null` and action `item.restore`. Update `toItemDto` to return `archivedAt` as ISO text or null.

- [ ] **Step 4: Wire routes and browser API**

For `DELETE /api/items/:id`, pass `{ ...context, actorUserId: user.id }` to `archiveItem`. Add `POST /api/items/:id/restore`. Pass `status` from `/api/items/page` to `listItemsPage`.

Add frontend functions:

```js
export function restoreItem(id) {
  return request(`/api/items/${encodeURIComponent(id)}/restore`, { method: 'POST' }, { auth: true });
}

export function fetchItemsPage({ query = '', cursor = '', limit = 50, status = 'active' } = {}) {
  const params = new URLSearchParams({ limit: String(limit), status });
  if (query) params.set('query', query);
  if (cursor) params.set('cursor', cursor);
  return request(`/api/items/page?${params}`, {}, { auth: true });
}
```

- [ ] **Step 5: Run route/API tests and commit**

Run: `npx vitest run apps/api/src/routes/api.integration.test.js apps/web/src/lib/api.test.js --maxWorkers=1`

Expected: PASS.

Commit: `feat: archive and restore inventory items`

---

### Task 3: Add minimal archive controls to inventory

**Files:**
- Modify: `apps/web/src/lib/appCache.js`
- Modify: `apps/web/src/pages/Inventory.jsx`
- Modify: `apps/web/src/App.jsx`
- Test: `apps/web/src/lib/appCache.test.js`
- Test: `apps/web/src/pages/pages.smoke.test.jsx`

**Interfaces:**
- Consumes: item page `status` and `restoreItem(id)` from Task 2.
- Produces: status-scoped SWR key and archive/restore controls.

- [ ] **Step 1: Write failing cache and page tests**

```js
expect(APP_CACHE_KEYS.inventoryPage('t1', 'b1', '', '', 'active')).not.toEqual(
  APP_CACHE_KEYS.inventoryPage('t1', 'b1', '', '', 'archived'),
);
```

Render `Inventory` with an archived item and assert the action text is `Pulihkan`, while active items use `Arsipkan`.

- [ ] **Step 2: Run focused frontend tests**

Run: `npx vitest run apps/web/src/lib/appCache.test.js apps/web/src/pages/pages.smoke.test.jsx --maxWorkers=1`

Expected: FAIL because status is absent from the key/UI.

- [ ] **Step 3: Implement status-scoped pagination and actions**

Use this key signature:

```js
inventoryPage: (tenantId, branchId, query = '', cursor = '', status = 'active') =>
  ['app/inventory-page', tenantId, branchId, query, cursor, status],
```

Add an `active|archived` selector, pass status to `fetchItemsPage`, change confirmation copy to `Arsipkan barang ini?`, and call `onRestoreItem` for archived rows. Reset pagination to page 1 when status changes.

- [ ] **Step 4: Revalidate only item and dashboard keys after mutation**

In `App.jsx`, archive/restore optimistically remove the item from the current status list, then call one predicate mutation for keys whose first element is `app/items`, `app/inventory-page`, or `app/dashboard`.

- [ ] **Step 5: Run frontend tests/build and commit**

Run: `npx vitest run apps/web/src/lib/appCache.test.js apps/web/src/pages/pages.smoke.test.jsx --maxWorkers=1`

Run: `npm run build:web`

Expected: PASS and build exits 0.

Commit: `feat: manage archived inventory items`

---

### Task 4: Make checkout and rental deletion one-way transitions

**Files:**
- Modify: `apps/api/src/data/db.js`
- Test: `apps/api/src/routes/api.integration.test.js`

**Interfaces:**
- Consumes: `Item.archivedAt` from Task 1.
- Produces: atomic checkout and exactly-once stock restoration.

- [ ] **Step 1: Write failing concurrency tests**

Issue two matching delete requests with `Promise.allSettled`, then assert:

```js
expect(results.filter((result) => result.value?.status === 200)).toHaveLength(1);
expect(await prisma.item.findUnique({ where: { id: itemId } })).toMatchObject({ stock: initialStock });
expect(await prisma.auditLog.count({ where: { action: 'rental.delete', targetId: rentalId } })).toBe(1);
```

Also put an item in a cart, archive it, submit checkout, and expect `409` with unchanged stock and no rental.

Issue two return requests for the same active rental and assert one return record exists, stock is restored once, and both responses leave the rental in `Returned` state.

- [ ] **Step 2: Run the focused integration test**

Run: `npx vitest run apps/api/src/routes/api.integration.test.js --maxWorkers=1`

Expected: at least the archived checkout or duplicate delete assertion fails.

- [ ] **Step 3: Harden checkout conditional decrement**

Change the stock claim condition to:

```js
where: {
  id: item.id,
  tenantId,
  branchId,
  archivedAt: null,
  stock: { gte: request.qty },
}
```

If count is zero, re-read the item and throw `Item is archived` or `Insufficient stock` without creating the rental.

- [ ] **Step 4: Claim rental deletion before restoring stock**

Inside the existing transaction, run this before the stock loop:

```js
const claim = await tx.rental.updateMany({
  where: { id: rental.id, tenantId, branchId, deletedAt: null },
  data: { deletedAt: new Date(), deletedByUserId: actorId, deleteReason },
});
if (claim.count !== 1) throw new Error('Rental already deleted');
```

Then restore stock, create one audit record, and retrieve the claimed rental. Do not call a second unconditional rental update.

- [ ] **Step 5: Verify all transaction tests and commit**

Run: `npx vitest run apps/api/src/routes/api.integration.test.js --maxWorkers=1`

Expected: PASS with final stock restored exactly once.

Commit: `fix: make rental stock transitions atomic`

---

### Task 5: Prevent inventory edits from overwriting concurrent stock

**Files:**
- Modify: `apps/api/src/validation/schemas.js`
- Modify: `apps/api/src/data/db.js`
- Modify: `apps/web/src/components/ItemModal.jsx`
- Modify: `apps/web/src/App.jsx`
- Test: `apps/api/src/routes/api.integration.test.js`
- Test: `apps/api/src/validation/schemas.test.js`

**Interfaces:**
- Produces: `updateItemSchema.expectedUpdatedAt` as an ISO datetime and conflict response when the item changed after the editor opened.

- [ ] **Step 1: Write a failing stale-edit test**

Read an item and retain `updatedAt`, complete a checkout that changes its stock, then submit a PATCH using the retained timestamp:

```js
expect(staleUpdate.status).toBe(409);
expect(staleUpdate.body.message).toContain('changed');
expect((await prisma.item.findUnique({ where: { id: itemId } })).stock).toBe(stockAfterCheckout);
```

- [ ] **Step 2: Run schema and integration tests**

Run: `npx vitest run apps/api/src/validation/schemas.test.js apps/api/src/routes/api.integration.test.js --maxWorkers=1`

Expected: FAIL because PATCH currently overwrites stock without a version precondition.

- [ ] **Step 3: Add optimistic version input**

Extend `updateItemSchema`:

```js
expectedUpdatedAt: z.iso.datetime(),
```

Include `updatedAt` in `toItemDto`. `ItemModal` keeps the original value and `App.jsx` sends it unchanged with edits.

- [ ] **Step 4: Claim the update by timestamp**

Replace unconditional update with:

```js
const result = await prisma.item.updateMany({
  where: { id: targetId, tenantId, branchId, updatedAt: new Date(payload.expectedUpdatedAt), archivedAt: null },
  data: { name, categoryId: category.id, stock, price, image: payload.image || '' },
});
if (result.count !== 1) {
  const error = new Error('Item changed after this form was opened');
  error.statusCode = 409;
  throw error;
}
```

Read and return the updated item with category after the successful claim.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run apps/api/src/validation/schemas.test.js apps/api/src/routes/api.integration.test.js --maxWorkers=1`

Expected: PASS.

Commit: `fix: reject stale inventory stock edits`

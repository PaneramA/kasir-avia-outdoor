# Rental Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the cashier rental page into a solid white-green transaction workspace with renter details as the main panel and a text-only inventory picker with `- / +` quantity controls.

**Architecture:** Keep all behavior inside the existing `Rental.jsx` flow. Reuse the current `inventory`, `filteredItems`, `cart`, `cartQtyByItemId`, validation, review modal, receipt modal, and SWR customer lookup. Replace image-based inventory rendering and view-mode state with one text-list renderer and a local quantity stepper.

**Tech Stack:** React, Vite, Tailwind CSS utility classes, SWR, Vitest, Testing Library.

## Global Constraints

- Do not change backend APIs, inventory storage, checkout payload shape, or rental business logic.
- Do not render inventory images, placeholders, thumbnails, or image containers in the rental page.
- Keep customer lookup through SWR-backed `fetchCustomers`.
- Keep inventory search and category filtering.
- Keep cart quantity updates with stock limits.
- Keep rental time range, duration calculation, payment validation, final review modal, receipt modal, and draft restore.
- Keep the mobile step flow: renter data, item selection, confirmation.
- Use solid colors only. Avoid transparent panels, glass effects, blurred backgrounds, and floating-card effects.
- Use small radii, ideally `4px` to `8px`.
- White remains the dominant background and panel color. Green is the accent for primary actions, selected states, focus borders, and small status elements.
- Scope the white-green styling to the rental page in this phase. Do not redesign the global app theme.

---

## File Structure

- Modify: `apps/web/src/pages/Rental.jsx`
  - Remove rental inventory view-mode import/state/persistence from the page.
  - Replace `renderInventoryGridItem` and image-based `renderInventoryListItem` with a text-only row renderer.
  - Add a small local quantity stepper renderer or component inside the file.
  - Reorder desktop layout so the renter/payment/cart workspace is the left primary panel and the item list is the right secondary panel.
  - Replace transparent/shadow-heavy rental page styling with solid white-green classes.

- Modify: `apps/web/src/pages/pages.smoke.test.jsx`
  - Keep the existing smoke test passing if the rendered page copy or required props change.

- Create or modify: `apps/web/src/pages/Rental.test.jsx`
  - Add behavioral tests for text-only inventory rows, search filtering, and `- / +` cart changes.
  - If a `Rental.test.jsx` file already exists when implementing, extend it instead of creating a duplicate test file.

---

### Task 1: Add Tests for Text-Only Inventory Selection

**Files:**
- Create or modify: `apps/web/src/pages/Rental.test.jsx`
- Read: `apps/web/src/pages/Rental.jsx`
- Read: `apps/web/src/pages/pages.smoke.test.jsx`

**Interfaces:**
- Consumes: Existing `Rental` props:
  - `inventory: Array<{ id: string, name: string, category: string, stock: number, price: number, image?: string }>`
  - `categories: string[]`
  - `cart: Array<{ id: string, name: string, category: string, stock: number, price: number, qty: number, notes?: string }>`
  - `setCart: React.Dispatch`
  - `onCheckout: Function`
  - `currentUser: object`
  - `tenantSettings: object | null`
- Produces: Regression coverage proving rental item rows do not render images and can update cart quantities.

- [ ] **Step 1: Write test setup helpers**

Add this helper shape to `apps/web/src/pages/Rental.test.jsx`:

```jsx
// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Rental from './Rental.jsx';

vi.mock('../lib/api', () => ({
  fetchCustomers: vi.fn().mockResolvedValue([]),
}));

const inventory = [
  {
    id: 'item-1',
    name: 'Tenda Dome 4p',
    category: 'Tenda',
    stock: 2,
    price: 55000,
    image: 'https://example.invalid/tenda.jpg',
  },
  {
    id: 'item-2',
    name: 'Kompor Portable',
    category: 'Alat Masak',
    stock: 0,
    price: 15000,
    image: 'https://example.invalid/kompor.jpg',
  },
];

function RentalHarness() {
  const [cart, setCart] = useState([]);
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <Rental
        inventory={inventory}
        categories={['Tenda', 'Alat Masak']}
        cart={cart}
        setCart={setCart}
        onCheckout={vi.fn()}
        currentUser={{ username: 'kasir', role: 'kasir' }}
        tenantSettings={null}
      />
    </SWRConfig>
  );
}

function renderRental() {
  return render(<RentalHarness />);
}
```

- [ ] **Step 2: Write failing text-only rendering test**

Add this test:

```jsx
it('renders inventory as text rows without item images', () => {
  renderRental();

  expect(screen.getByText('Tenda Dome 4p')).toBeInTheDocument();
  expect(screen.getByText('Alat Masak')).toBeInTheDocument();
  expect(screen.getByText(/Rp 55.000/i)).toBeInTheDocument();
  expect(screen.queryByAltText('Tenda Dome 4p')).not.toBeInTheDocument();
  expect(document.querySelector('img[src="https://example.invalid/tenda.jpg"]')).toBeNull();
});
```

- [ ] **Step 3: Write failing search filtering test**

Add this test:

```jsx
it('filters the text item list by search keyword', () => {
  renderRental();

  fireEvent.change(screen.getByPlaceholderText(/cari barang atau kategori/i), {
    target: { value: 'kompor' },
  });

  expect(screen.getByText('Kompor Portable')).toBeInTheDocument();
  expect(screen.queryByText('Tenda Dome 4p')).not.toBeInTheDocument();
});
```

- [ ] **Step 4: Write failing quantity stepper test**

Add this test:

```jsx
it('adds and removes item quantities from the inventory row stepper', () => {
  renderRental();

  const row = screen.getByTestId('rental-inventory-row-item-1');
  fireEvent.click(within(row).getByRole('button', { name: /tambah tenda dome 4p/i }));
  expect(within(row).getByText('1')).toBeInTheDocument();
  expect(screen.getByText(/Tenda Dome 4p/i)).toBeInTheDocument();

  fireEvent.click(within(row).getByRole('button', { name: /kurangi tenda dome 4p/i }));
  expect(within(row).getByText('0')).toBeInTheDocument();
});
```

- [ ] **Step 5: Run tests and verify they fail for the expected reason**

Run:

```bash
npm exec vitest run apps/web/src/pages/Rental.test.jsx
```

Expected: tests fail because the current page still renders images and does not expose `data-testid="rental-inventory-row-item-1"` or row-level accessible `- / +` buttons.

---

### Task 2: Replace Image Inventory Cards with Text Rows and Steppers

**Files:**
- Modify: `apps/web/src/pages/Rental.jsx`
- Test: `apps/web/src/pages/Rental.test.jsx`

**Interfaces:**
- Consumes: `filteredItems`, `cartQtyByItemId`, `addToCart(item)`, `updateCartQty(id, delta)`, `removeFromCart(id)`.
- Produces:
  - `renderInventoryTextRow(item)` local renderer.
  - `renderQuantityStepper(item, qtyInCart)` local renderer.
  - Text-only list UI with no `img` usage for inventory rows.

- [ ] **Step 1: Remove rental view-mode import and constants**

In `Rental.jsx`, remove:

```jsx
import ViewModeToggle from '../components/ViewModeToggle';
```

Remove:

```jsx
const RENTAL_VIEW_STORAGE_KEY = 'avia_rental_inventory_view_mode';
```

Remove `getInitialRentalInventoryView`.

- [ ] **Step 2: Remove view-mode state and persistence**

Remove:

```jsx
const [inventoryViewMode, setInventoryViewMode] = useState(getInitialRentalInventoryView);
```

Remove the effect that writes `RENTAL_VIEW_STORAGE_KEY`.

In draft restore, remove the call:

```jsx
setInventoryViewMode(draftPayload.inventoryViewMode === 'list' ? 'list' : 'grid');
```

Keep draft restore tolerant by doing nothing with old `inventoryViewMode` values.

- [ ] **Step 3: Add row-level quantity helper**

Add this local helper after `updateCartQty` and `removeFromCart` are both available, or define it as a function that uses both callbacks:

```jsx
const handleDecreaseInventoryQty = (itemId) => {
  const currentQty = cartQtyByItemId.get(itemId) || 0;
  if (currentQty <= 0) {
    return;
  }

  if (currentQty === 1) {
    removeFromCart(itemId);
    return;
  }

  updateCartQty(itemId, -1);
};
```

If function order makes this awkward, place the helper after `removeFromCart` and before render helpers that call it.

- [ ] **Step 4: Replace inventory renderers**

Delete `renderInventoryGridItem` and the old image-based `renderInventoryListItem`.

Add:

```jsx
const renderQuantityStepper = (item, qtyInCart, isOutOfStock) => {
  const canDecrease = qtyInCart > 0;
  const canIncrease = !isOutOfStock && qtyInCart < Number(item.stock || 0);

  return (
    <div className="flex h-9 shrink-0 items-center border border-[#cfd8d3] bg-white">
      <button
        type="button"
        aria-label={`Kurangi ${item.name}`}
        disabled={!canDecrease}
        className="flex h-9 w-9 items-center justify-center border-r border-[#cfd8d3] text-sm font-bold text-[#0f3d2e] disabled:cursor-not-allowed disabled:text-[#9aa8a1]"
        onClick={(event) => {
          event.stopPropagation();
          handleDecreaseInventoryQty(item.id);
        }}
      >
        -
      </button>
      <span className="flex h-9 min-w-10 items-center justify-center px-2 text-sm font-bold text-[#10231c]">
        {qtyInCart}
      </span>
      <button
        type="button"
        aria-label={`Tambah ${item.name}`}
        disabled={!canIncrease}
        className="flex h-9 w-9 items-center justify-center border-l border-[#cfd8d3] bg-[#146c43] text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-[#d8e0dc] disabled:text-[#7a8982]"
        onClick={(event) => {
          event.stopPropagation();
          addToCart(item);
        }}
      >
        +
      </button>
    </div>
  );
};

const renderInventoryTextRow = (item) => {
  const stock = Number(item.stock || 0);
  const price = Number(item.price || 0);
  const isOutOfStock = stock <= 0;
  const qtyInCart = cartQtyByItemId.get(item.id) || 0;
  const isSelected = qtyInCart > 0;

  return (
    <div
      key={item.id}
      data-testid={`rental-inventory-row-${item.id}`}
      className={`border bg-white p-3 ${isSelected ? 'border-[#146c43]' : 'border-[#d7ded9]'} ${isOutOfStock ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-bold text-[#10231c]">{item.name}</p>
            {isOutOfStock && (
              <span className="border border-[#c0392b] bg-white px-2 py-0.5 text-[0.65rem] font-bold uppercase text-[#c0392b]">
                Habis
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[#5c6b64]">{item.category || 'Tanpa kategori'}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="font-bold text-[#146c43]">{formatCurrency(price)} /hari</span>
            <span className="text-[#5c6b64]">Stok: {stock}</span>
          </div>
        </div>
        {renderQuantityStepper(item, qtyInCart, isOutOfStock)}
      </div>
    </div>
  );
};
```

- [ ] **Step 5: Render one text list mode**

Replace the current grid/list conditional:

```jsx
{filteredItems.length === 0 ? (...) : inventoryViewMode === 'grid' ? (...) : (...)}
```

with:

```jsx
{filteredItems.length === 0 ? (
  <div className="mt-4 border border-[#d7ded9] bg-white p-4 text-center text-sm text-[#5c6b64]">
    {normalizedInventorySearch
      ? 'Barang tidak ditemukan. Coba kata kunci lain.'
      : 'Tidak ada barang pada kategori ini.'}
  </div>
) : (
  <div className="mt-4 flex flex-col gap-2 sm:mt-5">
    {filteredItems.map((item) => renderInventoryTextRow(item))}
  </div>
)}
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm exec vitest run apps/web/src/pages/Rental.test.jsx
```

Expected: the new tests from Task 1 pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/web/src/pages/Rental.jsx apps/web/src/pages/Rental.test.jsx
git commit -m "feat: add text-only rental item picker"
```

---

### Task 3: Rework Desktop Layout Around the Renter Workspace

**Files:**
- Modify: `apps/web/src/pages/Rental.jsx`
- Test: `apps/web/src/pages/Rental.test.jsx`
- Test: `apps/web/src/pages/pages.smoke.test.jsx`

**Interfaces:**
- Consumes: Existing render helpers:
  - `renderCustomerFields(scope)`
  - `renderCartItems()`
  - `renderInventoryTextRow(item)`
- Produces: Desktop DOM order where the renter workspace is the left panel and item picker is the right panel.

- [ ] **Step 1: Add a layout test for desktop content priority**

In `Rental.test.jsx`, add:

```jsx
it('places renter workspace and text item picker as the main desktop sections', () => {
  renderRental();

  expect(screen.getByRole('heading', { name: /detail penyewa/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /barang tersedia/i })).toBeInTheDocument();
  expect(screen.getByText('Tenda Dome 4p')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test and verify it fails if the heading is not present**

Run:

```bash
npm exec vitest run apps/web/src/pages/Rental.test.jsx
```

Expected: FAIL if the right panel still uses `Pilih Barang` as the primary heading or if layout text has not been updated.

- [ ] **Step 3: Reorder desktop flex layout**

In the main `lg:flex-row` container:

- Put the renter/payment/cart panel first.
- Put the item picker panel second.
- Use fixed responsive widths:

```jsx
<div className="flex flex-col gap-5 lg:h-full lg:min-h-0 lg:flex-row lg:gap-5 lg:overflow-hidden">
  <div className="w-full lg:flex lg:w-[62%] lg:min-h-0 lg:flex-col">
    {/* renter workspace */}
  </div>
  <div className={`${mobileStep === 2 ? 'flex' : 'hidden'} w-full flex-col lg:flex lg:w-[38%] lg:min-h-0 lg:overflow-hidden`}>
    {/* item picker */}
  </div>
</div>
```

For mobile, preserve the current `mobileStep` visibility rules so step 1 still starts with renter data.

- [ ] **Step 4: Rename item picker heading**

Change desktop item picker heading to:

```jsx
<h3 className="text-base font-bold text-[#10231c]">Barang Tersedia</h3>
```

Mobile step labels can keep `Pilih Barang` where it helps the flow, but the right desktop panel should read `Barang Tersedia`.

- [ ] **Step 5: Keep final review and receipt modals outside layout panels**

Confirm these remain at the bottom of the component render:

```jsx
{isFinalReviewOpen && (...)}
<ReceiptModal ... />
```

Do not nest modals inside the right item list.

- [ ] **Step 6: Run layout and smoke tests**

Run:

```bash
npm exec vitest run apps/web/src/pages/Rental.test.jsx apps/web/src/pages/pages.smoke.test.jsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/web/src/pages/Rental.jsx apps/web/src/pages/Rental.test.jsx apps/web/src/pages/pages.smoke.test.jsx
git commit -m "feat: prioritize renter workspace on rental page"
```

---

### Task 4: Apply Solid White-Green Rental Styling

**Files:**
- Modify: `apps/web/src/pages/Rental.jsx`
- Test: `apps/web/src/pages/Rental.test.jsx`

**Interfaces:**
- Consumes: Layout and item row renderers from Tasks 2 and 3.
- Produces: Rental page styling that is solid, less rounded, and scoped to the page.

- [ ] **Step 1: Add style regression assertions**

In `Rental.test.jsx`, add:

```jsx
it('uses solid controls for the rental item picker', () => {
  renderRental();

  const row = screen.getByTestId('rental-inventory-row-item-1');
  expect(row.className).toContain('bg-white');
  expect(row.className).not.toContain('backdrop-blur');
  expect(row.className).not.toContain('bg-accent/5');
});
```

- [ ] **Step 2: Run the style test and verify it fails if old classes remain**

Run:

```bash
npm exec vitest run apps/web/src/pages/Rental.test.jsx
```

Expected: FAIL until old transparent or orange-tinted row styling is removed.

- [ ] **Step 3: Replace transparent panel classes in rental-only sections**

In `Rental.jsx`, replace rental page classes like:

```jsx
bg-bg-main/95
bg-card-bg/40
bg-bg-main/40
bg-accent/10
border-accent/20
shadow-lg
shadow-2xl
backdrop-blur
rounded-xl
rounded-2xl
```

with solid, squarer classes for this page:

```jsx
bg-white
border-[#d7ded9]
border-[#146c43]
rounded-md
shadow-none
text-[#10231c]
text-[#146c43]
```

Do not modify global CSS tokens in this task.

- [ ] **Step 4: Update primary action buttons inside rental page**

For rental page primary buttons, use:

```jsx
className="w-full rounded-md bg-[#146c43] py-3 text-sm font-bold text-white transition hover:bg-[#0f5132] disabled:cursor-not-allowed disabled:bg-[#aebbb5]"
```

For secondary buttons, use:

```jsx
className="rounded-md border border-[#cfd8d3] bg-white px-3 py-2 text-sm font-semibold text-[#10231c] transition hover:border-[#146c43]"
```

- [ ] **Step 5: Keep error color red**

Do not convert red validation and destructive actions to green. Keep existing red color for:

```jsx
text-[#e74c3c]
border-[#e74c3c]
```

or convert to a solid red equivalent if needed:

```jsx
text-[#c0392b]
border-[#c0392b]
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm exec vitest run apps/web/src/pages/Rental.test.jsx apps/web/src/pages/pages.smoke.test.jsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add apps/web/src/pages/Rental.jsx apps/web/src/pages/Rental.test.jsx
git commit -m "style: apply solid green rental page styling"
```

---

### Task 5: Final Verification and Cleanup

**Files:**
- Modify only if needed: `apps/web/src/pages/Rental.jsx`
- Modify only if needed: `apps/web/src/pages/Rental.test.jsx`
- Read: `docs/superpowers/specs/2026-07-26-rental-page-redesign-design.md`

**Interfaces:**
- Consumes: Completed Tasks 1-4.
- Produces: Verified rental redesign ready for review.

- [ ] **Step 1: Search for removed image and view-mode usage**

Run:

```bash
rg -n "ViewModeToggle|RENTAL_VIEW_STORAGE_KEY|inventoryViewMode|renderInventoryGridItem|<img|item\\.image|via.placeholder" apps/web/src/pages/Rental.jsx
```

Expected: no output for removed rental-page inventory image/view-mode symbols. If `item.image` still appears in receipt or unrelated code outside `Rental.jsx`, ignore it for this task.

- [ ] **Step 2: Run rental tests**

Run:

```bash
npm exec vitest run apps/web/src/pages/Rental.test.jsx
```

Expected: PASS.

- [ ] **Step 3: Run web page smoke tests**

Run:

```bash
npm exec vitest run apps/web/src/pages/pages.smoke.test.jsx apps/web/src/App.test.jsx
```

Expected: PASS.

- [ ] **Step 4: Run lint and web build**

Run:

```bash
npm run lint --workspace @avia/web
npm run build --workspace @avia/web
```

Expected: PASS.

- [ ] **Step 5: Manually review responsive layout**

Start local app if needed:

```bash
npm run dev
```

Open the rental page and verify:

- Desktop: left panel is renter/payment/cart workspace, right panel is text-only item list.
- Desktop: item rows do not show images.
- Desktop: item search and category filter work.
- Desktop: `- / +` updates quantities.
- Mobile: step flow still works.
- Mobile: item step uses text rows and no images.
- No obvious text overlap or unstable button sizing.

- [ ] **Step 6: Commit final cleanup if any**

If Step 5 required code changes, run:

```bash
git add apps/web/src/pages/Rental.jsx apps/web/src/pages/Rental.test.jsx apps/web/src/pages/pages.smoke.test.jsx
git commit -m "fix: polish rental page redesign"
```

If Step 5 required no changes, do not create an empty commit.

---

## Self-Review

- Spec coverage: The plan covers image removal, existing `inventory` source, `- / +` stepper behavior, renter-first desktop layout, mobile step preservation, white-green solid styling, draft compatibility, search/filter retention, and tests.
- Placeholder scan: No task contains unresolved placeholder instructions or vague standalone steps.
- Type consistency: The plan consistently uses existing `Rental` props and local helpers: `filteredItems`, `cartQtyByItemId`, `addToCart`, `updateCartQty`, and `removeFromCart`.

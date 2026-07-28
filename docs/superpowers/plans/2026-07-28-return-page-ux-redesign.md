# Return Page UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Pengembalian page so it visually and ergonomically matches the rental page while preserving the current return workflow.

**Architecture:** Keep `Return.jsx` as the page owner and use derived memoized state for due-date metadata, search, filtering, selection, and payment summaries. The implementation is a focused UI/state refinement: add a status filter, broaden search matching, and restructure desktop layout into independent left/right scroll regions.

**Tech Stack:** React, Tailwind CSS utility classes, Vitest, React Testing Library, existing rental time helpers.

## Global Constraints

- Do not change backend return behavior.
- Do not add inventory images to the return page.
- Do not change payment rules, late fee calculation, or stock-restoration logic.
- Do not turn the desktop return flow into a wizard.
- Do not add dashboard-style statistic cards in this scope.
- Search placeholder must be `Cari customer, nomor HP, ID, atau barang...`.
- Filter options must be `Semua`, `Terlambat`, `Hari Ini`, `Akan Datang`, and `Belum Lunas`.
- Desktop page should not scroll during normal use; left list and right detail panel scroll independently.
- Use solid white-green styling, small radius, no orange legacy colors, no transparent/floating visual effects.

---

## File Structure

- Modify `apps/web/src/pages/Return.jsx`
  - Owns search/filter state.
  - Owns due-date sorting and filtering.
  - Owns the two-column return layout and scroll containers.
  - Owns selected rental detail and return confirmation.
- Modify `apps/web/src/pages/Return.test.jsx`
  - Covers search/filter behavior.
  - Covers due-date priority.
  - Covers layout and theme requirements.
  - Covers unpaid settlement guard.

---

### Task 1: Search And Status Filter Behavior

**Files:**
- Modify: `apps/web/src/pages/Return.test.jsx`
- Modify: `apps/web/src/pages/Return.jsx`

**Interfaces:**
- Consumes: existing `Return({ rentals, onProcessReturn })` props.
- Produces: local `statusFilter` state and filtered rental list behavior.

- [ ] **Step 1: Write failing tests for filter and broader search**

Add representative rentals to `Return.test.jsx`:

```jsx
const dueTodayRental = {
  id: 'RTR-002',
  status: 'Active',
  date: '2026-07-25T03:00:00.000Z',
  plannedReturnDate: '2026-07-26T03:00:00.000Z',
  duration: 1,
  total: 75000,
  customer: {
    name: 'Bima Santoso',
    phone: '089912345678',
  },
  items: [
    {
      id: 'item-2',
      name: 'Carrier 60L',
      qty: 1,
      price: 75000,
    },
  ],
  payment: {
    status: 'LUNAS',
    paidAmount: 75000,
    totalDue: 75000,
    remainingAmount: 0,
  },
};

const upcomingRental = {
  id: 'RTR-003',
  status: 'Active',
  date: '2026-07-25T04:00:00.000Z',
  plannedReturnDate: '2026-07-29T03:00:00.000Z',
  duration: 3,
  total: 165000,
  customer: {
    name: 'Citra Lestari',
    phone: '087700001111',
  },
  items: [
    {
      id: 'item-3',
      name: 'Trekking Pole',
      qty: 1,
      price: 55000,
    },
  ],
  payment: {
    status: 'LUNAS',
    paidAmount: 165000,
    totalDue: 165000,
    remainingAmount: 0,
  },
};
```

Add tests:

```jsx
it('searches active rentals by customer phone and item name', () => {
  render(<Return rentals={[activeOverdueRental, dueTodayRental, upcomingRental]} onProcessReturn={vi.fn()} />);

  fireEvent.change(screen.getByPlaceholderText('Cari customer, nomor HP, ID, atau barang...'), {
    target: { value: 'carrier' },
  });

  expect(screen.getByText('Bima Santoso')).toBeInTheDocument();
  expect(screen.queryByText('Ayu Pratiwi')).not.toBeInTheDocument();
  expect(screen.queryByText('Citra Lestari')).not.toBeInTheDocument();

  fireEvent.change(screen.getByPlaceholderText('Cari customer, nomor HP, ID, atau barang...'), {
    target: { value: '087700001111' },
  });

  expect(screen.getByText('Citra Lestari')).toBeInTheDocument();
  expect(screen.queryByText('Bima Santoso')).not.toBeInTheDocument();
});

it('filters active rentals by due status and unpaid payment state', () => {
  render(<Return rentals={[activeOverdueRental, dueTodayRental, upcomingRental]} onProcessReturn={vi.fn()} />);

  fireEvent.change(screen.getByLabelText(/filter status pengembalian/i), {
    target: { value: 'dueToday' },
  });

  expect(screen.getByText('Bima Santoso')).toBeInTheDocument();
  expect(screen.queryByText('Ayu Pratiwi')).not.toBeInTheDocument();
  expect(screen.queryByText('Citra Lestari')).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/filter status pengembalian/i), {
    target: { value: 'unpaid' },
  });

  expect(screen.getByText('Ayu Pratiwi')).toBeInTheDocument();
  expect(screen.queryByText('Bima Santoso')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run targeted tests and verify RED**

Run: `npm run test --workspace @avia/web -- Return.test.jsx --runInBand`

Expected: FAIL because the placeholder does not exist, filter select does not exist, and search does not match item names/phone.

- [ ] **Step 3: Implement search and status filter**

In `Return.jsx`:

```jsx
const RETURN_STATUS_FILTERS = [
    { value: 'all', label: 'Semua' },
    { value: 'overdue', label: 'Terlambat' },
    { value: 'dueToday', label: 'Hari Ini' },
    { value: 'upcoming', label: 'Akan Datang' },
    { value: 'unpaid', label: 'Belum Lunas' },
];
```

Add:

```jsx
const [statusFilter, setStatusFilter] = useState('all');
```

Update `filteredRentals` so it:

1. Builds a lowercase keyword once.
2. Matches customer name, customer phone, rental ID, and item names.
3. Applies `statusFilter`.
4. Keeps existing due-date priority sort.

- [ ] **Step 4: Run targeted tests and verify GREEN**

Run: `npm run test --workspace @avia/web -- Return.test.jsx --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/web/src/pages/Return.jsx apps/web/src/pages/Return.test.jsx
git commit -m "feat: add return search and status filter"
```

---

### Task 2: Desktop Layout And Independent Scroll

**Files:**
- Modify: `apps/web/src/pages/Return.test.jsx`
- Modify: `apps/web/src/pages/Return.jsx`

**Interfaces:**
- Consumes: filtered rental list from Task 1.
- Produces: stable layout test IDs:
  - `return-page-shell`
  - `return-list-panel`
  - `return-list-scroll`
  - `return-detail-panel`
  - `return-detail-scroll`
  - `return-detail-actions`

- [ ] **Step 1: Write failing layout tests**

Add tests:

```jsx
it('uses independent desktop scroll regions for the return list and detail panel', () => {
  render(<Return rentals={[activeOverdueRental, dueTodayRental, upcomingRental]} onProcessReturn={vi.fn()} />);

  expect(screen.getByTestId('return-page-shell').className).toContain('lg:h-[calc(100vh-8rem)]');
  expect(screen.getByTestId('return-list-panel').className).toContain('min-h-0');
  expect(screen.getByTestId('return-list-scroll').className).toContain('overflow-y-auto');
  expect(screen.getByTestId('return-detail-panel').className).toContain('min-h-0');
  expect(screen.getByTestId('return-detail-scroll').className).toContain('overflow-y-auto');
});

it('keeps the return action area anchored inside the detail panel', () => {
  render(<Return rentals={[activeOverdueRental]} onProcessReturn={vi.fn()} />);

  fireEvent.click(screen.getByText('Ayu Pratiwi'));

  const actionArea = screen.getByTestId('return-detail-actions');
  expect(actionArea.className).toContain('border-t');
  expect(actionArea.className).toContain('bg-white');
  expect(screen.getByRole('button', { name: /selesaikan pengembalian/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run targeted tests and verify RED**

Run: `npm run test --workspace @avia/web -- Return.test.jsx --runInBand`

Expected: FAIL because the test IDs and scroll classes are not present.

- [ ] **Step 3: Implement layout**

In `Return.jsx`, restructure markup into:

```jsx
<div data-testid="return-page-shell" className="flex min-h-0 flex-col gap-4 pb-4 lg:h-[calc(100vh-8rem)] lg:overflow-hidden">
  <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
    <section data-testid="return-list-panel" className="flex min-h-0 flex-col border border-border bg-white">
      <div className="border-b border-border bg-white p-3">
        search and filter controls
      </div>
      <div data-testid="return-list-scroll" className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
        rows
      </div>
    </section>
    <aside data-testid="return-detail-panel" className="flex min-h-0 flex-col border border-border bg-white">
      <div data-testid="return-detail-scroll" className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
        detail content
      </div>
      <div data-testid="return-detail-actions" className="border-t border-border bg-white p-4">
        total and actions
      </div>
    </aside>
  </div>
</div>
```

Keep mobile stacked naturally by only enforcing fixed viewport height and overflow on `lg:`.

- [ ] **Step 4: Run targeted tests and verify GREEN**

Run: `npm run test --workspace @avia/web -- Return.test.jsx --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/web/src/pages/Return.jsx apps/web/src/pages/Return.test.jsx
git commit -m "feat: align return page desktop layout"
```

---

### Task 3: Visual Polish And Regression Verification

**Files:**
- Modify: `apps/web/src/pages/Return.jsx`
- Modify: `apps/web/src/pages/Return.test.jsx`

**Interfaces:**
- Consumes: layout and behavior from Tasks 1 and 2.
- Produces: final white-green, square, text-only return experience.

- [ ] **Step 1: Write or update visual regression expectations**

Update the existing theme test so it also asserts:

```jsx
expect(screen.getByLabelText(/filter status pengembalian/i)).toBeInTheDocument();
expect(screen.getByPlaceholderText('Cari customer, nomor HP, ID, atau barang...')).toBeInTheDocument();
expect(document.querySelector('img')).toBeNull();
expect(getClassNames(container)).not.toContain('rounded-lg');
expect(getClassNames(container)).not.toContain('backdrop-blur');
expect(getClassNames(container)).not.toMatch(/bg-.*\/[0-9]/);
```

- [ ] **Step 2: Run targeted tests and verify RED if expectations are missing**

Run: `npm run test --workspace @avia/web -- Return.test.jsx --runInBand`

Expected: FAIL if visual requirements are not fully implemented.

- [ ] **Step 3: Polish `Return.jsx` classes**

Ensure:

- no orange classes remain
- no image rendering exists
- rows use `rounded-md` or square borders only
- search/filter toolbar is compact
- selected row uses green border/left indicator
- CTA uses solid green `bg-accent` / `hover:bg-accent-hover`
- right action area remains visually part of the detail panel

- [ ] **Step 4: Run targeted tests and full relevant checks**

Run:

```bash
npm run test --workspace @avia/web -- Return.test.jsx --runInBand
npm run test --workspace @avia/web -- Rental.test.jsx --runInBand
npm run build --workspace @avia/web
```

Expected: all pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add apps/web/src/pages/Return.jsx apps/web/src/pages/Return.test.jsx
git commit -m "test: cover return page UX regression"
```

---

## Plan Self-Review

- Spec coverage: layout, scroll, search, filter, no images, white-green theme, state/data flow, and tests are covered.
- Placeholder scan: no placeholder tasks are present.
- Type consistency: test IDs and filter values are defined once in this plan and used consistently across tasks.

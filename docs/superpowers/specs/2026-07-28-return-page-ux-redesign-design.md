# Return Page UX Redesign Design

Date: 2026-07-28

## Goal

Align the return page UX with the redesigned rental page while preserving the current return workflow. The cashier should still start from rentals ordered by return due date, then select one transaction and complete the return from a focused detail panel.

## User Workflow

1. Cashier opens Pengembalian.
2. Cashier sees active rentals prioritized by due date:
   - overdue first
   - due today second
   - upcoming after that
3. Cashier can search and filter the list.
4. Cashier selects one rental.
5. Cashier reviews customer, items, late fee, remaining payment, notes, and final total.
6. Cashier completes the return.

## Non Goals

- Do not change backend return behavior.
- Do not add inventory images to the return page.
- Do not change payment rules, late fee calculation, or stock-restoration logic.
- Do not turn the desktop return flow into a wizard.
- Do not add dashboard-style statistic cards in this scope.

## Recommended Approach

Use a two-column operational layout:

- Left main column: searchable and filterable transaction list.
- Right fixed-width column: selected return detail and confirmation action.

This matches the rental page mental model: work data on the left, active transaction detail/action on the right.

## Desktop Layout

The page should keep the same visual scale as the rental page:

- Header spacing, title size, and subtitle size should match other operational pages.
- The content area should fill the remaining viewport height.
- The whole page should not scroll during normal desktop use.
- Each column gets its own scroll area.

Suggested structure:

```text
Page header
------------------------------------------------------------
| Search + status filter                                   |
|----------------------------------------------------------|
| Active rental list, own scroll     | Return detail panel |
| ordered by due date                | own scroll          |
|                                    | sticky CTA area     |
------------------------------------------------------------
```

## Scroll Behavior

The return page should follow the rental page feel:

- The main page shell stays fixed inside the viewport.
- The left list scrolls independently.
- The right detail panel scrolls independently.
- Search and filter should remain visible above the left list.
- The primary return CTA should stay easy to reach at the bottom of the right panel.
- Avoid nested visual cards that make the scroll feel cramped.

## Search And Filter

The toolbar is required and should be compact:

- Search placeholder: `Cari customer, nomor HP, ID, atau barang...`
- Status filter options:
  - Semua
  - Terlambat
  - Hari Ini
  - Akan Datang
  - Belum Lunas

Search should match:

- customer name
- customer phone
- rental ID
- item names

Filtering should happen before rendering the visible list, while the default sort remains due-date priority.

## Rental List Rows

Use text-only rows, not large image cards. Rows should be square, dense, and easy to scan.

Each row should show:

- customer name
- status badge: Terlambat, Hari Ini, Akan Datang, or Belum Lunas
- rental ID and phone number
- compact item summary
- planned return date
- remaining payment when relevant

Selected row should use a clear green border or left indicator, not a large orange block.

## Return Detail Panel

When no rental is selected, show a simple empty state:

- icon or small symbol
- short text: pilih transaksi untuk memproses pengembalian

When selected, the panel should contain:

1. Transaction summary
2. Customer summary
3. Returned items list
4. Late fee / additional fee controls
5. Remaining payment confirmation when needed
6. Return notes
7. Final total
8. Primary CTA: `Selesaikan Pengembalian`
9. Secondary CTA: `Batal`

The panel should use the same white-green theme as rental:

- solid white surfaces
- green primary buttons
- small border radius
- no transparent or floating visual effects
- no orange legacy colors

## Mobile Layout

Desktop keeps the two-column layout. Mobile can keep a simpler stacked flow:

1. Search and filter
2. Transaction list
3. Selected return detail

The selected detail should appear as a focused section below the list. No new mobile wizard is required for this pass.

## State And Data Flow

Use the existing `rentals` prop and existing `onProcessReturn` behavior.

Local state can remain focused on UI:

- `searchQuery`
- `statusFilter`
- `selectedRental`
- `returnNotes`
- `additionalFeeInput`
- `applyLateFee`
- `settleRemainingPayment`
- `isSubmitting`

Derived state should stay memoized:

- active rentals
- due metadata
- filtered rentals
- selected payment info
- selected late fee data

## Error And Empty States

Keep the existing business protections:

- block return when unpaid and settlement confirmation is not checked
- show user-friendly alert on failed return
- clear selection after successful return

Empty states:

- no active rentals
- search/filter has no matches
- no selected rental

## Testing

Update or add tests for:

- page uses white-green theme, not legacy orange styling
- search matches customer, phone, rental ID, and item name
- filter options show the expected rentals
- overdue and due-today priority remains intact
- selected row and detail panel render correctly
- unpaid rental requires settlement confirmation before return

## Approval Check

This design intentionally keeps the current business flow. The change is mostly layout, visual consistency, and scroll ergonomics.

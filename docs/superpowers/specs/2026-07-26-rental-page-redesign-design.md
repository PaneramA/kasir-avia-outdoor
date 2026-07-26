# Rental Page Redesign Design

## Goal

Redesign the cashier rental page so it behaves like a fast transaction workspace, not an inventory gallery. The page must prioritize renter data entry, text-based item selection, and clear payment review.

The new design removes inventory images from the rental page. Inventory data still comes from the existing `inventory` prop, but the rental page only renders text fields such as item name, category, price, stock, and selected quantity.

## Scope

This redesign applies to `apps/web/src/pages/Rental.jsx` and related local UI tests. It does not change backend APIs, inventory storage, checkout payload shape, or rental business logic.

The page should keep the current functional behavior:

- Customer lookup through SWR-backed `fetchCustomers`.
- Inventory search and category filtering.
- Cart quantity updates with stock limits.
- Rental time range, duration calculation, payment validation, review modal, receipt modal, and draft restore.
- Mobile step flow: renter data, item selection, confirmation.

## Recommended Layout

Desktop uses a two-panel operational layout:

- Left primary panel, around 60-65% width: renter details, rental timing, payment controls, selected items, total, and review action.
- Right secondary panel, around 35-40% width: text-only available item list with search, category filter, and row-level quantity controls.

Mobile keeps the current step-by-step flow, but the item selection step also uses the same text-only item rows without images.

## Item List Behavior

The right item list is sourced from the existing filtered inventory list. It must not render `item.image`, placeholders, thumbnails, or image containers.

Each item row shows:

- Item name.
- Category.
- Price per day.
- Available stock.
- Quantity stepper with `-`, current quantity, and `+`.

Stepper behavior:

- `+` adds one unit, respecting stock.
- `-` removes one unit. At quantity `1`, pressing `-` removes the item from the cart.
- `-` is disabled when quantity is `0`.
- `+` is disabled when stock is `0` or selected quantity reaches stock.
- Rows with quantity above `0` get a clear selected state.
- Out-of-stock rows remain visible but subdued and cannot be increased.

Keyboard behavior should remain practical:

- `/` focuses item search on desktop.
- `Enter` in item search can still add the top available result.

## Left Panel Content

The left panel becomes the main transaction workspace. It should contain these sections in order:

1. Customer lookup.
2. Renter details.
3. Rental time range and calculated duration.
4. Payment status and method.
5. Selected items summary with editable quantity and notes.
6. Total payment block and review button.

The selected item summary should stay visible enough for cashiers to confirm what has been chosen while editing renter and payment details.

## Visual Direction

The page should move from orange-white to white-green.

White remains the dominant background and panel color. Green is the accent for primary actions, selected states, focus borders, and small status elements.

Visual rules:

- Use solid colors only. Avoid transparent panels, glass effects, and blurred backgrounds.
- Use small radii, ideally `4px` to `8px`.
- Avoid large shadows and floating-card effects.
- Use solid borders to define areas.
- Keep text dense but scannable.
- Keep buttons and controls stable in size so quantity changes do not shift layout.

Recommended palette direction:

- Main background: near-white.
- Panels: white.
- Borders: neutral light gray.
- Primary green: deep operational green.
- Green hover: slightly darker green.
- Error states can stay red for clarity.

## Component Strategy

Keep the work scoped inside `Rental.jsx` unless a small extracted component clearly improves readability.

Expected internal units:

- Text-only inventory row renderer.
- Quantity stepper renderer or small local component.
- Solid section wrapper classes reused for left-panel blocks.

Remove the inventory view toggle from the rental page because the new experience has one intended mode: text list. This should also remove rental-page reliance on `RENTAL_VIEW_STORAGE_KEY` and `inventoryViewMode` if no longer needed for draft compatibility.

Draft restore should tolerate older drafts that include `inventoryViewMode`, but the new UI should not expose or persist the view mode.

## Data Flow

No new API fetch is needed. The parent app already provides `inventory`, and that remains the source for the item list.

The redesign only changes rendering:

- `safeInventory` feeds `filteredItems`.
- `filteredItems` feeds text rows.
- `cartQtyByItemId` determines row selected state and stepper values.
- Existing `addToCart`, `updateCartQty`, and `removeFromCart` logic can be reused or lightly adapted.

## Error Handling

Keep existing validation and error messages:

- Missing renter data.
- No items selected.
- Invalid rental duration.
- Invalid DP amount.
- Stock exceeded.

Avoid `alert()` for normal stock-limit feedback if a clean inline message is easy within scope. If replacing alerts expands scope too much, keep current stock warning behavior for this phase.

## Testing

Update or add tests around the changed behavior:

- Rental page renders item names, category, stock, and price without rendering inventory images.
- Quantity stepper adds and removes items.
- Plus button respects stock limits.
- Search still filters the text list.
- Existing page smoke tests continue to pass.

Run targeted rental/page tests first, then broader web tests or full Vitest as appropriate.

## Out Of Scope

- Backend API changes.
- Inventory page redesign.
- Global theme redesign across every page.
- Dynamic logo work.
- Replacing all orange across the whole app in one pass.

This phase may introduce green styling inside the rental page only. A later UI/UX refinement can move color tokens globally once the visual direction is confirmed.

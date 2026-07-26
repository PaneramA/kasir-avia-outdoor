# Rental Flatpickr Range Design

Date: 2026-07-26

## Goal

Replace the current two native `datetime-local` controls in the Rental page's "Rentang Waktu Sewa" card with one combined Flatpickr range picker. The change should make date selection clearer and faster while preserving the existing rental duration, payment, draft, validation, and checkout behavior.

## Scope

- Add Flatpickr to the web app dependency set.
- Add a small React wrapper for one rental date-range input at `apps/web/src/components/RentalDateRangePicker.jsx`.
- Replace both Rental page start/end native datetime inputs, in mobile and desktop layouts, with one combined date-time range control.
- Style the Flatpickr calendar to match the current solid white and green theme with small radii.
- Add focused tests for the Rental range picker behavior.

Out of scope:

- Changing rental pricing rules.
- Changing checkout payload shape.
- Changing draft persistence format.
- Changing the broader Rental layout.

## UX

The "Rentang Waktu Sewa" card shows one input labeled "Rentang Waktu Sewa". The placeholder is "Pilih tanggal & jam mulai - selesai".

When the user opens the input, Flatpickr shows a date-time range picker:

- `mode: "range"`
- `enableTime: true`
- 24-hour time
- 15-minute time increment
- no past-date restriction for now, because existing behavior does not enforce it

The input is valid only after two date-time values are selected. Selecting only the first date keeps the existing duration validation message path available: "Tanggal mulai dan selesai wajib diisi."

## Data Flow

Rental keeps the existing internal state:

- `rentalStartAt`
- `rentalEndAt`
- `duration`
- `durationError`

Flatpickr is only the input mechanism. When Flatpickr emits one selected date, the start state is updated and the end state is cleared. When it emits two selected dates, both start and end state are updated.

Existing derived logic remains responsible for:

- duration calculation
- rental day policy
- payment total
- checkout validation
- draft restoration
- review summary

When a draft or restored state already has start/end dates, the Flatpickr input receives those values so the displayed range matches the existing state.

## Component Approach

Preferred approach:

- Create `RentalDateRangePicker` in `apps/web/src/components/RentalDateRangePicker.jsx`.
- The component owns Flatpickr instance setup and cleanup with `useEffect`.
- Rental owns all business state and passes:
  - `startAt`
  - `endAt`
  - `onChange(startAt, endAt)`
  - `error`
  - `layout`

This keeps Flatpickr-specific imperative setup isolated from Rental's checkout logic.

## Styling

Import Flatpickr base CSS once in the component or web entry, then add local/global overrides for:

- white calendar surface
- green selected range and active day
- solid borders
- `6px` radius
- text colors aligned to existing theme tokens
- no blur or glass effect

The input itself should reuse the Rental field styling where possible.

## Error Handling

If Flatpickr fails to initialize, the page should still render the text input. No special runtime error UI is required.

Validation remains in Rental:

- missing start/end: "Tanggal mulai dan selesai wajib diisi."
- end before or equal start: "Tanggal selesai harus setelah tanggal mulai."

## Testing

Add focused tests that verify:

- Rental renders one range input for the duration card instead of two native `datetime-local` controls.
- Selecting a complete range updates the state enough for duration/summary or validation-dependent UI to proceed.
- Selecting only one date does not satisfy the duration step.
- Styling guard confirms the range input follows the green/white solid theme and does not use legacy orange styling.

Mock Flatpickr in the focused component tests so tests do not depend on browser calendar behavior.

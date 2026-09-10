# Kalender Pengembalian Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Mengubah halaman Pengembalian menjadi kalender interaktif Hari/Minggu/Bulan dengan pencarian, filter, modal proses return, dan fetch berbasis rentang tanggal.

**Architecture:** Backend menyediakan rental aktif dalam rentang tanggal Jakarta yang sudah tenant/branch scoped. Frontend mengubah DTO rental menjadi event kalender melalui adapter murni, mengambil data menggunakan SWR dengan cache key berbasis scope dan rentang, lalu membuka modal pengembalian dari event tanpa mengubah aturan transaksi backend.

**Tech Stack:** React 19, FullCalendar React 6.1.21, SWR 2.4.2, Prisma 6.12.0, Vitest, Tailwind CSS, timezone Asia/Jakarta.

**Spec:** docs/superpowers/specs/2026-09-10-return-calendar-design.md

## Global Constraints

- Rental aktif ditampilkan berdasarkan plannedReturnDate.
- Event kalender tidak dapat digeser atau diubah dengan drag and drop.
- Semua query tetap tenant dan branch scoped.
- Gunakan timezone operasional Asia/Jakarta dan date key YYYY-MM-DD.
- Gunakan SWR dengan key stabil, debounce search 250-300 ms, dan keepPreviousData.
- Hanya area kalender yang boleh scroll; halaman tidak boleh memiliki scrollbar ganda.
- Tidak ada integrasi Google Calendar/iCal dan tidak ada asset gambar untuk event.
- Semua copy UI menggunakan Bahasa Indonesia dan mengikuti design system Sewantara.

---

### Task 1: Dependency, Cache Key, dan API Client

**Files:**
- Modify: apps/web/package.json
- Modify: package-lock.json
- Modify: apps/web/src/lib/appCache.js
- Modify: apps/web/src/lib/api.js
- Test: apps/web/src/lib/api.test.js
- Test: apps/web/src/lib/appCache.test.js

**Interfaces:**
- Produce fetchRentalCalendar({ startDate, endDate, search, status }) -> Promise<Rental[]>.
- Produce APP_CACHE_KEYS.returnCalendar(userId, tenantId, branchId, range, search, status).
- Mark the app/return-calendar namespace as a rental mutation namespace.

- [ ] **Step 1: Write the failing API client test**

Add a test that stores an auth token and tenant context, mocks a successful response, calls:

~~~js
await api.fetchRentalCalendar({
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  search: 'Bambang',
  status: 'unpaid',
});
~~~

Assert the request URL contains encoded startDate, endDate, search, and status, and assert the response is normalized with normalizeRentalRecord.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

~~~bash
npx vitest run apps/web/src/lib/api.test.js -t "calendar"
~~~

Expected: FAIL because fetchRentalCalendar is not defined.

- [ ] **Step 3: Install pinned FullCalendar dependencies**

Run:

~~~bash
npm install --workspace @avia/web --save-exact @fullcalendar/react@6.1.21 @fullcalendar/core@6.1.21 @fullcalendar/daygrid@6.1.21 @fullcalendar/timegrid@6.1.21 @fullcalendar/list@6.1.21
~~~

Keep the dependency versions identical so plugins and the React connector share one release line.

- [ ] **Step 4: Implement the API client and cache key**

Add fetchRentalCalendar beside fetchRentals in apps/web/src/lib/api.js. Build the query with URLSearchParams, omit empty optional values, request /api/rentals/calendar, and normalize each DTO.

Add this cache key shape in appCache.js:

~~~js
returnCalendar: (userId, tenantId, branchId, range = '', search = '', status = 'all') => createBranchKey(
  'app/return-calendar',
  userId,
  tenantId,
  branchId,
  range,
  normalizeCacheScopeValue(search).toLowerCase(),
  normalizeCacheScopeValue(status),
),
~~~

Include app/return-calendar in RENTAL_MUTATION_NAMESPACES.

- [ ] **Step 5: Run client and cache tests**

Run:

~~~bash
npx vitest run apps/web/src/lib/api.test.js apps/web/src/lib/appCache.test.js --maxWorkers=1
~~~

Expected: PASS.

- [ ] **Step 6: Commit**

~~~bash
git add apps/web/package.json package-lock.json apps/web/src/lib/api.js apps/web/src/lib/api.test.js apps/web/src/lib/appCache.js apps/web/src/lib/appCache.test.js
git commit -m "feat: add rental calendar client cache"
~~~

### Task 2: Backend Rental Calendar Endpoint

**Files:**
- Modify: apps/api/src/data/db.js
- Modify: apps/api/src/routes/api.js
- Modify: apps/api/src/routes/api.integration.test.js
- Modify: apps/api/prisma/schema.prisma only when the query plan confirms a missing composite index
- Create: apps/api/prisma/migrations/20260910_index_rental_planned_return_date/migration.sql only when the schema index is added

**Interfaces:**
- Produce listRentalCalendar({ startDate, endDate, search }, context) -> Promise<Rental[]>.
- Route GET /api/rentals/calendar?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&search=....
- Return the same rental DTO shape used by normalizeRentalRecord.

- [ ] **Step 1: Write integration tests for range and scope**

Create active rentals with different plannedReturnDate values, one returned rental, and one rental in another tenant or branch. Call the new endpoint with a Jakarta date range and assert:

~~~js
expect(response.status).toBe(200);
expect(response.body.data.map((rental) => rental.id)).toEqual([insideRangeId]);
~~~

Also assert a customer/item search only returns matching rentals and cross-tenant or cross-branch records are never returned.

- [ ] **Step 2: Run the focused API tests and verify they fail**

Run:

~~~bash
npx vitest run apps/api/src/routes/api.integration.test.js -t "calendar" --maxWorkers=1
~~~

Expected: FAIL with a 404 or missing route behavior.

- [ ] **Step 3: Implement validated Jakarta boundaries**

Reuse parseJakartaDateBoundary in db.js. Require both startDate and endDate, parse them as inclusive start and exclusive end by adding one day to the requested end date, and reject invalid dates with the existing request error format.

- [ ] **Step 4: Implement the scoped Prisma query**

Build the base where clause with:

~~~js
{
  deletedAt: null,
  status: 'Active',
  plannedReturnDate: { gte: startAt, lt: endAt },
}
~~~

Pass it through withTenantBranchScope. Add case-insensitive search across rental id, customer name, customer phone, and items.some.itemName. Include items and payments, order by plannedReturnDate asc then id desc, and map with toRentalDto.

- [ ] **Step 5: Wire the route before the generic rental routes**

In api.js, handle the exact path /api/rentals/calendar before the existing /api/rentals branch. Parse query parameters, call listRentalCalendar, and return sendSuccess.

- [ ] **Step 6: Check the query plan and add only the required index**

Use PostgreSQL EXPLAIN against the scoped date query. If the existing indexes do not support the date-range scan, add:

~~~prisma
@@index([tenantId, branchId, status, plannedReturnDate])
~~~

Create the migration with Prisma and verify it applies cleanly. Do not change rental business fields or payment behavior.

- [ ] **Step 7: Run API tests and migration validation**

Run:

~~~bash
npx vitest run apps/api/src/routes/api.integration.test.js -t "calendar" --maxWorkers=1
npm run prisma:generate --workspace @avia/api
npm run prisma:migrate:deploy --workspace @avia/api -- --schema prisma/schema.prisma
~~~

Expected: all focused tests pass and migration deploy reports no pending error.

- [ ] **Step 8: Commit**

~~~bash
git add apps/api/src/data/db.js apps/api/src/routes/api.js apps/api/src/routes/api.integration.test.js apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: add scoped rental calendar endpoint"
~~~

### Task 3: Calendar Event Adapter

**Files:**
- Create: apps/web/src/lib/returnCalendar.js
- Create: apps/web/src/lib/returnCalendar.test.js

**Interfaces:**
- getReturnDueStatus(plannedReturnDate, now = new Date()) -> overdue | dueToday | upcoming | unknown.
- toReturnCalendarEvent(rental, now = new Date()) -> CalendarEvent | null.
- filterReturnRentals(rentals, { search, status, now }) -> Rental[].
- toReturnCalendarEvents(rentals, options) -> CalendarEvent[].

- [ ] **Step 1: Write deterministic date and filter tests**

Use a fixed Jakarta-equivalent timestamp and test:

~~~js
expect(getReturnDueStatus('2026-09-09T12:00:00+07:00', now)).toBe('overdue');
expect(getReturnDueStatus('2026-09-10T12:00:00+07:00', now)).toBe('dueToday');
expect(getReturnDueStatus('2026-09-11T12:00:00+07:00', now)).toBe('upcoming');
expect(toReturnCalendarEvent({ id: 'without-date' })).toBeNull();
~~~

Test search across customer, phone, rental id, and item names, plus the unpaid, overdue, dueToday, and upcoming filters.

- [ ] **Step 2: Run the test and verify it fails**

Run:

~~~bash
npx vitest run apps/web/src/lib/returnCalendar.test.js --maxWorkers=1
~~~

Expected: FAIL because the adapter file does not exist.

- [ ] **Step 3: Implement the pure adapter**

Use the existing toJakartaDateKey and payment DTO semantics. Return events with:

~~~js
{
  id: rental.id,
  title: rental.customer.name,
  start: rental.plannedReturnDate,
  allDay: false,
  extendedProps: {
    rentalId: rental.id,
    customerName: rental.customer.name,
    itemCount: rental.items.length,
    unitCount: rental.items.reduce((sum, item) => sum + item.qty, 0),
    paymentStatus: rental.payment.status,
    remainingAmount: rental.payment.remainingAmount,
    identityCardHeld: rental.customer.identityCardHeld !== false,
    dueStatus,
  },
}
~~~

Do not put images or full item descriptions in the event payload used by the calendar cell.

- [ ] **Step 4: Run adapter tests**

Run:

~~~bash
npx vitest run apps/web/src/lib/returnCalendar.test.js --maxWorkers=1
~~~

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add apps/web/src/lib/returnCalendar.js apps/web/src/lib/returnCalendar.test.js
git commit -m "feat: add return calendar event adapter"
~~~

### Task 4: FullCalendar Presentation Component

**Files:**
- Create: apps/web/src/components/ReturnCalendar.jsx
- Create: apps/web/src/components/ReturnCalendar.test.jsx
- Modify: apps/web/src/index.css or the existing global stylesheet where calendar styles are maintained

**Interfaces:**
- Props: { rentals, view, onViewChange, onEventClick, onVisibleRangeChange, isLoading, error }.
- onVisibleRangeChange({ startDate, endDate }) receives inclusive YYYY-MM-DD keys.
- onEventClick(rentalId) receives the clicked rental id.

- [ ] **Step 1: Write component tests**

Test that the component renders the three view controls, loading/error/empty states, event customer names, and invokes onEventClick when an event is activated. Keep event mapping delegated to returnCalendar.js.

- [ ] **Step 2: Run focused component tests and verify the initial failure**

Run:

~~~bash
npx vitest run apps/web/src/components/ReturnCalendar.test.jsx --maxWorkers=1
~~~

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Add the FullCalendar component**

Use dayGridPlugin, timeGridPlugin, and listPlugin. Configure:

~~~jsx
<FullCalendar
  plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
  timeZone="Asia/Jakarta"
  initialView="dayGridMonth"
  headerToolbar={false}
  events={events}
  eventClick={handleEventClick}
  datesSet={handleDatesSet}
  dayMaxEvents={3}
  height="100%"
/>
~~~

Use eventContent to render compact text and status badges. Disable editable and eventStartEditable. Map the segmented controls to dayGridMonth, timeGridWeek, and timeGridDay.

- [ ] **Step 4: Style the calendar for Sewantara**

Use solid white surfaces, green accents, restrained borders, small radius consistent with Rental, Indonesian labels, visible today state, keyboard focus, and no image backgrounds. Make .fc-scroller the only vertical scroll container inside the page shell.

- [ ] **Step 5: Run component tests and build**

Run:

~~~bash
npx vitest run apps/web/src/components/ReturnCalendar.test.jsx --maxWorkers=1
npm run build --workspace @avia/web
~~~

Expected: PASS and a successful Vite build.

- [ ] **Step 6: Commit**

~~~bash
git add apps/web/src/components/ReturnCalendar.jsx apps/web/src/components/ReturnCalendar.test.jsx apps/web/src/index.css
git commit -m "feat: add interactive return calendar"
~~~

### Task 5: SWR Calendar Data and Return Page Integration

**Files:**
- Modify: apps/web/src/pages/Return.jsx
- Modify: apps/web/src/App.jsx
- Modify: apps/web/src/lib/api.js
- Create: apps/web/src/components/ReturnDetailModal.jsx
- Modify: apps/web/src/pages/Return.test.jsx

**Interfaces:**
- Return receives userId, tenantId, and branchId in addition to existing props.
- ReturnDetailModal receives { rental, inventory, categories, onClose, onProcessReturn, onRecordPayment, onUpdateRental }.
- Return page keeps selected rental state by id, not by stale copied object.

- [ ] **Step 1: Update page tests for calendar-first behavior**

Change the existing Return tests so they assert:

~~~js
expect(screen.getByTestId('return-calendar')).toBeInTheDocument();
expect(screen.getByRole('button', { name: /bulan/i })).toBeInTheDocument();
~~~

Add coverage that an event selection opens the detail modal and that processing return clears the selected event after the callback succeeds.

- [ ] **Step 2: Run the focused tests and verify the new assertions fail**

Run:

~~~bash
npx vitest run apps/web/src/pages/Return.test.jsx --maxWorkers=1
~~~

Expected: FAIL because the page still renders the list/detail two-column layout.

- [ ] **Step 3: Add SWR state keyed by visible range**

In Return.jsx, track calendarView, visibleRange, searchQuery, statusFilter, and a debounced search value. Use:

~~~js
const rangeKey = visibleRange.startDate + ':' + visibleRange.endDate;
const calendarKey = userId && tenantId && branchId
  ? APP_CACHE_KEYS.returnCalendar(userId, tenantId, branchId, rangeKey, debouncedSearch, statusFilter)
  : null;
const calendarQuery = useSWR(calendarKey, () => fetchRentalCalendar({
  startDate: visibleRange.startDate,
  endDate: visibleRange.endDate,
  search: debouncedSearch,
}), {
  keepPreviousData: true,
  dedupingInterval: 5000,
});
~~~

Use the current rentals prop as fallback data until the range request resolves. Filter due status and payment semantics through the pure adapter.

- [ ] **Step 4: Replace the list/detail layout with the calendar shell**

Keep the page header and summary controls, render ReturnCalendar as the only main content surface, and pass onVisibleRangeChange to update the SWR key. Keep the page height fixed on desktop and let only the calendar body scroll.

- [ ] **Step 5: Extract the existing detail panel into a modal**

Move the current selected-rental detail, late-fee calculation, return notes, payment action, edit action, and return confirmation into ReturnDetailModal.jsx. Preserve existing callback payloads:

~~~js
onProcessReturn({
  rentalId,
  applyLateFee,
  lateFeeAmount,
  returnNotes,
});
~~~

Retain RentalEditModal and RentalPaymentModal as nested flows. Close the detail modal only after a successful return or explicit close action.

- [ ] **Step 6: Pass scope identifiers from App**

Update the Return route element in App.jsx to pass currentUserId, activeTenantId, and activeBranchId. Keep existing rental cache loading for header and fallback behavior.

- [ ] **Step 7: Refresh all relevant SWR caches after mutations**

Extend existing rental mutation invalidation in App.jsx so app/return-calendar is revalidated for the active user, tenant, and branch after:

- creating or editing a rental,
- processing a return,
- recording a payment.

Use the existing isRentalMutationKeyForScope path rather than clearing unrelated tenant caches.

- [ ] **Step 8: Run page and component tests**

Run:

~~~bash
npx vitest run apps/web/src/pages/Return.test.jsx apps/web/src/components/ReturnCalendar.test.jsx apps/web/src/lib/returnCalendar.test.js --maxWorkers=1
~~~

Expected: PASS.

- [ ] **Step 9: Commit**

~~~bash
git add apps/web/src/pages/Return.jsx apps/web/src/pages/Return.test.jsx apps/web/src/App.jsx apps/web/src/lib/api.js apps/web/src/components/ReturnDetailModal.jsx
git commit -m "feat: integrate return calendar workflow"
~~~

### Task 6: Responsive, Accessibility, and Regression Verification

**Files:**
- Modify: apps/web/src/components/ReturnCalendar.jsx
- Modify: apps/web/src/components/ReturnDetailModal.jsx
- Modify: apps/web/src/pages/Return.jsx
- Test: apps/web/src/pages/Return.test.jsx
- Test: apps/web/src/components/ReturnCalendar.test.jsx

- [ ] **Step 1: Add responsive behavior tests**

Assert the component supports the compact list view and keeps labels accessible for view controls, search, status filter, calendar events, and close/process actions.

- [ ] **Step 2: Verify scroll ownership**

Use a browser preview at desktop and mobile sizes. Confirm the page shell remains fixed, the calendar body is the only scrollable region, event text does not overlap, and the modal fits without a second page scrollbar.

- [ ] **Step 3: Verify mutation behavior manually**

Test one upcoming rental, one rental due today, one overdue rental, one unpaid rental, and one rental with a late fee. Click each event, open the modal, record a payment, edit a rental, and process a return. Confirm the event and status update without a full page reload.

- [ ] **Step 4: Run the complete verification suite**

Run:

~~~bash
npm ci --ignore-scripts --dry-run
npm audit --omit=dev
npx vitest run --maxWorkers=1
npm run lint
npm run build
git diff --check
~~~

Expected: audit reports zero vulnerabilities, all tests pass, lint has no errors, web/API builds succeed, and the diff is clean.

- [ ] **Step 5: Commit final polish**

~~~bash
git add apps/web/src/components/ReturnCalendar.jsx apps/web/src/components/ReturnDetailModal.jsx apps/web/src/pages/Return.jsx apps/web/src/pages/Return.test.jsx apps/web/src/components/ReturnCalendar.test.jsx
git commit -m "fix: polish return calendar responsive workflow"
~~~

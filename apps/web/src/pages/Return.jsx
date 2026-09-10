import React, { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import ReturnCalendar from '../components/ReturnCalendar';
import ReturnDetailModal from '../components/ReturnDetailModal';
import { APP_CACHE_KEYS } from '../lib/appCache';
import { fetchRentalCalendar } from '../lib/api';
import { getReturnDueStatus, filterReturnRentals } from '../lib/returnCalendar';

const RETURN_STATUS_FILTERS = [
  { value: 'all', label: 'Semua status' },
  { value: 'overdue', label: 'Terlambat' },
  { value: 'dueToday', label: 'Hari ini' },
  { value: 'upcoming', label: 'Akan datang' },
  { value: 'unpaid', label: 'Belum lunas' },
];

function getCount(rentals, status) {
  return rentals.filter((rental) => getReturnDueStatus(rental) === status).length;
}

export default function Return({
  rentals = [],
  inventory = [],
  categories = [],
  userId = '',
  tenantId = '',
  branchId = '',
  onProcessReturn,
  onUpdateRental,
  onRecordRentalPayment,
  onRecordPayment,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [calendarView, setCalendarView] = useState('dayGridMonth');
  const [visibleRange, setVisibleRange] = useState({ startDate: '', endDate: '' });
  const [selectedRental, setSelectedRental] = useState(null);

  useEffect(() => {
    const timeoutId = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 280);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const rangeKey = visibleRange.startDate && visibleRange.endDate
    ? visibleRange.startDate + ':' + visibleRange.endDate
    : '';
  const calendarKey = userId && tenantId && branchId && rangeKey
    ? APP_CACHE_KEYS.returnCalendar(userId, tenantId, branchId, rangeKey, debouncedSearch, statusFilter)
    : null;
  const calendarQuery = useSWR(
    calendarKey,
    () => fetchRentalCalendar({
      startDate: visibleRange.startDate,
      endDate: visibleRange.endDate,
      search: debouncedSearch,
      status: statusFilter === 'unpaid' ? 'unpaid' : '',
    }),
    {
      keepPreviousData: true,
      dedupingInterval: 5000,
    },
  );

  const sourceRentals = calendarQuery.data ?? rentals;
  const filterSearch = calendarKey ? debouncedSearch : searchQuery;
  const visibleRentals = useMemo(() => filterReturnRentals(sourceRentals, {
    search: filterSearch,
    status: statusFilter,
  }), [sourceRentals, filterSearch, statusFilter]);
  const isLoading = Boolean(calendarKey && calendarQuery.isLoading);
  const error = calendarQuery.error instanceof Error
    ? calendarQuery.error.message
    : calendarQuery.error
      ? 'Gagal memuat jadwal pengembalian.'
      : '';

  const summary = useMemo(() => ({
    total: visibleRentals.length,
    overdue: getCount(visibleRentals, 'overdue'),
    dueToday: getCount(visibleRentals, 'dueToday'),
    upcoming: getCount(visibleRentals, 'upcoming'),
  }), [visibleRentals]);

  const handleVisibleRangeChange = (nextRange) => {
    setCalendarView((current) => current === nextRange.view ? current : nextRange.view);
    setVisibleRange((current) => (
      current.startDate === nextRange.startDate && current.endDate === nextRange.endDate
        ? current
        : { startDate: nextRange.startDate, endDate: nextRange.endDate }
    ));
  };

  return (
    <div data-testid="return-page-shell" className="flex min-h-0 flex-col gap-4 pb-4 lg:h-[calc(100vh-8rem)] lg:overflow-hidden">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-main">Pengembalian</h1>
          <p className="mt-1 text-sm text-text-muted">Pantau jadwal jatuh tempo dan selesaikan pengembalian dari satu kalender.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: 'Total aktif', value: summary.total, tone: 'text-text-main' },
            { label: 'Terlambat', value: summary.overdue, tone: 'text-red-700' },
            { label: 'Hari ini', value: summary.dueToday, tone: 'text-[#92400e]' },
            { label: 'Akan datang', value: summary.upcoming, tone: 'text-accent' },
          ].map((card) => (
            <div key={card.label} className="min-w-[92px] border border-border bg-card-bg px-3 py-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-text-muted">{card.label}</p>
              <p className={'mt-1 text-xl font-bold ' + card.tone}>{card.value}</p>
            </div>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_210px]">
          <label className="relative">
            <span className="sr-only">Cari pengembalian</span>
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"></i>
            <input
              type="search"
              className="w-full rounded-md border border-border bg-card-bg py-2.5 pl-10 pr-3 text-sm text-text-main outline-none focus:border-accent"
              placeholder="Cari customer, nomor HP, ID, atau barang..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">Filter status pengembalian</span>
            <select
              aria-label="Filter status pengembalian"
              className="w-full rounded-md border border-border bg-card-bg px-3 py-2.5 text-sm text-text-main outline-none focus:border-accent"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              {RETURN_STATUS_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>{filter.label}</option>
              ))}
            </select>
          </label>
        </div>

        <ReturnCalendar
          rentals={visibleRentals}
          view={calendarView}
          onViewChange={setCalendarView}
          onVisibleRangeChange={handleVisibleRangeChange}
          onEventClick={setSelectedRental}
          isLoading={isLoading}
          error={error}
        />
      </div>

      {selectedRental && (
        <ReturnDetailModal
          rental={selectedRental}
          inventory={inventory}
          categories={categories}
          onClose={() => setSelectedRental(null)}
          onProcessReturn={onProcessReturn}
          onUpdateRental={onUpdateRental}
          onRecordRentalPayment={onRecordRentalPayment}
          onRecordPayment={onRecordPayment}
        />
      )}
    </div>
  );
}

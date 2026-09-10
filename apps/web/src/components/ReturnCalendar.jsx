import React, { useEffect, useMemo, useRef, useState } from 'react';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.css';
import FullCalendar from '@fullcalendar/react';
import idLocale from '@fullcalendar/core/locales/id';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import { formatJakartaDateLabel, getCurrentJakartaDateKey, toJakartaDateKey } from '../lib/financial';
import { toReturnCalendarEvents } from '../lib/returnCalendar';
import './ReturnCalendar.css';

const VIEW_OPTIONS = [
  { value: 'dayGridMonth', label: 'Bulan' },
  { value: 'timeGridWeek', label: 'Minggu' },
  { value: 'timeGridDay', label: 'Hari' },
];

function getRangeEndDate(dateValue) {
  const end = new Date(dateValue);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return end;
}

function dateKeyToDate(dateKey) {
  const date = new Date(String(dateKey || '') + 'T00:00:00+07:00');
  return Number.isNaN(date.getTime()) ? null : date;
}

function shiftDateKey(dateKey, amount) {
  const date = dateKeyToDate(dateKey) || new Date();
  date.setDate(date.getDate() + amount);
  return toJakartaDateKey(date);
}

function getPaymentTone(paymentStatus) {
  const status = String(paymentStatus || '').toUpperCase();
  if (status === 'LUNAS') return 'paid';
  if (status === 'DP') return 'partial';
  return 'unpaid';
}

function getPaymentLabel(paymentStatus) {
  const status = String(paymentStatus || '').toUpperCase();
  if (status === 'LUNAS') return 'Lunas';
  if (status === 'DP') return 'DP';
  return 'Belum bayar';
}

function renderEventContent(eventInfo, onEventClick) {
  const { event } = eventInfo;
  const { customerName, paymentStatus } = event.extendedProps;

  return (
    <div
      data-testid={'return-rental-heading-' + event.id}
      className="return-calendar-event"
      title={customerName + ' - ' + paymentStatus}
      aria-label={customerName + ' - ' + paymentStatus}
      role="button"
      tabIndex={0}
      onClick={() => onEventClick?.(event.extendedProps.rental || null)}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
          keyboardEvent.preventDefault();
          onEventClick?.(event.extendedProps.rental || null);
        }
      }}
    >
      <div className="truncate font-semibold">{customerName}</div>
    </div>
  );
}

function MobileReturnAgenda({
  events,
  selectedDate,
  dateInputRef,
  onOpenDatePicker,
  onShiftDate,
  onToday,
  onEventClick,
  isLoading,
}) {
  const selectedDateValue = dateKeyToDate(selectedDate);
  const selectedDateLabel = selectedDateValue
    ? formatJakartaDateLabel(selectedDateValue)
    : 'Pilih tanggal';

  return (
    <div data-testid="return-mobile-agenda" className="return-calendar-mobile">
      <div className="return-mobile-date-toolbar">
        <button type="button" aria-label="Tanggal sebelumnya" title="Tanggal sebelumnya" className="return-mobile-icon-button" onClick={() => onShiftDate(-1)}>
          <i className="fas fa-chevron-left" aria-hidden="true"></i>
        </button>
        <button type="button" aria-label="Pilih tanggal pengembalian" title="Pilih tanggal pengembalian" className="return-mobile-date-button" onClick={onOpenDatePicker}>
          <i className="fas fa-calendar-days" aria-hidden="true"></i>
          <span>{selectedDateLabel}</span>
        </button>
        <button type="button" aria-label="Tanggal berikutnya" title="Tanggal berikutnya" className="return-mobile-icon-button" onClick={() => onShiftDate(1)}>
          <i className="fas fa-chevron-right" aria-hidden="true"></i>
        </button>
        <button type="button" aria-label="Hari ini" className="return-mobile-today-button" onClick={onToday}>Hari ini</button>
        <input ref={dateInputRef} type="text" tabIndex={-1} aria-hidden="true" className="return-mobile-date-input" />
      </div>

      {isLoading && <div aria-label="Memuat kalender" className="return-mobile-loading">Memuat jadwal...</div>}

      <div className="return-mobile-event-list">
        {events.length > 0 ? events.map((event) => {
          const { customerName, paymentStatus, dueDate } = event.extendedProps;
          const dueLabel = dueDate ? formatJakartaDateLabel(dueDate, true) : '-';
          return (
            <button
              key={event.id}
              type="button"
              data-testid={'return-mobile-rental-' + event.id}
              className={'return-mobile-event return-mobile-event--' + getPaymentTone(paymentStatus)}
              onClick={() => onEventClick?.(event.extendedProps.rental || null)}
            >
              <span className="return-mobile-event-name">{customerName}</span>
              <span className="return-mobile-event-meta">{dueLabel}</span>
              <span className="return-mobile-event-status">{getPaymentLabel(paymentStatus)}</span>
            </button>
          );
        }) : (
          <div className="return-mobile-empty">Tidak ada pengembalian pada tanggal ini.</div>
        )}
      </div>
    </div>
  );
}

export default function ReturnCalendar({
  rentals = [],
  view = 'dayGridMonth',
  onViewChange,
  onEventClick,
  onVisibleRangeChange,
  isLoading = false,
  error = '',
}) {
  const calendarRef = useRef(null);
  const mobileDateInputRef = useRef(null);
  const mobilePickerRef = useRef(null);
  const [mobileSelectedDate, setMobileSelectedDate] = useState(() => getCurrentJakartaDateKey());
  const mobileInitialDateRef = useRef(mobileSelectedDate);
  const events = useMemo(() => toReturnCalendarEvents(rentals), [rentals]);
  const mobileEvents = useMemo(
    () => events.filter((event) => toJakartaDateKey(event.start) === mobileSelectedDate),
    [events, mobileSelectedDate],
  );

  useEffect(() => {
    const api = calendarRef.current?.getApi?.();
    if (api && api.view.type !== view) {
      api.changeView(view);
    }
  }, [view]);

  const selectMobileDate = (nextDate) => {
    if (!nextDate) return;
    setMobileSelectedDate(nextDate);
    calendarRef.current?.getApi?.()?.gotoDate(nextDate);
  };

  useEffect(() => {
    if (!mobileDateInputRef.current) return undefined;

    mobilePickerRef.current = flatpickr(mobileDateInputRef.current, {
      defaultDate: dateKeyToDate(mobileInitialDateRef.current),
      dateFormat: 'Y-m-d',
      disableMobile: true,
      onChange: (selectedDates) => {
        const nextDate = selectedDates[0] ? toJakartaDateKey(selectedDates[0]) : '';
        selectMobileDate(nextDate);
      },
    });

    return () => {
      mobilePickerRef.current?.destroy();
      mobilePickerRef.current = null;
    };
  }, []);

  useEffect(() => {
    mobilePickerRef.current?.setDate(dateKeyToDate(mobileSelectedDate), false);
  }, [mobileSelectedDate]);

  const handleMobileShift = (amount) => {
    selectMobileDate(shiftDateKey(mobileSelectedDate, amount));
  };

  const handleDatesSet = (info) => {
    onVisibleRangeChange?.({
      startDate: toJakartaDateKey(info.start),
      endDate: toJakartaDateKey(getRangeEndDate(info.end)),
      view: info.view.type,
    });
  };

  const handleEventClick = (info) => {
    info.jsEvent.preventDefault();
    onEventClick?.(info.event.extendedProps.rental || null);
  };

  return (
    <section data-testid="return-calendar-shell" className="return-calendar-shell min-h-0 flex-1 border border-border bg-card-bg">
      {error && (
        <div role="alert" className="return-calendar-error border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div aria-label="Tampilan kalender" className="return-calendar-desktop-controls flex items-center justify-end border-b border-border px-4 py-2">
        <div className="flex items-center gap-1 border border-border bg-secondary p-1">
          {VIEW_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={view === option.value}
              onClick={() => onViewChange?.(option.value)}
              className={view === option.value
                ? 'bg-accent px-3 py-1.5 text-xs font-semibold text-white'
                : 'px-3 py-1.5 text-xs font-semibold text-text-muted hover:bg-surface-hover hover:text-text-main'}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="return-calendar-scroll min-h-0 flex-1 overflow-visible p-3">
        <div className={'return-calendar-desktop' + (isLoading ? ' is-loading' : '')}>
          <div className="return-calendar-frame">
            {isLoading && (
              <div aria-label="Memuat kalender" className="return-calendar-loading">
                Memuat jadwal...
              </div>
            )}
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
              initialView={view}
              timeZone="Asia/Jakarta"
              locale="id"
              locales={[idLocale]}
              firstDay={1}
              height="100%"
              headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
              buttonText={{ today: 'Hari ini' }}
              events={events}
              eventContent={(eventInfo) => renderEventContent(eventInfo, onEventClick)}
              eventClick={handleEventClick}
              datesSet={handleDatesSet}
              dayMaxEvents={false}
              nowIndicator
              noEventsText="Tidak ada jadwal pengembalian"
              eventDisplay="block"
            />
          </div>
        </div>

        <MobileReturnAgenda
          events={mobileEvents}
          selectedDate={mobileSelectedDate}
          dateInputRef={mobileDateInputRef}
          onOpenDatePicker={() => mobilePickerRef.current?.open()}
          onShiftDate={handleMobileShift}
          onToday={() => selectMobileDate(getCurrentJakartaDateKey())}
          onEventClick={onEventClick}
          isLoading={isLoading}
        />
      </div>
    </section>
  );
}
import React, { useEffect, useMemo, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import idLocale from '@fullcalendar/core/locales/id';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import { toJakartaDateKey } from '../lib/financial';
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
  const events = useMemo(() => toReturnCalendarEvents(rentals), [rentals]);

  useEffect(() => {
    const api = calendarRef.current?.getApi?.();
    if (api && api.view.type !== view) {
      api.changeView(view);
    }
  }, [view]);

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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-base font-bold text-text-main">Jadwal Pengembalian</h2>
          <p className="text-xs text-text-muted">Klik sewaan untuk membuka detail dan proses pengembalian.</p>
        </div>
        <div aria-label="Tampilan kalender" className="flex items-center gap-1 border border-border bg-secondary p-1">
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

      <div className="return-calendar-scroll custom-scrollbar min-h-0 flex-1 overflow-auto p-3">
        {error && (
          <div role="alert" className="mb-3 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className={'return-calendar-frame' + (isLoading ? ' is-loading' : '')}>
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
    </section>
  );
}

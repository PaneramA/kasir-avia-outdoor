import React, { useEffect, useRef } from 'react';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.css';

const padDatePart = (value) => String(value).padStart(2, '0');

const formatDateTimeLocalValue = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  const hours = padDatePart(date.getHours());
  const minutes = padDatePart(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const parseDateTimeLocalValue = (value) => {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const RentalDateRangePicker = ({
  startAt = '',
  endAt = '',
  onChange,
  className = '',
  error = false,
  fieldKey = 'shared-rentalRange',
  describedBy,
}) => {
  const inputRef = useRef(null);
  const pickerRef = useRef(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!inputRef.current) {
      return undefined;
    }

    pickerRef.current = flatpickr(inputRef.current, {
      mode: 'range',
      enableTime: true,
      time_24hr: true,
      minuteIncrement: 15,
      dateFormat: 'd M Y H:i',
      allowInput: true,
      disableMobile: true,
      locale: {
        rangeSeparator: ' - ',
      },
      onChange: (selectedDates) => {
        const [startDate, endDate] = selectedDates;
        onChangeRef.current?.(
          formatDateTimeLocalValue(startDate),
          formatDateTimeLocalValue(endDate),
        );
      },
    });

    return () => {
      pickerRef.current?.destroy();
      pickerRef.current = null;
    };
  }, []);

  useEffect(() => {
    pickerRef.current?.setDate([parseDateTimeLocalValue(startAt), parseDateTimeLocalValue(endAt)].filter(Boolean), false);
  }, [startAt, endAt]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        ref={inputRef}
        className={`${className} rental-date-range-input ${error ? 'border-[#c0392b]' : ''}`.trim()}
        type="text"
        data-rental-field={fieldKey}
        aria-invalid={error}
        aria-describedby={describedBy}
        placeholder="Pilih tanggal & jam mulai - selesai"
      />
      <button
        type="button"
        aria-label="Pilih tanggal sewa"
        title="Pilih tanggal sewa"
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-[#146c43] bg-[#146c43] px-4 text-sm font-bold text-white transition hover:bg-[#0f5132]"
        onClick={() => pickerRef.current?.open()}
      >
        <i className="fas fa-calendar-days" aria-hidden="true"></i>
        <span>Pilih tanggal</span>
      </button>
    </div>
  );
};

export default RentalDateRangePicker;

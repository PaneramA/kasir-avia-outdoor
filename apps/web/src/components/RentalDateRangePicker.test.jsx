// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RentalDateRangePicker from './RentalDateRangePicker.jsx';

let lastFlatpickrConfig;
const destroyMock = vi.fn();
const setDateMock = vi.fn();

vi.mock('flatpickr', () => ({
  default: vi.fn((element, config) => {
    lastFlatpickrConfig = config;
    element._flatpickrConfig = config;
    return {
      destroy: destroyMock,
      setDate: setDateMock,
    };
  }),
}));

vi.mock('flatpickr/dist/flatpickr.css', () => ({}));

describe('RentalDateRangePicker', () => {
  beforeEach(() => {
    lastFlatpickrConfig = undefined;
    destroyMock.mockClear();
    setDateMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('initializes flatpickr as a 24-hour date-time range picker', async () => {
    const flatpickr = (await import('flatpickr')).default;

    render(
      <RentalDateRangePicker
        startAt="2026-07-26T10:00"
        endAt="2026-07-28T10:00"
        onChange={vi.fn()}
        fieldKey="desktop-rentalRange"
      />,
    );

    expect(flatpickr).toHaveBeenCalledTimes(1);
    expect(lastFlatpickrConfig).toMatchObject({
      mode: 'range',
      enableTime: true,
      time_24hr: true,
      minuteIncrement: 15,
      allowInput: true,
    });
    expect(setDateMock).toHaveBeenCalledWith(['2026-07-26T10:00', '2026-07-28T10:00'], false);
    expect(screen.getByPlaceholderText('Pilih tanggal & jam mulai - selesai')).toHaveAttribute('data-rental-field', 'desktop-rentalRange');
  });

  it('emits formatted start and end values when range is complete', () => {
    const onChange = vi.fn();

    render(<RentalDateRangePicker onChange={onChange} />);

    lastFlatpickrConfig.onChange([
      new Date('2026-07-26T10:00:00'),
      new Date('2026-07-28T12:15:00'),
    ]);

    expect(onChange).toHaveBeenCalledWith('2026-07-26T10:00', '2026-07-28T12:15');
  });

  it('clears end value when only the start date is selected', () => {
    const onChange = vi.fn();

    render(<RentalDateRangePicker onChange={onChange} />);

    lastFlatpickrConfig.onChange([new Date('2026-07-26T10:00:00')]);

    expect(onChange).toHaveBeenCalledWith('2026-07-26T10:00', '');
  });

  it('destroys flatpickr on unmount', () => {
    const { unmount } = render(<RentalDateRangePicker onChange={vi.fn()} />);

    unmount();

    expect(destroyMock).toHaveBeenCalledTimes(1);
  });
});

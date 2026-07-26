// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Return from './Return.jsx';

const activeOverdueRental = {
  id: 'RTR-001',
  status: 'Active',
  date: '2026-07-20T03:00:00.000Z',
  plannedReturnDate: '2026-07-24T03:00:00.000Z',
  duration: 2,
  total: 200000,
  customer: {
    name: 'Ayu Pratiwi',
    phone: '08123456789',
  },
  items: [
    {
      id: 'item-1',
      name: 'Tenda Dome',
      qty: 1,
      price: 100000,
    },
  ],
  payment: {
    status: 'DP',
    paidAmount: 50000,
    totalDue: 200000,
    remainingAmount: 150000,
  },
};

function getClassNames(container) {
  return Array.from(container.querySelectorAll('[class]'))
    .map((element) => element.className)
    .join(' ');
}

describe('Return page theme', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-26T05:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the solid white-green theme instead of the legacy orange return styling', () => {
    const { container } = render(
      <Return rentals={[activeOverdueRental]} onProcessReturn={vi.fn()} />,
    );

    fireEvent.click(screen.getByText('Ayu Pratiwi'));

    const classNames = getClassNames(container);
    expect(classNames).not.toMatch(/#d97706|#ffedd5|#fff3e6|#fff1e5|#c76410|#8f4100|#2ecc71|#27ae60/);
    expect(classNames).not.toContain('shadow-[0_4px_15px');
    expect(classNames).not.toContain('rounded-lg');

    const submitButton = screen.getByRole('button', { name: /selesaikan pengembalian/i });
    expect(submitButton.className).toContain('rounded-md');
    expect(submitButton.className).toContain('bg-accent');
    expect(submitButton.className).toContain('hover:bg-accent-hover');
  });
});

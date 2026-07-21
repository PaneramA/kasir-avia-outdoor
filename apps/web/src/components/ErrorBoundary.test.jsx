// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary.jsx';

function BrokenView() {
  throw new Error('Inventaris gagal dirender');
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ErrorBoundary', () => {
  it('contains a render crash and shows a recoverable fallback', () => {
    render(<ErrorBoundary resetKey="inventory"><BrokenView /></ErrorBoundary>);
    expect(screen.getByText('Tampilan halaman bermasalah.')).toBeInTheDocument();
    expect(screen.getByText('Inventaris gagal dirender')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Muat ulang aplikasi' })).toBeInTheDocument();
  });

  it('clears an old error when the route reset key changes', () => {
    const view = render(<ErrorBoundary resetKey="inventory"><BrokenView /></ErrorBoundary>);
    view.rerender(<ErrorBoundary resetKey="rental"><div>Rental aman</div></ErrorBoundary>);
    expect(screen.getByText('Rental aman')).toBeInTheDocument();
    expect(screen.queryByText('Inventaris gagal dirender')).not.toBeInTheDocument();
  });
});

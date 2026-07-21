// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPlans, fetchTenants } from '../lib/api.js';
import AdminOverview from './AdminOverview.jsx';

vi.mock('../lib/api.js', () => ({
  fetchTenants: vi.fn(),
  fetchPlans: vi.fn(),
}));

beforeEach(() => {
  fetchTenants.mockResolvedValue([
    { id: 't1', name: 'Toko Aktif', slug: 'aktif', status: 'active', createdAt: '2026-07-01', subscription: { plan: { name: 'Basic' } } },
    { id: 't2', name: 'Toko Review', slug: 'review', status: 'suspended', createdAt: '2026-07-02', subscription: null },
  ]);
  fetchPlans.mockResolvedValue([
    { id: 'p1', name: 'Basic', status: 'active' },
    { id: 'p2', name: 'Legacy', status: 'inactive' },
  ]);
});

describe('AdminOverview SWR state', () => {
  it('renders cached server data and deduplicates equal fetch keys', async () => {
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 10_000 }}>
        <MemoryRouter>
          <AdminOverview currentUser={{ username: 'admin' }} />
          <AdminOverview currentUser={{ username: 'admin' }} />
        </MemoryRouter>
      </SWRConfig>,
    );

    await waitFor(() => expect(screen.getAllByText('Toko Aktif')).toHaveLength(2));
    expect(fetchTenants).toHaveBeenCalledOnce();
    expect(fetchPlans).toHaveBeenCalledOnce();
    expect(screen.getAllByText('1 toko perlu ditinjau')).toHaveLength(2);
  });
});

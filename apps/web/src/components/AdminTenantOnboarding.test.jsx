// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onboardTenant } from '../lib/api.js';
import AdminTenantOnboarding from './AdminTenantOnboarding.jsx';

vi.mock('../lib/api.js', () => ({ onboardTenant: vi.fn() }));

const plans = [{ id: 'plan-basic', name: 'Basic', priceAmount: 100_000, status: 'active' }];

beforeEach(() => {
  onboardTenant.mockReset();
});

describe('admin tenant onboarding wizard', () => {
  it('prevents incomplete owner data from advancing', async () => {
    const user = userEvent.setup();
    render(<AdminTenantOnboarding plans={plans} onClose={vi.fn()} onCreated={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Lanjut' }));
    expect(screen.getByText('Nama dan slug toko wajib diisi.')).toBeInTheDocument();
    expect(screen.getByText('Tahap 1 dari 3')).toBeInTheDocument();
  });

  it('submits a complete atomic onboarding payload and shows credentials', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    onboardTenant.mockResolvedValue({
      tenant: { id: 'tenant-1', name: 'Toko Vitest' },
      owner: { id: 'owner-1', username: 'ownervitest' },
      initialBranch: { id: 'branch-1' },
    });
    const { container } = render(
      <AdminTenantOnboarding plans={plans} onClose={vi.fn()} onCreated={onCreated} />,
    );

    const textInputs = screen.getAllByRole('textbox');
    await user.type(textInputs[0], 'Toko Vitest');
    await user.type(textInputs[2], 'ownervitest');
    await user.type(container.querySelector('input[type="password"]'), 'Password123!');
    expect(textInputs[1]).toHaveValue('toko-vitest');

    await user.click(screen.getByRole('button', { name: 'Lanjut' }));
    expect(screen.getByText('Tahap 2 dari 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Lanjut' }));
    expect(screen.getByText('Tahap 3 dari 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Buat toko & owner/i }));

    await waitFor(() => expect(onboardTenant).toHaveBeenCalledOnce());
    expect(onboardTenant).toHaveBeenCalledWith(expect.objectContaining({
      storeName: 'Toko Vitest',
      storeSlug: 'toko-vitest',
      ownerUsername: 'ownervitest',
      ownerPassword: 'Password123!',
      planId: 'plan-basic',
      initialBranchCode: 'pusat',
    }));
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ tenant: { id: 'tenant-1', name: 'Toko Vitest' } }));
    expect(await screen.findByText('Toko berhasil dibuat')).toBeInTheDocument();
    expect(screen.getByText('Password123!')).toBeInTheDocument();
  });
});

// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Inventory from './Inventory.jsx';

const swr = vi.hoisted(() => ({
  data: [],
  setSize: vi.fn(),
}));

vi.mock('swr/infinite', () => ({
  default: () => ({
    data: swr.data,
    error: null,
    isLoading: false,
    isValidating: false,
    setSize: swr.setSize,
  }),
}));

vi.mock('../lib/api', () => ({
  fetchItemsPage: vi.fn(),
  resolveApiAssetUrl: (value) => value,
  uploadItemImage: vi.fn(),
}));

describe('Inventory archive controls', () => {
  beforeEach(() => {
    swr.data = [{
      items: [{
        id: 'item-1',
        name: 'Tenda Arsip',
        category: 'Tenda',
        stock: 2,
        price: 50_000,
        image: '',
        archivedAt: '2026-07-22T00:00:00.000Z',
      }],
      nextCursor: null,
    }];
    swr.setSize.mockReset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('switches between archive and restore actions', async () => {
    const user = userEvent.setup();
    const onDeleteItem = vi.fn().mockResolvedValue(undefined);
    const onRestoreItem = vi.fn().mockResolvedValue(undefined);

    render(
      <Inventory
        tenantId="tenant-1"
        branchId="branch-1"
        categories={['Tenda']}
        onSaveItem={vi.fn()}
        onDeleteItem={onDeleteItem}
        onRestoreItem={onRestoreItem}
        onAddCategory={vi.fn()}
        onDeleteCategory={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Arsipkan Tenda Arsip' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Diarsipkan' }));
    await user.click(screen.getByRole('button', { name: 'Pulihkan Tenda Arsip' }));

    expect(onRestoreItem).toHaveBeenCalledWith('item-1');
    expect(onDeleteItem).not.toHaveBeenCalled();
  });

  it('keeps the inventory toolbar simple without import and template actions', () => {
    render(
      <Inventory
        tenantId="tenant-1"
        branchId="branch-1"
        categories={['Tenda']}
        onSaveItem={vi.fn()}
        onDeleteItem={vi.fn()}
        onRestoreItem={vi.fn()}
        onAddCategory={vi.fn()}
        onDeleteCategory={vi.fn()}
      />,
    );

    expect(screen.queryByRole('heading', { name: 'Daftar Barang' })).toBeNull();
    expect(screen.queryByRole('button', { name: /download template/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /import csv\/excel/i })).toBeNull();
    expect(screen.queryByText(/kolom wajib import/i)).toBeNull();
    expect(screen.getByTestId('inventory-status-tabs')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kategori' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tambah Barang' })).toBeTruthy();
  });
});

// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminLayout from './AdminLayout.jsx';
import CategoryModal from './CategoryModal.jsx';
import Header from './Header.jsx';
import ItemModal from './ItemModal.jsx';
import ReceiptModal from './ReceiptModal.jsx';
import Sidebar from './Sidebar.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import ViewModeToggle from './ViewModeToggle.jsx';

const rental = {
  id: 'INV-TEST', date: '2026-07-01T10:00:00Z', duration: 1, total: 50_000,
  customer: { name: 'Customer Test', phone: '0812' },
  items: [{ id: 'i1', name: 'Tenda', qty: 1, price: 50_000 }],
  payment: { status: 'LUNAS', method: 'TUNAI', paidAmount: 50_000 },
};

function withRouter(node, initialEntries = ['/dashboard']) {
  return render(<MemoryRouter initialEntries={initialEntries}>{node}</MemoryRouter>);
}

describe('shared component smoke and interaction tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('switches view mode through an accessible segmented control', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ViewModeToggle value="grid" onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Kartu Besar' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'List Kecil' }));
    expect(onChange).toHaveBeenCalledWith('list');
  });

  it('persists theme changes on the document', async () => {
    const user = userEvent.setup();
    localStorage.clear();
    render(<ThemeToggle />);
    await user.click(screen.getByRole('button', { name: 'Ganti mode tema' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem('avia_theme')).toBe('dark');
  });

  it('renders inventory edit and category dialogs only when open', () => {
    const { rerender } = render(<ItemModal isOpen={false} setIsOpen={vi.fn()} editingItem={null} categories={['Tenda']} onSaveItem={vi.fn()} />);
    expect(screen.queryByText('Tambah Barang Baru')).not.toBeInTheDocument();
    rerender(<ItemModal isOpen setIsOpen={vi.fn()} editingItem={null} categories={['Tenda']} onSaveItem={vi.fn()} />);
    expect(screen.getByText('Tambah Barang Baru')).toBeInTheDocument();

    rerender(<CategoryModal isOpen setIsOpen={vi.fn()} categories={['Tenda']} onAddCategory={vi.fn()} onDeleteCategory={vi.fn()} />);
    expect(screen.getByText('Kelola Kategori')).toBeInTheDocument();
  });

  it('submits the last observed item version when editing inventory', async () => {
    const user = userEvent.setup();
    const onSaveItem = vi.fn().mockResolvedValue(undefined);
    const editingItem = {
      id: 'item-1',
      name: 'Tenda Dome',
      category: 'Tenda',
      stock: 4,
      price: 50_000,
      image: '',
      updatedAt: '2026-07-22T04:30:00.000Z',
    };

    render(
      <ItemModal
        isOpen
        setIsOpen={vi.fn()}
        editingItem={editingItem}
        categories={['Tenda']}
        onSaveItem={onSaveItem}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Update Barang' }));

    expect(onSaveItem).toHaveBeenCalledWith(
      expect.objectContaining({ expectedUpdatedAt: editingItem.updatedAt }),
      editingItem,
    );
  });

  it('renders a receipt with print and WhatsApp commands', () => {
    render(<ReceiptModal isOpen rental={rental} onClose={vi.fn()} onPrint={vi.fn()} onShareWhatsApp={vi.fn()} />);
    expect(screen.getByText('Customer Test')).toBeInTheDocument();
    expect(screen.getByText('INV-TEST')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share WA' })).toBeInTheDocument();
  });

  it('renders the operational sidebar with entitlement-aware navigation', () => {
    withRouter(<Sidebar
      currentUser={{ username: 'owner', role: 'kasir' }}
      subscriptionSummary={{ features: { canUseFinancialRecap: false, canManageBranches: false, canManageStaff: false } }}
      onLogout={vi.fn()}
      isMobileOpen={false}
      onCloseMobile={vi.fn()}
    />);
    expect(screen.getByText('Inventaris')).toBeInTheDocument();
    expect(screen.queryByText('Keuangan')).not.toBeInTheDocument();
  });

  it('uses a compact active sidebar indicator instead of a filled block', () => {
    withRouter(<Sidebar
      currentUser={{ username: 'owner', role: 'kasir' }}
      subscriptionSummary={{ features: { canUseFinancialRecap: true, canManageBranches: true, canManageStaff: true } }}
      onLogout={vi.fn()}
      isMobileOpen={false}
      onCloseMobile={vi.fn()}
    />, ['/rental']);

    const rentalLink = screen.getByRole('link', { name: /sewa barang/i });
    expect(rentalLink.className).toContain('border-l-2');
    expect(rentalLink.className).not.toContain('bg-accent');
    expect(rentalLink.className).not.toContain('shadow-');
  });

  it('collapses the operational sidebar into an icon-only desktop rail', async () => {
    const user = userEvent.setup();
    withRouter(<Sidebar
      currentUser={{ username: 'owner', role: 'kasir' }}
      subscriptionSummary={{ features: { canUseFinancialRecap: true, canManageBranches: true, canManageStaff: true } }}
      onLogout={vi.fn()}
      isMobileOpen={false}
      onCloseMobile={vi.fn()}
    />, ['/rental']);

    const sidebar = screen.getByRole('complementary', { name: /navigasi utama/i });
    await user.click(screen.getByRole('button', { name: /tutup sidebar/i }));

    expect(sidebar.className).toContain('lg:w-[72px]');
    expect(localStorage.getItem('avia_sidebar_collapsed')).toBe('true');
    expect(screen.getByRole('button', { name: /buka sidebar/i })).toBeInTheDocument();
  });

  it('renders the header and tenant selectors', () => {
    withRouter(<Header
      title="Dashboard"
      subtitle="Ringkasan"
      onOpenSidebar={vi.fn()}
      tenantOptions={[{ id: 't1', name: 'Toko Satu' }]}
      branchOptions={[{ id: 'b1', name: 'Pusat' }]}
      activeTenantId="t1"
      activeBranchId="b1"
      onTenantChange={vi.fn()}
      onBranchChange={vi.fn()}
    />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('Toko Satu')).toHaveLength(2);
    expect(screen.getAllByDisplayValue('Pusat')).toHaveLength(2);
  });

  it('renders the dedicated admin shell and its children', () => {
    withRouter(
      <AdminLayout currentUser={{ username: 'platform', role: 'superuser' }} onLogout={vi.fn()}>
        <div>Konten admin</div>
      </AdminLayout>,
      ['/admin'],
    );
    expect(screen.getByText('Avia Admin')).toBeInTheDocument();
    expect(screen.getByText('Konten admin')).toBeInTheDocument();
    expect(screen.getByText('Paket & Fitur')).toBeInTheDocument();
  });
});

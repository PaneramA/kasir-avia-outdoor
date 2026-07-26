// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Rental from './Rental.jsx';

vi.mock('../lib/api', () => ({
  fetchCustomers: vi.fn().mockResolvedValue([]),
}));

const inventory = [
  {
    id: 'item-1',
    name: 'Tenda Dome 4p',
    category: 'Tenda',
    stock: 2,
    price: 55000,
    image: 'https://example.invalid/tenda.jpg',
  },
  {
    id: 'item-2',
    name: 'Kompor Portable',
    category: 'Alat Masak',
    stock: 0,
    price: 15000,
    image: 'https://example.invalid/kompor.jpg',
  },
];

function RentalHarness() {
  const [cart, setCart] = useState([]);

  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <Rental
        inventory={inventory}
        categories={['Tenda', 'Alat Masak']}
        cart={cart}
        setCart={setCart}
        onCheckout={vi.fn()}
        currentUser={{ username: 'kasir', role: 'kasir' }}
        tenantSettings={null}
      />
    </SWRConfig>
  );
}

function renderRental() {
  return render(<RentalHarness />);
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('Rental page item picker', () => {
  it('renders inventory as text rows without item images', () => {
    renderRental();

    expect(screen.getByText('Tenda Dome 4p')).toBeInTheDocument();
    expect(screen.getAllByText('Alat Masak').length).toBeGreaterThan(0);
    expect(screen.getByText(/Rp 55.000/i)).toBeInTheDocument();
    expect(screen.queryByAltText('Tenda Dome 4p')).not.toBeInTheDocument();
    expect(document.querySelector('img[src="https://example.invalid/tenda.jpg"]')).toBeNull();
  });

  it('filters the text item list by search keyword', () => {
    renderRental();

    fireEvent.change(screen.getByPlaceholderText(/cari barang atau kategori/i), {
      target: { value: 'kompor' },
    });

    expect(screen.getByText('Kompor Portable')).toBeInTheDocument();
    expect(screen.queryByText('Tenda Dome 4p')).not.toBeInTheDocument();
  });

  it('adds and removes item quantities from the inventory row stepper', () => {
    renderRental();

    const row = screen.getByTestId('rental-inventory-row-item-1');
    fireEvent.click(within(row).getByRole('button', { name: /tambah tenda dome 4p/i }));
    expect(within(row).getByText('1')).toBeInTheDocument();
    expect(screen.getAllByText(/Tenda Dome 4p/i).length).toBeGreaterThan(0);

    fireEvent.click(within(row).getByRole('button', { name: /kurangi tenda dome 4p/i }));
    expect(within(row).getByText('0')).toBeInTheDocument();
  });
});

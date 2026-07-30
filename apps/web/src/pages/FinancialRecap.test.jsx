// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FinancialRecap from './FinancialRecap.jsx'
import * as api from '../lib/api'

const xlsxMock = vi.hoisted(() => ({
  aoaToSheet: vi.fn(() => ({})),
  bookAppendSheet: vi.fn(),
  bookNew: vi.fn(() => ({})),
  writeFile: vi.fn(),
}))

vi.mock('../lib/api', () => ({
  createExpense: vi.fn(),
  deleteExpense: vi.fn(),
  fetchExpensesPage: vi.fn(),
  fetchFinancialRecapPage: vi.fn(),
  updateExpense: vi.fn(),
}))

vi.mock('xlsx', () => ({
  utils: {
    aoa_to_sheet: xlsxMock.aoaToSheet,
    book_append_sheet: xlsxMock.bookAppendSheet,
    book_new: xlsxMock.bookNew,
  },
  writeFile: xlsxMock.writeFile,
}))

const summary = {
  startDate: '2026-07-01',
  endDate: '2026-07-31',
  totalRevenue: 200000,
  invoiceRevenue: 200000,
  cashReceived: 150000,
  receivables: 50000,
  totalExpenses: 25000,
  netProfit: 125000,
  profitMargin: 0.8333,
  totalTransactions: 2,
  averageTransaction: 100000,
  methods: [{ method: 'TUNAI', count: 2, revenue: 200000 }],
  topItems: [{ key: 'Tenda:Tenda Dome', name: 'Tenda Dome', qty: 2, estimatedRevenue: 110000 }],
  monthlyTrend: [{ monthKey: '2026-07', revenue: 200000, transactions: 2 }],
  availableMonths: ['2026-07'],
  expenseCategories: [{ category: 'Laundry', amount: 25000, count: 1 }],
}

function renderFinance() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <FinancialRecap
        userId="user-1"
        tenantId="tenant-1"
        branchId="branch-1"
        tenantSettings={{ financialClosingDay: 31 }}
        canExportData
      />
    </SWRConfig>,
  )
}

describe('FinancialRecap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.fetchFinancialRecapPage.mockResolvedValue({
      summary,
      items: [{
        id: 'rental-1',
        date: '2026-07-30T04:00:00.000Z',
        customer: { name: 'Naufal' },
        payment: { method: 'TUNAI', status: 'DP', paidAmount: 50000, remainingAmount: 50000, totalDue: 100000 },
        total: 100000,
      }],
      nextCursor: null,
    })
    api.fetchExpensesPage.mockResolvedValue({
      summary: { totalExpenses: 25000, categories: [{ category: 'Laundry', amount: 25000, count: 1 }] },
      items: [{
        id: 'expense-1',
        date: '2026-07-30T00:00:00.000Z',
        category: 'Laundry',
        description: 'Cuci tenda',
        amount: 25000,
        paymentMethod: 'TUNAI',
        notes: '',
      }],
      nextCursor: null,
    })
  })

  it('shows cash-based finance KPIs and expense tab', async () => {
    renderFinance()

    expect(await screen.findByText('Omzet sewa')).toBeInTheDocument()
    expect(screen.getByText('Uang diterima')).toBeInTheDocument()
    expect(screen.getByText('Piutang')).toBeInTheDocument()
    expect(screen.getAllByText('Pengeluaran').length).toBeGreaterThan(0)
    expect(screen.getByText('Laba/Rugi')).toBeInTheDocument()
    expect(screen.getByText('Rp 125.000')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^Pengeluaran$/i }))

    expect(await screen.findByText('Cuci tenda')).toBeInTheDocument()
    expect(screen.getByText('Laundry')).toBeInTheDocument()
  })

  it('creates an expense and refreshes finance data', async () => {
    api.createExpense.mockResolvedValue({ id: 'expense-2' })
    const user = userEvent.setup()

    renderFinance()

    await user.click(await screen.findByRole('button', { name: /Tambah Pengeluaran/i }))
    const fetchCountBeforeSubmit = api.fetchExpensesPage.mock.calls.length
    await user.type(screen.getByLabelText(/Kategori/i), 'Repair')
    await user.type(screen.getByLabelText(/Deskripsi/i), 'Ganti frame tenda')
    await user.clear(screen.getByLabelText(/Jumlah/i))
    await user.type(screen.getByLabelText(/Jumlah/i), '60000')
    await user.click(screen.getByRole('button', { name: /^Simpan$/i }))

    await waitFor(() => expect(api.createExpense).toHaveBeenCalledWith(expect.objectContaining({
      category: 'Repair',
      description: 'Ganti frame tenda',
      amount: 60000,
    })))
    await waitFor(() => expect(api.fetchExpensesPage.mock.calls.length).toBeGreaterThan(fetchCountBeforeSubmit))
  })

  it('exports Excel as readable multi-sheet workbook', async () => {
    const user = userEvent.setup()

    renderFinance()

    await user.click(await screen.findByRole('button', { name: /^Excel$/i }))

    await waitFor(() => expect(xlsxMock.writeFile).toHaveBeenCalled())
    expect(xlsxMock.bookAppendSheet.mock.calls.map((call) => call[2])).toEqual([
      'Ringkasan',
      'Transaksi',
      'Pengeluaran',
      'Kategori Pengeluaran',
      'Barang Terlaris',
      'Metode Bayar',
      'Catatan',
    ])
  })
})

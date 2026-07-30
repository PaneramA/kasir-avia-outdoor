import React, { useEffect, useMemo, useState } from 'react'
import useSWRInfinite from 'swr/infinite'
import {
  formatCurrency,
  formatJakartaDateLabel,
  formatMonthLabel,
  getCurrentFinancialMonthRangeDateKeys,
  getFinancialClosingDay,
  getFinancialMonthRangeDateKeys,
  toJakartaDateKey,
} from '../lib/financial'
import {
  createExpense,
  deleteExpense,
  fetchExpensesPage,
  fetchFinancialRecapPage,
  updateExpense,
} from '../lib/api'
import { APP_CACHE_KEYS } from '../lib/appCache'

const EMPTY_RECAP = {
  totalRevenue: 0,
  invoiceRevenue: 0,
  cashReceived: 0,
  receivables: 0,
  totalExpenses: 0,
  netProfit: 0,
  profitMargin: 0,
  totalTransactions: 0,
  averageTransaction: 0,
  methods: [],
  topItems: [],
  monthlyTrend: [],
  expenseCategories: [],
  availableMonths: [],
}

const EMPTY_EXPENSE_FORM = {
  date: '',
  category: '',
  description: '',
  amount: '0',
  paymentMethod: 'TUNAI',
  notes: '',
}

function triggerDownload(content, fileName, contentType) {
  const blob = new Blob([content], { type: contentType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function buildCsvRows(recap) {
  const rows = []
  rows.push(['Laporan Keuangan AviaOutdoor'])
  rows.push(['Periode', `${recap.startDate || '-'} s/d ${recap.endDate || '-'}`])
  rows.push(['Tanggal Tutup Buku', recap.financialClosingDay || 31])
  rows.push([])
  rows.push(['Ringkasan'])
  rows.push(['Total Pendapatan', recap.totalRevenue])
  rows.push(['Jumlah Transaksi', recap.totalTransactions])
  rows.push(['Rata-rata Transaksi', Math.round(recap.averageTransaction)])
  rows.push([])
  rows.push(['Metode Pembayaran', 'Jumlah Transaksi', 'Pendapatan'])
  recap.methods.forEach((method) => rows.push([method.method, method.count, Math.round(method.revenue)]))
  rows.push([])
  rows.push(['Top Barang', 'Qty', 'Estimasi Omzet'])
  recap.topItems.slice(0, 20).forEach((item) => rows.push([item.name, item.qty, Math.round(item.estimatedRevenue)]))
  rows.push([])
  rows.push(['Detail Transaksi', 'Tanggal', 'Pelanggan', 'Metode', 'Status Pembayaran', 'Total'])
  recap.filteredRentals.forEach((rental) => {
    rows.push([
      rental.id,
      formatJakartaDateLabel(rental.date, true),
      rental?.customer?.name || '-',
      rental?.payment?.method || 'TUNAI',
      rental?.payment?.status || 'LUNAS',
      Math.round(Number(rental?.finalTotal ?? rental?.total ?? 0)),
    ])
  })
  return rows
}

function escapeCsvCell(value) {
  const text = String(value ?? '')
  return text.includes(',') || text.includes('"') || text.includes('\n')
    ? `"${text.replace(/"/g, '""')}"`
    : text
}

function exportCsv(recap) {
  const csv = buildCsvRows(recap).map((row) => row.map(escapeCsvCell).join(',')).join('\n')
  triggerDownload(csv, `recap-keuangan-${recap.startDate || 'all'}_${recap.endDate || 'all'}.csv`, 'text/csv;charset=utf-8;')
}

async function exportExcel(recap) {
  const XLSX = await import('xlsx')
  const worksheet = XLSX.utils.aoa_to_sheet(buildCsvRows(recap))
  worksheet['!cols'] = [{ wch: 26 }, { wch: 24 }, { wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 18 }]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Recap Keuangan')
  XLSX.writeFile(workbook, `recap-keuangan-${recap.startDate || 'all'}_${recap.endDate || 'all'}.xlsx`)
}

function getRentalInvoiceAmount(rental) {
  return Number(rental?.payment?.totalDue ?? rental?.finalTotal ?? rental?.total ?? 0) || 0
}

function getRentalCashAmount(rental) {
  const invoiceAmount = getRentalInvoiceAmount(rental)
  const paymentStatus = String(rental?.payment?.status || 'LUNAS').toUpperCase()
  if (paymentStatus === 'DP') {
    return Math.min(invoiceAmount, Math.max(0, Number(rental?.payment?.paidAmount || 0) || 0))
  }
  return invoiceAmount
}

function getRentalReceivableAmount(rental) {
  const fallback = Math.max(0, getRentalInvoiceAmount(rental) - getRentalCashAmount(rental))
  return Number(rental?.payment?.remainingAmount ?? fallback) || 0
}

function getInitialExpenseForm() {
  return {
    ...EMPTY_EXPENSE_FORM,
    date: toJakartaDateKey(new Date()),
  }
}

const inputClass = 'min-h-10 w-full rounded-md border border-border bg-white px-3 text-sm text-text-main outline-none placeholder:text-text-muted focus:border-accent'
const secondaryButtonClass = 'min-h-10 rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-text-main transition hover:border-accent disabled:cursor-wait disabled:opacity-60'
const primaryButtonClass = 'min-h-10 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-wait disabled:opacity-60'

const FinancialRecap = ({ userId, tenantId, branchId, tenantSettings, canExportData = true }) => {
  const financialClosingDay = useMemo(() => getFinancialClosingDay(tenantSettings), [tenantSettings])
  const { monthKey: currentMonthKey, startDate: currentMonthStart, endDate: currentMonthEnd } = useMemo(
    () => getCurrentFinancialMonthRangeDateKeys(financialClosingDay),
    [financialClosingDay],
  )
  const [selectedMonthKey, setSelectedMonthKey] = useState(currentMonthKey)
  const [startDate, setStartDate] = useState(currentMonthStart)
  const [endDate, setEndDate] = useState(currentMonthEnd)
  const [activeView, setActiveView] = useState('summary')
  const [expenseQuery, setExpenseQuery] = useState('')
  const [debouncedExpenseQuery, setDebouncedExpenseQuery] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [message, setMessage] = useState('')
  const [messageError, setMessageError] = useState('')
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false)
  const [editingExpenseId, setEditingExpenseId] = useState('')
  const [expenseForm, setExpenseForm] = useState(getInitialExpenseForm)
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedExpenseQuery(expenseQuery.trim()), 250)
    return () => window.clearTimeout(timeoutId)
  }, [expenseQuery])

  const recapFilters = useMemo(() => ({ startDate, endDate }), [endDate, startDate])
  const expenseFilters = useMemo(
    () => ({ startDate, endDate, query: debouncedExpenseQuery }),
    [debouncedExpenseQuery, endDate, startDate],
  )

  const {
    data: recapPages = [],
    error: recapError,
    isLoading: isRecapLoading,
    isValidating: isRecapValidating,
    setSize: setRecapSize,
    mutate: mutateRecapPages,
  } = useSWRInfinite(
    (pageIndex, previousPageData) => {
      if (!userId || !tenantId || !branchId) return null
      if (pageIndex > 0 && !previousPageData?.nextCursor) return null
      return APP_CACHE_KEYS.financialRecap(
        userId,
        tenantId,
        branchId,
        recapFilters,
        pageIndex === 0 ? '' : previousPageData.nextCursor,
      )
    },
    ([, , , , filters, cursor]) => fetchFinancialRecapPage({ ...filters, cursor }),
    { keepPreviousData: true },
  )

  const {
    data: expensePages = [],
    error: expenseError,
    isLoading: isExpenseLoading,
    isValidating: isExpenseValidating,
    setSize: setExpenseSize,
    mutate: mutateExpensePages,
  } = useSWRInfinite(
    (pageIndex, previousPageData) => {
      if (!userId || !tenantId || !branchId) return null
      if (pageIndex > 0 && !previousPageData?.nextCursor) return null
      return APP_CACHE_KEYS.expenses(
        userId,
        tenantId,
        branchId,
        expenseFilters,
        pageIndex === 0 ? '' : previousPageData.nextCursor,
      )
    },
    ([, , , , filters, cursor]) => fetchExpensesPage({ ...filters, cursor }),
    { keepPreviousData: true },
  )

  useEffect(() => {
    void setRecapSize(1)
  }, [recapFilters, setRecapSize])

  useEffect(() => {
    void setExpenseSize(1)
  }, [expenseFilters, setExpenseSize])

  const recap = useMemo(() => {
    const summary = recapPages[0]?.summary || {}
    const invoiceRevenue = Number(summary.invoiceRevenue ?? summary.totalRevenue ?? 0)
    const cashReceived = Number(summary.cashReceived ?? invoiceRevenue)
    const receivables = Number(summary.receivables ?? 0)
    const totalExpenses = Number(summary.totalExpenses ?? 0)
    return {
      ...EMPTY_RECAP,
      ...summary,
      totalRevenue: Number(summary.totalRevenue ?? invoiceRevenue),
      invoiceRevenue,
      cashReceived,
      receivables,
      totalExpenses,
      netProfit: Number(summary.netProfit ?? cashReceived - totalExpenses),
      profitMargin: Number(summary.profitMargin ?? (cashReceived > 0 ? (cashReceived - totalExpenses) / cashReceived : 0)),
      financialClosingDay,
      filteredRentals: recapPages.flatMap((page) => (Array.isArray(page?.items) ? page.items : [])),
    }
  }, [financialClosingDay, recapPages])

  const expenses = useMemo(
    () => expensePages.flatMap((page) => (Array.isArray(page?.items) ? page.items : [])),
    [expensePages],
  )
  const expenseSummary = expensePages[0]?.summary || { totalExpenses: recap.totalExpenses, categories: recap.expenseCategories }
  const expenseCategories = Array.isArray(expenseSummary?.categories)
    ? expenseSummary.categories
    : recap.expenseCategories
  const monthOptions = useMemo(() => [...new Set([currentMonthKey, ...recap.availableMonths])]
    .sort((a, b) => b.localeCompare(a))
    .map((key) => ({ value: key, label: formatMonthLabel(key) })), [currentMonthKey, recap.availableMonths])
  const bestMethod = recap.methods[0] || null
  const bestItem = recap.topItems[0] || null
  const maxRevenue = recap.monthlyTrend.reduce((max, item) => Math.max(max, item.revenue), 0)
  const hasMoreTransactions = Boolean(recapPages.at(-1)?.nextCursor)
  const hasMoreExpenses = Boolean(expensePages.at(-1)?.nextCursor)
  const isLoadingMoreTransactions = isRecapValidating && recapPages.length > 0
  const isLoadingMoreExpenses = isExpenseValidating && expensePages.length > 0

  const handleApplyMonth = () => {
    const range = getFinancialMonthRangeDateKeys(selectedMonthKey, financialClosingDay)
    setStartDate(range.startDate)
    setEndDate(range.endDate)
  }

  const handleResetPeriod = () => {
    setSelectedMonthKey(currentMonthKey)
    setStartDate(currentMonthStart)
    setEndDate(currentMonthEnd)
  }

  const loadAllTransactionsForExport = async () => {
    const allRentals = []
    let cursor = ''
    do {
      const page = await fetchFinancialRecapPage({ ...recapFilters, cursor, limit: 100 })
      allRentals.push(...(Array.isArray(page?.items) ? page.items : []))
      cursor = page?.nextCursor || ''
    } while (cursor)
    return allRentals
  }

  const handleExport = async (format) => {
    try {
      setIsExporting(true)
      setExportError('')
      const filteredRentals = await loadAllTransactionsForExport()
      const exportRecap = { ...recap, filteredRentals }
      if (format === 'xlsx') {
        await exportExcel(exportRecap)
      } else {
        exportCsv(exportRecap)
      }
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Gagal menyiapkan laporan untuk diekspor.')
    } finally {
      setIsExporting(false)
    }
  }

  const openCreateExpense = () => {
    setMessage('')
    setMessageError('')
    setEditingExpenseId('')
    setExpenseForm(getInitialExpenseForm())
    setIsExpenseModalOpen(true)
  }

  const openEditExpense = (expense) => {
    setMessage('')
    setMessageError('')
    setEditingExpenseId(expense.id)
    setExpenseForm({
      date: toJakartaDateKey(expense.date),
      category: expense.category || '',
      description: expense.description || '',
      amount: String(expense.amount ?? 0),
      paymentMethod: expense.paymentMethod || 'TUNAI',
      notes: expense.notes || '',
    })
    setIsExpenseModalOpen(true)
  }

  const closeExpenseModal = () => {
    setIsExpenseModalOpen(false)
    setEditingExpenseId('')
    setExpenseForm(getInitialExpenseForm())
  }

  const refreshFinanceData = async () => {
    await Promise.all([
      mutateExpensePages(),
      mutateRecapPages(),
    ])
  }

  const handleSubmitExpense = async (event) => {
    event.preventDefault()
    setMessage('')
    setMessageError('')

    const payload = {
      date: expenseForm.date,
      category: expenseForm.category.trim(),
      description: expenseForm.description.trim(),
      amount: Number(expenseForm.amount || 0),
      paymentMethod: expenseForm.paymentMethod,
      notes: expenseForm.notes.trim(),
    }

    if (!payload.date || !payload.category || !payload.description) {
      setMessageError('Tanggal, kategori, dan deskripsi wajib diisi.')
      return
    }

    try {
      setIsSubmittingExpense(true)
      if (editingExpenseId) {
        await updateExpense(editingExpenseId, payload)
        setMessage('Pengeluaran berhasil diperbarui.')
      } else {
        await createExpense(payload)
        setMessage('Pengeluaran berhasil dicatat.')
      }
      closeExpenseModal()
      await refreshFinanceData()
    } catch (error) {
      setMessageError(error instanceof Error ? error.message : 'Gagal menyimpan pengeluaran.')
    } finally {
      setIsSubmittingExpense(false)
    }
  }

  const handleDeleteExpense = async (expense) => {
    if (!window.confirm(`Hapus pengeluaran ${expense.description}?`)) {
      return
    }

    try {
      setMessage('')
      setMessageError('')
      await deleteExpense(expense.id)
      setMessage('Pengeluaran berhasil dihapus.')
      await refreshFinanceData()
    } catch (error) {
      setMessageError(error instanceof Error ? error.message : 'Gagal menghapus pengeluaran.')
    }
  }

  return (
    <div className="flex min-h-0 flex-col gap-4 pb-4 lg:h-[calc(100%_-_2.5rem)] lg:overflow-hidden lg:pb-0">
      <section className="flex flex-col gap-3 rounded-md border border-border bg-white p-3 lg:shrink-0 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(180px,1fr)_150px_150px_auto] xl:max-w-[780px]">
          <select className={inputClass} value={selectedMonthKey} onChange={(event) => setSelectedMonthKey(event.target.value)} aria-label="Periode cepat">
            {monthOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <input type="date" className={inputClass} value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-label="Tanggal mulai" />
          <input type="date" className={inputClass} value={endDate} onChange={(event) => setEndDate(event.target.value)} aria-label="Tanggal akhir" />
          <div className="flex gap-2">
            <button type="button" className={secondaryButtonClass} onClick={handleApplyMonth}>Terapkan</button>
            <button type="button" className={secondaryButtonClass} onClick={handleResetPeriod}>Reset</button>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {canExportData && (
            <>
              <button type="button" className={secondaryButtonClass} onClick={() => { void handleExport('csv') }} disabled={isExporting || !recapPages[0]}>
                {isExporting ? 'Menyiapkan...' : 'CSV'}
              </button>
              <button type="button" className={secondaryButtonClass} onClick={() => { void handleExport('xlsx') }} disabled={isExporting || !recapPages[0]}>
                Excel
              </button>
            </>
          )}
          <button type="button" className={primaryButtonClass} onClick={openCreateExpense}>
            <i className="fas fa-plus mr-2"></i>
            Tambah Pengeluaran
          </button>
        </div>
      </section>

      {exportError && <p className="rounded-md border border-[#c0392b] bg-white px-4 py-3 text-sm text-[#c0392b]">{exportError}</p>}
      {message && <p className="rounded-md border border-accent bg-white px-4 py-3 text-sm font-medium text-accent">{message}</p>}
      {(messageError || recapError || expenseError) && (
        <p className="rounded-md border border-[#c0392b] bg-white px-4 py-3 text-sm text-[#c0392b]">
          {messageError || recapError?.message || expenseError?.message || 'Gagal memuat data keuangan.'}
        </p>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Omzet sewa" value={formatCurrency(recap.invoiceRevenue)} accent />
        <SummaryCard label="Uang diterima" value={formatCurrency(recap.cashReceived)} />
        <SummaryCard label="Piutang" value={formatCurrency(recap.receivables)} />
        <SummaryCard label="Pengeluaran" value={formatCurrency(recap.totalExpenses)} tone="expense" />
        <SummaryCard label="Laba/Rugi" value={formatCurrency(recap.netProfit)} tone={recap.netProfit < 0 ? 'danger' : 'profit'} />
      </section>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-white">
        <div className="flex flex-col gap-3 border-b border-border p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid min-h-10 grid-cols-3 rounded-md border border-border bg-bg-main p-1" aria-label="Tampilan keuangan">
            {[
              ['summary', 'Ringkasan'],
              ['transactions', 'Transaksi'],
              ['expenses', 'Pengeluaran'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={activeView === value}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${activeView === value ? 'bg-accent text-white' : 'text-text-muted hover:text-text-main'}`}
                onClick={() => setActiveView(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {activeView === 'expenses' && (
            <div className="relative w-full lg:max-w-[360px]">
              <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-muted"></i>
              <input
                className={`${inputClass} pl-9`}
                type="search"
                placeholder="Cari pengeluaran"
                value={expenseQuery}
                onChange={(event) => setExpenseQuery(event.target.value)}
              />
            </div>
          )}
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
          {activeView === 'summary' && (
            <SummaryView
              recap={recap}
              bestMethod={bestMethod}
              bestItem={bestItem}
              maxRevenue={maxRevenue}
              expenseCategories={expenseCategories}
            />
          )}

          {activeView === 'transactions' && (
            <TransactionView
              rentals={recap.filteredRentals}
              isLoading={isRecapLoading}
              hasMore={hasMoreTransactions}
              isLoadingMore={isLoadingMoreTransactions}
              onLoadMore={() => { void setRecapSize((size) => size + 1) }}
            />
          )}

          {activeView === 'expenses' && (
            <ExpenseView
              expenses={expenses}
              isLoading={isExpenseLoading}
              hasMore={hasMoreExpenses}
              isLoadingMore={isLoadingMoreExpenses}
              onLoadMore={() => { void setExpenseSize((size) => size + 1) }}
              onEdit={openEditExpense}
              onDelete={handleDeleteExpense}
            />
          )}
        </div>
      </section>

      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-3 sm:p-4">
          <div className="w-full max-w-[620px] overflow-hidden rounded-md border border-border bg-white">
            <div className="flex items-center justify-between border-b border-border px-4 py-4">
              <h3 className="text-[1.05rem] font-bold text-text-main">{editingExpenseId ? 'Edit Pengeluaran' : 'Tambah Pengeluaran'}</h3>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-md border border-transparent text-xl text-text-muted transition hover:border-border hover:text-text-main"
                onClick={closeExpenseModal}
                aria-label="Tutup"
              >
                &times;
              </button>
            </div>

            <form className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2" onSubmit={handleSubmitExpense}>
              <div>
                <label htmlFor="expense-date" className="mb-1.5 block text-sm font-medium text-text-muted">Tanggal</label>
                <input id="expense-date" type="date" className={inputClass} value={expenseForm.date} onChange={(event) => setExpenseForm((prev) => ({ ...prev, date: event.target.value }))} required />
              </div>
              <div>
                <label htmlFor="expense-category" className="mb-1.5 block text-sm font-medium text-text-muted">Kategori</label>
                <input id="expense-category" className={inputClass} value={expenseForm.category} onChange={(event) => setExpenseForm((prev) => ({ ...prev, category: event.target.value }))} placeholder="Laundry, repair, operasional" required />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="expense-description" className="mb-1.5 block text-sm font-medium text-text-muted">Deskripsi</label>
                <input id="expense-description" className={inputClass} value={expenseForm.description} onChange={(event) => setExpenseForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="Contoh: Cuci tenda setelah sewa" required />
              </div>
              <div>
                <label htmlFor="expense-amount" className="mb-1.5 block text-sm font-medium text-text-muted">Jumlah</label>
                <input id="expense-amount" type="number" min="0" className={inputClass} value={expenseForm.amount} onChange={(event) => setExpenseForm((prev) => ({ ...prev, amount: event.target.value }))} required />
              </div>
              <div>
                <label htmlFor="expense-payment" className="mb-1.5 block text-sm font-medium text-text-muted">Metode Bayar</label>
                <select id="expense-payment" className={inputClass} value={expenseForm.paymentMethod} onChange={(event) => setExpenseForm((prev) => ({ ...prev, paymentMethod: event.target.value }))}>
                  <option value="TUNAI">Tunai</option>
                  <option value="QRIS">QRIS</option>
                  <option value="BANK">Bank</option>
                  <option value="LAINNYA">Lainnya</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label htmlFor="expense-notes" className="mb-1.5 block text-sm font-medium text-text-muted">Catatan</label>
                <textarea id="expense-notes" className={`${inputClass} min-h-[90px] py-2`} value={expenseForm.notes} onChange={(event) => setExpenseForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Opsional" />
              </div>
              <div className="flex flex-col gap-2 md:col-span-2 sm:flex-row">
                <button type="submit" className={primaryButtonClass} disabled={isSubmittingExpense}>
                  {isSubmittingExpense ? 'Menyimpan...' : 'Simpan'}
                </button>
                <button type="button" className={secondaryButtonClass} onClick={closeExpenseModal}>Batal</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, accent = false, tone = '' }) {
  const colorClass = tone === 'danger'
    ? 'text-[#c0392b]'
    : tone === 'expense'
      ? 'text-[#b7791f]'
      : tone === 'profit' || accent
        ? 'text-accent'
        : 'text-text-main'

  return (
    <div className="rounded-md border border-border bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <h4 className={`mt-2 text-[1.2rem] font-bold ${colorClass}`}>{value}</h4>
    </div>
  )
}

function SummaryView({ recap, bestMethod, bestItem, maxRevenue, expenseCategories }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="rounded-md border border-border bg-bg-main p-4">
        <h4 className="mb-3 text-[1rem] font-bold text-text-main">Tren Bulanan</h4>
        {recap.monthlyTrend.length === 0 ? <p className="text-sm text-text-muted">Belum ada data pada rentang ini.</p> : (
          <div className="space-y-3">
            {recap.monthlyTrend.map((month) => {
              const percent = maxRevenue > 0 ? Math.round((month.revenue / maxRevenue) * 100) : 0
              return (
                <div key={month.monthKey}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs text-text-muted">
                    <span>{formatMonthLabel(month.monthKey)}</span>
                    <span>{formatCurrency(month.revenue)} | {month.transactions} trx</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-sm bg-white">
                    <div className="h-full rounded-sm bg-accent" style={{ width: `${Math.max(6, percent)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="rounded-md border border-border bg-bg-main p-4">
        <h4 className="mb-3 text-[1rem] font-bold text-text-main">Barang Paling Laku</h4>
        {recap.topItems.length === 0 ? <p className="text-sm text-text-muted">Belum ada data barang pada rentang ini.</p> : (
          <div className="space-y-2">
            {recap.topItems.slice(0, 8).map((item, index) => (
              <div key={item.key} className="flex items-center justify-between gap-3 rounded-md border border-border bg-white px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-main">{index + 1}. {item.name}</p>
                  <p className="text-xs text-text-muted">Qty {item.qty}</p>
                </div>
                <p className="text-xs font-semibold text-accent">{formatCurrency(item.estimatedRevenue)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-md border border-border bg-bg-main p-4">
        <h4 className="mb-3 text-[1rem] font-bold text-text-main">Metode Bayar</h4>
        {recap.methods.length === 0 ? <p className="text-sm text-text-muted">Belum ada data metode pembayaran.</p> : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {recap.methods.map((method) => (
              <div key={method.method} className="rounded-md border border-border bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{method.method}</p>
                <p className="mt-1 text-lg font-bold text-text-main">{method.count} transaksi</p>
                <p className="text-sm font-semibold text-accent">{formatCurrency(method.revenue)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-md border border-border bg-bg-main p-4">
        <h4 className="mb-3 text-[1rem] font-bold text-text-main">Kategori Pengeluaran</h4>
        {expenseCategories.length === 0 ? <p className="text-sm text-text-muted">Belum ada pengeluaran pada rentang ini.</p> : (
          <div className="space-y-2">
            {expenseCategories.slice(0, 8).map((category) => (
              <div key={category.category} className="flex items-center justify-between gap-3 rounded-md border border-border bg-white px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-text-main">{category.category}</p>
                  <p className="text-xs text-text-muted">{category.count} catatan</p>
                </div>
                <p className="text-sm font-semibold text-[#b7791f]">{formatCurrency(category.amount)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-md border border-accent bg-white p-3 text-sm text-text-main xl:col-span-2">
        <span className="font-semibold text-accent">Catatan:</span> laporan ini memakai perhitungan sederhana berbasis uang diterima dan belum memasukkan pembelian inventaris atau penyusutan aset.
        <span className="ml-2 text-text-muted">Paling laku: {bestItem ? `${bestItem.name} (${bestItem.qty} unit)` : '-'} | Metode utama: {bestMethod ? `${bestMethod.method} (${bestMethod.count} trx)` : '-'}</span>
      </div>
    </div>
  )
}

function TransactionView({ rentals, isLoading, hasMore, isLoadingMore, onLoadMore }) {
  if (isLoading) {
    return <div className="flex min-h-[220px] items-center justify-center text-text-muted">Memuat transaksi...</div>
  }

  if (rentals.length === 0) {
    return <div className="flex min-h-[220px] items-center justify-center text-text-muted">Belum ada transaksi dalam rentang ini.</div>
  }

  return (
    <>
      <div className="custom-scrollbar overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse">
          <thead className="sticky top-0 z-10 bg-white">
            <tr>
              <TableHead>Tanggal</TableHead>
              <TableHead>Pelanggan</TableHead>
              <TableHead>Metode</TableHead>
              <TableHead>Status</TableHead>
              <TableHead align="right">Omzet</TableHead>
              <TableHead align="right">Dibayar</TableHead>
              <TableHead align="right">Piutang</TableHead>
            </tr>
          </thead>
          <tbody>
            {rentals.map((rental) => (
              <tr key={rental.id} className="hover:bg-surface-hover">
                <TableCell muted>{formatJakartaDateLabel(rental.date, true)}</TableCell>
                <TableCell>{rental?.customer?.name || '-'}</TableCell>
                <TableCell muted>{rental?.payment?.method || 'TUNAI'}</TableCell>
                <TableCell muted>{rental?.payment?.status || 'LUNAS'}</TableCell>
                <TableCell align="right" strong>{formatCurrency(getRentalInvoiceAmount(rental))}</TableCell>
                <TableCell align="right" strong>{formatCurrency(getRentalCashAmount(rental))}</TableCell>
                <TableCell align="right" muted>{formatCurrency(getRentalReceivableAmount(rental))}</TableCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div className="mt-3 flex justify-center">
          <button type="button" className={secondaryButtonClass} onClick={onLoadMore} disabled={isLoadingMore}>
            {isLoadingMore ? 'Memuat...' : 'Muat transaksi berikutnya'}
          </button>
        </div>
      )}
    </>
  )
}

function ExpenseView({ expenses, isLoading, hasMore, isLoadingMore, onLoadMore, onEdit, onDelete }) {
  if (isLoading) {
    return <div className="flex min-h-[220px] items-center justify-center text-text-muted">Memuat pengeluaran...</div>
  }

  if (expenses.length === 0) {
    return <div className="flex min-h-[220px] items-center justify-center text-text-muted">Belum ada pengeluaran dalam rentang ini.</div>
  }

  return (
    <>
      <div className="custom-scrollbar overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse">
          <thead className="sticky top-0 z-10 bg-white">
            <tr>
              <TableHead>Tanggal</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Deskripsi</TableHead>
              <TableHead>Metode</TableHead>
              <TableHead align="right">Jumlah</TableHead>
              <TableHead align="right">Aksi</TableHead>
            </tr>
          </thead>
          <tbody>
            {expenses.map((expense) => (
              <tr key={expense.id} className="hover:bg-surface-hover">
                <TableCell muted>{formatJakartaDateLabel(expense.date, false)}</TableCell>
                <TableCell>
                  <span className="rounded-md bg-[#fff7e6] px-2 py-1 text-xs font-semibold text-[#8a5a00]">{expense.category}</span>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium text-text-main">{expense.description}</p>
                    {expense.notes && <p className="mt-1 text-xs text-text-muted">{expense.notes}</p>}
                  </div>
                </TableCell>
                <TableCell muted>{expense.paymentMethod || 'TUNAI'}</TableCell>
                <TableCell align="right" strong>{formatCurrency(expense.amount)}</TableCell>
                <TableCell align="right">
                  <div className="flex justify-end gap-2">
                    <button type="button" className="rounded-md border border-border bg-white px-3 py-1.5 text-xs text-text-main transition hover:border-accent" onClick={() => onEdit(expense)}>Edit</button>
                    <button type="button" className="rounded-md border border-border bg-white px-3 py-1.5 text-xs text-[#c0392b] transition hover:border-[#c0392b]" onClick={() => onDelete(expense)}>Hapus</button>
                  </div>
                </TableCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div className="mt-3 flex justify-center">
          <button type="button" className={secondaryButtonClass} onClick={onLoadMore} disabled={isLoadingMore}>
            {isLoadingMore ? 'Memuat...' : 'Muat pengeluaran berikutnya'}
          </button>
        </div>
      )}
    </>
  )
}

function TableHead({ children, align = 'left' }) {
  return <th className={`border-b border-border p-3 ${align === 'right' ? 'text-right' : 'text-left'} text-xs font-semibold uppercase tracking-wide text-text-muted`}>{children}</th>
}

function TableCell({ children, align = 'left', muted = false, strong = false }) {
  return (
    <td className={`border-b border-border p-3 ${align === 'right' ? 'text-right' : 'text-left'} text-sm ${strong ? 'font-semibold' : ''} ${muted ? 'text-text-muted' : 'text-text-main'}`}>
      {children}
    </td>
  )
}

export default FinancialRecap

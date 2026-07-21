import React, { useEffect, useMemo, useState } from 'react'
import useSWRInfinite from 'swr/infinite'
import {
  formatCurrency,
  formatJakartaDateLabel,
  formatMonthLabel,
  getCurrentFinancialMonthRangeDateKeys,
  getFinancialClosingDay,
  getFinancialMonthRangeDateKeys,
} from '../lib/financial'
import { fetchFinancialRecapPage } from '../lib/api'
import { APP_CACHE_KEYS } from '../lib/appCache'

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

const EMPTY_RECAP = {
  totalRevenue: 0,
  totalTransactions: 0,
  averageTransaction: 0,
  methods: [],
  topItems: [],
  monthlyTrend: [],
  availableMonths: [],
}

const FinancialRecap = ({ tenantId, branchId, tenantSettings, canExportData = true }) => {
  const financialClosingDay = useMemo(() => getFinancialClosingDay(tenantSettings), [tenantSettings])
  const { monthKey: currentMonthKey, startDate: currentMonthStart, endDate: currentMonthEnd } = useMemo(
    () => getCurrentFinancialMonthRangeDateKeys(financialClosingDay),
    [financialClosingDay],
  )
  const [selectedMonthKey, setSelectedMonthKey] = useState(currentMonthKey)
  const [startDate, setStartDate] = useState(currentMonthStart)
  const [endDate, setEndDate] = useState(currentMonthEnd)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const recapFilters = useMemo(() => ({ startDate, endDate }), [endDate, startDate])
  const {
    data: recapPages = [],
    error: recapError,
    isLoading: isRecapLoading,
    isValidating: isRecapValidating,
    setSize,
  } = useSWRInfinite(
    (pageIndex, previousPageData) => {
      if (!tenantId || !branchId) return null
      if (pageIndex > 0 && !previousPageData?.nextCursor) return null
      return APP_CACHE_KEYS.financialRecap(
        tenantId,
        branchId,
        recapFilters,
        pageIndex === 0 ? '' : previousPageData.nextCursor,
      )
    },
    ([, , , filters, cursor]) => fetchFinancialRecapPage({ ...filters, cursor }),
    { keepPreviousData: true },
  )

  useEffect(() => {
    void setSize(1)
  }, [recapFilters, setSize])

  const recap = useMemo(() => ({
    ...EMPTY_RECAP,
    ...(recapPages[0]?.summary || {}),
    financialClosingDay,
    filteredRentals: recapPages.flatMap((page) => (Array.isArray(page?.items) ? page.items : [])),
  }), [financialClosingDay, recapPages])
  const monthOptions = useMemo(() => [...new Set([currentMonthKey, ...recap.availableMonths])]
    .sort((a, b) => b.localeCompare(a))
    .map((key) => ({ value: key, label: formatMonthLabel(key) })), [currentMonthKey, recap.availableMonths])
  const bestMethod = recap.methods[0] || null
  const bestItem = recap.topItems[0] || null
  const maxRevenue = recap.monthlyTrend.reduce((max, item) => Math.max(max, item.revenue), 0)
  const hasMoreTransactions = Boolean(recapPages.at(-1)?.nextCursor)
  const isLoadingMoreTransactions = isRecapValidating && recapPages.length > 0

  const handleApplyMonth = () => {
    const range = getFinancialMonthRangeDateKeys(selectedMonthKey, financialClosingDay)
    setStartDate(range.startDate)
    setEndDate(range.endDate)
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

  return (
    <div className="flex flex-col gap-6 pt-0 pb-4 sm:pb-5">
      <div className="rounded-lg border border-border bg-sidebar-bg p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-[1.2rem] font-bold text-text-main">Recap Keuangan</h3>
            <p className="text-[0.88rem] text-text-muted">Basis pencatatan: tanggal transaksi sewa. Tutup buku setiap tanggal {financialClosingDay}.</p>
          </div>
          {canExportData && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded-lg border border-border bg-bg-main px-3 py-2 text-sm font-semibold text-text-main hover:border-accent disabled:cursor-wait disabled:opacity-60" onClick={() => { void handleExport('csv') }} disabled={isExporting || !recapPages[0]}>
                {isExporting ? 'Menyiapkan...' : 'Export CSV'}
              </button>
              <button type="button" className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:cursor-wait disabled:opacity-60" onClick={() => { void handleExport('xlsx') }} disabled={isExporting || !recapPages[0]}>
                Export Excel (.xlsx)
              </button>
            </div>
          )}
        </div>
        {exportError && <p className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{exportError}</p>}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="sm:col-span-2 lg:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Periode Cepat</label>
            <div className="flex gap-2">
              <select className="w-full rounded-lg border border-border bg-bg-main px-3 py-2 text-sm text-text-main outline-none focus:border-accent" value={selectedMonthKey} onChange={(event) => setSelectedMonthKey(event.target.value)}>
                {monthOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <button type="button" className="rounded-lg border border-border bg-bg-main px-3 py-2 text-sm font-semibold text-text-main hover:border-accent" onClick={handleApplyMonth}>Terapkan</button>
            </div>
            <p className="mt-1 text-[0.72rem] text-text-muted">Periode terpilih: {startDate || '-'} s/d {endDate || '-'}</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Tanggal Mulai</label>
            <input type="date" className="w-full rounded-lg border border-border bg-bg-main px-3 py-2 text-sm text-text-main outline-none focus:border-accent" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Tanggal Akhir</label>
            <input type="date" className="w-full rounded-lg border border-border bg-bg-main px-3 py-2 text-sm text-text-main outline-none focus:border-accent" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>
          <div className="flex items-end">
            <button type="button" className="w-full rounded-lg border border-border bg-bg-main px-3 py-2 text-sm font-semibold text-text-main hover:border-accent" onClick={() => { setSelectedMonthKey(currentMonthKey); setStartDate(currentMonthStart); setEndDate(currentMonthEnd) }}>Reset ke Bulan Ini</button>
          </div>
        </div>
      </div>

      {recapError && <p className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{recapError.message || 'Gagal memuat recap keuangan.'}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Pendapatan" value={formatCurrency(recap.totalRevenue)} accent />
        <SummaryCard label="Jumlah Transaksi" value={recap.totalTransactions} />
        <SummaryCard label="Rata-rata Transaksi" value={formatCurrency(Math.round(recap.averageTransaction))} />
        <SummaryCard label="Metode Terpopuler" value={bestMethod ? `${bestMethod.method} (${bestMethod.count} trx)` : '-'} compact />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-border bg-sidebar-bg p-4 sm:p-5">
          <h4 className="mb-3 text-[1rem] font-bold text-text-main">Tren Bulanan</h4>
          {recap.monthlyTrend.length === 0 ? <p className="text-sm text-text-muted">Belum ada data pada rentang ini.</p> : (
            <div className="space-y-3">
              {recap.monthlyTrend.map((month) => {
                const percent = maxRevenue > 0 ? Math.round((month.revenue / maxRevenue) * 100) : 0
                return <div key={month.monthKey}>
                  <div className="mb-1 flex items-center justify-between text-xs text-text-muted"><span>{formatMonthLabel(month.monthKey)}</span><span>{formatCurrency(month.revenue)} | {month.transactions} trx</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-bg-main"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(6, percent)}%` }} /></div>
                </div>
              })}
            </div>
          )}
        </div>
        <div className="rounded-lg border border-border bg-sidebar-bg p-4 sm:p-5">
          <h4 className="mb-3 text-[1rem] font-bold text-text-main">Barang Paling Laku</h4>
          {recap.topItems.length === 0 ? <p className="text-sm text-text-muted">Belum ada data item pada rentang ini.</p> : (
            <div className="space-y-2">{recap.topItems.slice(0, 8).map((item, index) => <div key={item.key} className="flex items-center justify-between rounded-lg border border-border/60 bg-bg-main/40 px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-semibold text-text-main">{index + 1}. {item.name}</p><p className="text-xs text-text-muted">Qty {item.qty}</p></div><p className="text-xs font-semibold text-accent">{formatCurrency(item.estimatedRevenue)}</p></div>)}</div>
          )}
          <div className="mt-3 rounded-lg border border-accent/25 bg-accent/10 p-3 text-sm text-text-main"><span className="font-semibold">Paling Laku:</span> {bestItem ? `${bestItem.name} (${bestItem.qty} unit)` : '-'}</div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-sidebar-bg p-4 sm:p-5">
        <h4 className="mb-3 text-[1rem] font-bold text-text-main">Metode Transaksi</h4>
        {recap.methods.length === 0 ? <p className="text-sm text-text-muted">Belum ada data metode pembayaran.</p> : <div className="grid grid-cols-1 gap-3 md:grid-cols-3">{recap.methods.map((method) => <div key={method.method} className="rounded-lg border border-border/60 bg-bg-main/40 p-3"><p className="text-xs uppercase tracking-wide text-text-muted">{method.method}</p><p className="mt-1 text-lg font-bold text-text-main">{method.count} transaksi</p><p className="text-sm text-accent">{formatCurrency(method.revenue)}</p></div>)}</div>}
      </div>

      <div className="rounded-lg border border-border bg-sidebar-bg p-4 sm:p-5">
        <h4 className="mb-3 text-[1rem] font-bold text-text-main">Transaksi Dalam Periode</h4>
        {isRecapLoading ? <p className="text-sm text-text-muted">Memuat transaksi...</p> : recap.filteredRentals.length === 0 ? <p className="text-sm text-text-muted">Belum ada transaksi dalam rentang ini.</p> : (
          <div className="custom-scrollbar max-h-[420px] overflow-y-auto rounded-lg border border-border/60"><table className="w-full min-w-[760px] border-collapse"><thead className="sticky top-0 bg-sidebar-bg"><tr><th className="border-b border-border/60 p-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Tanggal</th><th className="border-b border-border/60 p-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Transaksi</th><th className="border-b border-border/60 p-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Pelanggan</th><th className="border-b border-border/60 p-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Metode</th><th className="border-b border-border/60 p-3 text-right text-xs font-semibold uppercase tracking-wide text-text-muted">Total</th></tr></thead><tbody>{recap.filteredRentals.map((rental) => <tr key={rental.id} className="hover:bg-surface-hover"><td className="border-b border-border/50 p-3 text-sm text-text-muted">{formatJakartaDateLabel(rental.date, true)}</td><td className="border-b border-border/50 p-3 font-mono text-sm text-text-main">{rental.id}</td><td className="border-b border-border/50 p-3 text-sm text-text-main">{rental?.customer?.name || '-'}</td><td className="border-b border-border/50 p-3 text-sm text-text-muted">{rental?.payment?.method || 'TUNAI'}</td><td className="border-b border-border/50 p-3 text-right text-sm font-semibold text-accent">{formatCurrency(Number(rental?.finalTotal ?? rental?.total ?? 0))}</td></tr>)}</tbody></table></div>
        )}
        {hasMoreTransactions && <div className="mt-3 flex justify-center"><button type="button" className="rounded-lg border border-border bg-bg-main px-4 py-2 text-sm font-semibold text-text-main hover:border-accent disabled:cursor-wait disabled:opacity-60" onClick={() => { void setSize((size) => size + 1) }} disabled={isLoadingMoreTransactions}>{isLoadingMoreTransactions ? 'Memuat...' : 'Muat transaksi berikutnya'}</button></div>}
      </div>
    </div>
  )
}

function SummaryCard({ label, value, accent = false, compact = false }) {
  return <div className="rounded-lg border border-border bg-card-bg p-4"><p className="text-xs uppercase tracking-wide text-text-muted">{label}</p><h4 className={`mt-2 font-bold ${compact ? 'text-[1.05rem]' : 'text-[1.35rem]'} ${accent ? 'text-accent' : 'text-text-main'}`}>{value}</h4></div>
}

export default FinancialRecap

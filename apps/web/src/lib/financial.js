const JAKARTA_TIMEZONE = 'Asia/Jakarta'
const ID_LOCALE = 'id-ID'
const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
]

const formatterCache = new Map()

function getFormatter(cacheKey, options) {
  if (formatterCache.has(cacheKey)) {
    return formatterCache.get(cacheKey)
  }

  const formatter = new Intl.DateTimeFormat(ID_LOCALE, options)
  formatterCache.set(cacheKey, formatter)
  return formatter
}

function toDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  const parsed = new Date(value || '')
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getJakartaParts(dateValue) {
  const date = toDate(dateValue)
  if (!date) {
    return null
  }

  const formatter = getFormatter('jakarta-parts', {
    timeZone: JAKARTA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const parts = formatter.formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  if (!year || !month || !day) {
    return null
  }

  return { year, month, day }
}

function parseMonthKey(monthKey) {
  const raw = String(monthKey || '').trim()
  const match = raw.match(/^(\d{4})-(\d{2})$/)
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null
  }

  return { year, month }
}

function parseDateKey(dateKey) {
  const raw = String(dateKey || '').trim()
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null
  }

  return { year, month, day }
}

function normalizeClosingDay(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return 31
  }

  return Math.min(31, Math.max(1, Math.trunc(parsed)))
}

function getLastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

function toDateKeyFromParts(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function shiftMonth(year, month, offset) {
  const date = new Date(year, month - 1 + offset, 1)
  return { year: date.getFullYear(), month: date.getMonth() + 1 }
}

export function getJakartaTimezone() {
  return JAKARTA_TIMEZONE
}

export function toJakartaDateKey(dateValue) {
  const parts = getJakartaParts(dateValue)
  if (!parts) {
    return ''
  }

  return `${parts.year}-${parts.month}-${parts.day}`
}

export function toJakartaMonthKey(dateValue) {
  const parts = getJakartaParts(dateValue)
  if (!parts) {
    return ''
  }

  return `${parts.year}-${parts.month}`
}

export function getCurrentJakartaDateKey(now = new Date()) {
  return toJakartaDateKey(now)
}

export function getCurrentJakartaMonthKey(now = new Date()) {
  return toJakartaMonthKey(now)
}

export function formatMonthLabel(monthKey) {
  const parsed = parseMonthKey(monthKey)
  if (!parsed) {
    return '-'
  }

  return `${MONTH_NAMES_ID[parsed.month - 1]} ${parsed.year}`
}

export function formatJakartaDateLabel(dateValue, withTime = false) {
  const date = toDate(dateValue)
  if (!date) {
    return '-'
  }

  const formatter = getFormatter(withTime ? 'jakarta-date-time' : 'jakarta-date', {
    timeZone: JAKARTA_TIMEZONE,
    ...(withTime
      ? {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }
      : {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
  })

  return formatter.format(date)
}

export function getMonthRangeDateKeys(monthKey) {
  const parsed = parseMonthKey(monthKey)
  if (!parsed) {
    return { startDate: '', endDate: '' }
  }

  const startDate = `${parsed.year}-${String(parsed.month).padStart(2, '0')}-01`
  const lastDay = new Date(parsed.year, parsed.month, 0).getDate()
  const endDate = `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  return { startDate, endDate }
}

export function getFinancialClosingDay(settingsOrDay) {
  if (typeof settingsOrDay === 'object' && settingsOrDay !== null) {
    return normalizeClosingDay(settingsOrDay.financialClosingDay)
  }

  return normalizeClosingDay(settingsOrDay)
}

export function getFinancialMonthRangeDateKeys(monthKey, settingsOrDay) {
  const parsed = parseMonthKey(monthKey)
  if (!parsed) {
    return { startDate: '', endDate: '' }
  }

  const closingDay = getFinancialClosingDay(settingsOrDay)
  const previousMonth = shiftMonth(parsed.year, parsed.month, -1)
  const previousMonthLastDay = getLastDayOfMonth(previousMonth.year, previousMonth.month)
  const previousClosingDay = Math.min(closingDay, previousMonthLastDay)
  const startSource = new Date(previousMonth.year, previousMonth.month - 1, previousClosingDay)
  startSource.setDate(startSource.getDate() + 1)

  const endDay = Math.min(closingDay, getLastDayOfMonth(parsed.year, parsed.month))

  return {
    startDate: toDateKeyFromParts(startSource.getFullYear(), startSource.getMonth() + 1, startSource.getDate()),
    endDate: toDateKeyFromParts(parsed.year, parsed.month, endDay),
  }
}

export function getCurrentMonthRangeDateKeys(now = new Date()) {
  const monthKey = getCurrentJakartaMonthKey(now)
  const { startDate, endDate } = getMonthRangeDateKeys(monthKey)
  return { monthKey, startDate, endDate }
}

export function getFinancialMonthKeyForDate(dateValue, settingsOrDay) {
  const parts = getJakartaParts(dateValue)
  if (!parts) {
    return ''
  }

  const year = Number(parts.year)
  const month = Number(parts.month)
  const day = Number(parts.day)
  const closingDay = Math.min(getFinancialClosingDay(settingsOrDay), getLastDayOfMonth(year, month))
  if (day <= closingDay) {
    return `${parts.year}-${parts.month}`
  }

  const next = shiftMonth(year, month, 1)
  return `${next.year}-${String(next.month).padStart(2, '0')}`
}

export function getCurrentFinancialMonthRangeDateKeys(settingsOrDay, now = new Date()) {
  const monthKey = getFinancialMonthKeyForDate(now, settingsOrDay)
  const { startDate, endDate } = getFinancialMonthRangeDateKeys(monthKey, settingsOrDay)
  return { monthKey, startDate, endDate }
}

export function isDateKeyWithinRange(dateKey, startDate, endDate) {
  const date = String(dateKey || '').trim()
  if (!date) {
    return false
  }

  if (startDate && date < startDate) {
    return false
  }

  if (endDate && date > endDate) {
    return false
  }

  return true
}

export function getRentalAmount(rental) {
  const amount = Number(rental?.payment?.totalDue ?? rental?.finalTotal ?? rental?.total ?? 0)
  return Number.isFinite(amount) ? Math.max(0, amount) : 0
}

export function getRentalInvoiceAmount(rental) {
  return getRentalAmount(rental)
}

function normalizePaymentRecord(record, rental, index) {
  const amount = Number(record?.amount || 0)
  const paidAt = record?.paidAt || rental?.date || ''
  return {
    id: String(record?.id || `legacy-payment-${rental?.id || 'rental'}-${index}`),
    amount: Number.isFinite(amount) ? Math.max(0, amount) : 0,
    method: String(record?.method || rental?.payment?.method || 'TUNAI').trim().toUpperCase() || 'TUNAI',
    paidAt,
  }
}

export function getRentalPaymentRecords(rental) {
  const records = Array.isArray(rental?.payment?.records) ? rental.payment.records : []
  if (records.length > 0) {
    return records.map((record, index) => normalizePaymentRecord(record, rental, index))
  }

  const paymentStatus = String(rental?.payment?.status || 'LUNAS').trim().toUpperCase()
  if (paymentStatus === 'BELUM_BAYAR') {
    return []
  }

  const invoiceAmount = getRentalAmount(rental)
  const storedPaidAmount = Number(rental?.payment?.paidAmount || 0)
  const amount = paymentStatus === 'LUNAS'
    ? (storedPaidAmount > 0 ? Math.min(invoiceAmount, storedPaidAmount) : invoiceAmount)
    : Math.min(invoiceAmount, Math.max(0, storedPaidAmount))
  if (!Number.isFinite(amount) || amount <= 0) {
    return []
  }

  return [normalizePaymentRecord({
    id: `legacy-payment-${rental?.id || 'rental'}`,
    amount,
    method: rental?.payment?.method || 'TUNAI',
    paidAt: rental?.date,
  }, rental, 0)]
}

export function normalizePaymentMethodTotals(methods) {
  if (Array.isArray(methods)) {
    return methods.map((entry) => ({
      method: String(entry?.method || 'TUNAI').trim().toUpperCase() || 'TUNAI',
      count: Math.max(0, Number(entry?.count || 0)),
      revenue: Math.max(0, Number(entry?.amount ?? entry?.revenue ?? 0) || 0),
    }))
  }

  if (!methods || typeof methods !== 'object') {
    return []
  }

  return Object.entries(methods).map(([method, amount]) => ({
    method: String(method).trim().toUpperCase() || 'TUNAI',
    count: 0,
    revenue: Math.max(0, Number(amount || 0) || 0),
  }))
}

export function getPaymentDateTotals(rentals, { startDate = '', endDate = '' } = {}) {
  const methodBucket = new Map()
  let cashReceived = 0
  let paymentCount = 0

  ;(Array.isArray(rentals) ? rentals : []).forEach((rental) => {
    getRentalPaymentRecords(rental).forEach((payment) => {
      const paymentDateKey = toJakartaDateKey(payment.paidAt)
      if (!isDateKeyWithinRange(paymentDateKey, startDate, endDate)) {
        return
      }

      cashReceived += payment.amount
      paymentCount += 1
      const current = methodBucket.get(payment.method) || { method: payment.method, count: 0, revenue: 0 }
      current.count += 1
      current.revenue += payment.amount
      methodBucket.set(payment.method, current)
    })
  })

  const methods = [...methodBucket.values()].sort((a, b) => {
    if (b.revenue !== a.revenue) return b.revenue - a.revenue
    return a.method.localeCompare(b.method)
  })

  return { cashReceived, paymentCount, methods }
}

export function getRentalCashAmount(rental, dateRange = {}) {
  return getPaymentDateTotals([rental], dateRange).cashReceived
}

export function getRentalReceivableAmount(rental) {
  const paidAmount = getRentalPaymentRecords(rental).reduce((sum, payment) => sum + payment.amount, 0)
  return Math.max(0, getRentalAmount(rental) - paidAmount)
}

export function filterRentalsByTransactionDate(rentals, { startDate = '', endDate = '' } = {}) {
  const list = Array.isArray(rentals) ? rentals : []
  return list.filter((rental) => {
    const transactionDateKey = toJakartaDateKey(rental?.date)
    if (!transactionDateKey) {
      return false
    }

    return isDateKeyWithinRange(transactionDateKey, startDate, endDate)
  })
}

export function getFinancialRecap(rentals, { startDate = '', endDate = '', financialClosingDay } = {}) {
  const filteredRentals = filterRentalsByTransactionDate(rentals, { startDate, endDate })
  const totalRevenue = filteredRentals.reduce((sum, rental) => sum + getRentalAmount(rental), 0)
  const paymentTotals = getPaymentDateTotals(filteredRentals, { startDate, endDate })
  const totalTransactions = filteredRentals.length
  const averageTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0

  const itemBucket = new Map()
  const monthBucket = new Map()

  filteredRentals.forEach((rental) => {
    const amount = getRentalAmount(rental)
    const monthKey = getFinancialMonthKeyForDate(rental?.date, financialClosingDay)

    if (monthKey) {
      const monthCurrent = monthBucket.get(monthKey) || { monthKey, revenue: 0, transactions: 0 }
      monthCurrent.revenue += amount
      monthCurrent.transactions += 1
      monthBucket.set(monthKey, monthCurrent)
    }

    const items = Array.isArray(rental?.items) ? rental.items : []
    items.forEach((item) => {
      const itemName = String(item?.name || '').trim() || 'Tanpa Nama'
      const qty = Number(item?.qty || 0)
      const price = Number(item?.price || 0)
      const safeQty = Number.isFinite(qty) ? Math.max(0, qty) : 0
      const safePrice = Number.isFinite(price) ? Math.max(0, price) : 0
      const key = `${item?.id || itemName}`
      const currentItem = itemBucket.get(key) || {
        key,
        id: item?.id || '',
        name: itemName,
        qty: 0,
        estimatedRevenue: 0,
      }
      currentItem.qty += safeQty
      currentItem.estimatedRevenue += (safePrice * safeQty)
      itemBucket.set(key, currentItem)
    })
  })

  const topItems = [...itemBucket.values()].sort((a, b) => {
    if (b.qty !== a.qty) {
      return b.qty - a.qty
    }
    return b.estimatedRevenue - a.estimatedRevenue
  })

  const monthlyTrend = [...monthBucket.values()]
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
    .map((entry) => ({
      ...entry,
      label: formatMonthLabel(entry.monthKey),
    }))

  return {
    startDate,
    endDate,
    financialClosingDay: getFinancialClosingDay(financialClosingDay),
    filteredRentals,
    totalRevenue,
    totalTransactions,
    averageTransaction,
    invoiceRevenue: totalRevenue,
    cashReceived: paymentTotals.cashReceived,
    receivables: filteredRentals.reduce(
      (sum, rental) => sum + Math.max(0, getRentalAmount(rental) - getRentalPaymentRecords(rental).reduce((paid, payment) => paid + payment.amount, 0)),
      0,
    ),
    methods: paymentTotals.methods,
    paymentMethods: paymentTotals.methods,
    topItems,
    monthlyTrend,
  }
}

export function formatCurrency(value) {
  const amount = Number(value || 0)
  const safeAmount = Number.isFinite(amount) ? amount : 0
  return `Rp ${safeAmount.toLocaleString(ID_LOCALE)}`
}

export function toDateInputValue(dateValue) {
  const parsed = parseDateKey(dateValue)
  if (!parsed) {
    return ''
  }

  return `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`
}

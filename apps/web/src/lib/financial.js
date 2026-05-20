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

export function getCurrentMonthRangeDateKeys(now = new Date()) {
  const monthKey = getCurrentJakartaMonthKey(now)
  const { startDate, endDate } = getMonthRangeDateKeys(monthKey)
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
  const amount = Number(rental?.finalTotal ?? rental?.total ?? 0)
  return Number.isFinite(amount) ? Math.max(0, amount) : 0
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

export function getFinancialRecap(rentals, { startDate = '', endDate = '' } = {}) {
  const filteredRentals = filterRentalsByTransactionDate(rentals, { startDate, endDate })
  const totalRevenue = filteredRentals.reduce((sum, rental) => sum + getRentalAmount(rental), 0)
  const totalTransactions = filteredRentals.length
  const averageTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0

  const methodBucket = new Map()
  const itemBucket = new Map()
  const monthBucket = new Map()

  filteredRentals.forEach((rental) => {
    const amount = getRentalAmount(rental)
    const method = String(rental?.payment?.method || 'TUNAI').trim().toUpperCase() || 'TUNAI'
    const monthKey = toJakartaMonthKey(rental?.date)

    const methodCurrent = methodBucket.get(method) || { method, count: 0, revenue: 0 }
    methodCurrent.count += 1
    methodCurrent.revenue += amount
    methodBucket.set(method, methodCurrent)

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

  const methods = [...methodBucket.values()].sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count
    }
    return b.revenue - a.revenue
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
    filteredRentals,
    totalRevenue,
    totalTransactions,
    averageTransaction,
    methods,
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

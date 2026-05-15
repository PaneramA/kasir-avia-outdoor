import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { APP_ROUTES } from '../lib/routes'

function formatDateLabel(dateValue) {
    if (!dateValue) {
        return '-'
    }

    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) {
        return '-'
    }

    return date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    })
}

function getRentalDueDate(rental) {
    const startDate = new Date(rental?.date || '')
    if (Number.isNaN(startDate.getTime())) {
        return null
    }

    const dueDate = new Date(startDate)
    dueDate.setDate(dueDate.getDate() + Number(rental?.duration || 0))
    dueDate.setHours(23, 59, 59, 999)
    return dueDate
}

function isRunningStandalone() {
    if (typeof window === 'undefined') {
        return false
    }

    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

const Header = ({
    title,
    subtitle,
    onOpenSidebar,
    inventory = [],
    rentals = [],
    syncError = '',
    tenantOptions = [],
    branchOptions = [],
    activeTenantId = '',
    activeBranchId = '',
    onTenantChange,
    onBranchChange,
}) => {
    const navigate = useNavigate()
    const containerRef = useRef(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
    const [installPromptEvent, setInstallPromptEvent] = useState(() => {
        if (typeof window === 'undefined') {
            return null
        }

        return window.__aviaDeferredInstallPrompt || null
    })
    const [isStandalone, setIsStandalone] = useState(() => isRunningStandalone())

    const notifications = useMemo(() => {
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)

        const activeRentals = rentals.filter((rental) => rental.status === 'Active')
        const overdueRentals = activeRentals.filter((rental) => {
            const dueDate = getRentalDueDate(rental)
            return dueDate && dueDate < todayStart
        })
        const dueTodayRentals = activeRentals.filter((rental) => {
            const dueDate = getRentalDueDate(rental)
            if (!dueDate) {
                return false
            }

            const dueStart = new Date(dueDate)
            dueStart.setHours(0, 0, 0, 0)
            return dueStart.getTime() === todayStart.getTime()
        })

        const outOfStockItems = inventory.filter((item) => Number(item.stock) <= 0)
        const lowStockItems = inventory.filter((item) => Number(item.stock) > 0 && Number(item.stock) <= 2)

        const result = []

        if (syncError) {
            result.push({
                id: 'sync-error',
                level: 'critical',
                title: 'Sinkronisasi backend bermasalah',
                description: syncError,
                icon: 'fa-triangle-exclamation',
                route: APP_ROUTES.dashboard,
            })
        }

        if (overdueRentals.length > 0) {
            result.push({
                id: 'overdue-rentals',
                level: 'critical',
                title: `${overdueRentals.length} transaksi terlambat kembali`,
                description: 'Segera proses pengembalian untuk update status dan stok.',
                icon: 'fa-hourglass-end',
                route: APP_ROUTES.return,
            })
        }

        if (dueTodayRentals.length > 0) {
            result.push({
                id: 'due-today-rentals',
                level: 'warning',
                title: `${dueTodayRentals.length} transaksi jatuh tempo hari ini`,
                description: 'Pantau pengembalian agar tidak lewat jadwal.',
                icon: 'fa-calendar-day',
                route: APP_ROUTES.return,
            })
        }

        if (outOfStockItems.length > 0) {
            result.push({
                id: 'out-of-stock-items',
                level: 'critical',
                title: `${outOfStockItems.length} barang kehabisan stok`,
                description: 'Barang tidak bisa diproses untuk transaksi baru.',
                icon: 'fa-box-open',
                route: APP_ROUTES.inventory,
            })
        }

        if (lowStockItems.length > 0) {
            result.push({
                id: 'low-stock-items',
                level: 'warning',
                title: `${lowStockItems.length} barang stok menipis`,
                description: 'Pertimbangkan restock agar operasional tetap lancar.',
                icon: 'fa-boxes-stacked',
                route: APP_ROUTES.inventory,
            })
        }

        if (result.length === 0) {
            result.push({
                id: 'all-good',
                level: 'info',
                title: 'Semua aman',
                description: 'Belum ada notifikasi penting saat ini.',
                icon: 'fa-circle-check',
                route: APP_ROUTES.dashboard,
            })
        }

        return result
    }, [inventory, rentals, syncError])

    const searchResults = useMemo(() => {
        const keyword = searchQuery.trim().toLowerCase()
        if (!keyword) {
            return []
        }

        const rentalMatches = rentals
            .filter((rental) => {
                const customerName = String(rental?.customer?.name || '').toLowerCase()
                const customerPhone = String(rental?.customer?.phone || '').toLowerCase()
                const rentalId = String(rental?.id || '').toLowerCase()
                return customerName.includes(keyword) || customerPhone.includes(keyword) || rentalId.includes(keyword)
            })
            .slice(0, 4)
            .map((rental) => ({
                id: `rental-${rental.id}`,
                group: 'Transaksi',
                title: `${rental.id} - ${rental.customer?.name || 'Tanpa Nama'}`,
                subtitle: `${rental.status} • ${formatDateLabel(rental.date)}`,
                route: rental.status === 'Active' ? APP_ROUTES.return : APP_ROUTES.history,
            }))

        const itemMatches = inventory
            .filter((item) => {
                const itemName = String(item?.name || '').toLowerCase()
                const itemCategory = String(item?.category || '').toLowerCase()
                return itemName.includes(keyword) || itemCategory.includes(keyword)
            })
            .slice(0, 4)
            .map((item) => ({
                id: `item-${item.id}`,
                group: 'Barang',
                title: item.name,
                subtitle: `${item.category} • Stok ${item.stock}`,
                route: APP_ROUTES.inventory,
            }))

        const customerPhoneMap = new Map()
        rentals.forEach((rental) => {
            const phone = String(rental?.customer?.phone || '').trim()
            if (!phone) {
                return
            }

            if (!customerPhoneMap.has(phone)) {
                customerPhoneMap.set(phone, rental.customer)
            }
        })

        const customerMatches = [...customerPhoneMap.values()]
            .filter((customer) => {
                const name = String(customer?.name || '').toLowerCase()
                const phone = String(customer?.phone || '').toLowerCase()
                return name.includes(keyword) || phone.includes(keyword)
            })
            .slice(0, 4)
            .map((customer) => ({
                id: `customer-${customer.phone}`,
                group: 'Customer',
                title: customer.name || '-',
                subtitle: customer.phone || '-',
                route: APP_ROUTES.customers,
            }))

        return [...rentalMatches, ...itemMatches, ...customerMatches].slice(0, 8)
    }, [searchQuery, rentals, inventory])

    const unreadCount = useMemo(
        () => notifications.filter((notification) => notification.level !== 'info').length,
        [notifications],
    )

    useEffect(() => {
        const handleOutsideClick = (event) => {
            if (!containerRef.current?.contains(event.target)) {
                setIsNotificationsOpen(false)
            }
        }

        document.addEventListener('mousedown', handleOutsideClick)
        return () => document.removeEventListener('mousedown', handleOutsideClick)
    }, [])

    useEffect(() => {
        const handleInstallPrompt = (event) => {
            event.preventDefault()
            setInstallPromptEvent(event)
        }

        const handleInstallAvailable = () => {
            setInstallPromptEvent(window.__aviaDeferredInstallPrompt || null)
        }

        const handleAppInstalled = () => {
            setInstallPromptEvent(null)
            setIsStandalone(true)
        }

        const mediaQuery = window.matchMedia('(display-mode: standalone)')
        const handleDisplayModeChange = () => {
            setIsStandalone(isRunningStandalone())
        }

        window.addEventListener('beforeinstallprompt', handleInstallPrompt)
        window.addEventListener('avia-install-available', handleInstallAvailable)
        window.addEventListener('appinstalled', handleAppInstalled)
        window.addEventListener('avia-install-installed', handleAppInstalled)

        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', handleDisplayModeChange)
        } else if (mediaQuery.addListener) {
            mediaQuery.addListener(handleDisplayModeChange)
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
            window.removeEventListener('avia-install-available', handleInstallAvailable)
            window.removeEventListener('appinstalled', handleAppInstalled)
            window.removeEventListener('avia-install-installed', handleAppInstalled)

            if (mediaQuery.removeEventListener) {
                mediaQuery.removeEventListener('change', handleDisplayModeChange)
            } else if (mediaQuery.removeListener) {
                mediaQuery.removeListener(handleDisplayModeChange)
            }
        }
    }, [])

    const handleOpenResult = (route) => {
        navigate(route)
        setSearchQuery('')
    }

    const handleInstallClick = async () => {
        if (!installPromptEvent) {
            return
        }

        installPromptEvent.prompt()
        const { outcome } = await installPromptEvent.userChoice
        if (outcome === 'accepted') {
            setInstallPromptEvent(null)
        }
    }

    const isIos =
        typeof navigator !== 'undefined' &&
        /iphone|ipad|ipod/i.test(navigator.userAgent)

    const showSearchResult = searchQuery.trim().length > 0
    const showInstallButton = !isStandalone && Boolean(installPromptEvent)
    const showIosInstallHint = !isStandalone && !installPromptEvent && isIos

    return (
        <header ref={containerRef} className="mb-4 flex flex-col gap-4 py-4 sm:mb-5 sm:py-6 lg:flex-row lg:items-center lg:justify-between lg:py-8">
            <div className="flex items-start gap-3 sm:items-center">
                <button
                    type="button"
                    className="mt-1 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-sidebar-bg text-text-muted transition hover:border-accent hover:text-text-main lg:hidden"
                    onClick={onOpenSidebar}
                    aria-label="Buka menu navigasi"
                >
                    <i className="fas fa-bars"></i>
                </button>
                <div className="flex flex-col">
                    <h1 id="page-title" className="text-[1.3rem] font-bold font-display text-text-main sm:text-[1.6rem] lg:text-[1.8rem]">{title}</h1>
                    <p id="page-subtitle" className="text-[0.82rem] text-text-muted sm:text-[0.9rem]">{subtitle}</p>
                </div>
            </div>

            <div className="relative flex flex-1 flex-col gap-3 sm:gap-4 lg:flex-row lg:items-center lg:gap-5 lg:flex-none">
                <div className="grid grid-cols-1 gap-2 lg:hidden">
                    <select
                        className="h-10 w-full rounded-full border border-border bg-sidebar-bg px-4 text-[0.78rem] text-text-main outline-none focus:border-accent"
                        value={activeTenantId}
                        onChange={(event) => {
                            if (typeof onTenantChange === 'function') {
                                onTenantChange(event.target.value)
                            }
                        }}
                    >
                        {tenantOptions.map((tenant) => (
                            <option key={tenant.id} value={tenant.id}>
                                {tenant.name}
                            </option>
                        ))}
                    </select>
                    <select
                        className="h-10 w-full rounded-full border border-border bg-sidebar-bg px-4 text-[0.78rem] text-text-main outline-none focus:border-accent"
                        value={activeBranchId}
                        onChange={(event) => {
                            if (typeof onBranchChange === 'function') {
                                onBranchChange(event.target.value)
                            }
                        }}
                    >
                        {branchOptions.map((branch) => (
                            <option key={branch.id} value={branch.id}>
                                {branch.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="hidden items-center gap-2 lg:flex">
                    <select
                        className="h-10 min-w-[170px] rounded-full border border-border bg-sidebar-bg px-4 text-[0.78rem] text-text-main outline-none focus:border-accent"
                        value={activeTenantId}
                        onChange={(event) => {
                            if (typeof onTenantChange === 'function') {
                                onTenantChange(event.target.value)
                            }
                        }}
                    >
                        {tenantOptions.map((tenant) => (
                            <option key={tenant.id} value={tenant.id}>
                                {tenant.name}
                            </option>
                        ))}
                    </select>
                    <select
                        className="h-10 min-w-[150px] rounded-full border border-border bg-sidebar-bg px-4 text-[0.78rem] text-text-main outline-none focus:border-accent"
                        value={activeBranchId}
                        onChange={(event) => {
                            if (typeof onBranchChange === 'function') {
                                onBranchChange(event.target.value)
                            }
                        }}
                    >
                        {branchOptions.map((branch) => (
                            <option key={branch.id} value={branch.id}>
                                {branch.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="relative flex min-w-0 flex-1 items-center gap-3 rounded-[30px] border border-border bg-sidebar-bg px-4 py-[10px] lg:w-[320px] xl:w-[350px]">
                    <i className="fas fa-search text-text-muted"></i>
                    <input
                        className="w-full border-none bg-transparent text-[0.9rem] text-text-main outline-none"
                        type="text"
                        placeholder="Cari transaksi, customer, atau barang..."
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && searchResults.length > 0) {
                                event.preventDefault()
                                handleOpenResult(searchResults[0].route)
                            }
                        }}
                    />

                    {showSearchResult && (
                        <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-30 max-h-[340px] overflow-y-auto rounded-xl border border-border bg-sidebar-bg p-2 shadow-2xl">
                            {searchResults.length === 0 ? (
                                <p className="px-3 py-2 text-sm text-text-muted">Tidak ada hasil untuk "{searchQuery}".</p>
                            ) : (
                                searchResults.map((result) => (
                                    <button
                                        key={result.id}
                                        type="button"
                                        className="w-full rounded-lg px-3 py-2 text-left transition hover:bg-black/5 dark:hover:bg-white/5"
                                        onClick={() => handleOpenResult(result.route)}
                                    >
                                        <span className="mb-0.5 block text-[0.72rem] uppercase tracking-wide text-accent">{result.group}</span>
                                        <span className="block text-sm font-medium text-text-main">{result.title}</span>
                                        <span className="block text-xs text-text-muted">{result.subtitle}</span>
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                </div>

                {showInstallButton && (
                    <button
                        type="button"
                        className="flex h-10 shrink-0 items-center gap-2 rounded-full border border-border bg-sidebar-bg px-4 text-[0.78rem] font-semibold text-text-main transition hover:border-accent"
                        onClick={handleInstallClick}
                    >
                        <i className="fas fa-download text-[0.75rem]"></i>
                        Install App
                    </button>
                )}

                {showIosInstallHint && (
                    <button
                        type="button"
                        className="flex h-10 shrink-0 items-center gap-2 rounded-full border border-border bg-sidebar-bg px-4 text-[0.74rem] text-text-muted"
                        onClick={() => {
                            window.alert('Di Safari iPhone/iPad: ketuk Share, lalu pilih "Add to Home Screen".')
                        }}
                    >
                        <i className="fas fa-mobile-screen"></i>
                        Add to Home Screen
                    </button>
                )}

                <div className="relative">
                    <button
                        type="button"
                        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-sidebar-bg text-text-muted transition-all hover:bg-white/5"
                        onClick={() => setIsNotificationsOpen((prev) => !prev)}
                    >
                        <i className="fas fa-bell"></i>
                        {unreadCount > 0 && (
                            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-sidebar-bg bg-[#e74c3c] text-[10px] text-white">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>

                    {isNotificationsOpen && (
                        <div className="absolute right-0 top-[calc(100%+10px)] z-30 w-[320px] max-w-[85vw] rounded-xl border border-border bg-sidebar-bg p-2 shadow-2xl">
                            <div className="mb-2 flex items-center justify-between px-2 py-1">
                                <h4 className="text-sm font-semibold text-text-main">Notifikasi</h4>
                                <span className="text-xs text-text-muted">{notifications.length} item</span>
                            </div>

                            <div className="custom-scrollbar max-h-[320px] space-y-1 overflow-y-auto pr-1">
                                {notifications.map((notification) => (
                                    <button
                                        key={notification.id}
                                        type="button"
                                        className="w-full rounded-lg border border-border/50 bg-bg-main/30 p-3 text-left transition hover:border-accent"
                                        onClick={() => {
                                            navigate(notification.route)
                                            setIsNotificationsOpen(false)
                                        }}
                                    >
                                        <div className="mb-1 flex items-center gap-2">
                                            <i className={`fas ${notification.icon} ${notification.level === 'critical' ? 'text-[#e74c3c]' : notification.level === 'warning' ? 'text-accent' : 'text-[#2ecc71]'}`}></i>
                                            <span className="text-sm font-semibold text-text-main">{notification.title}</span>
                                        </div>
                                        <p className="text-xs text-text-muted">{notification.description}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    )
}

export default Header

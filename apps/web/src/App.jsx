import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import useSWR, { useSWRConfig } from 'swr'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import ErrorBoundary from './components/ErrorBoundary'
import AdminLayout from './components/AdminLayout'
import Login from './pages/Login'
import AdminLogin from './pages/AdminLogin'
import { APP_ROUTES, resolvePageInfo } from './lib/routes'
import { APP_CACHE_KEYS } from './lib/appCache'
import {
  createCategory,
  createItem,
  createRental,
  fetchBranches,
  fetchCurrentBranchSettings,
  fetchCategories,
  fetchCurrentTenantSettings,
  fetchCurrentTenantSubscriptionSummary,
  fetchCurrentUser,
  fetchItems,
  fetchRentals,
  fetchTenants,
  getActiveTenantContext,
  getStoredSession,
  login,
  logout,
  setActiveTenantContext,
  verifyRentalDelete,
  deleteRentalByAdmin as deleteRentalByAdminApi,
  processReturn,
  removeCategory,
  removeItem,
  updateCurrentTenantSettings,
  updateCurrentBranchSettings,
  updateItem,
} from './lib/api'
import { setReceiptProfile } from './lib/receipt'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const AdminOverview = lazy(() => import('./pages/AdminOverview'))
const AdminRegistrations = lazy(() => import('./pages/AdminRegistrations'))
const AdminPlans = lazy(() => import('./pages/AdminPlans'))
const Inventory = lazy(() => import('./pages/Inventory'))
const Rental = lazy(() => import('./pages/Rental'))
const Return = lazy(() => import('./pages/Return'))
const History = lazy(() => import('./pages/History'))
const FinancialRecap = lazy(() => import('./pages/FinancialRecap'))
const Customers = lazy(() => import('./pages/Customers'))
const AdminAccount = lazy(() => import('./pages/AdminAccount'))
const Users = lazy(() => import('./pages/Users'))
const Account = lazy(() => import('./pages/Account'))
const Branches = lazy(() => import('./pages/Branches'))
const TeamSettings = lazy(() => import('./pages/TeamSettings'))

function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-text-muted text-center">
      <i className="fas fa-tools text-[4rem] mb-5 opacity-20"></i>
      <h2 className="text-text-main mb-2">Halaman tidak ditemukan</h2>
      <p>Periksa kembali URL yang kamu buka.</p>
    </div>
  )
}

function resolveEffectiveReceiptProfile(tenantSettings, branchSettings) {
  const safeTenant = tenantSettings && typeof tenantSettings === 'object' ? tenantSettings : {}
  const safeBranch = branchSettings && typeof branchSettings === 'object' ? branchSettings : {}

  const resolveLines = (branchLines, tenantLines) => {
    if (Array.isArray(branchLines) && branchLines.length > 0) {
      return branchLines
    }

    if (Array.isArray(tenantLines)) {
      return tenantLines
    }

    return []
  }

  return {
    ...safeTenant,
    ...safeBranch,
    storeName: String(safeBranch.storeName || '').trim() || String(safeTenant.storeName || '').trim(),
    phone: String(safeBranch.phone || '').trim() || String(safeTenant.phone || '').trim(),
    addressLines: resolveLines(safeBranch.addressLines, safeTenant.addressLines),
    legalFooterLines: resolveLines(safeBranch.legalFooterLines, safeTenant.legalFooterLines),
  }
}

function PageLoader() {
  return <div className="py-10 text-center text-sm text-text-muted">Memuat halaman...</div>
}

function isPlatformAdmin(user) {
  const role = String(user?.role || '').trim().toLowerCase()
  return role === 'superuser'
}

function App() {
  const { mutate: mutateCache } = useSWRConfig()
  const location = useLocation()
  const isAdminPath = location.pathname === APP_ROUTES.admin
    || location.pathname.startsWith(`${APP_ROUTES.admin}/`)
  const [session, setSession] = useState(() => getStoredSession())
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [cart, setCart] = useState([])
  const [errorMessage, setErrorMessage] = useState('')
  const [authErrorMessage, setAuthErrorMessage] = useState('')
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false)
  const [isHeaderDataRequested, setIsHeaderDataRequested] = useState(false)
  const [activeTenantId, setActiveTenantId] = useState(() => getActiveTenantContext().tenantId)
  const [activeBranchId, setActiveBranchId] = useState(() => getActiveTenantContext().branchId)
  const authQuery = useSWR(
    session.token ? APP_CACHE_KEYS.currentUser : null,
    fetchCurrentUser,
    { fallbackData: session.user || undefined, keepPreviousData: false },
  )
  const currentUser = session.token ? (authQuery.data || session.user || null) : null
  const isPlatformAdminUser = useMemo(() => isPlatformAdmin(currentUser), [currentUser])
  const shouldLoadOperationalData = Boolean(currentUser) && !isAdminPath && !isPlatformAdminUser
  const isAuthInitializing = Boolean(session.token) && !currentUser && authQuery.isLoading

  const tenantQuery = useSWR(
    shouldLoadOperationalData ? APP_CACHE_KEYS.tenants : null,
    fetchTenants,
    { keepPreviousData: false },
  )
  const tenantOptions = useMemo(
    () => (Array.isArray(tenantQuery.data) ? tenantQuery.data : []),
    [tenantQuery.data],
  )

  useEffect(() => {
    if (!shouldLoadOperationalData || tenantQuery.data === undefined) return

    if (tenantOptions.length === 0) {
      setActiveTenantId('')
      setActiveBranchId('')
      setActiveTenantContext({ tenantId: '', branchId: '' })
      return
    }

    const stored = getActiveTenantContext()
    const preferredTenantId = tenantOptions.some((tenant) => tenant.id === activeTenantId)
      ? activeTenantId
      : (tenantOptions.some((tenant) => tenant.id === stored.tenantId) ? stored.tenantId : tenantOptions[0].id)

    if (preferredTenantId !== activeTenantId) {
      setActiveTenantId(preferredTenantId)
      setActiveBranchId('')
      setActiveTenantContext({ tenantId: preferredTenantId, branchId: '' })
    }
  }, [activeTenantId, shouldLoadOperationalData, tenantOptions, tenantQuery.data])

  const branchQuery = useSWR(
    shouldLoadOperationalData && activeTenantId ? APP_CACHE_KEYS.branches(activeTenantId) : null,
    () => fetchBranches(activeTenantId),
    { keepPreviousData: false },
  )
  const branchOptions = useMemo(
    () => (Array.isArray(branchQuery.data) ? branchQuery.data : []),
    [branchQuery.data],
  )

  useEffect(() => {
    if (!activeTenantId || branchQuery.data === undefined) return

    const stored = getActiveTenantContext()
    const preferredBranchId = branchOptions.some((branch) => branch.id === activeBranchId)
      ? activeBranchId
      : (
        stored.tenantId === activeTenantId && branchOptions.some((branch) => branch.id === stored.branchId)
          ? stored.branchId
          : (branchOptions[0]?.id || '')
      )

    if (preferredBranchId !== activeBranchId) {
      setActiveBranchId(preferredBranchId)
      setActiveTenantContext({ tenantId: activeTenantId, branchId: preferredBranchId })
    }
  }, [activeBranchId, activeTenantId, branchOptions, branchQuery.data])

  const hasOperationalContext = Boolean(
    shouldLoadOperationalData
    && activeTenantId
    && activeBranchId
    && branchOptions.some((branch) => branch.id === activeBranchId),
  )
  const tenantScopedOptions = { keepPreviousData: false }
  const activePath = location.pathname
  const isInventoryRoute = activePath === APP_ROUTES.inventory
  const isRentalRoute = activePath === APP_ROUTES.rental
  const isReturnRoute = activePath === APP_ROUTES.return
  const isFinancialRoute = activePath === APP_ROUTES.financial
  const isAccountRoute = activePath === APP_ROUTES.settingsAccount || activePath === APP_ROUTES.account
  const shouldLoadItems = hasOperationalContext && (
    isRentalRoute || isReturnRoute || isHeaderDataRequested
  )
  const shouldLoadCategories = hasOperationalContext && (isInventoryRoute || isRentalRoute)
  const shouldLoadRentals = hasOperationalContext && (
    isRentalRoute || isReturnRoute || isHeaderDataRequested
  )
  const shouldLoadTenantSettings = hasOperationalContext && (
    isRentalRoute || isFinancialRoute || isAccountRoute
  )
  const shouldLoadBranchSettings = hasOperationalContext && (isRentalRoute || isAccountRoute)
  const itemQuery = useSWR(
    shouldLoadItems ? APP_CACHE_KEYS.items(activeTenantId, activeBranchId) : null,
    fetchItems,
    tenantScopedOptions,
  )
  const categoryQuery = useSWR(
    shouldLoadCategories ? APP_CACHE_KEYS.categories(activeTenantId) : null,
    fetchCategories,
    tenantScopedOptions,
  )
  const rentalQuery = useSWR(
    shouldLoadRentals ? APP_CACHE_KEYS.rentals(activeTenantId, activeBranchId) : null,
    fetchRentals,
    tenantScopedOptions,
  )
  const tenantSettingsQuery = useSWR(
    shouldLoadTenantSettings ? APP_CACHE_KEYS.tenantSettings(activeTenantId) : null,
    fetchCurrentTenantSettings,
    tenantScopedOptions,
  )
  const branchSettingsQuery = useSWR(
    shouldLoadBranchSettings ? APP_CACHE_KEYS.branchSettings(activeTenantId, activeBranchId) : null,
    fetchCurrentBranchSettings,
    tenantScopedOptions,
  )
  const subscriptionQuery = useSWR(
    hasOperationalContext ? APP_CACHE_KEYS.subscription(activeTenantId) : null,
    fetchCurrentTenantSubscriptionSummary,
    tenantScopedOptions,
  )

  const inventory = useMemo(() => (Array.isArray(itemQuery.data) ? itemQuery.data : []), [itemQuery.data])
  const categories = useMemo(() => (Array.isArray(categoryQuery.data) ? categoryQuery.data : []), [categoryQuery.data])
  const rentals = useMemo(() => (Array.isArray(rentalQuery.data) ? rentalQuery.data : []), [rentalQuery.data])
  const tenantSettings = tenantSettingsQuery.data || null
  const branchSettings = branchSettingsQuery.data || null
  const subscriptionSummary = subscriptionQuery.data || null
  const operationalQueries = [itemQuery, categoryQuery, rentalQuery, tenantSettingsQuery, branchSettingsQuery, subscriptionQuery]
  const isLoading = Boolean(
    shouldLoadOperationalData
    && (tenantQuery.isLoading || branchQuery.isLoading || operationalQueries.some((query) => query.isLoading)),
  )
  const queryError = tenantQuery.error || branchQuery.error || operationalQueries.find((query) => query.error)?.error
  const syncErrorMessage = errorMessage || (queryError instanceof Error ? queryError.message : '')

  useEffect(() => {
    setReceiptProfile(resolveEffectiveReceiptProfile(tenantSettings, branchSettings))
  }, [branchSettings, tenantSettings])

  const getErrorMessage = useCallback((error) => (
    error instanceof Error ? error.message : 'Gagal memuat data dari backend.'
  ), [])

  useEffect(() => {
    const handleAuthExpired = () => {
      setSession({ token: '', user: null })
      setCart([])
      setAuthErrorMessage('Sesi login berakhir. Silakan login kembali.')
    }

    window.addEventListener('avia-auth-expired', handleAuthExpired)
    return () => window.removeEventListener('avia-auth-expired', handleAuthExpired)
  }, [])

  useEffect(() => {
    if (!isRentalRoute || itemQuery.data === undefined || cart.length === 0) {
      return
    }

    setCart((previousCart) => previousCart
      .map((cartItem) => {
        const latestItem = inventory.find((item) => item.id === cartItem.id)
        if (!latestItem || latestItem.stock <= 0) {
          return null
        }

        const safeQty = Math.min(cartItem.qty, latestItem.stock)
        if (safeQty < 1) {
          return null
        }

        return safeQty === cartItem.qty ? cartItem : { ...cartItem, qty: safeQty }
      })
      .filter(Boolean))
  }, [cart.length, inventory, isRentalRoute, itemQuery.data])


  const handleLogin = useCallback(async ({ username, password }) => {
    setAuthErrorMessage('')
    setIsAuthSubmitting(true)

    try {
      const user = await login(username, password)
      if (isPlatformAdmin(user)) {
        logout()
        setSession({ token: '', user: null })
        throw new Error('Akun platform admin hanya bisa masuk lewat /admin.')
      }
      setSession(getStoredSession())
      await authQuery.mutate(user, { revalidate: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login gagal.'
      setAuthErrorMessage(message)
      throw error
    } finally {
      setIsAuthSubmitting(false)
    }
  }, [authQuery])

  const handleAdminLogin = useCallback(async ({ username, password }) => {
    setAuthErrorMessage('')
    setIsAuthSubmitting(true)

    try {
      const user = await login(username, password)
      if (!isPlatformAdmin(user)) {
        logout()
        setSession({ token: '', user: null })
        throw new Error('Akun ini tidak memiliki akses administrator.')
      }
      setSession(getStoredSession())
      await authQuery.mutate(user, { revalidate: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login admin gagal.'
      setAuthErrorMessage(message)
      throw error
    } finally {
      setIsAuthSubmitting(false)
    }
  }, [authQuery])

  const handleLogout = useCallback(() => {
    logout()
    setSession({ token: '', user: null })
    setCart([])
    setActiveTenantId('')
    setActiveBranchId('')
    setActiveTenantContext({ tenantId: '', branchId: '' })
    void mutateCache(() => true, undefined, { revalidate: false })
    setAuthErrorMessage('')
  }, [mutateCache])

  const handleCreateOrUpdateItem = useCallback(
    async (itemPayload, editingItem) => {
      let savedItem
      if (editingItem) {
        savedItem = await updateItem(editingItem.id, itemPayload)
      } else {
        savedItem = await createItem(itemPayload)
      }

      await itemQuery.mutate((current = []) => (
        editingItem
          ? current.map((item) => (item.id === savedItem.id ? savedItem : item))
          : [...current, savedItem]
      ), { revalidate: false })
      void itemQuery.mutate()
      void mutateCache(
        (key) => Array.isArray(key) && key[0] === 'app/inventory-page',
        undefined,
        { revalidate: true },
      )
      return savedItem
    },
    [itemQuery, mutateCache],
  )

  const handleImportItems = useCallback(
    async (itemsPayload, options = {}) => {
      const safeItems = Array.isArray(itemsPayload) ? itemsPayload : []
      if (safeItems.length === 0) {
        return {
          total: 0,
          createdCount: 0,
          createdCategories: [],
          failedItems: [],
        }
      }

      const shouldCreateMissingCategories = options.createMissingCategories !== false
      const normalizedCategoryMap = new Map(
        categories.map((categoryName) => {
          const trimmed = String(categoryName || '').trim()
          return [trimmed.toLowerCase(), trimmed]
        }),
      )

      const createdCategories = []
      if (shouldCreateMissingCategories) {
        const categoriesToCreate = []

        safeItems.forEach((item) => {
          const categoryName = String(item?.category || '').trim()
          if (!categoryName) {
            return
          }

          const key = categoryName.toLowerCase()
          if (normalizedCategoryMap.has(key) || categoriesToCreate.some((existing) => existing.toLowerCase() === key)) {
            return
          }

          categoriesToCreate.push(categoryName)
        })

        for (const categoryName of categoriesToCreate) {
          try {
            await createCategory(categoryName)
            normalizedCategoryMap.set(categoryName.toLowerCase(), categoryName)
            createdCategories.push(categoryName)
          } catch (error) {
            const message = error instanceof Error ? error.message : ''
            if (message.toLowerCase().includes('already exists')) {
              normalizedCategoryMap.set(categoryName.toLowerCase(), categoryName)
              continue
            }

            throw error
          }
        }
      }

      const failedItems = []
      const createdItems = []
      let createdCount = 0

      for (const itemPayload of safeItems) {
        try {
          const createdItem = await createItem(itemPayload)
          createdItems.push(createdItem)
          createdCount += 1
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Gagal menyimpan item.'
          failedItems.push({
            name: String(itemPayload?.name || '').trim() || '-',
            message,
          })
        }
      }

      if (createdItems.length > 0) {
        await itemQuery.mutate((current = []) => [...current, ...createdItems], { revalidate: false })
        void itemQuery.mutate()
        void mutateCache(
          (key) => Array.isArray(key) && key[0] === 'app/inventory-page',
          undefined,
          { revalidate: true },
        )
      }
      if (createdCategories.length > 0) {
        await categoryQuery.mutate((current = []) => [...new Set([...current, ...createdCategories])], { revalidate: false })
        void categoryQuery.mutate()
      }

      return {
        total: safeItems.length,
        createdCount,
        createdCategories,
        failedItems,
      }
    },
    [categories, categoryQuery, itemQuery, mutateCache],
  )

  const handleDeleteItem = useCallback(
    async (id) => {
      await removeItem(id)
      await itemQuery.mutate((current = []) => current.filter((item) => item.id !== id), { revalidate: false })
      void itemQuery.mutate()
      void mutateCache(
        (key) => Array.isArray(key) && key[0] === 'app/inventory-page',
        undefined,
        { revalidate: true },
      )
    },
    [itemQuery, mutateCache],
  )

  const handleCreateCategory = useCallback(
    async (name) => {
      const createdName = await createCategory(name)
      await categoryQuery.mutate((current = []) => (
        current.includes(createdName) ? current : [...current, createdName]
      ), { revalidate: false })
      void categoryQuery.mutate()
    },
    [categoryQuery],
  )

  const handleDeleteCategory = useCallback(
    async (name) => {
      await removeCategory(name)
      await categoryQuery.mutate((current = []) => current.filter((category) => category !== name), { revalidate: false })
      void categoryQuery.mutate()
    },
    [categoryQuery],
  )

  const handleCheckout = useCallback(
    async (payload) => {
      let createdRental = null
      try {
        createdRental = await createRental(payload)
      } catch (error) {
        void Promise.all([itemQuery.mutate(), rentalQuery.mutate()])
        throw error
      }

      const rentedItems = Array.isArray(createdRental?.items) ? createdRental.items : (payload?.items || [])
      const rentedQtyById = rentedItems.reduce((acc, item) => {
        const itemId = String(item?.id || '').trim()
        if (itemId) acc[itemId] = (acc[itemId] || 0) + Math.max(0, Number(item?.qty || 0))
        return acc
      }, {})
      await Promise.all([
        rentalQuery.mutate((current = []) => [createdRental, ...current], { revalidate: false }),
        itemQuery.mutate((current = []) => current.map((item) => (
          rentedQtyById[item.id]
            ? { ...item, stock: Math.max(0, Number(item.stock || 0) - rentedQtyById[item.id]) }
            : item
        )), { revalidate: false }),
      ])
      void Promise.all([itemQuery.mutate(), rentalQuery.mutate()]).catch((error) => {
        setErrorMessage(getErrorMessage(error))
      })
      void mutateCache(
        (key) => Array.isArray(key) && (
          key[0] === 'app/dashboard' || key[0] === 'app/financial-recap'
          || key[0] === 'app/inventory-page'
        ),
        undefined,
        { revalidate: true },
      )

      return createdRental
    },
    [getErrorMessage, itemQuery, mutateCache, rentalQuery],
  )

  const handleProcessReturn = useCallback(
    async (payload) => {
      const processed = await processReturn(payload)
      if (processed?.rental?.id) {
        await rentalQuery.mutate((previousRentals = []) => previousRentals.map((rental) => (
          rental.id === processed.rental.id
            ? {
              ...rental,
              ...processed.rental,
              status: 'Returned',
            }
            : rental
        )), { revalidate: false })

        const returnedItems = Array.isArray(processed?.rental?.items) ? processed.rental.items : []
        if (returnedItems.length > 0) {
          const returnedQtyById = returnedItems.reduce((acc, item) => {
            const itemId = String(item?.id || '').trim()
            if (!itemId) {
              return acc
            }

            const qty = Number(item?.qty || 0)
            acc[itemId] = (acc[itemId] || 0) + (Number.isFinite(qty) ? Math.max(0, qty) : 0)
            return acc
          }, {})

          await itemQuery.mutate((previousInventory = []) => previousInventory.map((item) => {
            const restockQty = returnedQtyById[item.id] || 0
            if (restockQty <= 0) {
              return item
            }

            return {
              ...item,
              stock: Number(item.stock || 0) + restockQty,
            }
          }), { revalidate: false })
        }
      }

      void Promise.all([itemQuery.mutate(), rentalQuery.mutate()]).catch((error) => {
        setErrorMessage(getErrorMessage(error))
      })
      void mutateCache(
        (key) => Array.isArray(key) && (
          key[0] === 'app/dashboard' || key[0] === 'app/financial-recap'
          || key[0] === 'app/inventory-page'
        ),
        undefined,
        { revalidate: true },
      )
      return processed
    },
    [getErrorMessage, itemQuery, mutateCache, rentalQuery],
  )

  const handleVerifyRentalDelete = useCallback(
    async (rentalId, password) => verifyRentalDelete(rentalId, password),
    [],
  )

  const handleDeleteRentalByAdmin = useCallback(
    async (rentalId, payload) => {
      const deleted = await deleteRentalByAdminApi(rentalId, payload)
      await rentalQuery.mutate((current = []) => current.filter((rental) => rental.id !== rentalId), { revalidate: false })
      void rentalQuery.mutate()
      return deleted
    },
    [rentalQuery],
  )

  const handleUpdateTenantSettings = useCallback(
    async (payload) => {
      const updated = await updateCurrentTenantSettings(payload)
      await tenantSettingsQuery.mutate(updated || null, { revalidate: false })
      setReceiptProfile(resolveEffectiveReceiptProfile(updated, branchSettings))
      return updated
    },
    [branchSettings, tenantSettingsQuery],
  )

  const handleUpdateBranchSettings = useCallback(
    async (payload) => {
      const updated = await updateCurrentBranchSettings(payload)
      await branchSettingsQuery.mutate(updated || null, { revalidate: false })
      setReceiptProfile(resolveEffectiveReceiptProfile(tenantSettings, updated))
      return updated
    },
    [branchSettingsQuery, tenantSettings],
  )

  const handleTenantChange = useCallback(async (nextTenantId) => {
    const tenantId = String(nextTenantId || '').trim()
    if (!tenantId) {
      return
    }

    setActiveTenantId(tenantId)
    setActiveBranchId('')
    setActiveTenantContext({
      tenantId,
      branchId: '',
    })
  }, [])

  const handleBranchChange = useCallback(async (nextBranchId) => {
    const branchId = String(nextBranchId || '').trim()
    if (!branchId) {
      return
    }

    setActiveBranchId(branchId)
    setActiveTenantContext({
      tenantId: activeTenantId,
      branchId,
    })
  }, [activeTenantId])

  const headerInfo = useMemo(() => resolvePageInfo(location.pathname), [location.pathname])
  useEffect(() => {
    setIsSidebarOpen(false)
  }, [location.pathname])

  if (isAuthInitializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-main px-4">
        <div className="rounded-lg border border-border bg-sidebar-bg p-4 text-sm text-text-muted">
          Memvalidasi sesi login...
        </div>
      </div>
    )
  }

  if (!currentUser) {
    if (isAdminPath) {
      return (
        <AdminLogin
          onLogin={handleAdminLogin}
          isSubmitting={isAuthSubmitting}
          errorMessage={authErrorMessage}
        />
      )
    }

    return (
      <Routes>
        <Route
          path={APP_ROUTES.login}
          element={<Login onLogin={handleLogin} isSubmitting={isAuthSubmitting} errorMessage={authErrorMessage} />}
        />
        <Route path="*" element={<Navigate to={APP_ROUTES.login} replace />} />
      </Routes>
    )
  }

  if (isAdminPath) {
    if (!isPlatformAdminUser) {
      return (
        <AdminLogin
          onLogin={handleAdminLogin}
          isSubmitting={isAuthSubmitting}
          errorMessage={authErrorMessage}
          currentUser={currentUser}
          onClearSession={handleLogout}
        />
      )
    }

    return (
      <AdminLayout currentUser={currentUser} onLogout={handleLogout}>
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path={APP_ROUTES.admin} element={<AdminOverview currentUser={currentUser} />} />
              <Route path={APP_ROUTES.adminStores} element={<AdminRegistrations />} />
              <Route path={APP_ROUTES.adminRegistrations} element={<Navigate to={APP_ROUTES.adminStores} replace />} />
              <Route path={APP_ROUTES.adminPlans} element={<AdminPlans />} />
              <Route path={APP_ROUTES.adminAccount} element={<AdminAccount currentUser={currentUser} />} />
              <Route path={APP_ROUTES.adminUsers} element={<Users />} />
              <Route path={APP_ROUTES.adminBranches} element={<Navigate to={APP_ROUTES.adminStores} replace />} />
              <Route path="*" element={<Navigate to={APP_ROUTES.admin} replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </AdminLayout>
    )
  }

  if (isPlatformAdminUser) {
    return <Navigate to={APP_ROUTES.admin} replace />
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg-main">
      <Sidebar
        currentUser={currentUser}
        subscriptionSummary={subscriptionSummary}
        onLogout={handleLogout}
        isMobileOpen={isSidebarOpen}
        onCloseMobile={() => setIsSidebarOpen(false)}
      />

      <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto px-4 sm:px-6 lg:min-h-0 lg:overflow-hidden lg:px-10">
        <ErrorBoundary resetKey={`${location.pathname}-${activeTenantId}-${activeBranchId}`}>
          <Header
            title={headerInfo.title}
            subtitle={headerInfo.subtitle}
            onOpenSidebar={() => setIsSidebarOpen(true)}
            inventory={inventory}
            rentals={rentals}
            syncError={syncErrorMessage}
            tenantOptions={tenantOptions}
            branchOptions={branchOptions}
            activeTenantId={activeTenantId}
            activeBranchId={activeBranchId}
            onTenantChange={handleTenantChange}
            onBranchChange={handleBranchChange}
            onDataDemandChange={setIsHeaderDataRequested}
          />

          <div id="content-view" className="pb-6 sm:pb-10 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            {isLoading && (
              <div className="mb-4 rounded-lg border border-border bg-sidebar-bg p-4 text-sm text-text-muted">
                Memuat data dari backend...
              </div>
            )}

            {syncErrorMessage && (
              <div className="mb-4 rounded-lg border border-[#e74c3c]/40 bg-[#e74c3c]/10 p-4 text-sm text-[#e74c3c]">
                Gagal sinkron ke backend: {syncErrorMessage}
              </div>
            )}

            <Suspense fallback={<PageLoader />}>
            <Routes>
            <Route path={APP_ROUTES.login} element={<Navigate to={APP_ROUTES.dashboard} replace />} />
            <Route path="/" element={<Navigate to={APP_ROUTES.dashboard} replace />} />
            <Route path={APP_ROUTES.dashboard} element={<Dashboard tenantId={activeTenantId} branchId={activeBranchId} />} />
            <Route
              path={APP_ROUTES.inventory}
              element={
                <Inventory
                  tenantId={activeTenantId}
                  branchId={activeBranchId}
                  categories={categories}
                  onSaveItem={handleCreateOrUpdateItem}
                  onImportItems={handleImportItems}
                  onDeleteItem={handleDeleteItem}
                  onAddCategory={handleCreateCategory}
                  onDeleteCategory={handleDeleteCategory}
                />
              }
            />
            <Route
              path={APP_ROUTES.rental}
              element={
                <Rental
                  inventory={inventory}
                  categories={categories}
                  cart={cart}
                  setCart={setCart}
                  onCheckout={handleCheckout}
                  currentUser={currentUser}
                  tenantSettings={tenantSettings}
                />
              }
            />
            <Route
              path={APP_ROUTES.return}
              element={
                <Return
                  rentals={rentals}
                  onProcessReturn={handleProcessReturn}
                />
              }
            />
            <Route path={APP_ROUTES.customers} element={<Customers />} />
            <Route
              path={APP_ROUTES.financial}
              element={subscriptionSummary?.features?.canUseFinancialRecap === false
                ? <Navigate to={APP_ROUTES.dashboard} replace />
                : (
                <FinancialRecap
                  key={`${tenantSettings?.tenantId || 'tenant'}-${tenantSettings?.financialClosingDay || 31}`}
                  tenantId={activeTenantId}
                  branchId={activeBranchId}
                  tenantSettings={tenantSettings}
                  canExportData={subscriptionSummary?.features?.canExportData !== false}
                />
                )}
            />
            <Route
              path={APP_ROUTES.history}
              element={(
                <History
                  currentUser={currentUser}
                  onVerifyRentalDelete={handleVerifyRentalDelete}
                  onDeleteRentalByAdmin={handleDeleteRentalByAdmin}
                />
              )}
            />
            <Route
              path={APP_ROUTES.users}
              element={<Navigate to={APP_ROUTES.settingsTeam} replace />}
            />
            <Route
              path={APP_ROUTES.branches}
              element={<Navigate to={APP_ROUTES.settingsBranches} replace />}
            />
            <Route
              path={APP_ROUTES.settingsBranches}
              element={subscriptionSummary?.features?.canManageBranches === false
                ? <Navigate to={APP_ROUTES.dashboard} replace />
                : <Branches />}
            />
            <Route
              path={APP_ROUTES.settingsTeam}
              element={subscriptionSummary?.features?.canManageStaff === false
                ? <Navigate to={APP_ROUTES.dashboard} replace />
                : <TeamSettings />}
            />
            <Route
              path={APP_ROUTES.account}
              element={<Navigate to={APP_ROUTES.settingsAccount} replace />}
            />
            <Route
              path={APP_ROUTES.settingsAccount}
              element={(
                <Account
                  currentUser={currentUser}
                  tenantSettings={tenantSettings}
                  branchSettings={branchSettings}
                  subscriptionSummary={subscriptionSummary}
                  isSubscriptionLoading={subscriptionQuery.isLoading}
                  subscriptionErrorMessage={subscriptionQuery.error instanceof Error ? subscriptionQuery.error.message : ''}
                  onUpdateTenantSettings={handleUpdateTenantSettings}
                  onUpdateBranchSettings={handleUpdateBranchSettings}
                />
              )}
            />
            <Route
              path={APP_ROUTES.adminAccount}
              element={isPlatformAdminUser ? (
                <Account
                  currentUser={currentUser}
                  tenantSettings={tenantSettings}
                  branchSettings={branchSettings}
                  onUpdateTenantSettings={handleUpdateTenantSettings}
                  onUpdateBranchSettings={handleUpdateBranchSettings}
                />
              ) : <Navigate to={APP_ROUTES.account} replace />}
            />
            <Route path="*" element={<NotFoundPage />} />
            </Routes>
            </Suspense>
          </div>
        </ErrorBoundary>
      </main>
    </div>
  )
}

export default App

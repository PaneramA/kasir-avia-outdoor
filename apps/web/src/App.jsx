import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import Rental from './pages/Rental'
import Return from './pages/Return'
import History from './pages/History'
import Customers from './pages/Customers'
import Login from './pages/Login'
import Users from './pages/Users'
import Account from './pages/Account'
import Branches from './pages/Branches'
import { APP_ROUTES, PAGE_INFO } from './lib/routes'
import {
  createCategory,
  createItem,
  createRental,
  fetchBranches,
  fetchCurrentBranchSettings,
  fetchCategories,
  fetchCurrentTenantSettings,
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

function App() {
  const location = useLocation()
  const [initialSession] = useState(() => getStoredSession())
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [inventory, setInventory] = useState([])
  const [categories, setCategories] = useState([])
  const [rentals, setRentals] = useState([])
  const [cart, setCart] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [authErrorMessage, setAuthErrorMessage] = useState('')
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false)
  const [tenantSettings, setTenantSettings] = useState(null)
  const [branchSettings, setBranchSettings] = useState(null)
  const [tenantOptions, setTenantOptions] = useState([])
  const [branchOptions, setBranchOptions] = useState([])
  const [activeTenantId, setActiveTenantId] = useState(() => getActiveTenantContext().tenantId)
  const [activeBranchId, setActiveBranchId] = useState(() => getActiveTenantContext().branchId)
  const [isAuthInitializing, setIsAuthInitializing] = useState(
    () => Boolean(initialSession.token),
  )
  const [currentUser, setCurrentUser] = useState(() => initialSession.user)
  const isBackgroundSyncingRef = useRef(false)

  const ensureTenantBranchContext = useCallback(async () => {
    const tenants = await fetchTenants()
    const safeTenants = Array.isArray(tenants) ? tenants : []
    setTenantOptions(safeTenants)

    if (safeTenants.length === 0) {
      setBranchOptions([])
      setActiveTenantId('')
      setActiveBranchId('')
      setActiveTenantContext({ tenantId: '', branchId: '' })
      return { tenantId: '', branchId: '' }
    }

    const stored = getActiveTenantContext()
    const preferredTenantId = safeTenants.some((tenant) => tenant.id === stored.tenantId)
      ? stored.tenantId
      : safeTenants[0].id

    const branches = await fetchBranches(preferredTenantId)
    const safeBranches = Array.isArray(branches) ? branches : []
    setBranchOptions(safeBranches)

    const preferredBranchId = safeBranches.some((branch) => branch.id === stored.branchId)
      ? stored.branchId
      : (safeBranches[0]?.id || '')

    const nextContext = {
      tenantId: preferredTenantId,
      branchId: preferredBranchId,
    }

    setActiveTenantContext(nextContext)
    setActiveTenantId(nextContext.tenantId)
    setActiveBranchId(nextContext.branchId)

    return nextContext
  }, [])

  const loadInitialData = useCallback(async () => {
    setErrorMessage('')

    await ensureTenantBranchContext()

    const [itemsData, categoriesData, rentalsData, settings, currentBranchSettings] = await Promise.all([
      fetchItems(),
      fetchCategories(),
      fetchRentals(),
      fetchCurrentTenantSettings().catch(() => null),
      fetchCurrentBranchSettings().catch(() => null),
    ])

    setInventory(Array.isArray(itemsData) ? itemsData : [])
    setCategories(Array.isArray(categoriesData) ? categoriesData : [])
    setRentals(Array.isArray(rentalsData) ? rentalsData : [])
    setTenantSettings(settings || null)
    setBranchSettings(currentBranchSettings || null)
    setReceiptProfile(resolveEffectiveReceiptProfile(settings, currentBranchSettings))
  }, [ensureTenantBranchContext])

  const refreshData = useCallback(async () => {
    await loadInitialData()
  }, [loadInitialData])

  const getErrorMessage = useCallback((error) => (
    error instanceof Error ? error.message : 'Gagal memuat data dari backend.'
  ), [])

  useEffect(() => {
    const handleAuthExpired = () => {
      setCurrentUser(null)
      setCart([])
      setAuthErrorMessage('Sesi login berakhir. Silakan login kembali.')
    }

    window.addEventListener('avia-auth-expired', handleAuthExpired)
    return () => window.removeEventListener('avia-auth-expired', handleAuthExpired)
  }, [])

  useEffect(() => {
    let isActive = true

    if (!initialSession.token) {
      setIsAuthInitializing(false)
      return () => {
        isActive = false
      }
    }

    if (!initialSession.user) {
      logout()
      setIsAuthInitializing(false)
      return () => {
        isActive = false
      }
    }

    const syncCurrentUser = async () => {
      try {
        const user = await fetchCurrentUser()
        if (!isActive) {
          return
        }

        setCurrentUser(user)
      } catch {
        if (!isActive) {
          return
        }

        logout()
        setCurrentUser(null)
        setAuthErrorMessage('Sesi login tidak valid. Silakan login kembali.')
      } finally {
        if (isActive) {
          setIsAuthInitializing(false)
        }
      }
    }

    syncCurrentUser()

    return () => {
      isActive = false
    }
  }, [initialSession.token, initialSession.user])

  useEffect(() => {
    if (!currentUser) {
      setInventory([])
      setCategories([])
      setRentals([])
      setCart([])
      setTenantSettings(null)
      setBranchSettings(null)
      setTenantOptions([])
      setBranchOptions([])
      setActiveTenantId('')
      setActiveBranchId('')
      setActiveTenantContext({ tenantId: '', branchId: '' })
      setReceiptProfile(null)
      setIsLoading(false)
      setErrorMessage('')
      return
    }

    let isActive = true

    const bootstrap = async () => {
      setIsLoading(true)
      try {
        await loadInitialData()
      } catch (error) {
        if (!isActive) {
          return
        }

        setErrorMessage(getErrorMessage(error))
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    bootstrap()

    return () => {
      isActive = false
    }
  }, [currentUser, getErrorMessage, loadInitialData])

  useEffect(() => {
    if (cart.length === 0) {
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
  }, [cart.length, inventory])

  useEffect(() => {
    if (!currentUser) {
      return undefined
    }

    let isActive = true

    const syncData = async () => {
      if (!isActive || isBackgroundSyncingRef.current) {
        return
      }

      isBackgroundSyncingRef.current = true
      try {
        await refreshData()
        if (isActive) {
          setErrorMessage('')
        }
      } catch (error) {
        if (isActive) {
          setErrorMessage(getErrorMessage(error))
        }
      } finally {
        isBackgroundSyncingRef.current = false
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void syncData()
      }
    }

    const handleWindowFocus = () => {
      void syncData()
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void syncData()
      }
    }, 15000)

    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      isActive = false
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [currentUser, getErrorMessage, refreshData])

  const handleLogin = useCallback(async ({ username, password }) => {
    setAuthErrorMessage('')
    setIsAuthSubmitting(true)

    try {
      const user = await login(username, password)
      setCurrentUser(user)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login gagal.'
      setAuthErrorMessage(message)
      throw error
    } finally {
      setIsAuthSubmitting(false)
    }
  }, [])

  const handleLogout = useCallback(() => {
    logout()
    setCurrentUser(null)
  }, [])

  const handleCreateOrUpdateItem = useCallback(
    async (itemPayload, editingItem) => {
      if (editingItem) {
        await updateItem(editingItem.id, itemPayload)
      } else {
        await createItem(itemPayload)
      }

      await refreshData()
    },
    [refreshData],
  )

  const handleDeleteItem = useCallback(
    async (id) => {
      await removeItem(id)
      await refreshData()
    },
    [refreshData],
  )

  const handleCreateCategory = useCallback(
    async (name) => {
      await createCategory(name)
      await refreshData()
    },
    [refreshData],
  )

  const handleDeleteCategory = useCallback(
    async (name) => {
      await removeCategory(name)
      await refreshData()
    },
    [refreshData],
  )

  const handleCheckout = useCallback(
    async (payload) => {
      try {
        const createdRental = await createRental(payload)
        await refreshData()
        return createdRental
      } catch (error) {
        try {
          await refreshData()
        } catch {
          // Preserve original checkout error below.
        }

        throw error
      }
    },
    [refreshData],
  )

  const handleProcessReturn = useCallback(
    async (payload) => {
      const processed = await processReturn(payload)
      await refreshData()
      return processed
    },
    [refreshData],
  )

  const handleVerifyRentalDelete = useCallback(
    async (rentalId, password) => verifyRentalDelete(rentalId, password),
    [],
  )

  const handleDeleteRentalByAdmin = useCallback(
    async (rentalId, payload) => {
      const deleted = await deleteRentalByAdminApi(rentalId, payload)
      await refreshData()
      return deleted
    },
    [refreshData],
  )

  const handleUpdateTenantSettings = useCallback(
    async (payload) => {
      const updated = await updateCurrentTenantSettings(payload)
      setTenantSettings(updated || null)
      setReceiptProfile(resolveEffectiveReceiptProfile(updated, branchSettings))
      return updated
    },
    [branchSettings],
  )

  const handleUpdateBranchSettings = useCallback(
    async (payload) => {
      const updated = await updateCurrentBranchSettings(payload)
      setBranchSettings(updated || null)
      setReceiptProfile(resolveEffectiveReceiptProfile(tenantSettings, updated))
      return updated
    },
    [tenantSettings],
  )

  const handleTenantChange = useCallback(async (nextTenantId) => {
    const tenantId = String(nextTenantId || '').trim()
    if (!tenantId) {
      return
    }

    const branches = await fetchBranches(tenantId)
    const safeBranches = Array.isArray(branches) ? branches : []
    const nextBranchId = safeBranches[0]?.id || ''

    setBranchOptions(safeBranches)
    setActiveTenantId(tenantId)
    setActiveBranchId(nextBranchId)
    setActiveTenantContext({
      tenantId,
      branchId: nextBranchId,
    })
    await refreshData()
  }, [refreshData])

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
    await refreshData()
  }, [activeTenantId, refreshData])

  const headerInfo = useMemo(
    () => PAGE_INFO[location.pathname] || PAGE_INFO[APP_ROUTES.dashboard],
    [location.pathname],
  )
  const isAdminLikeUser = useMemo(() => {
    const role = String(currentUser?.role || '').trim().toLowerCase()
    return role === 'admin' || role === 'superuser'
  }, [currentUser?.role])

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

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg-main">
      <Sidebar
        currentUser={currentUser}
        onLogout={handleLogout}
        isMobileOpen={isSidebarOpen}
        onCloseMobile={() => setIsSidebarOpen(false)}
      />

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden px-4 sm:px-6 lg:min-h-0 lg:px-10">
        <Header
          title={headerInfo.title}
          subtitle={headerInfo.subtitle}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          inventory={inventory}
          rentals={rentals}
          syncError={errorMessage}
          tenantOptions={tenantOptions}
          branchOptions={branchOptions}
          activeTenantId={activeTenantId}
          activeBranchId={activeBranchId}
          onTenantChange={handleTenantChange}
          onBranchChange={handleBranchChange}
        />

        <div id="content-view" className="flex-1 overflow-y-auto pb-6 sm:pb-10 lg:min-h-0">
          {isLoading && (
            <div className="mb-4 rounded-lg border border-border bg-sidebar-bg p-4 text-sm text-text-muted">
              Memuat data dari backend...
            </div>
          )}

          {errorMessage && (
            <div className="mb-4 rounded-lg border border-[#e74c3c]/40 bg-[#e74c3c]/10 p-4 text-sm text-[#e74c3c]">
              Gagal sinkron ke backend: {errorMessage}
            </div>
          )}

          <Routes>
            <Route path={APP_ROUTES.login} element={<Navigate to={APP_ROUTES.dashboard} replace />} />
            <Route path="/" element={<Navigate to={APP_ROUTES.dashboard} replace />} />
            <Route path={APP_ROUTES.dashboard} element={<Dashboard inventory={inventory} rentals={rentals} />} />
            <Route
              path={APP_ROUTES.inventory}
              element={
                <Inventory
                  inventory={inventory}
                  categories={categories}
                  onSaveItem={handleCreateOrUpdateItem}
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
              path={APP_ROUTES.history}
              element={(
                <History
                  rentals={rentals}
                  currentUser={currentUser}
                  onVerifyRentalDelete={handleVerifyRentalDelete}
                  onDeleteRentalByAdmin={handleDeleteRentalByAdmin}
                />
              )}
            />
            <Route
              path={APP_ROUTES.users}
              element={isAdminLikeUser ? <Users /> : <Navigate to={APP_ROUTES.dashboard} replace />}
            />
            <Route
              path={APP_ROUTES.branches}
              element={isAdminLikeUser ? <Branches /> : <Navigate to={APP_ROUTES.dashboard} replace />}
            />
            <Route
              path={APP_ROUTES.account}
              element={(
                <Account
                  currentUser={currentUser}
                  tenantSettings={tenantSettings}
                  branchSettings={branchSettings}
                  onUpdateTenantSettings={handleUpdateTenantSettings}
                  onUpdateBranchSettings={handleUpdateBranchSettings}
                />
              )}
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

export default App

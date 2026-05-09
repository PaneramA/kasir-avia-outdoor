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
import { APP_ROUTES, PAGE_INFO } from './lib/routes'
import {
  createCategory,
  createItem,
  createRental,
  fetchCategories,
  fetchCurrentUser,
  fetchItems,
  fetchRentals,
  getStoredSession,
  login,
  logout,
  processReturn,
  removeCategory,
  removeItem,
  updateItem,
} from './lib/api'

function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-text-muted text-center">
      <i className="fas fa-tools text-[4rem] mb-5 opacity-20"></i>
      <h2 className="text-text-main mb-2">Halaman tidak ditemukan</h2>
      <p>Periksa kembali URL yang kamu buka.</p>
    </div>
  )
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
  const [isAuthInitializing, setIsAuthInitializing] = useState(
    () => Boolean(initialSession.token),
  )
  const [currentUser, setCurrentUser] = useState(() => initialSession.user)
  const isBackgroundSyncingRef = useRef(false)

  const loadInitialData = useCallback(async () => {
    setErrorMessage('')

    const [itemsData, categoriesData, rentalsData] = await Promise.all([
      fetchItems(),
      fetchCategories(),
      fetchRentals(),
    ])

    setInventory(itemsData)
    setCategories(categoriesData)
    setRentals(rentalsData)
  }, [])

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

  const headerInfo = useMemo(
    () => PAGE_INFO[location.pathname] || PAGE_INFO[APP_ROUTES.dashboard],
    [location.pathname],
  )

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
            <Route path={APP_ROUTES.history} element={<History rentals={rentals} />} />
            <Route
              path={APP_ROUTES.users}
              element={String(currentUser?.role || '').toLowerCase() === 'admin' ? <Users /> : <Navigate to={APP_ROUTES.dashboard} replace />}
            />
            <Route
              path={APP_ROUTES.account}
              element={<Account currentUser={currentUser} />}
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

export default App

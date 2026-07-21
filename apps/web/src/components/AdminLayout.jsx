import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { SWRConfig } from 'swr'
import { APP_ROUTES, resolvePageInfo } from '../lib/routes'
import { ADMIN_SWR_OPTIONS } from '../lib/adminCache'

const navigationItems = [
  { path: APP_ROUTES.admin, label: 'Ringkasan', icon: 'fas fa-chart-pie', end: true },
  { path: APP_ROUTES.adminStores, label: 'Toko', icon: 'fas fa-store' },
  { path: APP_ROUTES.adminPlans, label: 'Paket & Fitur', icon: 'fas fa-sliders' },
  { path: APP_ROUTES.adminAccount, label: 'Akun Admin', icon: 'fas fa-user-shield' },
]

function AdminNavLink({ item, onClick }) {
  return (
    <NavLink
      to={item.path}
      end={item.end}
      onClick={onClick}
      className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
        isActive
          ? 'bg-[#173f3a] text-white'
          : 'text-[#52616b] hover:bg-[#edf2f1] hover:text-[#173f3a]'
      }`}
    >
      <i className={`${item.icon} w-5 text-center`} />
      <span>{item.label}</span>
    </NavLink>
  )
}

const AdminLayout = ({ currentUser, onLogout, children }) => {
  const location = useLocation()
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const pageInfo = resolvePageInfo(location.pathname)

  return (
    <SWRConfig value={ADMIN_SWR_OPTIONS}>
    <div className="min-h-screen bg-[#f4f6f8] text-[#17202a]">
      <div className="flex min-h-screen">
        <button
          type="button"
          aria-label="Tutup navigasi admin"
          className={`fixed inset-0 z-40 bg-black/35 lg:hidden ${isMobileNavOpen ? 'block' : 'hidden'}`}
          onClick={() => setIsMobileNavOpen(false)}
        />

        <aside className={`fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-[#dce3e6] bg-white transition-transform lg:static lg:translate-x-0 ${
          isMobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
          <div className="flex h-[72px] items-center justify-between border-b border-[#e6ebed] px-5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#173f3a] text-white">
                <i className="fas fa-shield-halved" />
              </span>
              <div>
                <p className="text-sm font-bold text-[#17202a]">Avia Admin</p>
                <p className="text-xs text-[#71808a]">Control panel</p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Tutup menu"
              className="flex h-9 w-9 items-center justify-center text-[#52616b] lg:hidden"
              onClick={() => setIsMobileNavOpen(false)}
            >
              <i className="fas fa-xmark" />
            </button>
          </div>

          <nav className="flex-1 space-y-1 px-3 py-5">
            {navigationItems.map((item) => (
              <AdminNavLink key={item.path} item={item} onClick={() => setIsMobileNavOpen(false)} />
            ))}
          </nav>

          <div className="border-t border-[#e6ebed] p-4">
            <div className="mb-3 flex items-center gap-3 px-1">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e8f0ee] text-[#173f3a]">
                <i className="fas fa-user" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#17202a]">{currentUser?.username || 'Admin'}</p>
                <p className="text-xs capitalize text-[#71808a]">{currentUser?.role || 'admin'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#d7dfe2] text-sm font-semibold text-[#52616b] transition hover:border-[#c64040] hover:text-[#b52f2f]"
            >
              <i className="fas fa-right-from-bracket" />
              Keluar
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-[#dce3e6] bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-label="Buka navigasi admin"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#d7dfe2] text-[#52616b] lg:hidden"
                onClick={() => setIsMobileNavOpen(true)}
              >
                <i className="fas fa-bars" />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold text-[#17202a] sm:text-lg">{pageInfo.title}</h1>
                <p className="hidden truncate text-xs text-[#71808a] sm:block">{pageInfo.subtitle}</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#bdd8d2] bg-[#eef7f5] px-3 py-1.5 text-xs font-semibold text-[#176456]">
              <span className="h-2 w-2 rounded-full bg-[#2a9d7f]" />
              Admin aktif
            </span>
          </header>

          <main className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
    </SWRConfig>
  )
}

export default AdminLayout

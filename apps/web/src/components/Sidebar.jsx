import React, { useState } from 'react'
import { NavLink } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import { APP_ROUTES } from '../lib/routes'

const Sidebar = ({ currentUser, subscriptionSummary, onLogout, isMobileOpen, onCloseMobile }) => {
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
    const normalizedRole = String(currentUser?.role || '').toLowerCase()
    const isPlatformAdmin = normalizedRole === 'superuser'
    const features = subscriptionSummary?.features || {}
    const canUseFinancialRecap = features.canUseFinancialRecap !== false
    const canManageBranches = features.canManageBranches !== false
    const canManageStaff = features.canManageStaff !== false

    const menuItems = [
        { path: APP_ROUTES.dashboard, icon: 'fas fa-th-large', label: 'Dashboard' },
        { path: APP_ROUTES.rental, icon: 'fas fa-handshake', label: 'Sewa Barang' },
        { path: APP_ROUTES.return, icon: 'fas fa-undo', label: 'Pengembalian' },
        { path: APP_ROUTES.inventory, icon: 'fas fa-boxes-stacked', label: 'Inventaris' },
        { path: APP_ROUTES.customers, icon: 'fas fa-address-book', label: 'Customer' },
        ...(canUseFinancialRecap ? [{ path: APP_ROUTES.financial, icon: 'fas fa-chart-line', label: 'Keuangan' }] : []),
        { path: APP_ROUTES.history, icon: 'fas fa-history', label: 'Riwayat' },
    ]

    const displayName = currentUser?.username || 'Admin'
    const displayRole = currentUser?.role || 'staff'

    return (
        <>
            <button
                type="button"
                className={`fixed inset-0 z-[110] bg-black/45 transition-opacity duration-300 lg:hidden ${isMobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                onClick={onCloseMobile}
                aria-label="Tutup menu navigasi"
            />

            <aside className={`fixed inset-y-0 left-0 z-[120] flex h-screen w-[248px] max-w-[85vw] -translate-x-full flex-col overflow-hidden border-r border-border bg-sidebar-bg transition-all duration-300 lg:static lg:z-[100] lg:w-[232px] lg:max-w-none lg:translate-x-0 ${isMobileOpen ? 'translate-x-0 shadow-2xl shadow-black/40' : ''}`}>
                <div className="flex items-center justify-between px-5 py-5 lg:px-5 lg:py-6">
                    <div className="flex items-center gap-2.5 text-[1.1rem] font-bold text-accent tracking-[-0.3px] font-display sm:text-[1.25rem]">
                        <i className="fas fa-mountain-sun text-[1.25rem] sm:text-[1.45rem]"></i>
                        <span>AviaOutdoor</span>
                    </div>
                    <button
                        type="button"
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-text-muted transition hover:text-text-main hover:border-accent lg:hidden"
                        onClick={onCloseMobile}
                        aria-label="Tutup menu"
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                <nav className="custom-scrollbar flex-1 overflow-y-auto px-3 py-3 lg:px-3 lg:py-4">
                    <ul className="list-none">
                        {menuItems.map((item) => (
                            <li key={item.path} className="mb-1">
                                <NavLink
                                    to={item.path}
                                    onClick={onCloseMobile}
                                    className={({ isActive }) => `flex min-h-10 items-center gap-3 border-l-2 px-3 py-2.5 text-[0.92rem] transition-colors duration-150 ${isActive
                                        ? 'border-accent bg-transparent text-accent'
                                        : 'border-transparent text-text-muted hover:border-border hover:bg-surface-hover hover:text-text-main'
                                    }`}
                                >
                                    <i className={`${item.icon} w-5 text-center text-[0.92rem]`}></i>
                                    <span className="font-medium">{item.label}</span>
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                </nav>

                <div className="flex flex-col gap-3 border-t border-border p-3 lg:p-4">
                    <div className="flex items-center justify-center">
                        <ThemeToggle />
                    </div>

                    <div className="border-t border-border/80 pt-3">
                        <p className="mb-2 px-1 text-[0.68rem] uppercase tracking-[0.16em] text-text-muted">Profile</p>
                        <button
                            onClick={() => setIsProfileMenuOpen((prev) => !prev)}
                            className="w-full flex items-center justify-between gap-3 rounded-md border border-border bg-sidebar-bg p-2.5 text-left transition hover:border-accent hover:bg-surface-hover"
                        >
                            <div className="flex min-w-0 items-center gap-3">
                                <img className="h-9 w-9 rounded-full border border-accent object-cover" src={`https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=E67E22&color=fff`} alt="User" />
                                <div className="flex min-w-0 flex-col">
                                    <span className="line-clamp-1 text-[0.9rem] font-semibold text-text-main">{displayName}</span>
                                    <span className="text-[0.75rem] capitalize text-text-muted">{displayRole}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-text-muted">
                                <span className="text-[0.72rem]">Menu</span>
                                <i className={`fas ${isProfileMenuOpen ? 'fa-chevron-up' : 'fa-chevron-down'} text-[0.75rem]`}></i>
                            </div>
                        </button>

                        {isProfileMenuOpen && (
                            <div className="mt-2 flex flex-col gap-1 rounded-md border border-border bg-bg-main p-1.5">
                                <NavLink
                                    to={isPlatformAdmin ? APP_ROUTES.adminAccount : APP_ROUTES.settingsAccount}
                                    onClick={onCloseMobile}
                                    className={({ isActive }) => `border-l-2 px-2.5 py-2 text-sm transition ${isActive
                                        ? 'border-accent text-accent'
                                        : 'border-transparent text-text-muted hover:border-border hover:bg-surface-hover hover:text-text-main'
                                    }`}
                                >
                                    <i className="fas fa-user-cog mr-2"></i>
                                    Akun Saya
                                </NavLink>
                                {!isPlatformAdmin && canManageBranches && (
                                    <NavLink
                                        to={APP_ROUTES.settingsBranches}
                                        onClick={onCloseMobile}
                                        className={({ isActive }) => `border-l-2 px-2.5 py-2 text-sm transition ${isActive
                                            ? 'border-accent text-accent'
                                            : 'border-transparent text-text-muted hover:border-border hover:bg-surface-hover hover:text-text-main'
                                        }`}
                                    >
                                        <i className="fas fa-code-branch mr-2"></i>
                                        Cabang Toko
                                    </NavLink>
                                )}
                                {!isPlatformAdmin && canManageStaff && (
                                    <NavLink
                                        to={APP_ROUTES.settingsTeam}
                                        onClick={onCloseMobile}
                                        className={({ isActive }) => `border-l-2 px-2.5 py-2 text-sm transition ${isActive
                                            ? 'border-accent text-accent'
                                            : 'border-transparent text-text-muted hover:border-border hover:bg-surface-hover hover:text-text-main'
                                        }`}
                                    >
                                        <i className="fas fa-users-cog mr-2"></i>
                                        Tim & Akses
                                    </NavLink>
                                )}
                                <button
                                    onClick={onLogout}
                                    className="border-l-2 border-transparent px-2.5 py-2 text-left text-sm text-text-muted hover:bg-surface-hover hover:text-[#e74c3c]"
                                    title="Logout"
                                >
                                    <i className="fas fa-sign-out-alt mr-2"></i>
                                    Logout
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </aside>
        </>
    )
}

export default Sidebar

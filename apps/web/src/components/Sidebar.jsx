import React, { useState } from 'react'
import { NavLink } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import { APP_ROUTES } from '../lib/routes'

const Sidebar = ({ currentUser, onLogout, isMobileOpen, onCloseMobile }) => {
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
    const normalizedRole = String(currentUser?.role || '').toLowerCase()
    const isAdminLike = normalizedRole === 'admin' || normalizedRole === 'superuser'

    const menuItems = [
        { path: APP_ROUTES.dashboard, icon: 'fas fa-th-large', label: 'Dashboard' },
        { path: APP_ROUTES.rental, icon: 'fas fa-handshake', label: 'Sewa Barang' },
        { path: APP_ROUTES.return, icon: 'fas fa-undo', label: 'Pengembalian' },
        { path: APP_ROUTES.inventory, icon: 'fas fa-boxes-stacked', label: 'Inventaris' },
        { path: APP_ROUTES.customers, icon: 'fas fa-address-book', label: 'Customer' },
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

            <aside className={`fixed inset-y-0 left-0 z-[120] flex h-screen w-[280px] max-w-[85vw] -translate-x-full flex-col overflow-hidden border-r border-border bg-sidebar-bg transition-all duration-300 lg:static lg:z-[100] lg:w-[260px] lg:max-w-none lg:translate-x-0 ${isMobileOpen ? 'translate-x-0 shadow-2xl shadow-black/40' : ''}`}>
                <div className="flex items-center justify-between p-5 lg:p-[30px]">
                    <div className="flex items-center gap-3 text-[1.2rem] sm:text-[1.4rem] font-bold text-accent tracking-[-0.5px] font-display">
                        <i className="fas fa-mountain-sun text-[1.4rem] sm:text-[1.6rem]"></i>
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

                <nav className="custom-scrollbar flex-1 overflow-y-auto py-4 px-3 lg:py-5 lg:px-[15px]">
                    <ul className="list-none">
                        {menuItems.map((item) => (
                            <li key={item.path} className="mb-2">
                                <NavLink
                                    to={item.path}
                                    onClick={onCloseMobile}
                                    className={({ isActive }) => `flex items-center gap-[15px] rounded-DEFAULT p-[14px_18px] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${isActive
                                        ? 'bg-accent text-white shadow-[0_4px_15px_rgba(230,126,34,0.3)]'
                                        : 'text-text-muted hover:bg-black/5 dark:hover:bg-white/5 hover:text-text-main'
                                    }`}
                                >
                                    <i className={`${item.icon} w-6 text-center text-[1.1rem]`}></i>
                                    <span className="font-medium">{item.label}</span>
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                </nav>

                <div className="flex flex-col gap-4 border-t-2 border-accent/40 p-4 lg:p-5">
                    <div className="flex items-center justify-center">
                        <ThemeToggle />
                    </div>

                    <div className="border-t border-border/80 pt-3">
                        <p className="mb-2 px-1 text-[0.68rem] uppercase tracking-[0.16em] text-text-muted">Profile</p>
                        <button
                            onClick={() => setIsProfileMenuOpen((prev) => !prev)}
                            className="w-full flex items-center justify-between gap-3 rounded-xl border border-border bg-sidebar-bg p-3 text-left transition hover:border-accent hover:bg-black/5 dark:hover:bg-white/5"
                        >
                            <div className="flex min-w-0 items-center gap-3">
                                <img className="h-10 w-10 rounded-full border-2 border-accent object-cover" src={`https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=E67E22&color=fff`} alt="User" />
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
                            <div className="mt-3 flex flex-col gap-1 rounded-DEFAULT border border-border bg-bg-main/80 p-2">
                                <NavLink
                                    to={APP_ROUTES.account}
                                    onClick={onCloseMobile}
                                    className={({ isActive }) => `px-3 py-2 rounded-lg text-sm transition ${isActive
                                        ? 'bg-accent text-white'
                                        : 'text-text-muted hover:text-text-main hover:bg-black/5 dark:hover:bg-white/5'
                                    }`}
                                >
                                    <i className="fas fa-user-cog mr-2"></i>
                                    Akun Saya
                                </NavLink>
                                {isAdminLike && (
                                    <NavLink
                                        to={APP_ROUTES.users}
                                        onClick={onCloseMobile}
                                        className={({ isActive }) => `px-3 py-2 rounded-lg text-sm transition ${isActive
                                            ? 'bg-accent text-white'
                                            : 'text-text-muted hover:text-text-main hover:bg-black/5 dark:hover:bg-white/5'
                                        }`}
                                    >
                                        <i className="fas fa-users-cog mr-2"></i>
                                        Setting User
                                    </NavLink>
                                )}
                                {isAdminLike && (
                                    <NavLink
                                        to={APP_ROUTES.branches}
                                        onClick={onCloseMobile}
                                        className={({ isActive }) => `px-3 py-2 rounded-lg text-sm transition ${isActive
                                            ? 'bg-accent text-white'
                                            : 'text-text-muted hover:text-text-main hover:bg-black/5 dark:hover:bg-white/5'
                                        }`}
                                    >
                                        <i className="fas fa-code-branch mr-2"></i>
                                        Cabang & Akses
                                    </NavLink>
                                )}
                                <button
                                    onClick={onLogout}
                                    className="rounded-lg px-3 py-2 text-left text-sm text-text-muted hover:bg-black/5 hover:text-[#e74c3c] dark:hover:bg-white/5"
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

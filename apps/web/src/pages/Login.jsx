import React, { useState } from 'react'
import { APP_ROUTES } from '../lib/routes'

const Login = ({ onLogin, isSubmitting, errorMessage }) => {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')

    const handleSubmit = async (event) => {
        event.preventDefault()
        try {
            await onLogin({ username, password })
        } catch {
            // Error message ditampilkan dari parent App.
        }
    }

    return (
        <div className="flex min-h-screen w-full items-center justify-center bg-[linear-gradient(135deg,#111718_0%,#1c2424_45%,#141a1a_100%)] px-4">
            <div className="grid w-full max-w-[980px] grid-cols-1 overflow-hidden rounded-lg border border-white/10 bg-sidebar-bg shadow-[0_30px_60px_rgba(0,0,0,0.4)] lg:grid-cols-[1.2fr_1fr]">
                <section className="relative border-b border-border p-8 sm:p-10 lg:border-b-0 lg:border-r lg:p-12">
                    <div className="inline-flex items-center gap-3 font-display text-[1.35rem] font-bold text-accent">
                        <i className="fas fa-mountain-sun text-[1.6rem]" />
                        <span>AviaOutdoor</span>
                    </div>

                    <h1 className="mt-8 text-[2rem] font-bold leading-tight text-text-main md:text-[2.4rem]">
                        Sistem Kasir Rental
                        <br />
                        untuk Operasional Harian
                    </h1>
                    <p className="mt-4 max-w-[420px] leading-relaxed text-text-muted">
                        Masuk menggunakan akun toko yang sudah disiapkan administrator.
                    </p>

                    <div className="mt-10 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                        <div className="rounded-lg border border-border bg-bg-main/50 p-4">
                            <p className="font-semibold text-text-main">Stok Real-Time</p>
                            <p className="mt-1 text-text-muted">Pantau ketersediaan barang saat transaksi berjalan.</p>
                        </div>
                        <div className="rounded-lg border border-border bg-bg-main/50 p-4">
                            <p className="font-semibold text-text-main">Riwayat Lengkap</p>
                            <p className="mt-1 text-text-muted">Lacak data sewa dan pengembalian dengan cepat.</p>
                        </div>
                    </div>
                </section>

                <section className="flex flex-col justify-center p-8 md:p-10 lg:p-12">
                    <div className="mb-6">
                        <p className="text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-accent">{APP_ROUTES.login}</p>
                        <h2 className="mt-2 text-[1.5rem] font-bold text-text-main">Masuk ke akun</h2>
                        <p className="mt-1 text-sm text-text-muted">Gunakan username dan password dari administrator toko.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {errorMessage && (
                            <div className="rounded-lg border border-[#e74c3c]/40 bg-[#e74c3c]/10 px-4 py-3 text-sm text-[#f6b6b6]">
                                {errorMessage}
                            </div>
                        )}

                        <div>
                            <label htmlFor="login-username" className="mb-1.5 block text-[0.85rem] text-text-muted">Username</label>
                            <input
                                id="login-username"
                                type="text"
                                value={username}
                                onChange={(event) => setUsername(event.target.value)}
                                className="w-full rounded-lg border border-border bg-bg-main px-4 py-3 text-text-main outline-none transition-colors focus:border-accent"
                                autoComplete="username"
                                required
                                autoFocus
                            />
                        </div>

                        <div>
                            <label htmlFor="login-password" className="mb-1.5 block text-[0.85rem] text-text-muted">Password</label>
                            <input
                                id="login-password"
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                className="w-full rounded-lg border border-border bg-bg-main px-4 py-3 text-text-main outline-none transition-colors focus:border-accent"
                                autoComplete="current-password"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full rounded-lg bg-accent px-5 py-3.5 font-semibold text-white shadow-[0_8px_24px_rgba(230,126,34,0.35)] transition-colors hover:bg-accent-hover disabled:opacity-60"
                        >
                            {isSubmitting ? 'Memproses...' : 'Masuk'}
                        </button>
                    </form>
                </section>
            </div>
        </div>
    )
}

export default Login

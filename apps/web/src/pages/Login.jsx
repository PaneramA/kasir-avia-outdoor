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
        <div className="min-h-screen w-full bg-[radial-gradient(circle_at_top_right,_rgba(230,126,34,0.25),_transparent_45%),linear-gradient(135deg,#111718_0%,#1c2424_45%,#141a1a_100%)] flex items-center justify-center px-4">
            <div className="w-full max-w-[980px] grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] overflow-hidden rounded-2xl border border-white/10 shadow-[0_30px_60px_rgba(0,0,0,0.4)] bg-sidebar-bg">
                <section className="relative p-10 lg:p-12 border-b lg:border-b-0 lg:border-r border-border">
                    <div className="inline-flex items-center gap-3 text-accent font-display text-[1.35rem] font-bold">
                        <i className="fas fa-mountain-sun text-[1.6rem]"></i>
                        <span>AviaOutdoor</span>
                    </div>

                    <h1 className="mt-8 text-[2rem] md:text-[2.4rem] font-display font-bold leading-tight text-text-main">
                        Sistem Kasir Rental
                        <br />
                        untuk Operasional Harian
                    </h1>
                    <p className="mt-4 text-text-muted max-w-[420px] leading-relaxed">
                        Login untuk mengakses dashboard inventaris, transaksi sewa, pengembalian, dan riwayat penyewaan.
                    </p>

                    <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div className="rounded-xl border border-border bg-bg-main/50 p-4">
                            <p className="text-text-main font-semibold">Stok Real-Time</p>
                            <p className="mt-1 text-text-muted">Pantau ketersediaan barang saat transaksi berjalan.</p>
                        </div>
                        <div className="rounded-xl border border-border bg-bg-main/50 p-4">
                            <p className="text-text-main font-semibold">Riwayat Lengkap</p>
                            <p className="mt-1 text-text-muted">Lacak data sewa dan pengembalian dengan cepat.</p>
                        </div>
                    </div>
                </section>

                <section className="p-8 md:p-10 lg:p-12 flex flex-col justify-center">
                    <div className="mb-6">
                        <p className="text-[0.78rem] tracking-[0.14em] uppercase text-accent font-semibold">{APP_ROUTES.login}</p>
                        <h2 className="mt-2 text-[1.5rem] font-display font-bold text-text-main">Masuk ke Akun</h2>
                        <p className="mt-1 text-sm text-text-muted">Gunakan akun backend yang sudah terdaftar.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {errorMessage && (
                            <div className="rounded-xl border border-[#e74c3c]/40 bg-[#e74c3c]/10 px-4 py-3 text-sm text-[#f6b6b6]">
                                {errorMessage}
                            </div>
                        )}

                        <div>
                            <label className="block text-[0.85rem] text-text-muted mb-1.5">Username</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(event) => setUsername(event.target.value)}
                                className="w-full rounded-xl border border-border bg-bg-main px-4 py-3 text-text-main outline-none focus:border-accent transition-colors"
                                placeholder="Masukkan username"
                                autoComplete="username"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-[0.85rem] text-text-muted mb-1.5">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                className="w-full rounded-xl border border-border bg-bg-main px-4 py-3 text-text-main outline-none focus:border-accent transition-colors"
                                placeholder="Masukkan password"
                                autoComplete="current-password"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full rounded-xl bg-accent px-5 py-3.5 text-white font-semibold shadow-[0_8px_24px_rgba(230,126,34,0.35)] hover:bg-accent-hover transition-colors disabled:opacity-60"
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

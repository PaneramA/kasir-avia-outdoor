import React, { useState } from 'react'

const AdminLogin = ({ onLogin, isSubmitting, errorMessage, currentUser, onClearSession }) => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    try {
      await onLogin({ username, password })
    } catch {
      // Parent menampilkan error autentikasi.
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-main px-4 py-10 text-text-main">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-accent text-lg text-white">
            <i className="fas fa-shield-halved" />
          </span>
          <div>
            <p className="text-lg font-bold">Avia Admin</p>
            <p className="text-xs text-text-muted">Platform control panel</p>
          </div>
        </div>

        <section className="rounded-md border border-border bg-card-bg p-6 shadow-none sm:p-8">
          <div className="mb-6">
            <h1 className="text-xl font-bold">Login administrator</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
              Gunakan akun platform admin untuk mengelola seluruh toko.
            </p>
          </div>

          {currentUser && (
            <div className="mb-4 rounded-md border border-[#e4c97b] bg-[#fff8df] p-3 text-sm text-[#76580d]">
              Sesi <strong>{currentUser.username}</strong> bukan akun administrator.
              <button type="button" onClick={onClearSession} className="ml-1 font-semibold underline">Keluar dari sesi ini</button>
            </div>
          )}

          {errorMessage && (
            <div className="mb-4 rounded-md border border-[#e9b7b7] bg-[#fff1f1] p-3 text-sm text-[#a82f2f]">
              {errorMessage}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-text-main" htmlFor="admin-username">Email admin</label>
              <input
                id="admin-username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                placeholder="admin@gmail.com"
                className="min-h-11 w-full rounded-md border border-border bg-bg-main px-3 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-text-main" htmlFor="admin-password">Password</label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  className="min-h-11 w-full rounded-md border border-border bg-bg-main px-3 pr-11 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-text-muted"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-bold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              <i className="fas fa-arrow-right-to-bracket" />
              {isSubmitting ? 'Memvalidasi...' : 'Masuk ke Admin Panel'}
            </button>
          </form>
        </section>

        <p className="mt-5 text-center text-xs text-text-muted">Alamat panel: /admin</p>
      </div>
    </div>
  )
}

export default AdminLogin

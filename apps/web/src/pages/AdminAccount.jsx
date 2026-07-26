import React, { useState } from 'react'
import { changeMyPassword } from '../lib/api'

const AdminAccount = ({ currentUser }) => {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setMessage('')
    setErrorMessage('')

    if (form.newPassword.length < 8) {
      setErrorMessage('Password baru minimal 8 karakter.')
      return
    }
    if (form.newPassword !== form.confirmPassword) {
      setErrorMessage('Konfirmasi password baru tidak sama.')
      return
    }

    try {
      setIsSubmitting(true)
      await changeMyPassword(form.currentPassword, form.newPassword)
      setMessage('Password administrator berhasil diperbarui.')
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Gagal mengubah password.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,560px)]">
      <section className="rounded-md border border-border bg-card-bg p-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-md bg-bg-main text-lg text-accent">
          <i className="fas fa-user-shield" />
        </span>
        <h2 className="mt-4 text-lg font-bold">{currentUser?.username || 'Administrator'}</h2>
        <p className="mt-1 text-sm capitalize text-text-muted">Role: {currentUser?.role || 'admin'}</p>
        <p className="mt-4 border-t border-border pt-4 text-sm leading-relaxed text-text-muted">
          Akun ini memiliki akses pengelolaan seluruh tenant, paket, dan subscription platform.
        </p>
      </section>

      <section className="rounded-md border border-border bg-card-bg p-5 sm:p-6">
        <h2 className="text-lg font-bold">Ubah password</h2>
        <p className="mt-1 text-sm text-text-muted">Gunakan minimal 8 karakter.</p>

        {message && <div className="mt-4 rounded-md border border-accent bg-card-bg p-3 text-sm text-accent">{message}</div>}
        {errorMessage && <div className="mt-4 rounded-md border border-[#e9b7b7] bg-[#fff1f1] p-3 text-sm text-[#a82f2f]">{errorMessage}</div>}

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          {[
            ['currentPassword', 'Password saat ini', 'current-password'],
            ['newPassword', 'Password baru', 'new-password'],
            ['confirmPassword', 'Konfirmasi password baru', 'new-password'],
          ].map(([key, label, autoComplete]) => (
            <div key={key}>
              <label className="mb-1.5 block text-sm font-semibold text-text-main" htmlFor={`admin-${key}`}>{label}</label>
              <input
                id={`admin-${key}`}
                type="password"
                autoComplete={autoComplete}
                value={form[key]}
                onChange={(event) => setForm((previous) => ({ ...previous, [key]: event.target.value }))}
                className="min-h-11 w-full rounded-md border border-border bg-bg-main px-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                required
              />
            </div>
          ))}
          <button type="submit" disabled={isSubmitting} className="min-h-11 rounded-md bg-accent px-5 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-60">
            {isSubmitting ? 'Menyimpan...' : 'Simpan password'}
          </button>
        </form>
      </section>
    </div>
  )
}

export default AdminAccount

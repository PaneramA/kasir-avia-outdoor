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
      <section className="rounded-lg border border-[#dce3e6] bg-white p-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#e8f0ee] text-lg text-[#173f3a]">
          <i className="fas fa-user-shield" />
        </span>
        <h2 className="mt-4 text-lg font-bold">{currentUser?.username || 'Administrator'}</h2>
        <p className="mt-1 text-sm capitalize text-[#71808a]">Role: {currentUser?.role || 'admin'}</p>
        <p className="mt-4 border-t border-[#edf0f1] pt-4 text-sm leading-relaxed text-[#65737d]">
          Akun ini memiliki akses pengelolaan seluruh tenant, paket, dan subscription platform.
        </p>
      </section>

      <section className="rounded-lg border border-[#dce3e6] bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold">Ubah password</h2>
        <p className="mt-1 text-sm text-[#71808a]">Gunakan minimal 8 karakter.</p>

        {message && <div className="mt-4 rounded-lg border border-[#acd9c8] bg-[#edf9f4] p-3 text-sm text-[#176456]">{message}</div>}
        {errorMessage && <div className="mt-4 rounded-lg border border-[#e9b7b7] bg-[#fff1f1] p-3 text-sm text-[#a82f2f]">{errorMessage}</div>}

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          {[
            ['currentPassword', 'Password saat ini', 'current-password'],
            ['newPassword', 'Password baru', 'new-password'],
            ['confirmPassword', 'Konfirmasi password baru', 'new-password'],
          ].map(([key, label, autoComplete]) => (
            <div key={key}>
              <label className="mb-1.5 block text-sm font-semibold text-[#34434d]" htmlFor={`admin-${key}`}>{label}</label>
              <input
                id={`admin-${key}`}
                type="password"
                autoComplete={autoComplete}
                value={form[key]}
                onChange={(event) => setForm((previous) => ({ ...previous, [key]: event.target.value }))}
                className="min-h-11 w-full rounded-lg border border-[#cfd8dc] px-3 text-sm outline-none focus:border-[#2a7c6f] focus:ring-2 focus:ring-[#2a7c6f]/15"
                required
              />
            </div>
          ))}
          <button type="submit" disabled={isSubmitting} className="min-h-11 rounded-lg bg-[#173f3a] px-5 text-sm font-bold text-white hover:bg-[#0f302c] disabled:opacity-60">
            {isSubmitting ? 'Menyimpan...' : 'Simpan password'}
          </button>
        </form>
      </section>
    </div>
  )
}

export default AdminAccount

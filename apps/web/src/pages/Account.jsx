import React, { useState } from 'react'
import { changeMyPassword } from '../lib/api'

const Account = ({ currentUser }) => {
    const [form, setForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    })
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [message, setMessage] = useState('')
    const [errorMessage, setErrorMessage] = useState('')

    const handleSubmit = async (event) => {
        event.preventDefault()
        setMessage('')
        setErrorMessage('')

        if (form.newPassword !== form.confirmPassword) {
            setErrorMessage('Konfirmasi password baru tidak sama.')
            return
        }

        if (form.newPassword.length < 8) {
            setErrorMessage('Password baru minimal 8 karakter.')
            return
        }

        try {
            setIsSubmitting(true)
            await changeMyPassword(form.currentPassword, form.newPassword)
            setMessage('Password berhasil diperbarui.')
            setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
        } catch (error) {
            const messageText = error instanceof Error ? error.message : 'Gagal mengubah password.'
            setErrorMessage(messageText)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="py-5 max-w-[760px]">
            <section className="bg-sidebar-bg/60 border border-border rounded-DEFAULT p-6 mb-6">
                <h3 className="text-[1.1rem] font-bold text-text-main mb-1">Informasi Akun</h3>
                <p className="text-text-muted text-sm">Akun login saat ini: <span className="text-text-main font-medium">{currentUser?.username}</span> ({currentUser?.role})</p>
            </section>

            <section className="bg-sidebar-bg/60 border border-border rounded-DEFAULT p-6">
                <h3 className="text-[1.1rem] font-bold text-text-main mb-1">Ubah Password</h3>
                <p className="text-text-muted text-sm mb-5">Gunakan password kuat dan jangan dibagikan ke orang lain.</p>

                {message && (
                    <div className="mb-4 rounded-lg border border-[#2ecc71]/40 bg-[#2ecc71]/10 p-3 text-sm text-[#6ee7a8]">{message}</div>
                )}

                {errorMessage && (
                    <div className="mb-4 rounded-lg border border-[#e74c3c]/40 bg-[#e74c3c]/10 p-3 text-sm text-[#f3b2ad]">{errorMessage}</div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block mb-1.5 text-[0.85rem] text-text-muted">Password Lama</label>
                        <input
                            type="password"
                            className="w-full bg-bg-main border border-border p-2.5 rounded-lg text-text-main outline-none focus:border-accent"
                            value={form.currentPassword}
                            onChange={(event) => setForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
                            required
                        />
                    </div>
                    <div>
                        <label className="block mb-1.5 text-[0.85rem] text-text-muted">Password Baru</label>
                        <input
                            type="password"
                            className="w-full bg-bg-main border border-border p-2.5 rounded-lg text-text-main outline-none focus:border-accent"
                            value={form.newPassword}
                            onChange={(event) => setForm((prev) => ({ ...prev, newPassword: event.target.value }))}
                            required
                        />
                    </div>
                    <div>
                        <label className="block mb-1.5 text-[0.85rem] text-text-muted">Konfirmasi Password Baru</label>
                        <input
                            type="password"
                            className="w-full bg-bg-main border border-border p-2.5 rounded-lg text-text-main outline-none focus:border-accent"
                            value={form.confirmPassword}
                            onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="bg-accent px-5 py-2.5 rounded-lg text-white font-semibold hover:bg-accent-hover disabled:opacity-60"
                    >
                        {isSubmitting ? 'Menyimpan...' : 'Simpan Password Baru'}
                    </button>
                </form>
            </section>
        </div>
    )
}

export default Account

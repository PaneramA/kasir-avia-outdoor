import React, { useEffect, useMemo, useState } from 'react'
import { changeMyPassword } from '../lib/api'

const Account = ({
    currentUser,
    tenantSettings,
    branchSettings,
    onUpdateTenantSettings,
    onUpdateBranchSettings,
}) => {
    const [form, setForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    })
    const [storeForm, setStoreForm] = useState({
        storeName: '',
        address: '',
        phone: '',
    })
    const [branchForm, setBranchForm] = useState({
        storeName: '',
        address: '',
        phone: '',
        legalFooter: '',
    })
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isSubmittingStore, setIsSubmittingStore] = useState(false)
    const [message, setMessage] = useState('')
    const [errorMessage, setErrorMessage] = useState('')
    const [storeMessage, setStoreMessage] = useState('')
    const [storeErrorMessage, setStoreErrorMessage] = useState('')
    const [isSubmittingBranchStore, setIsSubmittingBranchStore] = useState(false)
    const [branchStoreMessage, setBranchStoreMessage] = useState('')
    const [branchStoreErrorMessage, setBranchStoreErrorMessage] = useState('')

    const isAdminLike = useMemo(() => {
        const role = String(currentUser?.role || '').trim().toLowerCase()
        return role === 'admin' || role === 'superuser'
    }, [currentUser?.role])

    useEffect(() => {
        setStoreForm({
            storeName: tenantSettings?.storeName || '',
            address: Array.isArray(tenantSettings?.addressLines)
                ? tenantSettings.addressLines.join('\n')
                : '',
            phone: tenantSettings?.phone || '',
        })
    }, [tenantSettings])

    useEffect(() => {
        setBranchForm({
            storeName: branchSettings?.storeName || '',
            address: Array.isArray(branchSettings?.addressLines)
                ? branchSettings.addressLines.join('\n')
                : '',
            phone: branchSettings?.phone || '',
            legalFooter: Array.isArray(branchSettings?.legalFooterLines)
                ? branchSettings.legalFooterLines.join('\n')
                : '',
        })
    }, [branchSettings])

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

    const handleSubmitStoreSettings = async (event) => {
        event.preventDefault()
        setStoreMessage('')
        setStoreErrorMessage('')

        if (!isAdminLike) {
            setStoreErrorMessage('Hanya admin/superuser yang bisa mengubah pengaturan toko.')
            return
        }

        if (typeof onUpdateTenantSettings !== 'function') {
            setStoreErrorMessage('Fitur pengaturan toko belum tersedia.')
            return
        }

        const trimmedStoreName = storeForm.storeName.trim()
        if (!trimmedStoreName) {
            setStoreErrorMessage('Nama toko wajib diisi.')
            return
        }

        const addressLines = storeForm.address
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)

        try {
            setIsSubmittingStore(true)
            await onUpdateTenantSettings({
                storeName: trimmedStoreName,
                addressLines,
                phone: storeForm.phone.trim(),
            })
            setStoreMessage('Pengaturan toko berhasil diperbarui.')
        } catch (error) {
            const messageText = error instanceof Error ? error.message : 'Gagal memperbarui pengaturan toko.'
            setStoreErrorMessage(messageText)
        } finally {
            setIsSubmittingStore(false)
        }
    }

    const handleSubmitBranchStoreSettings = async (event) => {
        event.preventDefault()
        setBranchStoreMessage('')
        setBranchStoreErrorMessage('')

        if (!isAdminLike) {
            setBranchStoreErrorMessage('Hanya admin/superuser yang bisa mengubah pengaturan cabang.')
            return
        }

        if (typeof onUpdateBranchSettings !== 'function') {
            setBranchStoreErrorMessage('Fitur pengaturan cabang belum tersedia.')
            return
        }

        const addressLines = branchForm.address
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
        const legalFooterLines = branchForm.legalFooter
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)

        try {
            setIsSubmittingBranchStore(true)
            await onUpdateBranchSettings({
                storeName: branchForm.storeName.trim(),
                addressLines,
                phone: branchForm.phone.trim(),
                legalFooterLines,
            })
            setBranchStoreMessage('Pengaturan cabang aktif berhasil diperbarui.')
        } catch (error) {
            const messageText = error instanceof Error ? error.message : 'Gagal memperbarui pengaturan cabang.'
            setBranchStoreErrorMessage(messageText)
        } finally {
            setIsSubmittingBranchStore(false)
        }
    }

    return (
        <div className="py-5 max-w-[760px]">
            <section className="bg-sidebar-bg/60 border border-border rounded-DEFAULT p-6 mb-6">
                <h3 className="text-[1.1rem] font-bold text-text-main mb-1">Informasi Akun</h3>
                <p className="text-text-muted text-sm">Akun login saat ini: <span className="text-text-main font-medium">{currentUser?.username}</span> ({currentUser?.role})</p>
            </section>

            <section className="bg-sidebar-bg/60 border border-border rounded-DEFAULT p-6 mb-6">
                <h3 className="text-[1.1rem] font-bold text-text-main mb-1">Pengaturan Toko</h3>
                <p className="text-text-muted text-sm mb-5">
                    Data ini dipakai sebagai default receipt level tenant.
                </p>

                {storeMessage && (
                    <div className="mb-4 rounded-lg border border-[#2ecc71]/40 bg-[#2ecc71]/10 p-3 text-sm text-[#6ee7a8]">{storeMessage}</div>
                )}

                {storeErrorMessage && (
                    <div className="mb-4 rounded-lg border border-[#e74c3c]/40 bg-[#e74c3c]/10 p-3 text-sm text-[#f3b2ad]">{storeErrorMessage}</div>
                )}

                <form onSubmit={handleSubmitStoreSettings} className="space-y-4">
                    <div>
                        <label className="block mb-1.5 text-[0.85rem] text-text-muted">Nama Toko</label>
                        <input
                            type="text"
                            className="w-full bg-bg-main border border-border p-2.5 rounded-lg text-text-main outline-none focus:border-accent"
                            value={storeForm.storeName}
                            onChange={(event) => setStoreForm((prev) => ({ ...prev, storeName: event.target.value }))}
                            required
                            disabled={!isAdminLike}
                        />
                    </div>
                    <div>
                        <label className="block mb-1.5 text-[0.85rem] text-text-muted">Alamat Toko</label>
                        <textarea
                            className="min-h-[90px] w-full resize-y bg-bg-main border border-border p-2.5 rounded-lg text-text-main outline-none focus:border-accent"
                            value={storeForm.address}
                            onChange={(event) => setStoreForm((prev) => ({ ...prev, address: event.target.value }))}
                            placeholder="Satu baris per alamat"
                            disabled={!isAdminLike}
                        ></textarea>
                    </div>
                    <div>
                        <label className="block mb-1.5 text-[0.85rem] text-text-muted">Nomor Telepon Toko</label>
                        <input
                            type="text"
                            className="w-full bg-bg-main border border-border p-2.5 rounded-lg text-text-main outline-none focus:border-accent"
                            value={storeForm.phone}
                            onChange={(event) => setStoreForm((prev) => ({ ...prev, phone: event.target.value }))}
                            disabled={!isAdminLike}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmittingStore || !isAdminLike}
                        className="bg-accent px-5 py-2.5 rounded-lg text-white font-semibold hover:bg-accent-hover disabled:opacity-60"
                    >
                        {isSubmittingStore ? 'Menyimpan...' : 'Simpan Pengaturan Toko'}
                    </button>
                </form>
            </section>

            <section className="bg-sidebar-bg/60 border border-border rounded-DEFAULT p-6 mb-6">
                <h3 className="text-[1.1rem] font-bold text-text-main mb-1">Pengaturan Cabang Aktif</h3>
                <p className="text-text-muted text-sm mb-5">
                    Jika diisi, data ini override receipt untuk cabang yang sedang aktif.
                </p>

                {branchStoreMessage && (
                    <div className="mb-4 rounded-lg border border-[#2ecc71]/40 bg-[#2ecc71]/10 p-3 text-sm text-[#6ee7a8]">{branchStoreMessage}</div>
                )}

                {branchStoreErrorMessage && (
                    <div className="mb-4 rounded-lg border border-[#e74c3c]/40 bg-[#e74c3c]/10 p-3 text-sm text-[#f3b2ad]">{branchStoreErrorMessage}</div>
                )}

                <form onSubmit={handleSubmitBranchStoreSettings} className="space-y-4">
                    <div>
                        <label className="block mb-1.5 text-[0.85rem] text-text-muted">Nama Toko (Override Cabang)</label>
                        <input
                            type="text"
                            className="w-full bg-bg-main border border-border p-2.5 rounded-lg text-text-main outline-none focus:border-accent"
                            value={branchForm.storeName}
                            onChange={(event) => setBranchForm((prev) => ({ ...prev, storeName: event.target.value }))}
                            placeholder="Opsional, kosongkan jika ikut tenant"
                            disabled={!isAdminLike}
                        />
                    </div>
                    <div>
                        <label className="block mb-1.5 text-[0.85rem] text-text-muted">Alamat Cabang</label>
                        <textarea
                            className="min-h-[90px] w-full resize-y bg-bg-main border border-border p-2.5 rounded-lg text-text-main outline-none focus:border-accent"
                            value={branchForm.address}
                            onChange={(event) => setBranchForm((prev) => ({ ...prev, address: event.target.value }))}
                            placeholder="Satu baris per alamat, kosongkan jika ikut tenant"
                            disabled={!isAdminLike}
                        ></textarea>
                    </div>
                    <div>
                        <label className="block mb-1.5 text-[0.85rem] text-text-muted">Nomor Telepon Cabang</label>
                        <input
                            type="text"
                            className="w-full bg-bg-main border border-border p-2.5 rounded-lg text-text-main outline-none focus:border-accent"
                            value={branchForm.phone}
                            onChange={(event) => setBranchForm((prev) => ({ ...prev, phone: event.target.value }))}
                            placeholder="Kosongkan jika ikut tenant"
                            disabled={!isAdminLike}
                        />
                    </div>
                    <div>
                        <label className="block mb-1.5 text-[0.85rem] text-text-muted">Footer Legal Receipt (Cabang)</label>
                        <textarea
                            className="min-h-[90px] w-full resize-y bg-bg-main border border-border p-2.5 rounded-lg text-text-main outline-none focus:border-accent"
                            value={branchForm.legalFooter}
                            onChange={(event) => setBranchForm((prev) => ({ ...prev, legalFooter: event.target.value }))}
                            placeholder="Satu baris per catatan, kosongkan jika ikut tenant"
                            disabled={!isAdminLike}
                        ></textarea>
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmittingBranchStore || !isAdminLike}
                        className="bg-accent px-5 py-2.5 rounded-lg text-white font-semibold hover:bg-accent-hover disabled:opacity-60"
                    >
                        {isSubmittingBranchStore ? 'Menyimpan...' : 'Simpan Pengaturan Cabang'}
                    </button>
                </form>
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

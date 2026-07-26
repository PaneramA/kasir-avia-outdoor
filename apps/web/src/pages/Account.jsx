import React, { useEffect, useState } from 'react'
import { changeMyPassword } from '../lib/api'

function formatQuota(quota) {
    if (!quota || typeof quota !== 'object') {
        return '-'
    }

    if (quota.isUnlimited) {
        return `${quota.used} dipakai / tak terbatas`
    }

    return `${quota.used} / ${quota.limit} dipakai • sisa ${quota.remaining}`
}

const SECTION_CLASS = 'rounded-md border border-border bg-card-bg p-6'
const PANEL_CLASS = 'rounded-md border border-border bg-bg-main p-4'
const FIELD_CLASS = 'w-full rounded-md border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent'
const ACTION_BUTTON_CLASS = 'rounded-md bg-accent px-5 py-2.5 font-semibold text-white hover:bg-accent-hover disabled:opacity-60'
const SUCCESS_NOTICE_CLASS = 'mb-4 rounded-md border border-accent bg-card-bg p-3 text-sm font-medium text-accent'
const ERROR_NOTICE_CLASS = 'mb-4 rounded-md border border-border bg-card-bg p-3 text-sm font-medium text-text-main'

const Account = ({
    currentUser,
    tenantSettings,
    branchSettings,
    subscriptionSummary,
    isSubscriptionLoading = false,
    subscriptionErrorMessage = '',
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
        rentalDayCountMode: 'ROLLING_24H',
        rentalCutoffHour: 8,
        rentalCutoffMinute: 0,
        financialClosingDay: 31,
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
    useEffect(() => {
        setStoreForm({
            storeName: tenantSettings?.storeName || '',
            address: Array.isArray(tenantSettings?.addressLines)
                ? tenantSettings.addressLines.join('\n')
                : '',
            phone: tenantSettings?.phone || '',
            rentalDayCountMode: String(tenantSettings?.rentalDayCountMode || 'ROLLING_24H').toUpperCase() === 'DAILY_CUTOFF'
                ? 'DAILY_CUTOFF'
                : 'ROLLING_24H',
            rentalCutoffHour: Number.isFinite(Number(tenantSettings?.rentalCutoffHour))
                ? Math.min(23, Math.max(0, Number(tenantSettings.rentalCutoffHour)))
                : 8,
            rentalCutoffMinute: Number.isFinite(Number(tenantSettings?.rentalCutoffMinute))
                ? Math.min(59, Math.max(0, Number(tenantSettings.rentalCutoffMinute)))
                : 0,
            financialClosingDay: Number.isFinite(Number(tenantSettings?.financialClosingDay))
                ? Math.min(31, Math.max(1, Number(tenantSettings.financialClosingDay)))
                : 31,
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
                rentalDayCountMode: storeForm.rentalDayCountMode,
                rentalCutoffHour: Number(storeForm.rentalCutoffHour),
                rentalCutoffMinute: Number(storeForm.rentalCutoffMinute),
                financialClosingDay: Number(storeForm.financialClosingDay),
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
        <div className="max-w-[760px] pt-0 pb-5">
            <section className={`${SECTION_CLASS} mb-6`}>
                <h3 className="text-[1.1rem] font-bold text-text-main mb-1">Informasi Akun</h3>
                <p className="text-text-muted text-sm">Akun login saat ini: <span className="text-text-main font-medium">{currentUser?.username}</span> ({currentUser?.role})</p>
            </section>

            <section className={`${SECTION_CLASS} mb-6`}>
                <h3 className="text-[1.1rem] font-bold text-text-main mb-1">Paket & Kuota Tenant</h3>
                <p className="text-text-muted text-sm mb-5">
                    Ringkasan paket aktif dan sisa kuota toko kamu saat ini.
                </p>

                {subscriptionErrorMessage && (
                    <div className={ERROR_NOTICE_CLASS}>{subscriptionErrorMessage}</div>
                )}

                {isSubscriptionLoading ? (
                    <div className="text-text-muted">Memuat paket tenant...</div>
                ) : subscriptionSummary ? (
                    <>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 mb-5">
                            <div className={PANEL_CLASS}>
                                <p className="text-xs uppercase tracking-wide text-text-muted">Paket Aktif</p>
                                <p className="mt-2 text-[1.1rem] font-bold text-text-main">{subscriptionSummary.subscription?.plan?.name || 'Belum ada paket'}</p>
                                <p className="mt-1 text-xs text-text-muted">{subscriptionSummary.subscription?.plan?.pricePeriod || '-'}</p>
                            </div>
                            <div className={PANEL_CLASS}>
                                <p className="text-xs uppercase tracking-wide text-text-muted">Status Subscription</p>
                                <p className="mt-2 text-[1.1rem] font-bold capitalize text-text-main">{subscriptionSummary.subscription?.status || '-'}</p>
                                <p className="mt-1 text-xs text-text-muted">Tenant: {subscriptionSummary.tenantStatus}</p>
                            </div>
                            <div className={PANEL_CLASS}>
                                <p className="text-xs uppercase tracking-wide text-text-muted">Periode Pakai</p>
                                <p className="mt-2 text-[1.1rem] font-bold text-text-main">{subscriptionSummary.usage?.periodKey || '-'}</p>
                                <p className="mt-1 text-xs text-text-muted">{subscriptionSummary.tenantName}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 mb-5">
                            <div className={PANEL_CLASS}>
                                <p className="text-sm font-semibold text-text-main">Kuota Cabang</p>
                                <p className="mt-1 text-sm text-text-muted">{formatQuota(subscriptionSummary.usage?.branches)}</p>
                            </div>
                            <div className={PANEL_CLASS}>
                                <p className="text-sm font-semibold text-text-main">Kuota Item Inventaris</p>
                                <p className="mt-1 text-sm text-text-muted">{formatQuota(subscriptionSummary.usage?.items)}</p>
                            </div>
                            <div className={PANEL_CLASS}>
                                <p className="text-sm font-semibold text-text-main">Kuota Transaksi Bulanan</p>
                                <p className="mt-1 text-sm text-text-muted">{formatQuota(subscriptionSummary.usage?.monthlyTransactions)}</p>
                            </div>
                            <div className={PANEL_CLASS}>
                                <p className="text-sm font-semibold text-text-main">Kuota User Toko Aktif</p>
                                <p className="mt-1 text-sm text-text-muted">{formatQuota(subscriptionSummary.usage?.activeUsers)}</p>
                            </div>
                        </div>

                        <div className={PANEL_CLASS}>
                            <p className="text-sm font-semibold text-text-main mb-3">Fitur yang Aktif</p>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                {[
                                    ['Kelola cabang', subscriptionSummary.features?.canManageBranches],
                                    ['Kelola staff toko', subscriptionSummary.features?.canManageStaff],
                                    ['Rekap keuangan', subscriptionSummary.features?.canUseFinancialRecap],
                                    ['Multi-branch', subscriptionSummary.features?.canUseMultiBranch],
                                    ['Export data', subscriptionSummary.features?.canExportData],
                                ].map(([label, enabled]) => (
                                    <div key={label} className="flex items-center justify-between rounded-md border border-border bg-card-bg px-3 py-2">
                                        <span className="text-sm text-text-main">{label}</span>
                                        <span className={`text-xs font-semibold uppercase tracking-wide ${enabled ? 'text-accent' : 'text-text-muted'}`}>
                                            {enabled ? 'Aktif' : 'Nonaktif'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="text-text-muted">Data paket tenant belum tersedia.</div>
                )}
            </section>

            <section className={`${SECTION_CLASS} mb-6`}>
                <h3 className="text-[1.1rem] font-bold text-text-main mb-1">Pengaturan Toko</h3>
                <p className="text-text-muted text-sm mb-5">
                    Data ini dipakai sebagai default receipt level tenant.
                </p>

                {storeMessage && (
                    <div className={SUCCESS_NOTICE_CLASS}>{storeMessage}</div>
                )}

                {storeErrorMessage && (
                    <div className={ERROR_NOTICE_CLASS}>{storeErrorMessage}</div>
                )}

                <form onSubmit={handleSubmitStoreSettings} className="space-y-4">
                    <div>
                        <label className="block mb-1.5 text-[0.85rem] text-text-muted">Nama Toko</label>
                        <input
                            type="text"
                            className={FIELD_CLASS}
                            value={storeForm.storeName}
                            onChange={(event) => setStoreForm((prev) => ({ ...prev, storeName: event.target.value }))}
                            required
                        />
                    </div>
                    <div>
                        <label className="block mb-1.5 text-[0.85rem] text-text-muted">Alamat Toko</label>
                        <textarea
                            className={`${FIELD_CLASS} min-h-[90px] resize-y`}
                            value={storeForm.address}
                            onChange={(event) => setStoreForm((prev) => ({ ...prev, address: event.target.value }))}
                            placeholder="Satu baris per alamat"
                        ></textarea>
                    </div>
                    <div>
                        <label className="block mb-1.5 text-[0.85rem] text-text-muted">Nomor Telepon Toko</label>
                        <input
                            type="text"
                            className={FIELD_CLASS}
                            value={storeForm.phone}
                            onChange={(event) => setStoreForm((prev) => ({ ...prev, phone: event.target.value }))}
                        />
                    </div>
                    <div className={PANEL_CLASS}>
                        <h4 className="mb-2 text-sm font-semibold text-text-main">Periode Keuangan</h4>
                        <p className="mb-3 text-xs text-text-muted">
                            Tanggal tutup buku menentukan bulan laporan. Contoh tanggal 27: transaksi setelah 27 Mei masuk periode Juni.
                        </p>
                        <div>
                            <label className="mb-1.5 block text-[0.85rem] text-text-muted">Tanggal Tutup Buku</label>
                            <input
                                type="number"
                                min="1"
                                max="31"
                                className={FIELD_CLASS}
                                value={storeForm.financialClosingDay}
                                onChange={(event) => setStoreForm((prev) => ({
                                    ...prev,
                                    financialClosingDay: Math.min(31, Math.max(1, Number(event.target.value || 1))),
                                }))}
                            />
                        </div>
                    </div>

                    <div className={PANEL_CLASS}>
                        <h4 className="mb-2 text-sm font-semibold text-text-main">Perhitungan Hari Sewa</h4>
                        <p className="mb-3 text-xs text-text-muted">
                            Default: hitung per 24 jam (jam sekarang ke besok jam sama = 1 hari). Bisa ganti ke cut-off harian.
                        </p>
                        <div className="mb-3">
                            <label className="mb-1.5 block text-[0.85rem] text-text-muted">Mode Hitung Hari</label>
                            <select
                                className={FIELD_CLASS}
                                value={storeForm.rentalDayCountMode}
                                onChange={(event) => setStoreForm((prev) => ({
                                    ...prev,
                                    rentalDayCountMode: event.target.value === 'DAILY_CUTOFF' ? 'DAILY_CUTOFF' : 'ROLLING_24H',
                                }))}
                            >
                                <option value="ROLLING_24H">Per 24 Jam (Default)</option>
                                <option value="DAILY_CUTOFF">Cut-off Harian</option>
                            </select>
                        </div>
                        {storeForm.rentalDayCountMode === 'DAILY_CUTOFF' && (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1.5 block text-[0.8rem] text-text-muted">Jam Mulai Hari</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="23"
                                        className={FIELD_CLASS}
                                        value={storeForm.rentalCutoffHour}
                                        onChange={(event) => setStoreForm((prev) => ({
                                            ...prev,
                                            rentalCutoffHour: Math.min(23, Math.max(0, Number(event.target.value || 0))),
                                        }))}
                                    />
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-[0.8rem] text-text-muted">Menit Mulai Hari</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="59"
                                        className={FIELD_CLASS}
                                        value={storeForm.rentalCutoffMinute}
                                        onChange={(event) => setStoreForm((prev) => ({
                                            ...prev,
                                            rentalCutoffMinute: Math.min(59, Math.max(0, Number(event.target.value || 0))),
                                        }))}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmittingStore}
                        className={ACTION_BUTTON_CLASS}
                    >
                        {isSubmittingStore ? 'Menyimpan...' : 'Simpan Pengaturan Toko'}
                    </button>
                </form>
            </section>

            <section className={`${SECTION_CLASS} mb-6`}>
                <h3 className="text-[1.1rem] font-bold text-text-main mb-1">Pengaturan Cabang Aktif</h3>
                <p className="text-text-muted text-sm mb-5">
                    Jika diisi, data ini override receipt untuk cabang yang sedang aktif.
                </p>

                {branchStoreMessage && (
                    <div className={SUCCESS_NOTICE_CLASS}>{branchStoreMessage}</div>
                )}

                {branchStoreErrorMessage && (
                    <div className={ERROR_NOTICE_CLASS}>{branchStoreErrorMessage}</div>
                )}

                <form onSubmit={handleSubmitBranchStoreSettings} className="space-y-4">
                    <div>
                        <label className="block mb-1.5 text-[0.85rem] text-text-muted">Nama Toko (Override Cabang)</label>
                        <input
                            type="text"
                            className={FIELD_CLASS}
                            value={branchForm.storeName}
                            onChange={(event) => setBranchForm((prev) => ({ ...prev, storeName: event.target.value }))}
                            placeholder="Opsional, kosongkan jika ikut tenant"
                        />
                    </div>
                    <div>
                        <label className="block mb-1.5 text-[0.85rem] text-text-muted">Alamat Cabang</label>
                        <textarea
                            className={`${FIELD_CLASS} min-h-[90px] resize-y`}
                            value={branchForm.address}
                            onChange={(event) => setBranchForm((prev) => ({ ...prev, address: event.target.value }))}
                            placeholder="Satu baris per alamat, kosongkan jika ikut tenant"
                        ></textarea>
                    </div>
                    <div>
                        <label className="block mb-1.5 text-[0.85rem] text-text-muted">Nomor Telepon Cabang</label>
                        <input
                            type="text"
                            className={FIELD_CLASS}
                            value={branchForm.phone}
                            onChange={(event) => setBranchForm((prev) => ({ ...prev, phone: event.target.value }))}
                            placeholder="Kosongkan jika ikut tenant"
                        />
                    </div>
                    <div>
                        <label className="block mb-1.5 text-[0.85rem] text-text-muted">Footer Legal Receipt (Cabang)</label>
                        <textarea
                            className={`${FIELD_CLASS} min-h-[90px] resize-y`}
                            value={branchForm.legalFooter}
                            onChange={(event) => setBranchForm((prev) => ({ ...prev, legalFooter: event.target.value }))}
                            placeholder="Satu baris per catatan, kosongkan jika ikut tenant"
                        ></textarea>
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmittingBranchStore}
                        className={ACTION_BUTTON_CLASS}
                    >
                        {isSubmittingBranchStore ? 'Menyimpan...' : 'Simpan Pengaturan Cabang'}
                    </button>
                </form>
            </section>

            <section className={SECTION_CLASS}>
                <h3 className="text-[1.1rem] font-bold text-text-main mb-1">Ubah Password</h3>
                <p className="text-text-muted text-sm mb-5">Gunakan password kuat dan jangan dibagikan ke orang lain.</p>

                {message && (
                    <div className={SUCCESS_NOTICE_CLASS}>{message}</div>
                )}

                {errorMessage && (
                    <div className={ERROR_NOTICE_CLASS}>{errorMessage}</div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block mb-1.5 text-[0.85rem] text-text-muted">Password Lama</label>
                        <input
                            type="password"
                            className={FIELD_CLASS}
                            value={form.currentPassword}
                            onChange={(event) => setForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
                            required
                        />
                    </div>
                    <div>
                        <label className="block mb-1.5 text-[0.85rem] text-text-muted">Password Baru</label>
                        <input
                            type="password"
                            className={FIELD_CLASS}
                            value={form.newPassword}
                            onChange={(event) => setForm((prev) => ({ ...prev, newPassword: event.target.value }))}
                            required
                        />
                    </div>
                    <div>
                        <label className="block mb-1.5 text-[0.85rem] text-text-muted">Konfirmasi Password Baru</label>
                        <input
                            type="password"
                            className={FIELD_CLASS}
                            value={form.confirmPassword}
                            onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className={ACTION_BUTTON_CLASS}
                    >
                        {isSubmitting ? 'Menyimpan...' : 'Simpan Password Baru'}
                    </button>
                </form>
            </section>
        </div>
    )
}

export default Account

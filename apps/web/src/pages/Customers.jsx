import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    createCustomerRecord,
    fetchCustomers,
    removeCustomerRecord,
    updateCustomerRecord,
} from '../lib/api'

const initialForm = {
    name: '',
    phone: '',
    address: '',
    guarantee: 'KTP',
    guaranteeOther: '',
    idNumber: '',
}

const Customers = () => {
    const [customers, setCustomers] = useState([])
    const [query, setQuery] = useState('')
    const [isLoading, setIsLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [message, setMessage] = useState('')
    const [messageError, setMessageError] = useState('')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [modalMode, setModalMode] = useState('create')
    const [editingCustomerId, setEditingCustomerId] = useState('')
    const [form, setForm] = useState(initialForm)
    const latestRequestRef = useRef(0)

    const loadCustomers = useCallback(async (searchValue = '', requestId = 0) => {
        try {
            setIsLoading(true)
            setErrorMessage('')
            const data = await fetchCustomers(searchValue)

            if (requestId !== latestRequestRef.current) {
                return
            }

            setCustomers(data)
        } catch (error) {
            if (requestId !== latestRequestRef.current) {
                return
            }

            const messageText = error instanceof Error ? error.message : 'Gagal memuat data customer.'
            setErrorMessage(messageText)
        } finally {
            if (requestId === latestRequestRef.current) {
                setIsLoading(false)
            }
        }
    }, [])

    const refreshCustomers = useCallback(async (searchValue = query) => {
        const requestId = latestRequestRef.current + 1
        latestRequestRef.current = requestId
        await loadCustomers(searchValue, requestId)
    }, [loadCustomers, query])

    useEffect(() => {
        const requestId = latestRequestRef.current + 1
        latestRequestRef.current = requestId
        const timeoutId = setTimeout(() => {
            loadCustomers(query, requestId)
        }, 300)

        return () => clearTimeout(timeoutId)
    }, [query, loadCustomers])

    const closeModal = () => {
        setIsModalOpen(false)
        setEditingCustomerId('')
        setForm(initialForm)
        setMessageError('')
    }

    const openCreateModal = () => {
        setMessage('')
        setMessageError('')
        setModalMode('create')
        setEditingCustomerId('')
        setForm(initialForm)
        setIsModalOpen(true)
    }

    const openEditModal = (customer) => {
        setMessage('')
        setMessageError('')
        setModalMode('edit')
        setEditingCustomerId(customer.id)
        setForm({
            name: customer.name || '',
            phone: customer.phone || '',
            address: customer.address || '',
            guarantee: customer.guarantee || 'KTP',
            guaranteeOther: customer.guaranteeOther || '',
            idNumber: customer.idNumber || '',
        })
        setIsModalOpen(true)
    }

    const handleSubmit = async (event) => {
        event.preventDefault()
        setMessage('')
        setMessageError('')

        if (!form.name.trim() || !form.phone.trim()) {
            setMessageError('Nama customer dan nomor HP wajib diisi.')
            return
        }

        if (form.guarantee === 'Lainnya' && !form.guaranteeOther.trim()) {
            setMessageError('Isi kolom jaminan lainnya.')
            return
        }

        const payload = {
            name: form.name.trim(),
            phone: form.phone.trim(),
            address: form.address.trim(),
            guarantee: form.guarantee,
            guaranteeOther: form.guarantee === 'Lainnya' ? form.guaranteeOther.trim() : '',
            idNumber: form.idNumber.trim(),
        }

        try {
            setIsSubmitting(true)

            if (modalMode === 'edit' && editingCustomerId) {
                await updateCustomerRecord(editingCustomerId, payload)
                setMessage('Data customer berhasil diperbarui.')
            } else {
                await createCustomerRecord(payload)
                setMessage('Data customer berhasil disimpan dan siap dipakai di halaman sewa.')
            }

            await refreshCustomers(query)
            closeModal()
        } catch (error) {
            const messageText = error instanceof Error ? error.message : 'Gagal menyimpan data customer.'
            setMessageError(messageText)
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDelete = async (customer) => {
        if (!window.confirm(`Hapus customer ${customer.name} (${customer.phone})?`)) {
            return
        }

        setMessage('')
        setMessageError('')

        try {
            await removeCustomerRecord(customer.id)
            setMessage('Data customer berhasil dihapus.')
            await refreshCustomers(query)
        } catch (error) {
            const messageText = error instanceof Error ? error.message : 'Gagal menghapus customer.'
            setMessageError(messageText)
        }
    }

    const totalCustomers = useMemo(() => customers.length, [customers])

    return (
        <div className="space-y-5 py-4 sm:py-5">
            <section className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-4 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h3 className="mb-1 text-[1.1rem] font-bold text-text-main">Data Customer</h3>
                        <p className="text-sm text-text-muted">
                            Simpan customer lebih awal supaya saat transaksi sewa cukup cari dan autofill.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={openCreateModal}
                        className="min-h-11 rounded-lg bg-accent px-5 py-2.5 font-semibold text-white hover:bg-accent-hover"
                    >
                        <i className="fas fa-user-plus mr-2"></i>
                        Add Customer
                    </button>
                </div>

                <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="w-full md:max-w-[380px]">
                        <label className="mb-1.5 block text-[0.85rem] text-text-muted">Cari Customer</label>
                        <input
                            className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
                            type="text"
                            placeholder="Nama / No HP / Alamat / No Identitas"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </div>

                    <div className="text-sm text-text-muted">
                        Total hasil: <span className="font-semibold text-text-main">{totalCustomers}</span>
                    </div>
                </div>
            </section>

            {message && (
                <div className="rounded-lg border border-[#2ecc71]/40 bg-[#2ecc71]/10 p-3 text-sm text-[#6ee7a8]">{message}</div>
            )}

            {(messageError || errorMessage) && (
                <div className="rounded-lg border border-[#e74c3c]/40 bg-[#e74c3c]/10 p-3 text-sm text-[#f3b2ad]">
                    {messageError || errorMessage}
                </div>
            )}

            <section className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-4 sm:p-6">
                {isLoading ? (
                    <div className="text-text-muted">Memuat data customer...</div>
                ) : (
                    <>
                        {customers.length === 0 ? (
                            <div className="rounded-lg border border-border/50 bg-bg-main/30 p-4 text-center text-text-muted">Belum ada data customer.</div>
                        ) : (
                            <>
                                <div className="space-y-3 md:hidden">
                                    {customers.map((customer) => (
                                        <article key={customer.id} className="rounded-lg border border-border/50 bg-bg-main/30 p-4">
                                            <p className="font-semibold text-text-main">{customer.name}</p>
                                            <p className="mt-1 text-sm text-text-main">{customer.phone}</p>
                                            <p className="mt-1 text-xs text-text-muted">Alamat: {customer.address || '-'}</p>
                                            <p className="mt-1 text-xs text-text-muted">Jaminan: {customer.guarantee}</p>
                                            <p className="mt-1 text-xs text-text-muted">No Identitas: {customer.idNumber || '-'}</p>
                                            <p className="mt-2 text-xs text-text-muted">Update: {new Date(customer.updatedAt).toLocaleString('id-ID')}</p>
                                            <div className="mt-3 flex gap-2">
                                                <button
                                                    className="rounded border border-border bg-sidebar-bg px-3 py-1.5 text-xs text-text-main hover:border-accent"
                                                    onClick={() => openEditModal(customer)}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    className="rounded border border-[#e74c3c]/40 bg-[#e74c3c]/10 px-3 py-1.5 text-xs text-[#f3b2ad] hover:bg-[#e74c3c]/20"
                                                    onClick={() => handleDelete(customer)}
                                                >
                                                    Hapus
                                                </button>
                                            </div>
                                        </article>
                                    ))}
                                </div>

                                <div className="hidden overflow-x-auto md:block">
                                    <table className="w-full min-w-[980px] border-collapse">
                                        <thead>
                                            <tr>
                                                <th className="border-b border-border p-3 text-left text-xs uppercase tracking-wider text-text-muted">Nama</th>
                                                <th className="border-b border-border p-3 text-left text-xs uppercase tracking-wider text-text-muted">No HP</th>
                                                <th className="border-b border-border p-3 text-left text-xs uppercase tracking-wider text-text-muted">Alamat</th>
                                                <th className="border-b border-border p-3 text-left text-xs uppercase tracking-wider text-text-muted">Jaminan</th>
                                                <th className="border-b border-border p-3 text-left text-xs uppercase tracking-wider text-text-muted">No Identitas</th>
                                                <th className="border-b border-border p-3 text-left text-xs uppercase tracking-wider text-text-muted">Terakhir Update</th>
                                                <th className="border-b border-border p-3 text-right text-xs uppercase tracking-wider text-text-muted">Aksi</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {customers.map((customer) => (
                                                <tr key={customer.id} className="hover:bg-white/5">
                                                    <td className="border-b border-border/40 p-3 font-medium text-text-main">{customer.name}</td>
                                                    <td className="border-b border-border/40 p-3 text-text-main">{customer.phone}</td>
                                                    <td className="border-b border-border/40 p-3 text-text-muted">{customer.address || '-'}</td>
                                                    <td className="border-b border-border/40 p-3 text-text-muted">{customer.guarantee}</td>
                                                    <td className="border-b border-border/40 p-3 text-text-muted">{customer.idNumber || '-'}</td>
                                                    <td className="border-b border-border/40 p-3 text-sm text-text-muted">{new Date(customer.updatedAt).toLocaleString('id-ID')}</td>
                                                    <td className="border-b border-border/40 p-3">
                                                        <div className="flex justify-end gap-2">
                                                            <button
                                                                className="rounded border border-border bg-sidebar-bg px-3 py-1.5 text-xs text-text-main hover:border-accent"
                                                                onClick={() => openEditModal(customer)}
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                className="rounded border border-[#e74c3c]/40 bg-[#e74c3c]/10 px-3 py-1.5 text-xs text-[#f3b2ad] hover:bg-[#e74c3c]/20"
                                                                onClick={() => handleDelete(customer)}
                                                            >
                                                                Hapus
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </>
                )}
            </section>

            {isModalOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-3 backdrop-blur-[5px] sm:p-4">
                    <div className="max-h-[92vh] w-full max-w-[680px] overflow-hidden rounded-DEFAULT border border-border bg-sidebar-bg animate-[modalIn_0.3s_ease-out]">
                        <div className="flex items-center justify-between border-b border-border px-4 py-4 sm:p-[20px_25px]">
                            <h3 className="text-[1.05rem] font-bold text-text-main sm:text-[1.2rem]">
                                {modalMode === 'edit' ? 'Edit Customer' : 'Tambah Customer'}
                            </h3>
                            <button
                                className="flex h-10 w-10 items-center justify-center rounded-full border border-transparent bg-transparent text-[1.5rem] text-text-muted transition hover:border-border hover:text-text-main"
                                onClick={closeModal}
                            >
                                &times;
                            </button>
                        </div>

                        <div className="max-h-[calc(92vh-72px)] overflow-y-auto p-4 sm:max-h-[calc(92vh-86px)] sm:p-[25px]">
                            {messageError && (
                                <div className="mb-4 rounded-lg border border-[#e74c3c]/40 bg-[#e74c3c]/10 p-3 text-sm text-[#f3b2ad]">
                                    {messageError}
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div>
                                    <label className="mb-1.5 block text-[0.85rem] text-text-muted">Nama Customer</label>
                                    <input
                                        className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
                                        type="text"
                                        placeholder="Nama lengkap..."
                                        value={form.name}
                                        onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-[0.85rem] text-text-muted">Nomor HP</label>
                                    <input
                                        className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
                                        type="text"
                                        placeholder="0812..."
                                        value={form.phone}
                                        onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="mb-1.5 block text-[0.85rem] text-text-muted">Alamat</label>
                                    <textarea
                                        className="min-h-[90px] w-full resize-y rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
                                        placeholder="Alamat customer..."
                                        value={form.address}
                                        onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                                    ></textarea>
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-[0.85rem] text-text-muted">Jaminan</label>
                                    <select
                                        className="w-full cursor-pointer rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
                                        value={form.guarantee}
                                        onChange={(event) => setForm((prev) => ({ ...prev, guarantee: event.target.value }))}
                                    >
                                        <option value="KTP">KTP</option>
                                        <option value="SIM">SIM</option>
                                        <option value="Paspor">Paspor</option>
                                        <option value="Lainnya">Lainnya</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-[0.85rem] text-text-muted">No Identitas</label>
                                    <input
                                        className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
                                        type="text"
                                        placeholder="Opsional"
                                        value={form.idNumber}
                                        onChange={(event) => setForm((prev) => ({ ...prev, idNumber: event.target.value }))}
                                    />
                                </div>

                                {form.guarantee === 'Lainnya' && (
                                    <div className="md:col-span-2">
                                        <label className="mb-1.5 block text-[0.85rem] text-text-muted">Sebutkan Jaminan Lainnya</label>
                                        <input
                                            className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
                                            type="text"
                                            placeholder="Contoh: STNK, Kartu Pelajar..."
                                            value={form.guaranteeOther}
                                            onChange={(event) => setForm((prev) => ({ ...prev, guaranteeOther: event.target.value }))}
                                            required
                                        />
                                    </div>
                                )}

                                <div className="mt-2 flex flex-col gap-2 md:col-span-2 sm:flex-row">
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="min-h-11 rounded-lg bg-accent px-5 py-2.5 font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
                                    >
                                        {isSubmitting ? 'Menyimpan...' : modalMode === 'edit' ? 'Update Customer' : 'Simpan Customer'}
                                    </button>
                                    <button
                                        type="button"
                                        className="min-h-11 rounded-lg border border-border bg-sidebar-bg px-5 py-2.5 font-semibold text-text-main hover:border-accent"
                                        onClick={closeModal}
                                    >
                                        Batal
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default Customers

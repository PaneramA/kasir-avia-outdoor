import React, { useEffect, useMemo, useRef, useState } from 'react'
import { fetchCustomers } from '../lib/api'

const Customers = () => {
    const [customers, setCustomers] = useState([])
    const [query, setQuery] = useState('')
    const [isLoading, setIsLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState('')
    const latestRequestRef = useRef(0)

    const loadCustomers = async (searchValue = '', requestId = 0) => {
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

            const message = error instanceof Error ? error.message : 'Gagal memuat data customer.'
            setErrorMessage(message)
        } finally {
            if (requestId === latestRequestRef.current) {
                setIsLoading(false)
            }
        }
    }

    useEffect(() => {
        const requestId = latestRequestRef.current + 1
        latestRequestRef.current = requestId
        const timeoutId = setTimeout(() => {
            loadCustomers(query, requestId)
        }, 300)

        return () => clearTimeout(timeoutId)
    }, [query])

    const totalCustomers = useMemo(() => customers.length, [customers])

    return (
        <div className="space-y-5 py-4 sm:py-5">
            <section className="rounded-DEFAULT border border-border bg-sidebar-bg/60 p-4 sm:p-6">
                <h3 className="text-[1.1rem] font-bold text-text-main mb-1">Data Customer</h3>
                <p className="text-text-muted text-sm">
                    Data customer ini tersimpan otomatis setiap transaksi sewa berhasil dibuat.
                </p>

                <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="w-full md:max-w-[380px]">
                        <label className="block mb-1.5 text-[0.85rem] text-text-muted">Cari Customer</label>
                        <input
                            className="w-full bg-bg-main border border-border p-2.5 rounded-lg text-text-main outline-none focus:border-accent"
                            type="text"
                            placeholder="Nama / No HP / No Identitas"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </div>

                    <div className="text-sm text-text-muted">
                        Total hasil: <span className="text-text-main font-semibold">{totalCustomers}</span>
                    </div>
                </div>
            </section>

            {errorMessage && (
                <div className="rounded-lg border border-[#e74c3c]/40 bg-[#e74c3c]/10 p-3 text-sm text-[#f3b2ad]">{errorMessage}</div>
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
                                            <p className="mt-1 text-xs text-text-muted">Jaminan: {customer.guarantee}</p>
                                            <p className="mt-1 text-xs text-text-muted">No Identitas: {customer.idNumber || '-'}</p>
                                            <p className="mt-2 text-xs text-text-muted">Update: {new Date(customer.updatedAt).toLocaleString('id-ID')}</p>
                                        </article>
                                    ))}
                                </div>

                                <div className="hidden overflow-x-auto md:block">
                                    <table className="w-full min-w-[820px] border-collapse">
                                        <thead>
                                            <tr>
                                                <th className="border-b border-border p-3 text-left text-xs uppercase tracking-wider text-text-muted">Nama</th>
                                                <th className="border-b border-border p-3 text-left text-xs uppercase tracking-wider text-text-muted">No HP</th>
                                                <th className="border-b border-border p-3 text-left text-xs uppercase tracking-wider text-text-muted">Jaminan</th>
                                                <th className="border-b border-border p-3 text-left text-xs uppercase tracking-wider text-text-muted">No Identitas</th>
                                                <th className="border-b border-border p-3 text-left text-xs uppercase tracking-wider text-text-muted">Terakhir Update</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {customers.map((customer) => (
                                                <tr key={customer.id} className="hover:bg-white/5">
                                                    <td className="border-b border-border/40 p-3 font-medium text-text-main">{customer.name}</td>
                                                    <td className="border-b border-border/40 p-3 text-text-main">{customer.phone}</td>
                                                    <td className="border-b border-border/40 p-3 text-text-muted">{customer.guarantee}</td>
                                                    <td className="border-b border-border/40 p-3 text-text-muted">{customer.idNumber || '-'}</td>
                                                    <td className="border-b border-border/40 p-3 text-sm text-text-muted">
                                                        {new Date(customer.updatedAt).toLocaleString('id-ID')}
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
        </div>
    )
}

export default Customers

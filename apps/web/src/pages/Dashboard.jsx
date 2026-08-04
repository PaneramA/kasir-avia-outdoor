import React from 'react';
import { Link } from 'react-router';
import useSWR from 'swr';
import { APP_ROUTES } from '../lib/routes';
import { formatCurrency, formatMonthLabel } from '../lib/financial';
import { getPlannedReturnDate } from '../lib/rentalTime';
import { fetchDashboardSummary } from '../lib/api';
import { APP_CACHE_KEYS } from '../lib/appCache';
import { APP_BRAND } from '../lib/brand';

const Dashboard = ({ userId = '', tenantId = '', branchId = '' }) => {
    const [statusFilter, setStatusFilter] = React.useState('all');
    const { data: dashboardSummary, error: dashboardError, isLoading } = useSWR(
        userId && tenantId && branchId ? APP_CACHE_KEYS.dashboard(userId, tenantId, branchId, statusFilter) : null,
        ([, , , , recentStatus]) => fetchDashboardSummary(recentStatus),
    );

    const filterOptions = [
        { value: 'all', label: 'Semua' },
        { value: 'active', label: 'Active' },
        { value: 'returned', label: 'Returned' },
    ];

    const stats = dashboardSummary?.stats || {
        availableStock: 0,
        activeRentals: 0,
        itemsOut: 0,
        revenue: 0,
    };
    const monthLabel = formatMonthLabel(dashboardSummary?.period?.monthKey || '');
    const filteredRecent = Array.isArray(dashboardSummary?.recentRentals)
        ? dashboardSummary.recentRentals
        : [];

    const formatReturnDateLabel = (rental) => {
        const actualReturnDate = rental?.returnDate ? new Date(rental.returnDate) : null;
        if (actualReturnDate && !Number.isNaN(actualReturnDate.getTime())) {
            return actualReturnDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });
        }

        const plannedReturnDate = getPlannedReturnDate(rental);
        if (plannedReturnDate) {
            return plannedReturnDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });
        }

        return '-';
    };

    return (
        <div className="pt-0 pb-4 sm:pb-5">
            <div className="mb-6 rounded-md border border-border bg-card-bg p-5 sm:mb-8 sm:p-6">
                <div className="flex items-start gap-4">
                    <img className="h-11 w-11 shrink-0 rounded-md bg-white object-contain" src={APP_BRAND.logoSrc} alt="" aria-hidden="true" />
                    <div>
                        <h2 className="mb-2 text-[1.25rem] font-bold text-text-main sm:text-[1.5rem]">Sistem Rental {APP_BRAND.name}</h2>
                        <p className="text-text-muted">Pusat kendali operasional persewaan alat camping & hiking.</p>
                    </div>
                </div>
            </div>

            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:mb-10 lg:grid-cols-4">
                <div className="flex items-center gap-4 rounded-md border border-border bg-card-bg p-5 transition-colors hover:border-accent sm:gap-5 sm:p-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-md bg-accent text-[1.35rem] text-white sm:h-14 sm:w-14 sm:text-[1.5rem]">
                        <i className="fas fa-check-circle"></i>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[0.8rem] text-text-muted uppercase tracking-wider font-semibold mb-1">Stok Tersedia</span>
                        <span className="text-[1.5rem] font-bold text-text-main">{stats.availableStock}</span>
                    </div>
                </div>
                <div className="flex items-center gap-4 rounded-md border border-border bg-card-bg p-5 transition-colors hover:border-accent sm:gap-5 sm:p-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-md bg-accent text-[1.35rem] text-white sm:h-14 sm:w-14 sm:text-[1.5rem]">
                        <i className="fas fa-clock"></i>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[0.8rem] text-text-muted uppercase tracking-wider font-semibold mb-1">Penyewaan Aktif</span>
                        <span className="text-[1.5rem] font-bold text-text-main">{stats.activeRentals}</span>
                    </div>
                </div>
                <div className="flex items-center gap-4 rounded-md border border-border bg-card-bg p-5 transition-colors hover:border-accent sm:gap-5 sm:p-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-md bg-accent text-[1.35rem] text-white sm:h-14 sm:w-14 sm:text-[1.5rem]">
                        <i className="fas fa-exclamation-triangle"></i>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[0.8rem] text-text-muted uppercase tracking-wider font-semibold mb-1">Barang Keluar</span>
                        <span className="text-[1.5rem] font-bold text-text-main">{stats.itemsOut}</span>
                    </div>
                </div>
                <div className="flex items-center gap-4 rounded-md border border-border bg-card-bg p-5 transition-colors hover:border-accent sm:gap-5 sm:p-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-md bg-accent text-[1.35rem] text-white sm:h-14 sm:w-14 sm:text-[1.5rem]">
                        <i className="fas fa-wallet"></i>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[0.8rem] text-text-muted uppercase tracking-wider font-semibold mb-1">Pendapatan Bulanan</span>
                        <span className="text-[1.5rem] font-bold text-text-main">{formatCurrency(stats.revenue)}</span>
                        <span className="text-[0.72rem] text-text-muted">{monthLabel}</span>
                    </div>
                </div>
            </div>

            <div className="rounded-md border border-border bg-card-bg p-4 sm:p-6">
                <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h3 className="mb-1 text-[1.1rem] font-bold text-text-main sm:text-[1.2rem]">Penyewaan Terbaru</h3>
                        <p className="text-text-muted text-[0.9rem]">Daftar transaksi terakhir.</p>
                    </div>
                    <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                        <Link
                            to={APP_ROUTES.history}
                            className="inline-flex items-center gap-2 rounded-md border border-accent bg-accent px-3 py-1.5 text-[0.75rem] font-semibold text-white transition-colors hover:border-accent-hover hover:bg-accent-hover sm:text-[0.8rem]"
                        >
                            <i className="fas fa-list-ul text-[0.72rem]"></i>
                            Lihat semua
                        </Link>
                        <div className="inline-flex flex-wrap gap-2">
                            {filterOptions.map((option) => {
                                const isActive = statusFilter === option.value;
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setStatusFilter(option.value)}
                                        className={`rounded-md border px-3 py-1.5 text-[0.75rem] font-semibold transition-colors sm:text-[0.8rem] ${isActive
                                            ? 'border-accent bg-accent text-white hover:border-accent-hover hover:bg-accent-hover'
                                            : 'border-border bg-card-bg text-text-muted hover:border-accent hover:text-text-main'
                                            }`}
                                    >
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
                <div className="mt-5 sm:mt-6">
                    {isLoading ? (
                        <div className="py-10 text-center text-text-muted">Memuat ringkasan operasional...</div>
                    ) : dashboardError ? (
                        <div className="py-10 text-center font-semibold text-accent-hover">Gagal memuat ringkasan Dashboard.</div>
                    ) : filteredRecent.length === 0 ? (
                        <div className="text-center py-10 text-text-muted">Belum ada transaksi untuk filter ini.</div>
                    ) : (
                        <>
                            <div className="space-y-3 md:hidden">
                                {filteredRecent.map((r, idx) => (
                                    <article key={idx} className="rounded-md border border-border bg-card-bg p-4">
                                        <div className="mb-2 flex items-start justify-between gap-3">
                                            <div>
                                                <p className="font-semibold text-text-main">{r.customer.name}</p>
                                                <p className="text-xs text-text-muted">{r.customer.phone}</p>
                                            </div>
                                            <span className={`rounded-md border px-2.5 py-1 text-[0.72rem] font-bold ${r.status.toLowerCase() === 'active'
                                                ? 'border-accent bg-accent text-white'
                                                : 'border-border bg-bg-main text-text-muted'
                                            }`}>
                                                {r.status}
                                            </span>
                                        </div>
                                        <p className="text-xs text-text-muted">{r.items.map((i) => `${i.name} (${i.qty})`).join(', ')}</p>
                                        <p className="mt-2 text-xs text-text-muted">
                                            {r.status.toLowerCase() === 'active' ? 'Rencana Kembali' : 'Tanggal Kembali'}: {formatReturnDateLabel(r)}
                                        </p>
                                        <p className="mt-2 font-bold text-accent">Rp {(r.finalTotal ?? r.total ?? 0).toLocaleString()}</p>
                                    </article>
                                ))}
                            </div>

                            <div className="hidden overflow-x-auto rounded-md border border-border md:block">
                                <table className="w-full min-w-[760px] border-collapse bg-card-bg">
                                    <thead className="bg-bg-main">
                                        <tr>
                                            <th className="border-b border-border p-4 text-left text-[0.85rem] font-semibold uppercase tracking-wider text-text-muted">Pelanggan</th>
                                            <th className="border-b border-border p-4 text-left text-[0.85rem] font-semibold uppercase tracking-wider text-text-muted">Barang</th>
                                            <th className="border-b border-border p-4 text-left text-[0.85rem] font-semibold uppercase tracking-wider text-text-muted">Status</th>
                                            <th className="border-b border-border p-4 text-left text-[0.85rem] font-semibold uppercase tracking-wider text-text-muted">Tanggal Kembali</th>
                                            <th className="border-b border-border p-4 text-left text-[0.85rem] font-semibold uppercase tracking-wider text-text-muted">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredRecent.map((r, idx) => (
                                            <tr key={idx} className="transition-colors hover:bg-surface-hover">
                                                <td className="border-b border-border/60 p-4">
                                                    <strong className="text-text-main">{r.customer.name}</strong>
                                                    <br />
                                                    <small className="text-text-muted">{r.customer.phone}</small>
                                                </td>
                                                <td className="border-b border-border/60 p-4 text-text-muted">{r.items.map((i) => `${i.name} (${i.qty})`).join(', ')}</td>
                                                <td className="border-b border-border/60 p-4">
                                                    <span className={`rounded-md border px-3 py-1 text-[0.75rem] font-bold ${r.status.toLowerCase() === 'active'
                                                        ? 'border-accent bg-accent text-white'
                                                        : 'border-border bg-bg-main text-text-muted'
                                                    }`}>
                                                        {r.status}
                                                    </span>
                                                </td>
                                                <td className="border-b border-border/60 p-4 text-text-muted">
                                                    {r.status.toLowerCase() === 'active' ? 'Rencana: ' : ''}
                                                    {formatReturnDateLabel(r)}
                                                </td>
                                                <td className="border-b border-border/60 p-4 font-bold text-accent">Rp {(r.finalTotal ?? r.total ?? 0).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;

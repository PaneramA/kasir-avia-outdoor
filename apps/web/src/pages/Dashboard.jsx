import React from 'react';
import { Link } from 'react-router-dom';
import useSWR from 'swr';
import { APP_ROUTES } from '../lib/routes';
import { formatCurrency, formatMonthLabel } from '../lib/financial';
import { getPlannedReturnDate } from '../lib/rentalTime';
import { fetchDashboardSummary } from '../lib/api';
import { APP_CACHE_KEYS } from '../lib/appCache';

const Dashboard = ({ tenantId = '', branchId = '' }) => {
    const [statusFilter, setStatusFilter] = React.useState('all');
    const { data: dashboardSummary, error: dashboardError, isLoading } = useSWR(
        tenantId && branchId ? APP_CACHE_KEYS.dashboard(tenantId, branchId, statusFilter) : null,
        ([, , , recentStatus]) => fetchDashboardSummary(recentStatus),
        { keepPreviousData: true },
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
            <div className="relative mb-6 overflow-hidden rounded-DEFAULT border border-accent/20 bg-accent/10 p-5 sm:mb-8 sm:p-8">
                <h2 className="mb-2 text-[1.25rem] font-bold text-accent sm:text-[1.5rem]">Sistem Rental AviaOutdoor</h2>
                <p className="text-text-muted">Pusat kendali operasional persewaan alat camping & hiking.</p>
                <div className="pointer-events-none absolute right-[-40px] top-[-40px] rotate-12 text-accent/5 sm:right-[-50px] sm:top-[-50px]">
                    <i className="fas fa-mountain text-[15rem]"></i>
                </div>
            </div>

            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:mb-10 lg:grid-cols-4">
                <div className="flex items-center gap-4 rounded-DEFAULT border border-border bg-card-bg p-5 transition-all hover:border-accent sm:gap-5 sm:p-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#2ecc71]/20 text-[1.35rem] text-[#2ecc71] sm:h-14 sm:w-14 sm:text-[1.5rem]">
                        <i className="fas fa-check-circle"></i>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[0.8rem] text-text-muted uppercase tracking-wider font-semibold mb-1">Stok Tersedia</span>
                        <span className="text-[1.5rem] font-bold text-text-main">{stats.availableStock}</span>
                    </div>
                </div>
                <div className="flex items-center gap-4 rounded-DEFAULT border border-border bg-card-bg p-5 transition-all hover:border-accent sm:gap-5 sm:p-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/20 text-[1.35rem] text-accent sm:h-14 sm:w-14 sm:text-[1.5rem]">
                        <i className="fas fa-clock"></i>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[0.8rem] text-text-muted uppercase tracking-wider font-semibold mb-1">Penyewaan Aktif</span>
                        <span className="text-[1.5rem] font-bold text-text-main">{stats.activeRentals}</span>
                    </div>
                </div>
                <div className="flex items-center gap-4 rounded-DEFAULT border border-border bg-card-bg p-5 transition-all hover:border-accent sm:gap-5 sm:p-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e74c3c]/20 text-[1.35rem] text-[#e74c3c] sm:h-14 sm:w-14 sm:text-[1.5rem]">
                        <i className="fas fa-exclamation-triangle"></i>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[0.8rem] text-text-muted uppercase tracking-wider font-semibold mb-1">Barang Keluar</span>
                        <span className="text-[1.5rem] font-bold text-text-main">{stats.itemsOut}</span>
                    </div>
                </div>
                <div className="flex items-center gap-4 rounded-DEFAULT border border-border bg-card-bg p-5 transition-all hover:border-accent sm:gap-5 sm:p-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#3498db]/20 text-[1.35rem] text-[#3498db] sm:h-14 sm:w-14 sm:text-[1.5rem]">
                        <i className="fas fa-wallet"></i>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[0.8rem] text-text-muted uppercase tracking-wider font-semibold mb-1">Pendapatan Bulanan</span>
                        <span className="text-[1.5rem] font-bold text-text-main">{formatCurrency(stats.revenue)}</span>
                        <span className="text-[0.72rem] text-text-muted">{monthLabel}</span>
                    </div>
                </div>
            </div>

            <div className="rounded-DEFAULT border border-border bg-sidebar-bg/50 p-4 sm:p-8">
                <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h3 className="mb-1 text-[1.1rem] font-bold text-text-main sm:text-[1.2rem]">Penyewaan Terbaru</h3>
                        <p className="text-text-muted text-[0.9rem]">Daftar transaksi terakhir.</p>
                    </div>
                    <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                        <Link
                            to={APP_ROUTES.history}
                            className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-[0.75rem] font-semibold text-accent transition-colors hover:bg-accent/20 sm:text-[0.8rem]"
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
                                        className={`rounded-full border px-3 py-1.5 text-[0.75rem] font-semibold transition-colors sm:text-[0.8rem] ${isActive
                                            ? 'border-accent bg-accent text-white'
                                            : 'border-border bg-card-bg text-text-muted hover:border-accent/50 hover:text-text-main'
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
                        <div className="py-10 text-center text-[#e74c3c]">Gagal memuat ringkasan Dashboard.</div>
                    ) : filteredRecent.length === 0 ? (
                        <div className="text-center py-10 text-text-muted">Belum ada transaksi untuk filter ini.</div>
                    ) : (
                        <>
                            <div className="space-y-3 md:hidden">
                                {filteredRecent.map((r, idx) => (
                                    <article key={idx} className="rounded-lg border border-border bg-bg-main/40 p-4">
                                        <div className="mb-2 flex items-start justify-between gap-3">
                                            <div>
                                                <p className="font-semibold text-text-main">{r.customer.name}</p>
                                                <p className="text-xs text-text-muted">{r.customer.phone}</p>
                                            </div>
                                            <span className={`rounded-[20px] px-2.5 py-1 text-[0.72rem] font-bold ${r.status.toLowerCase() === 'active'
                                                ? 'bg-[#2ecc71]/20 text-[#2ecc71]'
                                                : 'bg-text-muted/20 text-text-muted'
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

                            <div className="hidden overflow-x-auto md:block">
                                <table className="w-full min-w-[760px] border-collapse">
                                    <thead>
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
                                                    <span className={`rounded-[20px] px-3 py-1 text-[0.75rem] font-bold ${r.status.toLowerCase() === 'active'
                                                        ? 'bg-[#2ecc71]/20 text-[#2ecc71]'
                                                        : 'bg-text-muted/20 text-text-muted'
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

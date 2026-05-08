import React from 'react';

const Dashboard = ({ inventory, rentals }) => {
    const calculateStats = () => {
        const available = inventory.reduce((sum, item) => sum + parseInt(item.stock || 0), 0);
        const activeRentals = rentals.filter((r) => r.status === 'Active').length;
        const itemsOut = rentals
            .filter((r) => r.status === 'Active')
            .reduce((sum, r) => sum + r.items.reduce((iSum, item) => iSum + item.qty, 0), 0);
        const revenue = rentals.reduce((sum, r) => sum + (r.total || 0), 0);

        return { available, activeRentals, itemsOut, revenue };
    };

    const stats = calculateStats();
    const recent = [...rentals].reverse().slice(0, 5);

    return (
        <div className="py-4 sm:py-5">
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
                        <span className="text-[1.5rem] font-bold text-text-main">{stats.available}</span>
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
                        <span className="text-[0.8rem] text-text-muted uppercase tracking-wider font-semibold mb-1">Pendapatan</span>
                        <span className="text-[1.5rem] font-bold text-text-main">Rp {stats.revenue.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            <div className="rounded-DEFAULT border border-border bg-sidebar-bg/50 p-4 sm:p-8">
                <h3 className="mb-1 text-[1.1rem] font-bold text-text-main sm:text-[1.2rem]">Penyewaan Terbaru</h3>
                <p className="text-text-muted text-[0.9rem]">Daftar transaksi terakhir.</p>
                <div className="mt-5 sm:mt-6">
                    {recent.length === 0 ? (
                        <div className="text-center py-10 text-text-muted">Belum ada data terbaru.</div>
                    ) : (
                        <>
                            <div className="space-y-3 md:hidden">
                                {recent.map((r, idx) => (
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
                                        <p className="mt-2 font-bold text-accent">Rp {(r.total || 0).toLocaleString()}</p>
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
                                            <th className="border-b border-border p-4 text-left text-[0.85rem] font-semibold uppercase tracking-wider text-text-muted">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recent.map((r, idx) => (
                                            <tr key={idx} className="transition-colors hover:bg-white/5">
                                                <td className="border-b border-white/5 p-4">
                                                    <strong className="text-text-main">{r.customer.name}</strong>
                                                    <br />
                                                    <small className="text-text-muted">{r.customer.phone}</small>
                                                </td>
                                                <td className="border-b border-white/5 p-4 text-text-muted">{r.items.map((i) => `${i.name} (${i.qty})`).join(', ')}</td>
                                                <td className="border-b border-white/5 p-4">
                                                    <span className={`rounded-[20px] px-3 py-1 text-[0.75rem] font-bold ${r.status.toLowerCase() === 'active'
                                                        ? 'bg-[#2ecc71]/20 text-[#2ecc71]'
                                                        : 'bg-text-muted/20 text-text-muted'
                                                    }`}>
                                                        {r.status}
                                                    </span>
                                                </td>
                                                <td className="border-b border-white/5 p-4 font-bold text-accent">Rp {(r.total || 0).toLocaleString()}</td>
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

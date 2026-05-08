import React, { useState } from 'react';

const History = ({ rentals }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Filter logic
    const filteredRentals = rentals.filter(rental => {
        // Status filter
        if (statusFilter !== 'All' && rental.status !== statusFilter) {
            return false;
        }

        // Search query (ID or Customer Name)
        const query = searchQuery.toLowerCase();
        const matchesQuery = rental.id.toLowerCase().includes(query) ||
                             rental.customer.name.toLowerCase().includes(query);
                             
        if (!matchesQuery) return false;

        // Date filter
        if (startDate || endDate) {
            const rentalDate = new Date(rental.date);
            rentalDate.setHours(0, 0, 0, 0);

            if (startDate) {
                const start = new Date(startDate);
                start.setHours(0, 0, 0, 0);
                if (rentalDate < start) return false;
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999); // Include entire end day
                // Note: since rentalDate has hours 0,0,0, checking if rentalDate <= end works perfectly.
                if (rentalDate > end) return false;
            }
        }

        return true;
    });

    // Summary Statistics based on filtered data
    const totalTransactions = filteredRentals.length;
    const activeTransactions = filteredRentals.filter(r => r.status === 'Active').length;
    const returnedTransactions = filteredRentals.filter(r => r.status === 'Returned').length;
    const totalRevenue = filteredRentals.reduce((sum, r) => sum + (r.finalTotal ?? r.total ?? 0), 0);

    return (
        <div className="flex h-full flex-col py-4 sm:py-5">
            {/* Header & Stats Widget */}
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h3 className="text-[1.2rem] font-bold text-text-main mb-1">Riwayat Transaksi</h3>
                    <p className="text-text-muted text-[0.9rem]">Lacak dan kelola semua data penyewaan alat.</p>
                </div>

                <div className="w-full overflow-x-auto md:w-auto">
                    <div className="flex min-w-max overflow-hidden rounded-lg border border-border bg-sidebar-bg shadow-sm">
                    <div className="px-4 py-2 text-center border-r border-border">
                        <span className="block text-[0.7rem] uppercase font-bold text-text-muted mb-0.5">Semua</span>
                        <span className="font-bold text-text-main">{totalTransactions}</span>
                    </div>
                    <div className="px-4 py-2 text-center border-r border-border">
                        <span className="block text-[0.7rem] uppercase font-bold text-text-muted mb-0.5">Aktif</span>
                        <span className="font-bold text-accent">{activeTransactions}</span>
                    </div>
                    <div className="px-4 py-2 text-center border-r border-border">
                        <span className="block text-[0.7rem] uppercase font-bold text-text-muted mb-0.5">Selesai</span>
                        <span className="font-bold text-[#2ecc71]">{returnedTransactions}</span>
                    </div>
                    <div className="px-4 py-2 text-center bg-accent/5">
                        <span className="block text-[0.7rem] uppercase font-bold text-text-muted mb-0.5">Pendapatan</span>
                        <span className="font-bold text-accent">Rp {totalRevenue.toLocaleString()}</span>
                    </div>
                </div>
                </div>
            </div>

            {/* Filter and Search Controls */}
            <div className="mb-6 flex flex-col gap-4 rounded-lg border border-border bg-sidebar-bg p-4">
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 relative">
                        <i className="fas fa-search absolute left-4 top-1/2 transform -translate-y-1/2 text-text-muted"></i>
                        <input 
                            type="text" 
                            className="w-full bg-bg-main border border-border py-2.5 pl-11 pr-4 rounded-lg text-text-main outline-none focus:border-accent text-sm"
                            placeholder="Cari berdasarkan Nama atau ID Transaksi..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="w-full sm:w-[220px]">
                        <select 
                            className="w-full bg-bg-main border border-border py-2.5 px-4 rounded-lg text-text-main outline-none focus:border-accent text-sm cursor-pointer appearance-none"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="All">Semua Status</option>
                            <option value="Active">Sedang Disewa (Active)</option>
                            <option value="Returned">Sudah Kembali (Returned)</option>
                        </select>
                    </div>
                </div>

                {/* Date Filter */}
                <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                    <span className="text-text-muted text-[0.85rem] font-semibold"><i className="fas fa-calendar-alt mr-1.5"></i> Filter Tanggal:</span>
                    <input 
                        type="date" 
                        className="w-full bg-bg-main border border-border py-2 px-3 rounded-lg text-text-main outline-none focus:border-accent text-sm custom-date-input sm:w-auto"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                    />
                    <span className="text-text-muted text-[0.85rem]">s/d</span>
                    <input 
                        type="date" 
                        className="w-full bg-bg-main border border-border py-2 px-3 rounded-lg text-text-main outline-none focus:border-accent text-sm custom-date-input sm:w-auto"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                    />
                    {(startDate || endDate) && (
                        <button 
                            className="text-[#e74c3c] bg-[#e74c3c]/10 hover:bg-[#e74c3c]/20 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
                            onClick={() => { setStartDate(''); setEndDate(''); }}
                        >
                            Reset Tanggal
                        </button>
                    )}
                </div>
            </div>

            {/* Data Table */}
            <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-sidebar-bg/50">
                <div className="custom-scrollbar flex-1 overflow-x-auto">
                    {filteredRentals.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-text-muted py-12">
                            <i className="fas fa-folder-open text-[3rem] mb-4 opacity-30"></i>
                            <p>Tidak ada transaksi yang sesuai dengan pencarian Anda.</p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-3 p-3 sm:p-4 md:hidden">
                                {[...filteredRentals].reverse().map((rental) => (
                                    <article key={rental.id} className="rounded-lg border border-border/60 bg-bg-main/40 p-4">
                                        <div className="mb-2 flex items-start justify-between gap-2">
                                            <div>
                                                <p className="font-mono text-[0.8rem] font-semibold text-text-main">{rental.id}</p>
                                                <p className="text-xs text-text-muted">
                                                    {new Date(rental.date).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })}
                                                </p>
                                            </div>
                                            {rental.status === 'Active' ? (
                                                <span className="inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accent/10 px-2 py-1 text-[0.72rem] font-bold text-accent">
                                                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent"></span>
                                                    Aktif
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 rounded-full border border-[#2ecc71]/20 bg-[#2ecc71]/10 px-2 py-1 text-[0.72rem] font-bold text-[#2ecc71]">
                                                    <i className="fas fa-check"></i> Selesai
                                                </span>
                                            )}
                                        </div>

                                        <div className="mb-2">
                                            <p className="font-semibold text-text-main">{rental.customer.name}</p>
                                            <p className="text-xs text-text-muted">{rental.customer.phone}</p>
                                        </div>

                                        <p className="text-xs text-text-muted">{rental.items.map((item) => `${item.name} (x${item.qty})`).join(', ')}</p>
                                        <p className="mt-2 text-sm font-bold text-text-main">Rp {(rental.finalTotal ?? rental.total ?? 0).toLocaleString()}</p>
                                        {rental.status === 'Returned' && rental.additionalFee > 0 && (
                                            <p className="mt-1 inline-block rounded bg-[#e74c3c]/10 px-2 py-0.5 text-[0.72rem] text-[#e74c3c]">
                                                + Rp {rental.additionalFee.toLocaleString()} (Denda/Extra)
                                            </p>
                                        )}
                                    </article>
                                ))}
                            </div>

                            <table className="hidden w-full min-w-[980px] border-collapse md:table">
                                <thead className="sticky top-0 z-10 bg-sidebar-bg">
                                    <tr>
                                        <th className="border-b border-border p-4 text-left text-[0.8rem] font-semibold uppercase tracking-wider text-text-muted">ID & Tanggal</th>
                                        <th className="border-b border-border p-4 text-left text-[0.8rem] font-semibold uppercase tracking-wider text-text-muted">Pelanggan</th>
                                        <th className="border-b border-border p-4 text-left text-[0.8rem] font-semibold uppercase tracking-wider text-text-muted">Detail Sewa</th>
                                        <th className="border-b border-border p-4 text-left text-[0.8rem] font-semibold uppercase tracking-wider text-text-muted">Status</th>
                                        <th className="border-b border-border p-4 text-right text-[0.8rem] font-semibold uppercase tracking-wider text-text-muted">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...filteredRentals].reverse().map((rental) => (
                                        <tr key={rental.id} className="group transition-colors hover:bg-white/5">
                                            <td className="align-top border-b border-border/50 p-4">
                                                <div className="mb-1 font-mono text-[0.9rem] font-semibold text-text-main">{rental.id}</div>
                                                <div className="text-[0.8rem] text-text-muted">
                                                    {new Date(rental.date).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })}
                                                </div>
                                                <div className="text-[0.75rem] text-text-muted">
                                                    {new Date(rental.date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </td>
                                            <td className="align-top border-b border-border/50 p-4">
                                                <strong className="mb-1 block text-text-main">{rental.customer.name}</strong>
                                                <div className="mb-0.5 flex items-center gap-1.5 text-[0.8rem] text-text-muted">
                                                    <i className="fas fa-phone text-[0.7rem] opacity-70"></i> {rental.customer.phone}
                                                </div>
                                                <div className="flex items-center gap-1.5 text-[0.8rem] text-text-muted">
                                                    <i className="fas fa-id-card text-[0.7rem] opacity-70"></i> {rental.customer.guarantee} ({rental.customer.idNumber})
                                                </div>
                                            </td>
                                            <td className="max-w-[250px] align-top border-b border-border/50 p-4">
                                                <div className="mb-1 text-[0.85rem] font-medium text-text-main">
                                                    {rental.duration} Hari
                                                </div>
                                                <ul className="list-disc pl-4 text-[0.8rem] text-text-muted">
                                                    {rental.items.map((item, idx) => (
                                                        <li key={idx} className="truncate" title={`${item.name} (${item.qty}x)`}>
                                                            {item.name} <span className="font-semibold text-accent">x{item.qty}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </td>
                                            <td className="align-top border-b border-border/50 p-4">
                                                {rental.status === 'Active' ? (
                                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[0.75rem] font-bold text-accent">
                                                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent"></span>
                                                        Aktif
                                                    </span>
                                                ) : (
                                                    <div>
                                                        <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[#2ecc71]/20 bg-[#2ecc71]/10 px-2.5 py-1 text-[0.75rem] font-bold text-[#2ecc71]">
                                                            <i className="fas fa-check"></i> Selesai
                                                        </span>
                                                        {rental.returnDate && (
                                                            <div className="text-[0.7rem] text-text-muted">
                                                                Dikembalikan: <br />{new Date(rental.returnDate).toLocaleDateString('id-ID')}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="align-top border-b border-border/50 p-4 text-right">
                                                <div className="mb-1 text-[1.05rem] font-bold text-text-main">
                                                    Rp {(rental.finalTotal ?? rental.total ?? 0).toLocaleString()}
                                                </div>

                                                {rental.status === 'Returned' && rental.additionalFee > 0 && (
                                                    <div className="inline-block rounded bg-[#e74c3c]/10 px-2 py-0.5 text-[0.75rem] text-[#e74c3c]">
                                                        + Rp {rental.additionalFee.toLocaleString()} (Denda/Extra)
                                                    </div>
                                                )}

                                                {rental.status === 'Returned' && rental.returnNotes && (
                                                    <div className="mt-2 line-clamp-2 rounded bg-bg-main p-1.5 text-left text-[0.75rem] italic text-text-muted" title={rental.returnNotes}>
                                                        "{rental.returnNotes}"
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default History;

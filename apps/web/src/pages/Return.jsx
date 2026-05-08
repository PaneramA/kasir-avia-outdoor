import React, { useState } from 'react';

const Return = ({ rentals, onProcessReturn }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRental, setSelectedRental] = useState(null);
    const [returnNotes, setReturnNotes] = useState('');
    const [additionalFee, setAdditionalFee] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const activeRentals = rentals.filter(r => r.status === 'Active');

    const filteredRentals = activeRentals.filter(r =>
        r.customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.id.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSelectRental = (rental) => {
        setSelectedRental(rental);
        setReturnNotes('');
        setAdditionalFee(0);
    };

    const processRentalReturn = async () => {
        if (!selectedRental) return;

        if (!window.confirm(`Proses pengembalian untuk transaksi ${selectedRental.id} atas nama ${selectedRental.customer.name}?`)) {
            return;
        }

        try {
            setIsSubmitting(true);
            await onProcessReturn({
                rentalId: selectedRental.id,
                additionalFee: Number(additionalFee),
                returnNotes,
            });

            alert('Pengembalian berhasil diproses! Stok barang telah kembali.');
            setSelectedRental(null);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal memproses pengembalian.';
            alert(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col gap-6 py-4 lg:flex-row lg:gap-[30px] lg:py-5">
            <div className="flex flex-1 flex-col">
                <div className="mb-5">
                    <h3 className="mb-2 text-[1.1rem] font-bold text-text-main sm:text-[1.2rem]">Daftar Penyewaan Aktif</h3>
                    <p className="mb-4 text-[0.9rem] text-text-muted">Pilih transaksi yang akan diproses pengembaliannya.</p>

                    <div className="relative">
                        <i className="fas fa-search absolute left-4 top-1/2 transform -translate-y-1/2 text-text-muted"></i>
                        <input
                            type="text"
                            className="w-full rounded-lg border border-border bg-sidebar-bg py-3 pl-11 pr-4 text-text-main outline-none focus:border-accent"
                            placeholder="Cari nama pelanggan atau ID Transaksi..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto pr-1 sm:pr-2">
                    {filteredRentals.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border bg-sidebar-bg/30 py-10 text-center text-text-muted">
                            Tidak ada data penyewaan aktif yang ditemukan.
                        </div>
                    ) : (
                        filteredRentals.map(rental => (
                            <div
                                key={rental.id}
                                className={`cursor-pointer rounded-lg border bg-card-bg p-4 transition-all hover:border-accent ${selectedRental?.id === rental.id ? 'border-accent bg-accent/5' : 'border-border'}`}
                                onClick={() => handleSelectRental(rental)}
                            >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="mb-1 flex flex-wrap items-center gap-2 sm:gap-3">
                                            <h4 className="font-bold text-text-main">{rental.customer.name}</h4>
                                            <span className="rounded border border-border bg-sidebar-bg px-2 py-0.5 text-xs text-text-muted">{rental.id}</span>
                                        </div>
                                        <div className="text-[0.85rem] text-text-muted">
                                            {rental.items.length} Barang &bull; {rental.duration} Hari
                                        </div>
                                        <div className="mt-1 text-[0.8rem] text-text-muted sm:max-w-[400px]">
                                            {rental.items.map(i => `${i.name} (${i.qty})`).join(', ')}
                                        </div>
                                    </div>
                                    <div className="text-left sm:text-right">
                                        <div className="mb-1 font-bold text-accent">Rp {rental.total.toLocaleString()}</div>
                                        <div className="text-[0.75rem] text-text-muted">
                                            {new Date(rental.date).toLocaleDateString('id-ID')}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="w-full lg:w-[450px]">
                <div className="custom-scrollbar flex max-h-full flex-col overflow-y-auto rounded-lg border border-border bg-sidebar-bg p-4 sm:p-6 lg:sticky lg:top-5 lg:max-h-[calc(100vh-2.5rem)]">
                    <h4 className="mb-4 border-b border-border pb-2 text-[1rem] font-bold uppercase tracking-wide text-accent sm:text-[1.1rem]">
                        Proses Pengembalian
                    </h4>

                    {!selectedRental ? (
                        <div className="flex flex-1 flex-col items-center justify-center py-10 text-text-muted opacity-50">
                            <i className="fas fa-hand-holding-box mb-4 text-[3rem]"></i>
                            <p className="text-center text-sm">Pilih transaksi di sebelah kiri<br />untuk memproses pengembalian.</p>
                        </div>
                    ) : (
                        <div className="flex flex-1 flex-col space-y-5">
                            <div className="rounded-lg border border-border bg-bg-main p-4">
                                <div className="mb-2 flex justify-between gap-3">
                                    <span className="text-[0.85rem] text-text-muted">ID Transaksi</span>
                                    <span className="font-mono text-[0.85rem] text-text-main">{selectedRental.id}</span>
                                </div>
                                <div className="mb-2 flex justify-between gap-3">
                                    <span className="text-[0.85rem] text-text-muted">Pelanggan</span>
                                    <span className="text-right font-semibold text-text-main">{selectedRental.customer.name}</span>
                                </div>
                                <div className="mb-2 flex justify-between gap-3">
                                    <span className="text-[0.85rem] text-text-muted">No. HP</span>
                                    <span className="text-right text-[0.85rem] text-text-main">{selectedRental.customer.phone}</span>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <span className="text-[0.85rem] text-text-muted">Durasi Sewa</span>
                                    <span className="text-right text-[0.85rem] text-text-main">{selectedRental.duration} Hari</span>
                                </div>
                            </div>

                            <div>
                                <h5 className="mb-3 text-[0.9rem] font-bold text-text-main">Barang yang Dikembalikan</h5>
                                <div className="max-h-[200px] space-y-2 overflow-y-auto pr-1 sm:pr-2">
                                    {selectedRental.items.map((item, idx) => (
                                        <div key={idx} className="flex items-start justify-between gap-2 rounded border border-white/5 bg-bg-main/50 p-3">
                                            <div className="flex min-w-0 flex-col">
                                                <span className="text-[0.9rem] text-text-main">{item.name}</span>
                                                {item.notes && <span className="mt-0.5 text-[0.75rem] italic text-text-muted"><i className="fas fa-info-circle mr-1"></i>{item.notes}</span>}
                                            </div>
                                            <span className="shrink-0 rounded border border-border bg-sidebar-bg px-2 py-1 text-[0.85rem] font-bold">
                                                Qty: {item.qty}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="my-2 h-[1px] bg-border"></div>

                            <div className="space-y-4">
                                <div>
                                    <label className="mb-1.5 block text-[0.85rem] text-text-muted">Biaya Tambahan / Denda (Opsional)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[0.9rem] font-bold text-text-muted">Rp</span>
                                        <input
                                            type="number"
                                            className="w-full rounded-lg border border-border bg-bg-main p-2.5 pl-10 text-text-main outline-none focus:border-accent"
                                            placeholder="0"
                                            value={additionalFee}
                                            onChange={(e) => setAdditionalFee(e.target.value)}
                                            min="0"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-[0.85rem] text-text-muted">Catatan Pengembalian (Opsional)</label>
                                    <textarea
                                        className="min-h-[90px] w-full resize-none rounded-lg border border-border bg-bg-main p-2.5 text-[0.85rem] text-text-main outline-none focus:border-accent"
                                        placeholder="Catat kondisi barang kembali (kotor, rusak, dll)..."
                                        value={returnNotes}
                                        onChange={(e) => setReturnNotes(e.target.value)}
                                    ></textarea>
                                </div>
                            </div>

                            <div className="mt-auto border-t border-border pt-4">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <span className="text-[0.9rem] text-text-muted sm:text-[0.95rem]">Total Pembayaran Akhir</span>
                                    <span className="text-[1.2rem] font-bold text-accent sm:text-[1.4rem]">
                                        Rp {(selectedRental.total + Number(additionalFee)).toLocaleString()}
                                    </span>
                                </div>
                                <button
                                    disabled={isSubmitting}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#2ecc71] py-3.5 font-bold text-white transition-all shadow-[0_4px_15px_rgba(46,204,113,0.3)] hover:bg-[#27ae60] disabled:opacity-60"
                                    onClick={processRentalReturn}
                                >
                                    <i className="fas fa-check-circle"></i> {isSubmitting ? 'Memproses...' : 'Selesaikan Pengembalian'}
                                </button>
                                <button
                                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-transparent py-2.5 font-semibold text-text-muted transition hover:bg-white/5 hover:text-text-main"
                                    onClick={() => setSelectedRental(null)}
                                >
                                    Batal
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Return;

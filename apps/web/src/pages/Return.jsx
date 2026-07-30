import React, { useMemo, useState } from 'react';
import { formatJakartaDateLabel, getCurrentJakartaDateKey, toJakartaDateKey } from '../lib/financial';
import { formatLateDuration, getDailyRate, getLateDurationMs, getPlannedReturnDate } from '../lib/rentalTime';

const formatCurrency = (value) => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;

const RETURN_STATUS_FILTERS = [
    { value: 'all', label: 'Semua' },
    { value: 'overdue', label: 'Terlambat' },
    { value: 'dueToday', label: 'Hari Ini' },
    { value: 'upcoming', label: 'Akan Datang' },
    { value: 'unpaid', label: 'Belum Lunas' },
];

const getPaymentInfo = (rental) => {
    const status = String(rental?.payment?.status || 'LUNAS').toUpperCase();
    const paidAmount = Number(rental?.payment?.paidAmount ?? rental?.total ?? 0) || 0;
    const totalDue = Number(rental?.payment?.totalDue ?? rental?.total ?? 0) || 0;
    const remainingAmount = Number(rental?.payment?.remainingAmount ?? Math.max(0, totalDue - paidAmount)) || 0;

    return {
        status,
        paidAmount,
        totalDue,
        remainingAmount,
        isUnpaid: remainingAmount > 0,
    };
};

const getIdentityCardHoldLabel = (rental) => (
    rental?.customer?.identityCardHeld === false ? 'Kartu tidak ditahan' : 'Kartu ditahan'
);

const renderIdentityCardHoldBadge = (rental) => (
    <span className="inline-flex items-center rounded-md border border-[#f59e0b] bg-[#fef3c7] px-2 py-0.5 text-xs font-semibold text-[#92400e]">
        {getIdentityCardHoldLabel(rental)}
    </span>
);

const Return = ({ rentals, onProcessReturn }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [selectedRental, setSelectedRental] = useState(null);
    const [returnNotes, setReturnNotes] = useState('');
    const [additionalFeeInput, setAdditionalFeeInput] = useState('0');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [applyLateFee, setApplyLateFee] = useState(false);
    const [settleRemainingPayment, setSettleRemainingPayment] = useState(false);
    const additionalFeeValue = Number.isFinite(Number(additionalFeeInput))
        ? Math.max(0, Number(additionalFeeInput))
        : 0;
    const todayDateKey = getCurrentJakartaDateKey();

    const activeRentals = rentals.filter((r) => r.status === 'Active');

    const rentalDueMetaById = useMemo(() => {
        const map = new Map();
        activeRentals.forEach((rental) => {
            const dueDate = getPlannedReturnDate(rental);
            const dueDateKey = toJakartaDateKey(dueDate);
            let dueStatus = 'unknown';
            if (dueDateKey) {
                if (dueDateKey < todayDateKey) {
                    dueStatus = 'overdue';
                } else if (dueDateKey === todayDateKey) {
                    dueStatus = 'dueToday';
                } else {
                    dueStatus = 'upcoming';
                }
            }

            map.set(rental.id, {
                dueDate,
                dueDateKey,
                dueStatus,
            });
        });

        return map;
    }, [activeRentals, todayDateKey]);

    const filteredRentals = useMemo(() => {
        const keyword = searchQuery.trim().toLowerCase();

        return activeRentals
            .filter((rental) => {
                const payment = getPaymentInfo(rental);
                const dueStatus = rentalDueMetaById.get(rental.id)?.dueStatus || 'unknown';
                const rentalItems = Array.isArray(rental.items) ? rental.items : [];
                const itemNames = rentalItems
                    .map((item) => String(item?.name || '').toLowerCase())
                    .join(' ');
                const searchableText = [
                    rental.customer?.name,
                    rental.customer?.phone,
                    rental.id,
                    itemNames,
                ].map((value) => String(value || '').toLowerCase()).join(' ');

                const matchesKeyword = !keyword || searchableText.includes(keyword);
                const matchesFilter = statusFilter === 'all'
                    || (statusFilter === 'unpaid' && payment.isUnpaid)
                    || (statusFilter !== 'unpaid' && dueStatus === statusFilter);

                return matchesKeyword && matchesFilter;
            })
            .sort((a, b) => {
            const aMeta = rentalDueMetaById.get(a.id);
            const bMeta = rentalDueMetaById.get(b.id);
            const priorityRank = {
                overdue: 0,
                dueToday: 1,
                upcoming: 2,
                unknown: 3,
            };

            const priorityDiff = (priorityRank[aMeta?.dueStatus || 'unknown'] ?? 99)
                - (priorityRank[bMeta?.dueStatus || 'unknown'] ?? 99);
            if (priorityDiff !== 0) {
                return priorityDiff;
            }

            const aDueKey = aMeta?.dueDateKey || '9999-99-99';
            const bDueKey = bMeta?.dueDateKey || '9999-99-99';
            if (aDueKey !== bDueKey) {
                return aDueKey.localeCompare(bDueKey);
            }

            return new Date(a.date).getTime() - new Date(b.date).getTime();
        });
    }, [activeRentals, rentalDueMetaById, searchQuery, statusFilter]);

    const overdueCount = useMemo(
        () => filteredRentals.filter((rental) => rentalDueMetaById.get(rental.id)?.dueStatus === 'overdue').length,
        [filteredRentals, rentalDueMetaById],
    );
    const dueTodayCount = useMemo(
        () => filteredRentals.filter((rental) => rentalDueMetaById.get(rental.id)?.dueStatus === 'dueToday').length,
        [filteredRentals, rentalDueMetaById],
    );

    const selectedPayment = useMemo(
        () => getPaymentInfo(selectedRental),
        [selectedRental],
    );
    const selectedRentalItems = useMemo(
        () => (Array.isArray(selectedRental?.items) ? selectedRental.items : []),
        [selectedRental],
    );
    const selectedLateMs = useMemo(
        () => getLateDurationMs(selectedRental),
        [selectedRental],
    );
    const isLate = selectedLateMs > 0;
    const lateDurationLabel = formatLateDuration(selectedLateMs);
    const selectedDailyRate = useMemo(
        () => getDailyRate(selectedRental),
        [selectedRental],
    );

    const handleSelectRental = (rental) => {
        const payment = getPaymentInfo(rental);
        const lateMs = getLateDurationMs(rental);
        const shouldApplyLateFee = lateMs > 0;
        const defaultLateFee = shouldApplyLateFee ? getDailyRate(rental) : 0;

        setSelectedRental(rental);
        setReturnNotes('');
        setApplyLateFee(shouldApplyLateFee);
        setAdditionalFeeInput(String(defaultLateFee));
        setSettleRemainingPayment(!payment.isUnpaid);
    };

    const handleToggleLateFee = (checked) => {
        setApplyLateFee(checked);
        if (!checked) {
            setAdditionalFeeInput('0');
            return;
        }

        if (selectedDailyRate > 0) {
            setAdditionalFeeInput(String(selectedDailyRate));
        }
    };

    const processRentalReturn = async () => {
        if (!selectedRental) return;

        if (selectedPayment.isUnpaid && !settleRemainingPayment) {
            alert(`Transaksi ini masih punya sisa pembayaran ${formatCurrency(selectedPayment.remainingAmount)}. Pilih opsi lunas terlebih dulu.`);
            return;
        }

        const confirmLines = [
            `Proses pengembalian untuk transaksi ${selectedRental.id} atas nama ${selectedRental.customer.name}?`,
        ];

        if (selectedPayment.isUnpaid) {
            confirmLines.push(`Sisa pembayaran yang wajib dilunasi: ${formatCurrency(selectedPayment.remainingAmount + additionalFeeValue)}.`);
            confirmLines.push('Apakah customer sudah melunasi sisa pembayarannya?');
        }

        if (!window.confirm(confirmLines.join('\n'))) {
            return;
        }

        try {
            setIsSubmitting(true);
            await onProcessReturn({
                rentalId: selectedRental.id,
                additionalFee: additionalFeeValue,
                returnNotes,
                settleRemainingPayment,
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
        <div data-testid="return-page-shell" className="flex min-h-0 flex-col gap-4 pb-4 lg:h-[calc(100vh-8rem)] lg:overflow-hidden">
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
                <section data-testid="return-list-panel" className="flex min-h-0 flex-col rounded-md border border-border bg-white">
                    <div className="border-b border-border bg-white p-3 sm:p-4">
                        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <h3 className="text-[1rem] font-bold text-text-main sm:text-[1.1rem]">Daftar Penyewaan Aktif</h3>
                                <p className="mt-1 text-[0.85rem] text-text-muted">Urut dari jatuh tempo paling mendesak.</p>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs text-text-muted">
                                {overdueCount > 0 && (
                                    <span className="border border-[#dc2626] bg-white px-2 py-1 font-semibold text-[#991b1b]">
                                        Terlambat {overdueCount}
                                    </span>
                                )}
                                {dueTodayCount > 0 && (
                                    <span className="border border-accent bg-white px-2 py-1 font-semibold text-accent">
                                        Hari ini {dueTodayCount}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_190px]">
                            <div className="relative">
                                <i className="fas fa-search absolute left-4 top-1/2 transform -translate-y-1/2 text-text-muted"></i>
                                <input
                                    type="text"
                                    className="w-full rounded-md border border-border bg-white py-3 pl-11 pr-4 text-text-main outline-none focus:border-accent"
                                    placeholder="Cari customer, nomor HP, ID, atau barang..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <label className="sr-only" htmlFor="return-status-filter">Filter status pengembalian</label>
                            <select
                                id="return-status-filter"
                                aria-label="Filter status pengembalian"
                                className="w-full rounded-md border border-border bg-white px-3 py-3 text-text-main outline-none focus:border-accent"
                                value={statusFilter}
                                onChange={(event) => setStatusFilter(event.target.value)}
                            >
                                {RETURN_STATUS_FILTERS.map((filter) => (
                                    <option key={filter.value} value={filter.value}>{filter.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div data-testid="return-list-scroll" className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto p-3 sm:p-4">
                        {filteredRentals.length === 0 ? (
                            <div className="rounded-md border border-dashed border-border bg-white py-10 text-center text-text-muted">
                                Tidak ada data penyewaan aktif yang ditemukan.
                            </div>
                        ) : (
                            filteredRentals.map((rental) => {
                                const payment = getPaymentInfo(rental);
                                const dueMeta = rentalDueMetaById.get(rental.id);
                                const dueStatus = dueMeta?.dueStatus || 'unknown';
                                const rentalItems = Array.isArray(rental.items) ? rental.items : [];
                                return (
                                    <button
                                        key={rental.id}
                                        type="button"
                                        className={`block w-full rounded-md border bg-white p-3 text-left transition-colors hover:border-accent ${selectedRental?.id === rental.id ? 'border-accent bg-surface-hover' : 'border-border'}`}
                                        onClick={() => handleSelectRental(rental)}
                                    >
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                            <div className="min-w-0">
                                                <div className="mb-1 flex flex-wrap items-center gap-2" data-testid={`return-rental-heading-${rental.id}`}>
                                                    <h4 className="font-bold text-text-main">{rental.customer.name}</h4>
                                                    {renderIdentityCardHoldBadge(rental)}
                                                    <span className="border border-border bg-white px-2 py-0.5 text-xs text-text-muted">{rental.id}</span>
                                                    {dueStatus === 'overdue' && (
                                                        <span className="border border-[#dc2626] bg-[#fee2e2] px-2 py-0.5 text-xs font-semibold text-[#991b1b]">
                                                            Terlambat
                                                        </span>
                                                    )}
                                                    {dueStatus === 'dueToday' && (
                                                        <span className="border border-accent bg-accent px-2 py-0.5 text-xs font-semibold text-white">
                                                            Hari Ini
                                                        </span>
                                                    )}
                                                    {dueStatus === 'upcoming' && (
                                                        <span className="border border-border bg-white px-2 py-0.5 text-xs font-semibold text-text-muted">
                                                            Akan Datang
                                                        </span>
                                                    )}
                                                    {payment.isUnpaid && (
                                                        <span className="border border-accent bg-white px-2 py-0.5 text-xs font-semibold text-accent">
                                                            Belum Lunas
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-[0.8rem] text-text-muted">
                                                    {rental.customer.phone || '-'} &bull; {rentalItems.length} Barang &bull; {rental.duration} Hari
                                                </div>
                                                <div className="mt-1 truncate text-[0.8rem] text-text-muted">
                                                    {rentalItems.map((i) => `${i.name} (${i.qty})`).join(', ') || 'Tidak ada rincian barang'}
                                                </div>
                                                <div className="mt-1 text-[0.78rem] text-text-muted">
                                                    Jatuh tempo: {dueMeta?.dueDate ? formatJakartaDateLabel(dueMeta.dueDate, true) : '-'}
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-left sm:text-right">
                                                <div className="font-bold text-accent">{formatCurrency(rental.total)}</div>
                                                {payment.isUnpaid && (
                                                    <div className="mt-1 text-[0.75rem] text-text-muted">
                                                        Sisa {formatCurrency(payment.remainingAmount)}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </section>

                <aside data-testid="return-detail-panel" className="flex min-h-0 flex-col rounded-md border border-border bg-white">
                    <div data-testid="return-detail-scroll" className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                        <h4 className="mb-4 border-b border-border pb-2 text-[1rem] font-bold uppercase tracking-wide text-accent sm:text-[1.05rem]">
                            Detail Pengembalian
                        </h4>

                        {!selectedRental ? (
                            <div className="flex min-h-[260px] flex-col items-center justify-center text-text-muted">
                                <i className="fas fa-hand-holding-box mb-3 text-[2.4rem]"></i>
                                <p className="text-center text-sm">Pilih transaksi di sebelah kiri untuk memproses pengembalian.</p>
                            </div>
                        ) : (
                            <div className="space-y-5">
                                {selectedPayment.isUnpaid && (
                                    <div className="rounded-md border border-accent bg-white p-3 text-sm text-text-main">
                                        Customer ini belum lunas. Sisa pembayaran saat ini: <strong>{formatCurrency(selectedPayment.remainingAmount + additionalFeeValue)}</strong>
                                    </div>
                                )}

                                <div className="rounded-md border border-border bg-bg-main p-4">
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
                                    <div className="mb-2 flex justify-between gap-3">
                                        <span className="text-[0.85rem] text-text-muted">Rencana Kembali</span>
                                        <span className="text-right text-[0.85rem] text-text-main">
                                            {getPlannedReturnDate(selectedRental)?.toLocaleString('id-ID') || '-'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                        <span className="text-[0.85rem] text-text-muted">Durasi Sewa</span>
                                        <span className="text-right text-[0.85rem] text-text-main">{selectedRental.duration} Hari</span>
                                    </div>
                                </div>

                                <div>
                                    <h5 className="mb-3 text-[0.9rem] font-bold text-text-main">Barang yang Dikembalikan</h5>
                                    <div className="max-h-[200px] space-y-2 overflow-y-auto pr-1 sm:pr-2">
                                        {selectedRentalItems.map((item, idx) => (
                                            <div key={idx} className="flex items-start justify-between gap-2 rounded-md border border-border bg-bg-main p-3">
                                                <div className="flex min-w-0 flex-col">
                                                    <span className="text-[0.9rem] text-text-main">{item.name}</span>
                                                    {item.notes && <span className="mt-0.5 text-[0.75rem] italic text-text-muted"><i className="fas fa-info-circle mr-1"></i>{item.notes}</span>}
                                                </div>
                                                <span className="shrink-0 border border-border bg-white px-2 py-1 text-[0.85rem] font-bold">
                                                    Qty: {item.qty}
                                                </span>
                                            </div>
                                        ))}
                                        {selectedRentalItems.length === 0 && (
                                            <div className="rounded-md border border-dashed border-border bg-bg-main p-3 text-sm text-text-muted">
                                                Tidak ada rincian barang.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-4 border-t border-border pt-4">
                                    {isLate && (
                                        <div className="rounded-md border border-accent bg-white p-3 text-sm text-text-main">
                                            Terlambat <strong>{lateDurationLabel}</strong>. Default denda 1 hari: <strong>{formatCurrency(selectedDailyRate)}</strong>
                                        </div>
                                    )}

                                    <div>
                                        <label className="mb-2 flex items-start gap-2 text-[0.85rem] text-text-muted">
                                            <input
                                                type="checkbox"
                                                className="mt-0.5 accent-accent"
                                                checked={applyLateFee}
                                                onChange={(event) => handleToggleLateFee(event.target.checked)}
                                                disabled={!isLate}
                                            />
                                            Terapkan denda keterlambatan 1 hari (bisa diubah manual di kolom nominal)
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[0.9rem] font-bold text-text-muted">Rp</span>
                                            <input
                                                type="number"
                                                className="w-full rounded-md border border-border bg-white p-2.5 pl-10 text-text-main outline-none focus:border-accent"
                                                placeholder="0"
                                                value={additionalFeeInput}
                                                onChange={(e) => setAdditionalFeeInput(e.target.value)}
                                                min="0"
                                            />
                                        </div>
                                    </div>

                                    {selectedPayment.isUnpaid && (
                                        <label className="flex items-start gap-2 rounded-md border border-accent bg-white p-3 text-[0.85rem] text-text-main">
                                            <input
                                                type="checkbox"
                                                className="mt-0.5 accent-accent"
                                                checked={settleRemainingPayment}
                                                onChange={(event) => setSettleRemainingPayment(event.target.checked)}
                                            />
                                            <span>
                                                Saya konfirmasi customer sudah melunasi sisa pembayaran sebesar <strong>{formatCurrency(selectedPayment.remainingAmount + additionalFeeValue)}</strong>.
                                            </span>
                                        </label>
                                    )}

                                    <div>
                                        <label className="mb-1.5 block text-[0.85rem] text-text-muted">Catatan Pengembalian (Opsional)</label>
                                        <textarea
                                            className="min-h-[90px] w-full resize-none rounded-md border border-border bg-white p-2.5 text-[0.85rem] text-text-main outline-none focus:border-accent"
                                            placeholder="Catat kondisi barang kembali (kotor, rusak, dll)..."
                                            value={returnNotes}
                                            onChange={(e) => setReturnNotes(e.target.value)}
                                        ></textarea>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {selectedRental && (
                        <div data-testid="return-detail-actions" className="border-t border-border bg-white p-4">
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <span className="text-[0.9rem] text-text-muted sm:text-[0.95rem]">Total Pembayaran Akhir</span>
                                <span className="text-[1.2rem] font-bold text-accent sm:text-[1.4rem]">
                                    {formatCurrency(selectedRental.total + additionalFeeValue)}
                                </span>
                            </div>
                            <button
                                disabled={isSubmitting}
                                className="flex w-full items-center justify-center gap-2 rounded-md bg-accent py-3.5 font-bold text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
                                onClick={processRentalReturn}
                            >
                                <i className="fas fa-check-circle"></i> {isSubmitting ? 'Memproses...' : 'Selesaikan Pengembalian'}
                            </button>
                            <button
                                className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-border bg-white py-2.5 font-semibold text-text-muted transition-colors hover:bg-surface-hover hover:text-text-main"
                                onClick={() => setSelectedRental(null)}
                            >
                                Batal
                            </button>
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
};

export default Return;

import React, { useEffect, useMemo, useState } from 'react';
import useSWRInfinite from 'swr/infinite';
import ReceiptModal from '../components/ReceiptModal';
import { openReceiptWhatsApp, printReceipt } from '../lib/receipt';
import { formatCurrency, getCurrentMonthRangeDateKeys } from '../lib/financial';
import { compareRentalsByClosestReturnDate, getRentalReturnTimelineDate } from '../lib/rentalTime';
import { fetchRentalHistoryPage } from '../lib/api';
import { APP_CACHE_KEYS } from '../lib/appCache';

function formatReturnTimelineLabel(rental) {
    const returnDate = getRentalReturnTimelineDate(rental);
    if (!returnDate) {
        return '-';
    }

    return returnDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatPaymentSummary(rental) {
    const status = String(rental?.payment?.status || 'LUNAS').toUpperCase();
    const method = String(rental?.payment?.method || 'TUNAI').toUpperCase();
    const paidAmount = Number(rental?.payment?.paidAmount ?? rental?.total ?? 0) || 0;
    const remainingAmount = Number(rental?.payment?.remainingAmount ?? 0) || 0;
    return { status, method, paidAmount, remainingAmount };
}

const History = ({
    currentUser,
    tenantId,
    branchId,
    onVerifyRentalDelete,
    onDeleteRentalByAdmin,
}) => {
    const currentMonthRange = useMemo(() => getCurrentMonthRangeDateKeys(), []);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [startDate, setStartDate] = useState(currentMonthRange.startDate);
    const [endDate, setEndDate] = useState(currentMonthRange.endDate);
    const [selectedRental, setSelectedRental] = useState(null);
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteReason, setDeleteReason] = useState('');
    const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
    const [isPasswordVerified, setIsPasswordVerified] = useState(false);
    const [isVerifyingDelete, setIsVerifyingDelete] = useState(false);
    const [isDeletingRental, setIsDeletingRental] = useState(false);
    const [deleteErrorMessage, setDeleteErrorMessage] = useState('');
    const [deleteSuccessMessage, setDeleteSuccessMessage] = useState('');
    const [receiptRental, setReceiptRental] = useState(null);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setDebouncedSearchQuery(searchQuery.trim());
        }, 300);

        return () => window.clearTimeout(timeoutId);
    }, [searchQuery]);

    const historyFilters = useMemo(() => ({
        status: statusFilter === 'All' ? '' : statusFilter,
        query: debouncedSearchQuery,
        startDate,
        endDate,
    }), [debouncedSearchQuery, endDate, startDate, statusFilter]);
    const {
        data: rentalPages = [],
        error: historyError,
        isLoading: isHistoryLoading,
        isValidating: isHistoryValidating,
        mutate: mutateHistory,
        setSize,
    } = useSWRInfinite(
        (pageIndex, previousPageData) => {
            if (!currentUser?.id || !tenantId || !branchId) {
                return null;
            }

            if (pageIndex > 0 && !previousPageData?.nextCursor) {
                return null;
            }

            return APP_CACHE_KEYS.rentalHistory(
                currentUser.id,
                tenantId,
                branchId,
                historyFilters,
                pageIndex === 0 ? '' : previousPageData.nextCursor,
            );
        },
        ([, , , , filters, cursor]) => fetchRentalHistoryPage({ ...filters, cursor }),
        { keepPreviousData: true },
    );

    useEffect(() => {
        void setSize(1);
    }, [historyFilters, setSize]);

    const rentals = useMemo(
        () => rentalPages.flatMap((page) => (Array.isArray(page?.items) ? page.items : [])),
        [rentalPages],
    );
    const historySummary = rentalPages[0]?.summary || {
        totalTransactions: 0,
        activeTransactions: 0,
        returnedTransactions: 0,
        totalRevenue: 0,
    };
    const hasMoreHistory = Boolean(rentalPages.at(-1)?.nextCursor);
    const isLoadingMoreHistory = isHistoryValidating && rentalPages.length > 0;

    const isAdmin = useMemo(() => {
        const role = String(currentUser?.role || '').trim().toLowerCase();
        return role === 'admin' || role === 'superuser';
    }, [currentUser?.role]);

    const closeDeleteModal = () => {
        setSelectedRental(null);
        setDeletePassword('');
        setDeleteReason('');
        setDeleteConfirmationText('');
        setIsPasswordVerified(false);
        setIsVerifyingDelete(false);
        setIsDeletingRental(false);
        setDeleteErrorMessage('');
    };

    const openDeleteModal = (rental) => {
        setDeleteSuccessMessage('');
        setDeleteErrorMessage('');
        setSelectedRental(rental);
        setDeletePassword('');
        setDeleteReason('');
        setDeleteConfirmationText('');
        setIsPasswordVerified(false);
    };

    const handleVerifyDeletePassword = async () => {
        if (!selectedRental) {
            return;
        }

        if (!deletePassword.trim()) {
            setDeleteErrorMessage('Masukkan password akun admin terlebih dahulu.');
            return;
        }

        try {
            setIsVerifyingDelete(true);
            setDeleteErrorMessage('');
            await onVerifyRentalDelete(selectedRental.id, deletePassword);
            setIsPasswordVerified(true);
            setDeletePassword('');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Verifikasi password gagal.';
            setDeleteErrorMessage(message);
        } finally {
            setIsVerifyingDelete(false);
        }
    };

    const handleDeleteRental = async () => {
        if (!selectedRental) {
            return;
        }

        if (!deleteReason.trim()) {
            setDeleteErrorMessage('Alasan penghapusan wajib diisi.');
            return;
        }

        if (!deleteConfirmationText.trim()) {
            setDeleteErrorMessage(`Ketik HAPUS ${selectedRental.id} untuk melanjutkan.`);
            return;
        }

        if (!window.confirm(`Apakah kamu yakin ingin menghapus riwayat transaksi ${selectedRental.id}?`)) {
            return;
        }

        try {
            setIsDeletingRental(true);
            setDeleteErrorMessage('');
            await onDeleteRentalByAdmin(selectedRental.id, {
                reason: deleteReason.trim(),
                confirmationText: deleteConfirmationText.trim(),
            });
            await mutateHistory();
            setDeleteSuccessMessage(`Transaksi ${selectedRental.id} berhasil dihapus.`);
            closeDeleteModal();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal menghapus transaksi.';
            setDeleteErrorMessage(message);
        } finally {
            setIsDeletingRental(false);
        }
    };

    const openReceiptModal = (rental) => {
        setReceiptRental(rental);
    };

    const closeReceiptModal = () => {
        setReceiptRental(null);
    };

    const handlePrintReceipt = (paperWidthMm = 80) => {
        if (!receiptRental) {
            return;
        }

        try {
            printReceipt(receiptRental, {
                cashierName: currentUser?.name || currentUser?.username || '',
                paperWidthMm,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal mencetak receipt.';
            alert(message);
        }
    };

    const handleShareReceiptWhatsApp = () => {
        if (!receiptRental) {
            return;
        }

        try {
            openReceiptWhatsApp(receiptRental, {
                cashierName: currentUser?.name || currentUser?.username || '',
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal membagikan receipt ke WhatsApp.';
            alert(message);
        }
    };

    const sortedFilteredRentals = [...rentals].sort((a, b) => compareRentalsByClosestReturnDate(a, b));
    const totalTransactions = historySummary.totalTransactions;
    const activeTransactions = historySummary.activeTransactions;
    const returnedTransactions = historySummary.returnedTransactions;
    const totalRevenue = historySummary.totalRevenue;

    return (
        <div className="flex h-full flex-col pt-0 pb-4 sm:pb-5">
            {deleteSuccessMessage && (
                <div className="mb-4 rounded-lg border border-[#2ecc71]/40 bg-[#2ecc71]/10 p-3 text-sm text-[#6ee7a8]">
                    {deleteSuccessMessage}
                </div>
            )}

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
                        <span className="block text-[0.7rem] uppercase font-bold text-text-muted mb-0.5">Pendapatan Periode</span>
                        <span className="font-bold text-accent">{formatCurrency(totalRevenue)}</span>
                    </div>
                </div>
                </div>
            </div>

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
                            onClick={() => {
                                setStartDate(currentMonthRange.startDate);
                                setEndDate(currentMonthRange.endDate);
                            }}
                        >
                            Reset ke Bulan Ini
                        </button>
                    )}
                </div>
            </div>

            <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-sidebar-bg/50">
                <div className="custom-scrollbar flex-1 overflow-x-auto">
                    {isHistoryLoading ? (
                        <div className="h-full py-12 text-center text-text-muted">Memuat riwayat transaksi...</div>
                    ) : sortedFilteredRentals.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-text-muted py-12">
                            <i className="fas fa-folder-open text-[3rem] mb-4 opacity-30"></i>
                            <p>Tidak ada transaksi yang sesuai dengan pencarian Anda.</p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-3 p-3 sm:p-4 md:hidden">
                                {sortedFilteredRentals.map((rental) => {
                                    const payment = formatPaymentSummary(rental);
                                    return (
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
                                        <p className="mt-1 text-[0.72rem] text-text-muted">
                                            {payment.status} • {payment.method} • Terbayar Rp {payment.paidAmount.toLocaleString()} • Sisa Rp {payment.remainingAmount.toLocaleString()}
                                        </p>
                                        <p className="mt-1 text-[0.72rem] text-text-muted">
                                            {rental.status === 'Active' ? 'Rencana kembali' : 'Tanggal kembali'}: {formatReturnTimelineLabel(rental)}
                                        </p>
                                        {rental.status === 'Returned' && rental.additionalFee > 0 && (
                                            <p className="mt-1 inline-block rounded bg-[#e74c3c]/10 px-2 py-0.5 text-[0.72rem] text-[#e74c3c]">
                                                + Rp {rental.additionalFee.toLocaleString()} (Denda/Extra)
                                            </p>
                                        )}

                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-2 rounded border border-accent/40 bg-accent/10 px-3 py-1.5 text-[0.75rem] font-semibold text-accent hover:bg-accent/20"
                                                onClick={() => openReceiptModal(rental)}
                                            >
                                                <i className="fas fa-receipt"></i> Receipt
                                            </button>
                                            {isAdmin && (
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center gap-2 rounded border border-[#b91c1c] bg-[#dc2626] px-3 py-1.5 text-[0.75rem] font-semibold text-white hover:bg-[#b91c1c]"
                                                    onClick={() => openDeleteModal(rental)}
                                                >
                                                    <i className="fas fa-trash"></i> Hapus Riwayat
                                                </button>
                                            )}
                                        </div>
                                    </article>
                                    );
                                })}
                            </div>

                            <table className="hidden w-full min-w-[980px] border-collapse md:table">
                                <thead className="sticky top-0 z-10 bg-sidebar-bg">
                                    <tr>
                                        <th className="border-b border-border p-4 text-left text-[0.8rem] font-semibold uppercase tracking-wider text-text-muted">ID & Tanggal</th>
                                        <th className="border-b border-border p-4 text-left text-[0.8rem] font-semibold uppercase tracking-wider text-text-muted">Pelanggan</th>
                                        <th className="border-b border-border p-4 text-left text-[0.8rem] font-semibold uppercase tracking-wider text-text-muted">Detail Sewa</th>
                                        <th className="border-b border-border p-4 text-left text-[0.8rem] font-semibold uppercase tracking-wider text-text-muted">Status</th>
                                        <th className="border-b border-border p-4 text-right text-[0.8rem] font-semibold uppercase tracking-wider text-text-muted">Total</th>
                                        <th className="border-b border-border p-4 text-right text-[0.8rem] font-semibold uppercase tracking-wider text-text-muted">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedFilteredRentals.map((rental) => {
                                        const payment = formatPaymentSummary(rental);
                                        return (
                                        <tr key={rental.id} className="group transition-colors hover:bg-surface-hover">
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
                                                    <div>
                                                        <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[0.75rem] font-bold text-accent">
                                                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent"></span>
                                                            Aktif
                                                        </span>
                                                        <div className="text-[0.7rem] text-text-muted">
                                                            Rencana kembali: <br />{formatReturnTimelineLabel(rental)}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[#2ecc71]/20 bg-[#2ecc71]/10 px-2.5 py-1 text-[0.75rem] font-bold text-[#2ecc71]">
                                                            <i className="fas fa-check"></i> Selesai
                                                        </span>
                                                        <div className="text-[0.7rem] text-text-muted">
                                                            Dikembalikan: <br />{formatReturnTimelineLabel(rental)}
                                                        </div>
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
                                                <div className="mt-1 text-[0.72rem] text-text-muted">
                                                    {payment.status} • {payment.method}
                                                </div>
                                                <div className="text-[0.72rem] text-text-muted">
                                                    Terbayar Rp {payment.paidAmount.toLocaleString()} • Sisa Rp {payment.remainingAmount.toLocaleString()}
                                                </div>
                                            </td>
                                            <td className="align-top border-b border-border/50 p-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        className="inline-flex items-center gap-2 rounded border border-accent/40 bg-accent/10 px-3 py-1.5 text-[0.75rem] font-semibold text-accent hover:bg-accent/20"
                                                        onClick={() => openReceiptModal(rental)}
                                                    >
                                                        <i className="fas fa-receipt"></i> Receipt
                                                    </button>
                                                    {isAdmin && (
                                                        <button
                                                            type="button"
                                                            className="inline-flex items-center gap-2 rounded border border-[#b91c1c] bg-[#dc2626] px-3 py-1.5 text-[0.75rem] font-semibold text-white hover:bg-[#b91c1c]"
                                                            onClick={() => openDeleteModal(rental)}
                                                        >
                                                            <i className="fas fa-trash"></i> Hapus
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </>
                    )}
                </div>
                {historyError && (
                    <p className="border-t border-[#e74c3c]/30 px-4 py-3 text-sm text-[#e74c3c]">
                        Gagal memuat riwayat: {historyError instanceof Error ? historyError.message : 'Terjadi kesalahan.'}
                    </p>
                )}
                {hasMoreHistory && (
                    <div className="border-t border-border p-3 text-center">
                        <button
                            type="button"
                            disabled={isLoadingMoreHistory}
                            className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/20 disabled:cursor-wait disabled:opacity-60"
                            onClick={() => setSize((currentSize) => currentSize + 1)}
                        >
                            {isLoadingMoreHistory ? 'Memuat...' : 'Muat transaksi berikutnya'}
                        </button>
                    </div>
                )}
            </div>

            {selectedRental && (
                <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/80 p-4 backdrop-blur-[3px]">
                    <div className="w-full max-w-[560px] rounded-lg border border-border bg-sidebar-bg p-5">
                        <h4 className="mb-1 text-[1.05rem] font-bold text-text-main">Hapus Riwayat Transaksi</h4>
                        <p className="mb-4 text-sm text-text-muted">
                            Transaksi: <span className="font-mono text-text-main">{selectedRental.id}</span>
                        </p>

                        {deleteErrorMessage && (
                            <div className="mb-4 rounded-lg border border-[#dc2626]/35 bg-[#fee2e2] p-3 text-sm text-[#991b1b]">
                                {deleteErrorMessage}
                            </div>
                        )}

                        {!isPasswordVerified ? (
                            <div className="space-y-3">
                                <p className="text-sm text-text-muted">Masukkan password admin untuk membuka opsi penghapusan.</p>
                                <input
                                    type="password"
                                    className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
                                    placeholder="Password admin"
                                    value={deletePassword}
                                    onChange={(event) => setDeletePassword(event.target.value)}
                                />
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <button
                                        type="button"
                                        disabled={isVerifyingDelete}
                                        className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
                                        onClick={handleVerifyDeletePassword}
                                    >
                                        {isVerifyingDelete ? 'Memverifikasi...' : 'Verifikasi Password'}
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded-lg border border-border bg-sidebar-bg px-4 py-2.5 text-sm font-semibold text-text-main hover:border-accent"
                                        onClick={closeDeleteModal}
                                    >
                                        Batal
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="rounded border border-[#2ecc71]/30 bg-[#2ecc71]/10 p-3 text-sm text-[#6ee7a8]">
                                    Password terverifikasi. Lanjutkan konfirmasi penghapusan.
                                </div>
                                <textarea
                                    className="min-h-[90px] w-full resize-y rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
                                    placeholder="Alasan penghapusan transaksi..."
                                    value={deleteReason}
                                    onChange={(event) => setDeleteReason(event.target.value)}
                                ></textarea>
                                <input
                                    type="text"
                                    className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-text-main outline-none focus:border-accent"
                                    placeholder={`Ketik: HAPUS ${selectedRental.id}`}
                                    value={deleteConfirmationText}
                                    onChange={(event) => setDeleteConfirmationText(event.target.value)}
                                />
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <button
                                        type="button"
                                        disabled={isDeletingRental}
                                        className="rounded-lg bg-[#e74c3c] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#c0392b] disabled:opacity-60"
                                        onClick={handleDeleteRental}
                                    >
                                        {isDeletingRental ? 'Menghapus...' : 'Hapus Riwayat'}
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded-lg border border-border bg-sidebar-bg px-4 py-2.5 text-sm font-semibold text-text-main hover:border-accent"
                                        onClick={closeDeleteModal}
                                    >
                                        Batal
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <ReceiptModal
                isOpen={Boolean(receiptRental)}
                rental={receiptRental}
                onClose={closeReceiptModal}
                onPrint={handlePrintReceipt}
                onShareWhatsApp={handleShareReceiptWhatsApp}
            />
        </div>
    );
};

export default History;

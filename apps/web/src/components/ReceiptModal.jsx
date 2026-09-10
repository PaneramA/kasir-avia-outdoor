import React from 'react';
import {
    resolveReceiptProfile,
    formatCurrency,
    formatDate,
    formatDateTime,
    getReceiptDueDate,
} from '../lib/receipt';
import { buildReceiptViewModel } from '../lib/receiptViewModel';

const ReceiptModal = ({
    isOpen,
    rental,
    onClose,
    onPrint,
    onShareWhatsApp,
}) => {
    if (!isOpen || !rental) {
        return null;
    }

    const receiptProfile = resolveReceiptProfile();
    const receiptModel = buildReceiptViewModel(rental);
    const dueDate = getReceiptDueDate(rental);
    const duration = Number(rental.duration) || 0;
    const paymentStatus = String(receiptModel.paymentStatus).toUpperCase();
    const paymentMethod = String(receiptModel.paymentMethod).toUpperCase();

    return (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 p-3 sm:p-4">
            <div className="flex max-h-[92vh] w-full max-w-[760px] flex-col overflow-hidden rounded-md border border-border bg-card-bg shadow-none">
                <div className="mb-0 flex items-start justify-between gap-4 border-b border-border px-4 pb-3 pt-4 sm:px-5">
                    <div>
                        <h4 className="text-[1.1rem] font-bold text-text-main">Receipt Transaksi</h4>
                        <p className="text-xs text-text-muted">{receiptProfile.storeName}</p>
                        {receiptProfile.addressLines.map((line) => (
                            <p key={line} className="text-xs text-text-muted">{line}</p>
                        ))}
                        {receiptProfile.phone && <p className="text-xs text-text-muted">Telp: {receiptProfile.phone}</p>}
                        <p className="text-xs text-text-muted">ID: <span className="font-mono text-text-main">{rental.id}</span></p>
                    </div>
                    <button
                        type="button"
                        className="rounded-md border border-border px-2 py-1 text-sm text-text-muted hover:border-accent hover:text-text-main"
                        onClick={onClose}
                    >
                        Tutup
                    </button>
                </div>

                <div className="custom-scrollbar flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-md border border-border bg-bg-main p-3">
                        <p className="mb-1 text-xs uppercase tracking-wide text-text-muted">Penyewa</p>
                        <p className="font-semibold text-text-main">{rental.customer?.name || '-'}</p>
                        <p className="text-sm text-text-muted">{rental.customer?.phone || '-'}</p>
                        <p className="mt-2 text-xs text-text-muted">
                            Jaminan: {rental.customer?.guarantee || '-'} ({rental.customer?.idNumber || '-'})
                        </p>
                    </div>

                    <div className="rounded-md border border-border bg-bg-main p-3">
                        <p className="mb-1 text-xs uppercase tracking-wide text-text-muted">Detail Sewa</p>
                        <p className="text-sm text-text-main">Tanggal: {formatDateTime(rental.date)}</p>
                        <p className="text-sm text-text-main">Durasi: {duration} hari</p>
                        <p className="text-sm text-text-main">Jatuh tempo: {dueDate ? formatDate(dueDate) : '-'}</p>
                        <p className="text-sm text-text-main">Pembayaran: {paymentStatus} • {paymentMethod}</p>
                        <p className="text-sm text-text-main">Terbayar: {formatCurrency(receiptModel.paidAmount)}</p>
                        <p className="text-sm text-text-main">Sisa: {formatCurrency(receiptModel.remainingAmount)}</p>
                        <p className="mt-2 text-xs text-text-muted">Status: {rental.status || '-'}</p>
                    </div>
                </div>

                <div className="mt-4 overflow-x-auto rounded-md border border-border bg-bg-main">
                    <table className="w-full min-w-[560px] border-collapse">
                        <thead>
                            <tr className="bg-card-bg">
                                <th className="border-b border-border p-3 text-left text-[0.75rem] uppercase tracking-wide text-text-muted">Item</th>
                                <th className="border-b border-border p-3 text-right text-[0.75rem] uppercase tracking-wide text-text-muted">Qty</th>
                                <th className="border-b border-border p-3 text-right text-[0.75rem] uppercase tracking-wide text-text-muted">Harga/Hari</th>
                                <th className="border-b border-border p-3 text-right text-[0.75rem] uppercase tracking-wide text-text-muted">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>
                            {receiptModel.itemRows.map((item, idx) => (
                                <tr key={`${rental.id}-${item.id || idx}`}>
                                    <td className="border-b border-border/40 p-3 text-sm text-text-main">{item.label}</td>
                                    <td className="border-b border-border/40 p-3 text-right text-sm text-text-main">{item.quantity}</td>
                                    <td className="border-b border-border/40 p-3 text-right text-sm text-text-main">{formatCurrency(item.unitAmount)}</td>
                                    <td className="border-b border-border/40 p-3 text-right text-sm font-semibold text-text-main">{formatCurrency(item.amount)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mt-4 rounded-md border border-accent bg-card-bg p-3">
                    <div className="flex items-center justify-between gap-3 text-sm text-text-main">
                        <span className="font-semibold">Subtotal Sewa</span>
                        <span>{formatCurrency(receiptModel.baseSubtotal)}</span>
                    </div>
                    {receiptModel.chargeRows.map((charge, idx) => (
                        <div key={charge.id || `${charge.label}-${idx}`} className="mt-2 flex items-center justify-between gap-3 text-sm text-text-main">
                            <span>{charge.label}</span>
                            <span className="font-semibold">{formatCurrency(charge.amount)}</span>
                        </div>
                    ))}
                    <div className="mt-3 border-t border-border pt-3">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-text-main">TOTAL</span>
                            <span className="text-[1.1rem] font-bold text-accent">{formatCurrency(receiptModel.invoiceTotal)}</span>
                        </div>
                        <div className="mt-2 grid gap-1 text-sm text-text-main">
                            <div className="flex items-center justify-between gap-3">
                                <span>Terbayar</span>
                                <span>{formatCurrency(receiptModel.paidAmount)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span>Sisa</span>
                                <span>{formatCurrency(receiptModel.remainingAmount)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {receiptModel.returnNotes && (
                    <div className="mt-3 rounded-md border border-[#e0b44c] bg-[#fff9e8] p-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-[#8a6500]">Catatan pengembalian</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-text-main">{receiptModel.returnNotes}</p>
                    </div>
                )}

                {receiptProfile.legalFooterLines.length > 0 && (
                    <div className="mt-3 rounded-md border border-border bg-bg-main p-3">
                        {receiptProfile.legalFooterLines.map((line) => (
                            <p key={line} className="text-xs text-text-muted">{line}</p>
                        ))}
                    </div>
                )}
                </div>

                <div className="mt-0 flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
                    <button
                        type="button"
                        className="rounded-md border border-border bg-card-bg px-4 py-2.5 text-sm font-semibold text-text-main hover:border-accent"
                        onClick={() => onPrint(58)}
                    >
                        <i className="fas fa-print mr-2"></i>Print 58mm
                    </button>
                    <button
                        type="button"
                        className="rounded-md border border-border bg-card-bg px-4 py-2.5 text-sm font-semibold text-text-main hover:border-accent"
                        onClick={() => onPrint(80)}
                    >
                        <i className="fas fa-print mr-2"></i>Print 80mm
                    </button>
                    <button
                        type="button"
                        className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"
                        onClick={onShareWhatsApp}
                    >
                        <i className="fab fa-whatsapp mr-2"></i>Share WA
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReceiptModal;

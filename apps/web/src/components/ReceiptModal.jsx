import React from 'react';
import {
    resolveReceiptProfile,
    formatCurrency,
    formatDate,
    formatDateTime,
    getReceiptDueDate,
    getReceiptTotal,
} from '../lib/receipt';

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

    const items = Array.isArray(rental.items) ? rental.items : [];
    const receiptProfile = resolveReceiptProfile();
    const dueDate = getReceiptDueDate(rental);
    const duration = Number(rental.duration) || 0;
    const total = getReceiptTotal(rental);

    return (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/80 p-4 backdrop-blur-[3px]">
            <div className="w-full max-w-[760px] rounded-lg border border-border bg-sidebar-bg p-5 shadow-xl">
                <div className="mb-4 flex items-start justify-between gap-4 border-b border-border pb-3">
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

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border border-border/60 bg-bg-main/40 p-3">
                        <p className="mb-1 text-xs uppercase tracking-wide text-text-muted">Penyewa</p>
                        <p className="font-semibold text-text-main">{rental.customer?.name || '-'}</p>
                        <p className="text-sm text-text-muted">{rental.customer?.phone || '-'}</p>
                        <p className="mt-2 text-xs text-text-muted">
                            Jaminan: {rental.customer?.guarantee || '-'} ({rental.customer?.idNumber || '-'})
                        </p>
                    </div>

                    <div className="rounded-lg border border-border/60 bg-bg-main/40 p-3">
                        <p className="mb-1 text-xs uppercase tracking-wide text-text-muted">Detail Sewa</p>
                        <p className="text-sm text-text-main">Tanggal: {formatDateTime(rental.date)}</p>
                        <p className="text-sm text-text-main">Durasi: {duration} hari</p>
                        <p className="text-sm text-text-main">Jatuh tempo: {dueDate ? formatDate(dueDate) : '-'}</p>
                        <p className="mt-2 text-xs text-text-muted">Status: {rental.status || '-'}</p>
                    </div>
                </div>

                <div className="mt-4 overflow-x-auto rounded-lg border border-border/60 bg-bg-main/30">
                    <table className="w-full min-w-[560px] border-collapse">
                        <thead>
                            <tr className="bg-sidebar-bg">
                                <th className="border-b border-border p-3 text-left text-[0.75rem] uppercase tracking-wide text-text-muted">Item</th>
                                <th className="border-b border-border p-3 text-right text-[0.75rem] uppercase tracking-wide text-text-muted">Qty</th>
                                <th className="border-b border-border p-3 text-right text-[0.75rem] uppercase tracking-wide text-text-muted">Harga/Hari</th>
                                <th className="border-b border-border p-3 text-right text-[0.75rem] uppercase tracking-wide text-text-muted">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => {
                                const subtotal = (Number(item.price) || 0) * (Number(item.qty) || 0) * duration;
                                return (
                                    <tr key={`${rental.id}-${item.id || idx}`}>
                                        <td className="border-b border-border/40 p-3 text-sm text-text-main">{item.name}</td>
                                        <td className="border-b border-border/40 p-3 text-right text-sm text-text-main">{item.qty}</td>
                                        <td className="border-b border-border/40 p-3 text-right text-sm text-text-main">{formatCurrency(item.price)}</td>
                                        <td className="border-b border-border/40 p-3 text-right text-sm font-semibold text-text-main">{formatCurrency(subtotal)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="mt-4 flex items-center justify-between rounded-lg border border-accent/30 bg-accent/10 p-3">
                    <span className="text-sm font-semibold text-text-main">Total</span>
                    <span className="text-[1.1rem] font-bold text-accent">{formatCurrency(total)}</span>
                </div>

                {receiptProfile.legalFooterLines.length > 0 && (
                    <div className="mt-3 rounded-lg border border-border/50 bg-bg-main/30 p-3">
                        {receiptProfile.legalFooterLines.map((line) => (
                            <p key={line} className="text-xs text-text-muted">{line}</p>
                        ))}
                    </div>
                )}

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        className="rounded-lg border border-border bg-sidebar-bg px-4 py-2.5 text-sm font-semibold text-text-main hover:border-accent"
                        onClick={() => onPrint(58)}
                    >
                        <i className="fas fa-print mr-2"></i>Print 58mm
                    </button>
                    <button
                        type="button"
                        className="rounded-lg border border-border bg-sidebar-bg px-4 py-2.5 text-sm font-semibold text-text-main hover:border-accent"
                        onClick={() => onPrint(80)}
                    >
                        <i className="fas fa-print mr-2"></i>Print 80mm
                    </button>
                    <button
                        type="button"
                        className="rounded-lg bg-[#25d366] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1da955]"
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

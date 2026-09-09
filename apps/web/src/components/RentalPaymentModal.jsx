import React, { useEffect, useRef, useState } from 'react';

const PAYMENT_METHODS = [
  { value: 'TUNAI', label: 'Tunai' },
  { value: 'BANK', label: 'Transfer Bank' },
  { value: 'QRIS', label: 'QRIS' },
];

function formatCurrency(value) {
  return `Rp ${new Intl.NumberFormat('id-ID').format(Math.max(0, Number(value) || 0))}`;
}

function getLocalDateTimeValue() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function createIdempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `payment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getRemainingAmount(rental) {
  const payment = rental?.payment || {};
  return Math.max(0, Math.trunc(Number(payment.remainingAmount ?? payment.totalDue ?? rental?.total ?? 0) || 0));
}

export default function RentalPaymentModal({ isOpen, rental, onClose, onSubmit }) {
  const idempotencyKeyRef = useRef('');
  const [amount, setAmount] = useState('0');
  const [method, setMethod] = useState('TUNAI');
  const [paidAt, setPaidAt] = useState('');
  const [note, setNote] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const remainingAmount = getRemainingAmount(rental);

  useEffect(() => {
    if (!isOpen || !rental?.id) {
      return;
    }

    idempotencyKeyRef.current = createIdempotencyKey();
    setAmount(String(remainingAmount));
    setMethod('TUNAI');
    setPaidAt(getLocalDateTimeValue());
    setNote('');
    setErrorMessage('');
    setIsSubmitting(false);
  }, [isOpen, rental?.id]);

  if (!isOpen || !rental) {
    return null;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    const parsedAmount = Number(amount);

    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      setErrorMessage('Nominal pembayaran harus berupa angka rupiah lebih dari nol.');
      return;
    }

    if (parsedAmount > remainingAmount) {
      setErrorMessage('Nominal pembayaran melebihi sisa tagihan.');
      return;
    }

    const parsedPaidAt = new Date(paidAt);
    if (Number.isNaN(parsedPaidAt.getTime())) {
      setErrorMessage('Tanggal pembayaran tidak valid.');
      return;
    }

    setErrorMessage('');
    setIsSubmitting(true);
    try {
      await onSubmit({
        amount: parsedAmount,
        method,
        paidAt: parsedPaidAt.toISOString(),
        note: note.trim(),
        idempotencyKey: idempotencyKeyRef.current || createIdempotencyKey(),
      });
      idempotencyKeyRef.current = createIdempotencyKey();
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Pembayaran gagal disimpan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/60 p-4" role="presentation">
      <div
        className="w-full max-w-md rounded-md border border-border bg-card-bg shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rental-payment-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id="rental-payment-title" className="text-lg font-bold text-text-main">Catat Pembayaran</h2>
            <p className="mt-1 text-sm text-text-muted">{rental.customer?.name || 'Penyewa'} · {rental.id}</p>
          </div>
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-sm text-text-muted hover:border-accent hover:text-text-main"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Tutup"
          >
            Tutup
          </button>
        </div>

        <form className="space-y-4 px-5 py-5" onSubmit={handleSubmit}>
          <div className="rounded-md border border-accent/40 bg-bg-main px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-text-muted">Sisa tagihan</p>
            <p className="mt-1 text-xl font-bold text-accent">{formatCurrency(remainingAmount)}</p>
          </div>

          {errorMessage && (
            <div className="rounded-md border border-[#e74c3c]/40 bg-[#e74c3c]/10 px-3 py-2 text-sm text-[#c0392b]" role="alert">
              {errorMessage}
            </div>
          )}

          <label className="block text-sm font-medium text-text-main" htmlFor="rental-payment-amount">
            Nominal pembayaran
            <input
              id="rental-payment-amount"
              className="mt-1 w-full rounded-md border border-border bg-card-bg px-3 py-2.5 text-text-main outline-none focus:border-accent"
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={isSubmitting}
            />
          </label>

          <label className="block text-sm font-medium text-text-main" htmlFor="rental-payment-method">
            Metode pembayaran
            <select
              id="rental-payment-method"
              className="mt-1 w-full rounded-md border border-border bg-card-bg px-3 py-2.5 text-text-main outline-none focus:border-accent"
              value={method}
              onChange={(event) => setMethod(event.target.value)}
              disabled={isSubmitting}
            >
              {PAYMENT_METHODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>

          <label className="block text-sm font-medium text-text-main" htmlFor="rental-payment-date">
            Tanggal pembayaran
            <input
              id="rental-payment-date"
              className="mt-1 w-full rounded-md border border-border bg-card-bg px-3 py-2.5 text-text-main outline-none focus:border-accent"
              type="datetime-local"
              value={paidAt}
              onChange={(event) => setPaidAt(event.target.value)}
              disabled={isSubmitting}
            />
          </label>

          <label className="block text-sm font-medium text-text-main" htmlFor="rental-payment-note">
            Catatan (opsional)
            <textarea
              id="rental-payment-note"
              className="mt-1 min-h-20 w-full resize-y rounded-md border border-border bg-card-bg px-3 py-2.5 text-text-main outline-none focus:border-accent"
              maxLength={300}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={isSubmitting}
            />
          </label>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              className="rounded-md border border-border px-4 py-2.5 text-sm font-semibold text-text-main hover:border-accent"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Batal
            </button>
            <button
              type="submit"
              className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting || remainingAmount <= 0}
            >
              {isSubmitting ? 'Menyimpan...' : 'Simpan Pembayaran'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

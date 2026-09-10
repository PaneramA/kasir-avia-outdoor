import React, { useEffect, useRef, useState } from 'react';

const PAYMENT_STATUS_OPTIONS = [
  { value: 'LUNAS', label: 'Lunas' },
  { value: 'DP', label: 'DP' },
  { value: 'BELUM_BAYAR', label: 'Bayar nanti' },
];

const PAYMENT_METHODS = [
  { value: 'TUNAI', label: 'Tunai' },
  { value: 'BANK', label: 'Transfer' },
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

  return `initial-payment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getRentalTotal(rental) {
  return Math.max(0, Math.trunc(Number(rental?.total || rental?.payment?.totalDue || 0) || 0));
}

export default function RentalInitialPaymentModal({ isOpen, rental, onClose, onSubmit }) {
  const idempotencyKeyRef = useRef('');
  const [status, setStatus] = useState('LUNAS');
  const [amount, setAmount] = useState('0');
  const [method, setMethod] = useState('TUNAI');
  const [paidAt, setPaidAt] = useState('');
  const [note, setNote] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const total = getRentalTotal(rental);

  useEffect(() => {
    if (!isOpen || !rental) {
      return;
    }

    idempotencyKeyRef.current = createIdempotencyKey();
    setStatus('LUNAS');
    setAmount(String(total));
    setMethod('TUNAI');
    setPaidAt(getLocalDateTimeValue());
    setNote('');
    setErrorMessage('');
    setIsSubmitting(false);
  }, [isOpen, rental?.id, total]);

  if (!isOpen || !rental) {
    return null;
  }

  const handleStatusChange = (nextStatus) => {
    setStatus(nextStatus);
    setErrorMessage('');
    if (nextStatus === 'LUNAS') {
      setAmount(String(total));
    } else if (nextStatus === 'BELUM_BAYAR') {
      setAmount('0');
    } else {
      setAmount('');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const parsedAmount = Number(String(amount || '0').replace(/\D/g, '')) || 0;

    if (status === 'DP' && parsedAmount <= 0) {
      setErrorMessage('Nominal DP wajib diisi lebih dari nol.');
      return;
    }

    if (status === 'DP' && parsedAmount >= total) {
      setErrorMessage('Nominal DP harus lebih kecil dari total sewa.');
      return;
    }

    if (status === 'LUNAS' && parsedAmount !== total) {
      setErrorMessage('Nominal lunas harus sama dengan total sewa.');
      return;
    }

    const parsedPaidAt = new Date(paidAt);
    if (status !== 'BELUM_BAYAR' && Number.isNaN(parsedPaidAt.getTime())) {
      setErrorMessage('Tanggal pembayaran tidak valid.');
      return;
    }

    setErrorMessage('');
    setIsSubmitting(true);
    try {
      await onSubmit({
        status,
        amount: status === 'BELUM_BAYAR' ? 0 : parsedAmount,
        method,
        ...(status !== 'BELUM_BAYAR' ? { paidAt: parsedPaidAt.toISOString(), idempotencyKey: idempotencyKeyRef.current || createIdempotencyKey() } : {}),
        note: note.trim(),
      });
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Pembayaran awal gagal disimpan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/60 p-4" role="presentation">
      <div
        className="w-full max-w-md rounded-md border border-[#d7ded9] bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rental-initial-payment-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#d7ded9] px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-[#5c6b64]">Langkah sebelum nota</p>
            <h2 id="rental-initial-payment-title" className="text-lg font-bold text-[#10231c]">Konfirmasi Pembayaran</h2>
            <p className="mt-1 text-sm text-[#5c6b64]">{rental.customer?.name || 'Penyewa'}</p>
          </div>
          <button
            type="button"
            className="rounded-md border border-[#cfd8d3] px-2 py-1 text-sm text-[#5c6b64] hover:border-[#146c43] hover:text-[#10231c]"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Tutup
          </button>
        </div>

        <form className="space-y-4 px-5 py-5" onSubmit={handleSubmit}>
          <div className="rounded-md border border-[#146c43]/40 bg-[#f4f8f5] px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-[#5c6b64]">Total sewa</p>
            <p className="mt-1 text-xl font-bold text-[#146c43]">{formatCurrency(total)}</p>
          </div>

          {errorMessage && (
            <div className="rounded-md border border-[#e74c3c]/40 bg-[#fff1ef] px-3 py-2 text-sm text-[#c0392b]" role="alert">
              {errorMessage}
            </div>
          )}

          <label className="block text-sm font-medium text-[#10231c]" htmlFor="initial-payment-status">
            Status pembayaran
            <select
              id="initial-payment-status"
              className="mt-1 w-full rounded-md border border-[#cfd8d3] bg-white px-3 py-2.5 text-[#10231c] outline-none focus:border-[#146c43]"
              value={status}
              onChange={(event) => handleStatusChange(event.target.value)}
              disabled={isSubmitting}
            >
              {PAYMENT_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>

          <label className="block text-sm font-medium text-[#10231c]" htmlFor="initial-payment-amount">
            Nominal pembayaran
            <input
              id="initial-payment-amount"
              className="mt-1 w-full rounded-md border border-[#cfd8d3] bg-white px-3 py-2.5 text-[#10231c] outline-none focus:border-[#146c43] disabled:bg-[#f4f6f5]"
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={isSubmitting || status === 'BELUM_BAYAR'}
            />
          </label>

          <label className="block text-sm font-medium text-[#10231c]" htmlFor="initial-payment-method">
            Metode pembayaran
            <select
              id="initial-payment-method"
              className="mt-1 w-full rounded-md border border-[#cfd8d3] bg-white px-3 py-2.5 text-[#10231c] outline-none focus:border-[#146c43] disabled:bg-[#f4f6f5]"
              value={method}
              onChange={(event) => setMethod(event.target.value)}
              disabled={isSubmitting || status === 'BELUM_BAYAR'}
            >
              {PAYMENT_METHODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>

          {status !== 'BELUM_BAYAR' && (
            <label className="block text-sm font-medium text-[#10231c]" htmlFor="initial-payment-date">
              Tanggal pembayaran
              <input
                id="initial-payment-date"
                className="mt-1 w-full rounded-md border border-[#cfd8d3] bg-white px-3 py-2.5 text-[#10231c] outline-none focus:border-[#146c43]"
                type="datetime-local"
                value={paidAt}
                onChange={(event) => setPaidAt(event.target.value)}
                disabled={isSubmitting}
              />
            </label>
          )}

          <label className="block text-sm font-medium text-[#10231c]" htmlFor="initial-payment-note">
            Catatan pembayaran (opsional)
            <textarea
              id="initial-payment-note"
              className="mt-1 min-h-20 w-full resize-y rounded-md border border-[#cfd8d3] bg-white px-3 py-2.5 text-[#10231c] outline-none focus:border-[#146c43]"
              maxLength={300}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={isSubmitting}
            />
          </label>

          <div className="flex justify-end gap-2 border-t border-[#d7ded9] pt-4">
            <button
              type="button"
              className="rounded-md border border-[#cfd8d3] px-4 py-2.5 text-sm font-semibold text-[#10231c] hover:border-[#146c43]"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Batal
            </button>
            <button
              type="submit"
              className="rounded-md bg-[#146c43] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0f5132] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Menyimpan...' : 'Simpan Pembayaran & Buat Sewa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

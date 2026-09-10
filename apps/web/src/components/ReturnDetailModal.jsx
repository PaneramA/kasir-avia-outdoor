import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import RentalEditModal from './RentalEditModal';
import RentalPaymentModal from './RentalPaymentModal';
import { formatJakartaDateLabel } from '../lib/financial';
import { formatLateDuration, getDailyRate, getLateDurationMs, getPlannedReturnDate } from '../lib/rentalTime';

const formatCurrency = (value) => 'Rp ' + Number(value || 0).toLocaleString('id-ID');

function getPaymentInfo(rental) {
  const status = String(rental?.payment?.status || 'LUNAS').toUpperCase();
  const paidAmount = Number(rental?.payment?.paidAmount ?? rental?.total ?? 0) || 0;
  const totalDue = Number(rental?.payment?.totalDue ?? rental?.total ?? 0) || 0;
  const remainingAmount = Number(rental?.payment?.remainingAmount ?? Math.max(0, totalDue - paidAmount)) || 0;
  return { status, paidAmount, totalDue, remainingAmount, isUnpaid: remainingAmount > 0 };
}

function IdentityBadge({ rental }) {
  const held = rental?.customer?.identityCardHeld !== false;
  return (
    <span className="inline-flex items-center rounded-md border border-[#f59e0b] bg-[#fef3c7] px-2 py-0.5 text-xs font-semibold text-[#92400e]">
      {held ? 'Kartu ditahan' : 'Kartu tidak ditahan'}
    </span>
  );
}

export default function ReturnDetailModal({
  rental,
  inventory = [],
  categories = [],
  onClose,
  onProcessReturn,
  onUpdateRental,
  onRecordRentalPayment,
  onRecordPayment,
}) {
  const [currentRental, setCurrentRental] = useState(rental);
  const [returnNotes, setReturnNotes] = useState('');
  const [additionalFeeInput, setAdditionalFeeInput] = useState('0');
  const [applyLateFee, setApplyLateFee] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentRental, setPaymentRental] = useState(null);
  const [editingRental, setEditingRental] = useState(null);
  const recordPayment = onRecordRentalPayment || onRecordPayment;

  useEffect(() => {
    setCurrentRental(rental);
    setReturnNotes('');
    const lateMs = getLateDurationMs(rental);
    const lateDays = lateMs > 0 ? Math.max(1, Math.ceil(lateMs / (24 * 60 * 60 * 1000))) : 0;
    setApplyLateFee(lateMs > 0);
    setAdditionalFeeInput(String(lateDays * getDailyRate(rental)));
  }, [rental]);

  const payment = useMemo(() => getPaymentInfo(currentRental), [currentRental]);
  const items = Array.isArray(currentRental?.items) ? currentRental.items : [];
  const lateMs = getLateDurationMs(currentRental);
  const isLate = lateMs > 0;
  const lateDays = isLate ? Math.max(1, Math.ceil(lateMs / (24 * 60 * 60 * 1000))) : 0;
  const dailyRate = getDailyRate(currentRental);
  const defaultLateFee = lateDays * dailyRate;
  const additionalFee = Number.isFinite(Number(additionalFeeInput))
    ? Math.max(0, Number(additionalFeeInput))
    : 0;

  const processReturn = async () => {
    if (!currentRental || !window.confirm('Proses pengembalian untuk transaksi ' + currentRental.id + '?')) {
      return;
    }

    try {
      setIsSubmitting(true);
      await onProcessReturn({
        rentalId: currentRental.id,
        applyLateFee,
        lateFeeAmount: applyLateFee ? additionalFee : 0,
        returnNotes,
      });
      window.alert('Pengembalian berhasil diproses! Stok barang telah kembali.');
      onClose();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Gagal memproses pengembalian.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateRental = async (rentalId, payload) => {
    const updatedRental = await onUpdateRental(rentalId, payload);
    setCurrentRental(updatedRental);
    return updatedRental;
  };

  if (!currentRental) {
    return null;
  }

  const modal = (
    <div role="dialog" aria-modal="true" aria-labelledby="return-detail-title" className="return-detail-overlay fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 p-3 sm:p-6">
      <div className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-md border border-border bg-card-bg sm:max-h-[calc(100vh-3rem)]">
        <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-6">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h2 id="return-detail-title" className="text-lg font-bold text-text-main">Detail Pengembalian</h2>
              <IdentityBadge rental={currentRental} />
            </div>
            <p className="text-sm text-text-muted">{currentRental.customer?.name || '-'} • {currentRental.id}</p>
          </div>
          <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-text-muted hover:bg-surface-hover" onClick={onClose}>
            Tutup
          </button>
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {payment.isUnpaid && (
            <div className="mb-4 border border-accent bg-surface-hover p-3 text-sm text-text-main">
              Sisa pembayaran saat ini: <strong>{formatCurrency(payment.remainingAmount + additionalFee)}</strong>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <section className="border border-border bg-bg-main p-4">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-text-muted">Penyewa</h3>
              <p className="font-semibold text-text-main">{currentRental.customer?.name || '-'}</p>
              <p className="text-sm text-text-muted">{currentRental.customer?.phone || '-'}</p>
              <p className="mt-3 text-sm text-text-muted">{currentRental.customer?.guarantee || '-'} • {currentRental.customer?.idNumber || 'Tanpa nomor identitas'}</p>
            </section>
            <section className="border border-border bg-bg-main p-4">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-text-muted">Jadwal Sewa</h3>
              <p className="text-sm text-text-main">Jatuh tempo: <strong>{getPlannedReturnDate(currentRental) ? formatJakartaDateLabel(getPlannedReturnDate(currentRental), true) : '-'}</strong></p>
              <p className="text-sm text-text-main">Durasi: <strong>{currentRental.duration || 0} hari</strong></p>
              <p className="text-sm text-text-main">Pembayaran: <strong>{payment.status}</strong></p>
            </section>
          </div>

          <section className="mt-4 border border-border">
            <div className="grid grid-cols-[minmax(0,1fr)_80px] border-b border-border bg-bg-main px-3 py-2 text-xs font-bold uppercase tracking-wide text-text-muted">
              <span>Barang</span><span className="text-right">Qty</span>
            </div>
            {items.length > 0 ? items.map((item, index) => (
              <div key={item.id || index} className="grid grid-cols-[minmax(0,1fr)_80px] border-b border-border px-3 py-3 text-sm last:border-b-0">
                <span className="text-text-main">{item.name || '-'}</span>
                <span className="text-right font-semibold text-text-main">{item.qty || 0}</span>
              </div>
            )) : (
              <div className="px-3 py-4 text-sm text-text-muted">Tidak ada rincian barang.</div>
            )}
          </section>

          <section className="mt-4 border-t border-border pt-4">
            {isLate && (
              <div className="mb-3 border border-[#f59e0b] bg-[#fef3c7] p-3 text-sm text-[#92400e]">
                Terlambat <strong>{formatLateDuration(lateMs)}</strong>. Perhitungan denda: <strong>{lateDays} hari x {formatCurrency(dailyRate)} = {formatCurrency(defaultLateFee)}</strong>
              </div>
            )}
            <label className="mb-2 flex items-start gap-2 text-sm text-text-muted">
              <input type="checkbox" className="mt-0.5 accent-accent" checked={applyLateFee} onChange={(event) => {
                setApplyLateFee(event.target.checked);
                if (!event.target.checked) setAdditionalFeeInput('0');
                else if (defaultLateFee > 0) setAdditionalFeeInput(String(defaultLateFee));
              }} disabled={!isLate} />
              Terapkan denda keterlambatan sesuai jumlah hari
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-text-muted">
                Nominal denda
                <input type="number" min="0" className="mt-1 w-full rounded-md border border-border bg-white p-2.5 text-text-main outline-none focus:border-accent" value={additionalFeeInput} onChange={(event) => setAdditionalFeeInput(event.target.value)} />
              </label>
              <label className="text-sm text-text-muted">
                Catatan pengembalian
                <textarea className="mt-1 min-h-[46px] w-full resize-y rounded-md border border-border bg-white p-2.5 text-text-main outline-none focus:border-accent" value={returnNotes} onChange={(event) => setReturnNotes(event.target.value)} placeholder="Kondisi barang, kerusakan, atau catatan lain..." />
              </label>
            </div>
          </section>
        </div>

        <div data-testid="return-detail-actions" className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-white px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs text-text-muted">Total akhir</p>
            <p className="text-xl font-bold text-accent">{formatCurrency((currentRental.total || 0) + additionalFee)}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {onUpdateRental && <button type="button" className="rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-muted hover:bg-surface-hover" onClick={() => setEditingRental(currentRental)}>Edit Sewa</button>}
            {recordPayment && payment.isUnpaid && <button type="button" className="rounded-md border border-accent px-3 py-2 text-sm font-semibold text-accent hover:bg-surface-hover" onClick={() => setPaymentRental(currentRental)}>Catat Pembayaran</button>}
            <button type="button" disabled={isSubmitting} className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-60" onClick={processReturn}>
              {isSubmitting ? 'Memproses...' : 'Selesaikan Pengembalian'}
            </button>
          </div>
        </div>
      </div>

      {editingRental && (
        <RentalEditModal rental={editingRental} inventory={inventory} categories={categories} onClose={() => setEditingRental(null)} onSubmit={updateRental} />
      )}
      <RentalPaymentModal
        isOpen={Boolean(paymentRental)}
        rental={paymentRental}
        onClose={() => setPaymentRental(null)}
        onSubmit={async (payload) => {
          if (!paymentRental || typeof recordPayment !== 'function') throw new Error('Aksi pembayaran belum tersedia.');
          await recordPayment(paymentRental.id, payload);
          setPaymentRental(null);
        }}
      />
    </div>
  );

  return typeof document === 'undefined' ? modal : createPortal(modal, document.body);
}

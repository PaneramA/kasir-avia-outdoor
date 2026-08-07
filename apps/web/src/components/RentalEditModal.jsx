import React, { useEffect, useMemo, useState } from 'react';
import RentalDateRangePicker from './RentalDateRangePicker';
import { formatCurrency } from '../lib/financial';

const DEFAULT_CUSTOMER = {
  name: '',
  phone: '',
  address: '',
  guarantee: 'KTP',
  guaranteeOther: '',
  idNumber: '',
  identityCardHeld: true,
};

function formatDateTimeLocalInput(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (part) => String(part).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoString(value) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function calculateDuration(startAt, endAt, fallbackDuration = 1) {
  const startDate = new Date(startAt || '');
  const endDate = new Date(endAt || '');
  if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && endDate > startDate) {
    return Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)));
  }

  const fallback = Number(fallbackDuration);
  return Number.isFinite(fallback) && fallback > 0 ? Math.trunc(fallback) : 1;
}

function normalizeRentalItem(item, inventoryItem) {
  return {
    id: item.id,
    name: inventoryItem?.name || item.name || 'Barang',
    category: inventoryItem?.category || item.category || 'Lainnya',
    price: Number(inventoryItem?.price ?? item.price ?? 0),
    qty: Number(item.qty || 0),
    notes: item.notes || '',
  };
}

const RentalEditModal = ({
  rental,
  inventory = [],
  categories = [],
  onClose,
  onSubmit,
}) => {
  const [customer, setCustomer] = useState(DEFAULT_CUSTOMER);
  const [cart, setCart] = useState([]);
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('LUNAS');
  const [paymentMethod, setPaymentMethod] = useState('TUNAI');
  const [paidAmount, setPaidAmount] = useState('');
  const [editReason, setEditReason] = useState('');
  const [itemQuery, setItemQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const inventoryById = useMemo(() => new Map(inventory.map((item) => [item.id, item])), [inventory]);
  const originalQtyById = useMemo(() => {
    const qtyById = new Map();
    (rental?.items || []).forEach((item) => {
      qtyById.set(item.id, (qtyById.get(item.id) || 0) + Number(item.qty || 0));
    });
    return qtyById;
  }, [rental]);

  const availableItems = useMemo(() => {
    const itemMap = new Map();

    inventory.forEach((item) => {
      itemMap.set(item.id, {
        ...item,
        category: item.category || 'Lainnya',
        price: Number(item.price || 0),
        stock: Number(item.stock || 0),
        availableForEdit: Number(item.stock || 0) + (originalQtyById.get(item.id) || 0),
      });
    });

    (rental?.items || []).forEach((item) => {
      if (itemMap.has(item.id)) {
        return;
      }

      itemMap.set(item.id, {
        ...item,
        category: item.category || 'Lainnya',
        price: Number(item.price || 0),
        stock: 0,
        availableForEdit: Number(item.qty || 0),
      });
    });

    return [...itemMap.values()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [inventory, originalQtyById, rental]);

  const categoryOptions = useMemo(() => {
    const optionSet = new Set(categories.filter(Boolean));
    availableItems.forEach((item) => optionSet.add(item.category || 'Lainnya'));
    return ['All', ...[...optionSet].sort((a, b) => a.localeCompare(b))];
  }, [availableItems, categories]);

  const cartQtyById = useMemo(() => {
    const qtyById = new Map();
    cart.forEach((item) => qtyById.set(item.id, Number(item.qty || 0)));
    return qtyById;
  }, [cart]);

  const filteredItems = useMemo(() => {
    const keyword = itemQuery.trim().toLowerCase();
    return availableItems.filter((item) => {
      const matchCategory = categoryFilter === 'All' || item.category === categoryFilter;
      const matchKeyword = !keyword
        || String(item.name || '').toLowerCase().includes(keyword)
        || String(item.category || '').toLowerCase().includes(keyword);
      return matchCategory && matchKeyword;
    });
  }, [availableItems, categoryFilter, itemQuery]);

  const duration = useMemo(() => calculateDuration(startAt, endAt, rental?.duration), [endAt, rental?.duration, startAt]);
  const total = useMemo(() => cart.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty || 0) * duration), 0), [cart, duration]);
  const normalizedPaidAmount = paymentStatus === 'LUNAS'
    ? total
    : Math.max(0, Number(paidAmount || 0));
  const remainingAmount = Math.max(0, total - normalizedPaidAmount);

  useEffect(() => {
    if (!rental) {
      return;
    }

    const rentalCustomer = rental.customer || {};
    setCustomer({
      ...DEFAULT_CUSTOMER,
      name: rentalCustomer.name || '',
      phone: rentalCustomer.phone || '',
      guarantee: rentalCustomer.guarantee || 'KTP',
      guaranteeOther: rentalCustomer.guaranteeOther || '',
      idNumber: rentalCustomer.idNumber || '',
      identityCardHeld: rentalCustomer.identityCardHeld !== false,
    });
    setCart((rental.items || []).map((item) => normalizeRentalItem(item, inventoryById.get(item.id))));
    setStartAt(formatDateTimeLocalInput(rental.date));
    setEndAt(formatDateTimeLocalInput(rental.plannedReturnDate));
    setPaymentStatus(String(rental.payment?.status || 'LUNAS').toUpperCase());
    setPaymentMethod(String(rental.payment?.method || 'TUNAI').toUpperCase());
    setPaidAmount(String(rental.payment?.paidAmount ?? rental.total ?? ''));
    setEditReason('');
    setItemQuery('');
    setCategoryFilter('All');
    setErrorMessage('');
    setIsSaving(false);
  }, [inventoryById, rental]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape' && !isSaving) {
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isSaving, onClose]);

  if (!rental) {
    return null;
  }

  const setCustomerField = (field, value) => {
    setCustomer((current) => ({ ...current, [field]: value }));
  };

  const getMaxQty = (itemId) => {
    const item = availableItems.find((entry) => entry.id === itemId);
    return Math.max(0, Number(item?.availableForEdit || 0));
  };

  const setItemQty = (item, nextQty) => {
    const maxQty = getMaxQty(item.id);
    const safeQty = Math.min(maxQty, Math.max(0, Math.trunc(Number(nextQty) || 0)));
    setCart((current) => {
      if (safeQty <= 0) {
        return current.filter((cartItem) => cartItem.id !== item.id);
      }

      const existing = current.find((cartItem) => cartItem.id === item.id);
      if (existing) {
        return current.map((cartItem) => (
          cartItem.id === item.id
            ? { ...cartItem, qty: safeQty, price: Number(item.price || cartItem.price || 0), category: item.category || cartItem.category }
            : cartItem
        ));
      }

      return [
        ...current,
        {
          id: item.id,
          name: item.name,
          category: item.category || 'Lainnya',
          price: Number(item.price || 0),
          qty: safeQty,
          notes: '',
        },
      ];
    });
  };

  const setItemNotes = (itemId, notes) => {
    setCart((current) => current.map((item) => (
      item.id === itemId ? { ...item, notes } : item
    )));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const reason = editReason.trim();

    if (!customer.name.trim() || !customer.phone.trim()) {
      setErrorMessage('Nama customer dan nomor HP wajib diisi.');
      return;
    }

    if (cart.length === 0) {
      setErrorMessage('Pilih minimal satu barang.');
      return;
    }

    if (!startAt || !endAt) {
      setErrorMessage('Rentang tanggal sewa wajib dipilih.');
      return;
    }

    if (!reason) {
      setErrorMessage('Alasan edit wajib diisi.');
      return;
    }

    if (paymentStatus === 'DP' && normalizedPaidAmount <= 0) {
      setErrorMessage('Nominal DP wajib lebih dari 0.');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage('');
      await onSubmit?.(rental.id, {
        editReason: reason,
        customer: {
          name: customer.name.trim(),
          phone: customer.phone.trim(),
          address: customer.address.trim(),
          guarantee: customer.guarantee,
          guaranteeOther: customer.guarantee === 'Lainnya' ? customer.guaranteeOther.trim() : '',
          idNumber: customer.idNumber.trim(),
        },
        identityCardHeld: customer.identityCardHeld !== false,
        items: cart.map((item) => ({
          id: item.id,
          qty: Number(item.qty || 0),
          notes: item.notes || '',
        })),
        duration,
        rentalStartAt: toIsoString(startAt),
        rentalEndAt: toIsoString(endAt),
        payment: {
          status: paymentStatus,
          method: paymentMethod,
          paidAmount: paymentStatus === 'LUNAS' ? total : normalizedPaidAmount,
        },
      });
      onClose?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menyimpan perubahan transaksi.';
      setErrorMessage(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 p-3 sm:p-5">
      <form
        className="flex max-h-[92vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-md border border-border bg-card-bg shadow-xl"
        onSubmit={handleSubmit}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
          <div>
            <h3 className="text-[1.05rem] font-bold text-text-main">Edit Transaksi</h3>
            <p className="font-mono text-[0.78rem] text-text-muted">{rental.id}</p>
          </div>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border text-text-muted transition hover:border-accent hover:text-accent"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Tutup edit transaksi"
          >
            <i className="fas fa-xmark"></i>
          </button>
        </div>

        {errorMessage && (
          <div className="mx-4 mt-4 rounded-md border border-[#dc2626]/40 bg-[#fee2e2] px-3 py-2 text-sm font-medium text-[#991b1b] sm:mx-5">
            {errorMessage}
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
          <section className="custom-scrollbar min-h-0 overflow-y-auto border-b border-border p-4 sm:p-5 lg:border-b-0 lg:border-r">
            <div className="mb-5">
              <h4 className="mb-3 text-sm font-bold uppercase text-accent">Detail Penyewa</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-text-muted sm:col-span-2">
                  Nama Customer
                  <input
                    className="mt-1 w-full rounded-md border border-border bg-bg-main px-3 py-2.5 text-text-main outline-none focus:border-accent"
                    value={customer.name}
                    onChange={(event) => setCustomerField('name', event.target.value)}
                    placeholder="Nama lengkap"
                  />
                </label>
                <label className="text-sm text-text-muted">
                  Nomor HP
                  <input
                    className="mt-1 w-full rounded-md border border-border bg-bg-main px-3 py-2.5 text-text-main outline-none focus:border-accent"
                    value={customer.phone}
                    onChange={(event) => setCustomerField('phone', event.target.value)}
                    placeholder="0812..."
                  />
                </label>
                <label className="text-sm text-text-muted">
                  Jaminan
                  <select
                    className="mt-1 w-full rounded-md border border-border bg-bg-main px-3 py-2.5 text-text-main outline-none focus:border-accent"
                    value={customer.guarantee}
                    onChange={(event) => setCustomerField('guarantee', event.target.value)}
                  >
                    <option value="KTP">KTP</option>
                    <option value="SIM">SIM</option>
                    <option value="Kartu Pelajar">Kartu Pelajar</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </label>
                {customer.guarantee === 'Lainnya' && (
                  <label className="text-sm text-text-muted">
                    Nama Jaminan
                    <input
                      className="mt-1 w-full rounded-md border border-border bg-bg-main px-3 py-2.5 text-text-main outline-none focus:border-accent"
                      value={customer.guaranteeOther}
                      onChange={(event) => setCustomerField('guaranteeOther', event.target.value)}
                      placeholder="Contoh: Paspor"
                    />
                  </label>
                )}
                <label className="text-sm text-text-muted">
                  Nomor Identitas
                  <input
                    className="mt-1 w-full rounded-md border border-border bg-bg-main px-3 py-2.5 text-text-main outline-none focus:border-accent"
                    value={customer.idNumber}
                    onChange={(event) => setCustomerField('idNumber', event.target.value)}
                    placeholder="Opsional"
                  />
                </label>
                <label className="text-sm text-text-muted sm:col-span-2">
                  Alamat
                  <textarea
                    className="mt-1 min-h-[84px] w-full resize-y rounded-md border border-border bg-bg-main px-3 py-2.5 text-text-main outline-none focus:border-accent"
                    value={customer.address}
                    onChange={(event) => setCustomerField('address', event.target.value)}
                    placeholder="Isi jika perlu memperbarui alamat customer"
                  />
                </label>
              </div>

              <div className="mt-4 rounded-md border border-[#f59e0b] bg-[#fffbeb] p-3">
                <p className="mb-2 text-sm font-bold text-[#92400e]">Kartu identitas</p>
                <div className="grid grid-cols-2 overflow-hidden rounded-md border border-[#f59e0b]">
                  <button
                    type="button"
                    className={`px-3 py-2 text-sm font-bold transition ${customer.identityCardHeld !== false ? 'bg-[#f59e0b] text-white' : 'bg-card-bg text-[#92400e] hover:bg-[#fef3c7]'}`}
                    onClick={() => setCustomerField('identityCardHeld', true)}
                  >
                    Ditahan
                  </button>
                  <button
                    type="button"
                    className={`border-l border-[#f59e0b] px-3 py-2 text-sm font-bold transition ${customer.identityCardHeld === false ? 'bg-[#f59e0b] text-white' : 'bg-card-bg text-[#92400e] hover:bg-[#fef3c7]'}`}
                    onClick={() => setCustomerField('identityCardHeld', false)}
                  >
                    Tidak ditahan
                  </button>
                </div>
              </div>
            </div>

            <div className="mb-5">
              <h4 className="mb-3 text-sm font-bold uppercase text-accent">Waktu & Pembayaran</h4>
              <label className="mb-3 block text-sm text-text-muted">
                Rentang Waktu Sewa
                <RentalDateRangePicker
                  startAt={startAt}
                  endAt={endAt}
                  onChange={(nextStartAt, nextEndAt) => {
                    setStartAt(nextStartAt);
                    setEndAt(nextEndAt);
                  }}
                  className="mt-1 min-h-11 w-full rounded-md border border-border bg-bg-main px-3 py-2.5 text-text-main outline-none focus:border-accent"
                  fieldKey={`edit-rental-range-${rental.id}`}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm text-text-muted">
                  Status Bayar
                  <select
                    className="mt-1 w-full rounded-md border border-border bg-bg-main px-3 py-2.5 text-text-main outline-none focus:border-accent"
                    value={paymentStatus}
                    onChange={(event) => setPaymentStatus(event.target.value)}
                  >
                    <option value="LUNAS">Lunas</option>
                    <option value="DP">DP</option>
                  </select>
                </label>
                <label className="text-sm text-text-muted">
                  Metode
                  <select
                    className="mt-1 w-full rounded-md border border-border bg-bg-main px-3 py-2.5 text-text-main outline-none focus:border-accent"
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                  >
                    <option value="TUNAI">Tunai</option>
                    <option value="QRIS">QRIS</option>
                    <option value="BANK">Bank</option>
                  </select>
                </label>
                <label className="text-sm text-text-muted">
                  Terbayar
                  <input
                    className="mt-1 w-full rounded-md border border-border bg-bg-main px-3 py-2.5 text-text-main outline-none focus:border-accent disabled:bg-[#f1f5f9]"
                    type="number"
                    min="0"
                    value={paymentStatus === 'LUNAS' ? total : paidAmount}
                    onChange={(event) => setPaidAmount(event.target.value)}
                    disabled={paymentStatus === 'LUNAS'}
                  />
                </label>
              </div>

              <label className="mt-4 block text-sm text-text-muted">
                Alasan Edit
                <textarea
                  className="mt-1 min-h-[76px] w-full resize-y rounded-md border border-border bg-bg-main px-3 py-2.5 text-text-main outline-none focus:border-accent"
                  value={editReason}
                  onChange={(event) => setEditReason(event.target.value)}
                  placeholder="Contoh: menambahkan item yang lupa dicatat"
                />
              </label>
            </div>
          </section>

          <section className="flex min-h-0 flex-col p-4 sm:p-5">
            <div className="mb-3">
              <h4 className="mb-3 text-sm font-bold uppercase text-accent">Barang Disewa</h4>
              <div className="grid gap-2 sm:grid-cols-[1fr_170px]">
                <input
                  className="w-full rounded-md border border-border bg-bg-main px-3 py-2.5 text-text-main outline-none focus:border-accent"
                  value={itemQuery}
                  onChange={(event) => setItemQuery(event.target.value)}
                  placeholder="Cari barang atau kategori"
                />
                <select
                  className="w-full rounded-md border border-border bg-bg-main px-3 py-2.5 text-text-main outline-none focus:border-accent"
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                >
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>{category === 'All' ? 'Semua kategori' : category}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="custom-scrollbar min-h-[260px] flex-1 overflow-y-auto pr-1">
              <div className="space-y-2">
                {filteredItems.map((item) => {
                  const selectedQty = cartQtyById.get(item.id) || 0;
                  const maxQty = getMaxQty(item.id);
                  return (
                    <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border bg-bg-main p-3">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-text-main">{item.name}</p>
                        <p className="text-xs text-text-muted">{item.category}</p>
                        <p className="mt-1 text-sm font-bold text-accent">{formatCurrency(item.price)} <span className="text-xs font-medium text-text-muted">/hari</span></p>
                        <p className="text-xs text-text-muted">Bisa dipilih: {maxQty}</p>
                      </div>
                      <div className="flex shrink-0 items-center rounded-md border border-border bg-card-bg">
                        <button
                          type="button"
                          className="h-10 w-10 border-r border-border text-text-muted transition hover:bg-surface-hover"
                          onClick={() => setItemQty(item, selectedQty - 1)}
                          disabled={selectedQty <= 0}
                        >
                          -
                        </button>
                        <span className="flex h-10 w-12 items-center justify-center font-bold text-text-main">{selectedQty}</span>
                        <button
                          type="button"
                          className="h-10 w-10 border-l border-border bg-accent font-bold text-white transition hover:bg-accent-hover disabled:bg-[#d1d5db]"
                          onClick={() => setItemQty(item, selectedQty + 1)}
                          disabled={selectedQty >= maxQty}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 border-t border-border pt-4">
              <div className="mb-3 max-h-[150px] overflow-y-auto pr-1">
                {cart.length === 0 ? (
                  <p className="rounded-md border border-border bg-bg-main p-3 text-sm text-text-muted">Belum ada barang dipilih.</p>
                ) : (
                  <div className="space-y-2">
                    {cart.map((item) => (
                      <div key={item.id} className="rounded-md border border-border bg-bg-main p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-text-main">{item.name} x{item.qty}</p>
                            <p className="text-xs text-text-muted">{formatCurrency(item.price * item.qty * duration)}</p>
                          </div>
                          <button
                            type="button"
                            className="text-sm font-semibold text-[#dc2626]"
                            onClick={() => setItemQty(item, 0)}
                          >
                            Hapus
                          </button>
                        </div>
                        <input
                          className="mt-2 w-full rounded-md border border-border bg-card-bg px-3 py-2 text-sm text-text-main outline-none focus:border-accent"
                          value={item.notes || ''}
                          onChange={(event) => setItemNotes(item.id, event.target.value)}
                          placeholder="Catatan item"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-md border border-accent/30 bg-[#ecfdf5] p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-muted">Durasi</span>
                  <strong className="text-text-main">{duration} hari</strong>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-text-muted">Total baru</span>
                  <strong className="text-lg text-accent">{formatCurrency(total)}</strong>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-text-muted">
                  <span>Terbayar {formatCurrency(normalizedPaidAmount)}</span>
                  <span>Sisa {formatCurrency(remainingAmount)}</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-5">
          <button
            type="button"
            className="rounded-md border border-border bg-card-bg px-4 py-2.5 text-sm font-bold text-text-main transition hover:border-accent"
            onClick={onClose}
            disabled={isSaving}
          >
            Batal
          </button>
          <button
            type="submit"
            className="rounded-md border border-accent bg-accent px-5 py-2.5 text-sm font-bold text-white transition hover:bg-accent-hover disabled:cursor-wait disabled:opacity-60"
            disabled={isSaving}
          >
            {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default RentalEditModal;

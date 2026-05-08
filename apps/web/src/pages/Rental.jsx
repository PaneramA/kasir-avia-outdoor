import React, { useEffect, useRef, useState } from 'react';
import { fetchCustomers } from '../lib/api';

const Rental = ({
    inventory,
    categories,
    cart,
    setCart,
    onCheckout,
}) => {
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [customer, setCustomer] = useState({
        name: '',
        phone: '',
        guarantee: 'KTP',
        guaranteeOther: '',
        idNumber: '',
    });
    const [duration, setDuration] = useState(1);
    const [customerSearch, setCustomerSearch] = useState('');
    const [customerSuggestions, setCustomerSuggestions] = useState([]);
    const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
    const latestSearchRequestRef = useRef(0);

    useEffect(() => {
        const keyword = customerSearch.trim();
        if (keyword.length < 2) {
            setCustomerSuggestions([]);
            setIsSearchingCustomer(false);
            return undefined;
        }

        const requestId = latestSearchRequestRef.current + 1;
        latestSearchRequestRef.current = requestId;
        const timeoutId = setTimeout(async () => {
            try {
                setIsSearchingCustomer(true);
                const data = await fetchCustomers(keyword);
                if (requestId !== latestSearchRequestRef.current) {
                    return;
                }

                setCustomerSuggestions(data);
            } catch {
                if (requestId !== latestSearchRequestRef.current) {
                    return;
                }

                setCustomerSuggestions([]);
            } finally {
                if (requestId === latestSearchRequestRef.current) {
                    setIsSearchingCustomer(false);
                }
            }
        }, 250);

        return () => clearTimeout(timeoutId);
    }, [customerSearch]);

    const filteredItems = categoryFilter === 'all'
        ? inventory
        : inventory.filter(item => item.category === categoryFilter);

    const addToCart = (item) => {
        if (item.stock <= 0) return;

        const existing = cart.find(c => c.id === item.id);
        if (existing) {
            if (existing.qty < item.stock) {
                setCart(cart.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c));
            } else {
                alert('Stok tidak mencukupi');
            }
        } else {
            setCart([...cart, { ...item, qty: 1, notes: '' }]);
        }
    };

    const updateCartQty = (id, delta) => {
        const item = cart.find(c => c.id === id);
        const invItem = inventory.find(i => i.id === id);

        if (!item || !invItem) {
            return;
        }

        const newQty = item.qty + delta;

        if (newQty > 0 && newQty <= invItem.stock) {
            setCart(cart.map(c => c.id === id ? { ...c, qty: newQty } : c));
        } else if (newQty > invItem.stock) {
            alert('Stok tidak mencukupi');
        }
    };

    const removeFromCart = (id) => {
        setCart(cart.filter(c => c.id !== id));
    };

    const updateCartNote = (id, note) => {
        setCart(cart.map(c => c.id === id ? { ...c, notes: note } : c));
    };

    const calculateTotal = () => {
        return cart.reduce((sum, item) => sum + (item.price * item.qty * duration), 0);
    };

    const handleCheckout = async () => {
        if (!customer.name || !customer.phone || cart.length === 0) {
            alert('Lengkapi nama + nomor HP pelanggan dan pilih barang!');
            return;
        }

        const payload = {
            customer: {
                ...customer,
            },
            items: cart.map((item) => ({
                id: item.id,
                qty: item.qty,
                notes: item.notes || '',
            })),
            duration,
        };

        try {
            setIsSubmitting(true);
            await onCheckout(payload);
            setCart([]);
            setCustomer({
                name: '',
                phone: '',
                guarantee: 'KTP',
                guaranteeOther: '',
                idNumber: '',
            });
            setCustomerSearch('');
            setCustomerSuggestions([]);
            setDuration(1);
            alert('Transaksi berhasil disimpan!');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal menyimpan transaksi sewa.';
            alert(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePickCustomer = (pickedCustomer) => {
        setCustomer({
            name: pickedCustomer.name || '',
            phone: pickedCustomer.phone || '',
            guarantee: pickedCustomer.guarantee || 'KTP',
            guaranteeOther: pickedCustomer.guaranteeOther || '',
            idNumber: pickedCustomer.idNumber || '',
        });
        setCustomerSearch(`${pickedCustomer.name} (${pickedCustomer.phone})`);
        setCustomerSuggestions([]);
    };

    return (
        <div className="flex flex-col gap-6 py-4 lg:flex-row lg:gap-[30px] lg:py-5">
            <div className="flex-1">
                <div className="mb-5 flex flex-col gap-3 sm:mb-[30px] sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-[1.1rem] font-bold text-text-main sm:text-[1.2rem]">Pilih Barang</h3>
                    <div className="w-full rounded-lg border border-border bg-sidebar-bg px-4 py-2 sm:w-auto">
                        <select
                            className="w-full cursor-pointer border-none bg-transparent text-sm text-text-main outline-none sm:min-w-[180px]"
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                        >
                            <option value="all">Semua Kategori</option>
                            {categories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4 sm:mt-5 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] sm:gap-5">
                    {filteredItems.map(item => (
                        <div
                            key={item.id}
                            className={`bg-card-bg border border-border rounded-lg p-4 cursor-pointer transition-all hover:border-accent hover:transform hover:-translate-y-1 group ${item.stock <= 0 ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
                            onClick={() => addToCart(item)}
                        >
                            <div className="relative mb-3 h-[130px] overflow-hidden rounded-lg bg-[#1A2222] sm:mb-4 sm:h-[150px]">
                                <img className="w-full h-full object-cover transition-transform group-hover:scale-105" src={item.image || 'https://via.placeholder.com/150'} alt={item.name} />
                                {item.stock <= 0 && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-[0.8rem] font-bold uppercase">Habis</div>}
                            </div>
                            <div className="rc-info">
                                <h5 className="text-text-main font-semibold mb-1 line-clamp-1">{item.name}</h5>
                                <span className="text-accent font-bold text-[0.95rem] block">Rp {parseInt(item.price).toLocaleString()} <small className="text-[0.7em] font-normal text-text-muted">/hari</small></span>
                                <span className="text-text-muted text-[0.75rem] block mt-1">Tersedia: {item.stock}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="w-full lg:w-[400px]">
                <div className="rounded-lg border border-border bg-sidebar-bg p-4 sm:p-6 lg:sticky lg:top-5">
                    <h4 className="mb-4 border-b border-border pb-2 text-[1rem] font-bold uppercase tracking-wide text-accent sm:text-[1.1rem]">Detail Penyewa</h4>
                    <div className="space-y-4">
                        <div className="form-group relative">
                            <label className="block mb-1.5 text-[0.85rem] text-text-muted">Cari Customer Lama</label>
                            <input
                                className="w-full bg-bg-main border border-border p-2.5 rounded-lg text-text-main outline-none focus:border-accent transition-colors"
                                type="text"
                                placeholder="Ketik nama / nomor HP..."
                                value={customerSearch}
                                onChange={(e) => setCustomerSearch(e.target.value)}
                            />
                            {isSearchingCustomer && (
                                <p className="text-xs text-text-muted mt-1">Mencari customer...</p>
                            )}
                            {customerSuggestions.length > 0 && (
                                <div className="absolute left-0 right-0 mt-2 bg-sidebar-bg border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto z-20">
                                    {customerSuggestions.map((suggestion) => (
                                        <button
                                            key={suggestion.id}
                                            type="button"
                                            className="w-full text-left px-3 py-2 border-b border-border/40 last:border-b-0 hover:bg-black/5 dark:hover:bg-white/5"
                                            onClick={() => handlePickCustomer(suggestion)}
                                        >
                                            <span className="block text-sm text-text-main font-medium">{suggestion.name}</span>
                                            <span className="block text-xs text-text-muted">
                                                {suggestion.phone}{suggestion.idNumber ? ` • ${suggestion.idNumber}` : ''}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="form-group">
                            <label className="block mb-1.5 text-[0.85rem] text-text-muted">Nama Pelanggan</label>
                            <input
                                className="w-full bg-bg-main border border-border p-2.5 rounded-lg text-text-main outline-none focus:border-accent transition-colors"
                                type="text"
                                placeholder="Nama lengkap..."
                                value={customer.name}
                                onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label className="block mb-1.5 text-[0.85rem] text-text-muted">Nomor HP</label>
                            <input
                                className="w-full bg-bg-main border border-border p-2.5 rounded-lg text-text-main outline-none focus:border-accent transition-colors"
                                type="text"
                                placeholder="0812..."
                                value={customer.phone}
                                onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="form-group">
                                <label className="block mb-1.5 text-[0.85rem] text-text-muted">Jaminan</label>
                                <select
                                    className="w-full bg-bg-main border border-border p-2.5 rounded-lg text-text-main outline-none focus:border-accent transition-colors cursor-pointer"
                                    value={customer.guarantee}
                                    onChange={(e) => setCustomer({ ...customer, guarantee: e.target.value })}
                                >
                                    <option value="KTP">KTP</option>
                                    <option value="SIM">SIM</option>
                                    <option value="Paspor">Paspor</option>
                                    <option value="Lainnya">Lainnya</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="block mb-1.5 text-[0.85rem] text-text-muted">No. Identitas</label>
                                <input
                                    className="w-full bg-bg-main border border-border p-2.5 rounded-lg text-text-main outline-none focus:border-accent transition-colors"
                                    type="text"
                                    placeholder="Opsional, kosongkan jika tidak ada"
                                    value={customer.idNumber}
                                    onChange={(e) => setCustomer({ ...customer, idNumber: e.target.value })}
                                />
                            </div>
                        </div>
                        {customer.guarantee === 'Lainnya' && (
                            <div className="form-group">
                                <label className="block mb-1.5 text-[0.85rem] text-text-muted">Sebutkan Jaminan Lainnya</label>
                                <input
                                    className="w-full bg-bg-main border border-border p-2.5 rounded-lg text-text-main outline-none focus:border-accent transition-colors"
                                    type="text"
                                    placeholder="Contoh: STNK, Kartu Pelajar..."
                                    value={customer.guaranteeOther}
                                    onChange={(e) => setCustomer({ ...customer, guaranteeOther: e.target.value })}
                                />
                            </div>
                        )}
                    </div>

                    <div className="h-[1px] bg-border my-8"></div>

                    <h4 className="mb-4 border-b border-border pb-2 text-[1rem] font-bold uppercase tracking-wide text-accent sm:text-[1.1rem]">Keranjang Sewa</h4>
                    <div className="custom-scrollbar mb-6 max-h-[300px] space-y-4 overflow-y-auto pr-1 sm:pr-2">
                        {cart.length === 0 ? (
                            <div className="text-center py-6 text-text-muted italic text-sm">Belum ada barang dipilih.</div>
                        ) : (
                            cart.map((item) => (
                                <div className="bg-bg-main/50 border border-white/5 p-4 rounded-lg" key={item.id}>
                                    <div className="mb-3 flex items-start justify-between gap-3">
                                        <div className="flex min-w-0 flex-col">
                                            <span className="text-text-main font-medium">{item.name}</span>
                                            <small className="text-text-muted">Rp {parseInt(item.price).toLocaleString()} x {item.qty}</small>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <button className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-sidebar-bg text-text-main transition hover:border-accent" onClick={() => updateCartQty(item.id, -1)}>-</button>
                                            <span className="w-6 text-center text-sm font-bold">{item.qty}</span>
                                            <button className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-sidebar-bg text-text-main transition hover:border-accent" onClick={() => updateCartQty(item.id, 1)}>+</button>
                                            <button className="rounded p-2 text-[#e74c3c] hover:bg-[#e74c3c]/10" onClick={() => removeFromCart(item.id)}>&times;</button>
                                        </div>
                                    </div>
                                    <textarea
                                        className="w-full bg-sidebar-bg border border-border p-2 rounded text-[0.85rem] text-text-muted min-h-[50px] resize-none outline-none focus:border-accent"
                                        placeholder="Catatan (kondisi, kelengkapan...)"
                                        value={item.notes}
                                        onChange={(e) => updateCartNote(item.id, e.target.value)}
                                    ></textarea>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="mb-6">
                        <label className="block mb-1.5 text-[0.85rem] text-text-muted font-semibold">Durasi Sewa (Hari)</label>
                        <input
                            className="w-full bg-bg-main border border-border p-3 rounded-lg text-text-main text-center text-lg font-bold outline-none focus:border-accent"
                            type="number"
                            min="1"
                            value={duration}
                            onChange={(e) => {
                                const nextValue = Number.parseInt(e.target.value, 10);
                                setDuration(Number.isFinite(nextValue) ? Math.max(1, nextValue) : 1);
                            }}
                        />
                    </div>

                    <div className="rounded-lg border border-accent/20 bg-accent/10 p-4 sm:p-5">
                        <div className="mb-1 flex items-center justify-between gap-3">
                            <span className="text-text-muted text-[0.9rem]">Total Bayar</span>
                            <span className="text-text-muted text-[0.7rem] uppercase tracking-tighter">({duration} Hari)</span>
                        </div>
                        <h3 className="text-[1.5rem] font-bold text-accent sm:text-[1.8rem]">Rp {calculateTotal().toLocaleString()}</h3>
                        <button
                            disabled={isSubmitting}
                            className="w-full bg-accent text-white py-4 rounded-lg font-bold flex items-center justify-center gap-3 transition-all hover:bg-accent-hover shadow-[0_4px_15px_rgba(230,126,34,0.4)] mt-4 group disabled:opacity-60"
                            onClick={handleCheckout}
                        >
                            <i className="fas fa-shopping-cart group-hover:animate-bounce"></i> {isSubmitting ? 'Menyimpan...' : 'Konfirmasi Sewa'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Rental;

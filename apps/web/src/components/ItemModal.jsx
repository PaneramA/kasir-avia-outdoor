import React, { useEffect, useRef, useState } from 'react';

const ItemModal = ({ isOpen, setIsOpen, editingItem, categories, onSaveItem }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [modalCategories, setModalCategories] = useState([]);
    const categoriesRef = useRef(Array.isArray(categories) ? categories : []);
    const fileInputRef = useRef(null);
    const [formData, setFormData] = useState({
        name: '',
        category: '',
        stock: 1,
        price: '',
        image: '',
    });

    useEffect(() => {
        categoriesRef.current = Array.isArray(categories) ? categories : [];
    }, [categories]);

    useEffect(() => {
        categoriesRef.current = Array.isArray(categories) ? categories : [];
    }, [categories]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const snapshotCategories = categoriesRef.current;
        setModalCategories(snapshotCategories);
        setFormData(editingItem || {
            name: '',
            category: snapshotCategories[0] || '',
            stock: 1,
            price: '',
            image: '',
        });
    }, [isOpen, editingItem]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const safeCategories = Array.isArray(categories) ? categories : [];

        setFormData((previous) => {
            if (safeCategories.length === 0) {
                return previous.category ? { ...previous, category: '' } : previous;
            }

            if (previous.category && safeCategories.includes(previous.category)) {
                return previous;
            }

            return { ...previous, category: safeCategories[0] };
        });
    }, [categories, isOpen]);

    const handleInputChange = (e) => {
        const { id, value } = e.target;
        const field = id.replace('item-', '');
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const imageData = typeof event.target?.result === 'string' ? event.target.result : '';
                if (!imageData) {
                    return;
                }

                setFormData((prev) => ({ ...prev, image: imageData }));
            };
            reader.readAsDataURL(file);
        }

        // Allow selecting the same file again without requiring a different file first.
        e.target.value = '';
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const itemData = {
            name: formData.name,
            category: formData.category,
            stock: parseInt(formData.stock, 10),
            price: parseInt(formData.price, 10),
            image: formData.image || '',
        };

        if (!itemData.category) {
            alert('Kategori belum tersedia. Tambahkan kategori terlebih dahulu.');
            return;
        }

        if (!Number.isFinite(itemData.stock) || itemData.stock < 0) {
            alert('Stok harus berupa angka 0 atau lebih.');
            return;
        }

        if (!Number.isFinite(itemData.price) || itemData.price < 0) {
            alert('Harga harus berupa angka 0 atau lebih.');
            return;
        }

        try {
            setIsSubmitting(true);
            await onSaveItem(itemData, editingItem);
            setIsOpen(false);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal menyimpan barang.';
            alert(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const safeCategories = modalCategories;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-3 sm:p-4">
            <div className="max-h-[92vh] w-full max-w-[500px] overflow-hidden rounded-md border border-border bg-card-bg animate-[modalIn_0.3s_ease-out]">
                <div className="flex items-center justify-between border-b border-border px-4 py-4 sm:p-[20px_25px]">
                    <h3 className="text-[1.05rem] font-bold text-text-main sm:text-[1.2rem]">{editingItem ? 'Edit Barang' : 'Tambah Barang Baru'}</h3>
                    <button className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card-bg text-[1.5rem] text-text-muted transition hover:border-accent hover:text-text-main" onClick={() => setIsOpen(false)}>&times;</button>
                </div>
                <div className="max-h-[calc(92vh-72px)] overflow-y-auto p-4 sm:max-h-[calc(92vh-86px)] sm:p-[25px]">
                    <form onSubmit={handleSubmit}>
                        <div className="mb-5">
                            <label className="block mb-2 text-[0.9rem] text-text-muted">Nama Barang</label>
                            <input
                                className="w-full rounded-md border border-border bg-bg-main p-3 text-text-main outline-none transition-colors focus:border-accent"
                                type="text"
                                id="item-name"
                                placeholder="Contoh: Tenda Dome 4P"
                                value={formData.name}
                                onChange={handleInputChange}
                                required
                            />
                        </div>
                        <div className="mb-5 grid grid-cols-1 gap-[15px] sm:grid-cols-2">
                            <div>
                                <label className="block mb-2 text-[0.9rem] text-text-muted">Kategori</label>
                                <select
                                    className="w-full cursor-pointer rounded-md border border-border bg-bg-main p-3 text-text-main outline-none transition-colors focus:border-accent"
                                    id="item-category"
                                    value={formData.category}
                                    onChange={handleInputChange}
                                >
                                    {safeCategories.map((cat) => (
                                        <option key={cat} value={cat}>
                                            {cat}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block mb-2 text-[0.9rem] text-text-muted">Stok Awal</label>
                                <input
                                    className="w-full rounded-md border border-border bg-bg-main p-3 text-text-main outline-none transition-colors focus:border-accent"
                                    type="number"
                                    id="item-stock"
                                    min="0"
                                    value={formData.stock}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>
                        </div>
                        <div className="mb-5">
                            <label className="block mb-2 text-[0.9rem] text-text-muted">Harga Sewa / Hari (Rp)</label>
                            <input
                                className="w-full rounded-md border border-border bg-bg-main p-3 text-text-main outline-none transition-colors focus:border-accent"
                                type="number"
                                id="item-price"
                                placeholder="25000"
                                min="0"
                                value={formData.price}
                                onChange={handleInputChange}
                                required
                            />
                        </div>
                        <div className="mb-5">
                            <label className="block mb-2 text-[0.9rem] text-text-muted">Gambar Barang</label>
                            <div className="cursor-pointer rounded-md border-2 border-dashed border-border bg-bg-main p-5 text-center transition hover:border-accent hover:bg-surface-hover sm:p-[30px]" onClick={() => fileInputRef.current?.click()}>
                                {formData.image ? (
                                    <>
                                        <img src={formData.image} alt="Preview" className="mt-[10px] block max-h-[150px] w-full rounded-md object-cover" />
                                        <div className="mt-2 text-accent text-sm flex items-center justify-center gap-2">
                                            <i className="fas fa-camera"></i> Ganti Gambar
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <i className="fas fa-cloud-upload-alt text-[2rem] text-text-muted mb-2.5"></i>
                                        <p className="text-text-muted">Klik untuk upload gambar</p>
                                    </>
                                )}
                                <input
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    ref={fileInputRef}
                                    onChange={handleImageUpload}
                                />
                            </div>
                        </div>
                        <button disabled={isSubmitting} type="submit" className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-md bg-accent px-5 py-3 font-semibold text-white transition hover:bg-accent-hover disabled:opacity-60">
                            <span>{isSubmitting ? 'Menyimpan...' : editingItem ? 'Update Barang' : 'Simpan Barang'}</span>
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default ItemModal;

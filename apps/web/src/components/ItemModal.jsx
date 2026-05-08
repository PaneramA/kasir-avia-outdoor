import React, { useState } from 'react';

const ItemModal = ({ isOpen, setIsOpen, editingItem, categories, onSaveItem }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const getInitialFormData = () => (editingItem || {
        name: '',
        category: categories[0] || '',
        stock: 1,
        price: '',
        image: '',
    });
    const [formData, setFormData] = useState(getInitialFormData);

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
                setFormData((prev) => ({ ...prev, image: event.target.result }));
            };
            reader.readAsDataURL(file);
        }
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

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-3 backdrop-blur-[5px] sm:p-4">
            <div className="max-h-[92vh] w-full max-w-[500px] overflow-hidden rounded-DEFAULT border border-border bg-sidebar-bg animate-[modalIn_0.3s_ease-out]">
                <div className="flex items-center justify-between border-b border-border px-4 py-4 sm:p-[20px_25px]">
                    <h3 className="text-[1.05rem] font-bold text-text-main sm:text-[1.2rem]">{editingItem ? 'Edit Barang' : 'Tambah Barang Baru'}</h3>
                    <button className="flex h-10 w-10 items-center justify-center rounded-full border border-transparent bg-transparent text-[1.5rem] text-text-muted transition hover:border-border hover:text-text-main" onClick={() => setIsOpen(false)}>&times;</button>
                </div>
                <div className="max-h-[calc(92vh-72px)] overflow-y-auto p-4 sm:max-h-[calc(92vh-86px)] sm:p-[25px]">
                    <form onSubmit={handleSubmit}>
                        <div className="mb-5">
                            <label className="block mb-2 text-[0.9rem] text-text-muted">Nama Barang</label>
                            <input
                                className="w-full bg-bg-main border border-border p-3 rounded-lg text-text-main outline-none focus:border-accent transition-colors"
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
                                    className="w-full bg-bg-main border border-border p-3 rounded-lg text-text-main outline-none focus:border-accent transition-colors cursor-pointer"
                                    id="item-category"
                                    value={formData.category}
                                    onChange={handleInputChange}
                                >
                                    {categories.map((cat) => (
                                        <option key={cat} value={cat}>
                                            {cat}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block mb-2 text-[0.9rem] text-text-muted">Stok Awal</label>
                                <input
                                    className="w-full bg-bg-main border border-border p-3 rounded-lg text-text-main outline-none focus:border-accent transition-colors"
                                    type="number"
                                    id="item-stock"
                                    min="1"
                                    value={formData.stock}
                                    onChange={handleInputChange}
                                    required
                                />
                            </div>
                        </div>
                        <div className="mb-5">
                            <label className="block mb-2 text-[0.9rem] text-text-muted">Harga Sewa / Hari (Rp)</label>
                            <input
                                className="w-full bg-bg-main border border-border p-3 rounded-lg text-text-main outline-none focus:border-accent transition-colors"
                                type="number"
                                id="item-price"
                                placeholder="25000"
                                value={formData.price}
                                onChange={handleInputChange}
                                required
                            />
                        </div>
                        <div className="mb-5">
                            <label className="block mb-2 text-[0.9rem] text-text-muted">Gambar Barang</label>
                            <div className="cursor-pointer rounded-DEFAULT border-2 border-dashed border-border p-5 text-center transition hover:border-accent hover:bg-accent/5 sm:p-[30px]" onClick={() => document.getElementById('item-image-input').click()}>
                                {formData.image ? (
                                    <>
                                        <img src={formData.image} alt="Preview" className="mt-[10px] max-h-[150px] w-full object-cover rounded-lg block" />
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
                                    id="item-image-input"
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                />
                            </div>
                        </div>
                        <button disabled={isSubmitting} type="submit" className="w-full flex items-center justify-center gap-2 bg-accent px-5 py-3 rounded-DEFAULT text-white font-semibold transition hover:bg-accent-hover shadow-[0_4px_15px_rgba(230,126,34,0.3)] mt-2.5 disabled:opacity-60">
                            <span>{isSubmitting ? 'Menyimpan...' : editingItem ? 'Update Barang' : 'Simpan Barang'}</span>
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default ItemModal;

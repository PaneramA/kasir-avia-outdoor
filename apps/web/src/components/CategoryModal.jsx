import React, { useState } from 'react';

const CategoryModal = ({ isOpen, setIsOpen, categories, onAddCategory, onDeleteCategory }) => {
    const [newCatName, setNewCatName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleDeleteCategory = async (categoryName) => {
        if (!window.confirm('Hapus kategori ini?')) {
            return;
        }

        try {
            setIsSubmitting(true);
            await onDeleteCategory(categoryName);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal menghapus kategori.';
            alert(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAddCategory = async () => {
        const trimmed = newCatName.trim();
        if (!trimmed) {
            return;
        }

        try {
            setIsSubmitting(true);
            await onAddCategory(trimmed);
            setNewCatName('');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal menambah kategori.';
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
                    <h3 className="text-[1.05rem] font-bold text-text-main sm:text-[1.2rem]">Kelola Kategori</h3>
                    <button className="flex h-10 w-10 items-center justify-center rounded-full border border-transparent bg-transparent text-[1.5rem] text-text-muted transition hover:border-border hover:text-text-main" onClick={() => setIsOpen(false)}>&times;</button>
                </div>
                <div className="max-h-[calc(92vh-72px)] overflow-y-auto p-4 sm:max-h-[calc(92vh-86px)] sm:p-[25px]">
                    <div className="mb-5 space-y-2">
                        {categories.map((cat) => (
                            <div className="group flex items-center justify-between rounded-lg border border-border bg-bg-main p-3 sm:p-[12px_20px] transition-all duration-300 hover:border-accent" key={cat}>
                                <span className="text-text-main font-medium">{cat}</span>
                                <button disabled={isSubmitting} className="flex h-10 w-10 items-center justify-center rounded-full bg-transparent text-[1.4rem] text-[#e74c3c] transition-transform hover:scale-125 disabled:opacity-60" onClick={() => handleDeleteCategory(cat)}>&times;</button>
                            </div>
                        ))}
                    </div>
                    <div className="mt-6 pt-6 border-t border-border">
                        <label className="block mb-2 text-[0.9rem] text-text-muted">Tambah Kategori Baru</label>
                        <div className="flex flex-col gap-2.5 sm:flex-row">
                            <input
                                className="flex-1 bg-bg-main border border-border p-3 rounded-lg text-text-main outline-none focus:border-accent transition-colors"
                                type="text"
                                placeholder="Nama kategori..."
                                value={newCatName}
                                onChange={(e) => setNewCatName(e.target.value)}
                            />
                            <button disabled={isSubmitting} className="min-h-11 rounded-lg bg-accent px-6 py-3 font-semibold text-white transition hover:bg-accent-hover shadow-lg whitespace-nowrap disabled:opacity-60" onClick={handleAddCategory}>
                                {isSubmitting ? 'Proses...' : 'Simpan'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CategoryModal;

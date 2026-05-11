import React, { useEffect, useState } from 'react';
import ItemModal from '../components/ItemModal';
import CategoryModal from '../components/CategoryModal';
import ViewModeToggle from '../components/ViewModeToggle';

const INVENTORY_VIEW_STORAGE_KEY = 'avia_inventory_view_mode';

const getInitialInventoryViewMode = () => {
    if (typeof window === 'undefined') {
        return 'grid';
    }

    const saved = window.localStorage.getItem(INVENTORY_VIEW_STORAGE_KEY);
    return saved === 'list' ? 'list' : 'grid';
};

const Inventory = ({ inventory, categories, onSaveItem, onDeleteItem, onAddCategory, onDeleteCategory }) => {
    const [isItemModalOpen, setIsItemModalOpen] = useState(false);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [inventoryViewMode, setInventoryViewMode] = useState(getInitialInventoryViewMode);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        window.localStorage.setItem(INVENTORY_VIEW_STORAGE_KEY, inventoryViewMode);
    }, [inventoryViewMode]);

    const handleDeleteItem = async (id) => {
        if (!window.confirm('Apakah Anda yakin ingin menghapus barang ini?')) {
            return;
        }

        try {
            await onDeleteItem(id);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal menghapus barang.';
            alert(message);
        }
    };

    const handleEditItem = (item) => {
        setEditingItem(item);
        setIsItemModalOpen(true);
    };

    const handleAddItem = () => {
        setEditingItem(null);
        setIsItemModalOpen(true);
    };

    return (
        <div className="py-4 sm:py-5">
            <div className="mb-6 flex flex-col gap-4 sm:mb-[30px] sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-[1.1rem] font-bold text-text-main sm:text-[1.2rem]">Daftar Barang</h3>
                    <p className="text-[0.9rem] text-text-muted">
                        Kelola stok, harga, dan kategori peralatan.
                    </p>
                </div>
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-4">
                    <ViewModeToggle
                        value={inventoryViewMode}
                        onChange={setInventoryViewMode}
                        containerClassName="min-h-11 rounded-DEFAULT"
                        buttonClassName="px-3 py-2 text-xs"
                    />
                    <button className="flex min-h-11 w-full items-center justify-center gap-2 rounded-DEFAULT border border-border bg-sidebar-bg px-5 py-2.5 font-semibold text-text-main transition hover:bg-white/5 sm:w-auto" onClick={() => setIsCategoryModalOpen(true)}>
                        <i className="fas fa-tags"></i> Kategori
                    </button>
                    <button className="flex min-h-11 w-full items-center justify-center gap-2 rounded-DEFAULT bg-accent px-5 py-2.5 font-semibold text-white transition hover:bg-accent-hover shadow-[0_4px_15px_rgba(230,126,34,0.3)] sm:w-auto" onClick={handleAddItem}>
                        <i className="fas fa-plus"></i> Tambah Barang
                    </button>
                </div>
            </div>

            {inventory.length === 0 ? (
                <div className="text-center py-10 text-text-muted">
                    Belum ada barang di inventaris. Silakan tambah barang baru.
                </div>
            ) : inventoryViewMode === 'grid' ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 sm:gap-5 lg:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] lg:gap-[25px]">
                    {inventory.map((item) => (
                        <div className="bg-card-bg border border-border rounded-DEFAULT overflow-hidden transition-all hover:border-accent group" key={item.id}>
                            <div className="relative h-[160px] overflow-hidden bg-[#1A2222] sm:h-[180px]">
                                <img
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                    src={item.image || 'https://via.placeholder.com/300x200?text=No+Image'}
                                    alt={item.name}
                                />
                                <span className={`absolute right-[10px] top-[10px] rounded-[20px] px-3 py-[5px] text-[0.72rem] font-bold uppercase ${item.stock > 0 ? 'bg-[#2ecc71] text-white' : 'bg-[#e74c3c] text-white'}`}>
                                    {item.stock > 0 ? 'Available' : 'Out of Stock'}
                                </span>
                                <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/35 opacity-100 transition-opacity duration-300 sm:opacity-0 sm:group-hover:opacity-100">
                                    <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full bg-[#3498db] text-[1.1rem] text-white transition hover:scale-110" onClick={() => handleEditItem(item)}>
                                        <i className="fas fa-edit"></i>
                                    </button>
                                    <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e74c3c] text-[1.1rem] text-white transition hover:scale-110" onClick={() => handleDeleteItem(item.id)}>
                                        <i className="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                            <div className="p-4 sm:p-5">
                                <span className="text-[0.8rem] text-text-muted mb-3 block">{item.category}</span>
                                <h4 className="mb-[5px] text-[1rem] font-display font-semibold text-text-main sm:text-[1.1rem]">{item.name}</h4>
                                <div className="mt-[15px] flex items-center justify-between gap-2 border-t border-border pt-[15px]">
                                    <span className="text-[1rem] font-bold text-accent sm:text-[1.1rem]">
                                        Rp {parseInt(item.price, 10).toLocaleString()} <small className="text-[0.7em] font-normal text-text-muted">/hari</small>
                                    </span>
                                    <span className="text-[0.85rem] text-text-muted">Stok: {item.stock}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col gap-3 sm:gap-4">
                    {inventory.map((item) => (
                        <div key={item.id} className="rounded-DEFAULT border border-border bg-card-bg p-3 sm:p-4">
                            <div className="flex items-center gap-3 sm:gap-4">
                                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[#1A2222] sm:h-20 sm:w-20">
                                    <img
                                        className="h-full w-full object-cover"
                                        src={item.image || 'https://via.placeholder.com/160?text=No+Image'}
                                        alt={item.name}
                                    />
                                </div>

                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-text-main sm:text-base">{item.name}</p>
                                    <p className="text-xs text-text-muted sm:text-sm">{item.category}</p>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                                        <span className="font-bold text-accent">Rp {parseInt(item.price, 10).toLocaleString()}/hari</span>
                                        <span className="text-text-muted">Stok: {item.stock}</span>
                                        <span className={`rounded-full px-2 py-[2px] text-[0.65rem] font-semibold uppercase ${item.stock > 0 ? 'bg-[#2ecc71]/20 text-[#2ecc71]' : 'bg-[#e74c3c]/20 text-[#e74c3c]'}`}>
                                            {item.stock > 0 ? 'Available' : 'Out of Stock'}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                    <button type="button" className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-sidebar-bg text-[#3498db] transition hover:border-[#3498db]/60" onClick={() => handleEditItem(item)}>
                                        <i className="fas fa-edit"></i>
                                    </button>
                                    <button type="button" className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-sidebar-bg text-[#e74c3c] transition hover:border-[#e74c3c]/60" onClick={() => handleDeleteItem(item.id)}>
                                        <i className="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {isItemModalOpen && (
                <ItemModal
                    isOpen={isItemModalOpen}
                    setIsOpen={setIsItemModalOpen}
                    editingItem={editingItem}
                    categories={categories}
                    onSaveItem={onSaveItem}
                />
            )}

            {isCategoryModalOpen && (
                <CategoryModal
                    isOpen={isCategoryModalOpen}
                    setIsOpen={setIsCategoryModalOpen}
                    categories={categories}
                    onAddCategory={onAddCategory}
                    onDeleteCategory={onDeleteCategory}
                />
            )}
        </div>
    );
};

export default Inventory;

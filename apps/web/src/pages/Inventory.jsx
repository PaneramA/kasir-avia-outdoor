import React, { useEffect, useMemo, useState } from 'react';
import useSWRInfinite from 'swr/infinite';
import ItemModal from '../components/ItemModal';
import CategoryModal from '../components/CategoryModal';
import ViewModeToggle from '../components/ViewModeToggle';
import { fetchItemsPage, resolveApiAssetUrl, uploadItemImage } from '../lib/api';
import { APP_CACHE_KEYS } from '../lib/appCache';

const INVENTORY_VIEW_STORAGE_KEY = 'avia_inventory_view_mode';

const getInitialInventoryViewMode = () => {
    if (typeof window === 'undefined') {
        return 'grid';
    }

    const saved = window.localStorage.getItem(INVENTORY_VIEW_STORAGE_KEY);
    return saved === 'list' ? 'list' : 'grid';
};

const Inventory = ({
    userId,
    tenantId,
    branchId,
    categories,
    onSaveItem,
    onDeleteItem,
    onRestoreItem,
    onAddCategory,
    onDeleteCategory,
}) => {
    const [isItemModalOpen, setIsItemModalOpen] = useState(false);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [inventoryViewMode, setInventoryViewMode] = useState(getInitialInventoryViewMode);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const [inventoryStatus, setInventoryStatus] = useState('active');

    useEffect(() => {
        const timeoutId = window.setTimeout(() => setDebouncedSearchQuery(searchQuery.trim()), 250);
        return () => window.clearTimeout(timeoutId);
    }, [searchQuery]);

    const {
        data: inventoryPages = [],
        error: inventoryError,
        isLoading: isInventoryLoading,
        isValidating: isInventoryValidating,
        setSize,
    } = useSWRInfinite(
        (pageIndex, previousPageData) => {
            if (!userId || !tenantId || !branchId) {
                return null;
            }

            if (pageIndex > 0 && !previousPageData?.nextCursor) {
                return null;
            }

            return APP_CACHE_KEYS.inventoryPage(
                userId,
                tenantId,
                branchId,
                debouncedSearchQuery,
                pageIndex === 0 ? '' : previousPageData.nextCursor,
                inventoryStatus,
            );
        },
        ([, , , , query, cursor, status]) => fetchItemsPage({ query, cursor, status }),
        { keepPreviousData: true },
    );

    useEffect(() => {
        void setSize(1);
    }, [debouncedSearchQuery, inventoryStatus, setSize]);

    const inventory = useMemo(
        () => inventoryPages.flatMap((page) => (Array.isArray(page?.items) ? page.items : [])),
        [inventoryPages],
    );
    const hasMoreInventory = Boolean(inventoryPages.at(-1)?.nextCursor);
    const isLoadingMoreInventory = isInventoryValidating && inventoryPages.length > 0;

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        window.localStorage.setItem(INVENTORY_VIEW_STORAGE_KEY, inventoryViewMode);
    }, [inventoryViewMode]);

    const handleArchiveItem = async (id) => {
        if (!window.confirm('Arsipkan barang ini? Barang tidak akan muncul pada transaksi baru.')) {
            return;
        }

        try {
            await onDeleteItem(id);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal mengarsipkan barang.';
            alert(message);
        }
    };

    const handleRestoreItem = async (id) => {
        if (!window.confirm('Pulihkan barang ini ke inventaris aktif?')) {
            return;
        }

        try {
            await onRestoreItem(id);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal memulihkan barang.';
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
        <div className="pt-0 pb-4 sm:pb-5 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:overflow-hidden lg:pb-0">
            <div data-testid="inventory-toolbar" className="mb-4 flex flex-col gap-3 rounded-md border border-border bg-white p-3 lg:shrink-0 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    <div data-testid="inventory-status-tabs" className="grid min-h-10 grid-cols-2 rounded-md border border-border bg-bg-main p-1" aria-label="Status inventaris">
                        <button
                            type="button"
                            aria-pressed={inventoryStatus === 'active'}
                            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${inventoryStatus === 'active' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-main'}`}
                            onClick={() => setInventoryStatus('active')}
                        >
                            Aktif
                        </button>
                        <button
                            type="button"
                            aria-pressed={inventoryStatus === 'archived'}
                            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${inventoryStatus === 'archived' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-main'}`}
                            onClick={() => setInventoryStatus('archived')}
                        >
                            Diarsipkan
                        </button>
                    </div>
                    <ViewModeToggle
                        value={inventoryViewMode}
                        onChange={setInventoryViewMode}
                        containerClassName="min-h-10 rounded-md"
                        buttonClassName="px-3 py-1.5 text-xs"
                    />
                </div>

                <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center xl:w-auto">
                    <div className="relative w-full sm:w-72">
                        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-muted"></i>
                        <input
                            type="search"
                            className="min-h-10 w-full rounded-md border border-border bg-white px-3 pl-9 text-sm text-text-main outline-none placeholder:text-text-muted focus:border-accent"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="Cari barang atau kategori"
                        />
                    </div>
                    <button className="flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-text-main transition hover:bg-surface-hover sm:w-auto" onClick={() => setIsCategoryModalOpen(true)}>
                        <i className="fas fa-tags"></i> Kategori
                    </button>
                    <button className="flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover sm:w-auto" onClick={handleAddItem}>
                        <i className="fas fa-plus"></i> Tambah Barang
                    </button>
                </div>
            </div>

            <div className="custom-scrollbar lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-y-contain lg:pr-2">
                {inventoryError ? (
                    <div className="py-10 text-center text-red-600">{inventoryError.message || 'Gagal memuat inventaris.'}</div>
                ) : isInventoryLoading ? (
                    <div className="py-10 text-center text-text-muted">Memuat inventaris...</div>
                ) : inventory.length === 0 ? (
                    <div className="text-center py-10 text-text-muted">
                        {debouncedSearchQuery
                            ? 'Barang tidak ditemukan.'
                            : inventoryStatus === 'archived'
                                ? 'Belum ada barang yang diarsipkan.'
                                : 'Belum ada barang di inventaris. Silakan tambah barang baru.'}
                    </div>
                ) : inventoryViewMode === 'grid' ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 sm:gap-5 lg:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] lg:gap-[25px]">
                        {inventory.map((item) => (
                            <div className="group overflow-hidden rounded-md border border-border bg-card-bg transition-colors hover:border-accent" key={item.id}>
                                <div className="relative h-[160px] overflow-hidden bg-bg-main sm:h-[180px]">
                                    <img
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                        src={resolveApiAssetUrl(item.image) || 'https://via.placeholder.com/300x200?text=No+Image'}
                                        alt={item.name}
                                    />
                                    <span className={`absolute right-[10px] top-[10px] rounded-md px-3 py-[5px] text-[0.72rem] font-bold uppercase ${inventoryStatus === 'archived' ? 'bg-[#6b7280] text-white' : item.stock > 0 ? 'bg-accent text-white' : 'bg-red-600 text-white'}`}>
                                        {inventoryStatus === 'archived' ? 'Archived' : item.stock > 0 ? 'Available' : 'Out of Stock'}
                                    </span>
                                    <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/35 opacity-100 transition-opacity duration-300 sm:opacity-0 sm:group-hover:opacity-100">
                                        {inventoryStatus === 'active' ? (
                                            <>
                                                <button type="button" aria-label={`Edit ${item.name}`} title="Edit barang" className="flex h-11 w-11 items-center justify-center rounded-md bg-accent text-[1.1rem] text-white transition hover:bg-accent-hover" onClick={() => handleEditItem(item)}>
                                                    <i className="fas fa-edit"></i>
                                                </button>
                                                <button type="button" aria-label={`Arsipkan ${item.name}`} title="Arsipkan barang" className="flex h-11 w-11 items-center justify-center rounded-md bg-red-600 text-[1.1rem] text-white transition hover:bg-red-700" onClick={() => handleArchiveItem(item.id)}>
                                                    <i className="fas fa-box-archive"></i>
                                                </button>
                                            </>
                                        ) : (
                                            <button type="button" aria-label={`Pulihkan ${item.name}`} title="Pulihkan barang" className="flex h-11 w-11 items-center justify-center rounded-md bg-accent text-[1.1rem] text-white transition hover:bg-accent-hover" onClick={() => handleRestoreItem(item.id)}>
                                                <i className="fas fa-rotate-left"></i>
                                            </button>
                                        )}
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
                            <div key={item.id} className="rounded-md border border-border bg-card-bg p-3 sm:p-4">
                                <div className="flex items-center gap-3 sm:gap-4">
                                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-bg-main sm:h-20 sm:w-20">
                                        <img
                                            className="h-full w-full object-cover"
                                            src={resolveApiAssetUrl(item.image) || 'https://via.placeholder.com/160?text=No+Image'}
                                            alt={item.name}
                                        />
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-text-main sm:text-base">{item.name}</p>
                                        <p className="text-xs text-text-muted sm:text-sm">{item.category}</p>
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                                            <span className="font-bold text-accent">Rp {parseInt(item.price, 10).toLocaleString()}/hari</span>
                                            <span className="text-text-muted">Stok: {item.stock}</span>
                                            <span className={`rounded-md px-2 py-[2px] text-[0.65rem] font-semibold uppercase ${inventoryStatus === 'archived' ? 'bg-[#6b7280] text-white' : item.stock > 0 ? 'bg-accent text-white' : 'bg-red-600 text-white'}`}>
                                                {inventoryStatus === 'archived' ? 'Archived' : item.stock > 0 ? 'Available' : 'Out of Stock'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-2">
                                        {inventoryStatus === 'active' ? (
                                            <>
                                                <button type="button" aria-label={`Edit ${item.name}`} title="Edit barang" className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card-bg text-accent transition hover:border-accent hover:bg-surface-hover" onClick={() => handleEditItem(item)}>
                                                    <i className="fas fa-edit"></i>
                                                </button>
                                                <button type="button" aria-label={`Arsipkan ${item.name}`} title="Arsipkan barang" className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card-bg text-red-600 transition hover:border-red-600 hover:bg-surface-hover" onClick={() => handleArchiveItem(item.id)}>
                                                    <i className="fas fa-box-archive"></i>
                                                </button>
                                            </>
                                        ) : (
                                            <button type="button" aria-label={`Pulihkan ${item.name}`} title="Pulihkan barang" className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card-bg text-accent transition hover:border-accent hover:bg-surface-hover" onClick={() => handleRestoreItem(item.id)}>
                                                <i className="fas fa-rotate-left"></i>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {hasMoreInventory && (
                <div className="mt-4 flex justify-center lg:shrink-0">
                    <button
                        type="button"
                        className="rounded-md border border-border bg-card-bg px-4 py-2 text-sm font-semibold text-text-main transition hover:border-accent disabled:cursor-wait disabled:opacity-60"
                        onClick={() => { void setSize((size) => size + 1); }}
                        disabled={isLoadingMoreInventory}
                    >
                        {isLoadingMoreInventory ? 'Memuat...' : 'Muat barang berikutnya'}
                    </button>
                </div>
            )}

            {isItemModalOpen && (
                <ItemModal
                    isOpen={isItemModalOpen}
                    setIsOpen={setIsItemModalOpen}
                    editingItem={editingItem}
                    categories={categories}
                    onSaveItem={onSaveItem}
                    onUploadItemImage={uploadItemImage}
                    resolveImageUrl={resolveApiAssetUrl}
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

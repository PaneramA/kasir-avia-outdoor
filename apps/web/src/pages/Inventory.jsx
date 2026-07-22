import React, { useEffect, useMemo, useRef, useState } from 'react';
import useSWRInfinite from 'swr/infinite';
import ItemModal from '../components/ItemModal';
import CategoryModal from '../components/CategoryModal';
import ViewModeToggle from '../components/ViewModeToggle';
import { fetchItemsPage } from '../lib/api';
import { APP_CACHE_KEYS } from '../lib/appCache';

const INVENTORY_VIEW_STORAGE_KEY = 'avia_inventory_view_mode';

const getInitialInventoryViewMode = () => {
    if (typeof window === 'undefined') {
        return 'grid';
    }

    const saved = window.localStorage.getItem(INVENTORY_VIEW_STORAGE_KEY);
    return saved === 'list' ? 'list' : 'grid';
};

const IMPORT_FIELD_ALIASES = {
    name: ['name', 'nama', 'namabarang', 'barang', 'item'],
    category: ['category', 'kategori'],
    stock: ['stock', 'stok', 'qty', 'jumlah', 'jumlahstok'],
    price: ['price', 'harga', 'hargasewa', 'hargaperhari', 'hargaharian'],
    image: ['image', 'gambar', 'imageurl', 'urlgambar', 'foto', 'linkgambar'],
};

const INVENTORY_IMPORT_TEMPLATE_ROWS = [
    ['name', 'category', 'stock', 'price', 'image'],
    ['Tenda Dome 4P', 'Tenda', 5, 150000, 'https://contoh-url-gambar.com/tenda-dome-4p.jpg'],
    ['Carrier 60L', 'Tas Gunung', 8, 85000, ''],
];

const normalizeImportHeader = (value) => String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const getImportFieldValue = (row, fieldName) => {
    const aliases = IMPORT_FIELD_ALIASES[fieldName] || [];
    const matchEntry = Object.entries(row || {}).find(([key]) => aliases.includes(normalizeImportHeader(key)));
    return matchEntry ? matchEntry[1] : '';
};

const parseImportNumber = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.trunc(value);
    }

    const raw = String(value ?? '').trim();
    if (!raw) {
        return NaN;
    }

    const normalized = raw.replace(/[^\d-]/g, '');
    if (!normalized || normalized === '-') {
        return NaN;
    }

    return Number.parseInt(normalized, 10);
};

const parseImportRow = (row, fallbackRowNumber) => {
    const rowNumber = Number.isInteger(row?.__rowNum__) ? row.__rowNum__ + 1 : fallbackRowNumber;
    const item = {
        name: String(getImportFieldValue(row, 'name') || '').trim(),
        category: String(getImportFieldValue(row, 'category') || '').trim(),
        stock: parseImportNumber(getImportFieldValue(row, 'stock')),
        price: parseImportNumber(getImportFieldValue(row, 'price')),
        image: String(getImportFieldValue(row, 'image') || '').trim(),
    };

    const errors = [];
    if (!item.name) {
        errors.push('Nama barang wajib diisi.');
    }

    if (!item.category) {
        errors.push('Kategori wajib diisi.');
    }

    if (!Number.isFinite(item.stock) || item.stock < 0) {
        errors.push('Stok harus angka 0 atau lebih.');
    }

    if (!Number.isFinite(item.price) || item.price < 0) {
        errors.push('Harga harus angka 0 atau lebih.');
    }

    return { rowNumber, item, errors };
};

const escapeCsvCell = (value) => {
    const text = String(value ?? '');
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
    }

    return text;
};

const Inventory = ({
    userId,
    tenantId,
    branchId,
    categories,
    onSaveItem,
    onImportItems,
    onDeleteItem,
    onRestoreItem,
    onAddCategory,
    onDeleteCategory,
}) => {
    const [isItemModalOpen, setIsItemModalOpen] = useState(false);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [inventoryViewMode, setInventoryViewMode] = useState(getInitialInventoryViewMode);
    const [isImporting, setIsImporting] = useState(false);
    const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const [inventoryStatus, setInventoryStatus] = useState('active');
    const importFileInputRef = useRef(null);

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

    const handleOpenImportDialog = () => {
        importFileInputRef.current?.click();
    };

    const downloadTemplateCsvFallback = () => {
        const csv = INVENTORY_IMPORT_TEMPLATE_ROWS
            .map((row) => row.map(escapeCsvCell).join(','))
            .join('\n');

        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'template-import-inventaris.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleDownloadTemplate = async () => {
        setIsDownloadingTemplate(true);
        try {
            const XLSX = await import('xlsx');
            const worksheet = XLSX.utils.aoa_to_sheet(INVENTORY_IMPORT_TEMPLATE_ROWS);
            worksheet['!cols'] = [
                { wch: 26 },
                { wch: 20 },
                { wch: 12 },
                { wch: 14 },
                { wch: 48 },
            ];

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Template Inventaris');
            XLSX.writeFile(workbook, 'template-import-inventaris.xlsx');
        } catch {
            downloadTemplateCsvFallback();
            alert('Template Excel gagal dibuat. Template CSV didownload sebagai pengganti.');
        } finally {
            setIsDownloadingTemplate(false);
        }
    };

    const fallbackImportItems = async (items) => {
        const failedItems = [];
        let createdCount = 0;

        for (const item of items) {
            try {
                await onSaveItem(item, null);
                createdCount += 1;
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Gagal menyimpan item.';
                failedItems.push({
                    name: String(item?.name || '').trim() || '-',
                    message,
                });
            }
        }

        return {
            total: items.length,
            createdCount,
            createdCategories: [],
            failedItems,
        };
    };

    const handleImportFile = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';

        if (!file) {
            return;
        }

        setIsImporting(true);
        try {
            const XLSX = await import('xlsx');
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });
            const firstSheetName = workbook.SheetNames?.[0];

            if (!firstSheetName) {
                alert('Sheet tidak ditemukan di file yang diupload.');
                return;
            }

            const worksheet = workbook.Sheets[firstSheetName];
            const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

            if (!Array.isArray(rows) || rows.length === 0) {
                alert('File kosong atau tidak memiliki baris data.');
                return;
            }

            const parsedRows = rows.map((row, index) => parseImportRow(row, index + 2));
            const validItems = parsedRows.filter((entry) => entry.errors.length === 0).map((entry) => entry.item);
            const invalidRows = parsedRows.filter((entry) => entry.errors.length > 0);

            if (validItems.length === 0) {
                const errorPreview = invalidRows
                    .slice(0, 5)
                    .map((entry) => `Baris ${entry.rowNumber}: ${entry.errors.join(' ')}`)
                    .join('\n');
                alert(`Tidak ada data valid untuk diimport.\n\n${errorPreview}`);
                return;
            }

            const importExecutor = typeof onImportItems === 'function' ? onImportItems : fallbackImportItems;
            const result = await importExecutor(validItems, { createMissingCategories: true });

            const failedItems = Array.isArray(result?.failedItems) ? result.failedItems : [];
            const createdCategories = Array.isArray(result?.createdCategories) ? result.createdCategories : [];
            const summaryLines = [
                'Import selesai.',
                `Total baris dibaca: ${rows.length}`,
                `Valid: ${validItems.length}`,
                `Berhasil disimpan: ${result?.createdCount || 0}`,
                `Gagal validasi: ${invalidRows.length}`,
                `Gagal simpan: ${failedItems.length}`,
            ];

            if (createdCategories.length > 0) {
                summaryLines.push(`Kategori baru dibuat: ${createdCategories.join(', ')}`);
            }

            if (invalidRows.length > 0) {
                const validationPreview = invalidRows
                    .slice(0, 3)
                    .map((entry) => `Baris ${entry.rowNumber}: ${entry.errors.join(' ')}`)
                    .join('\n');
                summaryLines.push(`Contoh validasi gagal:\n${validationPreview}`);
            }

            if (failedItems.length > 0) {
                const saveFailurePreview = failedItems
                    .slice(0, 3)
                    .map((entry) => `${entry.name}: ${entry.message}`)
                    .join('\n');
                summaryLines.push(`Contoh gagal simpan:\n${saveFailurePreview}`);
            }

            alert(summaryLines.join('\n'));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal memproses file import.';
            alert(message);
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="pt-0 pb-4 sm:pb-5 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:overflow-hidden lg:pb-0">
            <div className="mb-6 flex flex-col gap-4 sm:mb-[30px] sm:flex-row sm:items-center sm:justify-between lg:shrink-0">
                <div>
                    <h3 className="text-[1.1rem] font-bold text-text-main sm:text-[1.2rem]">Daftar Barang</h3>
                    <p className="text-[0.9rem] text-text-muted">
                        Kelola stok, harga, dan kategori peralatan.
                    </p>
                </div>
                <div className="w-full sm:w-auto">
                    <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-4">
                        <input
                            ref={importFileInputRef}
                            type="file"
                            className="hidden"
                            accept=".csv,.xlsx,.xls"
                            onChange={(event) => { void handleImportFile(event); }}
                        />
                        <div className="grid min-h-11 grid-cols-2 rounded-DEFAULT border border-border bg-sidebar-bg p-1" aria-label="Status inventaris">
                            <button
                                type="button"
                                aria-pressed={inventoryStatus === 'active'}
                                className={`rounded px-3 py-2 text-xs font-semibold transition ${inventoryStatus === 'active' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-main'}`}
                                onClick={() => setInventoryStatus('active')}
                            >
                                Aktif
                            </button>
                            <button
                                type="button"
                                aria-pressed={inventoryStatus === 'archived'}
                                className={`rounded px-3 py-2 text-xs font-semibold transition ${inventoryStatus === 'archived' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-main'}`}
                                onClick={() => setInventoryStatus('archived')}
                            >
                                Diarsipkan
                            </button>
                        </div>
                        <ViewModeToggle
                            value={inventoryViewMode}
                            onChange={setInventoryViewMode}
                            containerClassName="min-h-11 rounded-DEFAULT"
                            buttonClassName="px-3 py-2 text-xs"
                        />
                        <input
                            type="search"
                            className="min-h-11 w-full rounded-DEFAULT border border-border bg-sidebar-bg px-3 text-sm text-text-main outline-none placeholder:text-text-muted focus:border-accent sm:w-56"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="Cari barang atau kategori"
                        />
                        <button
                            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-DEFAULT border border-border bg-sidebar-bg px-5 py-2.5 font-semibold text-text-main transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                            onClick={() => { void handleDownloadTemplate(); }}
                            disabled={isDownloadingTemplate}
                        >
                            <i className="fas fa-download"></i> {isDownloadingTemplate ? 'Menyiapkan...' : 'Download Template'}
                        </button>
                        <button
                            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-DEFAULT border border-border bg-sidebar-bg px-5 py-2.5 font-semibold text-text-main transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                            onClick={handleOpenImportDialog}
                            disabled={isImporting}
                        >
                            <i className="fas fa-file-import"></i> {isImporting ? 'Memproses...' : 'Import CSV/Excel'}
                        </button>
                        <button className="flex min-h-11 w-full items-center justify-center gap-2 rounded-DEFAULT border border-border bg-sidebar-bg px-5 py-2.5 font-semibold text-text-main transition hover:bg-surface-hover sm:w-auto" onClick={() => setIsCategoryModalOpen(true)}>
                            <i className="fas fa-tags"></i> Kategori
                        </button>
                        <button className="flex min-h-11 w-full items-center justify-center gap-2 rounded-DEFAULT bg-accent px-5 py-2.5 font-semibold text-white transition hover:bg-accent-hover shadow-[0_4px_15px_rgba(230,126,34,0.3)] sm:w-auto" onClick={handleAddItem}>
                            <i className="fas fa-plus"></i> Tambah Barang
                        </button>
                    </div>
                    <p className="mt-2 text-[0.75rem] text-text-muted sm:text-right">
                        Kolom wajib import: <strong>name, category, stock, price</strong>. Kolom <strong>image</strong> opsional.
                    </p>
                </div>
            </div>

            <div className="custom-scrollbar lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-y-contain lg:pr-2">
                {inventoryError ? (
                    <div className="py-10 text-center text-[#e74c3c]">{inventoryError.message || 'Gagal memuat inventaris.'}</div>
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
                            <div className="bg-card-bg border border-border rounded-DEFAULT overflow-hidden transition-all hover:border-accent group" key={item.id}>
                                <div className="relative h-[160px] overflow-hidden bg-[#1A2222] sm:h-[180px]">
                                    <img
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                        src={item.image || 'https://via.placeholder.com/300x200?text=No+Image'}
                                        alt={item.name}
                                    />
                                    <span className={`absolute right-[10px] top-[10px] rounded-[20px] px-3 py-[5px] text-[0.72rem] font-bold uppercase ${inventoryStatus === 'archived' ? 'bg-[#6b7280] text-white' : item.stock > 0 ? 'bg-[#2ecc71] text-white' : 'bg-[#e74c3c] text-white'}`}>
                                        {inventoryStatus === 'archived' ? 'Archived' : item.stock > 0 ? 'Available' : 'Out of Stock'}
                                    </span>
                                    <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/35 opacity-100 transition-opacity duration-300 sm:opacity-0 sm:group-hover:opacity-100">
                                        {inventoryStatus === 'active' ? (
                                            <>
                                                <button type="button" aria-label={`Edit ${item.name}`} title="Edit barang" className="flex h-11 w-11 items-center justify-center rounded-full bg-[#3498db] text-[1.1rem] text-white transition hover:scale-110" onClick={() => handleEditItem(item)}>
                                                    <i className="fas fa-edit"></i>
                                                </button>
                                                <button type="button" aria-label={`Arsipkan ${item.name}`} title="Arsipkan barang" className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e74c3c] text-[1.1rem] text-white transition hover:scale-110" onClick={() => handleArchiveItem(item.id)}>
                                                    <i className="fas fa-box-archive"></i>
                                                </button>
                                            </>
                                        ) : (
                                            <button type="button" aria-label={`Pulihkan ${item.name}`} title="Pulihkan barang" className="flex h-11 w-11 items-center justify-center rounded-full bg-[#2ecc71] text-[1.1rem] text-white transition hover:scale-110" onClick={() => handleRestoreItem(item.id)}>
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
                                            <span className={`rounded-full px-2 py-[2px] text-[0.65rem] font-semibold uppercase ${inventoryStatus === 'archived' ? 'bg-[#6b7280]/20 text-[#6b7280]' : item.stock > 0 ? 'bg-[#2ecc71]/20 text-[#2ecc71]' : 'bg-[#e74c3c]/20 text-[#e74c3c]'}`}>
                                                {inventoryStatus === 'archived' ? 'Archived' : item.stock > 0 ? 'Available' : 'Out of Stock'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-2">
                                        {inventoryStatus === 'active' ? (
                                            <>
                                                <button type="button" aria-label={`Edit ${item.name}`} title="Edit barang" className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-sidebar-bg text-[#3498db] transition hover:border-[#3498db]/60" onClick={() => handleEditItem(item)}>
                                                    <i className="fas fa-edit"></i>
                                                </button>
                                                <button type="button" aria-label={`Arsipkan ${item.name}`} title="Arsipkan barang" className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-sidebar-bg text-[#e74c3c] transition hover:border-[#e74c3c]/60" onClick={() => handleArchiveItem(item.id)}>
                                                    <i className="fas fa-box-archive"></i>
                                                </button>
                                            </>
                                        ) : (
                                            <button type="button" aria-label={`Pulihkan ${item.name}`} title="Pulihkan barang" className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-sidebar-bg text-[#2ecc71] transition hover:border-[#2ecc71]/60" onClick={() => handleRestoreItem(item.id)}>
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
                        className="rounded-DEFAULT border border-border bg-sidebar-bg px-4 py-2 text-sm font-semibold text-text-main transition hover:border-accent disabled:cursor-wait disabled:opacity-60"
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

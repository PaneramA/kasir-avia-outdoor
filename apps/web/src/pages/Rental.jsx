import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchCustomers } from '../lib/api';
import ViewModeToggle from '../components/ViewModeToggle';
import ReceiptModal from '../components/ReceiptModal';
import { openReceiptWhatsApp, printReceipt } from '../lib/receipt';

const INITIAL_CUSTOMER = {
    name: '',
    phone: '',
    address: '',
    guarantee: 'KTP',
    guaranteeOther: '',
    idNumber: '',
};

const INITIAL_CUSTOMER_ERRORS = {
    name: '',
    phone: '',
    guaranteeOther: '',
};

const INITIAL_PAYMENT = {
    status: 'LUNAS',
    method: 'TUNAI',
    paidAmount: '',
};

const MOBILE_FLOW_STEPS = [
    'Data Penyewa',
    'Pilih Barang',
    'Konfirmasi',
];

const sanitizeDigits = (value) => value.replace(/\D/g, '');
const isEditableTarget = (target) => (
    target instanceof HTMLElement
    && (
        target.isContentEditable
        || target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.tagName === 'SELECT'
    )
);

const STOCK_WARNING_MESSAGE = 'Stok item tidak mencukupi.';
const RENTAL_VIEW_STORAGE_KEY = 'avia_rental_inventory_view_mode';
const RENTAL_DRAFT_STORAGE_KEY = 'avia_rental_draft_v1';

const getInitialRentalInventoryView = () => {
    if (typeof window === 'undefined') {
        return 'grid';
    }

    const saved = window.localStorage.getItem(RENTAL_VIEW_STORAGE_KEY);
    return saved === 'list' ? 'list' : 'grid';
};

const Rental = ({
    inventory,
    categories,
    cart,
    setCart,
    onCheckout,
    currentUser,
}) => {
    const safeInventory = useMemo(() => (Array.isArray(inventory) ? inventory : []), [inventory]);
    const safeCategories = useMemo(() => (Array.isArray(categories) ? categories : []), [categories]);
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [inventorySearch, setInventorySearch] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [customer, setCustomer] = useState(INITIAL_CUSTOMER);
    const [duration, setDuration] = useState(1);
    const [customerSearch, setCustomerSearch] = useState('');
    const [customerSuggestions, setCustomerSuggestions] = useState([]);
    const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
    const [payment, setPayment] = useState(INITIAL_PAYMENT);
    const [mobileStep, setMobileStep] = useState(1);
    const [customerErrors, setCustomerErrors] = useState(INITIAL_CUSTOMER_ERRORS);
    const [itemsError, setItemsError] = useState('');
    const [durationError, setDurationError] = useState('');
    const [paymentError, setPaymentError] = useState('');
    const [mobileStepHint, setMobileStepHint] = useState('');
    const [inventoryViewMode, setInventoryViewMode] = useState(getInitialRentalInventoryView);
    const [receiptRental, setReceiptRental] = useState(null);
    const latestSearchRequestRef = useRef(0);
    const focusTimeoutRef = useRef(null);
    const hasRestoredDraftRef = useRef(false);

    const getActiveLayout = useCallback(() => {
        if (typeof window === 'undefined') {
            return 'desktop';
        }

        return window.matchMedia('(min-width: 1024px)').matches ? 'desktop' : 'mobile';
    }, []);

    const focusFieldByKey = useCallback((fieldKey) => {
        const activeLayout = getActiveLayout();
        const scopedFieldSelector = `[data-rental-field="${activeLayout}-${fieldKey}"]`;
        const fallbackFieldSelector = `[data-rental-field="shared-${fieldKey}"]`;
        const field = document.querySelector(scopedFieldSelector) || document.querySelector(fallbackFieldSelector);

        if (field && typeof field.focus === 'function') {
            field.focus();
            if (typeof field.scrollIntoView === 'function') {
                field.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
        }
    }, [getActiveLayout]);

    const scheduleFocusField = useCallback((fieldKey) => {
        if (typeof window === 'undefined') {
            return;
        }

        if (focusTimeoutRef.current) {
            window.clearTimeout(focusTimeoutRef.current);
        }

        focusTimeoutRef.current = window.setTimeout(() => {
            focusFieldByKey(fieldKey);
        }, 20);
    }, [focusFieldByKey]);

    useEffect(() => () => {
        if (typeof window !== 'undefined' && focusTimeoutRef.current) {
            window.clearTimeout(focusTimeoutRef.current);
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        window.localStorage.setItem(RENTAL_VIEW_STORAGE_KEY, inventoryViewMode);
    }, [inventoryViewMode]);

    useEffect(() => {
        if (categoryFilter !== 'all' && !safeCategories.includes(categoryFilter)) {
            setCategoryFilter('all');
        }
    }, [categoryFilter, safeCategories]);

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

    const normalizedInventorySearch = inventorySearch.trim().toLowerCase();
    const filteredItems = safeInventory.filter((item) => {
        if (categoryFilter !== 'all' && item.category !== categoryFilter) {
            return false;
        }

        if (!normalizedInventorySearch) {
            return true;
        }

        const name = String(item.name || '').toLowerCase();
        const category = String(item.category || '').toLowerCase();
        return name.includes(normalizedInventorySearch) || category.includes(normalizedInventorySearch);
    });

    const clearSavedDraft = useCallback(() => {
        if (typeof window === 'undefined') {
            return;
        }

        window.localStorage.removeItem(RENTAL_DRAFT_STORAGE_KEY);
    }, []);

    const restoreDraftFromStorage = useCallback((draftPayload) => {
        if (!draftPayload || typeof draftPayload !== 'object') {
            return false;
        }

        const normalizedCustomer = {
            ...INITIAL_CUSTOMER,
            ...(draftPayload.customer || {}),
            phone: sanitizeDigits(draftPayload?.customer?.phone || ''),
            idNumber: sanitizeDigits(draftPayload?.customer?.idNumber || ''),
        };

        const draftItems = Array.isArray(draftPayload.items) ? draftPayload.items : [];
        const restoredItems = draftItems
            .map((savedItem) => {
                const inventorySource = safeInventory.find((inventoryItem) => inventoryItem.id === savedItem.id);
                if (!inventorySource || inventorySource.stock < 1) {
                    return null;
                }

                const requestedQty = Number.parseInt(savedItem.qty, 10);
                const safeQty = Number.isFinite(requestedQty)
                    ? Math.max(1, Math.min(inventorySource.stock, requestedQty))
                    : 1;

                return {
                    ...inventorySource,
                    qty: safeQty,
                    notes: savedItem.notes || '',
                };
            })
            .filter(Boolean);

        setCustomer(normalizedCustomer);
        setCustomerErrors(INITIAL_CUSTOMER_ERRORS);
        setDuration(Number.isFinite(draftPayload.duration) ? Math.max(1, draftPayload.duration) : 1);
        setPayment({
            status: draftPayload?.payment?.status === 'DP' ? 'DP' : 'LUNAS',
            method: ['QRIS', 'BANK', 'TUNAI'].includes(String(draftPayload?.payment?.method || '').toUpperCase())
                ? String(draftPayload.payment.method).toUpperCase()
                : 'TUNAI',
            paidAmount: draftPayload?.payment?.paidAmount ? String(draftPayload.payment.paidAmount) : '',
        });
        setCategoryFilter(
            draftPayload.categoryFilter === 'all' || safeCategories.includes(draftPayload.categoryFilter)
                ? draftPayload.categoryFilter
                : 'all',
        );
        setMobileStep(Number.isFinite(draftPayload.mobileStep) ? Math.min(3, Math.max(1, draftPayload.mobileStep)) : 1);
        setInventoryViewMode(draftPayload.inventoryViewMode === 'list' ? 'list' : 'grid');
        setItemsError('');
        setDurationError('');
        setPaymentError('');
        setMobileStepHint('Draft berhasil dimuat. Lanjutkan proses sewa.');
        setCart(restoredItems);

        return true;
    }, [safeCategories, safeInventory, setCart]);

    useEffect(() => {
        if (typeof window === 'undefined' || hasRestoredDraftRef.current) {
            return;
        }

        hasRestoredDraftRef.current = true;

        try {
            const rawDraft = window.localStorage.getItem(RENTAL_DRAFT_STORAGE_KEY);
            if (!rawDraft) {
                return;
            }

            const parsedDraft = JSON.parse(rawDraft);
            const hasExistingInput = (
                cart.length > 0
                || customer.name.trim()
                || customer.phone.trim()
                || duration !== 1
                || payment.status !== 'LUNAS'
                || String(payment.paidAmount || '').trim()
            );
            if (hasExistingInput) {
                return;
            }

            const shouldRestore = window.confirm('Ditemukan draft transaksi sewa. Muat draft dan lanjutkan?');
            if (!shouldRestore) {
                return;
            }

            const didRestore = restoreDraftFromStorage(parsedDraft);
            if (!didRestore) {
                clearSavedDraft();
            }
        } catch {
            clearSavedDraft();
        }
    }, [
        cart.length,
        clearSavedDraft,
        customer.name,
        customer.phone,
        duration,
        payment.status,
        payment.paidAmount,
        restoreDraftFromStorage,
    ]);

    const addToCart = useCallback((item) => {
        if (item.stock <= 0) return;

        const existing = cart.find((c) => c.id === item.id);
        if (existing) {
            if (existing.qty < item.stock) {
                setCart(cart.map((c) => (c.id === item.id ? { ...c, qty: c.qty + 1 } : c)));
                setItemsError('');
                setMobileStepHint('');
            } else {
                alert(STOCK_WARNING_MESSAGE);
            }
        } else {
            setCart([...cart, { ...item, qty: 1, notes: '' }]);
            setItemsError('');
            setMobileStepHint('');
        }
    }, [cart, setCart]);

    const renderInventoryGridItem = (item) => (
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
                <span className="text-accent font-bold text-[0.95rem] block">Rp {parseInt(item.price, 10).toLocaleString()} <small className="text-[0.7em] font-normal text-text-muted">/hari</small></span>
                <span className="text-text-muted text-[0.75rem] block mt-1">Tersedia: {item.stock}</span>
            </div>
        </div>
    );

    const renderInventoryListItem = (item) => (
        <button
            key={item.id}
            type="button"
            className={`w-full rounded-lg border border-border bg-card-bg p-3 text-left transition-all hover:border-accent ${item.stock <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => addToCart(item)}
            disabled={item.stock <= 0}
        >
            <div className="flex items-center gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-[#1A2222] sm:h-16 sm:w-16">
                    <img className="h-full w-full object-cover" src={item.image || 'https://via.placeholder.com/120'} alt={item.name} />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-main sm:text-[0.95rem]">{item.name}</p>
                    <p className="mt-0.5 text-xs text-text-muted">Tersedia: {item.stock}</p>
                    <p className="mt-1 text-xs font-bold text-accent sm:text-sm">Rp {parseInt(item.price, 10).toLocaleString()} /hari</p>
                </div>
                {item.stock <= 0 && (
                    <span className="shrink-0 rounded-full bg-[#e74c3c]/20 px-2 py-1 text-[0.65rem] font-semibold uppercase text-[#e74c3c]">
                        Habis
                    </span>
                )}
            </div>
        </button>
    );

    useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }

        const handleInventoryShortcut = (event) => {
            if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
                return;
            }

            if (event.key === '/' && getActiveLayout() === 'desktop' && !isEditableTarget(event.target)) {
                event.preventDefault();
                if (mobileStep !== 2) {
                    setMobileStep(2);
                }
                scheduleFocusField('inventorySearch');
                return;
            }

            const isSearchField = event.target instanceof HTMLElement
                && event.target.getAttribute('data-rental-field') === 'shared-inventorySearch';

            if (event.key !== 'Enter' || !isSearchField || !normalizedInventorySearch) {
                return;
            }

            const firstAvailableItem = filteredItems.find((item) => item.stock > 0);
            if (!firstAvailableItem) {
                return;
            }

            event.preventDefault();
            addToCart(firstAvailableItem);
        };

        window.addEventListener('keydown', handleInventoryShortcut);
        return () => window.removeEventListener('keydown', handleInventoryShortcut);
    }, [addToCart, filteredItems, mobileStep, normalizedInventorySearch, scheduleFocusField, getActiveLayout]);

    const updateCartQty = (id, delta) => {
        const item = cart.find((c) => c.id === id);
        const invItem = safeInventory.find((i) => i.id === id);

        if (!item || !invItem) {
            return;
        }

        const newQty = item.qty + delta;

        if (newQty > 0 && newQty <= invItem.stock) {
            setCart(cart.map((c) => (c.id === id ? { ...c, qty: newQty } : c)));
            if (newQty > 0) {
                setItemsError('');
                setMobileStepHint('');
            }
        } else if (newQty > invItem.stock) {
            alert(STOCK_WARNING_MESSAGE);
        }
    };

    const removeFromCart = (id) => {
        setCart(cart.filter((c) => c.id !== id));
    };

    const updateCartNote = (id, note) => {
        setCart(cart.map((c) => (c.id === id ? { ...c, notes: note } : c)));
    };

    const calculateTotal = () => cart.reduce((sum, item) => sum + (item.price * item.qty * duration), 0);
    const parsePaidAmount = () => {
        const parsed = Number.parseInt(String(payment.paidAmount || '0').replace(/\D/g, ''), 10);
        return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    };
    const totalAmount = calculateTotal();
    const computedPaidAmount = payment.status === 'LUNAS'
        ? totalAmount
        : Math.min(parsePaidAmount(), totalAmount);
    const remainingAmount = Math.max(0, totalAmount - computedPaidAmount);
    const cartQuantity = cart.reduce((sum, item) => sum + item.qty, 0);
    const isCustomerStepComplete = Boolean(
        customer.name.trim()
        && customer.phone.trim()
        && (customer.guarantee !== 'Lainnya' || customer.guaranteeOther.trim()),
    );
    const isItemsStepComplete = cart.length > 0;

    const validateCustomerStep = ({ focusOnError = false } = {}) => {
        const nextErrors = {
            name: '',
            phone: '',
            guaranteeOther: '',
        };

        if (!customer.name.trim()) {
            nextErrors.name = 'Nama pelanggan wajib diisi.';
        }

        if (!customer.phone.trim()) {
            nextErrors.phone = 'Nomor HP wajib diisi.';
        }

        if (customer.guarantee === 'Lainnya' && !customer.guaranteeOther.trim()) {
            nextErrors.guaranteeOther = 'Detail jaminan lainnya wajib diisi.';
        }

        setCustomerErrors(nextErrors);
        const isValid = !Object.values(nextErrors).some(Boolean);
        if (!isValid && focusOnError) {
            if (nextErrors.name) {
                scheduleFocusField('name');
            } else if (nextErrors.phone) {
                scheduleFocusField('phone');
            } else if (nextErrors.guaranteeOther) {
                scheduleFocusField('guaranteeOther');
            }
        }

        return isValid;
    };

    const validateItemsStep = ({ focusOnError = false } = {}) => {
        if (cart.length === 0) {
            setItemsError('Pilih minimal satu barang sebelum lanjut.');
            if (focusOnError) {
                scheduleFocusField('inventoryFilter');
            }
            return false;
        }

        setItemsError('');
        return true;
    };

    const validateDurationStep = ({ focusOnError = false } = {}) => {
        if (!Number.isFinite(duration) || duration < 1) {
            setDurationError('Durasi sewa minimal 1 hari.');
            if (focusOnError) {
                scheduleFocusField('duration');
            }
            return false;
        }

        setDurationError('');
        return true;
    };

    const validatePaymentStep = ({ focusOnError = false } = {}) => {
        if (payment.status === 'DP') {
            const paidAmount = parsePaidAmount();
            if (paidAmount <= 0) {
                setPaymentError('Nominal DP wajib diisi jika status pembayaran DP.');
                if (focusOnError) {
                    scheduleFocusField('paymentAmount');
                }
                return false;
            }
        }

        setPaymentError('');
        return true;
    };

    const goToNextMobileStep = () => {
        if (mobileStep === 1 && !validateCustomerStep({ focusOnError: true })) {
            setMobileStepHint('Lengkapi data penyewa dulu sebelum lanjut.');
            return;
        }

        if (mobileStep === 2 && !validateItemsStep({ focusOnError: true })) {
            setMobileStepHint('Tambahkan minimal satu barang sebelum lanjut.');
            return;
        }

        if (mobileStep === 3 && !validateDurationStep({ focusOnError: true })) {
            setMobileStepHint('Cek lagi durasi sewa yang dimasukkan.');
            return;
        }

        if (mobileStep === 3 && !validatePaymentStep({ focusOnError: true })) {
            setMobileStepHint('Lengkapi detail pembayaran sebelum lanjut.');
            return;
        }

        setMobileStepHint('');
        setMobileStep((previous) => Math.min(3, previous + 1));
    };

    const goToPreviousMobileStep = () => {
        setMobileStepHint('');
        setMobileStep((previous) => Math.max(1, previous - 1));
    };

    const canOpenMobileStep = (targetStep) => {
        if (targetStep <= mobileStep) {
            return true;
        }

        if (targetStep === 2) {
            return isCustomerStepComplete;
        }

        if (targetStep === 3) {
            return isCustomerStepComplete && isItemsStepComplete;
        }

        return false;
    };

    const goToMobileStep = (targetStep) => {
        if (targetStep === mobileStep) {
            return;
        }

        if (targetStep < mobileStep) {
            setMobileStepHint('');
            setMobileStep(targetStep);
            return;
        }

        if (targetStep === 2) {
            if (!validateCustomerStep({ focusOnError: true })) {
                setMobileStepHint('Lengkapi data penyewa dulu agar langkah ini terbuka.');
                setMobileStep(1);
                return;
            }

            setMobileStepHint('');
            setMobileStep(2);
            return;
        }

        if (targetStep === 3) {
            if (!validateCustomerStep({ focusOnError: true })) {
                setMobileStepHint('Lengkapi data penyewa dulu agar bisa ke konfirmasi.');
                setMobileStep(1);
                return;
            }

            if (!validateItemsStep({ focusOnError: true })) {
                setMobileStepHint('Pilih barang dulu agar bisa ke konfirmasi.');
                setMobileStep(2);
                return;
            }

            setMobileStepHint('');
            setMobileStep(3);
        }
    };

    const handleCheckout = async () => {
        const isCustomerValid = validateCustomerStep({ focusOnError: true });
        const isItemsValid = validateItemsStep({ focusOnError: true });
        const isDurationValid = validateDurationStep({ focusOnError: true });
        const isPaymentValid = validatePaymentStep({ focusOnError: true });

        if (!isCustomerValid) {
            setMobileStep(1);
            setMobileStepHint('Lengkapi data penyewa dulu sebelum menyimpan transaksi.');
            alert('Lengkapi data penyewa terlebih dahulu.');
            return;
        }

        if (!isItemsValid) {
            setMobileStep(2);
            setMobileStepHint('Pilih barang sewa dulu sebelum menyimpan transaksi.');
            alert('Pilih barang yang akan disewa terlebih dahulu.');
            return;
        }

        if (!isDurationValid) {
            setMobileStep(3);
            setMobileStepHint('Periksa durasi sewa sebelum menyimpan transaksi.');
            alert('Durasi sewa belum valid.');
            return;
        }

        if (!isPaymentValid) {
            setMobileStep(3);
            setMobileStepHint('Periksa detail pembayaran sebelum menyimpan transaksi.');
            alert('Detail pembayaran belum valid.');
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
            payment: {
                status: payment.status,
                method: payment.method,
                ...(payment.status === 'DP' ? { paidAmount: parsePaidAmount() } : {}),
            },
        };

        try {
            setIsSubmitting(true);
            const createdRental = await onCheckout(payload);
            setCart([]);
            setCustomer(INITIAL_CUSTOMER);
            setCustomerErrors(INITIAL_CUSTOMER_ERRORS);
            setCustomerSearch('');
            setCustomerSuggestions([]);
            setDuration(1);
            setPayment(INITIAL_PAYMENT);
            setInventorySearch('');
            setCategoryFilter('all');
            setDurationError('');
            setPaymentError('');
            setItemsError('');
            setMobileStepHint('');
            setMobileStep(1);
            setReceiptRental(createdRental || null);
            alert('Transaksi berhasil disimpan!');
            scheduleFocusField('name');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal menyimpan transaksi sewa.';
            alert(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCloseReceipt = () => {
        setReceiptRental(null);
    };

    const handlePrintReceipt = (paperWidthMm = 80) => {
        if (!receiptRental) {
            return;
        }

        try {
            printReceipt(receiptRental, {
                cashierName: currentUser?.name || currentUser?.username || '',
                paperWidthMm,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal mencetak receipt.';
            alert(message);
        }
    };

    const handleShareReceiptWhatsApp = () => {
        if (!receiptRental) {
            return;
        }

        try {
            openReceiptWhatsApp(receiptRental, {
                cashierName: currentUser?.name || currentUser?.username || '',
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal membagikan receipt ke WhatsApp.';
            alert(message);
        }
    };

    const handlePickCustomer = (pickedCustomer) => {
        setCustomer({
            name: pickedCustomer.name || '',
            phone: sanitizeDigits(pickedCustomer.phone || ''),
            address: pickedCustomer.address || '',
            guarantee: pickedCustomer.guarantee || 'KTP',
            guaranteeOther: pickedCustomer.guaranteeOther || '',
            idNumber: sanitizeDigits(pickedCustomer.idNumber || ''),
        });
        setCustomerErrors(INITIAL_CUSTOMER_ERRORS);
        setCustomerSearch(`${pickedCustomer.name} (${pickedCustomer.phone})`);
        setCustomerSuggestions([]);
        setMobileStepHint('');
    };

    const handleNameChange = (value) => {
        setCustomer((previous) => ({ ...previous, name: value }));
        setMobileStepHint('');
        if (customerErrors.name) {
            setCustomerErrors((previous) => ({ ...previous, name: '' }));
        }
    };

    const handlePhoneChange = (value) => {
        setCustomer((previous) => ({ ...previous, phone: sanitizeDigits(value) }));
        setMobileStepHint('');
        if (customerErrors.phone) {
            setCustomerErrors((previous) => ({ ...previous, phone: '' }));
        }
    };

    const handleGuaranteeChange = (value) => {
        setCustomer((previous) => ({
            ...previous,
            guarantee: value,
            guaranteeOther: value === 'Lainnya' ? previous.guaranteeOther : '',
        }));
        setMobileStepHint('');

        if (value !== 'Lainnya') {
            setCustomerErrors((previous) => ({ ...previous, guaranteeOther: '' }));
        }
    };

    const handleGuaranteeOtherChange = (value) => {
        setCustomer((previous) => ({ ...previous, guaranteeOther: value }));
        setMobileStepHint('');
        if (customerErrors.guaranteeOther) {
            setCustomerErrors((previous) => ({ ...previous, guaranteeOther: '' }));
        }
    };

    const handleIdNumberChange = (value) => {
        setCustomer((previous) => ({ ...previous, idNumber: sanitizeDigits(value) }));
        setMobileStepHint('');
    };

    const handleDurationChange = (value) => {
        const nextValue = Number.parseInt(value, 10);
        const safeValue = Number.isFinite(nextValue) ? Math.max(1, nextValue) : 1;
        setDuration(safeValue);
        setMobileStepHint('');

        if (durationError) {
            setDurationError('');
        }
    };

    const handlePaymentStatusChange = (value) => {
        const status = value === 'DP' ? 'DP' : 'LUNAS';
        setPayment((previous) => ({
            ...previous,
            status,
            paidAmount: status === 'LUNAS' ? '' : previous.paidAmount,
        }));
        setMobileStepHint('');
        if (paymentError) {
            setPaymentError('');
        }
    };

    const handlePaymentMethodChange = (value) => {
        const normalizedMethod = ['QRIS', 'BANK', 'TUNAI'].includes(value) ? value : 'TUNAI';
        setPayment((previous) => ({
            ...previous,
            method: normalizedMethod,
        }));
    };

    const handlePaymentAmountChange = (value) => {
        const sanitized = value.replace(/\D/g, '');
        setPayment((previous) => ({
            ...previous,
            paidAmount: sanitized,
        }));
        if (paymentError) {
            setPaymentError('');
        }
    };

    const renderCustomerFields = (layout = 'desktop') => {
        const nameErrorId = `${layout}-customer-name-error`;
        const phoneErrorId = `${layout}-customer-phone-error`;
        const guaranteeOtherErrorId = `${layout}-customer-guarantee-other-error`;

        return (
            <>
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
                    className={`w-full bg-bg-main border p-2.5 rounded-lg text-text-main outline-none transition-colors ${customerErrors.name ? 'border-[#e74c3c]' : 'border-border focus:border-accent'}`}
                    type="text"
                    data-rental-field={`${layout}-name`}
                    aria-invalid={Boolean(customerErrors.name)}
                    aria-describedby={customerErrors.name ? nameErrorId : undefined}
                    placeholder="Nama lengkap..."
                    value={customer.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                />
                {customerErrors.name && <p id={nameErrorId} className="mt-1 text-xs text-[#e74c3c]">{customerErrors.name}</p>}
            </div>
            <div className="form-group">
                <label className="block mb-1.5 text-[0.85rem] text-text-muted">Nomor HP</label>
                <input
                    className={`w-full bg-bg-main border p-2.5 rounded-lg text-text-main outline-none transition-colors ${customerErrors.phone ? 'border-[#e74c3c]' : 'border-border focus:border-accent'}`}
                    type="text"
                    data-rental-field={`${layout}-phone`}
                    aria-invalid={Boolean(customerErrors.phone)}
                    aria-describedby={customerErrors.phone ? phoneErrorId : undefined}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="0812..."
                    value={customer.phone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                />
                {customerErrors.phone && <p id={phoneErrorId} className="mt-1 text-xs text-[#e74c3c]">{customerErrors.phone}</p>}
            </div>
            <div className="form-group">
                <label className="block mb-1.5 text-[0.85rem] text-text-muted">Alamat</label>
                <textarea
                    className="w-full min-h-[78px] resize-y bg-bg-main border border-border p-2.5 rounded-lg text-text-main outline-none focus:border-accent transition-colors"
                    placeholder="Alamat customer..."
                    value={customer.address}
                    onChange={(e) => setCustomer((previous) => ({ ...previous, address: e.target.value }))}
                ></textarea>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="form-group">
                    <label className="block mb-1.5 text-[0.85rem] text-text-muted">Jaminan</label>
                    <select
                        className="w-full bg-bg-main border border-border p-2.5 rounded-lg text-text-main outline-none focus:border-accent transition-colors cursor-pointer"
                        value={customer.guarantee}
                        onChange={(e) => handleGuaranteeChange(e.target.value)}
                    >
                        <option value="KTP">KTP</option>
                        <option value="SIM">SIM</option>
                        <option value="Paspor">Paspor</option>
                        <option value="Lainnya">Lainnya</option>
                    </select>
                </div>
                <div className="form-group">
                    <label className="block mb-1.5 text-[0.85rem] text-text-muted">Nomor Identitas</label>
                    <input
                        className="w-full bg-bg-main border border-border p-2.5 rounded-lg text-text-main outline-none focus:border-accent transition-colors"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="Opsional, hanya angka"
                        value={customer.idNumber}
                        onChange={(e) => handleIdNumberChange(e.target.value)}
                    />
                </div>
            </div>
            {customer.guarantee === 'Lainnya' && (
                <div className="form-group">
                    <label className="block mb-1.5 text-[0.85rem] text-text-muted">Sebutkan Jaminan Lainnya</label>
                    <input
                        className={`w-full bg-bg-main border p-2.5 rounded-lg text-text-main outline-none transition-colors ${customerErrors.guaranteeOther ? 'border-[#e74c3c]' : 'border-border focus:border-accent'}`}
                        type="text"
                        data-rental-field={`${layout}-guaranteeOther`}
                        aria-invalid={Boolean(customerErrors.guaranteeOther)}
                        aria-describedby={customerErrors.guaranteeOther ? guaranteeOtherErrorId : undefined}
                        placeholder="Contoh: STNK, Kartu Pelajar..."
                        value={customer.guaranteeOther}
                        onChange={(e) => handleGuaranteeOtherChange(e.target.value)}
                    />
                    {customerErrors.guaranteeOther && <p id={guaranteeOtherErrorId} className="mt-1 text-xs text-[#e74c3c]">{customerErrors.guaranteeOther}</p>}
                </div>
            )}
            </>
        );
    };

    const renderCartItems = () => (
        <>
            <div className="custom-scrollbar mb-4 max-h-[300px] space-y-4 overflow-y-auto pr-1 sm:pr-2">
                {cart.length === 0 ? (
                    <div className="text-center py-6 text-text-muted italic text-sm">Belum ada barang dipilih.</div>
                ) : (
                    cart.map((item) => (
                        <div className="bg-bg-main/50 border border-white/5 p-4 rounded-lg" key={item.id}>
                            <div className="mb-3 flex items-start justify-between gap-3">
                                <div className="flex min-w-0 flex-col">
                                    <span className="text-text-main font-medium">{item.name}</span>
                                    <small className="text-text-muted">Rp {parseInt(item.price, 10).toLocaleString()} x {item.qty}</small>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    <button type="button" className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-sidebar-bg text-text-main transition hover:border-accent" onClick={() => updateCartQty(item.id, -1)}>-</button>
                                    <span className="w-6 text-center text-sm font-bold">{item.qty}</span>
                                    <button type="button" className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-sidebar-bg text-text-main transition hover:border-accent" onClick={() => updateCartQty(item.id, 1)}>+</button>
                                    <button type="button" className="rounded p-2 text-[#e74c3c] hover:bg-[#e74c3c]/10" onClick={() => removeFromCart(item.id)}>&times;</button>
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
            {itemsError && (
                <p role="alert" aria-live="assertive" className="mb-4 rounded-lg border border-[#e74c3c]/40 bg-[#e74c3c]/10 px-3 py-2 text-xs text-[#e74c3c]">
                    {itemsError}
                </p>
            )}
        </>
    );

    return (
        <div className="py-4 sm:py-5">
            <div className="mb-4 grid grid-cols-3 gap-2 lg:hidden">
                {MOBILE_FLOW_STEPS.map((stepLabel, index) => {
                    const stepNumber = index + 1;
                    const isActive = mobileStep === stepNumber;
                    const isPassed = mobileStep > stepNumber;
                    const isClickable = canOpenMobileStep(stepNumber);

                    return (
                        <button
                            key={stepLabel}
                            type="button"
                            onClick={() => goToMobileStep(stepNumber)}
                            className={`rounded-lg border px-2 py-2 text-center transition-all ${isActive ? 'border-accent bg-accent/10' : 'border-border'} ${isPassed ? 'border-emerald-500/40 bg-emerald-500/10' : ''} ${isClickable ? 'hover:border-accent' : 'opacity-70'}`}
                        >
                            <p className="text-[0.65rem] uppercase tracking-wide text-text-muted">Langkah {stepNumber}</p>
                            <p className="text-[0.75rem] font-semibold text-text-main">
                                {stepLabel}
                                {!isClickable && ' (Belum tersedia)'}
                            </p>
                        </button>
                    );
                })}
            </div>
            <p className="mb-4 text-[0.72rem] text-text-muted lg:hidden">
                Pilih langkah sebelumnya untuk mengubah data dengan cepat.
            </p>
            {mobileStepHint && (
                <p role="status" aria-live="polite" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 lg:hidden">
                    {mobileStepHint}
                </p>
            )}

            <div className="flex flex-col gap-6 lg:h-full lg:min-h-0 lg:flex-row lg:gap-[30px]">
                <div className={`${mobileStep === 2 ? 'flex' : 'hidden'} flex-1 flex-col lg:flex lg:min-h-0`}>
                    <div className="mb-5 flex flex-col gap-3 sm:mb-[30px] sm:flex-row sm:items-center sm:justify-between">
                        <h3 className="text-[1.1rem] font-bold text-text-main sm:text-[1.2rem]">Pilih Barang</h3>
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[260px] sm:items-end">
                            <div className="w-full rounded-lg border border-border bg-sidebar-bg px-4 py-2">
                                <input
                                    className="w-full border-none bg-transparent text-sm text-text-main outline-none placeholder:text-text-muted"
                                    type="text"
                                    data-rental-field="shared-inventorySearch"
                                    placeholder="Cari barang atau kategori..."
                                    value={inventorySearch}
                                    onChange={(e) => setInventorySearch(e.target.value)}
                                />
                            </div>
                            <p className="text-[0.68rem] text-text-muted">
                                Shortcut desktop: `/` fokus pencarian, `Enter` tambah hasil teratas.
                            </p>
                            <div className="w-full rounded-lg border border-border bg-sidebar-bg px-4 py-2 sm:w-auto">
                                <select
                                    className="w-full cursor-pointer border-none bg-transparent text-sm text-text-main outline-none sm:min-w-[180px]"
                                    data-rental-field="shared-inventoryFilter"
                                    value={categoryFilter}
                                    onChange={(e) => setCategoryFilter(e.target.value)}
                                >
                                    <option value="all">Semua Kategori</option>
                                    {safeCategories.map((cat) => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>
                            <ViewModeToggle
                                value={inventoryViewMode}
                                onChange={setInventoryViewMode}
                                containerClassName="w-full sm:w-auto"
                                buttonClassName="px-3 py-1.5 text-[0.72rem]"
                            />
                        </div>
                    </div>
                    <div className="custom-scrollbar lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2">
                        {filteredItems.length === 0 ? (
                            <div className="mt-4 rounded-lg border border-border bg-card-bg/40 p-4 text-center text-sm text-text-muted">
                                {normalizedInventorySearch
                                    ? 'Barang tidak ditemukan. Coba kata kunci lain.'
                                    : 'Tidak ada barang pada kategori ini.'}
                            </div>
                        ) : inventoryViewMode === 'grid' ? (
                            <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4 sm:mt-5 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] sm:gap-5">
                                {filteredItems.map((item) => renderInventoryGridItem(item))}
                            </div>
                        ) : (
                            <div className="mt-4 flex flex-col gap-3 sm:mt-5">
                                {filteredItems.map((item) => renderInventoryListItem(item))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="w-full lg:h-full lg:min-h-0 lg:w-[400px]">
                    <div className="rounded-lg border border-border bg-sidebar-bg p-4 sm:p-6">
                        <div className="lg:hidden">
                            {mobileStep === 1 && (
                                <>
                                    <h4 className="mb-4 border-b border-border pb-2 text-[1rem] font-bold uppercase tracking-wide text-accent sm:text-[1.1rem]">Langkah 1: Data Penyewa</h4>
                                    <div className="space-y-4">{renderCustomerFields('mobile')}</div>
                                    <button
                                        type="button"
                                        className="mt-5 w-full bg-accent text-white py-3.5 rounded-lg font-bold transition-all hover:bg-accent-hover"
                                        onClick={goToNextMobileStep}
                                    >
                                        Lanjut ke Pilih Barang
                                    </button>
                                </>
                            )}

                            {mobileStep === 2 && (
                                <>
                                    <h4 className="mb-4 border-b border-border pb-2 text-[1rem] font-bold uppercase tracking-wide text-accent sm:text-[1.1rem]">Langkah 2: Pilih Barang</h4>
                                    <p className="mb-2 text-xs text-text-muted">Tap barang di daftar inventaris untuk menambah ke keranjang.</p>
                                    <p className="mb-4 text-xs text-text-muted">
                                        {cart.length === 0 ? 'Belum ada item dipilih.' : `${cart.length} item aktif (${cartQuantity} total unit)`}
                                    </p>
                                    {renderCartItems()}
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            className="w-full border border-border text-text-main py-3.5 rounded-lg font-semibold transition-all hover:border-accent"
                                            onClick={goToPreviousMobileStep}
                                        >
                                            Kembali
                                        </button>
                                        <button
                                            type="button"
                                            disabled={!isItemsStepComplete}
                                            className="w-full bg-accent text-white py-3.5 rounded-lg font-bold transition-all hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed"
                                            onClick={goToNextMobileStep}
                                        >
                                            Lanjut ke Konfirmasi
                                        </button>
                                    </div>
                                </>
                            )}

                            {mobileStep === 3 && (
                                <>
                                    <h4 className="mb-4 border-b border-border pb-2 text-[1rem] font-bold uppercase tracking-wide text-accent sm:text-[1.1rem]">Langkah 3: Konfirmasi Sewa</h4>
                                    <div className="mb-5 rounded-lg border border-border bg-bg-main/40 p-3 text-sm text-text-muted">
                                        <p className="text-text-main font-semibold">{customer.name || '-'}</p>
                                        <p>{customer.phone || '-'}</p>
                                        <p>{cart.length} item dipilih ({cartQuantity} unit)</p>
                                        <div className="mt-3 flex gap-2">
                                            <button
                                                type="button"
                                                className="rounded-md border border-border px-2 py-1 text-[0.72rem] text-text-main transition hover:border-accent"
                                                onClick={() => goToMobileStep(1)}
                                            >
                                                Ubah Data
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded-md border border-border px-2 py-1 text-[0.72rem] text-text-main transition hover:border-accent"
                                                onClick={() => goToMobileStep(2)}
                                            >
                                                Ubah Barang
                                            </button>
                                        </div>
                                    </div>

                                    <div className="mb-4">
                                        <label className="block mb-1.5 text-[0.85rem] text-text-muted font-semibold">Durasi Sewa (Hari)</label>
                                        <input
                                            className={`w-full bg-bg-main border p-3 rounded-lg text-text-main text-center text-lg font-bold outline-none ${durationError ? 'border-[#e74c3c]' : 'border-border focus:border-accent'}`}
                                            type="number"
                                            data-rental-field="mobile-duration"
                                            aria-invalid={Boolean(durationError)}
                                            aria-describedby={durationError ? 'mobile-duration-error' : undefined}
                                            min="1"
                                            value={duration}
                                            onChange={(e) => handleDurationChange(e.target.value)}
                                        />
                                        {durationError && <p id="mobile-duration-error" className="mt-1 text-xs text-[#e74c3c]">{durationError}</p>}
                                    </div>

                                    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <div>
                                            <label className="mb-1.5 block text-[0.85rem] text-text-muted font-semibold">Status Pembayaran</label>
                                            <select
                                                className="w-full rounded-lg border border-border bg-bg-main p-3 text-sm text-text-main outline-none focus:border-accent"
                                                value={payment.status}
                                                onChange={(e) => handlePaymentStatusChange(e.target.value)}
                                            >
                                                <option value="LUNAS">LUNAS</option>
                                                <option value="DP">DP</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="mb-1.5 block text-[0.85rem] text-text-muted font-semibold">Metode</label>
                                            <select
                                                className="w-full rounded-lg border border-border bg-bg-main p-3 text-sm text-text-main outline-none focus:border-accent"
                                                value={payment.method}
                                                onChange={(e) => handlePaymentMethodChange(e.target.value)}
                                            >
                                                <option value="TUNAI">TUNAI</option>
                                                <option value="QRIS">QRIS</option>
                                                <option value="BANK">BANK</option>
                                            </select>
                                        </div>
                                    </div>

                                    {payment.status === 'DP' && (
                                        <div className="mb-4">
                                            <label className="mb-1.5 block text-[0.85rem] text-text-muted font-semibold">Nominal DP</label>
                                            <input
                                                className={`w-full rounded-lg border bg-bg-main p-3 text-text-main outline-none ${paymentError ? 'border-[#e74c3c]' : 'border-border focus:border-accent'}`}
                                                type="text"
                                                inputMode="numeric"
                                                data-rental-field="mobile-paymentAmount"
                                                value={payment.paidAmount}
                                                onChange={(e) => handlePaymentAmountChange(e.target.value)}
                                                placeholder="Contoh: 150000"
                                            />
                                            {paymentError && <p className="mt-1 text-xs text-[#e74c3c]">{paymentError}</p>}
                                        </div>
                                    )}

                                    <div className="rounded-lg border border-accent/20 bg-accent/10 p-4 sm:p-5">
                                        <div className="mb-1 flex items-center justify-between gap-3">
                                            <span className="text-text-muted text-[0.9rem]">Total Bayar</span>
                                            <span className="text-text-muted text-[0.7rem] uppercase tracking-tighter">({duration} Hari)</span>
                                        </div>
                                        <h3 className="text-[1.5rem] font-bold text-accent sm:text-[1.8rem]">Rp {totalAmount.toLocaleString()}</h3>
                                        <p className="mt-1 text-xs text-text-muted">Terbayar: Rp {computedPaidAmount.toLocaleString()} • Sisa: Rp {remainingAmount.toLocaleString()}</p>
                                        <div className="mt-4 grid grid-cols-2 gap-3">
                                            <button
                                                type="button"
                                                className="w-full border border-border text-text-main py-3.5 rounded-lg font-semibold transition-all hover:border-accent"
                                                onClick={goToPreviousMobileStep}
                                            >
                                                Kembali
                                            </button>
                                            <button
                                                type="button"
                                                disabled={isSubmitting}
                                                className="w-full bg-accent text-white py-3.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-all hover:bg-accent-hover disabled:opacity-60"
                                                onClick={handleCheckout}
                                            >
                                                {isSubmitting ? 'Menyimpan...' : 'Simpan Sewa'}
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="hidden lg:flex lg:h-full lg:min-h-0 lg:flex-col">
                            <h4 className="mb-4 border-b border-border pb-2 text-[1rem] font-bold uppercase tracking-wide text-accent sm:text-[1.1rem]">Detail Penyewa</h4>
                            <div className="custom-scrollbar space-y-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                                {renderCustomerFields('desktop')}

                                <div className="h-[1px] bg-border my-6"></div>

                                <h4 className="mb-3 border-b border-border pb-2 text-[1rem] font-bold uppercase tracking-wide text-accent sm:text-[1.1rem]">Keranjang Sewa</h4>
                                {renderCartItems()}

                                <div className="mb-4">
                                    <label className="block mb-1.5 text-[0.85rem] text-text-muted font-semibold">Durasi Sewa (Hari)</label>
                                    <input
                                        className={`w-full bg-bg-main border p-3 rounded-lg text-text-main text-center text-lg font-bold outline-none ${durationError ? 'border-[#e74c3c]' : 'border-border focus:border-accent'}`}
                                        type="number"
                                        data-rental-field="desktop-duration"
                                        aria-invalid={Boolean(durationError)}
                                        aria-describedby={durationError ? 'desktop-duration-error' : undefined}
                                        min="1"
                                        value={duration}
                                        onChange={(e) => handleDurationChange(e.target.value)}
                                    />
                                    {durationError && <p id="desktop-duration-error" className="mt-1 text-xs text-[#e74c3c]">{durationError}</p>}
                                </div>

                                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div>
                                        <label className="mb-1.5 block text-[0.85rem] text-text-muted font-semibold">Status Pembayaran</label>
                                        <select
                                            className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-sm text-text-main outline-none focus:border-accent"
                                            value={payment.status}
                                            onChange={(e) => handlePaymentStatusChange(e.target.value)}
                                        >
                                            <option value="LUNAS">LUNAS</option>
                                            <option value="DP">DP</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-[0.85rem] text-text-muted font-semibold">Metode</label>
                                        <select
                                            className="w-full rounded-lg border border-border bg-bg-main p-2.5 text-sm text-text-main outline-none focus:border-accent"
                                            value={payment.method}
                                            onChange={(e) => handlePaymentMethodChange(e.target.value)}
                                        >
                                            <option value="TUNAI">TUNAI</option>
                                            <option value="QRIS">QRIS</option>
                                            <option value="BANK">BANK</option>
                                        </select>
                                    </div>
                                </div>

                                {payment.status === 'DP' && (
                                    <div className="mb-4">
                                        <label className="mb-1.5 block text-[0.85rem] text-text-muted font-semibold">Nominal DP</label>
                                        <input
                                            className={`w-full rounded-lg border bg-bg-main p-2.5 text-text-main outline-none ${paymentError ? 'border-[#e74c3c]' : 'border-border focus:border-accent'}`}
                                            type="text"
                                            inputMode="numeric"
                                            data-rental-field="desktop-paymentAmount"
                                            value={payment.paidAmount}
                                            onChange={(e) => handlePaymentAmountChange(e.target.value)}
                                            placeholder="Contoh: 150000"
                                        />
                                        {paymentError && <p className="mt-1 text-xs text-[#e74c3c]">{paymentError}</p>}
                                    </div>
                                )}
                            </div>

                            <div className="mt-4 rounded-lg border border-accent/20 bg-accent/10 p-4 sm:p-5 lg:sticky lg:bottom-0 lg:z-10 lg:backdrop-blur">
                                <div className="mb-1 flex items-center justify-between gap-3">
                                    <span className="text-text-muted text-[0.9rem]">Total Bayar</span>
                                    <span className="text-text-muted text-[0.7rem] uppercase tracking-tighter">({duration} Hari)</span>
                                </div>
                                <h3 className="text-[1.5rem] font-bold text-accent sm:text-[1.8rem]">Rp {totalAmount.toLocaleString()}</h3>
                                <p className="mt-1 text-xs text-text-muted">Terbayar: Rp {computedPaidAmount.toLocaleString()} • Sisa: Rp {remainingAmount.toLocaleString()}</p>
                                <button
                                    type="button"
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
            </div>

            <ReceiptModal
                isOpen={Boolean(receiptRental)}
                rental={receiptRental}
                onClose={handleCloseReceipt}
                onPrint={handlePrintReceipt}
                onShareWhatsApp={handleShareReceiptWhatsApp}
            />
        </div>
    );
};

export default Rental;

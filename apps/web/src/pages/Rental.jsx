import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { fetchCustomers } from '../lib/api';
import { APP_CACHE_KEYS } from '../lib/appCache';
import RentalDateRangePicker from '../components/RentalDateRangePicker';
import ReceiptModal from '../components/ReceiptModal';
import { openReceiptWhatsApp, printReceipt } from '../lib/receipt';
import {
    calculateRentalDurationDays,
    formatDateTimeLocalInput,
    resolveRentalDayPolicy,
    toDate,
} from '../lib/rentalTime';

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
const RENTAL_DRAFT_STORAGE_KEY = 'avia_rental_draft_v1';
const DAY_MS = 24 * 60 * 60 * 1000;
const RENTAL_PRIMARY_BUTTON_CLASS = 'w-full rounded-md bg-[#146c43] py-3 text-sm font-bold text-white transition hover:bg-[#0f5132] disabled:cursor-not-allowed disabled:bg-[#aebbb5]';
const RENTAL_SECONDARY_BUTTON_CLASS = 'w-full rounded-md border border-[#cfd8d3] bg-white px-3 py-3 text-sm font-semibold text-[#10231c] transition hover:border-[#146c43]';
const RENTAL_FIELD_CLASS = 'w-full rounded-md border border-[#cfd8d3] bg-white p-2.5 text-[#10231c] outline-none transition-colors focus:border-[#146c43]';

const getDefaultRentalTimeRange = () => {
    const startAt = new Date();
    startAt.setSeconds(0, 0);
    const endAt = new Date(startAt.getTime() + DAY_MS);
    return {
        startInput: formatDateTimeLocalInput(startAt),
        endInput: formatDateTimeLocalInput(endAt),
    };
};

const Rental = ({
    inventory,
    categories,
    cart,
    setCart,
    onCheckout,
    currentUser,
    tenantSettings,
}) => {
    const safeInventory = useMemo(() => (Array.isArray(inventory) ? inventory : []), [inventory]);
    const safeCategories = useMemo(() => (Array.isArray(categories) ? categories : []), [categories]);
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [inventorySearch, setInventorySearch] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [customer, setCustomer] = useState(INITIAL_CUSTOMER);
    const [duration, setDuration] = useState(1);
    const [rentalTimeRange, setRentalTimeRange] = useState(() => getDefaultRentalTimeRange());
    const [debouncedCustomerSearch, setDebouncedCustomerSearch] = useState('');
    const [selectedCustomerId, setSelectedCustomerId] = useState(null);
    const [payment, setPayment] = useState(INITIAL_PAYMENT);
    const [mobileStep, setMobileStep] = useState(1);
    const [customerErrors, setCustomerErrors] = useState(INITIAL_CUSTOMER_ERRORS);
    const [itemsError, setItemsError] = useState('');
    const [durationError, setDurationError] = useState('');
    const [paymentError, setPaymentError] = useState('');
    const [mobileStepHint, setMobileStepHint] = useState('');
    const [receiptRental, setReceiptRental] = useState(null);
    const [isFinalReviewOpen, setIsFinalReviewOpen] = useState(false);
    const [isFinalReviewChecked, setIsFinalReviewChecked] = useState(false);
    const focusTimeoutRef = useRef(null);
    const hasRestoredDraftRef = useRef(false);
    const checkoutInFlightRef = useRef(false);

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
        if (categoryFilter !== 'all' && !safeCategories.includes(categoryFilter)) {
            setCategoryFilter('all');
        }
    }, [categoryFilter, safeCategories]);

    useEffect(() => {
        if (selectedCustomerId) {
            setDebouncedCustomerSearch('');
            return undefined;
        }

        const keyword = customer.name.trim();
        const timeoutId = setTimeout(() => setDebouncedCustomerSearch(keyword), 250);

        return () => clearTimeout(timeoutId);
    }, [customer.name, selectedCustomerId]);

    const normalizedCustomerNameSearch = customer.name.trim();
    const isCustomerLookupActive = !selectedCustomerId && normalizedCustomerNameSearch.length >= 2;
    const hasFreshCustomerLookup = isCustomerLookupActive && debouncedCustomerSearch === normalizedCustomerNameSearch;

    const customerSuggestionQuery = useSWR(
        debouncedCustomerSearch.length >= 2 ? APP_CACHE_KEYS.customers(debouncedCustomerSearch) : null,
        ([, keyword]) => fetchCustomers(keyword),
    );
    const customerSuggestions = useMemo(
        () => (hasFreshCustomerLookup && Array.isArray(customerSuggestionQuery.data) ? customerSuggestionQuery.data : []),
        [customerSuggestionQuery.data, hasFreshCustomerLookup],
    );
    const isSearchingCustomer = hasFreshCustomerLookup && customerSuggestionQuery.isLoading;

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
    const cartQtyByItemId = useMemo(() => {
        const nextMap = new Map();
        cart.forEach((cartItem) => {
            nextMap.set(cartItem.id, Number(cartItem.qty) || 0);
        });
        return nextMap;
    }, [cart]);
    const rentalDayPolicy = useMemo(
        () => resolveRentalDayPolicy(tenantSettings),
        [tenantSettings],
    );
    const rentalStartAt = useMemo(() => toDate(rentalTimeRange.startInput), [rentalTimeRange.startInput]);
    const rentalEndAt = useMemo(() => toDate(rentalTimeRange.endInput), [rentalTimeRange.endInput]);

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
        setSelectedCustomerId(null);
        const draftStartAt = toDate(draftPayload.rentalStartAt || draftPayload.date);
        const draftEndAt = toDate(draftPayload.rentalEndAt);
        if (draftStartAt && draftEndAt) {
            setRentalTimeRange({
                startInput: formatDateTimeLocalInput(draftStartAt),
                endInput: formatDateTimeLocalInput(draftEndAt),
            });
        } else {
            const fallbackDuration = Number.isFinite(draftPayload.duration) ? Math.max(1, draftPayload.duration) : 1;
            const fallbackStart = draftStartAt || new Date();
            fallbackStart.setSeconds(0, 0);
            const fallbackEnd = new Date(fallbackStart.getTime() + (fallbackDuration * DAY_MS));
            setRentalTimeRange({
                startInput: formatDateTimeLocalInput(fallbackStart),
                endInput: formatDateTimeLocalInput(fallbackEnd),
            });
        }
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

    useEffect(() => {
        const computedDuration = calculateRentalDurationDays(rentalStartAt, rentalEndAt, rentalDayPolicy);
        if (computedDuration > 0) {
            setDuration(computedDuration);
            if (durationError) {
                setDurationError('');
            }
        }
    }, [rentalStartAt, rentalEndAt, rentalDayPolicy, durationError]);

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

    const handleDecreaseInventoryQty = (itemId) => {
        const currentQty = cartQtyByItemId.get(itemId) || 0;
        if (currentQty <= 0) {
            return;
        }

        if (currentQty === 1) {
            removeFromCart(itemId);
            return;
        }

        updateCartQty(itemId, -1);
    };

    const updateCartNote = (id, note) => {
        setCart(cart.map((c) => (c.id === id ? { ...c, notes: note } : c)));
    };

    const calculatedDuration = calculateRentalDurationDays(rentalStartAt, rentalEndAt, rentalDayPolicy);
    const effectiveDuration = calculatedDuration > 0 ? calculatedDuration : 0;
    const calculateTotal = () => cart.reduce((sum, item) => sum + (item.price * item.qty * effectiveDuration), 0);
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
    const formatCurrency = (value) => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
    const formatDateTimeForSummary = (dateValue) => {
        if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
            return '-';
        }

        return dateValue.toLocaleString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const renderQuantityStepper = (item, qtyInCart, isOutOfStock) => {
        const canDecrease = qtyInCart > 0;
        const canIncrease = !isOutOfStock && qtyInCart < Number(item.stock || 0);

        return (
            <div className="flex h-9 shrink-0 items-center border border-[#cfd8d3] bg-white">
                <button
                    type="button"
                    aria-label={`Kurangi ${item.name}`}
                    disabled={!canDecrease}
                    className="flex h-9 w-9 items-center justify-center border-r border-[#cfd8d3] text-sm font-bold text-[#0f3d2e] disabled:cursor-not-allowed disabled:text-[#9aa8a1]"
                    onClick={(event) => {
                        event.stopPropagation();
                        handleDecreaseInventoryQty(item.id);
                    }}
                >
                    -
                </button>
                <span className="flex h-9 min-w-10 items-center justify-center px-2 text-sm font-bold text-[#10231c]">
                    {qtyInCart}
                </span>
                <button
                    type="button"
                    aria-label={`Tambah ${item.name}`}
                    disabled={!canIncrease}
                    className="flex h-9 w-9 items-center justify-center border-l border-[#cfd8d3] bg-[#146c43] text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-[#d8e0dc] disabled:text-[#7a8982]"
                    onClick={(event) => {
                        event.stopPropagation();
                        addToCart(item);
                    }}
                >
                    +
                </button>
            </div>
        );
    };

    const renderInventoryTextRow = (item) => {
        const stock = Number(item.stock || 0);
        const price = Number(item.price || 0);
        const isOutOfStock = stock <= 0;
        const qtyInCart = cartQtyByItemId.get(item.id) || 0;
        const isSelected = qtyInCart > 0;

        return (
            <div
                key={item.id}
                data-testid={`rental-inventory-row-${item.id}`}
                className={`border bg-white p-3 ${isSelected ? 'border-[#146c43]' : 'border-[#d7ded9]'} ${isOutOfStock ? 'opacity-60' : ''}`}
            >
                <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-bold text-[#10231c]">{item.name}</p>
                            {isOutOfStock && (
                                <span className="border border-[#c0392b] bg-white px-2 py-0.5 text-[0.65rem] font-bold uppercase text-[#c0392b]">
                                    Habis
                                </span>
                            )}
                        </div>
                        <p className="mt-1 text-xs text-[#5c6b64]">{item.category || 'Tanpa kategori'}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                            <span className="font-bold text-[#146c43]">{formatCurrency(price)} /hari</span>
                            <span className="text-[#5c6b64]">Stok: {stock}</span>
                        </div>
                    </div>
                    {renderQuantityStepper(item, qtyInCart, isOutOfStock)}
                </div>
            </div>
        );
    };

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
        if (!rentalStartAt || !rentalEndAt) {
            setDurationError('Tanggal mulai dan selesai wajib diisi.');
            if (focusOnError) {
                scheduleFocusField('rentalRange');
            }
            return false;
        }

        if (rentalEndAt.getTime() <= rentalStartAt.getTime()) {
            setDurationError('Tanggal selesai harus setelah tanggal mulai.');
            if (focusOnError) {
                scheduleFocusField('rentalRange');
            }
            return false;
        }

        if (!Number.isFinite(calculatedDuration) || calculatedDuration < 1) {
            setDurationError('Durasi sewa minimal 1 hari.');
            if (focusOnError) {
                scheduleFocusField('rentalRange');
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

    const validateCheckoutBeforeSubmit = () => {
        const isCustomerValid = validateCustomerStep({ focusOnError: true });
        const isItemsValid = validateItemsStep({ focusOnError: true });
        const isDurationValid = validateDurationStep({ focusOnError: true });
        const isPaymentValid = validatePaymentStep({ focusOnError: true });

        if (!isCustomerValid) {
            setMobileStep(1);
            setMobileStepHint('Lengkapi data penyewa dulu sebelum menyimpan transaksi.');
            alert('Lengkapi data penyewa terlebih dahulu.');
            return false;
        }

        if (!isItemsValid) {
            setMobileStep(2);
            setMobileStepHint('Pilih barang sewa dulu sebelum menyimpan transaksi.');
            alert('Pilih barang yang akan disewa terlebih dahulu.');
            return false;
        }

        if (!isDurationValid) {
            setMobileStep(3);
            setMobileStepHint('Periksa durasi sewa sebelum menyimpan transaksi.');
            alert('Durasi sewa belum valid.');
            return false;
        }

        if (!isPaymentValid) {
            setMobileStep(3);
            setMobileStepHint('Periksa detail pembayaran sebelum menyimpan transaksi.');
            alert('Detail pembayaran belum valid.');
            return false;
        }

        return true;
    };

    const handleOpenFinalReview = () => {
        if (!validateCheckoutBeforeSubmit()) {
            return;
        }

        setMobileStepHint('');
        setIsFinalReviewChecked(false);
        setIsFinalReviewOpen(true);
    };

    const handleConfirmCheckout = async () => {
        if (isSubmitting || checkoutInFlightRef.current) {
            return;
        }

        if (!validateCheckoutBeforeSubmit()) {
            setIsFinalReviewOpen(false);
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
            duration: effectiveDuration,
            rentalStartAt: rentalStartAt ? rentalStartAt.toISOString() : undefined,
            rentalEndAt: rentalEndAt ? rentalEndAt.toISOString() : undefined,
            payment: {
                status: payment.status,
                method: payment.method,
                ...(payment.status === 'DP' ? { paidAmount: parsePaidAmount() } : {}),
            },
        };

        try {
            checkoutInFlightRef.current = true;
            setIsSubmitting(true);
            const createdRental = await onCheckout(payload);
            setCart([]);
            clearSavedDraft();
            setCustomer(INITIAL_CUSTOMER);
            setCustomerErrors(INITIAL_CUSTOMER_ERRORS);
            setSelectedCustomerId(null);
            setDebouncedCustomerSearch('');
            setDuration(1);
            setRentalTimeRange(getDefaultRentalTimeRange());
            setPayment(INITIAL_PAYMENT);
            setInventorySearch('');
            setCategoryFilter('all');
            setDurationError('');
            setPaymentError('');
            setItemsError('');
            setMobileStepHint('');
            setMobileStep(1);
            setIsFinalReviewChecked(false);
            setIsFinalReviewOpen(false);
            setReceiptRental(createdRental || null);
            alert('Transaksi berhasil disimpan!');
            scheduleFocusField('name');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Gagal menyimpan transaksi sewa.';
            alert(message);
        } finally {
            checkoutInFlightRef.current = false;
            setIsSubmitting(false);
        }
    };

    const handleCloseFinalReview = () => {
        if (isSubmitting) {
            return;
        }

        setIsFinalReviewChecked(false);
        setIsFinalReviewOpen(false);
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
        setSelectedCustomerId(pickedCustomer.id || null);
        setDebouncedCustomerSearch('');
        setMobileStepHint('');
    };

    const handleNameChange = (value) => {
        setCustomer((previous) => ({ ...previous, name: value }));
        setSelectedCustomerId(null);
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

    const handleRentalRangeChange = (startInput, endInput) => {
        setRentalTimeRange({
            startInput,
            endInput,
        });
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
                <label htmlFor={`${layout}-customer-name`} className="block mb-1.5 text-[0.85rem] text-text-muted">Nama Customer</label>
                <input
                    id={`${layout}-customer-name`}
                    className={`${RENTAL_FIELD_CLASS} ${customerErrors.name ? 'border-[#c0392b]' : ''}`}
                    type="text"
                    data-rental-field={`${layout}-name`}
                    aria-invalid={Boolean(customerErrors.name)}
                    aria-describedby={customerErrors.name ? nameErrorId : undefined}
                    placeholder="Ketik nama customer..."
                    value={customer.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                />
                {isSearchingCustomer && (
                    <p className="text-xs text-text-muted mt-1">Mencari customer...</p>
                )}
                {customerSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 z-20 mt-2 max-h-52 overflow-y-auto rounded-md border border-[#d7ded9] bg-white">
                        {customerSuggestions.map((suggestion) => (
                            <button
                                key={suggestion.id}
                                type="button"
                                className="w-full text-left px-3 py-2 border-b border-border/40 last:border-b-0 hover:bg-surface-hover"
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
                {customerErrors.name && <p id={nameErrorId} className="mt-1 text-xs text-[#e74c3c]">{customerErrors.name}</p>}
            </div>
            <div className="form-group">
                <label className="block mb-1.5 text-[0.85rem] text-text-muted">Nomor HP</label>
                <input
                    className={`${RENTAL_FIELD_CLASS} ${customerErrors.phone ? 'border-[#c0392b]' : ''}`}
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
                    className={`${RENTAL_FIELD_CLASS} min-h-[78px] resize-y`}
                    placeholder="Alamat customer..."
                    value={customer.address}
                    onChange={(e) => setCustomer((previous) => ({ ...previous, address: e.target.value }))}
                ></textarea>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="form-group">
                    <label className="block mb-1.5 text-[0.85rem] text-text-muted">Jaminan</label>
                    <select
                        className={`${RENTAL_FIELD_CLASS} cursor-pointer`}
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
                        className={RENTAL_FIELD_CLASS}
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
                        className={`${RENTAL_FIELD_CLASS} ${customerErrors.guaranteeOther ? 'border-[#c0392b]' : ''}`}
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
            <div className="custom-scrollbar mb-4 max-h-[300px] space-y-4 overflow-y-auto pr-1 sm:pr-2 lg:max-h-none lg:overflow-visible lg:pr-0">
                {cart.length === 0 ? (
                    <div className="text-center py-6 text-text-muted italic text-sm">Belum ada barang dipilih.</div>
                ) : (
                    cart.map((item) => (
                        <div className="rounded-md border border-[#d7ded9] bg-white p-4" key={item.id}>
                            <div className="mb-3 flex items-start justify-between gap-3">
                                <div className="flex min-w-0 flex-col">
                                    <span className="text-text-main font-medium">{item.name}</span>
                                    <small className="text-text-muted">Rp {parseInt(item.price, 10).toLocaleString()} x {item.qty}</small>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    <button type="button" className="flex h-9 w-9 items-center justify-center rounded-md border border-[#cfd8d3] bg-white text-[#10231c] transition hover:border-[#146c43]" onClick={() => updateCartQty(item.id, -1)}>-</button>
                                    <span className="w-6 text-center text-sm font-bold">{item.qty}</span>
                                    <button type="button" className="flex h-9 w-9 items-center justify-center rounded-md border border-[#cfd8d3] bg-white text-[#10231c] transition hover:border-[#146c43]" onClick={() => updateCartQty(item.id, 1)}>+</button>
                                    <button type="button" className="rounded p-2 text-[#e74c3c] hover:bg-[#e74c3c]/10" onClick={() => removeFromCart(item.id)}>&times;</button>
                                </div>
                            </div>
                            <textarea
                                className="min-h-[50px] w-full resize-none rounded-md border border-[#cfd8d3] bg-white p-2 text-[0.85rem] text-text-muted outline-none focus:border-[#146c43]"
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

    const renderRentalDateRange = (layout) => {
        const durationErrorId = `${layout}-duration-error`;

        return (
            <div className="mb-4 rounded-md border border-[#d7ded9] bg-white p-3">
                <label className="block mb-1.5 text-[0.85rem] text-text-muted font-semibold">Rentang Waktu Sewa</label>
                <RentalDateRangePicker
                    startAt={rentalTimeRange.startInput}
                    endAt={rentalTimeRange.endInput}
                    onChange={handleRentalRangeChange}
                    className={RENTAL_FIELD_CLASS}
                    error={Boolean(durationError)}
                    fieldKey={`${layout}-rentalRange`}
                    describedBy={durationError ? durationErrorId : undefined}
                />
                <p className="mt-2 text-xs text-text-muted">
                    Sistem: {rentalDayPolicy.mode === 'DAILY_CUTOFF'
                        ? `Cut-off ${String(rentalDayPolicy.cutoffHour).padStart(2, '0')}:${String(rentalDayPolicy.cutoffMinute).padStart(2, '0')}`
                        : 'Per 24 jam'}
                </p>
                <p className="mt-1 text-sm font-semibold text-text-main">Durasi terhitung: {effectiveDuration} hari</p>
                {durationError && <p id={durationErrorId} className="mt-1 text-xs text-[#e74c3c]">{durationError}</p>}
            </div>
        );
    };

    return (
        <div className="pt-0 pb-4 sm:pb-5 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:pb-0">
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
                            className={`rounded-md border px-2 py-2 text-center transition-all ${isActive ? 'border-[#146c43] bg-white text-[#146c43]' : 'border-[#d7ded9] bg-white'} ${isPassed ? 'border-[#146c43] bg-white text-[#146c43]' : ''} ${isClickable ? 'hover:border-[#146c43]' : 'opacity-70'}`}
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

            <div className="flex flex-col gap-5 lg:h-full lg:min-h-0 lg:flex-row lg:gap-5 lg:overflow-hidden">
                <div className={`${mobileStep === 2 ? 'flex' : 'hidden'} w-full flex-col lg:order-2 lg:flex lg:w-[38%] lg:min-h-0 lg:overflow-hidden`}>
                    <div className="mb-3">
                        <h3 className="text-base font-bold text-[#10231c]">Barang Tersedia</h3>
                        <div className="sticky top-0 z-20 mt-3 rounded-md border border-[#d7ded9] bg-white p-3 lg:static lg:mt-0 lg:border-0 lg:p-0">
                            <div className="flex flex-col gap-2 lg:gap-3">
                                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-end">
                                    <div className="w-full rounded-md border border-[#cfd8d3] bg-white px-4 py-2 lg:min-w-[220px]">
                                        <input
                                            className="w-full border-none bg-white text-sm text-[#10231c] outline-none placeholder:text-text-muted"
                                            type="text"
                                            data-rental-field="shared-inventorySearch"
                                            placeholder="Cari barang atau kategori..."
                                            value={inventorySearch}
                                            onChange={(e) => setInventorySearch(e.target.value)}
                                        />
                                    </div>
                                    <div className="w-full rounded-md border border-[#cfd8d3] bg-white px-4 py-2 lg:w-[180px]">
                                        <select
                                            className="w-full cursor-pointer border-none bg-white text-sm text-[#10231c] outline-none"
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
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="custom-scrollbar lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-y-contain lg:pr-2">
                        {filteredItems.length === 0 ? (
                            <div className="mt-4 border border-[#d7ded9] bg-white p-4 text-center text-sm text-[#5c6b64]">
                                {normalizedInventorySearch
                                    ? 'Barang tidak ditemukan. Coba kata kunci lain.'
                                    : 'Tidak ada barang pada kategori ini.'}
                            </div>
                        ) : (
                            <div className="mt-2 flex flex-col gap-2">
                                {filteredItems.map((item) => renderInventoryTextRow(item))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="w-full lg:order-1 lg:flex lg:w-[62%] lg:min-h-0 lg:flex-col">
                    <div className="rounded-md border border-[#d7ded9] bg-white p-4 shadow-none sm:p-6 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
                        <div className="lg:hidden">
                            {mobileStep === 1 && (
                                <>
                                    <h4 className="mb-4 border-b border-[#d7ded9] pb-2 text-[1rem] font-bold uppercase tracking-wide text-[#146c43] sm:text-[1.1rem]">Langkah 1: Data Penyewa</h4>
                                    <div className="space-y-4">{renderCustomerFields('mobile')}</div>
                                    <button
                                        type="button"
                                        className={`mt-5 ${RENTAL_PRIMARY_BUTTON_CLASS}`}
                                        onClick={goToNextMobileStep}
                                    >
                                        Lanjut ke Pilih Barang
                                    </button>
                                </>
                            )}

                            {mobileStep === 2 && (
                                <>
                                    <h4 className="mb-4 border-b border-[#d7ded9] pb-2 text-[1rem] font-bold uppercase tracking-wide text-[#146c43] sm:text-[1.1rem]">Langkah 2: Pilih Barang</h4>
                                    <p className="mb-2 text-xs text-text-muted">Tap barang di daftar inventaris untuk menambah ke keranjang.</p>
                                    <p className="mb-4 text-xs text-text-muted">
                                        {cart.length === 0 ? 'Belum ada item dipilih.' : `${cart.length} item aktif (${cartQuantity} total unit)`}
                                    </p>
                                    {renderCartItems()}
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            className={RENTAL_SECONDARY_BUTTON_CLASS}
                                            onClick={goToPreviousMobileStep}
                                        >
                                            Kembali
                                        </button>
                                        <button
                                            type="button"
                                            disabled={!isItemsStepComplete}
                                            className={RENTAL_PRIMARY_BUTTON_CLASS}
                                            onClick={goToNextMobileStep}
                                        >
                                            Lanjut ke Konfirmasi
                                        </button>
                                    </div>
                                </>
                            )}

                            {mobileStep === 3 && (
                                <>
                                    <h4 className="mb-4 border-b border-[#d7ded9] pb-2 text-[1rem] font-bold uppercase tracking-wide text-[#146c43] sm:text-[1.1rem]">Langkah 3: Konfirmasi Sewa</h4>
                                    <div className="mb-5 rounded-md border border-[#d7ded9] bg-white p-3 text-sm text-text-muted">
                                        <p className="text-text-main font-semibold">{customer.name || '-'}</p>
                                        <p>{customer.phone || '-'}</p>
                                        <p>{cart.length} item dipilih ({cartQuantity} unit)</p>
                                        <div className="mt-3 flex gap-2">
                                            <button
                                                type="button"
                                                className="rounded-md border border-[#cfd8d3] bg-white px-2 py-1 text-[0.72rem] text-[#10231c] transition hover:border-[#146c43]"
                                                onClick={() => goToMobileStep(1)}
                                            >
                                                Ubah Data
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded-md border border-[#cfd8d3] bg-white px-2 py-1 text-[0.72rem] text-[#10231c] transition hover:border-[#146c43]"
                                                onClick={() => goToMobileStep(2)}
                                            >
                                                Ubah Barang
                                            </button>
                                        </div>
                                    </div>

                                    {renderRentalDateRange('mobile')}

                                    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <div>
                                            <label className="mb-1.5 block text-[0.85rem] text-text-muted font-semibold">Status Pembayaran</label>
                                            <select
                                                className={`${RENTAL_FIELD_CLASS} p-3 text-sm`}
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
                                                className={`${RENTAL_FIELD_CLASS} p-3 text-sm`}
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
                                                className={`${RENTAL_FIELD_CLASS} p-3 ${paymentError ? 'border-[#c0392b]' : ''}`}
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

                                    <div className="rounded-md border border-[#146c43] bg-white p-4 sm:p-5">
                                        <div className="mb-1 flex items-center justify-between gap-3">
                                            <span className="text-text-muted text-[0.9rem]">Total Bayar</span>
                                            <span className="text-text-muted text-[0.7rem] uppercase tracking-tighter">({effectiveDuration} Hari)</span>
                                        </div>
                                        <h3 className="text-[1.5rem] font-bold text-[#146c43] sm:text-[1.8rem]">Rp {totalAmount.toLocaleString()}</h3>
                                        <p className="mt-1 text-xs text-text-muted">Terbayar: Rp {computedPaidAmount.toLocaleString()} • Sisa: Rp {remainingAmount.toLocaleString()}</p>
                                        <div className="mt-4 grid grid-cols-2 gap-3">
                                            <button
                                                type="button"
                                                className={RENTAL_SECONDARY_BUTTON_CLASS}
                                                onClick={goToPreviousMobileStep}
                                            >
                                                Kembali
                                            </button>
                                            <button
                                                type="button"
                                                disabled={isSubmitting}
                                                className={`${RENTAL_PRIMARY_BUTTON_CLASS} flex items-center justify-center gap-2`}
                                                onClick={handleOpenFinalReview}
                                            >
                                                {isSubmitting ? 'Menyimpan...' : 'Lanjut ke Review'}
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="hidden lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:overflow-hidden">
                            <h4 className="mb-4 border-b border-[#d7ded9] pb-2 text-[1rem] font-bold uppercase tracking-wide text-[#146c43] sm:text-[1.1rem]">Detail Penyewa</h4>
                            <div className="custom-scrollbar space-y-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-y-contain lg:pr-1">
                                {renderCustomerFields('desktop')}

                                <div className="h-[1px] bg-border my-6"></div>

                                <h4 className="mb-3 border-b border-[#d7ded9] pb-2 text-[1rem] font-bold uppercase tracking-wide text-[#146c43] sm:text-[1.1rem]">Keranjang Sewa</h4>
                                {renderCartItems()}

                                {renderRentalDateRange('desktop')}

                                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div>
                                        <label className="mb-1.5 block text-[0.85rem] text-text-muted font-semibold">Status Pembayaran</label>
                                        <select
                                            className={`${RENTAL_FIELD_CLASS} text-sm`}
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
                                            className={`${RENTAL_FIELD_CLASS} text-sm`}
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
                                            className={`${RENTAL_FIELD_CLASS} ${paymentError ? 'border-[#c0392b]' : ''}`}
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

                            <div className="mt-4 rounded-md border border-[#146c43] bg-white p-4 sm:p-5">
                                <div className="mb-1 flex items-center justify-between gap-3">
                                    <span className="text-text-muted text-[0.9rem]">Total Bayar</span>
                                    <span className="text-text-muted text-[0.7rem] uppercase tracking-tighter">({effectiveDuration} Hari)</span>
                                </div>
                                <h3 className="text-[1.5rem] font-bold text-[#146c43] sm:text-[1.8rem]">Rp {totalAmount.toLocaleString()}</h3>
                                <p className="mt-1 text-xs text-text-muted">Terbayar: Rp {computedPaidAmount.toLocaleString()} • Sisa: Rp {remainingAmount.toLocaleString()}</p>
                                <button
                                    type="button"
                                    disabled={isSubmitting}
                                    className={`mt-4 flex items-center justify-center gap-3 py-4 ${RENTAL_PRIMARY_BUTTON_CLASS}`}
                                    onClick={handleOpenFinalReview}
                                >
                                    <i className="fas fa-shopping-cart group-hover:animate-bounce"></i> {isSubmitting ? 'Menyimpan...' : 'Lanjut ke Review'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {isFinalReviewOpen && (
                <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-5">
                    <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-md border border-[#d7ded9] bg-white shadow-none">
                        <div className="flex items-start justify-between gap-3 border-b border-[#d7ded9] px-4 py-3 sm:px-5">
                            <div>
                                <p className="text-xs uppercase tracking-wide text-text-muted">Tahap Akhir</p>
                                <h4 className="text-lg font-bold text-text-main">Konfirmasi & Review Sewa</h4>
                            </div>
                            <button
                                type="button"
                                className="rounded-md border border-[#cfd8d3] bg-white px-2 py-1 text-xs text-[#10231c] transition hover:border-[#146c43] disabled:opacity-60"
                                onClick={handleCloseFinalReview}
                                disabled={isSubmitting}
                            >
                                Tutup
                            </button>
                        </div>

                        <div className="custom-scrollbar max-h-[62vh] space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
                            <div className="rounded-md border border-[#d7ded9] bg-white p-3">
                                <p className="text-xs uppercase tracking-wide text-text-muted">Penyewa</p>
                                <p className="mt-1 font-semibold text-text-main">{customer.name || '-'}</p>
                                <p className="text-sm text-text-muted">{customer.phone || '-'}</p>
                            </div>

                            <div className="rounded-md border border-[#d7ded9] bg-white p-3">
                                <p className="text-xs uppercase tracking-wide text-text-muted">Waktu Sewa</p>
                                <p className="mt-1 text-sm text-text-main">{formatDateTimeForSummary(rentalStartAt)} - {formatDateTimeForSummary(rentalEndAt)}</p>
                                <p className="mt-1 text-sm text-text-muted">Durasi: <span className="font-semibold text-text-main">{effectiveDuration} hari</span></p>
                            </div>

                            <div className="rounded-md border border-[#d7ded9] bg-white p-3">
                                <p className="mb-2 text-xs uppercase tracking-wide text-text-muted">Review Barang</p>
                                <div className="space-y-2">
                                    {cart.map((item) => {
                                        const perDay = Number(item.price || 0);
                                        const itemQty = Number(item.qty || 0);
                                        const lineTotal = perDay * itemQty * effectiveDuration;
                                        return (
                                            <div key={`review-${item.id}`} className="rounded-md border border-[#d7ded9] bg-white p-2.5">
                                                <div className="flex items-start justify-between gap-3">
                                                    <p className="text-sm font-semibold text-text-main">{item.name}</p>
                                                    <p className="text-sm font-bold text-[#146c43]">{formatCurrency(lineTotal)}</p>
                                                </div>
                                                <p className="mt-1 text-xs text-text-muted">
                                                    {itemQty} x {formatCurrency(perDay)} x {effectiveDuration} hari
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="rounded-md border border-[#146c43] bg-white p-3">
                                <div className="flex items-center justify-between text-sm text-text-muted">
                                    <span>Status Pembayaran</span>
                                    <span className="font-semibold text-text-main">{payment.status}</span>
                                </div>
                                <div className="mt-1 flex items-center justify-between text-sm text-text-muted">
                                    <span>Metode</span>
                                    <span className="font-semibold text-text-main">{payment.method}</span>
                                </div>
                                <div className="mt-1 flex items-center justify-between text-sm text-text-muted">
                                    <span>Terbayar</span>
                                    <span className="font-semibold text-text-main">{formatCurrency(computedPaidAmount)}</span>
                                </div>
                                <div className="mt-1 flex items-center justify-between text-sm text-text-muted">
                                    <span>Sisa</span>
                                    <span className="font-semibold text-text-main">{formatCurrency(remainingAmount)}</span>
                                </div>
                                <div className="mt-3 border-t border-[#d7ded9] pt-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-text-muted">Total Sewa</span>
                                        <span className="text-lg font-bold text-[#146c43]">{formatCurrency(totalAmount)}</span>
                                    </div>
                                </div>
                            </div>

                            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-[#d7ded9] bg-white p-3">
                                <input
                                    type="checkbox"
                                    className="mt-0.5 h-4 w-4 accent-[#146c43]"
                                    checked={isFinalReviewChecked}
                                    onChange={(event) => setIsFinalReviewChecked(event.target.checked)}
                                    disabled={isSubmitting}
                                />
                                <span className="text-sm text-text-main">
                                    Saya sudah cek data penyewa, barang, durasi, dan total harga.
                                </span>
                            </label>
                        </div>

                        <div className="border-t border-[#d7ded9] px-4 py-3 sm:px-5">
                            {!isFinalReviewChecked && !isSubmitting && (
                                <p className="mb-2 text-xs text-text-muted">
                                    Centang konfirmasi review terlebih dahulu untuk melanjutkan.
                                </p>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                className={`${RENTAL_SECONDARY_BUTTON_CLASS} disabled:opacity-60`}
                                onClick={handleCloseFinalReview}
                                disabled={isSubmitting}
                            >
                                Kembali Edit
                            </button>
                            <button
                                type="button"
                                className={`${RENTAL_PRIMARY_BUTTON_CLASS} disabled:opacity-60`}
                                onClick={handleConfirmCheckout}
                                disabled={isSubmitting || !isFinalReviewChecked}
                            >
                                {isSubmitting ? 'Menyimpan...' : 'Konfirmasi Sewa'}
                            </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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

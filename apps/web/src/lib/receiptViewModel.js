const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

export function buildReceiptViewModel(rental = {}) {
    const duration = Math.max(1, toNumber(rental.duration || 1));
    const itemRows = (rental.items || []).map((item) => {
        const quantity = toNumber(item.qty);
        const unitAmount = toNumber(item.price);

        return {
            id: item.id || `${item.name}-${item.qty}`,
            label: item.name || '-',
            quantity,
            unitAmount,
            amount: unitAmount * quantity * duration,
        };
    });
    const sourceCharges = Array.isArray(rental.charges) && rental.charges.length > 0
        ? rental.charges
        : toNumber(rental.additionalFee) > 0
            ? [{ id: 'legacy-additional-fee', description: 'Denda/biaya tambahan', amount: toNumber(rental.additionalFee) }]
            : [];
    const chargeRows = sourceCharges.map((charge) => ({
        id: charge.id,
        label: charge.description || 'Biaya tambahan',
        amount: toNumber(charge.amount),
    }));
    const baseSubtotal = toNumber(rental.total);
    const invoiceTotal = baseSubtotal + chargeRows.reduce((sum, row) => sum + row.amount, 0);
    const paidAmount = toNumber(rental.payment?.paidAmount);
    const returnNotes = String(rental.returnNotes || rental.returnRecord?.returnNotes || '').trim();

    return {
        itemRows,
        baseSubtotal,
        chargeRows,
        invoiceTotal,
        paymentStatus: rental.payment?.status || (paidAmount > 0 ? 'SEBAGIAN' : 'BELUM_BAYAR'),
        paidAmount,
        remainingAmount: Math.max(0, invoiceTotal - paidAmount),
        paymentMethod: rental.payment?.method || 'TUNAI',
        returnNotes,
    };
}

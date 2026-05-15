const DEFAULT_STORE_NAME = 'AviaOutdoor';

export const DEFAULT_RECEIPT_PROFILE = {
    storeName: DEFAULT_STORE_NAME,
    addressLines: [
        'Jl. Contoh Alamat No. 123',
        'Bandung, Jawa Barat',
    ],
    phone: '0812-0000-0000',
    legalFooterLines: [
        'Barang yang sudah disewa menjadi tanggung jawab penyewa.',
        'Keterlambatan pengembalian dapat dikenakan biaya tambahan.',
    ],
};

let runtimeReceiptProfile = {};

const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const toLines = (value) => {
    if (Array.isArray(value)) {
        return value
            .map((line) => String(line || '').trim())
            .filter(Boolean);
    }

    const singleLine = String(value || '').trim();
    return singleLine ? [singleLine] : [];
};

const escapeHtml = (value) => String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const formatCurrency = (value) => `Rp ${toNumber(value).toLocaleString('id-ID')}`;

export const formatDate = (value) => new Date(value).toLocaleDateString('id-ID', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
});

export const formatDateTime = (value) => new Date(value).toLocaleString('id-ID', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});

export const getReceiptTotal = (rental) => toNumber(rental?.finalTotal ?? rental?.total);

export const getReceiptDueDate = (rental) => {
    const startDate = new Date(rental?.date || '');
    const duration = toNumber(rental?.duration);
    if (Number.isNaN(startDate.getTime()) || duration < 1) {
        return null;
    }

    const dueDate = new Date(startDate);
    dueDate.setDate(dueDate.getDate() + duration);
    return dueDate;
};

export function resolveReceiptProfile(options = {}) {
    const merged = {
        ...DEFAULT_RECEIPT_PROFILE,
        ...(runtimeReceiptProfile && typeof runtimeReceiptProfile === 'object' ? runtimeReceiptProfile : {}),
        ...options,
    };

    return {
        storeName: String(merged.storeName || DEFAULT_STORE_NAME).trim() || DEFAULT_STORE_NAME,
        addressLines: toLines(merged.addressLines),
        phone: String(merged.phone || '').trim(),
        legalFooterLines: toLines(merged.legalFooterLines),
    };
}

export function setReceiptProfile(profile) {
    runtimeReceiptProfile = profile && typeof profile === 'object' ? profile : {};
}

const toWhatsAppPhone = (rawPhone) => {
    const digits = String(rawPhone || '').replace(/\D/g, '');
    if (!digits) {
        return '';
    }

    if (digits.startsWith('62')) {
        return digits;
    }

    if (digits.startsWith('0')) {
        return `62${digits.slice(1)}`;
    }

    return `62${digits}`;
};

export function buildReceiptWhatsAppText(rental, options = {}) {
    const profile = resolveReceiptProfile(options);
    const storeName = profile.storeName;
    const cashierName = String(options.cashierName || '').trim();
    const items = Array.isArray(rental?.items) ? rental.items : [];
    const duration = toNumber(rental?.duration);
    const dueDate = getReceiptDueDate(rental);
    const total = getReceiptTotal(rental);

    const itemLines = items.map((item) => {
        const itemSubtotal = toNumber(item?.price) * toNumber(item?.qty) * duration;
        return `- ${item.name} x${item.qty} @${toNumber(item?.price).toLocaleString('id-ID')}/hari = ${itemSubtotal.toLocaleString('id-ID')}`;
    });

    return [
        `*${storeName} - Receipt Sewa*`,
        ...profile.addressLines,
        ...(profile.phone ? [`Telp: ${profile.phone}`] : []),
        `No: ${rental?.id || '-'}`,
        `Tgl: ${formatDateTime(rental?.date || new Date())}`,
        ...(cashierName ? [`Kasir: ${cashierName}`] : []),
        '',
        `Penyewa: ${rental?.customer?.name || '-'}`,
        `HP: ${rental?.customer?.phone || '-'}`,
        `Durasi: ${duration} hari`,
        `Jatuh tempo: ${dueDate ? formatDate(dueDate) : '-'}`,
        '',
        'Item:',
        ...itemLines,
        '',
        `*TOTAL: ${formatCurrency(total)}*`,
        ...profile.legalFooterLines,
        'Terima kasih.',
    ].join('\n');
}

export function openReceiptWhatsApp(rental, options = {}) {
    const text = buildReceiptWhatsAppText(rental, options);
    const targetPhone = toWhatsAppPhone(rental?.customer?.phone);
    const baseUrl = targetPhone ? `https://wa.me/${targetPhone}` : 'https://wa.me/';
    const url = `${baseUrl}?text=${encodeURIComponent(text)}`;
    const popup = window.open(url, '_blank', 'noopener,noreferrer');

    if (!popup) {
        throw new Error('Popup WhatsApp diblokir browser. Izinkan popup lalu coba lagi.');
    }
}

export function buildReceiptPrintHtml(rental, options = {}) {
    const profile = resolveReceiptProfile(options);
    const storeName = profile.storeName;
    const cashierName = String(options.cashierName || '').trim();
    const paperWidthMm = Number(options.paperWidthMm) === 58 ? 58 : 80;
    const bodyWidthMm = paperWidthMm - 6;
    const items = Array.isArray(rental?.items) ? rental.items : [];
    const dueDate = getReceiptDueDate(rental);
    const duration = toNumber(rental?.duration);
    const total = getReceiptTotal(rental);

    const rows = items.map((item) => {
        const qty = toNumber(item?.qty);
        const price = toNumber(item?.price);
        const subtotal = qty * price * duration;
        return `
            <tr>
                <td>${escapeHtml(item?.name || '-')}</td>
                <td style="text-align:center;">${qty}</td>
                <td style="text-align:right;">${formatCurrency(price)}</td>
                <td style="text-align:right;">${formatCurrency(subtotal)}</td>
            </tr>
        `;
    }).join('');

    return `
<!doctype html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Receipt ${escapeHtml(rental?.id || '')}</title>
  <style>
    @page { size: ${paperWidthMm}mm auto; margin: 3mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Courier New", monospace;
      color: #111;
      margin: 0;
      width: ${bodyWidthMm}mm;
      font-size: 11px;
      line-height: 1.35;
    }
    h1 {
      font-size: 13px;
      margin: 0 0 4px;
      text-align: center;
      letter-spacing: 0.3px;
    }
    .muted {
      color: #333;
      font-size: 10px;
      margin: 0;
      word-break: break-word;
    }
    .center { text-align: center; }
    .divider {
      margin: 6px 0;
      border-top: 1px dashed #666;
      height: 0;
    }
    .section { margin-top: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border-bottom: 1px dashed #bbb; padding: 3px 2px; font-size: 10px; vertical-align: top; }
    th { text-align: left; font-size: 9px; color: #444; }
    .summary { margin-top: 8px; font-size: 11px; }
    .summary strong { font-size: 13px; }
    .footer { margin-top: 10px; font-size: 10px; text-align: center; }
  </style>
</head>
<body>
  <h1>${escapeHtml(storeName)}</h1>
  ${profile.addressLines.map((line) => `<p class="muted center">${escapeHtml(line)}</p>`).join('')}
  ${profile.phone ? `<p class="muted center">Telp: ${escapeHtml(profile.phone)}</p>` : ''}
  <p class="muted center">Receipt Transaksi Sewa</p>
  <div class="divider"></div>
  <p class="muted">No: ${escapeHtml(rental?.id || '-')}</p>
  <p class="muted">Tanggal: ${escapeHtml(formatDateTime(rental?.date || new Date()))}</p>
  ${cashierName ? `<p class="muted">Kasir: ${escapeHtml(cashierName)}</p>` : ''}
  <p class="muted">Penyewa: ${escapeHtml(rental?.customer?.name || '-')} (${escapeHtml(rental?.customer?.phone || '-')})</p>
  <p class="muted">Durasi: ${duration} hari | Jatuh tempo: ${escapeHtml(dueDate ? formatDate(dueDate) : '-')}</p>
  <div class="divider"></div>

  <div class="section">
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th style="text-align:center;">Qty</th>
          <th style="text-align:right;">Harga/Hari</th>
          <th style="text-align:right;">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>

  <p class="summary"><strong>Total: ${escapeHtml(formatCurrency(total))}</strong></p>
  <div class="divider"></div>
  ${profile.legalFooterLines.map((line) => `<p class="footer">${escapeHtml(line)}</p>`).join('')}
  <p class="footer">Terima kasih sudah sewa di ${escapeHtml(storeName)}</p>
</body>
</html>
    `;
}

export function printReceipt(rental, options = {}) {
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=420,height=760');

    if (!printWindow) {
        throw new Error('Popup cetak diblokir browser. Izinkan popup lalu coba lagi.');
    }

    const html = buildReceiptPrintHtml(rental, options);
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
}

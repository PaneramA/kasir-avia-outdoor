import React, { useMemo } from 'react';
import { buildReceiptPrintHtml, buildReceiptWhatsAppText } from '../lib/receipt';

const SAMPLE_RENTAL = {
  id: 'PREVIEW-001',
  date: '2026-07-29T12:00:00+07:00',
  duration: 2,
  total: 170000,
  finalTotal: 170000,
  customer: {
    name: 'Customer Preview',
    phone: '0812-0000-0000',
  },
  items: [
    { name: 'Tenda Dome 4p', qty: 1, price: 55000 },
    { name: 'Matras', qty: 3, price: 10000 },
  ],
  payment: {
    status: 'DP',
    method: 'TUNAI',
    paidAmount: 100000,
    remainingAmount: 70000,
  },
};

const previewPanelClass = 'rounded-md border border-border bg-bg-main p-4';

const ReceiptSettingsPreview = ({ profile }) => {
  const previewOptions = useMemo(() => ({
    ...profile,
    cashierName: 'Kasir Preview',
  }), [profile]);

  const whatsAppText = useMemo(
    () => buildReceiptWhatsAppText(SAMPLE_RENTAL, previewOptions),
    [previewOptions],
  );

  const printHtml = useMemo(
    () => buildReceiptPrintHtml(SAMPLE_RENTAL, previewOptions),
    [previewOptions],
  );

  return (
    <div data-testid="receipt-settings-preview" className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className={previewPanelClass}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-text-main">Preview WhatsApp</h4>
            <p className="text-xs text-text-muted">Teks yang akan dikirim ke customer.</p>
          </div>
          <i className="fab fa-whatsapp text-lg text-accent"></i>
        </div>
        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-card-bg p-3 text-xs leading-relaxed text-text-main">
          {whatsAppText}
        </pre>
      </div>

      <div className={previewPanelClass}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-text-main">Preview Print</h4>
            <p className="text-xs text-text-muted">Simulasi struk 80mm.</p>
          </div>
          <i className="fas fa-print text-base text-accent"></i>
        </div>
        <iframe
          title="Preview print struk"
          className="h-[420px] w-full rounded-md border border-border bg-white"
          srcDoc={printHtml}
          sandbox=""
        />
      </div>
    </div>
  );
};

export default ReceiptSettingsPreview;

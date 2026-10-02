/**
 * Export — CSV (direct download) + PDF (RTL print report → "Save as PDF")
 */
import { useRef, useState } from 'react';
import { Download, FileText, Printer } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Sheet } from '@/shared/components/ui/Sheet';
import { downloadCsv } from '@/shared/utils/csv';
import { toast } from '@/shared/store/toastStore';

export function exportCsvFile(filename: string, headers: string[], rows: (string | number | null)[][]): void {
  const esc = (v: string | number | null) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const content = '﻿' + [headers.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  downloadCsv(filename, content);
  toast('success', 'فایل اکسل دانلود شد');
}

type Section = { heading?: string; table?: { headers: string[]; rows: (string | number | null)[][] }; note?: string };

/** PDF report — print preview (full RTL); only `.report-print-area` is printed */
export function PdfReportModal({
  open,
  onClose,
  title,
  sections
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sections: Section[];
}) {
  const reportRef = useRef<HTMLDivElement>(null);
  /** print a detached copy at the top of <body> so no dialog/scroll ancestor clips it */
  const print = () => {
    const src = reportRef.current;
    if (!src) return;
    const clone = src.cloneNode(true) as HTMLElement;
    clone.classList.add('report-print-clone');
    document.body.appendChild(clone);
    document.body.classList.add('print-report');
    const cleanup = () => {
      document.body.classList.remove('print-report');
      clone.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    // browsers without afterprint support
    setTimeout(cleanup, 1000);
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      description="پیش‌نمایش گزارش — در پنجره چاپ «ذخیره به‌صورت پی‌دی‌اف» را انتخاب کنید."
      footer={
        <Button
          size="lg"
          className="w-full"
          icon={<Printer />}
          onClick={print}
        >
          چاپ / ذخیره PDF
        </Button>
      }
    >
      <div ref={reportRef} className="report-print-area space-y-6 rounded-field border border-divider p-4 text-sm" dir="rtl">
        <h3 className="text-base font-bold text-ink">{title}</h3>
        {sections.map((sec, i) => (
          <section key={i}>
            {sec.heading && <h4 className="mb-2 font-semibold text-ink">{sec.heading}</h4>}
            {sec.table && (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {sec.table.headers.map((h) => (
                      <th key={h} className="border-b border-divider-strong pb-1.5 text-start text-xs font-semibold text-muted">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sec.table.rows.map((r, ri) => (
                    <tr key={ri}>
                      {r.map((c, ci) => (
                        <td key={ci} className={ci === 0 ? 'border-b border-divider py-1.5 text-ink' : 'num-ltr border-b border-divider py-1.5 text-right text-ink'}>
                          {c ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {sec.note && <p className="mt-2 text-xs text-muted">{sec.note}</p>}
          </section>
        ))}
      </div>
    </Sheet>
  );
}

export function ExportButtons({
  filename,
  headers,
  rows,
  pdfTitle,
  pdfSections
}: {
  filename: string;
  headers: string[];
  rows: (string | number | null)[][];
  pdfTitle: string;
  pdfSections: Section[];
}) {
  const [pdfOpen, setPdfOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted">خروجی:</span>
      <Button variant="outline" size="sm" icon={<Download />} onClick={() => exportCsvFile(filename, headers, rows)}>
        CSV
      </Button>
      <Button variant="outline" size="sm" icon={<FileText />} onClick={() => setPdfOpen(true)}>
        PDF
      </Button>
      <PdfReportModal open={pdfOpen} onClose={() => setPdfOpen(false)} title={pdfTitle} sections={pdfSections} />
    </div>
  );
}

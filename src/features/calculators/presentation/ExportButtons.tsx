/**
 * خروجی CSV (دانلود مستقیم) + PDF (گزارش چاپی RTL — ذخیره به‌صورت PDF)
 */
import { useState } from 'react';
import { Download, FileText, Printer, X } from 'lucide-react';
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
  const content = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  downloadCsv(filename, content);
  toast('success', 'فایل CSV دانلود شد');
}

/** گزارش PDF — پنجره چاپ (RTL کامل) */
export function PdfReportModal({
  open,
  onClose,
  title,
  sections
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sections: { heading?: string; table?: { headers: string[]; rows: (string | number | null)[][] }; note?: string }[];
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="glass-inset rounded-2xl p-4 text-[11px] leading-6">
        {sections.map((sec, i) => (
          <div key={i} className="mb-4">
            {sec.heading && (
              <h4 className="mb-1.5 font-extrabold text-ink">{sec.heading}</h4>
            )}
            {sec.table && (
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr>
                    {sec.table.headers.map((h) => (
                      <th key={h} className="border-b border-line/20 pb-1 text-start font-extrabold text-ink">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sec.table.rows.map((r, ri) => (
                    <tr key={ri}>
                      {r.map((c, ci) => (
                        <td key={ci} className="num-ltr border-b border-line/5 py-1 text-muted">
                          {c ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {sec.note && <p className="text-muted">{sec.note}</p>}
          </div>
        ))}
      </div>
      <Button
        size="lg"
        className="mt-4 w-full"
        onClick={() => {
          // حالت چاپ: فقط گزارش نمایش داده می‌شود
          document.body.classList.add('print-report');
          const printTarget = document.querySelector('.report-print-area');
          if (printTarget) printTarget.id = 'print-root';
          window.print();
          document.body.classList.remove('print-report');
        }}
      >
        <Printer className="h-4 w-4" />
        چاپ / ذخیره PDF
      </Button>
      <p className="mt-2 text-center text-[10px] font-medium text-muted">
        در پنجره چاپ، «Save as PDF» را انتخاب کنید
      </p>
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
  pdfSections: { heading?: string; table?: { headers: string[]; rows: (string | number | null)[][] }; note?: string }[];
}) {
  const [pdfOpen, setPdfOpen] = useState(false);
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" className="flex-1" onClick={() => exportCsvFile(filename, headers, rows)}>
        <Download className="h-3.5 w-3.5" />
        CSV
      </Button>
      <Button variant="outline" size="sm" className="flex-1" onClick={() => setPdfOpen(true)}>
        <FileText className="h-3.5 w-3.5" />
        PDF
      </Button>
      <PdfReportModal
        open={pdfOpen}
        onClose={() => setPdfOpen(false)}
        title={pdfTitle}
        sections={pdfSections}
      />
    </div>
  );
}

export { X as _X };

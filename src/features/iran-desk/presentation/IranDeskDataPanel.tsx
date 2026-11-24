/**
 * پنل مدیریت داده‌ها (آپلود CSV / Excel / PDF کدال با پیش‌نمایش و تأیید کاربر) + مقایسه اختصاصی صندوق‌ها
 */
import { useState } from 'react';
import { CheckCircle2, FileSpreadsheet, FileText, Scale, Trash2, Upload } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button, IconButton } from '@/shared/components/ui/Button';
import { Field, Input } from '@/shared/components/ui/Input';
import { Notice } from '@/shared/components/ui/StateViews';
import { IranInstrumentLogo } from '@/features/markets/presentation/IranInstrumentLogo';
import { toEnDigits, toFaDigits } from '@/shared/utils/formatters';
import { ASSET_TYPE_LABELS } from '../domain/agents';
import { extractPdfPlainText, parsePriceCsvText, validateUploadedFile, type ParsedDatasetPreview } from '../domain/parsers';
import type { DeskAssetType, UploadedCodalDocument, UploadedPriceDataset } from '../domain/types';

const parseOpt = (s: string): number | null => {
  const n = Number(toEnDigits(s).replace(/[,٬\s]/g, ''));
  return s.trim() !== '' && Number.isFinite(n) ? n : null;
};

export function IranDeskDataPanel({
  datasets,
  documents,
  onAddDataset,
  onDeleteDataset,
  onAddDocument,
  onDeleteDocument
}: {
  datasets: UploadedPriceDataset[];
  documents: UploadedCodalDocument[];
  onAddDataset: (ds: UploadedPriceDataset) => void;
  onDeleteDataset: (id: string) => void;
  onAddDocument: (doc: UploadedCodalDocument) => void;
  onDeleteDocument: (id: string) => void;
}) {
  // آپلود فایل قیمت (CSV/Excel) با پیش‌نمایش پیش از ذخیره
  const [symbol, setSymbol] = useState('فولاد');
  const [nameFa, setNameFa] = useState('فولاد مبارکه اصفهان');
  const [assetType, setAssetType] = useState<DeskAssetType>('stock');
  const [pendingFileName, setPendingFileName] = useState('');
  const [preview, setPreview] = useState<ParsedDatasetPreview | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // آپلود گزارش کدال / صندوق (PDF یا متن)
  const [docSymbol, setDocSymbol] = useState('فولاد');
  const [docTitle, setDocTitle] = useState('');
  const [docDate, setDocDate] = useState(new Date().toISOString().slice(0, 10));
  const [docType, setDocType] = useState<UploadedCodalDocument['docType']>('monthly_report');
  const [docFileName, setDocFileName] = useState('گزارش-کدال.pdf');
  const [docText, setDocText] = useState('');
  const [docWarning, setDocWarning] = useState<string | null>(null);
  const [salesGrowthStr, setSalesGrowthStr] = useState('');
  const [navStr, setNavStr] = useState('');
  const [expenseStr, setExpenseStr] = useState('');

  const handlePriceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    const err = validateUploadedFile(file, ['csv', 'tsv', 'txt']);
    if (err) {
      setUploadError(err);
      setPreview(null);
      return;
    }
    const text = await file.text();
    const parsed = parsePriceCsvText(text);
    setPendingFileName(file.name);
    setPreview(parsed);
    if (!parsed.ok) setUploadError(parsed.errors.join(' '));
  };

  const confirmSaveDataset = () => {
    if (!preview?.ok || !symbol.trim()) return;
    onAddDataset({
      id: `ds-${symbol.trim()}-${Date.now()}`,
      symbol: symbol.trim(),
      nameFa: nameFa.trim() || symbol.trim(),
      assetType,
      segment: assetType.startsWith('fund_') ? (assetType === 'fund_pension' ? 'pension' : 'funds') : 'tse',
      fileName: pendingFileName || `${symbol.trim()}.csv`,
      sourceName: 'فایل بارگذاری‌شده کاربر (TSETMC/CSV)',
      currencyUnit: 'rial',
      uploadedAt: Date.now(),
      lastBarDate: preview.bars[preview.bars.length - 1].date,
      bars: preview.bars,
      validationWarnings: preview.warnings
    });
    setPreview(null);
    setPendingFileName('');
  };

  const handlePdfFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateUploadedFile(file, ['pdf', 'txt']);
    if (err) {
      setDocWarning(err);
      return;
    }
    setDocFileName(file.name);
    if (!docTitle) setDocTitle(file.name.replace(/\.[^.]+$/, ''));
    if (file.name.toLowerCase().endsWith('.txt')) {
      setDocText(await file.text());
      setDocWarning(null);
    } else {
      const res = await extractPdfPlainText(file);
      setDocText(res.text);
      setDocWarning(res.warning);
    }
  };

  const handleSaveDoc = () => {
    if (!docSymbol.trim() || (!docText.trim() && !docTitle.trim())) return;
    onAddDocument({
      id: `doc-${docSymbol.trim()}-${Date.now()}`,
      symbol: docSymbol.trim(),
      title: docTitle.trim() || docFileName,
      docType,
      fileName: docFileName,
      reportDate: docDate,
      uploadedAt: Date.now(),
      extractedText: docText.trim(),
      metrics: {
        sales6mGrowthYoYPct: parseOpt(salesGrowthStr),
        navRial: parseOpt(navStr),
        expenseRatioPct: parseOpt(expenseStr)
      }
    });
    setDocTitle('');
    setDocText('');
    setDocWarning(null);
    setSalesGrowthStr('');
    setNavStr('');
    setExpenseStr('');
  };

  const fundDatasets = datasets.filter((d) => d.assetType.startsWith('fund_'));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* ۱) بارگذاری سابقه قیمت روزانه (CSV / TSETMC) با پیش‌نمایش و تأیید */}
        <Surface className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-accent" aria-hidden />
            <h3 className="text-sm font-extrabold text-ink">بارگذاری سابقه قیمت روزانه (CSV / خروجی TSETMC)</h3>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Field label="نماد">
              <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="فولاد / عیار" />
            </Field>
            <Field label="نام کامل">
              <Input value={nameFa} onChange={(e) => setNameFa(e.target.value)} />
            </Field>
            <Field label="نوع دارایی">
              <select
                value={assetType}
                onChange={(e) => setAssetType(e.target.value as DeskAssetType)}
                className="h-10 w-full rounded-control border border-divider bg-card px-2.5 text-xs text-ink"
              >
                {(Object.keys(ASSET_TYPE_LABELS) as DeskAssetType[]).map((k) => (
                  <option key={k} value={k}>
                    {ASSET_TYPE_LABELS[k]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-card border border-dashed border-accent/50 bg-accent-soft/20 px-3 py-3 text-xs font-bold text-accent hover:bg-accent-soft/35">
            <Upload className="h-4 w-4" aria-hidden />
            <span>انتخاب فایل CSV / TSV (حداکثر ۱۵ مگابایت)</span>
            <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={(e) => void handlePriceFile(e)} />
          </label>

          {uploadError && <Notice tone="warn" title="خطای اعتبارسنجی فایل">{uploadError}</Notice>}

          {preview?.ok && (
            <div className="space-y-2 rounded-field border border-gain/40 bg-gain/10 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-extrabold text-positive">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  پیش‌نمایش معتبر: {toFaDigits(preview.bars.length)} روز معاملاتی ({preview.bars[0].date} تا {preview.bars[preview.bars.length - 1].date})
                </span>
                <Button size="sm" onClick={confirmSaveDataset}>
                  تأیید و ذخیره در میز تحلیل
                </Button>
              </div>
              {preview.warnings.length > 0 && (
                <ul className="list-disc space-y-0.5 ps-4 text-[11px] text-muted">
                  {preview.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Surface>

        {/* ۲) بارگذاری گزارش کدال / صندوق (PDF یا متن) */}
        <Surface className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-accent" aria-hidden />
            <h3 className="text-sm font-extrabold text-ink">بارگذاری گزارش کدال / گزارش صندوق (PDF)</h3>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Field label="نماد">
              <Input value={docSymbol} onChange={(e) => setDocSymbol(e.target.value)} />
            </Field>
            <Field label="عنوان گزارش">
              <Input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="گزارش ماهانه مهر ۱۴۰۵" />
            </Field>
            <Field label="نوع سند">
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as UploadedCodalDocument['docType'])}
                className="h-10 w-full rounded-control border border-divider bg-card px-2.5 text-xs text-ink"
              >
                <option value="monthly_report">گزارش ماهانه</option>
                <option value="financial_statement">صورت مالی</option>
                <option value="disclosure">اطلاعیه افشای بااهمیت</option>
                <option value="fund_report">گزارش صندوق / NAV</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Field label="رشد فروش ۶ ماهه (%)">
              <Input dir="ltr" value={salesGrowthStr} onChange={(e) => setSalesGrowthStr(e.target.value)} placeholder="اختیاری" />
            </Field>
            <Field label="NAV صندوق (ریال)">
              <Input dir="ltr" value={navStr} onChange={(e) => setNavStr(e.target.value)} placeholder="اختیاری" />
            </Field>
            <Field label="تاریخ گزارش">
              <Input dir="ltr" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-control border border-divider bg-surface-2/70 px-3 py-1.5 text-xs font-bold text-ink hover:border-accent">
              <Upload className="h-3.5 w-3.5" aria-hidden />
              <span>انتخاب PDF / متن</span>
              <input type="file" accept=".pdf,.txt" className="hidden" onChange={(e) => void handlePdfFile(e)} />
            </label>
            <Button size="sm" variant="secondary" disabled={!docSymbol.trim() || (!docText.trim() && !docTitle.trim())} onClick={handleSaveDoc}>
              تأیید و ثبت سند
            </Button>
          </div>

          {docWarning && <p className="text-[11px] text-amber-600 dark:text-amber-300">{docWarning}</p>}

          <textarea
            rows={3}
            value={docText}
            onChange={(e) => setDocText(e.target.value)}
            placeholder="خلاصه یا متن استخراج‌شدهٔ گزارش کدال/صندوق را اینجا بررسی و تأیید کنید…"
            className="w-full rounded-control border border-divider bg-card p-2.5 text-xs text-ink focus:border-accent focus:outline-none"
          />
        </Surface>
      </div>

      {/* ۳) مقایسه اختصاصی صندوق‌های بارگذاری‌شده (بدون بسنده کردن به بازده تاریخی) */}
      {fundDatasets.length >= 2 && (
        <Surface className="p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-accent" aria-hidden />
            <h3 className="text-sm font-extrabold text-ink">مقایسه اختصاصی صندوق‌های بارگذاری‌شده</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-divider text-muted">
                  <th className="pb-1.5">صندوق</th>
                  <th className="pb-1.5">نوع</th>
                  <th className="pb-1.5">آخرین قیمت</th>
                  <th className="pb-1.5">NAV / حباب</th>
                  <th className="pb-1.5">P/E شرکتی</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider/60">
                {fundDatasets.map((f) => {
                  const last = f.bars[f.bars.length - 1];
                  const prem = last?.nav && last.nav > 0 ? (((last.close - last.nav) / last.nav) * 100).toFixed(2) : null;
                  return (
                    <tr key={f.id}>
                      <td className="py-1.5 font-bold text-ink">{f.symbol}</td>
                      <td className="py-1.5 text-muted">{ASSET_TYPE_LABELS[f.assetType]}</td>
                      <td className="py-1.5">{last ? `${toFaDigits(Math.round(last.close).toLocaleString('en-US'))} ریال` : '—'}</td>
                      <td className="py-1.5">{prem !== null ? `${prem}٪` : 'ثبت نشده'}</td>
                      <td className="py-1.5 text-subtle">نامرتبط با نوع صندوق</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Surface>
      )}

      {/* ۴) فهرست داده‌ها و اسناد ثبت‌شده */}
      <Surface className="p-4 space-y-2.5">
        <h3 className="text-xs font-extrabold text-ink">
          داده‌های ذخیره‌شده ({toFaDigits(datasets.length)} فایل قیمت · {toFaDigits(documents.length)} سند کدال/صندوق)
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {datasets.map((ds) => (
            <div key={ds.id} className="flex items-center justify-between rounded-field border border-divider bg-surface-2/40 px-3 py-2 text-xs">
              <div className="flex items-center gap-2.5">
                <IranInstrumentLogo item={{ symbol: ds.symbol, nameFa: ds.nameFa }} size="sm" />
                <div>
                  <span className="font-bold text-ink">{ds.symbol}</span>{' '}
                  <Badge tone="neutral">{ASSET_TYPE_LABELS[ds.assetType]}</Badge>
                  <p className="text-[11px] text-muted">
                    {ds.fileName} · {toFaDigits(ds.bars.length)} روز · آخرین تاریخ: {ds.lastBarDate}
                  </p>
                </div>
              </div>
              <IconButton size="sm" aria-label={`حذف ${ds.symbol}`} onClick={() => onDeleteDataset(ds.id)}>
                <Trash2 className="h-3.5 w-3.5 text-negative" />
              </IconButton>
            </div>
          ))}
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between rounded-field border border-divider bg-surface-2/40 px-3 py-2 text-xs">
              <div className="flex items-center gap-2.5">
                <IranInstrumentLogo item={{ symbol: doc.symbol }} size="sm" />
                <div>
                  <span className="font-bold text-ink">{doc.symbol} — {doc.title}</span>
                  <p className="text-[11px] text-muted">{doc.fileName} · تاریخ: {doc.reportDate}</p>
                </div>
              </div>
              <IconButton size="sm" aria-label={`حذف ${doc.title}`} onClick={() => onDeleteDocument(doc.id)}>
                <Trash2 className="h-3.5 w-3.5 text-negative" />
              </IconButton>
            </div>
          ))}
        </div>
      </Surface>
    </div>
  );
}

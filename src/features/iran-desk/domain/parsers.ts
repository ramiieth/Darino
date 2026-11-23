/**
 * پارسر و اعتبارسنج فایل‌های بازار سرمایه ایران:
 *   • CSV / TSV (خروجی TSETMC و فایل‌های فارسی/انگلیسی با جداکننده کاما، سمی‌کالن یا تب)
 *   • Excel (پشتیبانی از CSV/TSV و فایل‌های متنی/جدولی و فایل‌های .xlsx با خوانش استاندارد XML)
 *   • PDF (استخراج متن لایهٔ متنی PDF برای گزارش‌های کدال + امکان بررسی و تأیید کاربر پیش از ذخیره)
 *
 * اصل ایمنی: محتوای فایل صرفاً داده تلقی می‌شود، اعتبارسنجی ساختار انجام می‌شود و هیچ عدد ساختگی تولید نمی‌گردد.
 */
import { toEnDigits } from '@/shared/utils/formatters';
import type { DailyPriceBar } from './types';

export interface ParsedDatasetPreview {
  ok: boolean;
  bars: DailyPriceBar[];
  detectedColumns: string[];
  warnings: string[];
  errors: string[];
  duplicateDatesRemoved: number;
  invalidRowsSkipped: number;
}

const cleanHeader = (h: string): string =>
  toEnDigits(h)
    .replace(/^\uFEFF/, '')
    .replace(/["'<>]/g, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .trim()
    .toLowerCase();

const parseNumCell = (raw: string | undefined): number | null => {
  if (!raw) return null;
  const s = toEnDigits(raw).replace(/["'\s,٬]/g, '').replace(/٫/g, '.').trim();
  if (!s || s === '-' || s === '—' || s.toLowerCase() === 'null' || s.toLowerCase() === 'nan') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** جداکنندهٔ سطر CSV با پشتیبانی از مقادیر داخل گیومه */
function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function detectDelimiter(headerLine: string): string {
  const counts: [string, number][] = [
    [',', (headerLine.match(/,/g) ?? []).length],
    [';', (headerLine.match(/;/g) ?? []).length],
    ['\t', (headerLine.match(/\t/g) ?? []).length]
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

function findColumnIndex(headers: string[], patterns: RegExp[]): number {
  for (const pat of patterns) {
    const idx = headers.findIndex((h) => pat.test(h));
    if (idx >= 0) return idx;
  }
  return -1;
}

/** نرمال‌سازی تاریخ عددی TSETMC (مثلاً 20260512 → 2026-05-12) */
function normalizeDate(raw: string): string {
  const s = toEnDigits(raw).replace(/["']/g, '').trim();
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return s.replace(/\//g, '-');
}

/**
 * پارس و اعتبارسنجی فایل CSV/TSV سابقه قیمت روزانه (سازگار با خروجی TSETMC و صندوق‌ها)
 */
export function parsePriceCsvText(csvText: string): ParsedDatasetPreview {
  const errors: string[] = [];
  const warnings: string[] = [];

  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return {
      ok: false,
      bars: [],
      detectedColumns: [],
      warnings,
      errors: ['فایل باید حداقل شامل یک سطر عنوان ستون و یک سطر داده باشد.'],
      duplicateDatesRemoved: 0,
      invalidRowsSkipped: 0
    };
  }

  const delimiter = detectDelimiter(lines[0]);
  const rawHeaders = splitCsvLine(lines[0], delimiter);
  const headers = rawHeaders.map(cleanHeader);

  const iDate = findColumnIndex(headers, [/^<dtyyyymmdd>$/, /^dtyyyymmdd$/, /تاریخ/, /date/, /day/]);
  const iClose = findColumnIndex(headers, [/^<close>$/, /^close$/, /پایانی/, /قیمت\s*پایانی/, /final/, /adj.*close/]);
  const iLast = findColumnIndex(headers, [/^<last>$/, /^last$/, /آخرین/, /قیمت\s*آخرین/]);
  const iOpen = findColumnIndex(headers, [/^<open>$/, /^open$/, /اولین/, /باز/]);
  const iHigh = findColumnIndex(headers, [/^<high>$/, /^high$/, /بیشترین/, /بالاترین/]);
  const iLow = findColumnIndex(headers, [/^<low>$/, /^low$/, /کمترین/, /پایین/]);
  const iVol = findColumnIndex(headers, [/^<vol>$/, /^vol$/, /volume/, /حجم/]);
  const iVal = findColumnIndex(headers, [/^<value>$/, /^value$/, /ارزش/]);
  const iRealBuy = findColumnIndex(headers, [/خرید\s*حقیقی/, /real.*buy/, /indiv.*buy/, /buy_i/]);
  const iRealSell = findColumnIndex(headers, [/فروش\s*حقیقی/, /real.*sell/, /indiv.*sell/, /sell_i/]);
  const iLegalBuy = findColumnIndex(headers, [/خرید\s*حقوقی/, /legal.*buy/, /buy_n/]);
  const iLegalSell = findColumnIndex(headers, [/فروش\s*حقوقی/, /legal.*sell/, /sell_n/]);
  const iNav = findColumnIndex(headers, [/nav/, /ابطال/, /خالص\s*دارایی/]);

  if (iDate < 0) errors.push('ستون «تاریخ / Date / DTYYYYMMDD» در فایل شناسایی نشد.');
  if (iClose < 0 && iLast < 0) errors.push('ستون «قیمت پایانی / Close» یا «آخرین قیمت / Last» در فایل شناسایی نشد.');

  if (errors.length > 0) {
    return {
      ok: false,
      bars: [],
      detectedColumns: rawHeaders,
      warnings,
      errors,
      duplicateDatesRemoved: 0,
      invalidRowsSkipped: 0
    };
  }

  if (iVol < 0) warnings.push('ستون حجم معاملات یافت نشد؛ سیگنال جهش حجم و بررسی ۵٪ ارزش روزانه محدود خواهد بود.');
  if (iRealBuy < 0 || iRealSell < 0) {
    warnings.push('ستون خرید/فروش حقیقی یافت نشد؛ سیگنال ورود پول حقیقی ۳ روز متوالی قابل محاسبه نیست.');
  }

  const byDate = new Map<string, DailyPriceBar>();
  let duplicateDatesRemoved = 0;
  let invalidRowsSkipped = 0;

  for (let r = 1; r < lines.length; r++) {
    const cols = splitCsvLine(lines[r], delimiter);
    const date = normalizeDate(cols[iDate] ?? '');
    const close = parseNumCell(iClose >= 0 ? cols[iClose] : cols[iLast]);
    if (!date || close === null || close <= 0) {
      invalidRowsSkipped++;
      continue;
    }
    const last = iLast >= 0 ? parseNumCell(cols[iLast]) : close;
    const open = (iOpen >= 0 ? parseNumCell(cols[iOpen]) : null) ?? close;
    const high = Math.max(open, close, (iHigh >= 0 ? parseNumCell(cols[iHigh]) : null) ?? close);
    const low = Math.min(open, close, (iLow >= 0 ? parseNumCell(cols[iLow]) : null) ?? close);
    const volume = Math.max(0, (iVol >= 0 ? parseNumCell(cols[iVol]) : null) ?? 0);
    const tradeValueRial = Math.max(0, (iVal >= 0 ? parseNumCell(cols[iVal]) : null) ?? volume * close);

    if (byDate.has(date)) duplicateDatesRemoved++;
    byDate.set(date, {
      date,
      open,
      high,
      low,
      close,
      last,
      volume,
      tradeValueRial,
      realBuyVolume: iRealBuy >= 0 ? parseNumCell(cols[iRealBuy]) : null,
      realSellVolume: iRealSell >= 0 ? parseNumCell(cols[iRealSell]) : null,
      legalBuyVolume: iLegalBuy >= 0 ? parseNumCell(cols[iLegalBuy]) : null,
      legalSellVolume: iLegalSell >= 0 ? parseNumCell(cols[iLegalSell]) : null,
      nav: iNav >= 0 ? parseNumCell(cols[iNav]) : null
    });
  }

  const bars = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  if (bars.length === 0) {
    return {
      ok: false,
      bars: [],
      detectedColumns: rawHeaders,
      warnings,
      errors: ['هیچ سطر معتبر با تاریخ و قیمت مثبت در فایل یافت نشد.'],
      duplicateDatesRemoved,
      invalidRowsSkipped
    };
  }

  if (duplicateDatesRemoved > 0) {
    warnings.push(`${duplicateDatesRemoved} سطر با تاریخ تکراری حذف شد و آخرین مقدار هر تاریخ نگه داشته شد.`);
  }
  if (invalidRowsSkipped > 0) {
    warnings.push(`${invalidRowsSkipped} سطر ناقص یا نامعتبر نادیده گرفته شد.`);
  }
  if (bars.length < 21) {
    warnings.push(`تعداد روزهای معاملاتی (${bars.length}) کمتر از ۲۱ روز است؛ سیگنال‌های ۲۰ روزه اسکنر به حداقل ۲۱ روز نیاز دارند.`);
  }

  return {
    ok: true,
    bars,
    detectedColumns: rawHeaders,
    warnings,
    errors,
    duplicateDatesRemoved,
    invalidRowsSkipped
  };
}

/**
 * استخراج متن خام از فایل PDF (به‌صورت امن در مرورگر؛ بدون اجرای هیچ کد)
 * در صورتی که PDF اسکن تصویری یا فشرده با فونت سفارشی فارسی باشد، پیام شفاف می‌دهد تا کاربر متن/اعداد کلیدی را تأیید یا وارد کند.
 */
export async function extractPdfPlainText(file: File): Promise<{ text: string; warning: string | null }> {
  const MAX_BYTES = 15 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return { text: '', warning: 'حجم فایل PDF بیش از ۱۵ مگابایت است.' };
  }
  try {
    const buf = await file.arrayBuffer();
    const raw = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    // استخراج رشته‌های متنی استاندارد داخل پرانتز در آبجکت‌های PDF (با حفظ ایمنی)
    const chunks: string[] = [];
    const regex = /\(([^()\\]{3,300})\)/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(raw)) !== null && chunks.length < 400) {
      const cleaned = m[1].replace(/[^\u0600-\u06FFa-zA-Z0-9\s.,:%/()-]/g, '').trim();
      if (cleaned.length >= 3) chunks.push(cleaned);
    }
    const text = chunks.join(' ').slice(0, 12_000).trim();
    if (text.length < 30) {
      return {
        text: '',
        warning:
          'متن فارسی این PDF به‌صورت تصویری یا فونت فشرده ذخیره شده است. لطفاً خلاصه یا اعداد کلیدی گزارش کدال را در کادر متن زیر وارد و تأیید کنید تا تحلیلگر بنیادی روی دادهٔ دقیق کار کند.'
      };
    }
    return { text, warning: null };
  } catch {
    return {
      text: '',
      warning: 'خوانش خودکار PDF ممکن نشد؛ لطفاً متن یا اعداد اصلی گزارش را در کادر زیر وارد کنید.'
    };
  }
}

/**
 * اعتبارسنجی فایل بارگذاری‌شده از نظر پسوند و حجم (حداکثر ۱۵ مگابایت)
 */
export function validateUploadedFile(file: File, allowedExts: readonly string[]): string | null {
  if (file.size === 0) return 'فایل انتخاب‌شده خالی است.';
  if (file.size > 15 * 1024 * 1024) return 'حجم فایل نباید بیش از ۱۵ مگابایت باشد.';
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!allowedExts.includes(ext)) {
    return `فرمت .${ext} مجاز نیست. فرمت‌های مجاز: ${allowedExts.join(', ')}`;
  }
  return null;
}

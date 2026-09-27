/** ============================================================
 * Property Market — تاریخ انتشار و «آخرین به‌روزرسانی» آگهی
 *
 *  دیوار (صفحه جزئیات، متن صریح):
 *    «انتشار آگهی: ۵ شهریور ۱۴۰۵، ۱۸:۱۲
 *     آخرین نردبان: ۴ مهر ۱۴۰۵، ۱۸:۵۹
 *     آخرین به‌روز‌رسانی: ۴ مهر ۱۴۰۵، ۱۸:۵۹»
 *  شیپور: addedAt = انتشار اولیه (نه به‌روزرسانی!) — آخرین به‌روزرسانی فقط
 *    به‌صورت برچسب نسبی («ساعاتی پیش»، «۲ هفته پیش»، «۳ ماه پیش») موجود است.
 * ⚠️ بدون alias — در فانکشن سرور هم اجرا می‌شود.
 * ============================================================ */
import { toGregorian } from '../../../shared/utils/jalaliCore.js';

/** ارقام فارسی/عربی → لاتین (محلی — جلوگیری از import چرخه‌ای با parse.ts) */
function faToEnDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

const JALALI_MONTHS: Record<string, number> = {
  'فروردین': 1, 'اردیبهشت': 2, 'خرداد': 3, 'تیر': 4, 'مرداد': 5, 'شهریور': 6,
  'مهر': 7, 'آبان': 8, 'آذر': 9, 'دی': 10, 'بهمن': 11, 'اسفند': 12
};

const TEHRAN_OFFSET_MS = 3.5 * 3600_000;
const DAY_MS = 86_400_000;

/** «۵ شهریور ۱۴۰۵، ۱۸:۱۲» (وقت تهران) → epoch ms؛ نامعتبر → null */
export function parseJalaliDateTimeFa(text: string): number | null {
  const t = faToEnDigits(text).replace(/[‌‎‏]/g, ' ');
  const m = t.match(/(\d{1,2})\s+(فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند)\s+(\d{4})(?:[،,\s]+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const jd = Number(m[1]);
  const jm = JALALI_MONTHS[m[2]];
  const jy = Number(m[3]);
  if (!jm || jd < 1 || jd > 31 || jy < 1300 || jy > 1500) return null;
  const g = toGregorian(jy, jm, jd);
  const hh = m[4] !== undefined ? Number(m[4]) : 12;
  const mm = m[5] !== undefined ? Number(m[5]) : 0;
  if (hh > 23 || mm > 59) return null;
  return Date.UTC(g.year, g.month - 1, g.day, hh, mm) - TEHRAN_OFFSET_MS;
}

export interface AdDates {
  publishedAt: number | null;
  bumpedAt: number | null;
  updatedAt: number | null;
}

/** بلوک متنی تاریخ‌های دیوار → انتشار/نردبان/به‌روزرسانی */
export function parseDivarDatesText(text: string): AdDates {
  const out: AdDates = { publishedAt: null, bumpedAt: null, updatedAt: null };
  for (const rawLine of text.split(/\n/)) {
    const line = rawLine.replace(/[‌]/g, '');
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const label = line.slice(0, idx);
    const ts = parseJalaliDateTimeFa(line.slice(idx + 1));
    if (ts === null) continue;
    if (label.includes('انتشار')) out.publishedAt = ts;
    else if (label.includes('نردبان')) out.bumpedAt = ts;
    else if (label.includes('بهروزرسانی') || label.includes('به روزرسانی') || label.includes('بروزرسانی')) out.updatedAt = ts;
  }
  return out;
}

/** جست‌وجوی بازگشتی متن تاریخ‌ها در پاسخ جزئیات دیوار (ساختار ویجت ممکن است تغییر کند) */
export function findDivarDates(detail: unknown): AdDates | null {
  let found: AdDates | null = null;
  const walk = (o: unknown, depth: number): void => {
    if (found || depth > 12) return;
    if (typeof o === 'string') {
      if (o.includes('انتشار آگهی')) {
        const d = parseDivarDatesText(o);
        if (d.publishedAt !== null || d.updatedAt !== null) found = d;
      }
      return;
    }
    if (Array.isArray(o)) for (const v of o) walk(v, depth + 1);
    else if (o && typeof o === 'object') for (const v of Object.values(o)) walk(v, depth + 1);
  };
  walk(detail, 0);
  return found;
}

/**
 * برچسب نسبی شیپور/دیوار → زمان تقریبی (نسبت به now).
 * «دقایقی/ساعاتی/لحظاتی پیش» → now؛ «دیروز» → ۱ روز؛ «N روز/هفته/ماه/سال پیش».
 */
export function parseRelativeAgeFa(label: unknown, now: number): number | null {
  if (typeof label !== 'string') return null;
  const t = faToEnDigits(label).replace(/[‌]/g, ' ').trim();
  if (!t) return null;
  if (/(لحظاتی|دقایقی|ساعاتی|دقیقه|ساعت) ?پیش|همین الان|اخیرا/.test(t)) return now;
  if (/دیروز/.test(t)) return now - DAY_MS;
  const m = t.match(/(\d+|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده|یازده)?\s*(روز|هفته|ماه|سال)\s*پیش/);
  if (!m) return null;
  const words: Record<string, number> = { 'یک': 1, 'دو': 2, 'سه': 3, 'چهار': 4, 'پنج': 5, 'شش': 6, 'هفت': 7, 'هشت': 8, 'نه': 9, 'ده': 10, 'یازده': 11 };
  const n = m[1] === undefined ? 1 : /^\d+$/.test(m[1]) ? Number(m[1]) : words[m[1]] ?? 1;
  const unit = m[2] === 'روز' ? 1 : m[2] === 'هفته' ? 7 : m[2] === 'ماه' ? 30 : 365;
  return now - n * unit * DAY_MS;
}


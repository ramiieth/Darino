/**
 * موتور تاریخ مشترک پروژه — Single Source of Truth
 * تبدیل شمسی ↔ میلادی (الگوریتم jalaali) + قالب‌بندی/پارس یکپارچه
 * ⚠️ هیچ منطق تبدیل تاریخ در جای دیگری پیاده‌سازی نشود — همه از اینجا
 */
import { toEnDigits } from '@/shared/utils/formatters';

/* الگوریتم jalaali در jalaliCore.ts (بدون وابستگی — مشترک با سرور) */
import { jalCal, toGregorian, toJalaali, type JDate } from './jalaliCore';
export { toGregorian, toJalaali, type JDate };

/** آیا سال شمسی کبیسه است؟ (در الگوریتم jalaali مقدار ۰ یعنی سال کبیسه) */
export function isLeapJalaliYear(jy: number): boolean {
  return jalCal(jy).leap === 0;
}

/** تعداد روزهای ماه شمسی (۱-۶: ۳۱، ۷-۱۱: ۳۰، اسفند: ۲۹/۳۰) */
export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaliYear(jy) ? 30 : 29;
}

/** اعتبارسنجی تاریخ شمسی */
export function isValidJalali(jy: number, jm: number, jd: number): boolean {
  if (jy < 1200 || jy > 1500 || jm < 1 || jm > 12 || jd < 1) return false;
  return jd <= jalaliMonthLength(jy, jm);
}

/* ---------------- Timestamp (میلی‌ثانیه، نیمه‌روز محلی) ---------------- */

/** تاریخ شمسی → timestamp (ساعت ۱۲:۰۰ محلی — بدون خطای منطقه زمانی) */
export function jalaaliToTimestamp(jy: number, jm: number, jd: number): number {
  const g = toGregorian(jy, jm, jd);
  return gregorianToTimestamp(g.year, g.month, g.day);
}

/** تاریخ میلادی → timestamp (ساعت ۱۲:۰۰ محلی) */
export function gregorianToTimestamp(gy: number, gm: number, gd: number): number {
  return new Date(gy, gm - 1, gd, 12, 0, 0).getTime();
}

/** timestamp → تاریخ شمسی */
export function tsToJalaali(ts: number): JDate {
  const d = new Date(ts);
  return toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** timestamp → تاریخ میلادی */
export function tsToGregorian(ts: number): JDate {
  const d = new Date(ts);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

/* ---------------- قالب‌بندی / پارس ---------------- */

const pad2 = (n: number) => String(n).padStart(2, '0');
const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const toFa = (n: number | string) => String(n).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);

/** «۱۴۰۴/۰۵/۱۷» — ارقام فارسی (بدون جداکننده هزارگان) */
export function formatJalali(ts: number): string {
  const { year, month, day } = tsToJalaali(ts);
  return `${toFa(year)}/${toFa(pad2(month))}/${toFa(pad2(day))}`;
}

/** «1404/05/17» — ارقام لاتین */
export function formatJalaliLatin(ts: number): string {
  const { year, month, day } = tsToJalaali(ts);
  return `${year}/${pad2(month)}/${pad2(day)}`;
}

/** «2026-08-07» — ایزوی میلادی (متناسب input type=date) */
export function formatGregorianIso(ts: number): string {
  const { year, month, day } = tsToGregorian(ts);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** پارس تاریخ شمسی از رشته («1404/5/17» یا «۱۴۰۴/۰۵/۱۷») */
export function parseJalali(input: string): JDate | null {
  const s = toEnDigits(input.trim()).replace(/[-_.]/g, '/');
  const m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const jy = Number(m[1]);
  const jm = Number(m[2]);
  const jd = Number(m[3]);
  if (!isValidJalali(jy, jm, jd)) return null;
  return { year: jy, month: jm, day: jd };
}

/** پارس تاریخ شمسی → timestamp (یا null) */
export function parseJalaliToTs(input: string): number | null {
  const j = parseJalali(input);
  if (!j) return null;
  return jalaaliToTimestamp(j.year, j.month, j.day);
}

/** پارس ایزوی میلادی («2026-08-07») → timestamp (یا null) */
export function parseIsoToTs(iso: string): number | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return gregorianToTimestamp(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** نمایش دوتایی: «۱۴۰۴/۰۵/۱۷ شمسی · 2026-08-07 میلادی» */
export function formatDualDate(ts: number): string {
  return `${formatJalali(ts)} شمسی · ${formatGregorianIso(ts)} میلادی`;
}

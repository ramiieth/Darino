/**
 * موتور تاریخ مشترک پروژه — Single Source of Truth
 * تبدیل شمسی ↔ میلادی (الگوریتم jalaali) + قالب‌بندی/پارس یکپارچه
 * ⚠️ هیچ منطق تبدیل تاریخ در جای دیگری پیاده‌سازی نشود — همه از اینجا
 */
import { toEnDigits } from '@/shared/utils/formatters';

/* ---------------- الگوریتم jalaali (تبدیل ریاضی) ---------------- */

const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097,
  2192, 2262, 2324, 2394, 2456, 3178
];
const JALALI_EPOCH = 1948320.5; // اول فروردین سال ۱ = میلادی ۶۲۲-۰۳-۲۰

const div = (a: number, b: number) => ~~(a / b);
const mod = (a: number, b: number) => a - ~~(a / b) * b;

/** محاسبه کبیسه و روز اول فروردین سال شمسی */
function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;
  for (let i = 1; i < bl; i += 1) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

/** روز ژولینی از تاریخ شمسی */
function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

/** روز ژولینی از تاریخ میلادی */
function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

/** تاریخ میلادی از روز ژولینی */
function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

/** تاریخ شمسی از روز ژولینی */
function d2j(jdn: number): { jy: number; jm: number; jd: number } {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) {
      return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

/* ---------------- API عمومی ---------------- */

export interface JDate {
  year: number;
  month: number;
  day: number;
}

/** میلادی → شمسی */
export function toJalaali(gy: number, gm: number, gd: number): JDate {
  const { jy, jm, jd } = d2j(g2d(gy, gm, gd));
  return { year: jy, month: jm, day: jd };
}

/** شمسی → میلادی */
export function toGregorian(jy: number, jm: number, jd: number): JDate {
  const { gy, gm, gd } = d2g(j2d(jy, jm, jd));
  return { year: gy, month: gm, day: gd };
}

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

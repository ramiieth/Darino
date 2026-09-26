/** ============================================================
 * Property Market — منبع دوم: شیپور (sheypoor.com)
 *
 * API عمومی وب شیپور (بدون لاگین/کلید) — بررسی‌شده روی پاسخ زنده:
 *   - فهرست:  GET /api/v10.0.0/search/{city}/houses-apartments-for-sale[?f=cursor]
 *             خروجی: data[] (normal/paidEngagement/…) + meta.f (کرسر صفحه بعد)
 *   - جزئیات: GET /api/v10.0.0/listings/{id}
 *             خروجی: data.attributes.attributes[] (متراژ، اتاق، طبقه، قیمت هر متر…)
 *
 * ⚠️ فهرست شیپور متراژ ندارد → برای هر آگهی جزئیات لازم است.
 * ⚠️ آگهی‌های تبلیغاتی ممکن است از شهر دیگری باشند → فقط مکان «اهواز» پذیرفته می‌شود.
 * ⚠️ CORS: فقط از سرور یا از خودِ sheypoor.com (پل مرورگر) قابل فراخوانی است.
 * ============================================================ */
import type { PropertyKind } from '../domain/types.js';
import { requestJson, safeHeaders, type Fetcher } from './client.js';
import { cleanText, emptySeed, faToEnDigits, parseIntLoose, type ParsedListingSeed } from './parse.js';
import { otherCityMarker } from '../data/catalog.js';
import { jalaliYearOf } from '../domain/segments.js';
import { detectFirstKey, parseRelativeAgeFa } from './dates.js';

export const SHEYPOOR_BASE = 'https://www.sheypoor.com';
export const SHEYPOOR_API_VERSION = 'v10.0.0';
export const SHEYPOOR_CATEGORY_SLUG = 'houses-apartments-for-sale';
/** پیشوند شناسه — جلوگیری از برخورد با توکن‌های دیوار */
export const SHEYPOOR_TOKEN_PREFIX = 'sh-';

export function sheypoorListUrl(citySlug: string, cursor?: string | null, base: string = SHEYPOOR_BASE): string {
  const u = `${base}/api/${SHEYPOOR_API_VERSION}/search/${encodeURIComponent(citySlug)}/${SHEYPOOR_CATEGORY_SLUG}`;
  return cursor ? `${u}?f=${encodeURIComponent(cursor)}` : u;
}

export function sheypoorDetailUrl(id: string, base: string = SHEYPOOR_BASE): string {
  return `${base}/api/${SHEYPOOR_API_VERSION}/listings/${encodeURIComponent(id)}`;
}

export function sheypoorToken(id: string): string {
  return `${SHEYPOOR_TOKEN_PREFIX}${id}`;
}

export function sheypoorIdFromToken(token: string): string | null {
  return token.startsWith(SHEYPOOR_TOKEN_PREFIX) ? token.slice(SHEYPOOR_TOKEN_PREFIX.length) : null;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** نرمال متن برای مقایسه نام شهر */
function normCity(s: string): string {
  return s.replace(/[يئ]/g, 'ی').replace(/ك/g, 'ک').replace(/[\s‌]/g, '');
}

/** «اهواز، زیتون کارگری» یا «خوزستان، اهواز، مهرشهر» → محله (بعد از نام شهر) */
export function sheypoorNeighborhood(location: unknown, cityFa: string): { inCity: boolean; neighborhood: string | null } {
  const loc = cleanText(location);
  if (!loc) return { inCity: false, neighborhood: null };
  const parts = loc.split(/[،,]/).map((p) => p.trim()).filter(Boolean);
  const idx = parts.findIndex((p) => normCity(p) === normCity(cityFa));
  if (idx < 0) return { inCity: false, neighborhood: null };
  const rest = parts.slice(idx + 1).join('، ');
  return { inCity: true, neighborhood: rest.length > 0 ? rest : null };
}

/** قیمت شیپور: [{amount: "4,800,000,000" | 4800000000 | "توافقی", currency: "تومان"}] */
export function sheypoorPrice(price: unknown): number | null {
  if (!Array.isArray(price)) return null;
  for (const p of price) {
    if (!isObj(p)) continue;
    const currency = typeof p.currency === 'string' ? p.currency : '';
    if (currency && !currency.includes('تومان')) continue;
    const n = parseIntLoose(p.amount);
    if (n !== null && n > 0) return n;
  }
  return null;
}

/** «2026-09-25 23:10:40.6535» (به وقت ایران) → epoch ms */
export function sheypoorDate(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const ts = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+03:30`);
  return Number.isFinite(ts) ? ts : null;
}

/* ---------------- فهرست ---------------- */

export interface SheypoorListResult {
  seeds: Map<string, ParsedListingSeed>;
  /** کرسر صفحه بعد (meta.f) — null یعنی صفحه بعدی نیست */
  nextCursor: string | null;
  /** تعداد آگهی‌های «عادی» صفحه — ۰ یعنی انتهای نتایج */
  normalCount: number;
}

export function parseSheypoorList(page: unknown, cityFa: string, now: number = Date.now()): SheypoorListResult {
  const seeds = new Map<string, ParsedListingSeed>();
  let normalCount = 0;
  if (!isObj(page)) return { seeds, nextCursor: null, normalCount };
  const items = Array.isArray(page.data) ? page.data : [];
  for (const it of items) {
    if (!isObj(it)) continue;
    const type = typeof it.type === 'string' ? it.type : '';
    // فقط آگهی‌ها — بنر/فروشگاه/پیشنهاد جستجو کنار گذاشته می‌شوند
    if (type !== 'normal' && type !== 'paidEngagement' && type !== 'vip') continue;
    const id = typeof it.id === 'string' || typeof it.id === 'number' ? String(it.id) : '';
    if (!/^\d+$/.test(id)) continue;
    const a = isObj(it.attributes) ? it.attributes : null;
    if (!a) continue;
    if (type === 'normal') normalCount += 1;
    const loc = sheypoorNeighborhood(a.location, cityFa);
    if (!loc.inCity) continue; // تبلیغ شهر دیگر
    const token = sheypoorToken(id);
    if (seeds.has(token)) continue;
    const seed = emptySeed(token, 'sheypoor');
    seed.title = cleanText(a.title);
    seed.neighborhood = loc.neighborhood;
    seed.totalPriceToman = sheypoorPrice(a.price);
    // «ساعاتی پیش» / «۲ هفته پیش» = آخرین به‌روزرسانی (addedAt انتشار اولیه است)
    seed.sourceUpdatedAt = parseRelativeAgeFa(a.timePassedLabel, now);
    if (typeof a.url === 'string' && a.url.startsWith('http')) seed.url = a.url;
    seeds.set(token, seed);
  }
  const meta = isObj(page.meta) ? page.meta : {};
  const f = typeof meta.f === 'string' && meta.f.length > 0 ? meta.f : null;
  return { seeds, nextCursor: normalCount > 0 ? f : null, normalCount };
}

/* ---------------- جزئیات ---------------- */

/** «4 سال» / «۱۲ سال» / «نوساز» / «زیر یک سال» → سن (سال)؛ نامفهوم → null */
export function sheypoorAge(v: unknown): number | null {
  const s = cleanText(v);
  if (!s) return null;
  if (/نوساز|زیر ?یک|کمتر از ?یک/.test(s)) return 0;
  const n = parseIntLoose(s);
  return n !== null && n >= 0 && n <= 100 ? n : null;
}

const YES = ['دارد', 'بله', 'هست'];
const NO = ['ندارد', 'خیر', 'نیست'];

function yesNo(v: unknown): boolean | null {
  const s = cleanText(v);
  if (!s) return null;
  if (NO.some((w) => s.includes(w))) return false;
  if (YES.some((w) => s.includes(w))) return true;
  return null;
}

function kindFromFa(v: unknown): PropertyKind {
  const s = cleanText(v) ?? '';
  if (s.includes('آپارتمان') || s.includes('پنت')) return 'apartment';
  if (s.includes('ویلا') || s.includes('خانه') || s.includes('ویلایی')) return 'villa-house';
  return 'unknown';
}

/** تکمیل seed از پاسخ جزئیات شیپور (فقط فیلدهای خالی پر می‌شوند) */
export function parseSheypoorDetail(seed: ParsedListingSeed, detail: unknown, cityFa: string): ParsedListingSeed {
  if (!isObj(detail) || !isObj(detail.data)) return seed;
  const a = isObj(detail.data.attributes) ? detail.data.attributes : {};

  if (seed.title === null) seed.title = cleanText(a.title);
  if (seed.totalPriceToman === null) seed.totalPriceToman = sheypoorPrice(a.price);
  if (seed.neighborhood === null) seed.neighborhood = sheypoorNeighborhood(a.location, cityFa).neighborhood;
  if (seed.listedAt === null) seed.listedAt = sheypoorDate(a.addedAt);
  if (typeof a.url === 'string' && a.url.startsWith('http')) seed.url = a.url;
  const upd = parseRelativeAgeFa(a.timePassedLabel, Date.now());
  if (upd !== null) seed.sourceUpdatedAt = upd;
  seed.firstKey = detectFirstKey(seed.title, typeof a.description === 'string' ? a.description : null);
  if (!seed.otherCity) {
    seed.otherCity = otherCityMarker(seed.title) ?? otherCityMarker(typeof a.description === 'string' ? a.description : null);
  }

  const attrs = Array.isArray(a.attributes) ? a.attributes : [];
  for (const at of attrs) {
    if (!isObj(at)) continue;
    const key = cleanText(at.key);
    if (!key) continue;
    const value = at.value;
    switch (key) {
      case 'متراژ':
        if (seed.areaSqm === null) seed.areaSqm = parseIntLoose(value);
        break;
      case 'تعداد اتاق':
        if (seed.rooms === null) {
          const n = parseIntLoose(value);
          seed.rooms = n ?? (typeof value === 'string' && /بدون|استودیو/.test(value) ? 0 : null);
        }
        break;
      case 'طبقه ملک':
      case 'طبقه':
        if (seed.floor === null) {
          const nums = faToEnDigits(String(value ?? '')).match(/\d+/g);
          seed.floor = nums && nums.length > 0 ? Number(nums[0]) : /همکف/.test(String(value ?? '')) ? 0 : null;
        }
        break;
      case 'قیمت هر متر':
        if (seed.pricePerSqmToman === null) seed.pricePerSqmToman = parseIntLoose(value);
        break;
      case 'نوع ملک':
        if (seed.propertyKind === 'unknown') seed.propertyKind = kindFromFa(value);
        break;
      case 'پارکینگ':
        if (seed.parking === null) seed.parking = yesNo(value);
        break;
      case 'آسانسور':
        if (seed.elevator === null) seed.elevator = yesNo(value);
        break;
      case 'انباری':
        if (seed.storage === null) seed.storage = yesNo(value);
        break;
      case 'سن بنا':
        // «4 سال» / «نوساز» → سال ساخت = سال شمسی زمان آگهی − سن (تبدیل قطعی، نه حدس)
        if (seed.yearBuilt === null) {
          const age = sheypoorAge(value);
          if (age !== null) seed.yearBuilt = jalaliYearOf(seed.listedAt ?? Date.now()) - age;
        }
        break;
      case 'بالکن':
        if (seed.balcony === null) seed.balcony = yesNo(value);
        break;
    }
  }
  return seed;
}

/* ---------------- شبکه ---------------- */

export function fetchSheypoorList(opts: {
  citySlug: string;
  cursor?: string | null;
  base?: string;
  fetcher?: Fetcher;
}): Promise<unknown> {
  return requestJson<unknown>(opts.fetcher, sheypoorListUrl(opts.citySlug, opts.cursor, opts.base), {
    headers: safeHeaders({ Accept: 'application/json' })
  });
}

export function fetchSheypoorDetail(id: string, opts: { base?: string; fetcher?: Fetcher } = {}): Promise<unknown> {
  return requestJson<unknown>(opts.fetcher, sheypoorDetailUrl(id, opts.base), {
    headers: safeHeaders({ Accept: 'application/json' })
  });
}

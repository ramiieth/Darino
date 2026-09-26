/** ============================================================
 * Property Market — پروتکل «پل مرورگر» و فایل ورودی
 *
 * مسیر بدون سرور: کلکشنر روی خودِ divar.ir / sheypoor.com (مرورگر کاربر،
 * با IP خود او) اجرا می‌شود و seedها را با postMessage به دارینو می‌فرستد
 * یا به‌صورت فایل JSON ذخیره می‌کند. اسکریپت محلی Node هم همین قالب را
 * تولید می‌کند.
 *
 * ⚠️ هر ورودی از بیرون (پیام/فایل) «داده نامطمئن» است: فقط فیلدهای شناخته‌شده
 *    با نوع درست کپی می‌شوند؛ origin پیام‌ها با فهرست مجاز چک می‌شود.
 * ============================================================ */
import type { ListingSource, PropertyKind } from '../domain/types';
import { emptySeed, type ParsedListingSeed } from '../collector/parse';

export const BRIDGE_KIND = 'darino-pm-seeds';
export const BRIDGE_VERSION = 1;

/** مسیر صفحه دارینو برای پل — اپ از HashRouter استفاده می‌کند */
export const BRIDGE_PAGE_PATH = '/#/property-market?bridge=1';

/** آیا صفحه از طرف پل باز شده؟ (پرچم در query یا داخل hash) */
export function isBridgeLaunch(search: string, hash: string): boolean {
  const fromSearch = new URLSearchParams(search).get('bridge') === '1';
  const q = hash.includes('?') ? hash.slice(hash.indexOf('?')) : '';
  return fromSearch || new URLSearchParams(q).get('bridge') === '1';
}

/** پیام‌های پل */
export const MSG_READY = 'darino-pm-ready';
export const MSG_PAYLOAD = 'darino-pm-payload';
export const MSG_ACK = 'darino-pm-ack';

/** originهایی که اجازه ارسال داده به دارینو دارند */
export const BRIDGE_ALLOWED_ORIGINS = [
  'https://divar.ir',
  'https://www.divar.ir',
  'https://www.sheypoor.com',
  'https://sheypoor.com'
];

/** سقف ایمنی تعداد seed در یک ورودی */
export const MAX_SEEDS_PER_PAYLOAD = 5000;

export interface SeedPayload {
  kind: typeof BRIDGE_KIND;
  version: number;
  source: ListingSource;
  city: 'ahvaz';
  cityId: string | null;
  collectedAt: number;
  /** محیط جمع‌آوری (نمایش/عیب‌یابی) */
  via: 'bridge' | 'script' | 'server';
  seeds: ParsedListingSeed[];
}

const SOURCES: ListingSource[] = ['divar', 'sheypoor'];
const KINDS: PropertyKind[] = ['apartment', 'villa-house', 'unknown'];

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function bool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}
function text(v: unknown, max = 300): string | null {
  return typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null;
}

/** seed نامطمئن → seed سالم (یا null) */
export function sanitizeSeed(raw: unknown, source: ListingSource): ParsedListingSeed | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const token = text(r.token, 80);
  if (!token || !/^[\w-]+$/.test(token)) return null;
  const seedSource = SOURCES.includes(r.source as ListingSource) ? (r.source as ListingSource) : source;
  const s = emptySeed(token, seedSource);
  s.title = text(r.title);
  s.neighborhood = text(r.neighborhood, 120);
  s.propertyKind = KINDS.includes(r.propertyKind as PropertyKind) ? (r.propertyKind as PropertyKind) : 'unknown';
  s.areaSqm = num(r.areaSqm);
  s.rooms = num(r.rooms);
  s.yearBuilt = num(r.yearBuilt);
  s.floor = num(r.floor);
  s.totalPriceToman = num(r.totalPriceToman);
  s.pricePerSqmToman = num(r.pricePerSqmToman);
  s.parking = bool(r.parking);
  s.elevator = bool(r.elevator);
  s.storage = bool(r.storage);
  s.balcony = bool(r.balcony);
  s.listedAt = num(r.listedAt);
  s.otherCity = text(r.otherCity, 40);
  const url = text(r.url, 500);
  if (url && /^https:\/\/([\w-]+\.)*(divar\.ir|sheypoor\.com)\//.test(url)) s.url = url;
  return s;
}

export type ParsePayloadResult = { ok: true; payload: SeedPayload } | { ok: false; error: string };

/** اعتبارسنجی کامل payload (پیام پل یا فایل JSON) */
export function parseSeedPayload(raw: unknown): ParsePayloadResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'ساختار فایل/پیام نامعتبر است' };
  const r = raw as Record<string, unknown>;
  if (r.kind !== BRIDGE_KIND) return { ok: false, error: 'این فایل خروجی کلکشنر دارینو نیست' };
  if (typeof r.version !== 'number' || r.version > BRIDGE_VERSION) {
    return { ok: false, error: 'نسخه فایل پشتیبانی نمی‌شود — دارینو را به‌روز کنید' };
  }
  if (!SOURCES.includes(r.source as ListingSource)) return { ok: false, error: 'منبع داده ناشناخته است' };
  if (!Array.isArray(r.seeds)) return { ok: false, error: 'فهرست آگهی‌ها در فایل نیست' };
  if (r.seeds.length > MAX_SEEDS_PER_PAYLOAD) return { ok: false, error: 'تعداد آگهی‌ها بیش از حد مجاز است' };
  const source = r.source as ListingSource;
  const seeds: ParsedListingSeed[] = [];
  for (const s of r.seeds) {
    const clean = sanitizeSeed(s, source);
    if (clean) seeds.push(clean);
  }
  if (seeds.length === 0) return { ok: false, error: 'هیچ آگهی معتبری در داده نیست' };
  const via = r.via === 'bridge' || r.via === 'script' || r.via === 'server' ? r.via : 'bridge';
  return {
    ok: true,
    payload: {
      kind: BRIDGE_KIND,
      version: BRIDGE_VERSION,
      source,
      city: 'ahvaz',
      cityId: typeof r.cityId === 'string' && /^[\w-]{1,40}$/.test(r.cityId) ? r.cityId : null,
      collectedAt: num(r.collectedAt) ?? Date.now(),
      via,
      seeds
    }
  };
}

/** ساخت payload (پل مرورگر / اسکریپت) */
export function makeSeedPayload(opts: {
  source: ListingSource;
  cityId: string | null;
  seeds: ParsedListingSeed[];
  via: SeedPayload['via'];
  collectedAt?: number;
}): SeedPayload {
  return {
    kind: BRIDGE_KIND,
    version: BRIDGE_VERSION,
    source: opts.source,
    city: 'ahvaz',
    cityId: opts.cityId,
    collectedAt: opts.collectedAt ?? Date.now(),
    via: opts.via,
    seeds: opts.seeds
  };
}

export function isAllowedBridgeOrigin(origin: string): boolean {
  return BRIDGE_ALLOWED_ORIGINS.includes(origin);
}

/** تشخیص منبع از نام میزبان صفحه‌ای که پل روی آن اجرا شده */
export function detectSource(hostname: string): ListingSource | null {
  const h = hostname.toLowerCase();
  if (h === 'divar.ir' || h.endsWith('.divar.ir')) return 'divar';
  if (h === 'sheypoor.com' || h.endsWith('.sheypoor.com')) return 'sheypoor';
  return null;
}

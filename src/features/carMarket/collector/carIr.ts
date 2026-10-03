/** ============================================================
 * Car Market — کلاینت و پارسر car.ir (بدون وابستگی به DOM/Node)
 *
 *  POST https://site-api.car.ir/api/prices/index  → کل فهرست قیمت در یک پاسخ
 *    data[]: برند → tips[] (مدل) → trims[] (سال/تیپ) → prices.market|company
 *  CORS باز است → مرورگر مستقیم می‌خواند؛ سرور فالبک است (همین کد).
 *
 *  نکات پارس:
 *   - یک مدل زیر چند برند تکرار می‌شود (مثلاً آریزو زیر چری و ام‌وی‌ام)
 *     → حذف تکراری با شناسه؛ برند اصلی = برندی که اسلاگش در لینک مدل آمده
 *   - قیمت «12,800,000,000» تومان؛ خارج از بازه معقول → null
 * ⚠️ بدون alias «@/» — در فانکشن سرور هم import می‌شود.
 * ============================================================ */
import type { CarPriceRow } from '../domain/types.js';

export const CAR_IR_PRICES_URL = 'https://site-api.car.ir/api/prices/index';
export const CAR_IR_SOURCE_URL = 'https://car.ir/prices';

/** بازه معقول قیمت خودرو (تومان) */
const MIN_PRICE = 50_000_000;
const MAX_PRICE = 500_000_000_000;

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

interface RawPrice {
  price?: unknown;
  updatedAt?: unknown;
  changePercent?: unknown;
}
interface RawTrim {
  id?: unknown;
  year?: unknown;
  option?: unknown;
  prices?: { market?: RawPrice | null; company?: RawPrice | null } | null;
}
interface RawTip {
  id?: unknown;
  title?: unknown;
  link?: unknown;
  trims?: RawTrim[];
}
interface RawBrand {
  slug?: unknown;
  title?: unknown;
  tips?: RawTip[];
}

export interface ParsedCarPrices {
  rows: CarPriceRow[];
  brandNames: Record<string, string>;
  /** آخرین زمان به‌روزرسانی قیمت در منبع (ms) */
  sourceUpdatedAt: number | null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
}

/** «12,800,000,000» / «۱۲٬۸۰۰…» → عدد تومان (بازه معقول) */
export function parsePrice(v: unknown): number | null {
  const s = str(v)
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[^\d]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= MIN_PRICE && n <= MAX_PRICE ? n : null;
}

function parseTs(v: unknown): number | null {
  const t = Date.parse(str(v));
  return Number.isFinite(t) ? t : null;
}

function parsePct(v: unknown): number | null {
  const n = Number(str(v));
  return Number.isFinite(n) && Math.abs(n) <= 80 ? n : null;
}

/** برند اصلی مدل از لینک آن: «/1017-eres-hm5-erev» → eres (طولانی‌ترین اسلاگ منطبق) */
export function canonicalBrand(link: string, slugs: string[], fallback: string): string {
  const rest = link.replace(/^\/?\d+-/, '');
  let best: string | null = null;
  for (const s of slugs) {
    if ((rest === s || rest.startsWith(`${s}-`)) && (!best || s.length > best.length)) best = s;
  }
  return best ?? fallback;
}

/** پاسخ /api/prices/index → ردیف‌های یکتا (تیپ-سال) */
export function parseCarIrIndex(json: unknown): ParsedCarPrices {
  const data = (json as { data?: unknown })?.data;
  const brands: RawBrand[] = Array.isArray(data) ? (data as RawBrand[]) : [];
  const brandNames: Record<string, string> = {};
  for (const b of brands) {
    const slug = str(b.slug);
    if (slug) brandNames[slug] = str(b.title) || slug;
  }
  const slugs = Object.keys(brandNames);
  const seenTips = new Set<string>();
  const seenTrims = new Set<string>();
  const rows: CarPriceRow[] = [];
  let sourceUpdatedAt: number | null = null;

  for (const b of brands) {
    const listedUnder = str(b.slug);
    for (const tip of Array.isArray(b.tips) ? b.tips : []) {
      const modelId = str(tip.id);
      if (!modelId || seenTips.has(modelId)) continue;
      seenTips.add(modelId);
      const brand = canonicalBrand(str(tip.link), slugs, listedUnder);
      const model = str(tip.title).replace(/\s+/g, ' ');
      for (const t of Array.isArray(tip.trims) ? tip.trims : []) {
        const id = str(t.id);
        if (!id || seenTrims.has(id)) continue;
        const m = t.prices?.market ?? null;
        const c = t.prices?.company ?? null;
        const market = m ? parsePrice(m.price) : null;
        const dealer = c ? parsePrice(c.price) : null;
        if (market === null && dealer === null) continue;
        seenTrims.add(id);
        const marketUpdatedAt = m ? parseTs(m.updatedAt) : null;
        for (const ts of [marketUpdatedAt, c ? parseTs(c.updatedAt) : null]) {
          if (ts !== null && (sourceUpdatedAt === null || ts > sourceUpdatedAt)) sourceUpdatedAt = ts;
        }
        rows.push({
          id,
          modelId,
          brand,
          model,
          year: str(t.year),
          option: str(t.option) || null,
          market,
          dealer,
          marketUpdatedAt,
          srcChangePct: m && market !== null ? parsePct(m.changePercent) : null
        });
      }
    }
  }
  return { rows, brandNames, sourceUpdatedAt };
}

/** واکشی کامل فهرست قیمت car.ir */
export async function fetchCarIrPrices(fetcher: Fetcher = (u, i) => fetch(u, i), timeoutMs = 20_000): Promise<ParsedCarPrices> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetcher(CAR_IR_PRICES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sort: 'brand-name', filters: {} }),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = parseCarIrIndex(await res.json());
    if (parsed.rows.length === 0) throw new Error('empty price list');
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

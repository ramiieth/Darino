/** ============================================================
 * Property Market — اجرای کلکشنر (تکه‌ای / قابل ازسرگیری / چندمنبعی)
 *
 *  منابع: دیوار (مرجع فنی `mobin-torabi/divar-house-scraper`) و شیپور.
 *  هر «تکه» (chunk):
 *   ۱) اگر آگهیِ در انتظار جزئیات داریم → اول همان‌ها (در حد بودجه)
 *   ۲) وگرنه یک صفحه فهرست → آگهی‌های کامل مستقیم خروجی، بقیه → جزئیات
 *   ۳) باقی‌مانده بودجه/زمان → در کرسر می‌ماند (هیچ آگهی‌ای دور ریخته نمی‌شود)
 *
 *  همین کد در سه محیط اجرا می‌شود: فانکشن سرور، اسکریپت محلی Node، و
 *  «پل مرورگر» روی divar.ir / sheypoor.com (با IP خود کاربر).
 *
 * ⚠️ خروجی = seed پارس‌شده (بدون پاک‌سازی)؛ پاک‌سازی در لایه داده انجام می‌شود.
 * ============================================================ */
import { PROPERTY_CITIES } from '../data/catalog.js';
import type { ListingSource, PropertyCity } from '../domain/types.js';
import { fetchCities, fetchDetail, fetchListPage, matchCity, sleep, type Fetcher } from './client.js';
import { DIVAR_CATEGORY_APARTMENT_SALE, REQUEST_PAUSE_MS } from './endpoints.js';
import { parseIntoSeed, parseListPage, type ParsedListingSeed } from './parse.js';
import {
  fetchSheypoorDetail,
  fetchSheypoorList,
  parseSheypoorDetail,
  parseSheypoorList,
  sheypoorIdFromToken
} from './sheypoor.js';

export const COLLECT_SOURCES: ListingSource[] = ['divar', 'sheypoor'];

/** نشانگر پیشرفت کلکشن — بین تکه‌ها ردوبدل می‌شود (سمت کلاینت نگهداری می‌شود) */
export interface CollectCursor {
  source: ListingSource;
  /** دیوار: شناسه عددی شهر؛ شیپور: اسلاگ شهر */
  cityId: string | null;
  /** دیوار: pagination.data؛ شیپور: رشته meta.f */
  paginationData: unknown;
  hasNextPage: boolean;
  /** شناسه‌های دیده‌شده (حذف تکراری بین تکه‌ها) */
  seenTokens: string[];
  /** آگهی‌هایی که هنوز جزئیات لازم دارند (به تکه بعد منتقل می‌شوند) */
  pendingSeeds: ParsedListingSeed[];
  pagesRead: number;
}

export function newCursor(source: ListingSource = 'divar'): CollectCursor {
  return {
    source,
    cityId: null,
    paginationData: null,
    hasNextPage: true,
    seenTokens: [],
    pendingSeeds: [],
    pagesRead: 0
  };
}

/** کرسر دریافتی از شبکه → کرسر سالم (ورودی نامعتبر/قدیمی تحمل می‌شود) */
export function sanitizeCursor(raw: unknown, source: ListingSource): CollectCursor {
  const base = newCursor(source);
  if (!raw || typeof raw !== 'object') return base;
  const c = raw as Partial<CollectCursor>;
  if (c.source && c.source !== source) return base;
  return {
    source,
    cityId: typeof c.cityId === 'string' && c.cityId ? c.cityId : null,
    paginationData: c.paginationData ?? null,
    hasNextPage: c.hasNextPage !== false,
    seenTokens: Array.isArray(c.seenTokens) ? c.seenTokens.filter((t): t is string => typeof t === 'string') : [],
    pendingSeeds: Array.isArray(c.pendingSeeds)
      ? c.pendingSeeds.filter((s): s is ParsedListingSeed => !!s && typeof s === 'object' && typeof s.token === 'string')
      : [],
    pagesRead: typeof c.pagesRead === 'number' && c.pagesRead >= 0 ? c.pagesRead : 0
  };
}

export interface CollectChunkOptions {
  city: PropertyCity;
  source?: ListingSource;
  cursor?: CollectCursor;
  /** سقف کل آگهی‌های یک نشست (برای هر منبع) */
  maxListings?: number;
  /** سقف واکشی جزئیات در این تکه */
  detailBudget?: number;
  /** سقف زمان این تکه (ms) — سازگار با محدودیت سرورلس */
  timeBudgetMs?: number;
  /** فاصله مؤدبانه بین درخواست‌ها */
  pauseMs?: number;
  fetcher?: Fetcher;
  /** پایه URL شیپور (پل مرورگر روی sheypoor.com از origin همان صفحه استفاده می‌کند) */
  sheypoorBase?: string;
  /** سقف صفحات فهرست (محافظ حلقه) */
  maxPages?: number;
}

export interface CollectChunkResult {
  source: ListingSource;
  cursor: CollectCursor;
  /** seedهای نهایی این تکه (کامل یا با جزئیات ناموفق — پاک‌سازی تصمیم می‌گیرد) */
  seeds: ParsedListingSeed[];
  cityId: string | null;
  done: boolean;
  fetchedDetails: number;
  failedDetails: number;
  /** آگهی‌های در انتظار جزئیات برای تکه‌های بعد */
  pending: number;
}

export const DEFAULT_MAX_LISTINGS = 360;
export const DEFAULT_DETAIL_BUDGET = 30;
export const DEFAULT_TIME_BUDGET_MS = 40_000;
export const DEFAULT_MAX_PAGES = 40;

/** نیاز به جزئیات دارد؟ دیوار: وقتی قیمت/متر محاسبه‌پذیر نیست. شیپور: همیشه (فهرست متراژ ندارد). */
export function needsDetail(seed: ParsedListingSeed): boolean {
  if (seed.source === 'sheypoor') return true;
  const hasPpm = seed.pricePerSqmToman !== null && seed.pricePerSqmToman > 0;
  const hasTotal = seed.totalPriceToman !== null && seed.totalPriceToman > 0;
  const hasArea = seed.areaSqm !== null && seed.areaSqm > 0;
  return !(hasPpm || (hasTotal && hasArea));
}

/**
 * اجرای یک تکه کلکشن.
 * خطای شبکه در resolve شهر یا صفحه فهرست → پرتاب خطا (فراخواننده گزارش می‌دهد).
 * خطای جزئیات یک آگهی → فقط همان آگهی (بدون قیمت/متر) خروجی می‌شود.
 */
export async function collectChunk(opts: CollectChunkOptions): Promise<CollectChunkResult> {
  const source: ListingSource = opts.source ?? 'divar';
  const cityDef = PROPERTY_CITIES.find((c) => c.id === opts.city);
  if (!cityDef) throw new Error(`unsupported city: ${opts.city}`);
  const fetcher = opts.fetcher;
  const pauseMs = opts.pauseMs ?? REQUEST_PAUSE_MS;
  const detailBudget = opts.detailBudget ?? DEFAULT_DETAIL_BUDGET;
  const timeBudgetMs = opts.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;
  const maxListings = opts.maxListings ?? DEFAULT_MAX_LISTINGS;
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const cursor = opts.cursor ? sanitizeCursor(opts.cursor, source) : newCursor(source);
  const startedAt = Date.now();
  const timeLeft = () => timeBudgetMs - (Date.now() - startedAt);

  const out: ParsedListingSeed[] = [];
  let fetchedDetails = 0;
  let failedDetails = 0;

  // ۱) resolve شهر (یک‌بار در هر نشست)
  if (!cursor.cityId) {
    if (source === 'divar') {
      const cities = await fetchCities(fetcher);
      const hit = matchCity(cities, cityDef.divarSlugHints);
      if (!hit) throw new Error(`city not found on divar: ${cityDef.name}`);
      cursor.cityId = String(hit.id);
    } else {
      cursor.cityId = cityDef.sheypoorSlug;
    }
  }

  // ۲) صفحه فهرست — فقط وقتی صف جزئیات خالی است (صف بی‌نهایت رشد نمی‌کند)
  if (cursor.pendingSeeds.length === 0 && cursor.hasNextPage) {
    const fresh = source === 'divar'
      ? await readDivarPage(cursor, fetcher)
      : await readSheypoorPage(cursor, cityDef.name, fetcher, opts.sheypoorBase);
    for (const seed of fresh) {
      if (cursor.seenTokens.includes(seed.token)) continue;
      if (cursor.seenTokens.length >= maxListings) break;
      cursor.seenTokens.push(seed.token);
      if (needsDetail(seed)) cursor.pendingSeeds.push(seed);
      else out.push(seed);
    }
    if (cursor.seenTokens.length >= maxListings || cursor.pagesRead >= maxPages) cursor.hasNextPage = false;
  }

  // ۳) جزئیات (در حد بودجه تعداد و زمان)
  let budget = detailBudget;
  while (cursor.pendingSeeds.length > 0 && budget > 0 && timeLeft() > 0) {
    const seed = cursor.pendingSeeds.shift()!;
    budget -= 1;
    try {
      if (source === 'divar') {
        parseIntoSeed(seed, await fetchDetail(seed.token, fetcher));
      } else {
        const id = sheypoorIdFromToken(seed.token);
        if (!id) throw new Error('bad sheypoor token');
        parseSheypoorDetail(seed, await fetchSheypoorDetail(id, { fetcher, base: opts.sheypoorBase }), cityDef.name);
      }
      fetchedDetails += 1;
    } catch {
      failedDetails += 1;
    }
    out.push(seed);
    if (cursor.pendingSeeds.length > 0 && budget > 0 && pauseMs > 0) await sleep(pauseMs);
  }

  const done = !cursor.hasNextPage && cursor.pendingSeeds.length === 0;
  return {
    source,
    cursor,
    seeds: out,
    cityId: cursor.cityId,
    done,
    fetchedDetails,
    failedDetails,
    pending: cursor.pendingSeeds.length
  };
}

async function readDivarPage(cursor: CollectCursor, fetcher?: Fetcher): Promise<ParsedListingSeed[]> {
  const page = await fetchListPage({
    cityId: cursor.cityId!,
    category: DIVAR_CATEGORY_APARTMENT_SALE,
    paginationData: cursor.paginationData ?? undefined,
    fetcher
  });
  const parsed = parseListPage(page, DIVAR_CATEGORY_APARTMENT_SALE);
  cursor.pagesRead += 1;
  cursor.hasNextPage = parsed.pagination.hasNext && parsed.seeds.size > 0;
  cursor.paginationData = parsed.pagination.data;
  return [...parsed.seeds.values()];
}

async function readSheypoorPage(
  cursor: CollectCursor,
  cityFa: string,
  fetcher?: Fetcher,
  base?: string
): Promise<ParsedListingSeed[]> {
  const prev = typeof cursor.paginationData === 'string' ? cursor.paginationData : null;
  const page = await fetchSheypoorList({ citySlug: cursor.cityId!, cursor: prev, base, fetcher });
  const parsed = parseSheypoorList(page, cityFa);
  cursor.pagesRead += 1;
  // کرسر تکراری/خالی = انتهای نتایج (محافظ حلقه بی‌پایان)
  cursor.hasNextPage = parsed.nextCursor !== null && parsed.nextCursor !== prev;
  cursor.paginationData = parsed.nextCursor;
  return [...parsed.seeds.values()];
}

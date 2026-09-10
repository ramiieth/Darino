/** ============================================================
 * Property Market — اجرای کلکشنر دیوار (تکه‌ای / قابل ازسرگیری)
 *
 *  مرجع فنی: `mobin-torabi/divar-house-scraper`
 *   ۱) resolve شهر از /places/cities (نام/اسلاگ)
 *   ۲) صفحات فهرست از /postlist/w/search (کرسر صفحه‌بندی)
 *   ۳) جزئیات از /posts-v2/web/{token} فقط برای آگهی‌های فاقد
 *      قیمت/متراژ (بودجه هر تکه — مناسب محدودیت سرورلس)
 *   ۴) فاصله مؤدبانه بین درخواست‌ها + حذف تکراری توکن
 *
 * ⚠️ خروجی = آگهی پارس‌شده (بدون پاک‌سازی نهایی)؛ پاک‌سازی و
 *    ذخیره‌سازی در لایه‌های بعدی انجام می‌شود تا تست‌پذیر بماند.
 * ============================================================ */
import { PROPERTY_CITIES } from '../data/catalog.js';
import type { PropertyCity } from '../domain/types.js';
import {
  fetchCities,
  fetchDetail,
  fetchListPage,
  matchCity,
  sleep,
  type Fetcher
} from './client.js';
import { DIVAR_CATEGORY_APARTMENT_SALE, REQUEST_PAUSE_MS } from './endpoints.js';
import { parseIntoSeed, parseListPage, type ParsedListingSeed } from './parse.js';

/** نشانگر پیشرفت کلکشن — بین تکه‌ها ردوبدل می‌شود (سمت کلاینت نگهداری می‌شود) */
export interface CollectCursor {
  cityId: string | null;
  /** کرسر صفحه‌بندی دیوار برای صفحه بعد */
  paginationData: unknown;
  hasNextPage: boolean;
  /** توکن‌های دیده‌شده (حذف تکراری بین تکه‌ها) */
  seenTokens: string[];
  /** توکن‌هایی که هنوز نیازمند جزئیات‌اند */
  pendingTokens: string[];
  /** تعداد صفحات فهرست خوانده‌شده تاکنون */
  pagesRead: number;
}

export function newCursor(): CollectCursor {
  return {
    cityId: null,
    paginationData: null,
    hasNextPage: true,
    seenTokens: [],
    pendingTokens: [],
    pagesRead: 0
  };
}

export interface CollectChunkOptions {
  city: PropertyCity;
  /** حداکثر آگهی فهرست در این تکه (۰ = نامحدود تا پایان صفحات) */
  maxListings?: number;
  /** بودجه واکشی صفحه جزئیات در این تکه */
  detailBudget?: number;
  /** فاصله بین درخواست‌ها (میلی‌ثانیه) */
  pauseMs?: number;
  fetcher?: Fetcher;
  cursor?: CollectCursor;
}

export interface CollectChunkResult {
  cursor: CollectCursor;
  seeds: ParsedListingSeed[];
  cityId: string | null;
  /** فهرست آگهی‌ها تمام شده و بودجه جزئیات هم مصرف شده */
  done: boolean;
  fetchedDetails: number;
  failedDetails: number;
  note?: string;
}

/** نیاز به جزئیات دارد؟ (قیمت کل/هر متر و متراژ موجود نباشد) */
function needsDetail(seed: ParsedListingSeed): boolean {
  const hasPpm = seed.pricePerSqmToman !== null && seed.pricePerSqmToman > 0;
  const hasTotal = seed.totalPriceToman !== null && seed.totalPriceToman > 0;
  const hasArea = seed.areaSqm !== null && seed.areaSqm > 0;
  return !(hasPpm || (hasTotal && hasArea));
}

/**
 * اجرای یک تکه کلکشن — سرورلس/اسکریپت همین را فرامی‌خوانند.
 * خطای شبکه در واکشی شهر/فهرست → پرتاب خطا (کلاینت اطلاع می‌دهد).
 */
export async function collectChunk(opts: CollectChunkOptions): Promise<CollectChunkResult> {
  const fetcher = opts.fetcher;
  const pauseMs = opts.pauseMs ?? REQUEST_PAUSE_MS;
  const detailBudget = opts.detailBudget ?? 12;
  const maxListings = opts.maxListings ?? 60;
  const cursor = opts.cursor ?? newCursor();
  const cityDef = PROPERTY_CITIES.find((c) => c.id === opts.city);
  if (!cityDef) throw new Error(`unsupported city: ${opts.city}`);

  const seeds = new Map<string, ParsedListingSeed>();
  let failedDetails = 0;
  let fetchedDetails = 0;

  // ۱) resolve شهر (یک‌بار در هر نشست کلکشن)
  if (!cursor.cityId) {
    const cities = await fetchCities(fetcher);
    const hit = matchCity(cities, cityDef.divarSlugHints);
    if (!hit) throw new Error(`city not found on divar: ${cityDef.name}`);
    cursor.cityId = String(hit.id);
  }

  // ۲) صفحات فهرست
  let collectedFromPages = 0;
  while (cursor.hasNextPage && collectedFromPages < maxListings) {
    const page = await fetchListPage({
      cityId: cursor.cityId,
      category: DIVAR_CATEGORY_APARTMENT_SALE,
      paginationData: cursor.paginationData ?? undefined,
      fetcher
    });
    const parsed = parseListPage(page, DIVAR_CATEGORY_APARTMENT_SALE);
    cursor.pagesRead += 1;
    cursor.hasNextPage = parsed.pagination.hasNext;
    cursor.paginationData = parsed.pagination.data;

    for (const [token, seed] of parsed.seeds) {
      if (cursor.seenTokens.includes(token)) continue;
      cursor.seenTokens.push(token);
      seeds.set(token, seed);
      if (needsDetail(seed)) cursor.pendingTokens.push(token);
      collectedFromPages += 1;
      if (collectedFromPages >= maxListings) break;
    }
    if (cursor.hasNextPage && collectedFromPages < maxListings) await sleep(pauseMs);
  }

  // ۳) جزئیات برای آگهی‌های فاقد قیمت/متراژ (در حد بودجه)
  const pending = cursor.pendingTokens.filter((t) => seeds.has(t));
  cursor.pendingTokens = cursor.pendingTokens.filter((t) => !seeds.has(t));
  let budget = detailBudget;
  for (const token of pending) {
    if (budget <= 0) break;
    budget -= 1;
    const seed = seeds.get(token);
    if (!seed) continue;
    try {
      const detail = await fetchDetail(token, fetcher);
      parseIntoSeed(seed, detail);
      fetchedDetails += 1;
    } catch {
      failedDetails += 1;
    }
    await sleep(pauseMs);
  }

  // اگر صفحات فهرست تمام شده ولی هنوز توکن معلقِ بدون داده داریم،
  // در تکه‌های بعد فقط جزئیات باقی‌مانده واکشی می‌شود (صفحه جدیدی نیست).
  const remainingPending = cursor.pendingTokens.length;
  const done = !cursor.hasNextPage && remainingPending === 0;

  return {
    cursor,
    seeds: [...seeds.values()],
    cityId: cursor.cityId,
    done,
    fetchedDetails,
    failedDetails,
    note: done
      ? undefined
      : !cursor.hasNextPage
        ? `${remainingPending} آگهی در انتظار جزئیات`
        : undefined
  };
}

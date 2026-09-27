/** ============================================================
 * Property Market — ورود داده و ساخت Snapshot (خالص، سمت کلاینت)
 *
 * مسیر جمع‌آوری: سرور (/api/propertyMarket) → دیوار
 *
 *   seedها → Normalize/Validate → ادغام با موجودی (حذف تکراری) → IndexedDB
 *   آگهی‌های «پنجره بازار» → پرت‌گیری → آمار → Snapshot الحاقی
 *
 * ⚠️ اپ تک‌کاربره است: منبع حقیقت IndexedDB است؛ سرور فقط واکشی می‌کند.
 * ============================================================ */
import type {
  TypeStats,
  AreaPriceStats,
  CleaningReport,
  ListingSource,
  NeighborhoodStatsRecord,
  PropertyCity,
  PropertyMarketListing,
  PropertyMarketSnapshot
} from '../domain/types';
import type { ParsedListingSeed } from '../collector/parse';
import {
  deduplicateListings,
  filterOutliers,
  isStaleAd,
  newCleaningReport,
  normalizeAndValidate,
  storedListingRejectReason
} from '../collector/pipeline';
import { detectFirstKey } from '../collector/dates';
import { PRICE_TYPES, jalaliYearOf, matchesPriceType } from '../domain/segments';
import { buildAreaStats, buildCityStats, buildNeighborhoodStats, mean, median } from '../domain/stats';
import { areaGroupName, areaGroupOf, neighborhoodDisplayName, resolveNeighborhood } from './catalog';

/** آگهی‌هایی که در این بازه دیده شده‌اند «بازار فعلی» محسوب می‌شوند */
export const MARKET_WINDOW_DAYS = 60;
const DAY_MS = 86_400_000;

export interface IngestResult {
  /** کل آگهی‌ها پس از ادغام (برای ذخیره/نمایش) */
  listings: PropertyMarketListing[];
  /** آگهی‌های جدید یا به‌روزشده در این ورود (برای bulkPut) */
  changed: PropertyMarketListing[];
  /** تعداد آگهی واقعاً جدید (توکن ناشناخته) */
  added: number;
  report: CleaningReport;
}

/** ورود seedها به مجموعه موجود — آگهی دوباره‌دیده‌شده «تازه» می‌شود (scrapedAt جدید) */
export function ingestSeeds(opts: {
  existing: PropertyMarketListing[];
  seeds: ParsedListingSeed[];
  city: PropertyCity;
  cityId?: string | null;
  now?: number;
}): IngestResult {
  const now = opts.now ?? Date.now();
  const report = newCleaningReport();
  const valid: PropertyMarketListing[] = [];
  for (const seed of opts.seeds) {
    if (!seed || typeof seed !== 'object' || typeof seed.token !== 'string' || !seed.token) continue;
    const l = normalizeAndValidate(seed, opts.city, opts.cityId ?? null, now, report);
    if (l) valid.push(l);
  }
  const before = new Map(opts.existing.map((l) => [l.token, l]));
  const merged = deduplicateListings(valid, opts.existing, report);
  const changed = merged.filter((l) => before.get(l.token) !== l);
  const added = merged.filter((l) => !before.has(l.token)).length;
  report.market = valid.length;
  return { listings: merged, changed, added, report };
}

/** آگهی‌های آنلاین داخل پنجره بازار */
export function listingsInWindow(
  listings: PropertyMarketListing[],
  now: number = Date.now(),
  windowDays: number = MARKET_WINDOW_DAYS
): PropertyMarketListing[] {
  const from = now - windowDays * DAY_MS;
  return listings.filter(
    (l) =>
      l.source !== 'manual-legacy' &&
      l.scrapedAt >= from &&
      l.pricePerSqmToman !== null &&
      // آخرین به‌روزرسانی آگهی در منبع — آگهی کهنه در بازار فعلی حساب نمی‌شود
      !isStaleAd(l.sourceUpdatedAt, now)
  );
}

/** ساخت Snapshot جدید از آگهی‌های پنجره بازار — داده ناکافی → null (هرگز Snapshot خالی) */
export function buildSnapshot(opts: {
  listings: PropertyMarketListing[];
  city?: PropertyCity;
  now?: number;
  windowDays?: number;
  /** گزارش ورود همین اجرا (برای قیف شفافیت) */
  ingestReport?: CleaningReport;
  /** نرخ زنده تتر در لحظه ثبت (مبنای مقایسه دلاری آینده) */
  usdt?: { rateToman: number; source: 'wallex' | 'bitpin' } | null;
}): PropertyMarketSnapshot | null {
  const now = opts.now ?? Date.now();
  const inWindow = listingsInWindow(opts.listings, now, opts.windowDays);
  if (inWindow.length === 0) return null;

  const report = newCleaningReport();
  const ir = opts.ingestReport;
  report.raw = ir ? ir.raw : inWindow.length;
  report.normalized = ir ? ir.normalized : inWindow.length;
  report.valid = ir ? ir.valid : inWindow.length;
  report.deduplicated = ir ? ir.deduplicated : 0;
  if (ir) report.rejectReasons = { ...ir.rejectReasons };
  const market = filterOutliers(inWindow, report);
  report.market = market.length;
  if (market.length === 0) return null;

  const keys = [...new Set(market.map((l) => l.neighborhoodKey).filter((k): k is string => !!k))];
  const jy = jalaliYearOf(now);
  const withTotals = (stats: AreaPriceStats, group: PropertyMarketListing[]): AreaPriceStats => ({
    ...stats,
    byType: typeStatsOf(group, jy),
    medianTotalToman: median(group.map((l) => l.totalPriceToman).filter((v): v is number => v !== null && v > 0)),
    meanTotalToman: mean(group.map((l) => l.totalPriceToman).filter((v): v is number => v !== null && v > 0)),
    medianAreaSqm: median(group.map((l) => l.areaSqm).filter((v): v is number => v !== null && v > 0))
  });
  const neighborhoodStats: NeighborhoodStatsRecord[] = keys.map((key) => ({
    neighborhoodKey: key,
    displayName: neighborhoodDisplayName(key),
    stats: withTotals(buildNeighborhoodStats(market, key), market.filter((l) => l.neighborhoodKey === key))
  }));

  // منطقه‌ها: همه آگهی‌های محله‌های عضو (آمار روی آگهی‌ها، نه میانگینِ میانه‌ها)
  const groupKeys = [...new Set(keys.map((k) => areaGroupOf(k)).filter((g): g is string => !!g))];
  const groupStats: NeighborhoodStatsRecord[] = groupKeys.map((g) => {
    const members = market.filter((l) => areaGroupOf(l.neighborhoodKey) === g);
    return {
      neighborhoodKey: g,
      displayName: areaGroupName(g),
      stats: withTotals(
        buildAreaStats(members.map((l) => l.pricePerSqmToman).filter((v): v is number => v !== null && v > 0)),
        members
      )
    };
  });

  const sourceCounts: Partial<Record<ListingSource, number>> = {};
  for (const l of market) {
    if (l.source === 'divar') sourceCounts.divar = (sourceCounts.divar ?? 0) + 1;
  }
  const used = Object.keys(sourceCounts) as ListingSource[];

  return {
    id: `pmsnap-${now}`,
    dateTs: now,
    dateLabel: new Date(now).toISOString().slice(0, 10),
    city: opts.city ?? 'ahvaz',
    source: used.length === 1 ? used[0] : 'mixed',
    sourceCounts,
    fxRateAtSnapshotToman: opts.usdt?.rateToman ?? null,
    ...(opts.usdt ? { fxSource: opts.usdt.source } : {}),
    cityStats: withTotals(buildCityStats(market), market),
    neighborhoodStats,
    groupStats,
    cleaning: report,
    createdAt: now
  };
}

/**
 * بازکلیدگذاری آگهی‌های ذخیره‌شده با کاتالوگ فعلی (از روی نام خام محله + عنوان).
 * مهاجرت خودکار و بی‌خطر (idempotent) — داده خام تغییر نمی‌کند، فقط کلید.
 * خروجی: فهرست کامل + آگهی‌هایی که کلیدشان عوض شد (برای ذخیره).
 */
export function rekeyListings(listings: PropertyMarketListing[]): {
  listings: PropertyMarketListing[];
  changed: PropertyMarketListing[];
} {
  const changed: PropertyMarketListing[] = [];
  const out = listings.map((l) => {
    if (l.source === 'manual-legacy' || !l.neighborhood) return l;
    const key = resolveNeighborhood(l.neighborhood, l.title).key ?? l.neighborhoodKey;
    // نسخه‌های قبلی فیلد «کلید اول» نداشتند → از عنوان (تنها متن ذخیره‌شده)
    const firstKey = l.firstKey === undefined ? detectFirstKey(l.title) : l.firstKey;
    if (key === l.neighborhoodKey && firstKey === l.firstKey) return l;
    const next = { ...l, neighborhoodKey: key, firstKey };
    changed.push(next);
    return next;
  });
  return { listings: out, changed };
}

/**
 * پاک‌سازی آگهی‌های ذخیره‌شده با قواعد فعلی (شیپور، زیر ۹۰ متر، تناقض محله با متن).
 * خروجی: آگهی‌های ماندنی + توکن‌های حذفی (برای حذف از IndexedDB).
 */
export function purgeStoredListings(listings: PropertyMarketListing[]): {
  listings: PropertyMarketListing[];
  removed: string[];
} {
  const kept: PropertyMarketListing[] = [];
  const removed: string[] = [];
  for (const l of listings) {
    if (l.source !== 'manual-legacy' && storedListingRejectReason(l)) removed.push(l.token);
    else kept.push(l);
  }
  return { listings: kept, removed };
}

/** آمار انواع قیمت (کلید اول، ۱ تا ۷ سال) برای یک گروه آگهی — نوع خالی ذخیره نمی‌شود */
export function typeStatsOf(group: PropertyMarketListing[], currentJalaliYear: number): Partial<Record<string, TypeStats>> {
  const out: Partial<Record<string, TypeStats>> = {};
  for (const t of PRICE_TYPES) {
    const g = group.filter((l) => matchesPriceType(l, t.key, currentJalaliYear));
    if (g.length === 0) continue;
    const ppm = g.map((l) => l.pricePerSqmToman).filter((v): v is number => v !== null && v > 0);
    const tot = g.map((l) => l.totalPriceToman).filter((v): v is number => v !== null && v > 0);
    out[t.key] = { count: g.length, medianPpm: median(ppm), meanPpm: mean(ppm), medianTotal: median(tot), meanTotal: mean(tot) };
  }
  return out;
}

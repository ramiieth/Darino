/** ============================================================
 * Property Market — قیف پاک‌سازی داده (§۱۸ مأموریت)
 *
 *   Raw → Normalize → Validate → Deduplicate → Outlier filtering → Market Dataset
 *
 * ⚠️ هیچ داده‌ای جعلی/تکمیل نمی‌شود — رکورد ناقص یا رد می‌شود یا
 *    با فیلدهای خالی نگه داشته می‌شود (بسته به مرحله).
 * ============================================================ */
import type { CleaningReport, PropertyCity, PropertyMarketListing } from '../domain/types.js';
import { resolveNeighborhood } from '../data/catalog.js';
import type { ParsedListingSeed } from './parse.js';
import { derivePricePerSqm } from './parse.js';
import { percentile } from '../domain/stats.js';

/* ---------------- کریدورهای اعتبارسنجی ---------------- */

/** قیمت کل: ۱۰۰ میلیون تا ۲ همتا تومان (مطابق مرجع — اسپم/نگهدارنده) */
export const MIN_TOTAL_PRICE_TOMAN = 100_000_000;
export const MAX_TOTAL_PRICE_TOMAN = 2_000_000_000_000;
/** قیمت هر مترمربع: بازه معقول آپارتمان شهری */
export const MIN_PPM_TOMAN = 1_000_000;
export const MAX_PPM_TOMAN = 2_000_000_000;
/** متراژ آپارتمان */
export const MIN_AREA_SQM = 15;
export const MAX_AREA_SQM = 1_000;
/** سال ساخت شمسی معقول */
export const MIN_YEAR = 1330;
export const MAX_YEAR = 1410;
/** حداقل تعداد نمونه محله برای فیلتر پرت آماری (کمتر → بدون فیلتر) */
export const MIN_NEIGHBORHOOD_SAMPLE_FOR_IQR = 6;

export function newCleaningReport(): CleaningReport {
  return {
    raw: 0,
    normalized: 0,
    valid: 0,
    deduplicated: 0,
    outliersRemoved: 0,
    market: 0,
    rejectReasons: {}
  };
}

function reject(report: CleaningReport, reason: string): void {
  report.rejectReasons[reason] = (report.rejectReasons[reason] ?? 0) + 1;
}

/* ---------------- ۱+۲) Normalize + Validate ---------------- */

/**
 * Normalize + Validate یک آگهی پارس‌شده → رکورد معتبر یا رد.
 * دلیل رد در گزارش ثبت می‌شود (شفافیت).
 */
export function normalizeAndValidate(
  seed: ParsedListingSeed,
  city: PropertyCity,
  cityId: string | null,
  scrapedAt: number,
  report: CleaningReport
): PropertyMarketListing | null {
  report.raw += 1;

  const pricePerSqm = derivePricePerSqm(seed);
  const nb = resolveNeighborhood(seed.neighborhood);

  const listing: PropertyMarketListing = {
    token: seed.token,
    url: seed.url,
    city,
    cityId,
    neighborhood: seed.neighborhood,
    neighborhoodKey: nb.key,
    propertyKind: seed.propertyKind,
    areaSqm: seed.areaSqm,
    rooms: seed.rooms,
    yearBuilt: seed.yearBuilt,
    floor: seed.floor,
    totalPriceToman: seed.totalPriceToman,
    pricePerSqmToman: pricePerSqm,
    parking: seed.parking,
    elevator: seed.elevator,
    storage: seed.storage,
    balcony: seed.balcony,
    title: seed.title,
    listedAt: seed.listedAt,
    scrapedAt,
    source: 'divar'
  };
  report.normalized += 1;

  // اعتبارسنجی: برای تحلیل قیمت، حداقل «قیمت هر متر» لازم است.
  if (pricePerSqm === null) {
    reject(report, 'missing-price');
    return null;
  }
  if (pricePerSqm < MIN_PPM_TOMAN || pricePerSqm > MAX_PPM_TOMAN) {
    reject(report, 'ppm-out-of-range');
    return null;
  }
  if (listing.totalPriceToman !== null &&
      (listing.totalPriceToman < MIN_TOTAL_PRICE_TOMAN || listing.totalPriceToman > MAX_TOTAL_PRICE_TOMAN)) {
    reject(report, 'total-price-spam');
    return null;
  }
  if (listing.areaSqm !== null && (listing.areaSqm < MIN_AREA_SQM || listing.areaSqm > MAX_AREA_SQM)) {
    reject(report, 'area-out-of-range');
    return null;
  }
  if (listing.yearBuilt !== null && (listing.yearBuilt < MIN_YEAR || listing.yearBuilt > MAX_YEAR)) {
    // سال نامعتبر → حذف فیلد (نه حذف آگهی؛ قیمت معتبر است)
    listing.yearBuilt = null;
  }
  if (!listing.neighborhoodKey) {
    reject(report, 'missing-neighborhood');
    return null;
  }
  report.valid += 1;
  return listing;
}

/* ---------------- ۳) حذف تکراری ---------------- */

/** اثرانگشت قیمت+متراژ برای تشخیص آگهی‌های دوباره ثبت‌شده با توکن متفاوت */
export function listingFingerprint(l: PropertyMarketListing): string {
  // بدون هیچ عدد مشخصه‌ای → اثرانگشت تهی (هرگز حذف تکراری جعلی انجام نمی‌شود)
  if (!l.totalPriceToman && !l.areaSqm && !l.pricePerSqmToman) return '';
  return [l.neighborhoodKey ?? '', l.totalPriceToman ?? '', l.areaSqm ?? '', l.pricePerSqmToman ?? ''].join('|');
}

/**
 * حذف تکراری: توکن یکسان یا اثرانگشت (قیمت کل+متراژ+محله) یکسان.
 * رکورد جدیدتر (scrapedAt بالاتر) نگه داشته می‌شود.
 */
export function deduplicateListings(
  incoming: PropertyMarketListing[],
  existing: PropertyMarketListing[],
  report: CleaningReport
): PropertyMarketListing[] {
  const byToken = new Map<string, PropertyMarketListing>();
  const byFp = new Map<string, PropertyMarketListing>();

  const put = (l: PropertyMarketListing): void => {
    const fp = listingFingerprint(l);
    const prevT = byToken.get(l.token);
    if (prevT) {
      // همان توکن دوباره آمده — جدیدتر جایگزین می‌شود
      report.deduplicated += 1;
      if (l.scrapedAt < prevT.scrapedAt) return; // قبلی جدیدتر است
      byFp.delete(listingFingerprint(prevT));
    } else if (fp) {
      const prevF = byFp.get(fp);
      if (prevF) {
        // اثرانگشت یکسان (قیمت+متراژ+محله) = آگهی دوباره ثبت‌شده با توکن متفاوت
        report.deduplicated += 1;
        if (l.scrapedAt < prevF.scrapedAt) return;
        byToken.delete(prevF.token);
      }
    }
    byToken.set(l.token, l);
    if (fp) byFp.set(fp, l);
  };

  for (const l of existing) put(l);
  for (const l of incoming) put(l);
  report.valid += 0; // شمار ورودی‌ها قبلاً ثبت شده
  return [...byToken.values()];
}

/* ---------------- ۴) فیلتر پرت (Outlier) ---------------- */

/**
 * فیلتر پرت آماری روی قیمت هر مترمربع:
 *  - بازه جهانی [P5, P95]×ضریب اطمینان نیست؛ به‌جای آن حصار IQR
 *    (Q1 − 1.5·IQR .. Q3 + 1.5·IQR) به‌صورت «محله‌به‌محله» وقتی
 *    نمونه کافی باشد، و یک حصار سراسری روی همه داده‌ها.
 */
export function filterOutliers(
  listings: PropertyMarketListing[],
  report: CleaningReport
): PropertyMarketListing[] {
  const all = listings
    .map((l) => l.pricePerSqmToman)
    .filter((v): v is number => v !== null && v > 0);
  const gq1 = percentile(all, 25);
  const gq3 = percentile(all, 75);
  const globalFence: [number, number] | null =
    gq1 !== null && gq3 !== null
      ? [gq1 - 1.5 * (gq3 - gq1), gq3 + 1.5 * (gq3 - gq1)]
      : null;

  // گروه‌بندی محله‌ها
  const byNb = new Map<string, PropertyMarketListing[]>();
  for (const l of listings) {
    const k = l.neighborhoodKey ?? '';
    const arr = byNb.get(k) ?? [];
    arr.push(l);
    byNb.set(k, arr);
  }

  const kept: PropertyMarketListing[] = [];
  for (const group of byNb.values()) {
    const values = group
      .map((l) => l.pricePerSqmToman)
      .filter((v): v is number => v !== null && v > 0);
    let fence = globalFence;
    if (group.length >= MIN_NEIGHBORHOOD_SAMPLE_FOR_IQR) {
      const q1 = percentile(values, 25);
      const q3 = percentile(values, 75);
      if (q1 !== null && q3 !== null) fence = [q1 - 1.5 * (q3 - q1), q3 + 1.5 * (q3 - q1)];
    }
    for (const l of group) {
      const v = l.pricePerSqmToman;
      if (v !== null && fence && (v < fence[0] || v > fence[1])) {
        report.outliersRemoved += 1;
        reject(report, 'outlier');
        continue;
      }
      kept.push(l);
    }
  }
  return kept;
}

/* ---------------- اجرای کامل قیف ---------------- */

/**
 * اجرای کامل قیف روی آگهی‌های تازه‌استخراج‌شده:
 *  ورودی خام → نرمال/معتبر → ادغام با موجودی (حذف تکراری) → پرت‌گیری.
 */
export function runCleaningPipeline(opts: {
  seeds: ParsedListingSeed[];
  existing: PropertyMarketListing[];
  city: PropertyCity;
  cityId: string | null;
  scrapedAt: number;
}): { listings: PropertyMarketListing[]; report: CleaningReport } {
  const report = newCleaningReport();
  const valid: PropertyMarketListing[] = [];
  for (const seed of opts.seeds) {
    const l = normalizeAndValidate(seed, opts.city, opts.cityId, opts.scrapedAt, report);
    if (l) valid.push(l);
  }
  const merged = deduplicateListings(valid, opts.existing, report);
  const market = filterOutliers(merged, report);
  report.market = market.length;
  return { listings: market, report };
}

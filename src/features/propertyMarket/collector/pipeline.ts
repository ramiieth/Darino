/** ============================================================
 * Property Market — قیف پاک‌سازی داده (§۱۸ مأموریت)
 *
 *   Raw → Normalize → Validate → Deduplicate → Outlier filtering → Market Dataset
 *
 * ⚠️ هیچ داده‌ای جعلی/تکمیل نمی‌شود — رکورد ناقص یا رد می‌شود یا
 *    با فیلدهای خالی نگه داشته می‌شود (بسته به مرحله).
 * ============================================================ */
import type { CleaningReport, PropertyCity, PropertyMarketListing } from '../domain/types.js';
import { areaKeyOf, conflictingPlace, otherCityMarker, resolveNeighborhood } from '../data/catalog.js';
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
/** متراژ آپارتمان — زیر ۹۰ متر در تحلیل نمی‌آید (خواسته کاربر) */
export const MIN_AREA_SQM = 90;
export const MAX_AREA_SQM = 1_000;
/** سال ساخت شمسی معقول */
export const MIN_YEAR = 1330;
export const MAX_YEAR = 1410;
/** حداقل تعداد نمونه منطقه برای فیلتر پرت آماری (کمتر → فقط حصار سراسری) */
export const MIN_NEIGHBORHOOD_SAMPLE_FOR_IQR = 6;
/** آگهی که این تعداد روز یا بیشتر به‌روز نشده «کهنه» است و از بازار (فهرست و تحلیل) حذف می‌شود */
export const STALE_AD_DAYS = 4;
const DAY_MS = 86_400_000;

/** آیا آگهی نسبت به زمان مرجع کهنه است؟ (بدون تاریخ منبع → کهنه حساب نمی‌شود) */
export function isStaleAd(sourceUpdatedAt: number | null | undefined, ref: number): boolean {
  return typeof sourceUpdatedAt === 'number' && ref - sourceUpdatedAt >= STALE_AD_DAYS * DAY_MS;
}
/** ضریب حصار سراسری (محله‌های کم‌نمونه) — پرت شدید */
export const GLOBAL_IQR_K = 3;

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
  const nb = resolveNeighborhood(seed.neighborhood, seed.title);

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
    sourceUpdatedAt: seed.sourceUpdatedAt ?? null,
    scrapedAt,
    source: 'divar'
  };
  report.normalized += 1;

  // فقط دیوار (seedهای قدیمی شیپور در کرسر ذخیره‌شده پذیرفته نمی‌شوند)
  if ((seed.source as string) !== 'divar') {
    reject(report, 'not-divar');
    return null;
  }

  // آگهی کهنه: ۴ روز یا بیشتر از آخرین به‌روزرسانی در منبع گذشته
  if (isStaleAd(listing.sourceUpdatedAt, scrapedAt)) {
    reject(report, 'stale-ad');
    return null;
  }

  // آگهی ملکِ شهر دیگر که در دسته اهواز ثبت شده (نشانه صریح در متن)
  if (seed.otherCity || otherCityMarker(seed.title)) {
    reject(report, 'other-city');
    return null;
  }

  // فقط آپارتمان (ویلایی/خانه با آپارتمان قابل مقایسه نیست)
  if (listing.propertyKind === 'villa-house') {
    reject(report, 'not-apartment');
    return null;
  }

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
  const areaReason = areaRejectReason(listing.areaSqm);
  if (areaReason) {
    reject(report, areaReason);
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
  // محله آگهی با متن آن نمی‌خواند (مثلاً «کیانپارس» + «اندیشه»)
  if (conflictingPlace(listing.neighborhoodKey, listing.title)) {
    reject(report, 'neighborhood-conflict');
    return null;
  }
  report.valid += 1;
  return listing;
}

/** دلیل رد بر اساس متراژ (یا null) — متراژ نامشخص هم رد می‌شود چون زیر ۹۰ بودنش معلوم نیست */
export function areaRejectReason(areaSqm: number | null): string | null {
  if (areaSqm === null || !Number.isFinite(areaSqm)) return 'missing-area';
  if (areaSqm < MIN_AREA_SQM) return 'area-too-small';
  if (areaSqm > MAX_AREA_SQM) return 'area-out-of-range';
  return null;
}

/**
 * قواعد رد روی آگهی ذخیره‌شده (پاک‌سازی داده قبلی با قواعد فعلی):
 * منبع غیر دیوار، متراژ، تناقض محله با متن.
 */
export function storedListingRejectReason(l: PropertyMarketListing): string | null {
  if (l.source !== 'divar') return 'not-divar';
  return areaRejectReason(l.areaSqm) ?? (conflictingPlace(l.neighborhoodKey, l.title) ? 'neighborhood-conflict' : null);
}

/* ---------------- ۳) حذف تکراری ---------------- */

/**
 * اثرانگشت آگهی دوباره ثبت‌شده با توکن متفاوت.
 * واحدهای هم‌شکل یک ساختمان (متراژ و قیمت یکسان، طبقه متفاوت) آگهی‌های
 * جدا هستند — پس طبقه، سال ساخت و تعداد خواب هم جزو اثرانگشت‌اند، و
 * بدون طبقه عنوان آگهی هم لازم است.
 */
export function listingFingerprint(l: PropertyMarketListing): string {
  // بدون عدد مشخصه → اثرانگشت تهی (هرگز حذف تکراری جعلی انجام نمی‌شود)
  if (!l.totalPriceToman || !l.areaSqm) return '';
  if (l.floor === null && !l.title) return '';
  return [
    l.neighborhoodKey ?? '',
    l.totalPriceToman,
    l.areaSqm,
    l.floor ?? '',
    l.yearBuilt ?? '',
    l.rooms ?? '',
    l.floor === null ? (l.title ?? '').trim() : ''
  ].join('|');
}

/**
 * حذف تکراری: توکن یکسان یا اثرانگشت یکسان (همان واحد با آگهی دوباره).
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

/**
 * آگهی شناخته‌شده که سرور جزئیاتش را دوباره نگرفت: فیلدهای خالی (متراژ، سال ساخت،
 * طبقه، تاریخ‌ها…) از نسخه ذخیره‌شده پر می‌شوند؛ قیمت و عنوان تازه فهرست مقدم‌اند.
 */
export function fillFromStored(seed: ParsedListingSeed, prev: PropertyMarketListing | undefined): ParsedListingSeed {
  if (!prev) return seed;
  const out = { ...seed };
  const fill = <K extends keyof ParsedListingSeed & keyof PropertyMarketListing>(k: K) => {
    if (out[k] === null || out[k] === undefined) (out as Record<string, unknown>)[k] = prev[k] ?? null;
  };
  for (const k of ['areaSqm', 'rooms', 'yearBuilt', 'floor', 'parking', 'elevator', 'storage', 'balcony', 'listedAt', 'sourceUpdatedAt'] as const) {
    fill(k);
  }
  // قیمت هر متر قدیمی فقط وقتی قیمت کل تازه نیامده (وگرنه از قیمت کل تازه ÷ متراژ)
  if (out.totalPriceToman === null && out.pricePerSqmToman === null) out.pricePerSqmToman = prev.pricePerSqmToman;
  return out;
}

/* ---------------- ۴) فیلتر پرت (Outlier) ---------------- */

/**
 * فیلتر پرت آماری روی قیمت هر مترمربع — حصار IQR روی «لگاریتم» قیمت:
 *  قیمت ملک چوله به راست است (چند پروژهٔ لوکس خیلی گران‌تر از میانه)؛ حصار خطی
 *  آگهی لوکس واقعی را حذف می‌کرد (کیانپارس ۵۵۰ میلیون) ولی خطای واحد پایین
 *  (۷ میلیون) را گاهی نگه می‌داشت. حصار لگاریتمی = حصار نسبتی: [Q1/r^k , Q3·r^k] با r = Q3/Q1.
 *  منطقه‌به‌منطقه وقتی نمونه کافی باشد، و یک حصار سراسری برای مناطق کم‌نمونه.
 */
function logFence(values: number[], k: number): [number, number] | null {
  const logs = values.filter((v) => v > 0).map(Math.log);
  const q1 = percentile(logs, 25);
  const q3 = percentile(logs, 75);
  if (q1 === null || q3 === null) return null;
  // خطای گرد کردن exp(log(v)) نباید خود داده را پرت کند (مثلاً وقتی همه یک قیمت دارند)
  return [Math.exp(q1 - k * (q3 - q1)) * (1 - 1e-9), Math.exp(q3 + k * (q3 - q1)) * (1 + 1e-9)];
}
export function filterOutliers(
  listings: PropertyMarketListing[],
  report: CleaningReport
): PropertyMarketListing[] {
  const all = listings
    .map((l) => l.pricePerSqmToman)
    .filter((v): v is number => v !== null && v > 0);
  // حصار سراسری برای محله‌های کم‌نمونه = «پرت شدید» توکی (۳×IQR): فقط خطای
  // ورود/واحد را می‌گیرد، نه محله گران واقعی (مثل کیانپارس با چند آگهی).
  const globalFence = logFence(all, GLOBAL_IQR_K);

  // گروه‌بندی منطقه‌ها (همان سطح نمایش)
  const byNb = new Map<string, PropertyMarketListing[]>();
  for (const l of listings) {
    const k = areaKeyOf(l.neighborhoodKey) ?? '';
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
    if (group.length >= MIN_NEIGHBORHOOD_SAMPLE_FOR_IQR) fence = logFence(values, 1.5) ?? fence;
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

/**
 * جدا کردن «استثنا» از آگهی‌های عادی (بعد از filterOutliers):
 *  آگهی واقعی که بیرون حصار خطی IQR منطقه است (Q1 − 1.5·IQR .. Q3 + 1.5·IQR)، مثل پروژهٔ
 *  خیلی لوکس کیانپارس (۵۵۰ میلیون). حذف نمی‌شود و در فهرست آگهی‌ها می‌ماند، ولی در میانگین،
 *  بازهٔ قیمت و مقایسهٔ دستیار حساب نمی‌شود تا یک آگهی استثنایی عدد کل منطقه را جابه‌جا نکند.
 *  منطقهٔ کم‌نمونه (کمتر از MIN_NEIGHBORHOOD_SAMPLE_FOR_IQR) استثنا ندارد.
 */
export function splitExceptions(listings: PropertyMarketListing[]): {
  regular: PropertyMarketListing[];
  exceptions: PropertyMarketListing[];
} {
  const byArea = new Map<string, PropertyMarketListing[]>();
  for (const l of listings) {
    const k = areaKeyOf(l.neighborhoodKey) ?? '';
    byArea.set(k, [...(byArea.get(k) ?? []), l]);
  }
  const regular: PropertyMarketListing[] = [];
  const exceptions: PropertyMarketListing[] = [];
  for (const group of byArea.values()) {
    const values = group.map((l) => l.pricePerSqmToman).filter((v): v is number => v !== null && v > 0);
    const q1 = group.length >= MIN_NEIGHBORHOOD_SAMPLE_FOR_IQR ? percentile(values, 25) : null;
    const q3 = group.length >= MIN_NEIGHBORHOOD_SAMPLE_FOR_IQR ? percentile(values, 75) : null;
    for (const l of group) {
      const v = l.pricePerSqmToman;
      const out = q1 !== null && q3 !== null && v !== null && (v < q1 - 1.5 * (q3 - q1) || v > q3 + 1.5 * (q3 - q1));
      (out ? exceptions : regular).push(l);
    }
  }
  return { regular, exceptions };
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

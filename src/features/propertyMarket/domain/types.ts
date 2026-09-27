/** ============================================================
 * Property Market — تایپ‌های پایه (بازار املاک اهواز — Divar)
 *
 * ⚠️ داده فقط از کلکشنر دیوار (یا داده تاریخی ماژول قبلی) می‌آید —
 *    هرگز داده جعلی تولید نمی‌شود.
 * ============================================================ */

/** شهر پشتیبانی‌شده (نسخه فعلی: اهواز — قابل توسعه) */
export type PropertyCity = 'ahvaz';

/** منبع آنلاین آگهی — فقط دیوار (از مسیر سرور). آگهی‌های قدیمی شیپور هنگام بارگذاری حذف می‌شوند. */
export type ListingSource = 'divar';

/** برچسب فارسی منابع */
export const LISTING_SOURCE_FA: Record<ListingSource, string> = {
  divar: 'دیوار'
};

/** نوع ملک در آگهی‌های دیوار */
export type PropertyKind = 'apartment' | 'villa-house' | 'unknown';

/** آگهی خام/نرمال‌شده بازار ملک (هر ردیف = یک آگهی دیوار) */
export interface PropertyMarketListing {
  /** شناسه آگهی دیوار (توکن) — کلید یکتا + مبنای حذف تکراری */
  token: string;
  /** لینک آگهی */
  url: string;
  /** شهر (کلید داخلی) */
  city: PropertyCity;
  /** شناسه شهر در دیوار (در صورت resolve شدن) */
  cityId: string | null;
  /** نام محله — همان‌طور که دیوار گزارش می‌دهد */
  neighborhood: string | null;
  /** کلید نرمال‌شده محله (فقط تطبیق قطعی ویرایشی/نام مستعار — بدون حدس) */
  neighborhoodKey: string | null;
  propertyKind: PropertyKind;
  /** متراژ (متر مربع) */
  areaSqm: number | null;
  /** تعداد اتاق */
  rooms: number | null;
  /** سال ساخت (شمسی — همان‌طور که دیوار نشان می‌دهد) */
  yearBuilt: number | null;
  /** شماره طبقه */
  floor: number | null;
  /** قیمت کل (تومان) */
  totalPriceToman: number | null;
  /** قیمت هر مترمربع (تومان) — استخراج مستقیم یا محاسبه قیمت‌کل÷متراژ */
  pricePerSqmToman: number | null;
  parking: boolean | null;
  elevator: boolean | null;
  storage: boolean | null;
  balcony: boolean | null;
  /** عنوان آگهی */
  title: string | null;
  /** تاریخ انتشار اولیه آگهی (دیوار: «انتشار آگهی»؛ شیپور: addedAt) */
  listedAt: number | null;
  /** آخرین به‌روزرسانی آگهی در منبع — مبنای تشخیص آگهی کهنه (نسخه‌های قبلی ندارند) */
  sourceUpdatedAt?: number | null;
  /** تاریخ استخراج توسط کلکشنر */
  scrapedAt: number;
  /** منبع داده */
  source: ListingSource | 'manual-legacy';
}

/** آمار یک حوزه (محله یا کل شهر) روی قیمت هر مترمربع — شاخص اصلی: میانه */
export interface AreaPriceStats {
  /** شاخص اصلی بازار */
  medianTomanPerM2: number | null;
  meanTomanPerM2: number | null;
  p25TomanPerM2: number | null;
  p75TomanPerM2: number | null;
  /** تعداد آگهی معتبر (بعد از پاک‌سازی) */
  listingCount: number;
  /** میانه قیمت کل (تومان) — از بازطراحی ۲۰۲۶-۰۹ (Snapshotهای قدیمی ندارند) */
  medianTotalToman?: number | null;
  /** میانگین قیمت کل (تومان) */
  meanTotalToman?: number | null;
  /** میانه متراژ (متر مربع) */
  medianAreaSqm?: number | null;
  /**
   * آمار به تفکیک سال ساخت (کلیدهای b0…b7، old) — مبنای تاریخچه
   * هم‌سن (حذف اثر تغییر ترکیب آگهی‌ها). Snapshotهای قبل از ۲۰۲۶-۰۹-۲۶ ندارند.
   */
  byType?: Partial<Record<string, TypeStats>>;
}

/** آمار یک نوع قیمت در یک ناحیه */
export interface TypeStats {
  count: number;
  medianPpm: number | null;
  meanPpm: number | null;
  medianTotal: number | null;
  meanTotal: number | null;
}

/** آمار یک محله داخل Snapshot */
export interface NeighborhoodStatsRecord {
  neighborhoodKey: string;
  /** نام نمایشی (فارسی) */
  displayName: string;
  stats: AreaPriceStats;
}

/** گزارش قیف پاک‌سازی داده (شفافیت مراحل) */
export interface CleaningReport {
  raw: number;
  normalized: number;
  valid: number;
  deduplicated: number;
  outliersRemoved: number;
  /** خروجی نهایی = داده بازار */
  market: number;
  /** دلیل رد برخی رکوردها (شمارنده) */
  rejectReasons: Record<string, number>;
}

/**
 * Snapshot بازار ملک — Immutable (هرگز overwrite نمی‌شود).
 * ⚠️ فقط آمار «تومانی» ذخیره می‌شود — تبدیل دلاری با نرخ زنده در
 *    لایه سرویس انجام می‌شود؛ بنابراین تاریخچه به نرخ دلار وابسته نیست.
 */
export interface PropertyMarketSnapshot {
  /** کلید یکتا — مثل pmsnap-1726000000000 یا legacy-... */
  id: string;
  dateTs: number;
  dateLabel: string;
  city: PropertyCity;
  /** منبع غالب — «mixed» وقتی بیش از یک منبع آنلاین در Snapshot سهم دارد */
  source: ListingSource | 'mixed' | 'manual-legacy';
  /** تعداد آگهی نهایی به تفکیک منبع (اختیاری — Snapshotهای قدیمی ندارند) */
  sourceCounts?: Partial<Record<ListingSource, number>>;
  /**
   * نرخ تتر (تومان) در لحظه ثبت Snapshot — مبنای مقایسه دلاری در طول زمان.
   * نبود → نرخ روزانه تاریخچه تتر همان تاریخ (والکس/بیت‌پین) استفاده می‌شود.
   */
  fxRateAtSnapshotToman: number | null;
  /** منبع نرخ ذخیره‌شده */
  fxSource?: 'wallex' | 'bitpin' | 'manual-legacy';
  cityStats: AreaPriceStats;
  neighborhoodStats: NeighborhoodStatsRecord[];
  /**
   * آمار «منطقه»ها (گروه محله‌های هم‌نام: کیانپارس، کیان‌آباد، پادادشهر، زیتون…)
   * — Snapshotهای قبل از ۲۰۲۶-۰۹-۲۶ ندارند (آن‌ها کلید ادغامی را در neighborhoodStats داشتند).
   */
  groupStats?: NeighborhoodStatsRecord[];
  cleaning: CleaningReport;
  createdAt: number;
}

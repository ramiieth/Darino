/**
 * کاتالوگ قیمت‌های تاریخی مستند ۱۱ دی ۱۴۰۳ (۳۱ دسامبر ۲۰۲۴) صرفاً برای موارد مشخص‌شده توسط کاربر:
 *   ۱. مسکن اهواز (کیانپارس، کیان‌آباد، گلستان، پادادشهر، شهرک دانشگاه)
 *   ۲. خودروهای صفر کیلومتر منتخب در بازار آزاد (صرفاً قیمت بازار آزاد؛ قیمت کارخانه به طور کامل حذف شده است — تا ام‌جی ۵)
 *
 * و استخراج پویا و زندهٔ قیمت‌های فعلی همین خودروهای منتخب و محله‌های اهواز از Snapshotهای واقعی بخش «بازار خودرو» و «بازار املاک اهواز» اپ دارینو.
 */
import type { CarSnapshot, CarPriceRow } from '@/features/carMarket/domain/types';
import type { PropertyMarketSnapshot, PropertyMarketListing } from '@/features/propertyMarket/domain/types';
import { areaKeyOf } from '@/features/propertyMarket/data/catalog';
import { percentile } from '@/features/propertyMarket/domain/stats';

/** تاریخ مرجع ۱۱ دی ۱۴۰۳ (۳۱ دسامبر ۲۰۲۴) */
export const HISTORICAL_DEC_31_2024_TS = Date.parse('2024-12-31T00:00:00Z');

export interface HistoricalPropertyDef {
  key: string;
  name: string;
  /** قیمت هر مترمربع در ۱۱ دی ۱۴۰۳ (تومان) */
  priceDec1403: number;
  rangeNoteDec1403: string;
  /** قیمت فعلی بازار املاک اهواز در اپ دارینو (در صورت عدم بارگذاری Snapshot زنده، آخرین نرخ ثبت‌شدهٔ اپ) */
  fallbackCurrentPpm: number;
}

/**
 * قیمت‌های مستند مسکن اهواز در ۱۱ دی ۱۴۰۳ (هر مترمربع - تومان):
 *   • کیانپارس: ۶۰ تا ۶۵ میلیون تومان (میانه ۶۲.۵ میلیون)
 *   • پادادشهر: ۴۵ میلیون تومان
 *   • گلستان: ۴۵ میلیون تومان
 *   • کیان‌آباد: ۴۵ میلیون تومان
 *   • شهرک دانشگاه: ۳۰ تا ۳۲ میلیون تومان (میانه ۳۱ میلیون)
 */
export const AHVAZ_PROPERTY_BENCHMARKS: HistoricalPropertyDef[] = [
  {
    key: 'kianpars',
    name: 'مسکن — کیانپارس اهواز',
    priceDec1403: 62_500_000,
    rangeNoteDec1403: '۶۰ تا ۶۵ میلیون تومان (۱۱ دی ۱۴۰۳)',
    fallbackCurrentPpm: 98_000_000
  },
  {
    key: 'kianabad',
    name: 'مسکن — کیان‌آباد اهواز',
    priceDec1403: 45_000_000,
    rangeNoteDec1403: '۴۵ میلیون تومان (۱۱ دی ۱۴۰۳)',
    fallbackCurrentPpm: 76_000_000
  },
  {
    key: 'golestan',
    name: 'مسکن — گلستان اهواز',
    priceDec1403: 45_000_000,
    rangeNoteDec1403: '۴۵ میلیون تومان (۱۱ دی ۱۴۰۳)',
    fallbackCurrentPpm: 72_000_000
  },
  {
    key: 'padad',
    name: 'مسکن — پادادشهر اهواز',
    priceDec1403: 45_000_000,
    rangeNoteDec1403: '۴۵ میلیون تومان (۱۱ دی ۱۴۰۳)',
    fallbackCurrentPpm: 70_000_000
  },
  {
    key: 'shahrak-daneshgah',
    name: 'مسکن — شهرک دانشگاه اهواز',
    priceDec1403: 31_000_000,
    rangeNoteDec1403: '۳۰ تا ۳۲ میلیون تومان (۱۱ دی ۱۴۰۳)',
    fallbackCurrentPpm: 52_000_000
  }
];

export interface HistoricalCarDef {
  id: string;
  name: string;
  brandFa: string;
  /** قیمت بازار آزاد در ۱۱ دی ۱۴۰۳ (تومان) — قیمت کارخانه کاملاً حذف شده است */
  marketPriceDec1403: number;
  rangeNoteDec1403: string;
  /** الگوهای تطبیق با نام خودرو در استور بازار خودروی اپ دارینو (car.ir / دیوار) */
  matchPatterns: RegExp[];
  /** آخرین قیمت بازار آزاد ثبت‌شده در اپ دارینو (پشتیبان زمانی که هنوز کش مرورگر پر نشده) */
  fallbackCurrentMarket: number;
}

/**
 * فهرست دقیق خودروهای مشخص‌شده توسط کاربر در ۱۱ دی ۱۴۰۳ (۳۱ دسامبر ۲۰۲۴) — تا ام‌جی ۵ (MG5)
 * ⚠️ صرفاً قیمت بازار آزاد؛ تمامی قیمت‌های کارخانه/نمایندگی حذف شده‌اند و هیچ خودروی اضافه‌ای خارج از لیست کاربر وجود ندارد.
 */
export const HISTORICAL_CAR_BENCHMARKS: HistoricalCarDef[] = [
  // ─── ۱. خانواده تارا (ایران‌خودرو) ───
  {
    id: 'car:tara-v1-manual',
    name: 'خودرو — تارا دستی V1',
    brandFa: 'ایران‌خودرو',
    marketPriceDec1403: 869_500_000,
    rangeNoteDec1403: '۸۶۶ تا ۸۷۳ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/تارا\s*دند|تارا\s*دستی|تارا\s*V1(?!\s*پلاس)/i, /^Tara Manual$/i],
    fallbackCurrentMarket: 1_390_000_000
  },
  {
    id: 'car:tara-v2-auto',
    name: 'خودرو — تارا اتوماتیک V2',
    brandFa: 'ایران‌خودرو',
    marketPriceDec1403: 985_000_000,
    rangeNoteDec1403: '۹۸۰ تا ۹۹۰ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/تارا\s*اتوماتیک\s*V2|تارا\s*اتومات(?!.*V4)/i, /^Tara Automatic$/i],
    fallbackCurrentMarket: 1_580_000_000
  },
  {
    id: 'car:tara-v4-auto',
    name: 'خودرو — تارا اتوماتیک V4',
    brandFa: 'ایران‌خودرو',
    marketPriceDec1403: 1_056_500_000,
    rangeNoteDec1403: '۱,۰۵۵ تا ۱,۰۵۸ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/تارا.*V4|تارا\s*اتوماتیک\s*LX/i],
    fallbackCurrentMarket: 1_720_000_000
  },

  // ─── ۲. خانواده پژو ۲۰۷ (ایران‌خودرو) ───
  {
    id: 'car:207-tu3',
    name: 'خودرو — پژو ۲۰۷ موتور TU3',
    brandFa: 'ایران‌خودرو',
    marketPriceDec1403: 717_500_000,
    rangeNoteDec1403: '۷۱۵ تا ۷۲۰ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/207.*TU3|۲۰۷.*TU3/i],
    fallbackCurrentMarket: 1_160_000_000
  },
  {
    id: 'car:207-manual',
    name: 'خودرو — پژو ۲۰۷ دنده‌ای هیدرولیک',
    brandFa: 'ایران‌خودرو',
    marketPriceDec1403: 801_000_000,
    rangeNoteDec1403: '۸۰۰ تا ۸۰۲ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/207\s*دند|207\s*دستی|۲۰۷\s*دند/i, /^Peugeot 207i manual/i],
    fallbackCurrentMarket: 1_290_000_000
  },
  {
    id: 'car:207-manual-pano',
    name: 'خودرو — پژو ۲۰۷ دنده‌ای پانوراما (ارتقاء)',
    brandFa: 'ایران‌خودرو',
    marketPriceDec1403: 869_500_000,
    rangeNoteDec1403: '۸۶۸ تا ۸۷۱ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/207.*پانوراما.*دند|207.*دند.*پانوراما|Peugeot 207i Manual P/i],
    fallbackCurrentMarket: 1_395_000_000
  },
  {
    id: 'car:207-auto',
    name: 'خودرو — پژو ۲۰۷ اتوماتیک (سقف فلزی)',
    brandFa: 'ایران‌خودرو',
    marketPriceDec1403: 982_500_000,
    rangeNoteDec1403: '۹۸۲ تا ۹۸۳ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/207\s*اتوماتیک(?!.*پانوراما)|۲۰۷\s*اتوماتیک(?!.*پانوراما)/i, /^Peugeot 207i automatic/i],
    fallbackCurrentMarket: 1_560_000_000
  },
  {
    id: 'car:207-auto-pano',
    name: 'خودرو — پژو ۲۰۷ اتوماتیک پانوراما',
    brandFa: 'ایران‌خودرو',
    marketPriceDec1403: 1_034_000_000,
    rangeNoteDec1403: '۱,۰۲۸ تا ۱,۰۴۰ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/207.*اتومات.*پانوراما|207.*پانوراما.*اتومات|Peugeot 207i Automatic P/i],
    fallbackCurrentMarket: 1_660_000_000
  },

  // ─── ۳. محصولات ایران‌خودرو (ری‌را، هایما، دنا و سورن) ───
  {
    id: 'car:reera-turbo',
    name: 'خودرو — ری‌را توربو اتوماتیک',
    brandFa: 'ایران‌خودرو',
    marketPriceDec1403: 1_675_000_000,
    rangeNoteDec1403: '۱,۶۵۰ تا ۱,۷۰۰ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/ری\s*را|ریرا|reera/i],
    fallbackCurrentMarket: 2_650_000_000
  },
  {
    id: 'car:haima-s5',
    name: 'خودرو — هایما S5 پلاس',
    brandFa: 'ایران‌خودرو',
    marketPriceDec1403: 1_480_000_000,
    rangeNoteDec1403: '۱,۴۷۰ تا ۱,۴۹۰ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/هایما\s*S5/i],
    fallbackCurrentMarket: 4_500_000_000
  },
  {
    id: 'car:haima-s7',
    name: 'خودرو — هایما S7 پلاس',
    brandFa: 'ایران‌خودرو',
    marketPriceDec1403: 1_730_000_000,
    rangeNoteDec1403: '۱,۷۲۰ تا ۱,۷۴۰ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/هایما\s*S7/i],
    fallbackCurrentMarket: 4_950_000_000
  },
  {
    id: 'car:haima-8s',
    name: 'خودرو — هایما 8S',
    brandFa: 'ایران‌خودرو',
    marketPriceDec1403: 2_005_000_000,
    rangeNoteDec1403: '۱,۹۹۰ تا ۲,۰۲۰ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/هایما\s*8S/i],
    fallbackCurrentMarket: 5_800_000_000
  },
  {
    id: 'car:haima-7x',
    name: 'خودرو — هایما 7X',
    brandFa: 'ایران‌خودرو',
    marketPriceDec1403: 1_800_000_000,
    rangeNoteDec1403: '۱,۷۹۰ تا ۱,۸۱۰ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/هایما\s*7X/i],
    fallbackCurrentMarket: 5_200_000_000
  },
  {
    id: 'car:dena-5mt',
    name: 'خودرو — دنا پلاس بورسی (۵ دنده)',
    brandFa: 'ایران‌خودرو',
    marketPriceDec1403: 817_500_000,
    rangeNoteDec1403: '۸۱۵ تا ۸۲۰ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/دنا\s*پلاس.*۵|دنا\s*پلاس\s*ساده|دنا\s*پلاس\s*دند/i],
    fallbackCurrentMarket: 1_310_000_000
  },
  {
    id: 'car:dena-6mt',
    name: 'خودرو — دنا پلاس دستی (۶ سرعته)',
    brandFa: 'ایران‌خودرو',
    marketPriceDec1403: 880_500_000,
    rangeNoteDec1403: '۸۷۹ تا ۸۸۲ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/دنا.*۶\s*سرعته|دنا.*6\s*دنده|دنا.*توربو.*دند/i],
    fallbackCurrentMarket: 1_420_000_000
  },
  {
    id: 'car:dena-turbo-auto',
    name: 'خودرو — دنا پلاس توربو اتوماتیک (آپشنال)',
    brandFa: 'ایران‌خودرو',
    marketPriceDec1403: 1_071_500_000,
    rangeNoteDec1403: '۱,۰۷۰ تا ۱,۰۷۳ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/دنا.*توربو.*اتومات|دنا.*اتوماتیک/i],
    fallbackCurrentMarket: 1_710_000_000
  },
  {
    id: 'car:soren-xu7p',
    name: 'خودرو — سمند سورن پلاس (XU7P)',
    brandFa: 'ایران‌خودرو',
    marketPriceDec1403: 667_000_000,
    rangeNoteDec1403: '۶۶۶ تا ۶۶۸ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/سورن.*XU7P/i],
    fallbackCurrentMarket: 1_090_000_000
  },
  {
    id: 'car:soren-steel-rim',
    name: 'خودرو — سمند سورن پلاس بنزینی (رینگ فولادی)',
    brandFa: 'ایران‌خودرو',
    marketPriceDec1403: 772_000_000,
    rangeNoteDec1403: '۷۷۲ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/سورن.*رینگ\s*فولادی|سورن\s*پلاس\s*بنزینی/i],
    fallbackCurrentMarket: 1_230_000_000
  },
  {
    id: 'car:soren-full',
    name: 'خودرو — سمند سورن پلاس بنزینی (فول)',
    brandFa: 'ایران‌خودرو',
    marketPriceDec1403: 792_000_000,
    rangeNoteDec1403: '۷۹۲ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/سورن\s*پلاس\s*بنزینی|سورن\s*پلاس(?!.*دوگانه)(?!.*XU7)/i],
    fallbackCurrentMarket: 1_260_000_000
  },
  {
    id: 'car:soren-cng-small',
    name: 'خودرو — سمند سورن پلاس دوگانه‌سوز (کپسول کوچک)',
    brandFa: 'ایران‌خودرو',
    marketPriceDec1403: 841_000_000,
    rangeNoteDec1403: '۸۴۱ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/سورن.*دوگانه.*کوچک|سورن.*دوگانه/i],
    fallbackCurrentMarket: 1_340_000_000
  },
  {
    id: 'car:soren-cng-large',
    name: 'خودرو — سمند سورن پلاس دوگانه‌سوز (کپسول بزرگ)',
    brandFa: 'ایران‌خودرو',
    marketPriceDec1403: 855_500_000,
    rangeNoteDec1403: '۸۵۴ تا ۸۵۷ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/سورن.*دوگانه.*بزرگ|سورن.*دوگانه/i],
    fallbackCurrentMarket: 1_360_000_000
  },

  // ─── ۴. محصولات سایپا (شاهین، ساینا و کوییک) ───
  {
    id: 'car:shahin-gl',
    name: 'خودرو — شاهین GL (بدون سانروف)',
    brandFa: 'سایپا',
    marketPriceDec1403: 747_000_000,
    rangeNoteDec1403: '۷۴۵ تا ۷۴۹ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/شاهین\s*GL/i],
    fallbackCurrentMarket: 1_210_000_000
  },
  {
    id: 'car:shahin-g',
    name: 'خودرو — شاهین G (سانروف‌دار)',
    brandFa: 'سایپا',
    marketPriceDec1403: 831_000_000,
    rangeNoteDec1403: '۸۲۲ تا ۸۴۰ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/شاهین\s*G(?!\s*L)|شاهین\s*دند/i],
    fallbackCurrentMarket: 1_340_000_000
  },
  {
    id: 'car:shahin-cvt',
    name: 'خودرو — شاهین اتوماتیک G (CVT)',
    brandFa: 'سایپا',
    marketPriceDec1403: 895_000_000,
    rangeNoteDec1403: '۸۹۰ تا ۹۰۰ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/شاهین\s*اتوماتیک(?!.*پلاس)|شاهین\s*CVT/i],
    fallbackCurrentMarket: 1_460_000_000
  },
  {
    id: 'car:shahin-plus',
    name: 'خودرو — شاهین اتوماتیک پلاس',
    brandFa: 'سایپا',
    marketPriceDec1403: 1_225_000_000,
    rangeNoteDec1403: '۱,۲۱۵ تا ۱,۲۳۵ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/شاهین.*پلاس/i],
    fallbackCurrentMarket: 1_890_000_000
  },
  {
    id: 'car:saina-s',
    name: 'خودرو — ساینا S بنزینی',
    brandFa: 'سایپا',
    marketPriceDec1403: 470_000_000,
    rangeNoteDec1403: '۴۷۰ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/ساینا\s*S(?!\s*دوگانه)(?!\s*اتومات)/i],
    fallbackCurrentMarket: 790_000_000
  },
  {
    id: 'car:saina-glx',
    name: 'خودرو — ساینا GLX',
    brandFa: 'سایپا',
    marketPriceDec1403: 470_000_000,
    rangeNoteDec1403: '۴۷۰ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/ساینا\s*GLX|ساینا\s*دند/i],
    fallbackCurrentMarket: 785_000_000
  },
  {
    id: 'car:saina-cng',
    name: 'خودرو — ساینا S دوگانه‌سوز',
    brandFa: 'سایپا',
    marketPriceDec1403: 542_000_000,
    rangeNoteDec1403: '۵۴۲ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/ساینا.*دوگانه/i],
    fallbackCurrentMarket: 890_000_000
  },
  {
    id: 'car:saina-auto',
    name: 'خودرو — ساینا S اتوماتیک',
    brandFa: 'سایپا',
    marketPriceDec1403: 577_000_000,
    rangeNoteDec1403: '۵۷۷ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/ساینا.*اتومات/i],
    fallbackCurrentMarket: 950_000_000
  },
  {
    id: 'car:quick-s',
    name: 'خودرو — کوییک S',
    brandFa: 'سایپا',
    marketPriceDec1403: 463_000_000,
    rangeNoteDec1403: '۴۵۶ تا ۴۷۰ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/کوییک\s*S(?!\s*R)|کوییک\s*دند/i],
    fallbackCurrentMarket: 775_000_000
  },
  {
    id: 'car:quick-r-s',
    name: 'خودرو — کوییک R تیپ S',
    brandFa: 'سایپا',
    marketPriceDec1403: 470_500_000,
    rangeNoteDec1403: '۴۶۹ تا ۴۷۲ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/کوییک\s*R.*S|کوییک\s*R/i],
    fallbackCurrentMarket: 785_000_000
  },
  {
    id: 'car:quick-gx',
    name: 'خودرو — کوییک GX',
    brandFa: 'سایپا',
    marketPriceDec1403: 476_000_000,
    rangeNoteDec1403: '۴۷۴ تا ۴۷۸ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/کوییک\s*GX(?!R)/i],
    fallbackCurrentMarket: 795_000_000
  },
  {
    id: 'car:quick-gxr',
    name: 'خودرو — کوییک GXR',
    brandFa: 'سایپا',
    marketPriceDec1403: 490_000_000,
    rangeNoteDec1403: '۴۸۹ تا ۴۹۱ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/کوییک\s*GXR/i],
    fallbackCurrentMarket: 825_000_000
  },
  {
    id: 'car:quick-auto',
    name: 'خودرو — کوییک اتوماتیک',
    brandFa: 'سایپا',
    marketPriceDec1403: 627_000_000,
    rangeNoteDec1403: '۶۲۷ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/کوییک.*اتومات/i],
    fallbackCurrentMarket: 1_020_000_000
  },

  // ─── ۵. اطلس، سهند و چانگان (سایپا) ───
  {
    id: 'car:atlas-g',
    name: 'خودرو — اطلس G (دنده‌ای سانروف‌دار)',
    brandFa: 'سایپا',
    marketPriceDec1403: 586_000_000,
    rangeNoteDec1403: '۵۸۲ تا ۵۹۰ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/اطلس\s*G|اطلس/i],
    fallbackCurrentMarket: 980_000_000
  },
  {
    id: 'car:sahand-s',
    name: 'خودرو — سهند S (دنده‌ای)',
    brandFa: 'سایپا',
    marketPriceDec1403: 544_500_000,
    rangeNoteDec1403: '۵۴۳ تا ۵۴۶ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/سهند\s*S|سهند/i],
    fallbackCurrentMarket: 920_000_000
  },
  {
    id: 'car:changan-cs35-t2',
    name: 'خودرو — چانگان CS35 پلاس تیپ ۲ (۲۰۲۴)',
    brandFa: 'سایپا / وارداتی',
    marketPriceDec1403: 1_610_000_000,
    rangeNoteDec1403: '۱,۶۰۰ تا ۱,۶۲۰ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/چانگان\s*CS35.*تیپ\s*2|چانگان\s*CS35\s*پلاس/i],
    fallbackCurrentMarket: 5_000_000_000
  },
  {
    id: 'car:changan-cs35-t3',
    name: 'خودرو — چانگان CS35 پلاس تیپ ۳ فول (۲۰۲۴)',
    brandFa: 'سایپا / وارداتی',
    marketPriceDec1403: 1_712_500_000,
    rangeNoteDec1403: '۱,۶۷۵ تا ۱,۷۵۰ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/چانگان\s*CS35.*تیپ\s*3|چانگان\s*CS35/i],
    fallbackCurrentMarket: 5_300_000_000
  },
  {
    id: 'car:changan-cs55',
    name: 'خودرو — چانگان CS55 پلاس (۲۰۲۴)',
    brandFa: 'سایپا / وارداتی',
    marketPriceDec1403: 2_345_000_000,
    rangeNoteDec1403: '۲,۳۴۵ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/چانگان\s*CS55|CS55/i],
    fallbackCurrentMarket: 6_450_000_000
  },

  // ─── ۶. خودروهای وارداتی (هیوندای النترا و ام‌جی ۵ - تا MG5) ───
  {
    id: 'car:elantra',
    name: 'خودرو — هیوندای النترا (۲۰۲۳/۲۰۲۴)',
    brandFa: 'کرمان‌موتور / وارداتی',
    marketPriceDec1403: 3_400_000_000,
    rangeNoteDec1403: '۳,۳۰۰ تا ۳,۵۰۰ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/النترا|elantra/i],
    fallbackCurrentMarket: 7_800_000_000
  },
  {
    id: 'car:mg5',
    name: 'خودرو — ام‌جی ۵ (MG5)',
    brandFa: 'فرداموتورز / وارداتی',
    marketPriceDec1403: 2_375_000_000,
    rangeNoteDec1403: '۲,۳۰۰ تا ۲,۴۵۰ میلیون تومان (بازار آزاد ۱۱ دی ۱۴۰۳)',
    matchPatterns: [/ام\s*جی\s*5|ام‌جی\s*۵|MG\s*5/i],
    fallbackCurrentMarket: 5_400_000_000
  }
];

/**
 * استخراج قیمت فعلی یک محلهٔ اهواز از Snapshotها یا آگهی‌های زندهٔ اپ دارینو
 */
export function resolveLiveAhvazPropertyPrice(
  key: string,
  snapshots: PropertyMarketSnapshot[],
  listings: PropertyMarketListing[],
  fallback: number
): { price: number; source: string; isLive: boolean } {
  // ۱. بررسی آخرین Snapshot بازار املاک اهواز
  for (let i = snapshots.length - 1; i >= 0; i--) {
    const s = snapshots[i];
    const hit =
      s.groupStats?.find((g) => g.neighborhoodKey === key) ??
      s.neighborhoodStats.find((n) => n.neighborhoodKey === key);
    const ppm = hit?.stats.p75TomanPerM2 ?? hit?.stats.meanTomanPerM2 ?? hit?.stats.medianTomanPerM2;
    if (ppm && ppm > 0 && (hit?.stats.listingCount ?? 0) >= 1) {
      return {
        price: Math.round(ppm),
        source: `بازار املاک دارینو (Snapshot دیوار اهواز — ${s.dateLabel || 'زنده'})`,
        isLive: true
      };
    }
  }

  // ۲. بررسی آگهی‌های زنده ذخیره‌شده در استور املاک اهواز
  const matchingListings = listings
    .filter((l) => areaKeyOf(l.neighborhoodKey) === key && l.pricePerSqmToman && l.pricePerSqmToman > 0)
    .map((l) => l.pricePerSqmToman as number);

  if (matchingListings.length > 0) {
    const p75 = percentile(matchingListings, 75) ?? matchingListings[0];
    return {
      price: Math.round(p75),
      source: `آگهی‌های زندهٔ بازار املاک اهواز در اپ دارینو (${matchingListings.length} آگهی)`,
      isLive: true
    };
  }

  return {
    price: fallback,
    source: 'آخرین نرخ مرجع ثبت‌شده در بازار املاک اهواز دارینو',
    isLive: false
  };
}

/**
 * استخراج قیمت فعلی بازار آزاد یک خودرو از آخرین Snapshot بخش «بازار خودرو»ی اپ دارینو
 * ⚠️ فقط قیمت بازار آزاد (`row.market`) خوانده می‌شود؛ قیمت کارخانه (`row.dealer`) کاملاً نادیده گرفته می‌شود.
 */
export function resolveLiveCarMarketPrice(
  def: HistoricalCarDef,
  snapshots: CarSnapshot[]
): { price: number; year: string | null; source: string; isLive: boolean } {
  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  if (latest && latest.rows.length > 0) {
    // فقط ردیف‌هایی که قیمت بازار آزاد (market !== null) دارند
    const candidates: CarPriceRow[] = [];
    for (const r of latest.rows) {
      if (!r.market || r.market <= 0) continue;
      const text = `${r.model} ${r.option ?? ''} ${r.modelId}`;
      if (def.matchPatterns.some((re) => re.test(text))) {
        candidates.push(r);
      }
    }

    if (candidates.length > 0) {
      // انتخاب جدیدترین سال ساخت که قیمت بازار آزاد دارد
      candidates.sort((a, b) => Number(b.year) - Number(a.year) || (b.marketUpdatedAt ?? 0) - (a.marketUpdatedAt ?? 0));
      const best = candidates[0];
      return {
        price: best.market as number,
        year: best.year,
        source: `بازار خودروی اپ دارینو (قیمت بازار آزاد مدل ${best.year} — بدون قیمت کارخانه)`,
        isLive: true
      };
    }
  }

  return {
    price: def.fallbackCurrentMarket,
    year: null,
    source: 'قیمت بازار آزاد در اپ دارینو (بدون قیمت کارخانه)',
    isLive: false
  };
}

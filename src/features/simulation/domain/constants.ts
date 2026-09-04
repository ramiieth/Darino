/**
 * ============================================================
 *  لایه دامنه — ثابت‌ها و داده‌های مرجع (تنها منبع حقیقت)
 * ============================================================
 *  - موقعیت پایه اتریوم
 *  - ۳۲ رمزارز (شناسه‌های CoinGecko)
 *  - قیمت مرجع ۱ ژانویه ۲۰۲۵ (بازه ۱)
 *  - قیمت مرجع ۱ ژوئیه ۲۰۲۶ (بازه ۲)
 *  - ۱۳۴ سهام توکن‌ایز (مرجع ژوئیه ۲۰۲۶)
 *  - سبد دارایی‌های سنتی آمریکا (سهام / ETF / اوراق / کالا)
 *  - موتور فالبک اسنپ‌شات
 * ============================================================
 */

/* ================= ETH Base Setup ================= */
export const ETH_POSITION = {
  AMOUNT: 3.33,
  BUY_PRICE: 2820.0,
  INITIAL_INVESTMENT: 9390.6,
  USDC_ALLOCATION_2026: 23126.0,
  ETH_REF_JULY_2026: 1575.0
} as const;

/** سرمایه پایه بازه ۱ (سرمایه اولیه ETH + باقی‌مانده USDC) */
export const BASE_CAPITAL_2025 = 32_516.6;
/** سرمایه پایه بازه ۲ (تخصیص USDC) */
export const BASE_CAPITAL_2026 = 23_126.0;

/* ================= 1. All Crypto Coins (32 Coins) ================= */
/** CoinGecko id → نماد */
export const COINS: Record<string, string> = {
  ethereum: 'ETH',
  bitcoin: 'BTC',
  solana: 'SOL',
  binancecoin: 'BNB',
  ripple: 'XRP',
  sui: 'SUI',
  'tether-gold': 'XAUT',
  'pax-gold': 'PAXG',
  hyperliquid: 'HYPE',
  ethena: 'ENA',
  cardano: 'ADA',
  aptos: 'APT',
  toncoin: 'TON',
  pepe: 'PEPE',
  dogecoin: 'DOGE',
  avalanche: 'AVAX',
  stellar: 'XLM',
  'shiba-inu': 'SHIB',
  chainlink: 'LINK',
  solstice: 'SLX',
  zcash: 'ZEC',
  litecoin: 'LTC',
  near: 'NEAR',
  ondo: 'ONDO',
  mantle: 'MNT',
  morpho: 'MORPHO',
  lighter: 'LIT',
  arbitrum: 'ARB',
  'ether-fi': 'ETHFI',
  pendle: 'PENDLE',
  uniswap: 'UNI',
  aave: 'AAVE'
};

/** نام فارسی رمزارزها */
export const COIN_NAMES_FA: Record<string, string> = {
  ethereum: 'اتریوم',
  bitcoin: 'بیت‌کوین',
  solana: 'سولانا',
  binancecoin: 'بایننس کوین',
  ripple: 'ریپل',
  sui: 'سویی',
  'tether-gold': 'تتر گلد (XAUT)',
  'pax-gold': 'پکس گلد (PAXG)',
  hyperliquid: 'هایپرلیکوئید',
  ethena: 'اتنا',
  cardano: 'کاردانو',
  aptos: 'آپتوس',
  toncoin: 'تون‌کوین',
  pepe: 'پپه',
  dogecoin: 'دوج‌کوین',
  avalanche: 'آوالانچ',
  stellar: 'استلار',
  'shiba-inu': 'شیبا اینو',
  chainlink: 'چین‌لینک',
  solstice: 'سولستیس',
  zcash: 'زدکش',
  litecoin: 'لایت‌کوین',
  near: 'نیر',
  ondo: 'اندو',
  mantle: 'منتل',
  morpho: 'مورفو',
  lighter: 'لایتر',
  arbitrum: 'آربیتروم',
  'ether-fi': 'اتر‌فای',
  pendle: 'پندل',
  uniswap: 'یونی‌سواپ',
  aave: 'آوه'
};

/* ================= 2. Jan 1, 2025 Crypto Prices Reference ================= */
export const JAN_1_2025_PRICES: Record<string, number> = {
  ethereum: 3335,
  bitcoin: 93500,
  solana: 189,
  binancecoin: 701,
  ripple: 2.08,
  sui: 4.01,
  'tether-gold': 2622,
  'pax-gold': 2622,
  hyperliquid: 26.15,
  ethena: 0.9,
  cardano: 0.84,
  aptos: 9.27,
  toncoin: 5.49,
  pepe: 0.00001998,
  dogecoin: 0.316,
  avalanche: 31.67,
  stellar: 0.332,
  'shiba-inu': 0.00002117,
  chainlink: 20,
  zcash: 56,
  litecoin: 111,
  near: 5.28,
  ondo: 1.46,
  mantle: 1.25,
  morpho: 3.37,
  arbitrum: 0.74,
  'ether-fi': 2.18,
  pendle: 5.2,
  uniswap: 13.59,
  aave: 319
};
// توجه: solstice و lighter در ۱ ژانویه ۲۰۲۵ وجود نداشتند → ردیف N/A
// (ردیف حفظ می‌شود، محاسبه نمی‌شود)

/* ================= 3. July 1, 2026 Crypto Prices Reference ================= */
export const JULY_1_2026_PRICES: Record<string, number> = {
  ethereum: 1575,
  bitcoin: 58690,
  solana: 73.37,
  binancecoin: 548.7,
  ripple: 1.05,
  sui: 0.71,
  'tether-gold': 4002,
  'pax-gold': 3989,
  hyperliquid: 64.69,
  ethena: 0.072,
  cardano: 0.1548,
  aptos: 0.5832,
  toncoin: 1.55,
  pepe: 0.00000229,
  dogecoin: 0.072,
  avalanche: 6.51,
  stellar: 0.182,
  'shiba-inu': 0.00000419,
  chainlink: 7.2,
  solstice: 0.52,
  zcash: 401,
  litecoin: 41.86,
  near: 1.79,
  ondo: 0.318,
  mantle: 0.4169,
  morpho: 1.9,
  lighter: 1.9,
  arbitrum: 0.074,
  'ether-fi': 0.32,
  pendle: 1.32,
  uniswap: 2.82,
  aave: 86
};

/* ================= 4. All 134 Tokenized Stock Prices (July 1, 2026 Baseline) ================= */
export const TOKENIZED_STOCK_PRICES: Record<string, number> = {
  AALON: 18.19,
  AAPLON: 295.11,
  AAPLX: 294.91,
  ABNBON: 146.67,
  ABTON: 93.42,
  ACNON: 133.81,
  ADBEON: 210.95,
  AMATON: 657.58,
  AMDON: 543.75,
  AMDX: 549.92,
  AMZNON: 242.38,
  AMZNX: 242.56,
  ARMON: 335.72,
  ASMLON: 1853.42,
  ASTSON: 86.41,
  AVGOON: 370.86,
  AXPON: 347.88,
  BABAON: 98.14,
  BACON: 58.48,
  BAON: 217.97,
  BIDUON: 118.02,
  BLKON: 983.65,
  BMNRON: 14.19,
  'BRK.BX': 499.52,
  BSPX: 34.56,
  CMGON: 34.88,
  COHRON: 367.71,
  COINON: 159.72,
  COINX: 159.55,
  COSTON: 932.1,
  CRCLB: 62.43,
  CRCLON: 62.26,
  CRCLX: 62.34,
  CRWVON: 86.3,
  CSCOON: 118.04,
  CVXON: 169.35,
  DELLON: 423.27,
  DISON: 96.82,
  EQIXON: 1021.38,
  ETNON: 413.51,
  FIGON: 19.46,
  FUTUON: 101.48,
  GEON: 324.6,
  GLWON: 219.75,
  GOOGLON: 360.35,
  GOOGLX: 360.76,
  GSON: 1034.53,
  HIMSON: 37.3,
  HOODON: 107.62,
  HOODX: 108.02,
  IBMON: 290.85,
  INTCON: 127.26,
  INTCX: 129.81,
  INTUON: 271.09,
  IRENON: 43.39,
  JDON: 27.14,
  JNJON: 254.66,
  JPMON: 336.55,
  KOON: 82.86,
  LINON: 540.04,
  LITEON: 802.0,
  LLYON: 1192.26,
  LMTON: 530.38,
  MAON: 525.3,
  MCDON: 273.89,
  MELION: 1731.46,
  METAON: 612.25,
  METAX: 613.42,
  MRKON: 126.39,
  MRVLON: 270.6,
  MRVLX: 276.5,
  MSFTON: 386.01,
  MSFTX: 386.6,
  MSTRON: 94.35,
  MSTRX: 94.78,
  MUB: 1020.0,
  MUON: 1019.49,
  NBISB: 216.73,
  NBISON: 230.2,
  NEMON: 93.78,
  NFLXON: 742.85,
  NKEON: 43.59,
  NOWON: 521.75,
  NVDAB: 197.21,
  NVDAON: 197.11,
  NVDAX: 197.2,
  NVOON: 49.73,
  OKLOON: 52.71,
  ORCLON: 144.69,
  OXYON: 48.12,
  PANWON: 352.04,
  PBRON: 16.5,
  PDDON: 82.24,
  PEPON: 144.55,
  PFEON: 25.0,
  PGON: 149.56,
  PLTRON: 125.28,
  PLTRX: 127.3,
  PYPLON: 44.47,
  QBTSON: 23.45,
  QCOMB: 184.25,
  QCOMON: 184.37,
  QQQB: 734.16,
  RDDTON: 195.6,
  RDWON: 11.96,
  RKLBON: 99.78,
  SBUXON: 104.3,
  SCCOON: 170.86,
  SHOPON: 120.77,
  SMCION: 27.87,
  SNDKB: 2017.58,
  SNDKON: 2012.27,
  SNDKX: 2076.26,
  SNOWON: 259.65,
  SOFION: 18.4,
  SPCXB: 157.93,
  SPCXON: 157.82,
  SPCXX: 157.88,
  SPGION: 437.81,
  SPOTON: 476.07,
  STRCX: 89.96,
  TMON: 171.94,
  TSLAB: 423.83,
  TSLAON: 422.61,
  TSLAX: 422.7,
  TSMON: 451.61,
  TXNON: 298.35,
  UBERON: 72.81,
  UNHON: 434.09,
  VON: 350.62,
  WDCON: 596.99,
  WFCON: 86.63,
  WMTON: 108.26,
  WOLFON: 44.98,
  XOMON: 138.24
};

/* ================= 5. Offline Price Snapshot (Fallback Engine) ================= */
/**
 * موتور فالبک: اگر API زنده در دسترس نبود (429/آفلاین/ناموجود)
 * ابتدا از این نقشه استفاده می‌شود و فقط در نبود ورودی، "N/A".
 * شامل: رمزارزها (ژوئیه ۲۰۲۶) + ۱۳۵ سهام توکن‌ایز + دارایی‌های سنتی (مرجع ژوئیه ۲۰۲۶)
 */

/* ================= 6. Traditional US Assets (Stocks / ETFs / Bonds / Commodities) ================= */

export interface TradFiEntry {
  symbol: string;
  nameFa: string;
  kind: 'stock' | 'etf' | 'bond' | 'commodity' | 'index';
  /** قیمت مرجع نزدیک ۱ ژانویه ۲۰۲۵ (واقعی ≈) */
  jan2025: number;
  /** قیمت مرجع ۱ ژوئیه ۲۰۲۶ (تخمین سازگار با قیمت‌های توکن‌ایز — قابل ویرایش) */
  jul2026: number;
  /** اگر true، مقدار یک درصد بازده است (اوراق دولتی) — نه قیمت دلاری */
  isYield?: boolean;
}

export const TRADFI_ASSETS: TradFiEntry[] = [
  /* ---------- سهام بزرگ ---------- */
  { symbol: 'AAPL', nameFa: 'اپل', kind: 'stock', jan2025: 250.42, jul2026: 295.11 },
  { symbol: 'MSFT', nameFa: 'مایکروسافت', kind: 'stock', jan2025: 421.46, jul2026: 386.01 },
  { symbol: 'GOOGL', nameFa: 'آلفابت (گوگل)', kind: 'stock', jan2025: 187.35, jul2026: 360.35 },
  { symbol: 'AMZN', nameFa: 'آمازون', kind: 'stock', jan2025: 219.39, jul2026: 242.38 },
  { symbol: 'NVDA', nameFa: 'انویدیا', kind: 'stock', jan2025: 134.29, jul2026: 197.11 },
  { symbol: 'TSLA', nameFa: 'تسلا', kind: 'stock', jan2025: 403.84, jul2026: 422.61 },
  { symbol: 'META', nameFa: 'متا', kind: 'stock', jan2025: 597.28, jul2026: 612.25 },
  { symbol: 'NFLX', nameFa: 'نتفلیکس', kind: 'stock', jan2025: 888.21, jul2026: 742.85 },
  { symbol: 'AMD', nameFa: 'ای‌ام‌دی', kind: 'stock', jan2025: 117.28, jul2026: 543.75 },
  { symbol: 'INTC', nameFa: 'اینتل', kind: 'stock', jan2025: 19.85, jul2026: 127.26 },
  { symbol: 'ORCL', nameFa: 'اوراکل', kind: 'stock', jan2025: 161.7, jul2026: 144.69 },
  { symbol: 'CRM', nameFa: 'سيلزفورس', kind: 'stock', jan2025: 256.6, jul2026: 250.0 },
  { symbol: 'CSCO', nameFa: 'سیسکو', kind: 'stock', jan2025: 58.12, jul2026: 118.04 },
  { symbol: 'JPM', nameFa: 'جی‌پی مورگان', kind: 'stock', jan2025: 239.83, jul2026: 336.55 },
  { symbol: 'BAC', nameFa: 'بنک آو امریکا', kind: 'stock', jan2025: 43.33, jul2026: 58.48 },
  { symbol: 'WFC', nameFa: 'ولز فارگو', kind: 'stock', jan2025: 70.29, jul2026: 86.63 },
  { symbol: 'GS', nameFa: 'گلدمن ساکس', kind: 'stock', jan2025: 562.37, jul2026: 700.0 },
  { symbol: 'MS', nameFa: 'مورگان استنلی', kind: 'stock', jan2025: 126.85, jul2026: 130.0 },
  { symbol: 'V', nameFa: 'ویزا', kind: 'stock', jan2025: 311.72, jul2026: 350.62 },
  { symbol: 'MA', nameFa: 'مسترکارت', kind: 'stock', jan2025: 513.31, jul2026: 525.3 },
  { symbol: 'UNH', nameFa: 'یونایتدهلث', kind: 'stock', jan2025: 511.28, jul2026: 434.09 },
  { symbol: 'XOM', nameFa: 'اکسون‌موبیل', kind: 'stock', jan2025: 107.31, jul2026: 138.24 },
  { symbol: 'JNJ', nameFa: 'جانسون اند جانسون', kind: 'stock', jan2025: 144.68, jul2026: 254.66 },
  { symbol: 'WMT', nameFa: 'وال‌مارت', kind: 'stock', jan2025: 90.35, jul2026: 108.26 },
  { symbol: 'PG', nameFa: 'پراکتر اند گمبل', kind: 'stock', jan2025: 164.39, jul2026: 149.56 },
  { symbol: 'KO', nameFa: 'کوکاکولا', kind: 'stock', jan2025: 63.5, jul2026: 82.86 },
  { symbol: 'MCD', nameFa: 'مک‌دونالد', kind: 'stock', jan2025: 280.66, jul2026: 273.89 },
  { symbol: 'DIS', nameFa: 'دیزنی', kind: 'stock', jan2025: 109.47, jul2026: 96.82 },
  { symbol: 'GE', nameFa: 'جنرال الکتریک', kind: 'stock', jan2025: 162.66, jul2026: 324.6 },
  { symbol: 'LMT', nameFa: 'لاکهید مارتین', kind: 'stock', jan2025: 497.11, jul2026: 530.38 },
  { symbol: 'BA', nameFa: 'بوئینگ', kind: 'stock', jan2025: 177.32, jul2026: 217.97 },
  { symbol: 'CAT', nameFa: 'کاترپیلار', kind: 'stock', jan2025: 362.42, jul2026: 420.0 },
  { symbol: 'DE', nameFa: 'دیر اند کمپانی', kind: 'stock', jan2025: 410.1, jul2026: 390.0 },
  { symbol: 'T', nameFa: 'AT&T', kind: 'stock', jan2025: 22.53, jul2026: 25.0 },
  { symbol: 'VZ', nameFa: 'ورایزن', kind: 'stock', jan2025: 39.4, jul2026: 42.0 },

  /* ---------- ETF های شاخص ---------- */
  { symbol: 'SPY', nameFa: 'اس‌پی‌دی‌آر اس‌اند‌پی ۵۰۰', kind: 'etf', jan2025: 585.81, jul2026: 740.0 },
  { symbol: 'QQQ', nameFa: 'اینوسکو نزدک ۱۰۰', kind: 'etf', jan2025: 511.53, jul2026: 655.0 },
  { symbol: 'DIA', nameFa: 'اس‌پی‌دی‌آر داوجونز', kind: 'etf', jan2025: 424.6, jul2026: 480.0 },
  { symbol: 'IWM', nameFa: 'آی‌شیرز راسل ۲۰۰۰', kind: 'etf', jan2025: 222.2, jul2026: 235.0 },
  { symbol: 'VTI', nameFa: 'وانگارد توتال', kind: 'etf', jan2025: 292.7, jul2026: 370.0 },
  { symbol: 'VOO', nameFa: 'وانگارد اس‌اند‌پی ۵۰۰', kind: 'etf', jan2025: 538.9, jul2026: 680.0 },
  { symbol: 'EFA', nameFa: 'آی‌شیرز اروپا/اقیانوسیه', kind: 'etf', jan2025: 81.8, jul2026: 85.0 },
  { symbol: 'EEM', nameFa: 'آی‌شیرز بازارهای نوظهور', kind: 'etf', jan2025: 43.75, jul2026: 45.0 },
  { symbol: 'XLK', nameFa: 'سکتور فناوری', kind: 'etf', jan2025: 243.7, jul2026: 300.0 },
  { symbol: 'XLF', nameFa: 'سکتور مالی', kind: 'etf', jan2025: 51.15, jul2026: 60.0 },
  { symbol: 'XLE', nameFa: 'سکتور انرژی', kind: 'etf', jan2025: 98.4, jul2026: 105.0 },
  { symbol: 'XLV', nameFa: 'سکتور سلامت', kind: 'etf', jan2025: 150.8, jul2026: 170.0 },

  /* ---------- اوراق ---------- */
  { symbol: 'TLT', nameFa: 'اوراق ۲۰+ سال خزانه', kind: 'bond', jan2025: 87.93, jul2026: 85.0 },
  { symbol: 'IEF', nameFa: 'اوراق ۷-۱۰ سال خزانه', kind: 'bond', jan2025: 92.25, jul2026: 90.0 },
  { symbol: 'LQD', nameFa: 'اوراق شرکتی درجه سرمایه‌گذاری', kind: 'bond', jan2025: 112.33, jul2026: 108.0 },
  { symbol: 'HYG', nameFa: 'اوراق پرریسک شرکتی', kind: 'bond', jan2025: 77.8, jul2026: 75.0 },

  /* ---------- کالا ---------- */
  { symbol: 'GLD', nameFa: 'طلا (صندوق GLD)', kind: 'commodity', jan2025: 258.32, jul2026: 401.0 },
  { symbol: 'SLV', nameFa: 'نقره (صندوق SLV)', kind: 'commodity', jan2025: 28.85, jul2026: 44.0 },
  { symbol: 'USO', nameFa: 'نفت خام (صندوق USO)', kind: 'commodity', jan2025: 75.16, jul2026: 68.0 },
  { symbol: 'UNG', nameFa: 'گاز طبیعی (صندوق UNG)', kind: 'commodity', jan2025: 17.2, jul2026: 16.0 },
  { symbol: 'CPER', nameFa: 'مس (صندوق CPER)', kind: 'commodity', jan2025: 25.31, jul2026: 27.0 },
  { symbol: 'DBA', nameFa: 'کشاورزی (صندوق DBA)', kind: 'commodity', jan2025: 25.61, jul2026: 24.0 },
  { symbol: 'PPLT', nameFa: 'پلاتین (صندوق PPLT)', kind: 'commodity', jan2025: 92.5, jul2026: 140.0 },
  { symbol: 'PALL', nameFa: 'پالادیوم (صندوق PALL)', kind: 'commodity', jan2025: 123.5, jul2026: 160.0 },

  /* ---------- کالاهای مستقیم (Alpha Vantage: WTI/BRENT/NG روزانه، بقیه ماهانه) ---------- */
  { symbol: 'WTI', nameFa: 'نفت خام وست تگزاس (WTI)', kind: 'commodity', jan2025: 73.13, jul2026: 85.0 },
  { symbol: 'BRENT', nameFa: 'نفت خام برنت (Brent)', kind: 'commodity', jan2025: 76.5, jul2026: 92.0 },
  { symbol: 'NG', nameFa: 'گاز طبیعی هنری هاب', kind: 'commodity', jan2025: 3.3, jul2026: 2.75 },
  { symbol: 'COPPER', nameFa: 'مس (هر تن متري)', kind: 'commodity', jan2025: 9050, jul2026: 13550 },
  { symbol: 'CORN', nameFa: 'ذرت (هر تن متري)', kind: 'commodity', jan2025: 177, jul2026: 196 },
  { symbol: 'WHEAT', nameFa: 'گندم (هر تن متري)', kind: 'commodity', jan2025: 195, jul2026: 200 },
  { symbol: 'COFFEE', nameFa: 'قهوه (سنت بر پوند)', kind: 'commodity', jan2025: 310, jul2026: 308 },
  { symbol: 'SUGAR', nameFa: 'شکر (سنت بر پوند)', kind: 'commodity', jan2025: 19, jul2026: 13.9 },

  /* ---------- شاخص‌های جهانی (نماینده ETF — Alpha Vantage GLOBAL_QUOTE) ---------- */
  { symbol: 'EWJ', nameFa: 'نیککی ۲۲۵ ژاپن (EWJ)', kind: 'index', jan2025: 73.0, jul2026: 94.6 },
  { symbol: 'EWG', nameFa: 'دکس آلمان (EWG)', kind: 'index', jan2025: 32.5, jul2026: 43.8 },
  { symbol: 'EWU', nameFa: 'FTSE 100 بریتانیا (EWU)', kind: 'index', jan2025: 38.5, jul2026: 48.3 },

  /* ---------- بازده اوراق دولتی آمریکا (TREASURY_YIELD — نمایش درصدی) ---------- */
  { symbol: 'US2Y', nameFa: 'اوراق ۲ ساله خزانه‌داری', kind: 'bond', jan2025: 4.24, jul2026: 4.25, isYield: true },
  { symbol: 'US10Y', nameFa: 'اوراق ۱۰ ساله خزانه‌داری', kind: 'bond', jan2025: 4.57, jul2026: 4.7, isYield: true },
  { symbol: 'US30Y', nameFa: 'اوراق ۳۰ ساله خزانه‌داری', kind: 'bond', jan2025: 4.78, jul2026: 5.23, isYield: true }
];

/** نقشه قیمت مرجع ۲۰۲۵ دارایی‌های سنتی */
export const TRADFI_JAN_2025: Record<string, number> = Object.fromEntries(
  TRADFI_ASSETS.map((a) => [a.symbol, a.jan2025])
);

/** نقشه قیمت مرجع ۲۰۲۶ دارایی‌های سنتی */
export const TRADFI_JUL_2026: Record<string, number> = Object.fromEntries(
  TRADFI_ASSETS.map((a) => [a.symbol, a.jul2026])
);

/* ================= 5b. Offline Price Snapshot (Fallback Engine) ================= */
export const PRICE_SNAPSHOT_FALLBACK: Record<string, number> = {
  ...JULY_1_2026_PRICES,
  ...TOKENIZED_STOCK_PRICES,
  ...TRADFI_JUL_2026
};

/** همه نمادهای سنتی برای چرخه به‌روزرسانی Alpha Vantage */
export const TRADFI_SYMBOLS: string[] = TRADFI_ASSETS.map((a) => a.symbol);

/** نام فارسی دارایی سنتی */
export const TRADFI_NAMES: Record<string, string> = Object.fromEntries(
  TRADFI_ASSETS.map((a) => [a.symbol, a.nameFa])
);

/* ================= 7. نام‌های سهام توکن‌ایز ================= */
const TOKEN_UNDERLYING: Record<string, string> = {
  AAL: 'امریکن ایرلاینز',
  AAPL: 'اپل',
  ABNB: 'ایرbnb',
  ABT: 'آبوت',
  ACN: 'اکسچنچر',
  ADBE: 'ادوبی',
  AMAT: 'اپلاید متریالز',
  AMD: 'ای‌ام‌دی',
  AMZN: 'آمازون',
  ARM: 'آرم هولدینگز',
  ASML: 'ای‌اس‌ام‌ال',
  ASTS: 'ای‌اس‌تی‌اس',
  AVGO: 'برودکام',
  AXP: 'امریکن اکسپرس',
  BABA: 'علی‌بابا',
  BAC: 'بنک آو امریکا',
  BA: 'بوئینگ',
  BIDU: 'بایدو',
  BLK: 'بلک‌راک',
  BMNR: 'بیت‌ماینر',
  BRK: 'برکشایر هاتاوی',
  BS: 'بی‌اس‌پی‌اکس',
  CMG: 'چیپوتل',
  COHR: 'کوهرنت',
  COIN: 'کوین‌بیس',
  COST: 'کاستکو',
  CRCL: 'سرکل',
  CRWV: 'کراداسترایک',
  CSCO: 'سیسکو',
  CVX: 'شورون',
  DELL: 'دل',
  DIS: 'دیزنی',
  EQIX: 'اکوینیکس',
  ETN: 'ایتون',
  FIG: 'فیگ',
  FUTU: 'فوتو',
  GE: 'جنرال الکتریک',
  GLW: 'کورنینگ',
  GOOGL: 'آلفابت',
  GS: 'گلدمن ساکس',
  HIMS: 'هیمز اند هرز',
  HOOD: 'رابین‌هود',
  IBM: 'آی‌بی‌ام',
  INTC: 'اینتل',
  INTU: 'اینتویت',
  IREN: 'ایرن',
  JD: 'جیدی‌دات‌کام',
  JNJ: 'جانسون اند جانسون',
  JPM: 'جی‌پی مورگان',
  KO: 'کوکاکولا',
  LIN: 'لینده',
  LITE: 'لایت‌تر',
  LLY: 'ایلی لیلی',
  LMT: 'لاکهید مارتین',
  MA: 'مسترکارت',
  MCD: 'مک‌دونالد',
  MELI: 'مرکادولیبره',
  META: 'متا',
  MRK: 'مرک',
  MRVL: 'مارول',
  MSFT: 'مایکروسافت',
  MSTR: 'مایکرواستراتژی',
  MU: 'مایکرون',
  NBIS: 'نبیس',
  NEM: 'نیومانت',
  NFLX: 'نتفلیکس',
  NKE: 'نایکی',
  NOW: 'سرویس‌ناو',
  NVDA: 'انویدیا',
  NVO: 'نووو نوردیسک',
  OKLO: 'اوکلو',
  ORCL: 'اوراکل',
  OXY: 'اکسیدنتال',
  PANW: 'پالو آلتو',
  PBR: 'پتروبراس',
  PDD: 'PDD هولدینگز',
  PEP: 'پپسی‌کو',
  PFE: 'فایزر',
  PG: 'پراکتر اند گمبل',
  PLTR: 'پلانیتیر',
  PYPL: 'پی‌پال',
  QBTS: 'کوانتوم بریلینگ',
  QCOM: 'کوالکام',
  RDDT: 'ردیت',
  RDW: 'ردوایر',
  RKLB: 'راکت لب',
  SBUX: 'استارباکس',
  SCCO: 'ساوثرن کاپر',
  SHOP: 'شاپیفای',
  SMCI: 'سوپرمایکرو',
  SNDK: 'سندیسک',
  SNOW: 'اسنوفلیک',
  SOFI: 'سوفای',
  SPCX: 'اسپیس‌ایکس',
  SPGI: 'اس‌اند‌پی گلوبال',
  SPOT: 'اسپاتیفای',
  STRC: 'استارک',
  TM: 'تویوتا',
  TSLA: 'تسلا',
  TSM: 'تی‌اس‌ام‌سی',
  TXN: 'تگزاس اینسترومنتز',
  UBER: 'اوبر',
  UNH: 'یونایتدهلث',
  V: 'ویزا',
  WDC: 'وسترن دیجیتال',
  WFC: 'ولز فارگو',
  WMT: 'وال‌مارت',
  WOLF: 'ولفسپید',
  XOM: 'اکسون‌موبیل'
};

/** استخراج نماد پایه از نماد توکن‌ایز (حذف پسوند ON/X/B) */
function underlyingOf(tokenSymbol: string): string {
  let s = tokenSymbol.replace(/\./g, '');
  s = s.replace(/(ON|X|B)$/, '');
  if (s === 'BRK') return 'BRK';
  return s;
}

export const TOKENIZED_NAMES: Record<string, string> = Object.fromEntries(
  Object.keys(TOKENIZED_STOCK_PRICES).map((sym) => {
    const base = underlyingOf(sym);
    const name = TOKEN_UNDERLYING[base] ?? base;
    return [sym, `${name} (توکن‌ایز)`];
  })
);

/** آمار صحت پوشش داده */
export const COVERAGE = {
  coinCount: Object.keys(COINS).length,
  tokenizedCount: Object.keys(TOKENIZED_STOCK_PRICES).length,
  tradfiCount: TRADFI_ASSETS.length
};

/* ================= 8. اولویت بازخوانی سهام (سهمیه ۲۵/روز/کلید آلفا وانتج) ================= */
/**
 * ترتیب بازخوانی: شاخص‌ها → اوراق → کالاها → سهام بزرگ → بقیه
 * با ۵ کلید (۱۱۰ درخواست/روز) همه ۷۳ نماد روزانه زنده می‌شوند.
 */
export const TRADFI_PRIORITY: string[] = [
  /* شاخص‌ها و ETF نماینده */
  'SPY', 'QQQ', 'DIA', 'IWM', 'EWJ', 'EWG', 'EWU',
  /* اوراق دولتی */
  'US10Y', 'US2Y', 'US30Y', 'TLT', 'IEF', 'LQD', 'HYG',
  /* کالاها */
  'GLD', 'SLV', 'PPLT', 'WTI', 'BRENT', 'NG', 'COPPER', 'CORN', 'WHEAT',
  'COFFEE', 'SUGAR', 'USO', 'UNG', 'CPER', 'DBA', 'PALL',
  /* ETF بازار */
  'VTI', 'VOO', 'EFA', 'EEM', 'XLK', 'XLF', 'XLE', 'XLV',
  /* سهام بزرگ */
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'TSLA', 'META', 'JPM', 'XOM', 'V', 'MA',
  'UNH', 'WMT', 'JNJ', 'PG', 'KO', 'MCD', 'DIS', 'GE', 'CAT', 'BA', 'LMT', 'GS', 'MS',
  'BAC', 'WFC', 'T', 'VZ', 'INTC', 'AMD', 'ORCL', 'CRM', 'CSCO', 'NFLX', 'DE'
];

/* ================= 9. نمادهای بازده اوراق (نمایش درصدی) ================= */
export const YIELD_SYMBOLS: string[] = ['US2Y', 'US10Y', 'US30Y'];

export function isYieldSymbol(symbol: string): boolean {
  return YIELD_SYMBOLS.includes(symbol);
}

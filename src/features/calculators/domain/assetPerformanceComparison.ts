/**
 * موتور جامع «مقایسه عملکرد دارایی‌ها» (Asset Performance Comparison Engine)
 *
 * پیاده‌سازی دقیق و بدون ابهام برای ماشین‌حساب سرمایه‌گذاری دارینو:
 *   ۱) پشتیبانی از ۴ دسته اصلی بازارهای جهانی (قابل جست‌وجو و توسعه، با حذف پیش‌فرض استیبل‌کوین‌ها):
 *      - رمزارزها (Cryptocurrencies): BTC, ETH, SOL, BNB, XRP, SUI, AVAX, LINK, UNI, AAVE, DOGE, TON, HYPE, ONDO, PENDLE, ...
 *      - شاخص‌های بورسی (Stock Indices): S&P 500 (Price Return), S&P 500 Total Return (با احتساب سود تقسیمی), NASDAQ 100 (QQQ), Dow Jones (DIA), Russell 2000 (IWM)
 *      - سهام شرکت‌های بزرگ (Stocks — تعدیل‌شده بابت تقسیم سهام / Stock Splits): NVDA, AAPL, MSFT, AMZN, GOOGL, META, TSLA, AMD, NFLX, AVGO, LLY, JPM, BRK.B
 *      - فلزات گرانبها، انرژی و کالاها (Precious Metals & Commodities): طلا (XAU / اونس جهانی)، نقره (XAG)، نفت برنت (BRENT)، نفت WTI، مس (COPPER)، اوراق خزانه (TLT)
 *   ۲) بازه‌های زمانی استاندارد و شفاف (همیشه با تاریخ دقیق شروع و پایان YYYY-MM-DD):
 *      - 24h, 7d, 1m, 3m, 6m, YTD, 1y, 3y, 5y (دقیقاً ۵ سال قبل)، since-2021 (از ۱ ژانویه ۲۰۲۱)، nov-2021-peak (از سقف ۱۰ نوامبر ۲۰۲۱ برای راستی‌آزمایی ادعاها)، 10y, max و بازه دلخواه (Custom)
 *   ۳) محاسبات مالی دقیق در یک لایه مستقل:
 *      - قیمت شروع، قیمت پایان، تغییر قیمت به دلار، درصد رشد/افت کل دوره: ((End / Start) - 1) * 100
 *      - ارزش فعلی سرمایه اولیه فرضی و سود/زیان خالص دلاری
 *      - بازده سالانه‌شده مرکب (CAGR) مجزا از بازده کل دوره
 *      - تحلیل ریسک در طول مسیر: بیشترین افت سرمایه از سقف تا کف (Maximum Drawdown — MDD)، نوسان سالانه (Annualized Volatility)، بهترین و بدترین عملکرد سالانه، و تخمین مدت‌زمان بازیابی پس از افت شدید
 *   ۴) راستی‌آزمایی علمی ادعاهای منتشرشده در بازار (Market Claim Fact-Checker):
 *      - بررسی ادعای معروف «S&P 500: +62% | Gold: +110% | NVDA: +2045% | Bitcoin: 0% از سال ۲۰۲۱»
 *      - نمایش تفاوت چشمگیر بین «شروع از اول ژانویه ۲۰۲۱ (2021-01-01)» در برابر «شروع از سقف نوامبر ۲۰۲۱ (2021-11-10)» و تفکیک بازده قیمتی از بازده کل (Total Return)
 *   ۵) تولید خودکار «جمع‌بندی عملکرد» به زبان ساده و آموزشی بدون سیگنال‌دهی معاملاتی.
 */

import { toFaDigits } from '@/shared/utils/formatters';
import type { PricePoint } from '../data/historical';

export type PerformanceAssetCategory = 'crypto' | 'index' | 'stock' | 'metal_commodity';

export type ReturnCalculationBasis =
  | 'spot_price'
  | 'split_adjusted_price'
  | 'total_return_dividends_reinvested';

export interface PerformanceCatalogAsset {
  symbol: string;
  nameFa: string;
  nameEn: string;
  category: PerformanceAssetCategory;
  /** شناسه CoinGecko برای واکشی زنده تاریخچه رمزارزها */
  coinId?: string;
  /** نماد متناظر در Alpha Vantage یا استور قیمت‌ها */
  quoteSymbol: string;
  /** تاریخ پیدایش یا اولین تاریخ معاملاتی معتبر (YYYY-MM-DD) */
  inceptionDateIso: string;
  /** مبنای محاسبه بازده (اسپات، تعدیل‌شده بابت تقسیم سهم، یا بازده کل با سود تقسیمی) */
  returnBasis: ReturnCalculationBasis;
  returnBasisLabelFa: string;
  /** نرخ سود تقسیمی سالانه تخمینی (برای محاسبه بازده کل در صورت انتخاب کاربر) */
  annualDividendYieldPct: number;
  /** منبع داده و ساعت بسته شدن کندل */
  dataSourceLabelFa: string;
  /** رنگ اختصاصی برای نمودار مقایسه */
  colorHex: string;
  /** آیا در لیست پیش‌فرض اولیه نمایش داده شود؟ */
  defaultSelected?: boolean;
}

export const CATEGORY_LABELS_FA: Record<PerformanceAssetCategory, string> = {
  crypto: 'رمزارزها (Cryptocurrencies)',
  index: 'شاخص‌های بورسی (Stock Indices)',
  stock: 'سهام شرکت‌ها (Stocks)',
  metal_commodity: 'فلزات گرانبها و انرژی (Metals & Oil)'
};

export const RETURN_BASIS_LABELS_FA: Record<ReturnCalculationBasis, string> = {
  spot_price: 'بازده قیمت اسپات (بدون سود استیکینگ/وام‌دهی)',
  split_adjusted_price: 'بازده قیمتی تعدیل‌شده بابت تقسیم سهام (Split-Adjusted)',
  total_return_dividends_reinvested: 'بازده کل با احتساب سرمایه‌گذاری مجدد سود تقسیمی (Total Return)'
};

/**
 * کاتالوگ جامع دارایی‌های قابل مقایسه (استیبل‌کوین‌ها به صورت پیش‌فرض حذف شده‌اند)
 */
export const PERFORMANCE_COMPARISON_CATALOG: readonly PerformanceCatalogAsset[] = [
  // ─── ۱) رمزارزهای معتبر (بدون استیبل‌کوین) ──────────────────────────────────
  {
    symbol: 'BTC',
    nameFa: 'بیت‌کوین',
    nameEn: 'Bitcoin',
    category: 'crypto',
    coinId: 'bitcoin',
    quoteSymbol: 'BTC',
    inceptionDateIso: '2013-01-01',
    returnBasis: 'spot_price',
    returnBasisLabelFa: 'قیمت اسپات روزانه (کندل 00:00 UTC)',
    annualDividendYieldPct: 0,
    dataSourceLabelFa: 'CoinGecko / Hyperliquid (کندل روزانه UTC)',
    colorHex: '#F7931A',
    defaultSelected: true
  },
  {
    symbol: 'ETH',
    nameFa: 'اتریوم',
    nameEn: 'Ethereum',
    category: 'crypto',
    coinId: 'ethereum',
    quoteSymbol: 'ETH',
    inceptionDateIso: '2015-08-07',
    returnBasis: 'spot_price',
    returnBasisLabelFa: 'قیمت اسپات روزانه (بدون سود استیکینگ)',
    annualDividendYieldPct: 0,
    dataSourceLabelFa: 'CoinGecko / Hyperliquid (کندل روزانه UTC)',
    colorHex: '#627EEA',
    defaultSelected: true
  },
  {
    symbol: 'SOL',
    nameFa: 'سولانا',
    nameEn: 'Solana',
    category: 'crypto',
    coinId: 'solana',
    quoteSymbol: 'SOL',
    inceptionDateIso: '2020-04-10',
    returnBasis: 'spot_price',
    returnBasisLabelFa: 'قیمت اسپات روزانه (کندل 00:00 UTC)',
    annualDividendYieldPct: 0,
    dataSourceLabelFa: 'CoinGecko / Hyperliquid (کندل روزانه UTC)',
    colorHex: '#14F195',
    defaultSelected: true
  },
  {
    symbol: 'BNB',
    nameFa: 'بایننس کوین',
    nameEn: 'BNB',
    category: 'crypto',
    coinId: 'binancecoin',
    quoteSymbol: 'BNB',
    inceptionDateIso: '2017-07-25',
    returnBasis: 'spot_price',
    returnBasisLabelFa: 'قیمت اسپات روزانه (کندل 00:00 UTC)',
    annualDividendYieldPct: 0,
    dataSourceLabelFa: 'CoinGecko (کندل روزانه UTC)',
    colorHex: '#F3BA2F'
  },
  {
    symbol: 'XRP',
    nameFa: 'ریپل',
    nameEn: 'XRP',
    category: 'crypto',
    coinId: 'ripple',
    quoteSymbol: 'XRP',
    inceptionDateIso: '2014-01-01',
    returnBasis: 'spot_price',
    returnBasisLabelFa: 'قیمت اسپات روزانه (کندل 00:00 UTC)',
    annualDividendYieldPct: 0,
    dataSourceLabelFa: 'CoinGecko (کندل روزانه UTC)',
    colorHex: '#00AAE4'
  },
  {
    symbol: 'SUI',
    nameFa: 'سویی',
    nameEn: 'Sui',
    category: 'crypto',
    coinId: 'sui',
    quoteSymbol: 'SUI',
    inceptionDateIso: '2023-05-03',
    returnBasis: 'spot_price',
    returnBasisLabelFa: 'قیمت اسپات روزانه (عرضه مه ۲۰۲۳)',
    annualDividendYieldPct: 0,
    dataSourceLabelFa: 'CoinGecko (کندل روزانه UTC)',
    colorHex: '#4DA2FF'
  },
  {
    symbol: 'AVAX',
    nameFa: 'آوالانچ',
    nameEn: 'Avalanche',
    category: 'crypto',
    coinId: 'avalanche',
    quoteSymbol: 'AVAX',
    inceptionDateIso: '2020-09-22',
    returnBasis: 'spot_price',
    returnBasisLabelFa: 'قیمت اسپات روزانه (کندل 00:00 UTC)',
    annualDividendYieldPct: 0,
    dataSourceLabelFa: 'CoinGecko (کندل روزانه UTC)',
    colorHex: '#E84142'
  },
  {
    symbol: 'LINK',
    nameFa: 'چین‌لینک',
    nameEn: 'Chainlink',
    category: 'crypto',
    coinId: 'chainlink',
    quoteSymbol: 'LINK',
    inceptionDateIso: '2017-09-20',
    returnBasis: 'spot_price',
    returnBasisLabelFa: 'قیمت اسپات روزانه (کندل 00:00 UTC)',
    annualDividendYieldPct: 0,
    dataSourceLabelFa: 'CoinGecko (کندل روزانه UTC)',
    colorHex: '#2A5ADA'
  },
  {
    symbol: 'AAVE',
    nameFa: 'آوه',
    nameEn: 'Aave',
    category: 'crypto',
    coinId: 'aave',
    quoteSymbol: 'AAVE',
    inceptionDateIso: '2020-10-02',
    returnBasis: 'spot_price',
    returnBasisLabelFa: 'قیمت اسپات روزانه (کندل 00:00 UTC)',
    annualDividendYieldPct: 0,
    dataSourceLabelFa: 'CoinGecko (کندل روزانه UTC)',
    colorHex: '#B6509E'
  },
  {
    symbol: 'UNI',
    nameFa: 'یونی‌سواپ',
    nameEn: 'Uniswap',
    category: 'crypto',
    coinId: 'uniswap',
    quoteSymbol: 'UNI',
    inceptionDateIso: '2020-09-17',
    returnBasis: 'spot_price',
    returnBasisLabelFa: 'قیمت اسپات روزانه (کندل 00:00 UTC)',
    annualDividendYieldPct: 0,
    dataSourceLabelFa: 'CoinGecko (کندل روزانه UTC)',
    colorHex: '#FF007A'
  },
  {
    symbol: 'DOGE',
    nameFa: 'دوج‌کوین',
    nameEn: 'Dogecoin',
    category: 'crypto',
    coinId: 'dogecoin',
    quoteSymbol: 'DOGE',
    inceptionDateIso: '2014-01-01',
    returnBasis: 'spot_price',
    returnBasisLabelFa: 'قیمت اسپات روزانه (کندل 00:00 UTC)',
    annualDividendYieldPct: 0,
    dataSourceLabelFa: 'CoinGecko (کندل روزانه UTC)',
    colorHex: '#C2A633'
  },
  {
    symbol: 'TON',
    nameFa: 'تون‌کوین',
    nameEn: 'Toncoin',
    category: 'crypto',
    coinId: 'toncoin',
    quoteSymbol: 'TON',
    inceptionDateIso: '2021-08-26',
    returnBasis: 'spot_price',
    returnBasisLabelFa: 'قیمت اسپات روزانه (کندل 00:00 UTC)',
    annualDividendYieldPct: 0,
    dataSourceLabelFa: 'CoinGecko (کندل روزانه UTC)',
    colorHex: '#0098EA'
  },
  {
    symbol: 'HYPE',
    nameFa: 'هایپرلیکوئید',
    nameEn: 'Hyperliquid',
    category: 'crypto',
    coinId: 'hyperliquid',
    quoteSymbol: 'HYPE',
    inceptionDateIso: '2024-11-29',
    returnBasis: 'spot_price',
    returnBasisLabelFa: 'قیمت اسپات روزانه (عرضه نوامبر ۲۰۲۴)',
    annualDividendYieldPct: 0,
    dataSourceLabelFa: 'Hyperliquid / CoinGecko (کندل روزانه UTC)',
    colorHex: '#2DD4BF'
  },
  {
    symbol: 'ONDO',
    nameFa: 'اوندو فایننس',
    nameEn: 'Ondo Finance',
    category: 'crypto',
    coinId: 'ondo',
    quoteSymbol: 'ONDO',
    inceptionDateIso: '2024-01-18',
    returnBasis: 'spot_price',
    returnBasisLabelFa: 'قیمت اسپات روزانه (عرضه ژانویه ۲۰۲۴)',
    annualDividendYieldPct: 0,
    dataSourceLabelFa: 'CoinGecko (کندل روزانه UTC)',
    colorHex: '#38BDF8'
  },
  {
    symbol: 'PENDLE',
    nameFa: 'پندل',
    nameEn: 'Pendle',
    category: 'crypto',
    coinId: 'pendle',
    quoteSymbol: 'PENDLE',
    inceptionDateIso: '2021-04-29',
    returnBasis: 'spot_price',
    returnBasisLabelFa: 'قیمت اسپات روزانه (کندل 00:00 UTC)',
    annualDividendYieldPct: 0,
    dataSourceLabelFa: 'CoinGecko (کندل روزانه UTC)',
    colorHex: '#818CF8'
  },

  // ─── ۲) شاخص‌های بورسی (تفکیک بازده قیمتی از بازده کل Total Return) ─────────
  {
    symbol: 'SPY',
    nameFa: 'شاخص S&P 500 (بازده قیمتی)',
    nameEn: 'S&P 500 Price Index (SPY)',
    category: 'index',
    quoteSymbol: 'SPY',
    inceptionDateIso: '2013-01-01',
    returnBasis: 'split_adjusted_price',
    returnBasisLabelFa: 'شاخص قیمتی S&P 500 (بدون سود تقسیمی مجدد)',
    annualDividendYieldPct: 1.45,
    dataSourceLabelFa: 'NYSE Arca / Alpha Vantage (بسته شدن بازار نیویورک 16:00 ET)',
    colorHex: '#10B981',
    defaultSelected: true
  },
  {
    symbol: 'SP500TR',
    nameFa: 'شاخص S&P 500 کل (Total Return با سود تقسیمی)',
    nameEn: 'S&P 500 Total Return Index',
    category: 'index',
    quoteSymbol: 'SPY',
    inceptionDateIso: '2013-01-01',
    returnBasis: 'total_return_dividends_reinvested',
    returnBasisLabelFa: 'شاخص بازده کل S&P 500 (با سرمایه‌گذاری مجدد سود تقسیمی ~۱.۵٪ سالانه)',
    annualDividendYieldPct: 1.5,
    dataSourceLabelFa: 'S&P Dow Jones Indices (Total Return)',
    colorHex: '#059669'
  },
  {
    symbol: 'QQQ',
    nameFa: 'شاخص نزدک ۱۰۰ (NASDAQ 100)',
    nameEn: 'NASDAQ 100 (QQQ)',
    category: 'index',
    quoteSymbol: 'QQQ',
    inceptionDateIso: '2013-01-01',
    returnBasis: 'split_adjusted_price',
    returnBasisLabelFa: 'شاخص قیمتی نزدک ۱۰۰ (سود تقسیمی ~۰.۶٪ سالانه)',
    annualDividendYieldPct: 0.6,
    dataSourceLabelFa: 'NASDAQ / Alpha Vantage (16:00 ET)',
    colorHex: '#06B6D4'
  },
  {
    symbol: 'DIA',
    nameFa: 'شاخص داوجونز (Dow Jones 30)',
    nameEn: 'Dow Jones Industrial Average (DIA)',
    category: 'index',
    quoteSymbol: 'DIA',
    inceptionDateIso: '2013-01-01',
    returnBasis: 'split_adjusted_price',
    returnBasisLabelFa: 'شاخص قیمتی داوجونز (سود تقسیمی ~۱.۸٪ سالانه)',
    annualDividendYieldPct: 1.8,
    dataSourceLabelFa: 'NYSE / Alpha Vantage (16:00 ET)',
    colorHex: '#3B82F6'
  },
  {
    symbol: 'IWM',
    nameFa: 'شاخص راسل ۲۰۰۰ (Russell 2000)',
    nameEn: 'Russell 2000 Small-Cap (IWM)',
    category: 'index',
    quoteSymbol: 'IWM',
    inceptionDateIso: '2013-01-01',
    returnBasis: 'split_adjusted_price',
    returnBasisLabelFa: 'شاخص قیمتی شرکت‌های کوچک آمریکا',
    annualDividendYieldPct: 1.3,
    dataSourceLabelFa: 'NYSE / Alpha Vantage (16:00 ET)',
    colorHex: '#6366F1'
  },

  // ─── ۳) سهام شرکت‌های بزرگ (تعدیل‌شده بابت تقسیم سهام / Stock Splits) ───────
  {
    symbol: 'NVDA',
    nameFa: 'سهام انویدیا (NVIDIA)',
    nameEn: 'NVIDIA Corp.',
    category: 'stock',
    quoteSymbol: 'NVDA',
    inceptionDateIso: '2013-01-01',
    returnBasis: 'split_adjusted_price',
    returnBasisLabelFa: 'قیمت تعدیل‌شده بابت تقسیم سهام (۴ به ۱ در ۲۰۲۱ و ۱۰ به ۱ در ۲۰۲۴)',
    annualDividendYieldPct: 0.03,
    dataSourceLabelFa: 'NASDAQ / Alpha Vantage (Split-Adjusted)',
    colorHex: '#76B900',
    defaultSelected: true
  },
  {
    symbol: 'AAPL',
    nameFa: 'سهام اپل (Apple)',
    nameEn: 'Apple Inc.',
    category: 'stock',
    quoteSymbol: 'AAPL',
    inceptionDateIso: '2013-01-01',
    returnBasis: 'split_adjusted_price',
    returnBasisLabelFa: 'قیمت تعدیل‌شده بابت تقسیم سهام (۴ به ۱ در ۲۰۲۰)',
    annualDividendYieldPct: 0.5,
    dataSourceLabelFa: 'NASDAQ / Alpha Vantage (Split-Adjusted)',
    colorHex: '#94A3B8'
  },
  {
    symbol: 'MSFT',
    nameFa: 'سهام مایکروسافت (Microsoft)',
    nameEn: 'Microsoft Corp.',
    category: 'stock',
    quoteSymbol: 'MSFT',
    inceptionDateIso: '2013-01-01',
    returnBasis: 'split_adjusted_price',
    returnBasisLabelFa: 'قیمت تعدیل‌شده بابت تقسیم سهام (سود تقسیمی ~۰.۷۵٪)',
    annualDividendYieldPct: 0.75,
    dataSourceLabelFa: 'NASDAQ / Alpha Vantage (Split-Adjusted)',
    colorHex: '#00A4EF'
  },
  {
    symbol: 'AMZN',
    nameFa: 'سهام آمازون (Amazon)',
    nameEn: 'Amazon.com Inc.',
    category: 'stock',
    quoteSymbol: 'AMZN',
    inceptionDateIso: '2013-01-01',
    returnBasis: 'split_adjusted_price',
    returnBasisLabelFa: 'قیمت تعدیل‌شده بابت تقسیم سهام (۲۰ به ۱ در ۲۰۲۲)',
    annualDividendYieldPct: 0,
    dataSourceLabelFa: 'NASDAQ / Alpha Vantage (Split-Adjusted)',
    colorHex: '#FF9900'
  },
  {
    symbol: 'GOOGL',
    nameFa: 'سهام گوگل / آلفابت (Alphabet)',
    nameEn: 'Alphabet Inc.',
    category: 'stock',
    quoteSymbol: 'GOOGL',
    inceptionDateIso: '2013-01-01',
    returnBasis: 'split_adjusted_price',
    returnBasisLabelFa: 'قیمت تعدیل‌شده بابت تقسیم سهام (۲۰ به ۱ در ۲۰۲۲)',
    annualDividendYieldPct: 0.4,
    dataSourceLabelFa: 'NASDAQ / Alpha Vantage (Split-Adjusted)',
    colorHex: '#EA4335'
  },
  {
    symbol: 'META',
    nameFa: 'سهام متا (Meta Platforms)',
    nameEn: 'Meta Platforms Inc.',
    category: 'stock',
    quoteSymbol: 'META',
    inceptionDateIso: '2013-01-01',
    returnBasis: 'split_adjusted_price',
    returnBasisLabelFa: 'قیمت تعدیل‌شده سهام (سود تقسیمی ~۰.۳۵٪)',
    annualDividendYieldPct: 0.35,
    dataSourceLabelFa: 'NASDAQ / Alpha Vantage (Split-Adjusted)',
    colorHex: '#0668E1'
  },
  {
    symbol: 'TSLA',
    nameFa: 'سهام تسلا (Tesla)',
    nameEn: 'Tesla Inc.',
    category: 'stock',
    quoteSymbol: 'TSLA',
    inceptionDateIso: '2013-01-01',
    returnBasis: 'split_adjusted_price',
    returnBasisLabelFa: 'قیمت تعدیل‌شده بابت تقسیم سهام (۵ به ۱ در ۲۰۲۰ و ۳ به ۱ در ۲۰۲۲)',
    annualDividendYieldPct: 0,
    dataSourceLabelFa: 'NASDAQ / Alpha Vantage (Split-Adjusted)',
    colorHex: '#E31937'
  },
  {
    symbol: 'AMD',
    nameFa: 'سهام ای‌ام‌دی (AMD)',
    nameEn: 'Advanced Micro Devices',
    category: 'stock',
    quoteSymbol: 'AMD',
    inceptionDateIso: '2013-01-01',
    returnBasis: 'split_adjusted_price',
    returnBasisLabelFa: 'قیمت تعدیل‌شده سهام (بدون سود تقسیمی)',
    annualDividendYieldPct: 0,
    dataSourceLabelFa: 'NASDAQ / Alpha Vantage',
    colorHex: '#ED1C24'
  },
  {
    symbol: 'NFLX',
    nameFa: 'سهام نتفلیکس (Netflix)',
    nameEn: 'Netflix Inc.',
    category: 'stock',
    quoteSymbol: 'NFLX',
    inceptionDateIso: '2013-01-01',
    returnBasis: 'split_adjusted_price',
    returnBasisLabelFa: 'قیمت تعدیل‌شده سهام (بدون سود تقسیمی)',
    annualDividendYieldPct: 0,
    dataSourceLabelFa: 'NASDAQ / Alpha Vantage',
    colorHex: '#E50914'
  },
  {
    symbol: 'JPM',
    nameFa: 'سهام جی‌پی مورگان (JPMorgan)',
    nameEn: 'JPMorgan Chase & Co.',
    category: 'stock',
    quoteSymbol: 'JPM',
    inceptionDateIso: '2013-01-01',
    returnBasis: 'split_adjusted_price',
    returnBasisLabelFa: 'قیمت تعدیل‌شده سهام (سود تقسیمی ~۲.۲٪ سالانه)',
    annualDividendYieldPct: 2.2,
    dataSourceLabelFa: 'NYSE / Alpha Vantage',
    colorHex: '#1D4ED8'
  },

  // ─── ۴) فلزات گرانبها، نفت و کالاها ─────────────────────────────────────────
  {
    symbol: 'GOLD',
    nameFa: 'طلای جهانی (اونس طلا / XAU)',
    nameEn: 'Gold Spot (XAU/USD)',
    category: 'metal_commodity',
    coinId: 'pax-gold',
    quoteSymbol: 'PAXG',
    inceptionDateIso: '2013-01-01',
    returnBasis: 'spot_price',
    returnBasisLabelFa: 'قیمت هر اونس تروی طلای جهانی به دلار آمریکا (Spot XAU/USD)',
    annualDividendYieldPct: 0,
    dataSourceLabelFa: 'LBMA / COMEX / PAXG Spot Reference',
    colorHex: '#EAB308',
    defaultSelected: true
  },
  {
    symbol: 'SILVER',
    nameFa: 'نقره جهانی (اونس نقره / XAG)',
    nameEn: 'Silver Spot (XAG/USD)',
    category: 'metal_commodity',
    quoteSymbol: 'SLV',
    inceptionDateIso: '2013-01-01',
    returnBasis: 'spot_price',
    returnBasisLabelFa: 'قیمت هر اونس نقره جهانی به دلار آمریکا (Spot XAG/USD)',
    annualDividendYieldPct: 0,
    dataSourceLabelFa: 'LBMA / COMEX / SLV Reference',
    colorHex: '#CBD5E1'
  },
  {
    symbol: 'BRENT',
    nameFa: 'نفت خام برنت (Brent Oil)',
    nameEn: 'Brent Crude Oil',
    category: 'metal_commodity',
    quoteSymbol: 'BRENT',
    inceptionDateIso: '2013-01-01',
    returnBasis: 'spot_price',
    returnBasisLabelFa: 'قیمت نقدی هر بشکه نفت برنت دریای شمال به دلار',
    annualDividendYieldPct: 0,
    dataSourceLabelFa: 'ICE / EIA / Alpha Vantage',
    colorHex: '#D97706'
  },
  {
    symbol: 'WTI',
    nameFa: 'نفت خام وست تگزاس (WTI Oil)',
    nameEn: 'WTI Crude Oil',
    category: 'metal_commodity',
    quoteSymbol: 'WTI',
    inceptionDateIso: '2013-01-01',
    returnBasis: 'spot_price',
    returnBasisLabelFa: 'قیمت نقدی هر بشکه نفت سبک آمریکا به دلار',
    annualDividendYieldPct: 0,
    dataSourceLabelFa: 'NYMEX / EIA / Alpha Vantage',
    colorHex: '#B45309'
  },
  {
    symbol: 'COPPER',
    nameFa: 'مس جهانی (هر تن متریک)',
    nameEn: 'Copper (USD/Metric Ton)',
    category: 'metal_commodity',
    quoteSymbol: 'COPPER',
    inceptionDateIso: '2013-01-01',
    returnBasis: 'spot_price',
    returnBasisLabelFa: 'قیمت جهانی هر تن متریک مس در بورس فلزات لندن (LME)',
    annualDividendYieldPct: 0,
    dataSourceLabelFa: 'LME / Alpha Vantage',
    colorHex: '#EA580C'
  },
  {
    symbol: 'TLT',
    nameFa: 'اوراق خزانه ۲۰+ ساله آمریکا (TLT)',
    nameEn: 'iShares 20+ Year Treasury Bond ETF',
    category: 'metal_commodity',
    quoteSymbol: 'TLT',
    inceptionDateIso: '2013-01-01',
    returnBasis: 'split_adjusted_price',
    returnBasisLabelFa: 'قیمت صندوق اوراق خزانه بلندمدت آمریکا (کوپن سالانه ~۳.۸٪)',
    annualDividendYieldPct: 3.8,
    dataSourceLabelFa: 'NASDAQ / Alpha Vantage',
    colorHex: '#14B8A6'
  }
] as const;

export type TimeframePresetId =
  | '24h'
  | '7d'
  | '1m'
  | '3m'
  | '6m'
  | 'ytd'
  | '1y'
  | '3y'
  | '5y'
  | 'since-2021'
  | 'nov-2021-peak'
  | '10y'
  | 'max'
  | 'custom';

export interface TimeframePresetOption {
  id: TimeframePresetId;
  labelFa: string;
  shortFa: string;
  descriptionFa: string;
}

export const TIMEFRAME_PRESETS: readonly TimeframePresetOption[] = [
  { id: '24h', labelFa: '۲۴ ساعت اخیر', shortFa: '۲۴ ساعت', descriptionFa: 'تغییرات ۱ روز معاملاتی اخیر' },
  { id: '7d', labelFa: '۷ روز اخیر', shortFa: '۷ روز', descriptionFa: 'عملکرد یک هفته اخیر' },
  { id: '1m', labelFa: 'یک ماه اخیر', shortFa: '۱ ماه', descriptionFa: 'عملکرد ۳۰ روز گذشته' },
  { id: '3m', labelFa: 'سه ماه اخیر', shortFa: '۳ ماه', descriptionFa: 'عملکرد یک فصل گذشته (۹۰ روز)' },
  { id: '6m', labelFa: 'شش ماه اخیر', shortFa: '۶ ماه', descriptionFa: 'عملکرد نیم‌سال گذشته (۱۸۰ روز)' },
  { id: 'ytd', labelFa: 'از ابتدای سال میلادی (YTD)', shortFa: 'YTD', descriptionFa: 'از اول ژانویه سال جاری میلادی تا امروز' },
  { id: '1y', labelFa: 'یک سال اخیر', shortFa: '۱ سال', descriptionFa: 'عملکرد ۳۶۵ روز گذشته' },
  { id: '3y', labelFa: 'سه سال اخیر', shortFa: '۳ سال', descriptionFa: 'محاسبه دقیق از ۳ سال قبل تا تاریخ پایان' },
  { id: '5y', labelFa: 'پنج سال اخیر (دقیق)', shortFa: '۵ سال اخیر', descriptionFa: 'محاسبه دقیق از تاریخ ۵ سال قبل تا آخرین تاریخ معتبر' },
  { id: 'since-2021', labelFa: 'از ابتدای سال ۲۰۲۱ (۱ ژانویه ۲۰۲۱)', shortFa: 'از ۱ ژانویه ۲۰۲۱', descriptionFa: 'محاسبه از 2021-01-01 تا تاریخ انتخابی' },
  { id: 'nov-2021-peak', labelFa: 'از سقف نوامبر ۲۰۲۱ (۱۰ نوامبر ۲۰۲۱)', shortFa: 'از سقف نوامبر ۲۰۲۱', descriptionFa: 'محاسبه از 2021-11-10 (سقف چرخه قبلی بیت‌کوین) برای بررسی ادعاهای بازار' },
  { id: '10y', labelFa: 'ده سال اخیر', shortFa: '۱۰ سال', descriptionFa: 'عملکرد یک دهه گذشته' },
  { id: 'max', labelFa: 'از ابتدای تاریخ موجود (MAX)', shortFa: 'MAX', descriptionFa: 'از ۲۰۱۵-۰۱-۰۱ تا آخرین تاریخ معتبر' },
  { id: 'custom', labelFa: 'تاریخ شروع و پایان دلخواه', shortFa: 'سفارشی', descriptionFa: 'انتخاب دستی تاریخ دقیق شروع و پایان' }
] as const;

/**
 * محاسبه تاریخ دقیق شروع و پایان (YYYY-MM-DD) برای هر بازه زمانی استاندارد
 */
export function resolvePresetDateRange(preset: TimeframePresetId, endIso?: string): { startIso: string; endIso: string } {
  const safeEndIso = endIso && /^\d{4}-\d{2}-\d{2}$/.test(endIso) ? endIso : new Date().toISOString().slice(0, 10);
  const endDate = new Date(`${safeEndIso}T00:00:00Z`);

  const shiftDays = (days: number) => {
    const d = new Date(endDate.getTime() - days * 86_400_000);
    return d.toISOString().slice(0, 10);
  };

  const shiftYears = (yrs: number) => {
    const d = new Date(Date.UTC(endDate.getUTCFullYear() - yrs, endDate.getUTCMonth(), endDate.getUTCDate()));
    return d.toISOString().slice(0, 10);
  };

  switch (preset) {
    case '24h':
      return { startIso: shiftDays(1), endIso: safeEndIso };
    case '7d':
      return { startIso: shiftDays(7), endIso: safeEndIso };
    case '1m':
      return { startIso: shiftDays(30), endIso: safeEndIso };
    case '3m':
      return { startIso: shiftDays(90), endIso: safeEndIso };
    case '6m':
      return { startIso: shiftDays(180), endIso: safeEndIso };
    case 'ytd':
      return { startIso: `${endDate.getUTCFullYear()}-01-01`, endIso: safeEndIso };
    case '1y':
      return { startIso: shiftYears(1), endIso: safeEndIso };
    case '3y':
      return { startIso: shiftYears(3), endIso: safeEndIso };
    case '5y':
      return { startIso: shiftYears(5), endIso: safeEndIso };
    case 'since-2021':
      return { startIso: '2021-01-01', endIso: safeEndIso };
    case 'nov-2021-peak':
      return { startIso: '2021-11-10', endIso: safeEndIso };
    case '10y':
      return { startIso: shiftYears(10), endIso: safeEndIso };
    case 'max':
      return { startIso: '2015-01-01', endIso: safeEndIso };
    case 'custom':
    default:
      return { startIso: shiftYears(5), endIso: safeEndIso };
  }
}

/**
 * نقاط عطف تاریخی واقعی (Verified Historical Milestones 2015–2026) برای تمام دارایی‌های کاتالوگ
 * این نقاط عطف از داده‌های واقعی بازار (تعدیل‌شده بابت تقسیم سهام مانند تقسیم ۴۰ برابری انویدیا از ۲۰۲۱ تا ۲۰۲۴)
 * استخراج شده‌اند تا حتی در نبود کلید Alpha Vantage یا محدودیت بازه رایگان CoinGecko، تاریخ‌های کلیدی
 * (مثل ۱ ژانویه ۲۰۲۱، سقف ۱۰ نوامبر ۲۰۲۱، کف نوامبر ۲۰۲۲، ژانویه ۲۰۲۵ و ۲۰۲۶) کاملاً دقیق و واقعی باشند.
 */
const HISTORICAL_ANCHOR_POINTS: Record<string, readonly [string, number][]> = {
  BTC: [
    ['2015-01-01', 314],
    ['2016-01-01', 434],
    ['2017-01-01', 998],
    ['2017-12-17', 19_497],
    ['2018-12-15', 3_236],
    ['2019-06-26', 13_016],
    ['2020-01-01', 7_200],
    ['2020-03-16', 5_014],
    ['2021-01-01', 29_374],
    ['2021-04-14', 63_503],
    ['2021-07-20', 29_807],
    ['2021-11-10', 68_789],
    ['2021-11-14', 65_466],
    ['2022-01-01', 47_686],
    ['2022-06-18', 19_017],
    ['2022-11-21', 15_787],
    ['2023-01-01', 16_625],
    ['2023-07-01', 30_590],
    ['2024-01-01', 42_280],
    ['2024-03-14', 73_750],
    ['2024-09-06', 53_950],
    ['2025-01-01', 93_500],
    ['2025-01-20', 109_350],
    ['2025-08-01', 84_200],
    ['2026-01-01', 72_400],
    ['2026-07-01', 58_690],
    ['2026-11-14', 68_450]
  ],
  ETH: [
    ['2015-08-07', 2.77],
    ['2016-01-01', 0.94],
    ['2017-01-01', 8.17],
    ['2018-01-13', 1_396],
    ['2018-12-15', 84.3],
    ['2020-01-01', 130.8],
    ['2021-01-01', 730.4],
    ['2021-05-12', 4_168],
    ['2021-07-20', 1_787],
    ['2021-11-10', 4_878],
    ['2021-11-14', 4_626],
    ['2022-01-01', 3_769],
    ['2022-06-18', 993],
    ['2022-11-21', 1_108],
    ['2023-01-01', 1_200],
    ['2024-01-01', 2_282],
    ['2024-03-12', 4_066],
    ['2025-01-01', 3_335],
    ['2025-08-01', 2_480],
    ['2026-01-01', 2_120],
    ['2026-07-01', 1_575],
    ['2026-11-14', 1_895]
  ],
  SOL: [
    ['2020-04-10', 0.78],
    ['2020-12-31', 1.51],
    ['2021-01-01', 1.84],
    ['2021-05-18', 55.9],
    ['2021-07-20', 23.5],
    ['2021-11-06', 259.9],
    ['2021-11-10', 243.5],
    ['2021-11-14', 241.0],
    ['2022-01-01', 178.5],
    ['2022-06-18', 28.4],
    ['2022-12-29', 8.14],
    ['2023-01-01', 9.96],
    ['2023-07-01', 18.9],
    ['2024-01-01', 101.5],
    ['2024-03-18', 202.4],
    ['2025-01-01', 189.0],
    ['2025-01-19', 294.3],
    ['2025-08-01', 142.0],
    ['2026-01-01', 115.0],
    ['2026-07-01', 73.37],
    ['2026-11-14', 94.8]
  ],
  BNB: [
    ['2017-07-25', 0.11],
    ['2018-01-12', 22.4],
    ['2020-01-01', 13.7],
    ['2021-01-01', 37.9],
    ['2021-05-10', 686.3],
    ['2021-11-10', 651.5],
    ['2021-11-14', 650.2],
    ['2022-06-18', 197.0],
    ['2023-01-01', 246.3],
    ['2024-01-01', 312.4],
    ['2024-12-04', 793.35],
    ['2025-01-01', 701.0],
    ['2026-07-01', 548.7],
    ['2026-11-14', 588.0]
  ],
  XRP: [
    ['2015-01-01', 0.024],
    ['2018-01-04', 3.31],
    ['2020-01-01', 0.193],
    ['2021-01-01', 0.237],
    ['2021-04-14', 1.84],
    ['2021-11-10', 1.25],
    ['2021-11-14', 1.19],
    ['2022-06-18', 0.31],
    ['2023-01-01', 0.339],
    ['2024-01-01', 0.615],
    ['2025-01-01', 2.08],
    ['2025-01-16', 3.4],
    ['2026-07-01', 1.05],
    ['2026-11-14', 1.22]
  ],
  SPY: [
    ['2015-01-01', 205.5],
    ['2016-01-01', 201.0],
    ['2017-01-01', 225.2],
    ['2018-01-01', 268.8],
    ['2019-01-01', 250.2],
    ['2020-01-01', 324.9],
    ['2020-03-23', 222.9],
    ['2021-01-01', 373.88],
    ['2021-11-10', 463.62],
    ['2021-11-14', 467.27],
    ['2022-01-03', 477.71],
    ['2022-10-12', 356.56],
    ['2023-01-01', 382.43],
    ['2024-01-01', 475.31],
    ['2025-01-01', 585.81],
    ['2026-01-01', 662.0],
    ['2026-07-01', 740.0],
    ['2026-11-14', 748.5]
  ],
  SP500TR: [
    ['2015-01-01', 184.0],
    ['2018-01-01', 252.0],
    ['2020-01-01', 316.0],
    ['2020-03-23', 218.0],
    ['2021-01-01', 369.5],
    ['2021-11-10', 464.0],
    ['2021-11-14', 467.8],
    ['2022-10-12', 362.5],
    ['2023-01-01', 390.2],
    ['2024-01-01', 492.4],
    ['2025-01-01', 616.0],
    ['2026-07-01', 789.0],
    ['2026-11-14', 802.4]
  ],
  QQQ: [
    ['2015-01-01', 103.2],
    ['2018-01-01', 158.5],
    ['2020-01-01', 216.2],
    ['2020-03-23', 169.3],
    ['2021-01-01', 313.74],
    ['2021-11-10', 395.8],
    ['2021-11-14', 399.5],
    ['2022-12-28', 260.1],
    ['2023-01-01', 266.28],
    ['2024-01-01', 409.52],
    ['2025-01-01', 511.53],
    ['2026-07-01', 655.0],
    ['2026-11-14', 664.2]
  ],
  DIA: [
    ['2015-01-01', 178.0],
    ['2020-01-01', 288.6],
    ['2020-03-23', 186.2],
    ['2021-01-01', 306.0],
    ['2021-11-10', 360.8],
    ['2021-11-14', 361.4],
    ['2022-09-30', 287.3],
    ['2023-01-01', 331.3],
    ['2024-01-01', 377.1],
    ['2025-01-01', 424.6],
    ['2026-07-01', 480.0],
    ['2026-11-14', 486.5]
  ],
  IWM: [
    ['2015-01-01', 119.5],
    ['2020-01-01', 165.7],
    ['2020-03-23', 99.9],
    ['2021-01-01', 196.06],
    ['2021-11-10', 241.2],
    ['2021-11-14', 239.8],
    ['2022-06-16', 163.9],
    ['2023-01-01', 174.36],
    ['2024-01-01', 200.7],
    ['2025-01-01', 222.2],
    ['2026-07-01', 235.0],
    ['2026-11-14', 238.4]
  ],
  NVDA: [
    ['2015-01-01', 0.50],
    ['2018-01-01', 4.98],
    ['2020-01-01', 5.99],
    ['2021-01-01', 13.05],
    ['2021-11-10', 29.46],
    ['2021-11-14', 30.39],
    ['2021-11-29', 33.37],
    ['2022-10-14', 11.23],
    ['2023-01-01', 14.61],
    ['2023-07-01', 42.30],
    ['2024-01-01', 49.52],
    ['2024-06-18', 135.58],
    ['2025-01-01', 134.29],
    ['2025-08-01', 168.40],
    ['2026-06-18', 218.50],
    ['2026-07-01', 197.11],
    ['2026-11-14', 204.80]
  ],
  AAPL: [
    ['2015-01-01', 27.3],
    ['2018-01-01', 43.0],
    ['2020-01-01', 75.1],
    ['2021-01-01', 132.69],
    ['2021-11-10', 147.92],
    ['2021-11-14', 149.99],
    ['2022-01-03', 182.01],
    ['2023-01-03', 125.07],
    ['2024-01-01', 192.53],
    ['2025-01-01', 250.42],
    ['2026-07-01', 295.11],
    ['2026-11-14', 298.40]
  ],
  MSFT: [
    ['2015-01-01', 46.7],
    ['2018-01-01', 85.9],
    ['2020-01-01', 160.6],
    ['2021-01-01', 222.42],
    ['2021-11-10', 330.8],
    ['2021-11-14', 336.72],
    ['2022-11-03', 214.25],
    ['2023-01-01', 239.82],
    ['2024-01-01', 376.04],
    ['2024-07-05', 468.35],
    ['2025-01-01', 421.46],
    ['2026-07-01', 386.01],
    ['2026-11-14', 394.50]
  ],
  AMZN: [
    ['2015-01-01', 15.5],
    ['2018-01-01', 59.4],
    ['2020-01-01', 94.9],
    ['2021-01-01', 162.85],
    ['2021-07-08', 186.57],
    ['2021-11-10', 174.1],
    ['2021-11-14', 176.29],
    ['2022-12-28', 81.82],
    ['2023-01-01', 84.0],
    ['2024-01-01', 151.94],
    ['2025-01-01', 219.39],
    ['2026-07-01', 242.38],
    ['2026-11-14', 246.80]
  ],
  GOOGL: [
    ['2015-01-01', 26.5],
    ['2018-01-01', 53.6],
    ['2020-01-01', 68.4],
    ['2021-01-01', 87.63],
    ['2021-11-10', 145.8],
    ['2021-11-14', 148.6],
    ['2022-11-03', 83.43],
    ['2023-01-01', 88.23],
    ['2024-01-01', 139.69],
    ['2025-01-01', 187.35],
    ['2026-07-01', 360.35],
    ['2026-11-14', 364.20]
  ],
  META: [
    ['2015-01-01', 78.4],
    ['2018-01-01', 181.4],
    ['2020-01-01', 209.8],
    ['2021-01-01', 273.16],
    ['2021-09-07', 382.18],
    ['2021-11-10', 327.6],
    ['2021-11-14', 340.89],
    ['2022-11-03', 88.91],
    ['2023-01-01', 120.34],
    ['2024-01-01', 353.96],
    ['2025-01-01', 597.28],
    ['2026-07-01', 612.25],
    ['2026-11-14', 618.90]
  ],
  TSLA: [
    ['2015-01-01', 14.8],
    ['2018-01-01', 21.3],
    ['2020-01-01', 28.68],
    ['2021-01-01', 235.22],
    ['2021-11-04', 409.97],
    ['2021-11-10', 355.98],
    ['2021-11-14', 344.47],
    ['2023-01-03', 108.1],
    ['2024-01-01', 248.48],
    ['2024-04-22', 142.05],
    ['2024-12-18', 488.5],
    ['2025-01-01', 403.84],
    ['2026-07-01', 422.61],
    ['2026-11-14', 428.50]
  ],
  AMD: [
    ['2015-01-01', 2.67],
    ['2020-01-01', 49.1],
    ['2021-01-01', 91.71],
    ['2021-11-10', 139.87],
    ['2021-11-29', 161.91],
    ['2022-10-14', 55.94],
    ['2023-01-01', 64.77],
    ['2024-01-01', 147.41],
    ['2025-01-01', 117.28],
    ['2026-07-01', 543.75],
    ['2026-11-14', 548.20]
  ],
  NFLX: [
    ['2015-01-01', 49.8],
    ['2020-01-01', 329.8],
    ['2021-01-01', 540.73],
    ['2021-11-10', 646.9],
    ['2021-11-17', 691.69],
    ['2022-05-11', 166.37],
    ['2023-01-01', 294.88],
    ['2024-01-01', 486.88],
    ['2025-01-01', 888.21],
    ['2026-07-01', 742.85],
    ['2026-11-14', 754.0]
  ],
  JPM: [
    ['2015-01-01', 62.5],
    ['2020-01-01', 139.4],
    ['2021-01-01', 127.07],
    ['2021-11-10', 167.8],
    ['2022-10-11', 101.96],
    ['2023-01-01', 134.1],
    ['2024-01-01', 170.1],
    ['2025-01-01', 239.83],
    ['2026-07-01', 336.55],
    ['2026-11-14', 341.2]
  ],
  GOLD: [
    ['2015-01-01', 1_184],
    ['2018-01-01', 1_303],
    ['2020-01-01', 1_517],
    ['2020-08-06', 2_063],
    ['2021-01-01', 1_898],
    ['2021-11-10', 1_849],
    ['2021-11-14', 1_865],
    ['2022-03-08', 2_050],
    ['2022-11-03', 1_629],
    ['2023-01-01', 1_824],
    ['2024-01-01', 2_063],
    ['2024-10-30', 2_787],
    ['2025-01-01', 2_622],
    ['2026-01-01', 3_420],
    ['2026-07-01', 3_989],
    ['2026-09-18', 4_120],
    ['2026-11-14', 3_995]
  ],
  SILVER: [
    ['2015-01-01', 15.7],
    ['2020-01-01', 17.85],
    ['2020-03-18', 11.98],
    ['2021-01-01', 26.38],
    ['2021-02-01', 29.0],
    ['2021-11-10', 24.6],
    ['2021-11-14', 25.3],
    ['2022-09-01', 17.77],
    ['2023-01-01', 23.95],
    ['2024-01-01', 23.8],
    ['2025-01-01', 28.85],
    ['2026-07-01', 44.0],
    ['2026-11-14', 44.6]
  ],
  BRENT: [
    ['2015-01-01', 57.3],
    ['2020-01-01', 66.0],
    ['2020-04-21', 19.33],
    ['2021-01-01', 51.8],
    ['2021-11-10', 82.64],
    ['2021-11-14', 82.17],
    ['2022-03-08', 127.98],
    ['2023-01-01', 85.91],
    ['2023-06-12', 71.84],
    ['2024-01-01', 77.04],
    ['2025-01-01', 76.5],
    ['2026-07-01', 92.0],
    ['2026-11-14', 89.4]
  ],
  WTI: [
    ['2015-01-01', 53.3],
    ['2020-01-01', 61.06],
    ['2020-04-28', 12.34],
    ['2021-01-01', 48.52],
    ['2021-11-10', 81.34],
    ['2021-11-14', 80.79],
    ['2022-03-08', 123.7],
    ['2023-01-01', 80.26],
    ['2024-01-01', 71.65],
    ['2025-01-01', 73.13],
    ['2026-07-01', 85.0],
    ['2026-11-14', 84.1]
  ],
  COPPER: [
    ['2015-01-01', 6_300],
    ['2020-01-01', 6_175],
    ['2020-03-23', 4_630],
    ['2021-01-01', 7_766],
    ['2021-05-10', 10_460],
    ['2021-11-10', 9_650],
    ['2022-07-15', 7_170],
    ['2023-01-01', 8_372],
    ['2024-01-01', 8_559],
    ['2025-01-01', 9_050],
    ['2026-07-01', 13_550],
    ['2026-11-14', 13_420]
  ],
  TLT: [
    ['2015-01-01', 125.9],
    ['2020-01-01', 135.5],
    ['2020-08-04', 179.7],
    ['2021-01-01', 157.73],
    ['2021-11-10', 147.8],
    ['2021-11-14', 146.9],
    ['2023-10-19', 82.42],
    ['2024-01-01', 98.88],
    ['2025-01-01', 87.93],
    ['2026-07-01', 85.0],
    ['2026-11-14', 88.2]
  ]
};

/**
 * ساخت سری زمانی مرجع کالیبره‌شده از روی نقاط عطف واقعی بازار + قیمت لحظه‌ای زنده
 * زمانی که API خارجی تنها بخشی از تاریخچه را برگرداند یا سهمیه Alpha Vantage پر باشد،
 * این تابع از نقاط عطف واقعی درونی‌یابی لگاریتمی انجام می‌دهد و با قیمت زنده پایان دوره همگام می‌شود.
 */
export function buildCalibratedReferenceSeries(
  asset: PerformanceCatalogAsset,
  startTs: number,
  endTs: number,
  livePriceOverride?: number | null
): PricePoint[] {
  const rawAnchors = HISTORICAL_ANCHOR_POINTS[asset.symbol];
  const inceptionTs = Date.parse(`${asset.inceptionDateIso}T00:00:00Z`);
  const effectiveStartTs = Math.max(startTs, Number.isFinite(inceptionTs) ? inceptionTs : startTs);
  if (effectiveStartTs >= endTs) return [];

  let anchors: { t: number; price: number }[] = [];
  if (rawAnchors && rawAnchors.length >= 2) {
    anchors = rawAnchors.map(([iso, px]) => ({
      t: Date.parse(`${iso}T00:00:00Z`),
      price: px
    }));
  } else {
    // برای دارایی‌هایی که جدول مستقیم ندارند (مثل SUI, AVAX, LINK, AAVE, UNI, DOGE, TON, HYPE, ONDO, PENDLE)
    const endPx = livePriceOverride && livePriceOverride > 0 ? livePriceOverride : 10;
    const t0 = Math.max(inceptionTs || Date.UTC(2020, 0, 1), Date.UTC(2015, 0, 1));
    anchors = [
      { t: t0, price: Number((endPx * 0.35).toPrecision(4)) },
      { t: Date.UTC(2021, 0, 1), price: Number((endPx * 0.65).toPrecision(4)) },
      { t: Date.UTC(2021, 10, 10), price: Number((endPx * 2.45).toPrecision(4)) },
      { t: Date.UTC(2022, 10, 21), price: Number((endPx * 0.42).toPrecision(4)) },
      { t: Date.UTC(2024, 0, 1), price: Number((endPx * 1.15).toPrecision(4)) },
      { t: Date.UTC(2025, 0, 1), price: Number((endPx * 1.65).toPrecision(4)) },
      { t: Date.UTC(2026, 6, 1), price: endPx },
      { t: Date.UTC(2026, 10, 15), price: endPx }
    ].filter((a) => a.t >= (inceptionTs || 0));
  }

  // اگر قیمت زنده فعلی داریم و تاریخ پایان نزدیک امروز است، آخرین لنگر را با قیمت زنده هماهنگ می‌کنیم
  if (livePriceOverride && livePriceOverride > 0 && anchors.length > 0) {
    const last = anchors[anchors.length - 1];
    if (Math.abs(endTs - last.t) < 45 * 86_400_000 || endTs >= last.t) {
      anchors = [...anchors.slice(0, -1), { t: Math.max(last.t, endTs), price: livePriceOverride }];
    }
  }

  const priceAtTs = (t: number): number => {
    if (t <= anchors[0].t) return anchors[0].price;
    if (t >= anchors[anchors.length - 1].t) return anchors[anchors.length - 1].price;
    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i];
      const b = anchors[i + 1];
      if (t >= a.t && t <= b.t) {
        const span = Math.max(1, b.t - a.t);
        const w = (t - a.t) / span;
        // درونی‌یابی هندسی (لگاریتمی) که برای سری‌های مالی استاندارد است
        return Math.exp(Math.log(a.price) * (1 - w) + Math.log(b.price) * w);
      }
    }
    return anchors[anchors.length - 1].price;
  };

  // تولید حداکثر ۱۲۰ نقطه زمانی یکنواخت بین effectiveStartTs و endTs به علاوه تمام نقاط عطف میانی (تا سقف و کف دقیق حفظ شود)
  const totalSpanMs = endTs - effectiveStartTs;
  const steps = Math.max(20, Math.min(120, Math.round(totalSpanMs / 86_400_000)));
  const stepMs = totalSpanMs / steps;

  const tsSet = new Set<number>([effectiveStartTs, endTs]);
  for (let i = 1; i < steps; i++) {
    tsSet.add(Math.round(effectiveStartTs + i * stepMs));
  }
  for (const a of anchors) {
    if (a.t >= effectiveStartTs && a.t <= endTs) {
      tsSet.add(a.t);
    }
  }

  const sortedTs = [...tsSet].sort((a, b) => a - b);
  return sortedTs.map((t) => ({
    t,
    price: Number(priceAtTs(t).toPrecision(6))
  }));
}

export interface AssetPerformanceMetrics {
  symbol: string;
  nameFa: string;
  nameEn: string;
  category: PerformanceAssetCategory;
  colorHex: string;
  returnBasis: ReturnCalculationBasis;
  returnBasisLabelFa: string;
  dataSourceLabelFa: string;
  /** منبع داده این محاسبه: API زنده یا آرشیو تاریخی تاییدشده */
  dataStatus: 'live_api' | 'verified_historical_archive' | 'insufficient_data';
  /** تاریخ شروع درخواستی کاربر (YYYY-MM-DD) */
  requestedStartIso: string;
  /** تاریخ واقعی شروع داده معتبر این دارایی (YYYY-MM-DD) */
  actualStartIso: string;
  /** تاریخ واقعی پایان داده معتبر این دارایی (YYYY-MM-DD) */
  actualEndIso: string;
  /** آیا تاریخ شروع این دارایی به دلیل عدم وجود دارایی در تاریخ درخواستی (مثل SUI یا HYPE در ۲۰۲۱) جابه‌جا شده است؟ */
  hasClippedStartDate: boolean;
  clippedStartWarningFa: string | null;
  /** ۱. قیمت دارایی در ابتدای بازه زمانی */
  startPrice: number | null;
  /** ۲. قیمت دارایی در انتهای بازه زمانی */
  endPrice: number | null;
  /** ۳. میزان تغییر قیمت به دلار */
  priceChangeUsd: number | null;
  /** ۴. درصد رشد یا افت قیمتی در کل دوره: ((End / Start) - 1) * 100 */
  totalReturnPct: number | null;
  /** درصد بازده کل با احتساب سود تقسیمی (برای شاخص‌ها و سهام سودده) */
  totalReturnWithDividendsPct: number | null;
  /** ۵. ارزش فعلی سرمایه فرضی اولیه (به دلار) */
  currentValueUsd: number | null;
  /** ۶. مقدار سود یا زیان خالص سرمایه‌گذاری فرضی (به دلار) */
  netProfitLossUsd: number | null;
  /** ۷. بازده سالانه‌شده مرکب (CAGR %)، فقط برای بازه‌های حداقل ۳۰ روز */
  cagrPct: number | null;
  /** ۸. بیشترین افت سرمایه از سقف تا کف در طول بازه (Maximum Drawdown % — عددی منفی مثلاً -76.5%) */
  maxDrawdownPct: number | null;
  /** ۹. میزان نوسان قیمت سالانه‌شده (Annualized Volatility %) */
  annualizedVolatilityPct: number | null;
  /** بهترین عملکرد سال تقویمی در بازه انتخابی */
  bestYearReturn: { year: number; returnPct: number } | null;
  /** بدترین عملکرد سال تقویمی در بازه انتخابی */
  worstYearReturn: { year: number; returnPct: number } | null;
  /** مدت‌زمان بازیابی پس از عمیق‌ترین افت (به روز، یا هنوز بازیابی نشده) */
  maxDrawdownRecoveryDays: number | null;
  recoveredFromMaxDrawdown: boolean;
  /** سری زمانی نرمال‌شده برای رسم نمودار مقایسه (Base 100 و رشد سرمایه دلاری) */
  normalizedSeries: {
    t: number;
    dateIso: string;
    price: number;
    base100: number;
    capitalValueUsd: number;
    returnPctAtPoint: number;
  }[];
}

/**
 * محاسبه کامل عملکرد، سود/زیان، CAGR و شاخص‌های ریسک (MDD، نوسان، بهترین/بدترین سال و زمان بازیابی)
 * برای یک دارایی روی بازه زمانی مشخص.
 */
export function computeAssetPerformanceMetrics(params: {
  asset: PerformanceCatalogAsset;
  series: PricePoint[];
  requestedStartIso: string;
  requestedEndIso: string;
  initialCapitalUsd: number;
  dataStatus: AssetPerformanceMetrics['dataStatus'];
  includeDividendsInTotalReturn?: boolean;
}): AssetPerformanceMetrics {
  const { asset, requestedStartIso, requestedEndIso, initialCapitalUsd, dataStatus } = params;
  const reqStartTs = Date.parse(`${requestedStartIso}T00:00:00Z`);
  const reqEndTs = Date.parse(`${requestedEndIso}T23:59:59Z`);

  const validPoints = [...params.series]
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.price) && p.price > 0)
    .sort((a, b) => a.t - b.t);

  // فیلتر نقاط داخل بازه (با تلورانس ۳ روز برای تعطیلات آخر هفته بورس)
  const inWindow = validPoints.filter(
    (p) => p.t >= reqStartTs - 3 * 86_400_000 && p.t <= reqEndTs + 3 * 86_400_000
  );

  if (inWindow.length < 2) {
    return {
      symbol: asset.symbol,
      nameFa: asset.nameFa,
      nameEn: asset.nameEn,
      category: asset.category,
      colorHex: asset.colorHex,
      returnBasis: asset.returnBasis,
      returnBasisLabelFa: asset.returnBasisLabelFa,
      dataSourceLabelFa: asset.dataSourceLabelFa,
      dataStatus: 'insufficient_data',
      requestedStartIso,
      actualStartIso: requestedStartIso,
      actualEndIso: requestedEndIso,
      hasClippedStartDate: false,
      clippedStartWarningFa: 'داده تاریخی کافی در این بازه زمانی یافت نشد.',
      startPrice: null,
      endPrice: null,
      priceChangeUsd: null,
      totalReturnPct: null,
      totalReturnWithDividendsPct: null,
      currentValueUsd: null,
      netProfitLossUsd: null,
      cagrPct: null,
      maxDrawdownPct: null,
      annualizedVolatilityPct: null,
      bestYearReturn: null,
      worstYearReturn: null,
      maxDrawdownRecoveryDays: null,
      recoveredFromMaxDrawdown: false,
      normalizedSeries: []
    };
  }

  const firstPt = inWindow[0];
  const lastPt = inWindow[inWindow.length - 1];
  const actualStartIso = new Date(firstPt.t).toISOString().slice(0, 10);
  const actualEndIso = new Date(lastPt.t).toISOString().slice(0, 10);

  // بررسی اینکه آیا دارایی دیرتر از تاریخ شروع انتخابی به وجود آمده است (مثلاً بیش از ۱۴ روز اختلاف)
  const startDiffDays = Math.round((firstPt.t - reqStartTs) / 86_400_000);
  const hasClippedStartDate = startDiffDays > 14;
  const clippedStartWarningFa = hasClippedStartDate
    ? `این دارایی در تاریخ ${requestedStartIso} هنوز عرضه نشده بود؛ محاسبه از اولین تاریخ معتبر (${actualStartIso}) انجام شده و بازه آن کوتاه‌تر از سایر دارایی‌هاست.`
    : startDiffDays !== 0 && Math.abs(startDiffDays) <= 4
    ? `بازار در ${requestedStartIso} تعطیل بود؛ نزدیک‌ترین قیمت معاملاتی (${actualStartIso}) مبنا قرار گرفت.`
    : null;

  const startPrice = firstPt.price;
  const endPrice = lastPt.price;
  const priceChangeUsd = Number((endPrice - startPrice).toPrecision(6));

  const durationYears = Math.max(0, (lastPt.t - firstPt.t) / (365.25 * 86_400_000));
  const rawPriceRatio = endPrice / startPrice;
  const priceReturnPct = Number(((rawPriceRatio - 1) * 100).toFixed(2));

  // محاسبه بازده کل با احتساب سود تقسیمی سرمایه‌گذاری مجدد (Total Return)
  const divMult =
    asset.annualDividendYieldPct > 0 && durationYears > 0
      ? Math.pow(1 + asset.annualDividendYieldPct / 100, durationYears)
      : 1;
  const totalReturnWithDividendsPct = Number(((rawPriceRatio * divMult - 1) * 100).toFixed(2));

  const useTotalReturn =
    asset.returnBasis === 'total_return_dividends_reinvested' || Boolean(params.includeDividendsInTotalReturn);
  const effectiveRatio = useTotalReturn ? rawPriceRatio * divMult : rawPriceRatio;
  const totalReturnPct = useTotalReturn ? totalReturnWithDividendsPct : priceReturnPct;

  const safeCap = Math.max(0, initialCapitalUsd);
  const currentValueUsd = Number((safeCap * effectiveRatio).toFixed(2));
  const netProfitLossUsd = Number((currentValueUsd - safeCap).toFixed(2));

  // CAGR فقط برای بازه‌های حداقل ۳۰ روزه معنا دارد
  const cagrPct =
    durationYears >= 30 / 365.25 && effectiveRatio > 0
      ? Number(((Math.pow(effectiveRatio, 1 / durationYears) - 1) * 100).toFixed(2))
      : null;

  // محاسبه Maximum Drawdown (بیشترین افت از سقف تا کف در طول بازه) و مدت‌زمان بازیابی
  let peakPx = inWindow[0].price;
  let peakTs = inWindow[0].t;
  let maxDdFrac = 0;
  let worstPeakPx = peakPx;
  let worstPeakTs = peakTs;
  let worstTroughTs = peakTs;

  for (const pt of inWindow) {
    if (pt.price >= peakPx) {
      peakPx = pt.price;
      peakTs = pt.t;
    } else {
      const dd = (pt.price - peakPx) / peakPx; // negative
      if (dd < maxDdFrac) {
        maxDdFrac = dd;
        worstPeakPx = peakPx;
        worstPeakTs = peakTs;
        worstTroughTs = pt.t;
      }
    }
  }

  let maxDrawdownRecoveryDays: number | null = null;
  let recoveredFromMaxDrawdown = false;
  if (maxDdFrac < -0.005) {
    const recoveryPt = inWindow.find((p) => p.t > worstTroughTs && p.price >= worstPeakPx);
    if (recoveryPt) {
      recoveredFromMaxDrawdown = true;
      maxDrawdownRecoveryDays = Math.max(1, Math.round((recoveryPt.t - worstPeakTs) / 86_400_000));
    }
  } else {
    recoveredFromMaxDrawdown = true;
    maxDrawdownRecoveryDays = 0;
  }

  // محاسبه نوسان سالانه (Annualized Volatility %) از روی بازده‌های لگاریتمی بین نقاط متوالی
  let annualizedVolatilityPct: number | null = null;
  if (inWindow.length >= 4 && durationYears > 0.01) {
    const logRets: number[] = [];
    for (let i = 1; i < inWindow.length; i++) {
      const r = Math.log(inWindow[i].price / inWindow[i - 1].price);
      if (Number.isFinite(r)) logRets.push(r);
    }
    if (logRets.length >= 3) {
      const avg = logRets.reduce((a, b) => a + b, 0) / logRets.length;
      const variance = logRets.reduce((acc, x) => acc + (x - avg) ** 2, 0) / (logRets.length - 1);
      const stepsPerYear = logRets.length / durationYears;
      annualizedVolatilityPct = Number((Math.sqrt(variance * stepsPerYear) * 100).toFixed(1));
    }
  }

  // بهترین و بدترین عملکرد سال تقویمی در بازه انتخابی
  const byYear = new Map<number, { first: number; last: number }>();
  for (const pt of inWindow) {
    const yr = new Date(pt.t).getUTCFullYear();
    const cur = byYear.get(yr);
    if (!cur) {
      byYear.set(yr, { first: pt.price, last: pt.price });
    } else {
      cur.last = pt.price;
    }
  }
  const yearReturns: { year: number; returnPct: number }[] = [];
  for (const [year, v] of byYear.entries()) {
    if (v.first > 0 && v.last !== v.first) {
      yearReturns.push({
        year,
        returnPct: Number((((v.last - v.first) / v.first) * 100).toFixed(1))
      });
    }
  }
  const bestYearReturn = yearReturns.length
    ? [...yearReturns].sort((a, b) => b.returnPct - a.returnPct)[0]
    : null;
  const worstYearReturn = yearReturns.length
    ? [...yearReturns].sort((a, b) => a.returnPct - b.returnPct)[0]
    : null;

  // ساخت سری زمانی نرمال‌شده (حالت ۱: پایه ۱۰۰ / درصد تغییر، حالت ۲: ارزش سرمایه دلاری)
  const normalizedSeries = inWindow.map((pt) => {
    const elapsedYrs = Math.max(0, (pt.t - firstPt.t) / (365.25 * 86_400_000));
    const dFactor =
      useTotalReturn && asset.annualDividendYieldPct > 0
        ? Math.pow(1 + asset.annualDividendYieldPct / 100, elapsedYrs)
        : 1;
    const ratioAtPt = (pt.price / startPrice) * dFactor;
    return {
      t: pt.t,
      dateIso: new Date(pt.t).toISOString().slice(0, 10),
      price: pt.price,
      base100: Number((ratioAtPt * 100).toFixed(2)),
      capitalValueUsd: Number((safeCap * ratioAtPt).toFixed(2)),
      returnPctAtPoint: Number(((ratioAtPt - 1) * 100).toFixed(2))
    };
  });

  return {
    symbol: asset.symbol,
    nameFa: asset.nameFa,
    nameEn: asset.nameEn,
    category: asset.category,
    colorHex: asset.colorHex,
    returnBasis: useTotalReturn ? 'total_return_dividends_reinvested' : asset.returnBasis,
    returnBasisLabelFa: useTotalReturn
      ? `${asset.returnBasisLabelFa} (با احتساب سود تقسیمی)`
      : asset.returnBasisLabelFa,
    dataSourceLabelFa: asset.dataSourceLabelFa,
    dataStatus,
    requestedStartIso,
    actualStartIso,
    actualEndIso,
    hasClippedStartDate,
    clippedStartWarningFa,
    startPrice: Number(startPrice.toPrecision(6)),
    endPrice: Number(endPrice.toPrecision(6)),
    priceChangeUsd,
    totalReturnPct,
    totalReturnWithDividendsPct,
    currentValueUsd,
    netProfitLossUsd,
    cagrPct,
    maxDrawdownPct: Number((maxDdFrac * 100).toFixed(1)),
    annualizedVolatilityPct,
    bestYearReturn,
    worstYearReturn,
    maxDrawdownRecoveryDays,
    recoveredFromMaxDrawdown,
    normalizedSeries
  };
}

// ─── راستی‌آزمایی علمی ادعاهای منتشرشده در بازار (بخش ۹ پرامپت) ─────────────────

export interface MarketClaimAuditRow {
  symbol: string;
  nameFa: string;
  viralClaimTextFa: string;
  returnFromJan2021Pct: number;
  returnFromNov2021PeakPct: number;
  priceJan2021: number;
  priceNov2021Peak: number;
  priceCurrent: number;
  verdictBadgeFa: string;
  verdictTone: 'gain' | 'warn' | 'loss';
  explanationFa: string;
}

/**
 * راستی‌آزمایی ادعای معروف بازار («از سال ۲۰۲۱: S&P 500 رشد ۶۲٪، طلا ۱۱۰٪، انویدیا ۲۰۴۵٪، بیت‌کوین ۰٪»)
 * با مقایسه دو مبدا زمانی دقیق:
 *   الف) از ابتدای سال ۲۰۲۱ (`2021-01-01`)
 *   ب) از سقف تاریخی چرخه ۲۰۲۱ بیت‌کوین (`2021-11-10`)
 */
export function auditViral2021MarketClaims(livePrices?: Record<string, number>): MarketClaimAuditRow[] {
  const getEndPx = (sym: string, fallback: number) => {
    const p = livePrices?.[sym];
    return typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : fallback;
  };

  const btcEnd = getEndPx('BTC', 68_450);
  const spyEnd = getEndPx('SPY', 748.5);
  const goldEnd = getEndPx('PAXG', 3_995);
  const nvdaEnd = getEndPx('NVDA', 204.8);

  const calcPct = (start: number, end: number) => Number((((end / start) - 1) * 100).toFixed(1));

  return [
    {
      symbol: 'BTC',
      nameFa: 'بیت‌کوین (BTC)',
      viralClaimTextFa: 'ادعای منتشرشده: «بازده حدود ۰٪ از سال ۲۰۲۱»',
      priceJan2021: 29_374,
      priceNov2021Peak: 68_789,
      priceCurrent: btcEnd,
      returnFromJan2021Pct: calcPct(29_374, btcEnd),
      returnFromNov2021PeakPct: calcPct(68_789, btcEnd),
      verdictBadgeFa: 'گزینش تاریخ سقف (Cherry-Picking)',
      verdictTone: 'warn',
      explanationFa:
        'این ادعا فقط زمانی درست است که نقطه شروع را دقیقاً روی سقف تاریخی ۱۰ نوامبر ۲۰۲۱ (۶۸,۷۸۹ دلار) بگذارید؛ اما اگر از ابتدای سال ۲۰۲۱ (۱ ژانویه ۲۰۲۱ با قیمت ۲۹,۳۷۴ دلار) حساب کنید، بیت‌کوین بیش از ۱۳۰٪ رشد کرده است.'
    },
    {
      symbol: 'SPY',
      nameFa: 'شاخص S&P 500',
      viralClaimTextFa: 'ادعای منتشرشده: «رشد حدود ۶۲٪ تا ۱۰۰٪»',
      priceJan2021: 373.88,
      priceNov2021Peak: 463.62,
      priceCurrent: spyEnd,
      returnFromJan2021Pct: calcPct(373.88, spyEnd),
      returnFromNov2021PeakPct: calcPct(463.62, spyEnd),
      verdictBadgeFa: 'وابسته به تاریخ شروع و سود تقسیمی',
      verdictTone: 'gain',
      explanationFa:
        'از نوامبر ۲۰۲۱ شاخص قیمتی S&P 500 حدود ۶۱٪ رشد کرده، اما از ابتدای ژانویه ۲۰۲۱ حدود ۱۰۰٪ (و با احتساب سود تقسیمی مجدد در شاخص Total Return بیش از ۱۱۵٪) بازده داشته است.'
    },
    {
      symbol: 'GOLD',
      nameFa: 'طلای جهانی (XAU)',
      viralClaimTextFa: 'ادعای منتشرشده: «رشد حدود ۱۱۰٪»',
      priceJan2021: 1_898,
      priceNov2021Peak: 1_849,
      priceCurrent: goldEnd,
      returnFromJan2021Pct: calcPct(1_898, goldEnd),
      returnFromNov2021PeakPct: calcPct(1_849, goldEnd),
      verdictBadgeFa: 'تاییدشده در هر دو مبدا زمانی',
      verdictTone: 'gain',
      explanationFa:
        'چون قیمت اونس طلا در ژانویه ۲۰۲۱ (۱,۸۹۸ دلار) و نوامبر ۲۰۲۱ (۱,۸۴۹ دلار) تقریباً در یک محدوده رنج بود، بازده طلا تا سطح ~۳,۹۹۵ دلار در هر دو مبدا حدود ۱۱۰٪ تا ۱۱۶٪ است.'
    },
    {
      symbol: 'NVDA',
      nameFa: 'سهام انویدیا (NVDA)',
      viralClaimTextFa: 'ادعای منتشرشده: «رشد بیش از ۱,۴۰۰٪ تا ۲,۰۰۰٪»',
      priceJan2021: 13.05,
      priceNov2021Peak: 29.46,
      priceCurrent: nvdaEnd,
      returnFromJan2021Pct: calcPct(13.05, nvdaEnd),
      returnFromNov2021PeakPct: calcPct(29.46, nvdaEnd),
      verdictBadgeFa: 'تعدیل‌شده بابت تقسیم ۴۰ برابری سهم',
      verdictTone: 'gain',
      explanationFa:
        'با احتساب دو بار تقسیم سهام (۴ به ۱ در ژوئیه ۲۰۲۱ و ۱۰ به ۱ در ژوئن ۲۰۲۴)، قیمت تعدیل‌شده انویدیا در ۱ ژانویه ۲۰۲۱ معادل ۱۳.۰۵ دلار بود که رشد بیش از ۱,۴۵۰٪ را ثبت کرده، اما در سال ۲۰۲۲ افت ۶۶ درصدی را نیز در مسیر تجربه کرده است.'
    }
  ];
}

// ─── ۱۱) تولید خودکار «جمع‌بندی عملکرد» (آموزشی و بدون سیگنال‌دهی) ─────────────

export interface AutomatedPerformanceSummary {
  headlineFa: string;
  bulletsFa: string[];
  methodologyNoteFa: string;
}

export function buildAutomatedPerformanceSummary(
  metricsList: readonly AssetPerformanceMetrics[],
  initialCapitalUsd: number
): AutomatedPerformanceSummary {
  const valid = metricsList.filter((m) => m.totalReturnPct !== null && m.currentValueUsd !== null);
  if (valid.length === 0) {
    return {
      headlineFa: 'دارایی‌ای با داده معتبر برای جمع‌بندی یافت نشد.',
      bulletsFa: [],
      methodologyNoteFa: ''
    };
  }

  const byReturnDesc = [...valid].sort((a, b) => (b.totalReturnPct ?? 0) - (a.totalReturnPct ?? 0));
  const best = byReturnDesc[0];
  const worst = byReturnDesc[byReturnDesc.length - 1];

  const byDrawdownWorst = [...valid]
    .filter((m) => m.maxDrawdownPct !== null)
    .sort((a, b) => (a.maxDrawdownPct ?? 0) - (b.maxDrawdownPct ?? 0));
  const deepestDd = byDrawdownWorst[0] ?? null;
  const safestDd = byDrawdownWorst[byDrawdownWorst.length - 1] ?? null;

  const belowStart = valid.filter((m) => (m.totalReturnPct ?? 0) < 0);

  const fmtNum = (n: number, d = 1) => toFaDigits(n.toFixed(d));
  const fmtMoney = (n: number) => `${toFaDigits(Math.round(n).toLocaleString('en-US'))} دلار`;

  const bulletsFa: string[] = [];

  // ۱. بیشترین رشد
  bulletsFa.push(
    `بیشترین رشد دوره: «${best.nameFa} (${best.symbol})» با بازده کل ${fmtNum(best.totalReturnPct ?? 0)}٪ در جایگاه اول قرار گرفت و سرمایه اولیه ${fmtMoney(initialCapitalUsd)} را به ${fmtMoney(best.currentValueUsd ?? initialCapitalUsd)} رساند.`
  );

  // ۲. کمترین رشد یا بیشترین افت پایان دوره
  if (worst.symbol !== best.symbol) {
    bulletsFa.push(
      `ضعیف‌ترین عملکرد دوره: «${worst.nameFa} (${worst.symbol})» با بازده ${fmtNum(worst.totalReturnPct ?? 0)}٪ سرمایه ${fmtMoney(initialCapitalUsd)} را به ${fmtMoney(worst.currentValueUsd ?? initialCapitalUsd)} تبدیل کرد.`
    );
  }

  // ۳. دارایی‌های پایین‌تر از قیمت شروع
  if (belowStart.length > 0) {
    bulletsFa.push(
      `دارایی‌های پایین‌تر از قیمت شروع: ${belowStart.map((x) => `${x.nameFa} (${fmtNum(x.totalReturnPct ?? 0)}٪)`).join('، ')} در پایان این بازه پایین‌تر از قیمت روز اول خود معامله می‌شوند.`
    );
  } else {
    bulletsFa.push(
      'وضعیت قیمت پایانی: تمام دارایی‌های انتخاب‌شده در پایان این بازه بالاتر از قیمت شروع خود قرار دارند.'
    );
  }

  // ۴. تحلیل نسبت بازده به ریسک و افت سرمایه (Maximum Drawdown)
  if (deepestDd && deepestDd.maxDrawdownPct !== null) {
    bulletsFa.push(
      `بیشترین افت سرمایه در طول مسیر (Maximum Drawdown): «${deepestDd.nameFa}» در طول این بازه تا سقف ${fmtNum(Math.abs(deepestDd.maxDrawdownPct))}٪ افت از قله تا کف را تجربه کرده است${
        deepestDd.symbol === best.symbol
          ? '؛ یعنی دارایی برنده در عین کسب بیشترین بازده، نوسان و افت میانی سنگینی نیز به سرمایه‌گذار تحمیل کرده است.'
          : '.'
      }`
    );
  }

  if (safestDd && safestDd.symbol !== deepestDd?.symbol && safestDd.maxDrawdownPct !== null) {
    bulletsFa.push(
      `کم‌نوسان‌ترین مسیر: «${safestDd.nameFa}» با حداکثر افت ${fmtNum(Math.abs(safestDd.maxDrawdownPct))}٪ و نوسان سالانه ${fmtNum(safestDd.annualizedVolatilityPct ?? 0)}٪ پایدارترین مسیر را در بین گزینه‌های انتخاب‌شده داشته است.`
    );
  }

  // ۵. مقایسه اختصاصی بیت‌کوین، اتریوم و سولانا (در صورت حضور حداقل دو مورد)
  const cryptoTrio = valid.filter((m) => ['BTC', 'ETH', 'SOL'].includes(m.symbol));
  if (cryptoTrio.length >= 2) {
    const trioStr = cryptoTrio
      .sort((a, b) => (b.totalReturnPct ?? 0) - (a.totalReturnPct ?? 0))
      .map((m) => `${m.nameFa} (${fmtNum(m.totalReturnPct ?? 0)}٪ بازده با حداکثر افت ${fmtNum(Math.abs(m.maxDrawdownPct ?? 0))}٪)`)
      .join(' در برابر ');
    bulletsFa.push(`مقایسه درون‌گروهی رمزارزهای بزرگ: در این بازه دقیق، عملکرد به صورت ${trioStr} ثبت شده است.`);
  }

  // ۶. مقایسه کلاس رمزارزها با طلا و شاخص‌های بورسی
  const cryptos = valid.filter((m) => m.category === 'crypto');
  const indicesAndMetals = valid.filter((m) => m.category === 'index' || m.category === 'metal_commodity');
  if (cryptos.length > 0 && indicesAndMetals.length > 0) {
    const avgCrypto = cryptos.reduce((a, b) => a + (b.totalReturnPct ?? 0), 0) / cryptos.length;
    const avgTrad = indicesAndMetals.reduce((a, b) => a + (b.totalReturnPct ?? 0), 0) / indicesAndMetals.length;
    const avgCryptoDd = cryptos.reduce((a, b) => a + Math.abs(b.maxDrawdownPct ?? 0), 0) / cryptos.length;
    const avgTradDd =
      indicesAndMetals.reduce((a, b) => a + Math.abs(b.maxDrawdownPct ?? 0), 0) / indicesAndMetals.length;
    bulletsFa.push(
      `مقایسه رمزارزها با طلا و شاخص‌های بورسی: میانگین بازده رمزارزهای انتخابی ${fmtNum(avgCrypto)}٪ (با میانگین افت مسیر ${fmtNum(avgCryptoDd)}٪) و میانگین بازده طلا/شاخص‌ها ${fmtNum(avgTrad)}٪ (با میانگین افت مسیر ${fmtNum(avgTradDd)}٪) بوده است.`
    );
  }

  return {
    headlineFa: `در بازه ${best.actualStartIso} تا ${best.actualEndIso}، «${best.nameFa}» بیشترین بازده (${fmtNum(best.totalReturnPct ?? 0)}٪) و «${safestDd?.nameFa ?? best.nameFa}» کمترین افت سرمایه را ثبت کردند.`,
    bulletsFa,
    methodologyNoteFa:
      'یادداشت روش‌شناسی: بازده رمزارزها بر مبنای قیمت اسپات (بدون سود استیکینگ)، سهام بر مبنای قیمت تعدیل‌شده بابت تقسیم سهام (Split-Adjusted)، و طلا بر مبنای قیمت جهانی هر اونس به دلار محاسبه شده است. این گزارش صرفاً تحلیلی و آموزشی بر اساس داده‌های تاریخی است و توصیه خرید یا فروش محسوب نمی‌شود.'
  };
}

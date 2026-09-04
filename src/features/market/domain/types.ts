/** ============================================================
 * Market Discovery — تایپ‌های پایه (طبقه‌بندی استاندارد Markets)
 *
 * سه مفهوم جدا (هرگز یکی نمی‌شوند):
 *  1) Underlying Asset — دارایی اصلی اقتصادی (NVIDIA)
 *  2) Tradable Instrument — محصول قابل معامله (NVDA / NVDAX / NVDAUSDT)
 *  3) Market Data Source — منبع قیمت (Alpha Vantage / CoinGecko)
 *
 * ⚠️ Grouping فقط برای UI/Search/Discovery است — هر Instrument هویت
 *    مستقل دارد و هرگز از نظر مالی با دیگری یکی نمی‌شود.
 * ============================================================ */

/** دسته‌بندی استاندارد Markets */
export type MarketCategory =
  | 'crypto'
  | 'tokenized'
  | 'us-stock'
  | 'etf'
  | 'index'
  | 'commodity'
  | 'bond';

/** گروه‌های سطح بالا برای UI */
export type MarketGroup = 'crypto' | 'tokenized' | 'tradfi';

export const MARKET_GROUP_FA: Record<MarketGroup, string> = {
  crypto: 'رمزارز',
  tokenized: 'دارایی توکن‌ایز',
  tradfi: 'سنتی (TradFi)'
};

/** برچسب فارسی هر دسته */
export const CATEGORY_FA: Record<MarketCategory, string> = {
  crypto: 'رمزارز',
  tokenized: 'دارایی توکن‌ایز',
  'us-stock': 'سهام آمریکا',
  etf: 'ETF',
  index: 'شاخص',
  commodity: 'کامودیتی',
  bond: 'اوراق / درآمد ثابت',
};

/** زیرگروه‌های TradFi برای نمایش */
export const TRADFI_SUBGROUPS: { category: MarketCategory; label: string }[] = [
  { category: 'us-stock', label: 'US Stocks' },
  { category: 'etf', label: 'ETFs' },
  { category: 'index', label: 'Indices' },
  { category: 'commodity', label: 'Commodities' },
  { category: 'bond', label: 'Bonds' }
];

/** منبع داده */
export type MarketDataSource = 'coingecko' | 'alpha-vantage' | 'llama' | 'catalog';

/** نوع محصول */
export type InstrumentType =
  | 'CRYPTO'
  | 'TOKENIZED_STOCK'
  | 'US_EQUITY'
  | 'ETF'
  | 'INDEX'
  | 'COMMODITY'
  | 'BOND';

/** یک Instrument قابل معامله */
export interface MarketInstrument {
  /** شناسه یکتای Instrument (پایدار) */
  instrumentId: string;
  /** نماد معاملاتی (NVDA / NVDAX / NVDAUSDT) */
  symbol: string;
  /** نام نمایشی (ترجیحاً فارسی) */
  nameFa: string;
  /** نام انگلیسی (اگر موجود) */
  nameEn?: string;
  type: InstrumentType;
  category: MarketCategory;
  source: MarketDataSource;
  /** شناسه در منبع */
  sourceId: string;
  /** کلید قیمت زنده (CoinGecko id / نماد AV) */
  liveKey: string;
  /** وضعیت (فقط Trading نمایش داده می‌شود) */
  status: 'Trading' | 'PreLaunch' | 'Closed' | 'Settling' | 'Delivering';
  /** زمان آخرین همگام‌سازی */
  lastSyncedAt: number;
}

/** گروه Underlying — برای Grouping/Discovery فقط */
export interface UnderlyingGroup {
  underlyingId: string;
  underlyingName: string;
  /** سطح اطمینان تطبیق */
  matchConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  instruments: MarketInstrument[];
}

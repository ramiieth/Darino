/** ============================================================
 * کاتالوگ بازارهای مقایسه — فقط تعریف (نام، واحد، منبع)؛ هیچ قیمتی اینجا نیست.
 *
 *  kind:
 *    price      ارزش = سرمایهٔ اولیه × (قیمت پایان ÷ قیمت شروع)
 *    inflation  «حفظ قدرت خرید»: سرمایهٔ اولیه × (شاخص پایان ÷ شاخص شروع)
 *    none       منبع دادهٔ تاریخی معتبر در دسترس نیست → «داده کافی موجود نیست»
 *  currency: واحد قیمت سری (تومانی‌ها با ارزش تومانی شروع مقایسه می‌شوند)
 * ⚠️ بدون alias «@/» — سرور هم شناسه‌ها را می‌خواند.
 * ============================================================ */

export type MarketGroup = 'iran' | 'global';
export type MarketKind = 'price' | 'inflation' | 'none';

export interface MarketDef {
  id: string;
  name: string;
  group: MarketGroup;
  kind: MarketKind;
  currency: 'usd' | 'toman';
  /** شناسهٔ سری (سرور یا سری ساخته‌شده در مرورگر) */
  seriesId: string | null;
  /** چرا داده نداریم (فقط kind=none) */
  missingReason?: string;
  /** تورم رسمی در برابر شاخص جایگزین بازار */
  official?: boolean;
}

/** سری‌هایی که سرور می‌سازد */
export const SERVER_SERIES = ['ir_gold18', 'ir_sekee', 'btc', 'eth', 'sol', 'hype', 'zec', 'gold_global', 'oil_crude', 'oil_brent', 'nvda', 'aapl', 'tsla', 'spx', 'ndx', 'dow_jones', 'msci_world', 'us_cpi', 'ir_cpi_wb'] as const;
export type ServerSeriesId = (typeof SERVER_SERIES)[number];

/** نماد هایپرلیکوئید هر رمزارز ثابت */
export const HL_COINS: Record<string, string> = { btc: 'BTC', eth: 'ETH', sol: 'SOL', hype: 'HYPE', zec: 'ZEC' };

/** نماد مجاز رمزارز منتخب اضافه (نماد هایپرلیکوئید) */
export const EXTRA_COIN_RE = /^[A-Z0-9]{2,10}$/;
export const MAX_EXTRA_COINS = 6;

export const BASE_MARKETS: MarketDef[] = [
  // ─── ایران ───
  { id: 'ir_gold18', name: 'طلای ۱۸ عیار', group: 'iran', kind: 'price', currency: 'toman', seriesId: 'ir_gold18' },
  { id: 'ir_sekee', name: 'سکه امامی', group: 'iran', kind: 'price', currency: 'toman', seriesId: 'ir_sekee' },
  { id: 'ir_usd', name: 'دلار آزاد (نرخ زندهٔ اپ)', group: 'iran', kind: 'price', currency: 'toman', seriesId: 'ir_usd' },
  { id: 'car', name: 'خودرو', group: 'iran', kind: 'price', currency: 'toman', seriesId: 'car' },
  { id: 'ir_cpi', name: 'تورم مصرف‌کنندهٔ ایران (حفظ قدرت خرید)', group: 'iran', kind: 'inflation', currency: 'toman', seriesId: 'ir_cpi', official: true },
  // ─── بین‌المللی و کریپتو ───
  { id: 'btc', name: 'بیت‌کوین', group: 'global', kind: 'price', currency: 'usd', seriesId: 'btc' },
  { id: 'eth', name: 'اتریوم', group: 'global', kind: 'price', currency: 'usd', seriesId: 'eth' },
  { id: 'sol', name: 'سولانا', group: 'global', kind: 'price', currency: 'usd', seriesId: 'sol' },
  { id: 'hype', name: 'هایپرلیکوئید (HYPE)', group: 'global', kind: 'price', currency: 'usd', seriesId: 'hype' },
  { id: 'zec', name: 'زی‌کش (ZEC)', group: 'global', kind: 'price', currency: 'usd', seriesId: 'zec' },
  { id: 'gold_global', name: 'طلای جهانی (انس)', group: 'global', kind: 'price', currency: 'usd', seriesId: 'gold_global' },
  { id: 'oil_crude', name: 'نفت خام تگزاس (WTI)', group: 'global', kind: 'price', currency: 'usd', seriesId: 'oil_crude' },
  { id: 'oil_brent', name: 'نفت خام برنت (Brent)', group: 'global', kind: 'price', currency: 'usd', seriesId: 'oil_brent' },
  { id: 'nvda', name: 'سهام انویدیا (NVDA)', group: 'global', kind: 'price', currency: 'usd', seriesId: 'nvda' },
  { id: 'aapl', name: 'سهام اپل (AAPL)', group: 'global', kind: 'price', currency: 'usd', seriesId: 'aapl' },
  { id: 'tsla', name: 'سهام تسلا (TSLA)', group: 'global', kind: 'price', currency: 'usd', seriesId: 'tsla' },
  { id: 'spx', name: 'شاخص S&P 500', group: 'global', kind: 'price', currency: 'usd', seriesId: 'spx' },
  { id: 'ndx', name: 'شاخص نزدک', group: 'global', kind: 'price', currency: 'usd', seriesId: 'ndx' },
  { id: 'dow_jones', name: 'شاخص داو جونز', group: 'global', kind: 'price', currency: 'usd', seriesId: 'dow_jones' },
  { id: 'msci_world', name: 'سهام جهانی (MSCI World)', group: 'global', kind: 'price', currency: 'usd', seriesId: 'msci_world' },
  { id: 'us_cpi', name: 'دلار با تورم آمریکا (حفظ قدرت خرید)', group: 'global', kind: 'inflation', currency: 'usd', seriesId: 'us_cpi', official: true }
];

/** شناسهٔ بازار ملک هر محله و رمزارز منتخب اضافه */
export const propertyMarketId = (key: string) => `prop:${key}`;
export const carMarketId = (modelId: string) => `car:${modelId}`;
/** میانگین هم‌وزن مدل‌های خودروی منتخب / محله‌های منتخب */
export const CAR_AVG_ID = 'car_avg';
export const PROP_AVG_ID = 'prop_avg';
export const coinMarketId = (sym: string) => `coin:${sym}`;

/** پیش‌فرض‌ها فقط «انتخاب» هستند، نه داده: کدام بازارها روشن باشند و کدام محله‌ها */
export const DEFAULT_ENABLED = [...BASE_MARKETS.map((m) => m.id), 'property'];
export const DEFAULT_NEIGHBORHOODS = ['kianpars', 'kianabad', 'golestan', 'padad', 'shahrak-daneshgah'];
/** مدل‌های car.ir: ۲۰۷ دستی، ۲۰۷ اتوماتیک، تارا دنده‌ای، تارا اتوماتیک */
export const DEFAULT_CAR_MODELS = ['472', '473', '761', '762'];
export const DEFAULTS_VERSION = 2;

/** منبع نمایشی هر سری سرور */
export const SOURCE_FA: Record<string, { name: string; url: string }> = {
  ir_gold18: { name: 'tgju — طلای ۱۸ عیار بازار تهران', url: 'https://www.tgju.org/profile/geram18' },
  ir_sekee: { name: 'tgju — سکه امامی', url: 'https://www.tgju.org/profile/sekee' },
  ir_usd: { name: 'تاریخچهٔ روزانهٔ تتر اپ (والکس/بیت‌پین)', url: 'https://wallex.ir' },
  btc: { name: 'Hyperliquid — کندل روزانه', url: 'https://app.hyperliquid.xyz' },
  eth: { name: 'Hyperliquid — کندل روزانه', url: 'https://app.hyperliquid.xyz' },
  sol: { name: 'Hyperliquid — کندل روزانه', url: 'https://app.hyperliquid.xyz' },
  hype: { name: 'Hyperliquid — کندل روزانه', url: 'https://app.hyperliquid.xyz' },
  zec: { name: 'Hyperliquid — کندل روزانه', url: 'https://app.hyperliquid.xyz' },
  gold_global: { name: 'Yahoo Finance — آتی طلا (GC=F)', url: 'https://finance.yahoo.com/quote/GC=F' },
  oil_crude: { name: 'Yahoo Finance — نفت تگزاس (CL=F)', url: 'https://finance.yahoo.com/quote/CL=F' },
  oil_brent: { name: 'Yahoo Finance — نفت برنت (BZ=F)', url: 'https://finance.yahoo.com/quote/BZ=F' },
  nvda: { name: 'Yahoo Finance — سهام انویدیا (NVDA)', url: 'https://finance.yahoo.com/quote/NVDA' },
  aapl: { name: 'Yahoo Finance — سهام اپل (AAPL)', url: 'https://finance.yahoo.com/quote/AAPL' },
  tsla: { name: 'Yahoo Finance — سهام تسلا (TSLA)', url: 'https://finance.yahoo.com/quote/TSLA' },
  spx: { name: 'Yahoo Finance — ^GSPC', url: 'https://finance.yahoo.com/quote/%5EGSPC' },
  ndx: { name: 'Yahoo Finance — ^IXIC', url: 'https://finance.yahoo.com/quote/%5EIXIC' },
  dow_jones: { name: 'Yahoo Finance — داو جونز (^DJI)', url: 'https://finance.yahoo.com/quote/%5EDJI' },
  msci_world: { name: 'Yahoo Finance — صندوق URTH (MSCI World)', url: 'https://finance.yahoo.com/quote/URTH' },
  us_cpi: { name: 'BLS — CPI-U آمریکا (ماهانه)', url: 'https://www.bls.gov/cpi/' },
  ir_cpi_wb: { name: 'بانک جهانی — CPI ایران (سالانه، FP.CPI.TOTL)', url: 'https://data.worldbank.org/indicator/FP.CPI.TOTL?locations=IR' }
};

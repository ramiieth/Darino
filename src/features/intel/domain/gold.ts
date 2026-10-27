/**
 * «طلای ایران» — قیمت طلای ۱۸ عیار آب‌شده و سکه در برابر ارزش طلای خالصشان
 *
 *   ارزش طلای خالص = انس (دلار) ÷ ۳۱.۱۰۳۵ × گرم خالص × دلار آزاد (تومان)
 *   حباب = قیمت ایران ÷ ارزش طلای خالص − ۱
 *
 * قیمت پلتفرم‌ها: آدرس‌ها و واحدها از github.com/sepehr071/iran-gold-mcp (MIT، سپهر رادمرد)، بازنویسی‌شده.
 * دلار آزاد، طلای بازار، سکه‌ها و تاریخچه از tgju (نشانی‌ها از tgju-mcp همان نویسنده). هیچ کد بیرونی اجرا نمی‌شود.
 * از شبکهٔ Vercel (iad1) میلی، وال‌گلد، ملی‌گلد، دریک و tgju جواب دادند؛ تالین فقط به IP ایران.
 *
 * «بخر/نخر» نمی‌دهد: آزمون ۱۳ سالهٔ «حباب پایین = خرید» (scripts/gold-backtest.ts) از شانس قابل تشخیص نبود.
 * Pure — مشترک بین سرور و کلاینت.
 */

export const GRAMS_PER_OUNCE = 31.1034768;
export const PURITY_18K = 0.75;

/** ارزش جهانی هر گرم طلای ۱۸ عیار به تومان */
export const intrinsicToman = (ounceUsd: number, usdtToman: number) => (ounceUsd / GRAMS_PER_OUNCE) * PURITY_18K * usdtToman;

export type GoldPlatform = 'milli' | 'wallgold' | 'melligold' | 'daric';

export const PLATFORM_FA: Record<GoldPlatform, { name: string; url: string }> = {
  milli: { name: 'میلی', url: 'https://milli.gold' },
  wallgold: { name: 'وال‌گلد', url: 'https://wallgold.ir' },
  melligold: { name: 'ملی‌گلد', url: 'https://melligold.com' },
  daric: { name: 'دریک', url: 'https://daric.gold' }
};

export const PLATFORM_URL: Record<GoldPlatform, string> = {
  milli: 'https://milli.gold/api/v1/public/milli-price/external',
  wallgold: 'https://api.wallgold.ir/api/v1/prices',
  melligold: 'https://melligold.com/api/v1/exchange/buy-sell-price/?symbol=XAU18&format=json',
  daric: 'https://apisc.daric.gold/loan/api/v1/User/Collateral/GetGoldlPrice'
};
/** tgju: تاریخچهٔ روزانهٔ کامل در یک درخواست (طلای ۱۸ از ۲۰۱۳، دلار آزاد، انس، سکه‌ها؛ ریال جز انس) */
export const TGJU_SYMBOLS = ['geram18', 'price_dollar_rl', 'ons', 'sekee', 'nim', 'rob'] as const;
export type TgjuSymbol = (typeof TGJU_SYMBOLS)[number];
export const tgjuHistoryUrl = (symbol: TgjuSymbol, length = 20_000) =>
  `https://api.tgju.org/v1/market/indicator/summary-table-data/${symbol}?lang=fa&start=0&length=${length}&order_col=timestamp&order_dir=desc`;

/** buy = آنچه کاربر برای هر گرم می‌پردازد، sell = آنچه هنگام فروش می‌گیرد (تومان) */
export interface Quote { buy: number; sell: number }

/** قیمت معقول هر گرم ۱۸ عیار: ۱ تا ۱۰۰۰ میلیون تومان (جلوی واحد اشتباه را می‌گیرد) */
const sane = (v: unknown): number | null => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 1_000_000 && n <= 1_000_000_000 ? n : null;
};
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const pair = (buy: unknown, sell: unknown): Quote | null => {
  const b = sane(buy);
  const s = sane(sell);
  return b && s ? { buy: b, sell: s } : null;
};

export function parseQuote(platform: GoldPlatform, body: unknown): Quote | null {
  const root = obj(body);
  if (!root) return null;
  switch (platform) {
    case 'milli': {
      // ریال در هر میلی‌گرم ← ×۱۰۰ = تومان در هر گرم؛ یک قیمت برای خرید و فروش
      const d = obj(root.data);
      const p = root.code === 0 && d ? sane(Number(d.price18) * 100) : null;
      return p ? { buy: p, sell: p } : null;
    }
    case 'wallgold': {
      const rows = Array.isArray(root.result) ? root.result.map(obj).filter((r) => r?.symbol === 'GLD_18C_750TMN') : [];
      const side = (s: string) => rows.find((r) => r?.side === s)?.price;
      return pair(side('buy'), side('sell'));
    }
    case 'melligold': {
      const d = obj(root.data);
      return d ? pair(d.price_buy, d.price_sell) : null;
    }
    case 'daric': {
      // دفتر سفارش: کاربر به بهترین پیشنهاد فروش می‌خرد و به بهترین پیشنهاد خرید می‌فروشد
      const d = obj(root.Data);
      return d ? pair(d.BestSellPrice, d.BestBuyPrice) : null;
    }
  }
}

// ─── تحلیل ──────────────────────────────────────────────────────────────────

export interface PlatformRow extends Quote {
  platform: GoldPlatform;
  /** (خرید − فروش) ÷ میانه؛ هزینهٔ رفت‌وبرگشت بدون کارمزد */
  spread: number;
  premium: number;
}

export interface Decomposition {
  days: number;
  /** تغییر قیمت طلای ۱۸ عیار بازار (tgju) */
  iran: number;
  ounce: number;
  /** دلار آزاد */
  dollar: number;
  /** سهم تغییر حباب: (۱+ایران) ÷ ((۱+انس)(۱+دلار)) − ۱ */
  premium: number;
}

/** توزیع حباب روزانه در تاریخچهٔ tgju */
export interface PremiumStats { p10: number; p50: number; p90: number; days: number; since: number }

export type Coin = 'sekee' | 'nim' | 'rob';
export const COIN_FA: Record<Coin, string> = { sekee: 'سکهٔ امامی', nim: 'نیم‌سکه', rob: 'ربع‌سکه' };
/** گرم طلای خالص: سکهٔ امامی ۸.۱۳۶ گرم با عیار ۰.۹۰۰ */
export const PURE_GRAMS: Record<Coin | 'geram18', number> = { geram18: PURITY_18K, sekee: 7.3224, nim: 3.6612, rob: 1.8306 };
/** ارزش طلای خالص به تومان */
export const pureValueToman = (pureGrams: number, ounceUsd: number, dollarToman: number) => (ounceUsd / GRAMS_PER_OUNCE) * pureGrams * dollarToman;

export interface CoinRow { coin: Coin; price: number; premium: number; stats: PremiumStats | null }

export interface GoldPayload {
  fetchedAt: number;
  ounceUsd: number | null;
  /** دلار آزاد (tgju)؛ اگر نبود، تتر و dollarSource = 'usdt' */
  dollarToman: number | null;
  dollarSource: 'free' | 'usdt';
  usdtToman: number | null;
  intrinsic: number | null;
  /** قیمت طلای ۱۸ عیار بازار (tgju، تومان) */
  bazaar: number | null;
  rows: PlatformRow[];
  failed: GoldPlatform[];
  /** حباب طلای ۱۸ عیار بازار (۰.۰۱ = ۱٪)؛ بدون قیمت بازار، میانهٔ پلتفرم‌ها */
  premium: number | null;
  /** توزیع حباب طلای ۱۸ عیار بازار از ۲۰۱۳ */
  stats: PremiumStats | null;
  coins: CoinRow[];
  decomposition: Decomposition[];
  /** حباب روزانه‌ای که اپ ثبت کرده */
  recordedDays: number;
}

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};

export function platformRows(quotes: Partial<Record<GoldPlatform, Quote>>, intrinsic: number | null): PlatformRow[] {
  return (Object.entries(quotes) as [GoldPlatform, Quote][])
    .map(([platform, q]) => {
      const mid = (q.buy + q.sell) / 2;
      return { platform, ...q, spread: (q.buy - q.sell) / mid, premium: intrinsic ? mid / intrinsic - 1 : Number.NaN };
    })
    .sort((a, b) => a.buy - b.buy);
}

/** تجزیهٔ تغییر قیمت ایران به انس، دلار و حباب */
export function decompose(days: number, iran: [number, number], ounce: [number, number], dollar: [number, number]): Decomposition {
  const ch = ([a, b]: [number, number]) => b / a - 1;
  const i = ch(iran);
  const o = ch(ounce);
  const d = ch(dollar);
  return { days, iran: i, ounce: o, dollar: d, premium: (1 + i) / ((1 + o) * (1 + d)) - 1 };
}

// ─── تاریخچهٔ tgju ───────────────────────────────────────────────────────────

export interface DayClose { t: number; close: number }

/** summary-table-data: [باز، کمینه، بیشینه، بسته، تغییر، ٪، تاریخ میلادی YYYY/MM/DD، شمسی]؛ صعودی */
export function parseTgjuHistory(body: unknown): DayClose[] {
  const rows = Array.isArray(obj(body)?.data) ? (obj(body)!.data as unknown[]) : [];
  return rows
    .map((r) => {
      if (!Array.isArray(r)) return null;
      const [y, m, d] = String(r[6]).split('/').map(Number);
      const close = Number(String(r[3]).replace(/,/g, ''));
      return y && m && d && close > 0 ? { t: Date.UTC(y, m - 1, d), close } : null;
    })
    .filter((x): x is DayClose => !!x)
    .sort((a, b) => a.t - b.t);
}

/** حباب روزانه: قیمت (ریال) ÷ ارزش طلای خالص با انس (آخرین مقدار تا همان روز) × دلار آزاد همان روز (ریال) */
export function premiumSeries(asset: DayClose[], ounce: DayClose[], dollar: DayClose[], pureGrams: number): DayClose[] {
  const usd = new Map(dollar.map((d) => [d.t, d.close]));
  const out: DayClose[] = [];
  let j = 0;
  let o: number | null = null;
  for (const a of asset) {
    while (j < ounce.length && ounce[j].t <= a.t) o = ounce[j++].close;
    const u = usd.get(a.t);
    if (!o || !u) continue;
    const prem = a.close / pureValueToman(pureGrams, o, u) - 1;
    if (Number.isFinite(prem) && Math.abs(prem) < 1) out.push({ t: a.t, close: prem }); // |حباب| ≥ ۱۰۰٪ = دادهٔ خراب
  }
  return out;
}

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
export function premiumStats(series: DayClose[]): PremiumStats | null {
  if (series.length < 250) return null;
  const s = series.map((x) => x.close).sort((a, b) => a - b);
  return { p10: quantile(s, 0.1), p50: quantile(s, 0.5), p90: quantile(s, 0.9), days: series.length, since: series[0].t };
}

// ─── ارزش‌گذاری ─────────────────────────────────────────────────────────────

export type Valuation = 'cheap' | 'rich' | 'fair' | 'unknown';

/**
 * «ارزان/گران» فقط وقتی حباب هم بیرون از ۸۰٪ میانی تاریخچه (p10–p90) است و هم بزرگ‌تر از هزینهٔ رفت‌وبرگشت.
 * بدون تاریخچه، آستانهٔ ثابت: اسپرد + کارمزد (+ فاصلهٔ تتر با دلار آزاد اگر دلار آزاد نبود).
 * دور نقد ۲۷ اکتبر ۲۰۲۶: با تتر حباب ۱.۶٪- بود ولی با دلار آزاد ۰.۳٪+ (میانهٔ ۱۳ سال)؛ «ارزان» گفتن غلط بود.
 * آزمون ۱۳ ساله (scripts/gold-backtest.ts): خرید در حباب پایین از شانس قابل تشخیص نبود؛ این فقط توصیف است.
 */
export const FEE_ROUND_TRIP = 0.01;
export const USDT_BASIS = 0.015;
export function valuation(premium: number | null, rows: PlatformRow[], stats: PremiumStats | null, dollarSource: 'free' | 'usdt' = 'free') {
  const spread = median(rows.map((r) => r.spread).filter(Number.isFinite)) ?? 0;
  const cost = spread + FEE_ROUND_TRIP + (dollarSource === 'usdt' ? USDT_BASIS : 0);
  const low = stats && dollarSource === 'free' ? Math.min(stats.p10, -cost) : -cost;
  const high = stats && dollarSource === 'free' ? Math.max(stats.p90, cost) : cost;
  if (premium === null || !Number.isFinite(premium)) return { state: 'unknown' as Valuation, low, high };
  return { state: (premium <= low ? 'cheap' : premium >= high ? 'rich' : 'fair') as Valuation, low, high };
}

/** فاصلهٔ میانهٔ پلتفرم‌های آنلاین با قیمت بازار (منفی = ارزان‌تر از بازار) */
export function platformsVsBazaar(rows: PlatformRow[], bazaar: number | null): number | null {
  const mid = median(rows.map((r) => (r.buy + r.sell) / 2));
  return mid && bazaar ? mid / bazaar - 1 : null;
}

/** جای حباب امروز در توزیع تاریخی (۰ تا ۱، تقریبی با سه صدک) */
export function percentileOf(premium: number, s: PremiumStats): 'low' | 'mid' | 'high' {
  return premium <= s.p10 ? 'low' : premium >= s.p90 ? 'high' : 'mid';
}

export interface RecordedDay { day: string; premium: number; iran: number; ounce: number; dollar: number }

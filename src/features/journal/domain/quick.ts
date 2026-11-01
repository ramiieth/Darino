/**
 * ورود سریع ژورنال — هرچه از بازار یا تاریخچهٔ خود کاربر معلوم است، به‌جای تایپ پیشنهاد می‌شود (خالص و آزمون‌پذیر)
 *
 *   نمادها: پرکاربردهای خود کاربر (معامله‌ها، برنامه‌ها، دستی‌ها) اول، بعد چند نماد رایج
 *   قیمت در یک لحظهٔ گذشته: کندلی که آن لحظه را در بر دارد (باز اگر اول کندل، وگرنه بسته)
 *   استاپ پیشنهادی: مضربی از میانهٔ دامنهٔ یک ساعت همین بازار (تنگ ۱×، معمولی ۲×، باز ۴×)
 *   هدف: مضرب R از همان استاپ
 *   فارکس: استاپ به پیپ (۱۵/۲۵/۴۰ ارز، ۵۰/۱۰۰/۲۰۰ طلا) وقتی کندل نداریم؛ جفت‌ارزهای متقاطع از دو قیمت لحظه‌ای
 *   اندازه از ارزش دلاری یا لات → واحد دارایی؛ قیمت خروج از سود/زیان دلاری
 *   عددهای آماده (اندازه، سرمایه) تا تایپ آخرین راه باشد
 */
import type { Direction } from './types';
import type { Candle } from './excursions';
import { medianHourRange } from './baseRate';
import { isForexSymbol, pipSize } from './forex';

export const COMMON_CRYPTO = ['BTC', 'ETH', 'SOL', 'HYPE'];
export const COMMON_MT = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY'];

/** فهرست کامل انتخابی (بدون تایپ) */
export const ALL_CRYPTO = ['BTC', 'ETH', 'SOL', 'HYPE', 'XRP', 'BNB', 'DOGE', 'SUI', 'ADA', 'AVAX', 'LINK', 'LTC', 'TON', 'TRX', 'DOT', 'NEAR', 'APT', 'ARB', 'OP', 'PEPE', 'WIF', 'ENA', 'AAVE', 'TAO'];
export const ALL_MT = ['XAUUSD', 'XAGUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'EURJPY', 'GBPJPY', 'EURGBP', 'USOIL', 'UKOIL'];
export const SYMBOL_FA: Record<string, string> = {
  XAUUSD: 'طلا', XAGUSD: 'نقره', EURUSD: 'یورو/دلار', GBPUSD: 'پوند/دلار', USDJPY: 'دلار/ین', AUDUSD: 'دلار استرالیا', USDCAD: 'دلار/کانادا',
  USDCHF: 'دلار/فرانک', NZDUSD: 'دلار نیوزیلند', EURJPY: 'یورو/ین', GBPJPY: 'پوند/ین', EURGBP: 'یورو/پوند', USOIL: 'نفت آمریکا', UKOIL: 'نفت برنت',
  BTC: 'بیت‌کوین', ETH: 'اتریوم', SOL: 'سولانا', HYPE: 'هایپرلیکوئید', XRP: 'ریپل', BNB: 'بی‌ان‌بی', DOGE: 'دوج'
};

/** جفت‌ارز متقاطع → دو قیمت هایپرلیکوئید (ضرب یا تقسیم) برای قیمت لحظه‌ای؛ کندل ندارد */
export function crossOf(symbol: string): { a: string; b: string; op: 'mul' | 'div' } | null {
  const s = symbol.trim().toUpperCase();
  if (s === 'EURJPY') return { a: 'xyz:EUR', b: 'xyz:JPY', op: 'mul' };
  if (s === 'GBPJPY') return { a: 'xyz:GBP', b: 'xyz:JPY', op: 'mul' };
  if (s === 'EURGBP') return { a: 'xyz:EUR', b: 'xyz:GBP', op: 'div' };
  return null;
}

/** استاپ به پیپ برای فارکس وقتی کندل نداریم (یا برای نمایش به پیپ) */
export function pipPresets(symbol: string): Record<StopPreset, number> {
  const s = symbol.toUpperCase();
  const gold = s.startsWith('XAU') || s === 'GOLD';
  const oil = /OIL|UKO|USO|XBR|XTI|BRENT|WTI/.test(s);
  return gold ? { tight: 50, normal: 100, wide: 200 } : oil ? { tight: 30, normal: 60, wide: 120 } : { tight: 15, normal: 25, wide: 40 };
}
export const pipFractions = (symbol: string, entry: number): Record<StopPreset, number> | null => {
  if (!(entry > 0)) return null;
  const p = pipPresets(symbol), pip = pipSize(symbol);
  return { tight: (p.tight * pip) / entry, normal: (p.normal * pip) / entry, wide: (p.wide * pip) / entry };
};
/** فاصله به پیپ (برای برچسب) */
export const toPips = (symbol: string, frac: number, entry: number) => (frac * entry) / pipSize(symbol);

export const USD_SIZES = [100, 500, 1000, 5000];
export const LOT_SIZES = [0.01, 0.05, 0.1, 0.5, 1];
export const CAPITALS = [500, 1000, 5000, 10_000, 25_000];

export type PlanKind = 'crypto' | 'mt';

/** نماد متاتریدر (ارز، طلا، نقره، نفت) یا کریپتو */
export const kindOf = (symbol: string): PlanKind => (isForexSymbol(symbol.trim()) || /^(GOLD|SILVER|BRENT|WTI)$/i.test(symbol.trim()) ? 'mt' : 'crypto');

/** نمادهای پرکاربرد کاربر به ترتیب تعداد، بعد رایج‌ها؛ بدون تکرار */
export function recentSymbols(used: readonly string[], kind: PlanKind | null, max = 8): string[] {
  const count = new Map<string, number>();
  for (const raw of used) {
    const s = raw.trim().toUpperCase();
    if (!s || (kind && kindOf(s) !== kind)) continue;
    count.set(s, (count.get(s) ?? 0) + 1);
  }
  const mine = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  const common = kind === 'mt' ? COMMON_MT : kind === 'crypto' ? COMMON_CRYPTO : [...COMMON_CRYPTO.slice(0, 3), ...COMMON_MT.slice(0, 1)];
  return [...new Set([...mine, ...common])].slice(0, max);
}

/** قیمت بازار در لحظهٔ t از کندل‌ها؛ null = خارج از بازهٔ کندل‌ها */
export function priceAt(candles: readonly Candle[], t: number, intervalMs: number): number | null {
  if (!candles.length || t < candles[0].t || t > candles[candles.length - 1].t + intervalMs) return null;
  let lo = 0, hi = candles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (candles[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  const c = candles[lo];
  return t - c.t < intervalMs / 2 ? c.o : c.c;
}

export const STOP_PRESETS = [
  { key: 'tight', label: 'تنگ', mult: 1 },
  { key: 'normal', label: 'معمولی', mult: 2 },
  { key: 'wide', label: 'باز', mult: 4 }
] as const;
export type StopPreset = (typeof STOP_PRESETS)[number]['key'];
export const R_PRESETS = [1.5, 2, 3] as const;

/** فاصلهٔ استاپ پیشنهادی (کسر قیمت) برای هر حالت از نوسان یک ساعتهٔ همین بازار */
export function stopFractions(candles: readonly Candle[], intervalMs: number): Record<StopPreset, number> | null {
  const hr = medianHourRange(candles.slice(-24 * 30 * Math.max(1, Math.round(3_600_000 / intervalMs))), intervalMs);
  if (!hr || !(hr > 0)) return null;
  return Object.fromEntries(STOP_PRESETS.map((p) => [p.key, hr * p.mult])) as Record<StopPreset, number>;
}

export const stopFrom = (entry: number, frac: number, d: Direction) => entry * (1 - (d === 'long' ? 1 : -1) * frac);
export const targetFrom = (entry: number, stop: number, r: number, d: Direction) => entry + (d === 'long' ? 1 : -1) * Math.abs(entry - stop) * r;

/** گرد کردن قیمت به ارقام معقول آن بازار */
export const digitsFor = (px: number) => (px < 2 ? 5 : px < 20 ? 4 : px < 200 ? 3 : px < 20_000 ? 2 : 1);
export const roundPx = (px: number) => Number(px.toFixed(digitsFor(Math.abs(px))));

export type SizeMode = 'usd' | 'units' | 'lots';

/** اندازه به واحد دارایی از ورودی کاربر */
export function unitsFrom(mode: SizeMode, value: number | null, entry: number | null, contractSize: number | null): number | null {
  if (value === null || !(value > 0)) return null;
  if (mode === 'units') return value;
  if (mode === 'usd') return entry && entry > 0 ? value / entry : null;
  return contractSize ? value * contractSize : null;
}

/** قیمت خروج از سود/زیان دلاری (بدون کارمزد) */
export function exitFromPnl(entry: number, units: number, pnl: number, d: Direction): number | null {
  if (!(units > 0) || !(entry > 0)) return null;
  const px = entry + ((d === 'long' ? 1 : -1) * pnl) / units;
  return px > 0 ? px : null;
}

/** لحظه‌های آماده برای «کی؟» */
export const TIME_PRESETS = [
  { key: 'now', label: 'الان', ago: 0 },
  { key: '1h', label: '۱ ساعت پیش', ago: 3_600_000 },
  { key: '4h', label: '۴ ساعت پیش', ago: 4 * 3_600_000 },
  { key: '1d', label: 'دیروز', ago: 24 * 3_600_000 }
] as const;

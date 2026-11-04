/**
 * ورود سریع برنامه — هرچه از بازار یا تاریخچهٔ خود کاربر معلوم است، به‌جای تایپ پیشنهاد می‌شود (خالص و آزمون‌پذیر)
 *
 *   نمادها: پرکاربردهای خود کاربر (معامله‌ها و برنامه‌ها؛ طلای لایتر XAU و هایپرلیکوئید xyz:GOLD یکی‌اند) اول، بعد چند نماد رایج
 *   قیمت در یک لحظهٔ گذشته: کندلی که آن لحظه را در بر دارد (باز اگر اول کندل، وگرنه بسته)
 *   استاپ پیشنهادی: مضربی از میانهٔ دامنهٔ یک ساعت همین بازار (تنگ ۱×، معمولی ۲×، باز ۴×)
 *   هدف: مضرب R از همان استاپ · عددهای آماده (سرمایه) تا تایپ آخرین راه باشد
 */
import type { Direction } from './types';
import type { Candle } from './excursions';
import { medianHourRange } from './baseRate';
import { baseOf } from './roundTrips';

export const COMMON_SYMBOLS = ['BTC', 'ETH', 'GOLD', 'SOL', 'HYPE'];

/** فهرست کامل انتخابی (بدون تایپ) — طلا و نقره از بازار xyz هایپرلیکوئید / XAU و XAG لایتر */
export const ALL_SYMBOLS = ['BTC', 'ETH', 'GOLD', 'SILVER', 'SOL', 'HYPE', 'XRP', 'BNB', 'DOGE', 'SUI', 'ADA', 'AVAX', 'LINK', 'LTC', 'TON', 'TRX', 'DOT', 'NEAR', 'APT', 'ARB', 'OP', 'PEPE', 'WIF', 'ENA', 'AAVE', 'TAO'];
export const SYMBOL_FA: Record<string, string> = {
  GOLD: 'طلا', SILVER: 'نقره', BTC: 'بیت‌کوین', ETH: 'اتریوم', SOL: 'سولانا', HYPE: 'هایپرلیکوئید', XRP: 'ریپل', BNB: 'بی‌ان‌بی', DOGE: 'دوج'
};

export const CAPITALS = [500, 1000, 5000, 10_000, 25_000];

/** نمادهای پرکاربرد کاربر به ترتیب تعداد (دارایی پایه)، بعد رایج‌ها؛ بدون تکرار */
export function recentSymbols(used: readonly string[], max = 8): string[] {
  const count = new Map<string, number>();
  for (const raw of used) {
    if (!raw.trim()) continue;
    const s = baseOf(raw);
    count.set(s, (count.get(s) ?? 0) + 1);
  }
  const mine = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  return [...new Set([...mine, ...COMMON_SYMBOLS])].slice(0, max);
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

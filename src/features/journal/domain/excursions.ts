/**
 * مسیر قیمت در طول هر معامله: MAE (بیشترین حرکت خلاف) و MFE (بیشترین حرکت موافق) — خالص و آزمون‌پذیر
 *
 *   منبع مسیر: کندل‌های پرپ هایپرلیکوئید هم‌نام (xyz:GOLD، xyz:EUR، xyz:BRENTOIL، xyz:CL؛ یا نماد خود حساب هایپرلیکوئید).
 *   هایپرلیکوئید فقط ۵۰۰۰ کندل اخیر هر بازه را می‌دهد: ۵ دقیقه ≈ ۱۷ روز، ۱۵ دقیقه ≈ ۵۲ روز، ۱ ساعت ≈ ۲۰۸ روز، ۴ ساعت تا شروع بازار.
 *   برای هر معامله ریزترین بازه‌ای که کل آن را پوشش دهد انتخاب می‌شود؛ کمتر از ۳ کندل = «اندازه‌گیری نشد».
 *
 *   حرکت‌ها نسبی‌اند (٪ از قیمت پرپ در کندل ورود)، پس اختلاف پایهٔ پرپ با قیمت بروکر حذف می‌شود؛
 *   برای نمایش به واحد قیمت بروکر در قیمت ورود ضرب می‌شوند. کندل اول و آخر کامل شمرده می‌شوند (کمی بیش‌برآورد).
 *   متاتریدر آخر هفته بسته است: کندل‌های جمعه ۲۱:۰۰ تا یکشنبه ۲۱:۰۰ UTC برای معاملهٔ متاتریدر حذف می‌شوند.
 *
 *   شبیه‌سازی قانون (استاپ، هدف، سربه‌سر) کندل‌به‌کندل است؛ اگر استاپ و هدف در یک کندل لمس شوند، استاپ فرض می‌شود
 *   (بدبینانه). اگر هیچ‌کدام لمس نشود، خروج واقعی شما می‌ماند. همهٔ اعداد درون‌نمونه‌اند، نه پیش‌بینی.
 */
import type { Trade } from './types';

export interface Candle { t: number; o: number; h: number; l: number; c: number }
export interface CandleSet { coin: string; intervalMs: number; candles: Candle[] }

export const INTERVALS = [
  { key: '5m', ms: 5 * 60_000 },
  { key: '15m', ms: 15 * 60_000 },
  { key: '1h', ms: 3_600_000 },
  { key: '4h', ms: 4 * 3_600_000 }
] as const;
export const HL_CANDLE_CAP = 5000;
export const MIN_PATH = 3;

/** نماد متاتریدر/پلتفرم → کوین کندل هایپرلیکوئید؛ null = منبع مسیر نداریم */
export function candleCoin(t: Pick<Trade, 'venue' | 'symbol'>): string | null {
  if (t.venue === 'hyperliquid') return t.symbol;
  if (t.venue !== 'metatrader') return null;
  const s = t.symbol.toUpperCase();
  if (/^(XAUUSD|GOLD)$/.test(s)) return 'xyz:GOLD';
  if (/^(XAGUSD|SILVER)$/.test(s)) return 'xyz:SILVER';
  if (s === 'EURUSD') return 'xyz:EUR';
  if (s === 'GBPUSD') return 'xyz:GBP';
  if (s === 'USDJPY') return 'xyz:JPY';
  if (/^(UKOUSD|UKOIL|XBRUSD|BRENT|BRN)$/.test(s)) return 'xyz:BRENTOIL';
  if (/^(USOUSD|USOIL|XTIUSD|WTI|CL)$/.test(s)) return 'xyz:CL';
  return null;
}

/** ریزترین بازه‌ای که شروع معامله هنوز در ۵۰۰۰ کندل اخیرش است */
export function intervalFor(openTime: number, now: number): (typeof INTERVALS)[number] | null {
  return INTERVALS.find((i) => openTime >= now - (HL_CANDLE_CAP - 2) * i.ms) ?? null;
}

/** جمعه ۲۱:۰۰ تا یکشنبه ۲۱:۰۰ UTC — تقریب تعطیلی بازار نقدی */
export function inWeekendGap(t: number): boolean {
  const d = new Date(t);
  const wd = d.getUTCDay(), h = d.getUTCHours();
  return (wd === 5 && h >= 21) || wd === 6 || (wd === 0 && h < 21);
}

export interface Excursion {
  tradeId: string;
  symbol: string;
  coin: string;
  direction: Trade['direction'];
  win: boolean;
  intervalMs: number;
  /** کسری از قیمت ورود (۰٫۰۱ = ۱٪) */
  mae: number;
  mfe: number;
  realized: number;
  entryPx: number;
  /** دلار به ازای هر واحد کسری حرکت (ارزش اسمی مؤثر) */
  notional: number;
  netPnl: number;
  /** مسیر نسبی برای شبیه‌سازی: [موافق، خلاف] هر کندل به‌ترتیب زمان */
  path: [number, number][];
}

export interface Unmeasured { tradeId: string; symbol: string; reason: 'no-source' | 'too-old' | 'too-short' | 'no-data' }

/** ارزش اسمی مؤثر: از نسبت سود به حرکت (مستقل از اندازهٔ قرارداد)؛ وگرنه ارزش اسمی ثبت‌شده */
function effectiveNotional(t: Trade, realized: number): number {
  return Math.abs(realized) > 1e-4 && t.grossPnl !== 0 ? Math.abs(t.grossPnl / realized) : t.maxNotional;
}

export function measure(t: Trade, set: CandleSet | undefined, now: number): Excursion | Unmeasured {
  const base = { tradeId: t.id, symbol: t.symbol };
  const coin = candleCoin(t);
  if (!coin) return { ...base, reason: 'no-source' };
  if (!intervalFor(t.openTime, now)) return { ...base, reason: 'too-old' };
  if (!set || !set.candles.length || t.entryPx === null || t.exitPx === null || t.closeTime === null) return { ...base, reason: 'no-data' };
  const iv = set.intervalMs;
  const first = set.candles[0].t;
  if (t.openTime < first) return { ...base, reason: 'too-old' };
  const skipWeekend = t.venue === 'metatrader';
  const path = set.candles.filter((k) => k.t + iv > t.openTime && k.t < t.closeTime! && !(skipWeekend && inWeekendGap(k.t)));
  if (path.length < MIN_PATH) return { ...base, reason: 'too-short' };
  const ref = path[0].o;
  if (!(ref > 0)) return { ...base, reason: 'no-data' };
  const long = t.direction === 'long';
  const rel: [number, number][] = path.map((k) => (long ? [k.h / ref - 1, 1 - k.l / ref] : [1 - k.l / ref, k.h / ref - 1]));
  const mfe = Math.max(0, ...rel.map((r) => r[0]));
  const mae = Math.max(0, ...rel.map((r) => r[1]));
  const realized = ((t.exitPx - t.entryPx) / t.entryPx) * (long ? 1 : -1);
  return { ...base, coin, direction: t.direction, win: t.netPnl > 0, intervalMs: iv, mae, mfe, realized, entryPx: t.entryPx, notional: effectiveNotional(t, realized), netPnl: t.netPnl, path: rel };
}

export const isMeasured = (x: Excursion | Unmeasured): x is Excursion => 'path' in x;

/* ---------------- شبیه‌سازی قانون ---------------- */

export interface Rule { stop: number | null; target: number | null; breakevenAt: number | null }

/** نتیجهٔ کسری یک معامله زیر قانون؛ لمس هم‌زمان استاپ و هدف در یک کندل = استاپ */
export function simulate(e: Excursion, rule: Rule): number {
  let stop = rule.stop;
  for (const [fav, adv] of e.path) {
    if (stop !== null && adv >= stop) return stop > 0 ? -stop : 0;
    if (rule.target !== null && fav >= rule.target) return rule.target;
    if (rule.breakevenAt !== null && fav >= rule.breakevenAt && (stop === null || stop > 0)) stop = 0;
  }
  return e.realized;
}

/** تغییر دلاری کل اگر قانون روی همین معاملات اجرا شده بود (بدون تغییر کارمزد) */
export function ruleDelta(list: readonly Excursion[], rule: Rule): { delta: number; changed: number } {
  let delta = 0, changed = 0;
  for (const e of list) {
    const r = simulate(e, rule);
    if (Math.abs(r - e.realized) > 1e-9) changed++;
    delta += (r - e.realized) * e.notional;
  }
  return { delta, changed };
}

/* ---------------- خلاصهٔ هر نماد و پیشنهاد ---------------- */

export function quantile(xs: readonly number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export const MIN_TRADES = 20;
export const MIN_WINNERS = 8;

export interface SymbolExcursions {
  symbol: string;
  n: number;
  winners: number;
  losers: number;
  /** قیمت ورود میانه برای تبدیل کسر به واحد قیمت */
  refPx: number;
  winnerMae: { p50: number | null; p80: number | null; p90: number | null };
  loserRealized: number | null;
  winnerMfe: number | null;
  winnerRealized: number | null;
  /** میانهٔ «سهم گرفته‌شده از حرکت» در برنده‌ها */
  capture: number | null;
  /** سهم بازنده‌هایی که پیش از ضرر به اندازهٔ زیان میانه در سود بودند */
  losersOnceUp: number | null;
  stop: { level: number; delta: number; changed: number } | null;
  target: { level: number; delta: number; changed: number } | null;
  breakeven: { trigger: number; delta: number; changed: number } | null;
  /** نمونه برای پیشنهاد کافی است؟ وگرنه فقط فرضیه */
  enough: boolean;
}

export function summarize(list: readonly Excursion[]): SymbolExcursions[] {
  const by = new Map<string, Excursion[]>();
  for (const e of list) (by.get(e.symbol) ?? by.set(e.symbol, []).get(e.symbol)!).push(e);
  const out: SymbolExcursions[] = [];
  for (const [symbol, xs] of by) {
    const w = xs.filter((e) => e.win), l = xs.filter((e) => !e.win);
    const wMae = w.map((e) => e.mae);
    const loserRealized = quantile(l.map((e) => -e.realized), 0.5);
    const winnerMfe = quantile(w.map((e) => e.mfe), 0.5);
    const p90 = quantile(wMae, 0.9);
    const stop = p90 !== null && p90 > 0 ? { level: p90, ...ruleDelta(xs, { stop: p90, target: null, breakevenAt: null }) } : null;
    const target = winnerMfe !== null && winnerMfe > 0 ? { level: winnerMfe, ...ruleDelta(xs, { stop: null, target: winnerMfe, breakevenAt: null }) } : null;
    const trigger = loserRealized !== null && loserRealized > 0 ? loserRealized : null;
    const breakeven = trigger !== null ? { trigger, ...ruleDelta(xs, { stop: null, target: null, breakevenAt: trigger }) } : null;
    out.push({
      symbol,
      n: xs.length,
      winners: w.length,
      losers: l.length,
      refPx: quantile(xs.map((e) => e.entryPx), 0.5) ?? 0,
      winnerMae: { p50: quantile(wMae, 0.5), p80: quantile(wMae, 0.8), p90 },
      loserRealized,
      winnerMfe,
      winnerRealized: quantile(w.map((e) => e.realized), 0.5),
      capture: quantile(w.filter((e) => e.mfe > 0).map((e) => Math.min(1, Math.max(0, e.realized / e.mfe))), 0.5),
      losersOnceUp: trigger !== null && l.length ? l.filter((e) => e.mfe >= trigger).length / l.length : null,
      stop,
      target,
      breakeven,
      enough: xs.length >= MIN_TRADES && w.length >= MIN_WINNERS
    });
  }
  return out.sort((a, b) => b.n - a.n);
}

/** کندل‌های لازم: برای هر کوین، بازه‌هایی که دست‌کم یک معامله به آن نیاز دارد */
export function candleNeeds(trades: readonly Trade[], now: number): { coin: string; interval: (typeof INTERVALS)[number] }[] {
  const keys = new Map<string, { coin: string; interval: (typeof INTERVALS)[number] }>();
  for (const t of trades) {
    const coin = candleCoin(t);
    const iv = coin && !t.open ? intervalFor(t.openTime, now) : null;
    if (coin && iv) keys.set(`${coin}|${iv.key}`, { coin, interval: iv });
  }
  return [...keys.values()];
}

export function excursionsFor(trades: readonly Trade[], sets: ReadonlyMap<string, CandleSet>, now: number): { measured: Excursion[]; unmeasured: Unmeasured[] } {
  const measured: Excursion[] = [], unmeasured: Unmeasured[] = [];
  for (const t of trades) {
    if (t.open || t.truncated) continue;
    const coin = candleCoin(t);
    const iv = intervalFor(t.openTime, now);
    const r = measure(t, coin && iv ? sets.get(`${coin}|${iv.key}`) : undefined, now);
    if (isMeasured(r)) measured.push(r);
    else unmeasured.push(r);
  }
  return { measured, unmeasured };
}


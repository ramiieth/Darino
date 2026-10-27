/**
 * «سوینگ» — ابزار ریسک برای معاملهٔ چندروزه تا چندهفته‌ای، از آزمون scripts/swing-backtest.ts
 *
 * آزمون (۱۸۴ پرپ هایپرلیکوئید شامل حذف‌شده‌ها، ژوئیهٔ ۲۰۲۳ تا آوریل ۲۰۲۶ + ۶ ماه مهروموم؛ ۵۵ سهم/شاخص/
 * کامودیتی از ۲۰۱۰؛ هزینهٔ ۰.۳٪، ورود روز بعد از سیگنال، نال جابه‌جایی زمانی، بونفرونی روی ۴۰ آزمون):
 *   هیچ سیگنال ورودی (روند، مومنتوم، پولبک، فاندینگ منفی، رژیم) قبول نشد.
 *   روند/پولبک/مومنتوم آلت‌کوین در ۲۰ روز فقط در ۳۱–۳۵٪ معاملات از نگه‌داشتن BTC بهتر بودند.
 *   فاندینگ شلوغ آبشار را پیش‌بینی نکرد (۲ از ۱۷ دورهٔ شلوغ؛ ۸ از ۱۰ بدترین روز در بازار غیرشلوغ).
 * پس این ماژول سیگنال خرید نمی‌دهد؛ رژیم بازار، اندازهٔ پوزیشن از ریزش‌های واقعی وسط معامله، و یک کاندید
 * «آزمایشی» (D+E) با ثبت عملکرد زنده. Pure — مشترک بین سرور و کلاینت.
 */

export interface DayBar {
  /** شروع روز UTC (ms) */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

/** کوین‌هایی که کاربر هرگز معامله نمی‌کند؛ در اسکنر نشان داده نمی‌شوند (رژیم بازار با آن‌ها حساب می‌شود) */
export const EXCLUDE = new Set([
  'BLUR', 'BIO', 'TURBO', 'MERL', 'AXS', 'ZETA', 'PNUT', 'YGG', 'MANTA', 'DYM', 'BRETT', 'UMA', 'MOODENG',
  'BIGTIME', 'CELO', 'BERA', 'IOTA', 'KAS', 'ICP'
]);

/** جهان: ۶۰ پرپ پرحجم هایپرلیکوئید (همان آزمون) */
export const UNIVERSE_SIZE = 60;
/** رژیم صعودی: BTC بالای میانگین ۲۰۰ روزه و دست‌کم نیمی از جهان بالای میانگین ۵۰ روزهٔ خودشان */
export const REGIME_BREADTH = 0.5;
const MIN_REGIME_COINS = 20;
const SMA_LONG = 200;
const SMA_SHORT = 50;

export const sma = (xs: number[], n: number): number | null =>
  xs.length < n ? null : xs.slice(-n).reduce((s, x) => s + x, 0) / n;

export interface CoinTrend {
  coin: string;
  close: number;
  sma50: number | null;
  sma200: number | null;
  /** بازده ۲۸ روز */
  ret28: number | null;
}

/** روندِ آخرین روز بسته‌شده؛ bars صعودی و فقط روزهای کامل */
export function trendOf(coin: string, bars: DayBar[]): CoinTrend | null {
  if (!bars.length) return null;
  const closes = bars.map((b) => b.c);
  const close = closes[closes.length - 1];
  return {
    coin,
    close,
    sma50: sma(closes, SMA_SHORT),
    sma200: sma(closes, SMA_LONG),
    ret28: closes.length > 28 ? close / closes[closes.length - 29] - 1 : null
  };
}

export interface Regime {
  state: 'on' | 'off' | 'unknown';
  btcAbove200: boolean | null;
  /** سهم کوین‌های جهان بالای میانگین ۵۰ روزه (۰ تا ۱) */
  breadth: number | null;
  counted: number;
}

export function regimeOf(btc: CoinTrend | null, universe: CoinTrend[]): Regime {
  const ready = universe.filter((t) => t.sma50 !== null);
  const breadth = ready.length ? ready.filter((t) => t.close > t.sma50!).length / ready.length : null;
  const btcAbove200 = btc?.sma200 == null ? null : btc.close > btc.sma200;
  if (btcAbove200 === null || ready.length < MIN_REGIME_COINS) return { state: 'unknown', btcAbove200, breadth, counted: ready.length };
  return { state: btcAbove200 && breadth! >= REGIME_BREADTH ? 'on' : 'off', btcAbove200, breadth, counted: ready.length };
}

/**
 * کاندید آزمایشی D+E: رژیم صعودی + قیمت بالای میانگین ۵۰ روزه + میانگین فاندینگ ۷۲ ساعت منفی (شورت‌ها شلوغ).
 * داخل‌نمونه ۱۸۸ معامله، ۵۳٪ برد، میانه +۱.۹٪، +۲.۱٪ بهتر از BTC (p=0.04)؛ ۶ ماه مهروموم ۲۲ معامله، ۷۳٪ برد،
 * +۱۴٪ (p=0.027، حد اعلام‌شده 0.025). اثبات نشده؛ افق ۲۰ روز.
 */
export const EXPERIMENT_HOLD_DAYS = 20;
export function isExperimental(t: CoinTrend, funding72hSum: number | null, regime: Regime): boolean {
  return regime.state === 'on' && t.sma50 !== null && t.close > t.sma50 && funding72hSum !== null && funding72hSum < 0;
}

/** پیش‌فیلتر ارزان پیش از دریافت تاریخچهٔ فاندینگ: نرخ پایهٔ هایپرلیکوئید ۰.۰۰۱۲۵٪ در ساعت است؛ بالاتر از آن
 *  میانگین ۷۲ ساعت به‌ندرت منفی است */
export const FUNDING_BASE_HOURLY = 0.0000125;
export const mayBeExperimental = (t: CoinTrend, fundingHourly: number, regime: Regime) =>
  regime.state === 'on' && t.sma50 !== null && t.close > t.sma50 && fundingHourly < FUNDING_BASE_HOURLY;

// ─── اندازهٔ پوزیشن ─────────────────────────────────────────────────────────

export type AssetClass = 'crypto' | 'tradfi';
export type Horizon = 5 | 20;

/** ریزش وسط معامله در ۵٪ بدترین معاملات (نسخهٔ واقع‌بینانهٔ آزمون، همهٔ روزهای رژیم):
 *  close = با قیمت بسته (کسی که بدون حد ضرر نگه می‌دارد)، low = با فتیله (حد ضرر و لیکوئید با این فعال می‌شوند).
 *  آلت‌کوین‌ها؛ BTC و ETH معمولاً کمتر می‌ریزند */
export const DRAWDOWN_P5: Record<AssetClass, Record<Horizon, { close: number; low: number }>> = {
  crypto: { 5: { close: 0.21, low: 0.29 }, 20: { close: 0.37, low: 0.5 } },
  tradfi: { 5: { close: 0.086, low: 0.103 }, 20: { close: 0.194, low: 0.214 } }
};

/** سهم خریدهای آلت‌کوین (روند/پولبک/مومنتوم، ۲۰ روز) که از نگه‌داشتن BTC در همان بازه بهتر بودند */
export const ALT_BEAT_BTC_20D = { low: 0.31, high: 0.35 };

export interface Sizing {
  /** ریزشی که اندازه با آن حساب شد (۰ تا ۱) */
  drawdown: number;
  /** حداکثر حجم اسپات تا در ریزش ۱ از ۲۰ معامله بیش از ریسک تعیین‌شده از دست نرود */
  spotMaxUsd: number;
  /** حداکثر اهرم پرپ تا ریزش با فتیله در ۱ از ۲۰ معامله لیکوئید نکند (مارجین ایزوله) */
  perpMaxLeverage: number;
  /** با همان ریسک، مارجینی که در پرپ می‌گذارید (کل مارجین در بدترین حالت از دست می‌رود) */
  perpMarginUsd: number;
}

/** maxLeverage بازار برای مارجین نگهداری (نصف مارجین اولیه در حداکثر اهرم) */
export function sizeFor(capital: number, riskPct: number, cls: AssetClass, h: Horizon, maxLeverage = 20): Sizing | null {
  if (!(capital > 0) || !(riskPct > 0)) return null;
  const dd = DRAWDOWN_P5[cls][h];
  const risk = (capital * riskPct) / 100;
  const mmr = 1 / (2 * Math.max(1, maxLeverage));
  return {
    drawdown: dd.close,
    spotMaxUsd: Math.min(capital, risk / dd.close),
    perpMaxLeverage: Math.max(1, Math.floor((1 / (dd.low + mmr)) * 10) / 10),
    perpMarginUsd: Math.min(capital, risk)
  };
}

// ─── ثبت عملکرد زندهٔ کاندید آزمایشی ──────────────────────────────────────────

export interface LogEntry {
  coin: string;
  /** روز سیگنال (بستهٔ این روز)؛ ورود با بازشدن روز بعد */
  day: number;
  entry: number | null;
  exit: number | null;
}

const DAY_MS = 86_400_000;

/** ورود = بازشدن روز بعد، خروج = بستهٔ روز +۲۰؛ فقط وقتی کندلش بسته شده باشد */
export function settle(e: LogEntry, bars: DayBar[]): LogEntry {
  const at = (t: number) => bars.find((b) => b.t === t);
  const entry = e.entry ?? at(e.day + DAY_MS)?.o ?? null;
  const exit = e.exit ?? (entry === null ? null : at(e.day + EXPERIMENT_HOLD_DAYS * DAY_MS)?.c ?? null);
  return { ...e, entry, exit };
}

/** سیگنال تازه فقط اگر همان کوین معاملهٔ بازی ندارد (همان قفل آزمون) */
export function addSignals(log: LogEntry[], coins: string[], day: number): LogEntry[] {
  const open = new Set(log.filter((e) => day - e.day <= EXPERIMENT_HOLD_DAYS * DAY_MS).map((e) => e.coin));
  return [...log, ...coins.filter((c) => !open.has(c)).map((coin) => ({ coin, day, entry: null, exit: null }))];
}

export interface LogSummary {
  total: number;
  closed: number;
  wins: number;
  /** میانگین بازده خالص معاملات بسته (هزینهٔ ۰.۳٪) */
  meanNet: number | null;
}

export const SPOT_COST = 0.003;
export function summarize(log: LogEntry[]): LogSummary {
  const closed = log.filter((e) => e.entry && e.exit).map((e) => e.exit! / e.entry! - 1 - SPOT_COST);
  return {
    total: log.length,
    closed: closed.length,
    wins: closed.filter((r) => r > 0).length,
    meanNet: closed.length ? closed.reduce((s, r) => s + r, 0) / closed.length : null
  };
}

// ─── خروجی سرور ──────────────────────────────────────────────────────────────

export interface SwingCandidate {
  coin: string;
  close: number;
  sma50: number;
  /** میانگین فاندینگ ساعتی ۷۲ ساعت گذشته */
  fundingHourly72h: number;
}

export interface SwingPayload {
  fetchedAt: number;
  /** آخرین روز بسته‌شده‌ای که محاسبه روی آن است */
  day: number | null;
  regime: Regime;
  btc: CoinTrend | null;
  candidates: SwingCandidate[];
  log: LogEntry[];
  summary: LogSummary;
  pending: number;
  total: number;
}

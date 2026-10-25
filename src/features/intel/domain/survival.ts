/**
 * «چک قبل از ورود» — دو بخش جدا، چون هیچ مدلی آبشار را پیش‌بینی نمی‌کند:
 *
 * ۱) ریسک در شرایط عادی: احتمال لیکوئید طی ۲۴ ساعت و ۷ روز با «تاریخچهٔ مقیاس‌شده با نوسان»:
 *    هر حرکت خلاف جهت گذشته بر نوسانِ همان لحظه تقسیم و با نوسان امروز دوباره مقیاس می‌شود
 *    (دم‌های چاق حفظ می‌شود و با تلاطم بازار احتمال بالا می‌رود).
 *    آزمون عقب‌گرد روی ۱۰ بازار هایپرلیکوئید، ژوئیهٔ ۲۰۲۴ تا اکتبر ۲۰۲۶ (~۴۰۰ هزار پیش‌بینی):
 *    پیش‌بینی ۱–۳٪ ← واقعی ۱.۶٪ (۲۴ ساعت) و ۲.۰٪ (۷ روز)؛ «حداکثر اهرم با ریسک ۷ روزهٔ ≤ ۵٪»
 *    در واقعیت ۳.۱٪ لیکوئید شد. زیر ۱٪ مدل کم‌برآورد است، پس کف نمایش ۰.۲٪ و ۲٪.
 * ۲) سناریوی آبشار: بدترین حرکت ۲۴ ساعتهٔ واقعی همین بازار در تاریخچه (برای بیشتر بازارها ۱۰ اکتبر ۲۰۲۵).
 *    صبح آن روز همهٔ مدل‌ها برای ۳x آلت‌کوین‌ها ~۰٪ گفتند و همه لیکوئید شدند؛ اینجا احتمال نیست، دستور است.
 *
 * ورودی کندل ۴ ساعته (تا ۵۰۰۰ عدد ≈ ۲.۳ سال). لیکوئید برای مارجین ایزوله تخمین زده می‌شود؛ مارجین
 * نگهداری هایپرلیکوئید = نصف مارجین اولیه در حداکثر اهرم. کندل قیمت معامله است و لیکوئید با قیمت مارک،
 * پس فتیله‌ها کمی عمیق‌تر از مارک‌اند (محافظه‌کارانه). Pure.
 */

export type Side = 'long' | 'short';

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

/** افق‌ها به تعداد کندل ۴ ساعته */
const H24 = 6;
const H7D = 42;
/** نیمه‌عمر نوسان EWMA: ۶ کندل = ۲۴ ساعت (بهترین در آزمون عقب‌گرد) */
const HALF_LIFE = 6;
/** کمتر از ۱۸۰ روز: حکم نمی‌دهیم؛ کمتر از ۱ سال: هشدار سابقهٔ کوتاه */
const MIN_BARS = 180 * 6;
const SHORT_BARS = 365 * 6;
/** کف نمایش احتمال؛ زیر این مقدار مدل در آزمون کم‌برآورد بود */
export const FLOOR_24H = 0.2;
export const FLOOR_7D = 2;
/** هدف اهرم پیشنهادی: ریسک ۷ روزه ≤ ۵٪ */
export const SAFE_TARGET_7D = 5;

/** مارجین نگهداری هایپرلیکوئید (نسبت) */
export const maintenanceRate = (maxLeverage: number) => 1 / (2 * Math.max(1, maxLeverage));

/** فاصلهٔ لیکوئید ایزوله از ورود، به ٪ حرکت خلاف جهت */
export function liqDistancePct(side: Side, leverage: number, maxLeverage: number): number {
  const mmr = maintenanceRate(maxLeverage);
  const l = Math.max(1, leverage);
  return side === 'long' ? (1 - (1 - 1 / l) / (1 - mmr)) * 100 : ((1 + 1 / l) / (1 + mmr) - 1) * 100;
}

/** ٪ حرکت ساده ↔ لگاریتم حرکت خلاف جهت */
const toLog = (side: Side, pct: number) => (side === 'long' ? -Math.log(1 - Math.min(pct, 99.9999) / 100) : Math.log(1 + pct / 100));
const toPct = (side: Side, x: number) => (side === 'long' ? (1 - Math.exp(-x)) * 100 : (Math.exp(x) - 1) * 100);

/** نوسان EWMA بازده لگاریتمی هر کندل (اندیس ۰ ندارد) */
export function ewmaSigma(candles: Candle[], halfLife = HALF_LIFE): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < 3) return out;
  const lam = 0.5 ** (1 / halfLife);
  const r = (i: number) => Math.log(candles[i].c / candles[i - 1].c);
  const warm = Math.min(48, candles.length - 1);
  let v = 0;
  for (let i = 1; i <= warm; i++) v += r(i) ** 2;
  v /= warm;
  for (let i = 1; i < candles.length; i++) {
    v = lam * v + (1 - lam) * r(i) ** 2;
    out[i] = Math.sqrt(v);
  }
  return out;
}

/**
 * لگاریتم بیشترین حرکت خلاف جهت از بسته‌شدن کندل i طی کندل‌های (i, i+horizon]
 * لانگ: تا پایین‌ترین low؛ شورت: تا بالاترین high. اندیس‌هایی که افق کامل ندارند null.
 */
export function adverseExcursions(candles: Candle[], side: Side, horizon: number): (number | null)[] {
  const n = candles.length;
  const out: (number | null)[] = new Array(n).fill(null);
  const dq: number[] = [];
  let head = 0;
  /** a دست‌کم به اندازهٔ b خلاف جهت است */
  const atLeastAsBad = (a: number, b: number) => (side === 'long' ? candles[a].l <= candles[b].l : candles[a].h >= candles[b].h);
  // صف یکنوا روی پنجرهٔ لغزان (i, i+horizon]، از انتها به ابتدا؛ سر صف بدترین کندل پنجره است
  for (let i = n - 2; i >= 0; i--) {
    const j = i + 1;
    while (dq.length > head && atLeastAsBad(j, dq[dq.length - 1])) dq.pop();
    dq.push(j);
    while (dq[head] > i + horizon) head++;
    if (i + horizon < n) {
      const e = candles[i].c;
      const k = candles[dq[head]];
      out[i] = side === 'long' ? Math.max(0, Math.log(e / k.l)) : Math.max(0, Math.log(k.h / e));
    }
  }
  return out;
}

export interface RiskModel {
  side: Side;
  /** حرکت‌های استانداردشده (حرکت ÷ نوسان آن لحظه)، مرتب صعودی */
  z24: number[];
  z7d: number[];
  sigmaNow: number | null;
  /** بدترین حرکت خلاف ۲۴ ساعته در کل تاریخچه (٪) و زمان شروعش */
  crashPct: number | null;
  crashAt: number | null;
  days: number;
  enough: boolean;
  shortHistory: boolean;
}

export function buildRiskModel(raw: Candle[], side: Side): RiskModel {
  const candles = raw.filter((k) => k.c > 0 && k.l > 0).sort((a, b) => a.t - b.t);
  const sig = ewmaSigma(candles);
  const ex24 = adverseExcursions(candles, side, H24);
  const ex7 = adverseExcursions(candles, side, H7D);
  const z = (ex: (number | null)[]) => {
    const out: number[] = [];
    for (let i = 1; i < ex.length; i++) {
      const s = sig[i];
      const e = ex[i];
      if (s && e !== null) out.push(e / s);
    }
    return out.sort((a, b) => a - b);
  };
  let crash: number | null = null;
  let crashAt: number | null = null;
  for (let i = 0; i < ex24.length; i++) {
    const e = ex24[i];
    if (e !== null && (crash === null || e > crash)) {
      crash = e;
      crashAt = candles[i].t;
    }
  }
  return {
    side,
    z24: z(ex24),
    z7d: z(ex7),
    sigmaNow: sig[sig.length - 1] ?? null,
    crashPct: crash === null ? null : toPct(side, crash),
    crashAt,
    days: candles.length > 1 ? Math.round((candles[candles.length - 1].t - candles[0].t) / 86_400_000) : 0,
    enough: candles.length >= MIN_BARS,
    shortHistory: candles.length < SHORT_BARS
  };
}

/** سهم z های ≥ آستانه (٪) */
function tail(sorted: number[], thr: number): number {
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (sorted[m] < thr) lo = m + 1;
    else hi = m;
  }
  return sorted.length ? ((sorted.length - lo) / sorted.length) * 100 : 0;
}

/** احتمال خام لیکوئید (٪) طی ۲۴ ساعت و ۷ روز؛ null یعنی دادهٔ کافی نیست */
export function liqProbability(model: RiskModel, leverage: number, maxLeverage: number): { p24: number; p7d: number } | null {
  if (!model.enough || !model.sigmaNow) return null;
  const x = toLog(model.side, liqDistancePct(model.side, leverage, maxLeverage));
  return { p24: tail(model.z24, x / model.sigmaNow), p7d: tail(model.z7d, x / model.sigmaNow) };
}

export interface Assessment {
  leverage: number;
  liqPct: number;
  /** احتمال نمایش (با کف) و این‌که به کف رسیده یا نه */
  p24: number | null;
  p7d: number | null;
  p24Floored: boolean;
  p7dFloored: boolean;
  /** بیشترین اهرمی که ریسک ۷ روزهٔ خامش ≤ ۵٪ است */
  safeLeverage: number | null;
  /** آبشار: آیا این اهرم از بدترین روز تاریخچه جان به در می‌برد؛ بیشترین اهرمی که می‌برد */
  crashSurvives: boolean | null;
  crashMaxLeverage: number | null;
  /** هزینهٔ فاندینگ روزانه: ٪ حجم و ٪ مارجین (منفی = دریافت) */
  fundingDayPct: number | null;
  fundingDayMarginPct: number | null;
  verdict: 'danger' | 'tight' | 'ok' | 'unknown';
}

export function assess(model: RiskModel, input: { leverage: number; maxLeverage: number; fundingHourly: number | null }): Assessment {
  const maxLev = Math.max(1, Math.floor(input.maxLeverage));
  const leverage = Math.min(Math.max(1, Math.round(input.leverage)), maxLev);
  const liqPct = liqDistancePct(model.side, leverage, maxLev);
  const p = liqProbability(model, leverage, maxLev);

  let safeLeverage: number | null = null;
  if (p) {
    for (let l = maxLev; l >= 1; l--) {
      if (liqProbability(model, l, maxLev)!.p7d <= SAFE_TARGET_7D) {
        safeLeverage = l;
        break;
      }
    }
  }

  let crashMaxLeverage: number | null = null;
  if (model.crashPct !== null) {
    for (let l = maxLev; l >= 1; l--) {
      if (liqDistancePct(model.side, l, maxLev) > model.crashPct) {
        crashMaxLeverage = l;
        break;
      }
    }
  }

  const fundingDayPct = input.fundingHourly === null ? null : input.fundingHourly * 24 * 100 * (model.side === 'long' ? 1 : -1);
  const p7d = p ? Math.max(p.p7d, FLOOR_7D) : null;
  return {
    leverage,
    liqPct,
    p24: p ? Math.max(p.p24, FLOOR_24H) : null,
    p7d,
    p24Floored: !!p && p.p24 < FLOOR_24H,
    p7dFloored: !!p && p.p7d < FLOOR_7D,
    safeLeverage,
    crashSurvives: model.crashPct === null ? null : liqPct > model.crashPct,
    crashMaxLeverage,
    fundingDayPct,
    fundingDayMarginPct: fundingDayPct === null ? null : fundingDayPct * leverage,
    verdict: p7d === null ? 'unknown' : p7d <= SAFE_TARGET_7D ? 'ok' : p7d <= 20 ? 'tight' : 'danger'
  };
}

/** کندل خام هایپرلیکوئید → Candle؛ ردیف نامعتبر کنار می‌رود */
export function parseCandles(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) return [];
  const out: Candle[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const k = { t: Number(r?.t), o: Number(r?.o), h: Number(r?.h), l: Number(r?.l), c: Number(r?.c) };
    if (Object.values(k).every(Number.isFinite) && k.h >= k.l && k.l > 0) out.push(k);
  }
  return out;
}

export const VERDICT_FA: Record<Assessment['verdict'], { label: string; short: string; tone: 'loss' | 'warn' | 'gain' | 'neutral' }> = {
  danger: { label: 'ریسک لیکوئید بالا در شرایط عادی', short: 'پرریسک', tone: 'loss' },
  tight: { label: 'ریسک لیکوئید قابل توجه', short: 'کم‌حاشیه', tone: 'warn' },
  ok: { label: 'ریسک عادی پایین', short: 'معقول', tone: 'gain' },
  unknown: { label: 'دادهٔ کافی نیست', short: '—', tone: 'neutral' }
};

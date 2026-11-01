/**
 * «نرخ پایهٔ ساختار استاپ و هدف» — قبل از ورود: اگر در هر کندل گذشتهٔ همین بازار با همین فاصلهٔ استاپ و هدف
 * وارد می‌شدید، چند بار اول هدف، چند بار اول استاپ و چند بار هیچ‌کدام تا پایان افق؟ — خالص و آزمون‌پذیر
 *
 *   ایده از Time Machine در day-trader-skill (پخش کندل‌های همان ساعت روز)، با سه اصلاح:
 *   ۱) بازپخش مسیر واقعی، نه بوت‌استرپ کندل‌های مستقل (روند و خوشه‌بندی نوسان از بین نرود)؛
 *   ۲) فاصله‌ها با نوسان مقیاس می‌شوند (مثل «چک قبل از ورود»): در شروع i، استاپ = استاپ امروز × σᵢ/σ امروز؛
 *   ۳) شروع‌های هم‌پوشان مستقل نیستند → نمونهٔ مؤثر = شروع‌ها ÷ طول افق، و بازهٔ اطمینان با همان.
 *
 *   هر شروع: ورود = بسته‌شدن کندل i. کندل‌به‌کندل تا افق؛ استاپ و هدف در یک کندل = استاپ (بدبینانه، مثل MAE/MFE).
 *   به هیچ‌کدام نرسید → بستن با قیمت پایان افق (R همان حرکت ÷ فاصلهٔ استاپ). کارمزد رفت‌وبرگشت به R کم می‌شود.
 *   فقط افق‌های کامل شمرده می‌شوند (افق ناقص «هیچ‌کدام» را زیاد نشان می‌داد).
 *
 *   این «ورود تصادفی با همین هندسه» است، نه پیش‌بینی ستاپ شما: اگر امید ریاضی‌اش ≈ ۰ باشد، مزیت باید از ستاپ بیاید.
 */
import type { Direction } from './types';
import { candleCoin, type Candle } from './excursions';
import { baseOf } from './roundTrips';

export const HORIZONS = [
  { key: '4h', label: '۴ ساعت', hours: 4, interval: '5m', ms: 5 * 60_000 },
  { key: '24h', label: '۲۴ ساعت', hours: 24, interval: '15m', ms: 15 * 60_000 },
  { key: '3d', label: '۳ روز', hours: 72, interval: '1h', ms: 3_600_000 },
  { key: '7d', label: '۷ روز', hours: 168, interval: '1h', ms: 3_600_000 }
] as const;
export type HorizonKey = (typeof HORIZONS)[number]['key'];

/** کارمزد تیکر هایپرلیکوئید ۰٫۰۴۵٪ هر طرف */
export const DEFAULT_FEE_SIDE = 0.00045;
/** زیر این نمونهٔ مؤثر «فرضیه» */
export const MIN_EFFECTIVE = 30;
/** سقف مقیاس نوسان تا یک کندل پرت فاصله‌ها را بی‌معنا نکند */
const SCALE_MIN = 0.25;
const SCALE_MAX = 4;

export interface BaseRateInput {
  direction: Direction;
  /** فاصلهٔ استاپ و هدف به کسر قیمت ورود (۰٫۰۱ = ۱٪) */
  stopFrac: number;
  targetFrac: number;
  /** طول افق به تعداد کندل */
  horizonBars: number;
  intervalMs: number;
  /** کارمزد هر طرف به کسر ارزش اسمی */
  feeSide?: number;
  /** مقیاس نوسان؛ پیش‌فرض روشن */
  volScale?: boolean;
}

export interface BaseRate {
  trials: number;
  effective: number;
  enough: boolean;
  pTarget: number;
  pStop: number;
  pTimeout: number;
  /** بازهٔ ۹۰٪ ویلسون برای pTarget با نمونهٔ مؤثر */
  pTargetLo: number;
  pTargetHi: number;
  rTarget: number;
  /** نرخ برد سربه‌سر اگر فقط استاپ یا هدف = (۱+کارمزد R)/(۱+R) */
  breakevenWin: number;
  /** امید ریاضی به R، بعد از کارمزد */
  evR: number;
  feeR: number;
  /** میانهٔ زمان رسیدن (میلی‌ثانیه)؛ null = هرگز */
  medianToStopMs: number | null;
  medianToTargetMs: number | null;
  /** فاصلهٔ استاپ ÷ میانهٔ دامنهٔ یک ساعت (زیر ۱ = داخل نوسان معمول) */
  stopVsHourRange: number | null;
  from: number;
  to: number;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** بازهٔ ویلسون (z = ۱٫۶۴۵ ≈ ۹۰٪) */
export function wilson(p: number, n: number, z = 1.645): [number, number] {
  if (n <= 0) return [0, 1];
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

/** σ لگ‌بازده EWMA تا هر کندل (علّی: فقط گذشته)؛ نیمه‌عمر = یک روز کندل */
export function ewmaVol(candles: readonly Candle[], intervalMs: number): number[] {
  const hl = Math.max(2, Math.round(86_400_000 / intervalMs));
  const lambda = Math.pow(0.5, 1 / hl);
  const out = new Array<number>(candles.length).fill(NaN);
  let v = NaN;
  for (let i = 1; i < candles.length; i++) {
    const r = Math.log(candles[i].c / candles[i - 1].c);
    v = Number.isNaN(v) ? r * r : lambda * v + (1 - lambda) * r * r;
    if (i >= hl) out[i] = Math.sqrt(v);
  }
  return out;
}

/** میانهٔ دامنهٔ (سقف − کف) ÷ باز در بلوک‌های یک‌ساعته */
export function medianHourRange(candles: readonly Candle[], intervalMs: number): number | null {
  const k = Math.max(1, Math.round(3_600_000 / intervalMs));
  const ranges: number[] = [];
  for (let i = 0; i + k <= candles.length; i += k) {
    let h = -Infinity, l = Infinity;
    for (let j = i; j < i + k; j++) { h = Math.max(h, candles[j].h); l = Math.min(l, candles[j].l); }
    if (candles[i].o > 0) ranges.push((h - l) / candles[i].o);
  }
  return median(ranges);
}

export function baseRate(candles: readonly Candle[], x: BaseRateInput): BaseRate | null {
  const { direction, stopFrac, targetFrac, horizonBars: H, intervalMs } = x;
  if (!(stopFrac > 0) || !(targetFrac > 0) || H < 1 || candles.length < H + 1) return null;
  const scale = x.volScale !== false;
  const vol = scale ? ewmaVol(candles, intervalMs) : [];
  const now = scale ? vol[vol.length - 1] : 1;
  if (scale && !(now > 0)) return null;
  const rTarget = targetFrac / stopFrac;
  const feeR = (2 * (x.feeSide ?? DEFAULT_FEE_SIDE)) / stopFrac;
  const long = direction === 'long';
  let nT = 0, nS = 0, nO = 0, sumR = 0, first = -1;
  const toStop: number[] = [], toTarget: number[] = [];
  for (let i = 0; i + H < candles.length; i++) {
    let k = 1;
    if (scale) {
      if (!(vol[i] > 0)) continue;
      k = Math.min(SCALE_MAX, Math.max(SCALE_MIN, vol[i] / now));
    }
    if (first < 0) first = i;
    const e = candles[i].c;
    const s = stopFrac * k, t = targetFrac * k;
    let done = false;
    for (let j = i + 1; j <= i + H; j++) {
      const b = candles[j];
      const adverse = long ? (e - b.l) / e : (b.h - e) / e;
      const favorable = long ? (b.h - e) / e : (e - b.l) / e;
      if (adverse >= s) { nS++; sumR -= 1; toStop.push((j - i) * intervalMs); done = true; break; }
      if (favorable >= t) { nT++; sumR += rTarget; toTarget.push((j - i) * intervalMs); done = true; break; }
    }
    if (!done) {
      const move = (candles[i + H].c - e) / e;
      nO++;
      sumR += (long ? move : -move) / s;
    }
  }
  const n = nT + nS + nO;
  if (!n) return null;
  const effective = Math.max(1, Math.floor(n / H));
  const pTarget = nT / n;
  const [lo, hi] = wilson(pTarget, effective);
  const hour = medianHourRange(candles, intervalMs);
  return {
    trials: n,
    effective,
    enough: effective >= MIN_EFFECTIVE,
    pTarget,
    pStop: nS / n,
    pTimeout: nO / n,
    pTargetLo: lo,
    pTargetHi: hi,
    rTarget,
    breakevenWin: Math.min(1, (1 + feeR) / (1 + rTarget)),
    evR: sumR / n - feeR,
    feeR,
    medianToStopMs: median(toStop),
    medianToTargetMs: median(toTarget),
    stopVsHourRange: hour ? stopFrac / hour : null,
    from: candles[first].t,
    to: candles[candles.length - 1].t
  };
}

/**
 * تفکیک امید ریاضی: جهت مخالف با همان هندسه همان کارمزد و همان «نزدیکی استاپ» را دارد ولی روند را برعکس می‌بیند.
 *   ساختار = میانگین دو جهت (هندسه + کارمزد، مستقل از روند) · روند = نصف تفاضل (سهم حرکت اخیر بازار)
 *   ساختار + روند = امید ریاضی جهت شما. روی دادهٔ واقعی (طلا، ۷ روز) −۰٫۵۲R لانگ تقریباً همه روند بود.
 */
export function splitEdge(evR: number, oppositeEvR: number): { structureR: number; trendR: number } {
  return { structureR: (evR + oppositeEvR) / 2, trendR: (evR - oppositeEvR) / 2 };
}

/** نماد برنامه → کوین کندل هایپرلیکوئید (متاتریدر: همان نگاشت MAE/MFE؛ کریپتو: دارایی پایه) */
export function planCoin(symbol: string, kind: 'crypto' | 'mt'): string | null {
  const s = symbol.trim();
  if (!s) return null;
  if (kind === 'mt') return candleCoin({ venue: 'metatrader', symbol: s });
  return s.includes(':') ? s : baseOf(s);
}

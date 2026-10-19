/**
 * «قیمت‌های خرید پله‌ای چقدر در دسترس‌اند؟»
 *
 *  نوسان روزانه از قیمت‌های بسته‌شدن واقعی؛ احتمال «لمس» یک قیمت پایین‌تر در N روز با اصل بازتاب
 *  (حرکت تصادفی بدون روند): P = 2·Φ(ln(K/S) / (σ·√N)). به‌علاوه: آخرین بار قیمت کِی این‌قدر پایین بود.
 *  ⚠️ مدل ساده و بدون روند است؛ برآورد است، نه پیش‌بینی.
 */
import { normCdf } from './options';

export type Reach = 'near' | 'possible' | 'far' | 'very-far';

export interface StepReach {
  price: number;
  dropPct: number;
  /** احتمال لمس در ۳۰ و ۹۰ روز (۰ تا ۱) */
  p30: number;
  p90: number;
  /** چند روز پیش آخرین بار بسته‌شدن روزانه به این قیمت یا پایین‌تر رسید (null = در بازهٔ داده نرسیده) */
  lastSeenDaysAgo: number | null;
  reach: Reach;
}

export interface LadderReach {
  /** نوسان روزانه (انحراف معیار بازده لگاریتمی) */
  dailyVol: number;
  /** کمترین قیمت بسته‌شدن در ۳۰ و ۹۰ روز اخیر */
  low30: number | null;
  low90: number | null;
  steps: StepReach[];
}

const DAY = 86_400_000;

export function reachOf(p90: number): Reach {
  if (p90 >= 0.5) return 'near';
  if (p90 >= 0.2) return 'possible';
  if (p90 >= 0.05) return 'far';
  return 'very-far';
}

/** احتمال لمس قیمت پایین‌تر K از S در n روز با نوسان روزانهٔ σ */
export function touchProbability(S: number, K: number, dailyVol: number, days: number): number {
  if (!(S > 0) || !(K > 0) || !(dailyVol > 0) || !(days > 0)) return 0;
  if (K >= S) return 1;
  return Math.min(1, 2 * normCdf(Math.log(K / S) / (dailyVol * Math.sqrt(days))));
}

export function ladderReach(
  current: number,
  steps: readonly { price: number; dropPct: number }[],
  history: readonly { t: number; price: number }[],
  now: number = Date.now()
): LadderReach | null {
  const pts = [...history].filter((p) => p.price > 0).sort((a, b) => a.t - b.t);
  if (pts.length < 20 || !(current > 0)) return null;
  const rets = pts.slice(1).map((p, i) => Math.log(p.price / pts[i].price));
  const m = rets.reduce((s, r) => s + r, 0) / rets.length;
  const dailyVol = Math.sqrt(rets.reduce((s, r) => s + (r - m) ** 2, 0) / Math.max(1, rets.length - 1));
  const lowIn = (days: number) => {
    const w = pts.filter((p) => p.t >= now - days * DAY).map((p) => p.price);
    return w.length ? Math.min(...w) : null;
  };
  return {
    dailyVol,
    low30: lowIn(30),
    low90: lowIn(90),
    steps: steps.map((s) => {
      const p30 = touchProbability(current, s.price, dailyVol, 30);
      const p90 = touchProbability(current, s.price, dailyVol, 90);
      const last = [...pts].reverse().find((p) => p.price <= s.price);
      return { price: s.price, dropPct: s.dropPct, p30, p90, lastSeenDaysAgo: last ? Math.max(0, Math.round((now - last.t) / DAY)) : null, reach: reachOf(p90) };
    })
  };
}

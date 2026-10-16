/**
 * ⑦ Hedge — اسپات + پوزیشن Short مخالف در فیوچرز (Hedge Mode، بدون اهرم)
 *
 *   نسبت هج        = H ÷ S × ۱۰۰
 *   ریزش d٪        اسپات = S × (1 − d/100)   ·   Short = H × (1 + d/100)
 *   رشد u٪         اسپات = S × (1 + u/100)   ·   Short = H × (1 − u/100)
 *   مجموع دارایی   = اسپات + Short − کارمزد
 *   تفاوت          = مجموع − ارزش اسپات «بدون هج» (همان اسپات سناریو)
 *
 * ضرب پیش از تقسیم (S × (100 − d) / 100) تا مقادیر گرد مثل ۲۴۶ دقیق بمانند.
 * ورودی منفی = ۰ و درصد بیش از ۱۰۰ = ۱۰۰ (بدون اهرم، ارزش زیر صفر نمی‌رود).
 */
import { toEnDigits } from '@/shared/utils/formatters';

export type Coin = { symbol: string; name: string; color: string; logo: string };

export type HedgeInput = {
  spot: number;      // ارزش اسپات (دلار)
  short: number;     // ارزش پوزیشن Short (دلار)
  dropPct: number;   // درصد ریزش
  risePct: number;   // درصد رشد
  fee: number;       // کارمزد و فاندینگ تخمینی (دلار)
};

export type ScenarioResult = {
  spotValue: number;
  shortValue: number;
  fee: number;
  total: number;
  unhedged: number;
  diff: number;
  diffPct: number;
};

export type HedgeResult = {
  ratioPct: number;
  drop: ScenarioResult;
  rise: ScenarioResult;
};

/** ورودی متنی (ارقام فارسی/عربی/لاتین، جداکنندهٔ هزارگان) → عدد؛ خالی یا نامعتبر = ۰ */
export function toNumber(v: string): number {
  const t = toEnDigits(v ?? '').replace(/[,\s٬]/g, '').replace('٫', '.');
  if (t === '') return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

const nonNeg = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);
const pct = (v: number): number => Math.min(nonNeg(v), 100);

/** a ÷ b × ۱۰۰ — مخرج صفر = ۰ (بدون تقسیم بر صفر) */
const ratio = (a: number, b: number): number => (b > 0 ? (a / b) * 100 : 0);

function scenario(spotValue: number, shortValue: number, fee: number): ScenarioResult {
  const total = spotValue + shortValue - fee;
  const unhedged = spotValue;
  const diff = total - unhedged;
  return { spotValue, shortValue, fee, total, unhedged, diff, diffPct: ratio(diff, unhedged) };
}

export function calcHedge(input: HedgeInput): HedgeResult {
  const S = nonNeg(input.spot);
  const H = nonNeg(input.short);
  const d = pct(input.dropPct);
  const u = pct(input.risePct);
  const fee = nonNeg(input.fee);

  return {
    ratioPct: ratio(H, S),
    drop: scenario((S * (100 - d)) / 100, (H * (100 + d)) / 100, fee),
    rise: scenario((S * (100 + u)) / 100, (H * (100 - u)) / 100, fee)
  };
}

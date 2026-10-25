/**
 * منحنی سود حساب از پاسخ `portfolio` هایپرلیکوئید
 *
 * pnlHistory سود تجمعی است و واریز/برداشت را شامل نمی‌شود (برخلاف accountValueHistory)،
 * پس سود ماهانه از روی آن محاسبه می‌شود. درصد افت با «بازده وزنی زمانی» (TWR) در ۱۲ ماه اخیر:
 * سود هر بازه ÷ سرمایهٔ اول همان بازه، زنجیره‌ای ضرب می‌شود؛ واریز/برداشت درصد را خراب نمی‌کند
 * و افت‌های دوران حساب خیلی کوچک اولیه، تریدرِ امروز را بد نشان نمی‌دهد.
 * Pure — بدون شبکه.
 */

import type { HlPortfolio } from './types.js';

export type { HlPortfolio } from './types.js';

export interface PnlCurve {
  points: { t: number; pnl: number; accountValue: number }[];
  /** سود کل حساب در کل سابقه */
  totalPnl: number | null;
  months: { month: string; pnl: number }[];
  positiveMonths: number;
  /** بیشترین افت سود از قله (دلار) */
  maxDrawdownUsd: number;
  /** بیشترین افت شاخص بازده وزنی زمانی از قله در ۱۲ ماه اخیر (٪) */
  maxDrawdownPct: number | null;
}

const DD_WINDOW_MS = 365 * 86_400_000;

const toNum = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** پنجرهٔ کل سابقهٔ پرپ را ترجیح می‌دهد (اسپات و والت را قاطی نمی‌کند) */
export function pnlCurve(portfolio: HlPortfolio | null | undefined): PnlCurve {
  const windows = new Map(Array.isArray(portfolio) ? portfolio : []);
  const w = windows.get('perpAllTime') ?? windows.get('allTime');
  const values = new Map((w?.accountValueHistory ?? []).map(([t, v]) => [t, toNum(v) ?? 0]));
  const points = (w?.pnlHistory ?? [])
    .map(([t, v]) => ({ t, pnl: toNum(v), accountValue: values.get(t) ?? 0 }))
    .filter((p): p is { t: number; pnl: number; accountValue: number } => Number.isFinite(p.t) && p.pnl !== null)
    .sort((a, b) => a.t - b.t);

  const monthEnd = new Map<string, number>();
  for (const p of points) monthEnd.set(new Date(p.t).toISOString().slice(0, 7), p.pnl);
  let prev = points[0]?.pnl ?? 0;
  const months = [...monthEnd.entries()].map(([month, end]) => {
    const pnl = end - prev;
    prev = end;
    return { month, pnl };
  });

  let peak = -Infinity;
  let maxDrawdownUsd = 0;
  for (const p of points) {
    peak = Math.max(peak, p.pnl);
    maxDrawdownUsd = Math.max(maxDrawdownUsd, peak - p.pnl);
  }

  // سرمایهٔ اول بازه: ارزش قبلی، یا اگر وسط بازه واریز شده، ارزش فعلی منهای سود همین بازه
  let index = 1;
  let peakIndex = 1;
  let maxDd = 0;
  let steps = 0;
  const from = (points[points.length - 1]?.t ?? 0) - DD_WINDOW_MS;
  for (let i = 1; i < points.length; i++) {
    if (points[i - 1].t < from) continue;
    const gain = points[i].pnl - points[i - 1].pnl;
    const base = Math.max(points[i - 1].accountValue, points[i].accountValue - gain);
    if (!(base > 0)) continue;
    index *= 1 + Math.min(5, Math.max(-0.99, gain / base));
    steps++;
    peakIndex = Math.max(peakIndex, index);
    maxDd = Math.max(maxDd, 1 - index / peakIndex);
  }

  return {
    points,
    totalPnl: points.length ? points[points.length - 1].pnl : null,
    months,
    positiveMonths: months.filter((m) => m.pnl > 0).length,
    maxDrawdownUsd,
    maxDrawdownPct: steps ? maxDd * 100 : null
  };
}

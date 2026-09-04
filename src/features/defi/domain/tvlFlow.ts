/**
 * TVL Flow Analytics — منطق دامنه (توابع خالص تست‌پذیر)
 * محاسبه تغییرات TVL در بازه‌های ۷/۳۰/۹۰/۱۸۰/۳۶۵ روز از سری تاریخی
 */
export const FLOW_PERIODS = [7, 30, 90, 180, 365] as const;
export type FlowPeriod = (typeof FLOW_PERIODS)[number];

export interface TvlPoint {
  date: number; // ثانیه
  tvl: number;
}

export interface PeriodChange {
  /** تغییر دلاری */
  usd: number;
  /** تغییر درصدی */
  pct: number;
  /** روند */
  trend: 'up' | 'down' | 'flat';
}

export type PeriodChanges = Partial<Record<FlowPeriod, PeriodChange | null>>;

/** مقدار TVL در یک مقطع (نزدیک‌ترین نقطه، حداکثر ۴ روز خطا) */
export function tvlAt(points: TvlPoint[], targetTsSec: number): number | null {
  if (points.length === 0) return null;
  let best = points[0];
  let bestDist = Math.abs(best.date - targetTsSec);
  for (let i = 1; i < points.length; i++) {
    const d = Math.abs(points[i].date - targetTsSec);
    if (d < bestDist || (d === bestDist && points[i].date > best.date)) {
      best = points[i];
      bestDist = d;
    }
  }
  if (bestDist > 4 * 86_400) return null;
  return best.tvl;
}

/**
 * محاسبه تغییرات بازه‌ای از سری تاریخی:
 *  pct = (tvl_now − tvl_n_days_ago) / tvl_n_days_ago × 100
 *  usd = tvl_now − tvl_n_days_ago
 */
export function computePeriodChanges(
  points: TvlPoint[],
  nowSec = Math.floor(Date.now() / 1000)
): PeriodChanges {
  if (!points || points.length < 2) return {};
  const sorted = [...points].sort((a, b) => a.date - b.date);
  const cur = sorted[sorted.length - 1].tvl;
  if (!Number.isFinite(cur) || cur < 0) return {};
  const out: PeriodChanges = {};
  for (const d of FLOW_PERIODS) {
    const base = tvlAt(sorted, nowSec - d * 86_400);
    if (base === null || !Number.isFinite(base) || base <= 0) {
      out[d] = null;
      continue;
    }
    const usd = cur - base;
    const pct = (usd / base) * 100;
    out[d] = {
      usd,
      pct,
      trend: pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat'
    };
  }
  return out;
}

/** کاهش سری تاریخی به نقاط هفتگی (برای نمودار سبک) — حداکثر `maxPoints` */
export function downsample(points: TvlPoint[], maxPoints = 52): TvlPoint[] {
  if (!points || points.length <= maxPoints) return points ?? [];
  const step = Math.ceil(points.length / maxPoints);
  const out: TvlPoint[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  // همیشه آخرین نقطه (قیمت فعلی) را نگه دار
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/** طبقه‌بندی شدت جریان برای Heatmap */
export type FlowLevel = 0 | 1 | 2 | 3 | 4;

export function flowLevel(pct: number | null | undefined): FlowLevel {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return 0;
  if (pct > 15) return 4; // سبز پررنگ
  if (pct > 3) return 3; // سبز کم‌رنگ
  if (pct < -15) return 1; // قرمز پررنگ
  if (pct < -3) return 2; // قرمز کم‌رنگ
  return 0; // خاکستری
}

/** رنگ‌های Heatmap (سرمایه‌ای از کلاس‌های tailwind) */
export const FLOW_COLORS: Record<FlowLevel, string> = {
  4: 'bg-emerald-400/90 text-emerald-950',
  3: 'bg-emerald-400/40 text-emerald-300',
  0: 'bg-line/10 text-muted',
  2: 'bg-rose-500/40 text-rose-200',
  1: 'bg-rose-500/90 text-rose-50'
};

export const FLOW_LABEL: Record<FlowLevel, string> = {
  4: 'ورود زیاد',
  3: 'ورود کم',
  0: 'بدون تغییر',
  2: 'خروج کم',
  1: 'خروج زیاد'
};

/** رتبه‌بندی بر اساس تغییر دلاری یک بازه (بیشترین ورود/خروج) */
export function rankByUsd<T>(
  rows: T[],
  getChange: (r: T) => PeriodChange | null | undefined
): { inflow: T[]; outflow: T[] } {
  const withVal = rows
    .map((r) => ({ r, c: getChange(r) }))
    .filter((x) => x.c !== null && x.c !== undefined && Number.isFinite(x.c.usd))
    .sort((a, b) => (b.c as PeriodChange).usd - (a.c as PeriodChange).usd);
  return {
    inflow: withVal.map((x) => x.r),
    outflow: [...withVal].reverse().map((x) => x.r)
  };
}

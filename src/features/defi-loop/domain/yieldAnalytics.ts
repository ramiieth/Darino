/** ============================================================
 * DeFi Loop — آمار تاریخی APY/TVL + Stability + Opportunity Score
 * ============================================================ */
import { mean, sampleStdDev } from '@/features/boros/domain/engine/stats';

/* ---------------- آمار APY از سری تاریخی ---------------- */

export interface ApyStats {
  current: number;
  avg7d: number | null;
  avg30d: number | null;
  avg90d: number | null;
  avg180d: number | null;
  min: number | null;
  max: number | null;
  volatility: number | null; // انحراف معیار ۳۰ روز
  /** APY Spike: current vs 30d avg */
  spikeDetected: boolean;
  spikePct: number | null;
}

/** محاسبه آمار APY از سری تاریخی (نقاط روزانه) */
export function computeApyStats(
  hist: { timestamp: string | number; apy: number | null }[],
  currentApy: number
): ApyStats {
  const pts = (hist ?? [])
    .map((p) => ({ ts: new Date(p.timestamp).getTime(), apy: p.apy }))
    .filter((p) => p.apy !== null && Number.isFinite(p.apy) && (p.apy as number) > 0)
    .map((p) => ({ ts: p.ts, apy: p.apy as number }))
    .sort((a, b) => a.ts - b.ts);
  if (pts.length === 0) {
    return { current: currentApy, avg7d: null, avg30d: null, avg90d: null, avg180d: null, min: null, max: null, volatility: null, spikeDetected: false, spikePct: null };
  }
  const now = pts[pts.length - 1].ts;
  const DAY = 86_400_000;
  const slice = (days: number) => pts.filter((p) => now - p.ts <= days * DAY).map((p) => p.apy);
  const avg = (xs: number[]) => (xs.length > 0 ? mean(xs) : null);
  const s30 = slice(30);
  const min = Math.min(...pts.map((p) => p.apy));
  const max = Math.max(...pts.map((p) => p.apy));
  const a30 = avg(s30);
  const spikePct = a30 !== null && a30 > 0 ? ((currentApy - a30) / a30) * 100 : null;
  return {
    current: currentApy,
    avg7d: avg(slice(7)),
    avg30d: a30,
    avg90d: avg(slice(90)),
    avg180d: avg(slice(180)),
    min,
    max,
    volatility: s30.length >= 2 ? sampleStdDev(s30) : null,
    spikeDetected: spikePct !== null && spikePct > 30,
    spikePct
  };
}

/* ---------------- آمار TVL ---------------- */

export interface TvlStats {
  current: number;
  tvl7dAgo: number | null;
  tvl30dAgo: number | null;
  tvl90dAgo: number | null;
  change7d: number | null; // ٪
  change30d: number | null;
  change90d: number | null;
}

/** تغییر TVL در بازه‌ها از سری تاریخی */
export function computeTvlStats(
  hist: { timestamp: string | number; tvlUsd: number | null }[],
  currentTvl: number
): TvlStats {
  const pts = (hist ?? [])
    .map((p) => ({ ts: new Date(p.timestamp).getTime(), tvl: p.tvlUsd }))
    .filter((p) => p.tvl !== null && Number.isFinite(p.tvl) && (p.tvl as number) > 0)
    .map((p) => ({ ts: p.ts, tvl: p.tvl as number }))
    .sort((a, b) => a.ts - b.ts);
  if (pts.length === 0) {
    return { current: currentTvl, tvl7dAgo: null, tvl30dAgo: null, tvl90dAgo: null, change7d: null, change30d: null, change90d: null };
  }
  const now = pts[pts.length - 1].ts;
  const DAY = 86_400_000;
  const tvlAt = (daysAgo: number): number | null => {
    const target = now - daysAgo * DAY;
    let best: { ts: number; tvl: number } | null = null;
    let bestDist = Infinity;
    for (const p of pts) {
      const d = Math.abs(p.ts - target);
      if (d < bestDist) { best = p; bestDist = d; }
    }
    if (!best || bestDist > 4 * DAY) return null;
    return best.tvl;
  };
  const chg = (past: number | null): number | null =>
    past !== null && past > 0 ? ((currentTvl - past) / past) * 100 : null;
  return {
    current: currentTvl,
    tvl7dAgo: tvlAt(7),
    tvl30dAgo: tvlAt(30),
    tvl90dAgo: tvlAt(90),
    change7d: chg(tvlAt(7)),
    change30d: chg(tvlAt(30)),
    change90d: chg(tvlAt(90))
  };
}

/* ---------------- Risk Indicators (از داده موجود — نه حدس) ---------------- */

export interface RiskIndicator {
  type:
    | 'high-leverage'
    | 'high-borrow-cost'
    | 'low-liquidity'
    | 'apy-spike'
    | 'high-reward-dependency'
    | 'tvl-declining'
    | 'low-tvl'
    | 'high-volatility'
    | 'outlier';
  label: string;
  detail: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface RiskInput {
  leverage: number;
  borrowApy: number | null;
  rewardApy: number | null;
  totalApy: number | null;
  tvlUsd: number;
  tvlChange30d: number | null;
  volatility: number | null;
  apySpike: boolean;
  outlier: boolean;
}

/** تولید شاخص‌های ریسک — به‌عنوان Fact/Indicator، نه «Safe/Unsafe» */
export function riskIndicators(i: RiskInput): RiskIndicator[] {
  const out: RiskIndicator[] = [];
  if (i.leverage >= 3) out.push({ type: 'high-leverage', label: 'اهرم بالا', detail: `${i.leverage.toFixed(1)}x — هرچه اهرم بالاتر، ریسک لیکوییدیشن بیشتر`, severity: 'warning' });
  else if (i.leverage >= 2) out.push({ type: 'high-leverage', label: 'اهرم متوسط', detail: `${i.leverage.toFixed(1)}x`, severity: 'info' });

  if (i.borrowApy !== null && i.borrowApy > 0.08)
    out.push({ type: 'high-borrow-cost', label: 'هزینه Borrow بالا', detail: `${(i.borrowApy * 100).toFixed(2)}٪ — سود خالص را کاهش می‌دهد`, severity: 'warning' });

  if (i.tvlUsd < 1_000_000)
    out.push({ type: 'low-tvl', label: 'TVL پایین', detail: `$${i.tvlUsd.toFixed(0)} — نقدینگی کمتر، ریسک اجرا بیشتر`, severity: 'warning' });
  else if (i.tvlUsd < 10_000_000)
    out.push({ type: 'low-liquidity', label: 'نقدینگی متوسط', detail: `$${(i.tvlUsd / 1e6).toFixed(1)}M`, severity: 'info' });

  if (i.apySpike)
    out.push({ type: 'apy-spike', label: 'APY Spike', detail: 'APY فعلی به‌طور معناداری بالاتر از میانگین ۳۰ روزه است — احتمالاً پایدار نیست', severity: 'warning' });

  if (i.rewardApy !== null && i.totalApy !== null && i.totalApy > 0 && i.rewardApy / i.totalApy > 0.5)
    out.push({ type: 'high-reward-dependency', label: 'وابستگی بالا به Reward', detail: `${(i.rewardApy / i.totalApy * 100).toFixed(0)}٪ از APY از Reward است — با کاهش Reward سود افت می‌کند`, severity: 'warning' });

  if (i.tvlChange30d !== null && i.tvlChange30d < -10)
    out.push({ type: 'tvl-declining', label: 'خروج TVL', detail: `TVL در ۳۰ روز ${i.tvlChange30d.toFixed(1)}٪ کاهش یافته`, severity: 'warning' });

  if (i.volatility !== null && i.volatility > 0.05)
    out.push({ type: 'high-volatility', label: 'نوسان بالای APY', detail: `σ=${(i.volatility * 100).toFixed(2)}٪`, severity: 'warning' });

  if (i.outlier)
    out.push({ type: 'outlier', label: 'Outlier (خروج از قاعده)', detail: 'DeFiLlama این پول را outlier علامت زده — داده غیرعادی است', severity: 'critical' });

  return out;
}

/* ---------------- Opportunity Score ---------------- */

export interface OppScoreInput {
  netApy: number | null; // Decimal
  stability: number | null; // 0..1 (پایین‌تر نوسان = بالاتر)
  tvlUsd: number;
  liquidityScore: number; // 0..1
  rewardDependency: number; // 0..1 (سهم reward از کل — پایین بهتر)
  auditKnown: boolean | null;
  leverageRisk: number; // 0..1 (بالاتر = بدتر)
  borrowCostRisk: number; // 0..1
  spike: boolean;
  outlier: boolean;
  tvlDeclining: boolean;
}

/** نرمال‌سازی Net APY (0..1): APY ۲۰٪+ = 1 */
const normApy = (v: number | null) => (v === null ? 0 : Math.max(0, Math.min(1, v / 0.2)));
const normTvl = (v: number) => Math.min(1, v / 50_000_000);

/**
 * Opportunity Score (0..100) — ترکیب وزنی، APY تنها تعیین‌کننده نیست.
 * ⚠️ Score ≠ احتمال موفقیت — فقط امتیاز مقایسه.
 */
export function opportunityScore(i: OppScoreInput): number {
  const s =
    normApy(i.netApy) * 0.3 +
    (i.stability ?? 0.5) * 0.2 +
    normTvl(i.tvlUsd) * 0.15 +
    i.liquidityScore * 0.1 +
    (1 - i.rewardDependency) * 0.1 +
    (i.auditKnown === false ? 0.5 : i.auditKnown === true ? 1 : 0.75) * 0.05 +
    (1 - i.leverageRisk) * 0.05 +
    (1 - i.borrowCostRisk) * 0.05;
  let score = s * 100;
  if (i.spike) score *= 0.9;
  if (i.tvlDeclining) score *= 0.95;
  if (i.outlier) score *= 0.7;
  return Math.max(0, Math.min(100, score));
}

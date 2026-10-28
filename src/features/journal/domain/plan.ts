/**
 * برنامهٔ معامله — محاسبه‌های قبل از ورود و اتصال به معاملهٔ واقعی
 *
 *   R هدف = |هدف − ورود| ÷ |ورود − استاپ|
 *   ریسک دلاری = اندازه × |ورود − استاپ| ؛ اندازهٔ پیشنهادی = (حساب × سقف ریسک٪) ÷ |ورود − استاپ|
 *   اتصال خودکار: همان دارایی پایه و جهت، باز شده از ۱ ساعت قبل تا validHours بعد از ثبت برنامه؛ نزدیک‌ترین برنده است.
 *   R واقعی = سود خالص ÷ (اندازهٔ واقعی × |ورود برنامه − استاپ برنامه|) — با اندازهٔ واقعی، نه برنامه.
 */
import type { ClassifiedTrade, MarketOutlook, TradePlan } from './types';
import { baseOf } from './roundTrips';
import type { PlannedRisk } from './metrics';

export interface PlanCalc {
  stopDistance: number | null;
  stopPct: number | null;
  rTarget: number | null;
  riskUsd: number | null;
  riskPct: number | null;
  suggestedSize: number | null;
  suggestedNotional: number | null;
  withinLimit: boolean | null;
  /** اشکال‌های منطقی برنامه */
  problems: string[];
}

export function calcPlan(p: Pick<TradePlan, 'direction' | 'entry' | 'stop' | 'target' | 'size' | 'leverage'>, accountSize: number | null, maxRiskPct: number): PlanCalc {
  const problems: string[] = [];
  const { entry, stop, target, direction } = p;
  const dist = entry !== null && stop !== null ? Math.abs(entry - stop) : null;
  if (entry !== null && stop !== null) {
    if (direction === 'long' && stop >= entry) problems.push('در لانگ، استاپ باید زیر قیمت ورود باشد.');
    if (direction === 'short' && stop <= entry) problems.push('در شورت، استاپ باید بالای قیمت ورود باشد.');
  }
  if (entry !== null && target !== null) {
    if (direction === 'long' && target <= entry) problems.push('در لانگ، هدف باید بالای قیمت ورود باشد.');
    if (direction === 'short' && target >= entry) problems.push('در شورت، هدف باید زیر قیمت ورود باشد.');
  }
  const rTarget = dist && entry !== null && target !== null ? Math.abs(target - entry) / dist : null;
  if (rTarget !== null && rTarget < 1.5 && !problems.length) problems.push(`نسبت سود به ریسک ${rTarget.toFixed(2)} است؛ زیر ۱٫۵ باید نرخ برد خیلی بالایی داشته باشید.`);
  const riskUsd = dist && p.size ? p.size * dist : null;
  const riskPct = riskUsd !== null && accountSize ? (riskUsd / accountSize) * 100 : null;
  const budget = accountSize ? (accountSize * maxRiskPct) / 100 : null;
  const suggestedSize = budget !== null && dist ? budget / dist : null;
  if (riskPct !== null && riskPct > maxRiskPct) problems.push(`ریسک ${riskPct.toFixed(2)}٪ حساب است؛ بیشتر از سقف ${maxRiskPct}٪ شما.`);
  if (p.leverage && entry && dist && entry > 0) {
    // فاصلهٔ تقریبی لیکوئید با اهرم ایزوله ≈ ۱/اهرم؛ اگر استاپ دورتر از آن باشد، قبل از استاپ لیکوئید می‌شوید
    if (dist / entry >= 1 / p.leverage) problems.push(`با اهرم ${p.leverage}x، قبل از رسیدن به استاپ لیکوئید می‌شوید.`);
  }
  return {
    stopDistance: dist,
    stopPct: dist && entry ? (dist / entry) * 100 : null,
    rTarget,
    riskUsd,
    riskPct,
    suggestedSize,
    suggestedNotional: suggestedSize !== null && entry ? suggestedSize * entry : null,
    withinLimit: riskPct === null ? null : riskPct <= maxRiskPct,
    problems
  };
}

/** برنامه ↔ معامله: دستی اول، بعد خودکار (هر برنامه حداکثر یک معامله و برعکس) */
export function linkPlans(plans: readonly TradePlan[], trades: readonly ClassifiedTrade[]): Map<string, TradePlan> {
  const byTrade = new Map<string, TradePlan>();
  const usedPlans = new Set<string>();
  const live = plans.filter((p) => !p.deleted && p.status !== 'cancelled' && p.status !== 'skipped');
  for (const p of live) {
    if (p.linkedTradeId && trades.some((t) => t.id === p.linkedTradeId)) {
      byTrade.set(p.linkedTradeId, p);
      usedPlans.add(p.id);
    }
  }
  const candidates: { plan: TradePlan; trade: ClassifiedTrade; gap: number }[] = [];
  for (const p of live) {
    if (usedPlans.has(p.id) || p.linkedTradeId) continue;
    const base = baseOf(p.symbol);
    for (const t of trades) {
      if (byTrade.has(t.id) || t.base !== base || t.direction !== p.direction) continue;
      if (p.account && p.account !== t.account) continue;
      const gap = t.openTime - p.createdAt;
      if (gap < -3_600_000 || gap > p.validHours * 3_600_000) continue;
      candidates.push({ plan: p, trade: t, gap: Math.abs(gap) });
    }
  }
  candidates.sort((a, b) => a.gap - b.gap);
  for (const c of candidates) {
    if (usedPlans.has(c.plan.id) || byTrade.has(c.trade.id)) continue;
    byTrade.set(c.trade.id, c.plan);
    usedPlans.add(c.plan.id);
  }
  return byTrade;
}

/** ریسک برنامه با اندازهٔ واقعی معامله — ورودی R و نظم استاپ */
export function plannedRisks(links: ReadonlyMap<string, TradePlan>, trades: readonly ClassifiedTrade[]): Map<string, PlannedRisk> {
  const out = new Map<string, PlannedRisk>();
  for (const t of trades) {
    const p = links.get(t.id);
    if (!p || p.entry === null || p.stop === null) continue;
    const riskUsd = t.maxSize * Math.abs(p.entry - p.stop);
    if (riskUsd > 0) out.set(t.id, { riskUsd, plan: p });
  }
  return out;
}

export function emptyOutlook(): MarketOutlook {
  return { weeklyBias: 'neutral', weeklyNote: '', dailyBias: 'neutral', dailyNote: '', env: 'unknown', proTrend: '-', checklist: {}, checklistNotes: {}, news: [] };
}

export function newPlan(now: number, patch: Partial<TradePlan> = {}): TradePlan {
  return {
    id: `p${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    createdAt: now,
    updatedAt: now,
    symbol: 'BTC',
    direction: 'long',
    account: null,
    entry: null,
    stop: null,
    target: null,
    size: null,
    leverage: null,
    setupTags: [],
    entryWhy: '',
    stopWhy: '',
    targetWhy: '',
    confluences: [],
    reasonsAgainst: [],
    outlook: emptyOutlook(),
    status: 'planned',
    linkedTradeId: null,
    validHours: 24,
    notes: '',
    ...patch
  };
}

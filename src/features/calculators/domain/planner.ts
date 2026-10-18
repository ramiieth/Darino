/**
 * ⑫ برنامهٔ من — تقسیم سرمایه، خرید پله‌ای در ریزش و انتخاب دلتا نوترال برای پوینت
 *
 *   سرمایهٔ کل        = ذخیرهٔ زندگی + سرمایهٔ سرمایه‌گذاری + سرمایهٔ دلتا نوترال   (ذخیره هرگز وارد برنامه نمی‌شود)
 *   خرید پله‌ای        = بخشی از سرمایهٔ سرمایه‌گذاری، مساوی بین پله‌ها؛ قیمت پله = قیمت فعلی × (۱ − ریزش)
 *   میانگین خرید       = جمع دلار ÷ جمع مقدار (اگر همهٔ پله‌ها پر شوند)
 *   ذخیرهٔ فرصت        = سرمایهٔ سرمایه‌گذاری − خرید پله‌ای
 *   گزینه‌های دلتا     = همان calcDeltaNeutral؛ مارجین هر صرافی = نصف سرمایهٔ دلتا، ارزش هر طرف = مارجین × اهرم
 *
 * هیچ عددی برای ارزش پوینت یا بازده بیرون از این ابزارها حدس زده نمی‌شود.
 */
import { D, round12 } from './money';
import { calcDeltaNeutral, type DeltaLeg, type DeltaResult } from './deltaNeutral';

export type LadderStyle = 'careful' | 'balanced' | 'deep';

/** درصد ریزش هر پله از قیمت فعلی */
export const LADDER_STYLES: Record<LadderStyle, readonly number[]> = {
  careful: [10, 20, 30],
  balanced: [15, 25, 35],
  deep: [20, 30, 40]
};

export interface LadderStep {
  dropPct: number;
  price: number;
  usd: number;
  qty: number;
}

export interface LadderPlan {
  steps: LadderStep[];
  totalUsd: number;
  totalQty: number;
  /** null وقتی قیمت یا مبلغ صفر است */
  avgPrice: number | null;
  deepestDropPct: number;
}

const pos = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);

export function ladderPlan(price: number, usd: number, drops: readonly number[]): LadderPlan {
  const p = pos(price);
  const total = pos(usd);
  const valid = drops.filter((d) => Number.isFinite(d) && d > 0 && d < 100);
  const each = valid.length ? D(total).div(valid.length) : D(0);
  const steps = valid.map((dropPct) => {
    const stepPrice = D(p).mul(D(100).minus(dropPct)).div(100);
    return { dropPct, price: round12(stepPrice), usd: round12(each), qty: stepPrice.gt(0) ? round12(each.div(stepPrice)) : 0 };
  });
  const totalQty = steps.reduce((s, x) => s.plus(x.qty), D(0));
  return {
    steps,
    totalUsd: valid.length ? total : 0,
    totalQty: round12(totalQty),
    avgPrice: totalQty.gt(0) ? round12(D(total).div(totalQty)) : null,
    deepestDropPct: valid.length ? Math.max(...valid) : 0
  };
}

export interface PlanAllocation {
  total: number;
  reserve: number;
  ladder: number;
  /** سرمایهٔ سرمایه‌گذاری که در پله‌ها نیست */
  opportunity: number;
  delta: number;
}

export function allocatePlan(reserveUsd: number, investUsd: number, deltaUsd: number, ladderSharePct: number): PlanAllocation {
  const reserve = pos(reserveUsd);
  const invest = pos(investUsd);
  const delta = pos(deltaUsd);
  const ladder = round12(D(invest).mul(Math.min(pos(ladderSharePct), 100)).div(100));
  return { total: round12(D(reserve).plus(invest).plus(delta)), reserve, ladder, opportunity: round12(D(invest).minus(ladder)), delta };
}

export interface DeltaOptionInput<K extends string> {
  key: K;
  long: DeltaLeg;
  short: DeltaLeg;
}

export interface DeltaOption<K extends string> {
  key: K;
  result: DeltaResult;
}

/** همهٔ جفت‌ها با همان سرمایه، اهرم و مدت؛ بیشترین سود خالص اول */
export function rankDeltaOptions<K extends string>(options: readonly DeltaOptionInput<K>[], capitalUsd: number, leverage: number, holdHours: number): DeltaOption<K>[] {
  const lev = pos(leverage);
  // مارجین هر صرافی = نصف سرمایه؛ ارزش هر طرف = مارجین × اهرم
  const notional = round12(D(pos(capitalUsd)).div(2).mul(lev));
  return options
    .map((o) => ({ key: o.key, result: calcDeltaNeutral({ notional, leverage: lev, holdHours, cycles: 1, long: o.long, short: o.short }) }))
    .sort((a, b) => b.result.net - a.result.net);
}

/* ---------------- بهای تمام‌شده: FIFO / LIFO / میانگین ---------------- */

export interface Lot {
  qty: number;
  unitCost: number;
  /** ترتیب زمانی (میلی‌ثانیه)؛ پله‌های آینده بعد از همهٔ خریدهای قبلی */
  at: number;
  source: 'existing' | 'ladder';
}

/** خریدهای ثبت‌شده منهای فروش‌ها: اگر موجودی فعلی کمتر از جمع خریدهاست، فروش از قدیمی‌ترین بسته‌ها کم می‌شود (FIFO) */
export function remainingLots(lots: readonly Lot[], currentQty: number | null): Lot[] {
  const sorted = lots.filter((l) => l.qty > 0 && l.unitCost >= 0).sort((a, b) => a.at - b.at);
  if (currentQty === null || !Number.isFinite(currentQty)) return sorted;
  let sold = D(sorted.reduce((s, l) => s + l.qty, 0)).minus(Math.max(0, currentQty));
  const out: Lot[] = [];
  for (const l of sorted) {
    if (sold.gte(l.qty)) {
      sold = sold.minus(l.qty);
      continue;
    }
    out.push(sold.gt(0) ? { ...l, qty: round12(D(l.qty).minus(sold)) } : l);
    sold = D(0);
  }
  return out;
}

export interface Holding {
  qty: number;
  cost: number;
  /** null بدون دارایی */
  avgCost: number | null;
}

export function holdingOf(lots: readonly Lot[]): Holding {
  const qty = lots.reduce((s, l) => s.plus(l.qty), D(0));
  const cost = lots.reduce((s, l) => s.plus(D(l.qty).mul(l.unitCost)), D(0));
  return { qty: round12(qty), cost: round12(cost), avgCost: qty.gt(0) ? round12(cost.div(qty)) : null };
}

/** بسته‌های پله‌ای که در این سناریو پر شده‌اند (پله‌ها از بالا به پایین پر می‌شوند) */
export function ladderLots(plan: LadderPlan, filledSteps: number, after: number): Lot[] {
  return plan.steps.slice(0, Math.max(0, filledSteps)).map((s, i) => ({ qty: s.qty, unitCost: s.price, at: after + i + 1, source: 'ladder' as const }));
}

export type CostMethod = 'fifo' | 'lifo' | 'average';

export interface SaleResult {
  qty: number;
  proceeds: number;
  cost: number;
  realized: number;
}

/** فروش فرضی qty واحد در قیمت price؛ FIFO = قدیمی‌ترین بسته اول، LIFO = جدیدترین اول، میانگین = میانگین موزون همه */
export function sellAs(lots: readonly Lot[], qty: number, price: number, method: CostMethod): SaleResult {
  const h = holdingOf(lots);
  const q = Math.min(Math.max(0, qty), h.qty);
  const proceeds = D(q).mul(Math.max(0, price));
  let cost = D(0);
  if (method === 'average') cost = h.avgCost === null ? D(0) : D(q).mul(h.avgCost);
  else {
    const ordered = [...lots].sort((a, b) => (method === 'fifo' ? a.at - b.at : b.at - a.at));
    let left = D(q);
    for (const l of ordered) {
      if (left.lte(0)) break;
      const take = left.gt(l.qty) ? D(l.qty) : left;
      cost = cost.plus(take.mul(l.unitCost));
      left = left.minus(take);
    }
  }
  return { qty: round12(D(q)), proceeds: round12(proceeds), cost: round12(cost), realized: round12(proceeds.minus(cost)) };
}

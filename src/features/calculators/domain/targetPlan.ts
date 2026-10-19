/**
 * «هدف سود»: برای رسیدن به یک سود دلاری مشخص (مثلاً ۱۰۰۰ دلار) با هر استراتژی ریسک‌محدود،
 * چه اندازه‌ای لازم است و چقدر سرمایه قفل می‌شود. مستقل از سرمایهٔ کاربر.
 *
 * فقط استراتژی‌هایی که هم سود و هم زیانشان سقف دارد بررسی می‌شوند؛ سود هدف = حداکثر سود منهای کارمزد باز کردن.
 * هیچ استراتژی آپشنی در همهٔ سناریوها سود نمی‌دهد؛ این تابع فقط هزینه و احتمال رسیدن به هدف را شفاف می‌کند.
 */
import { buildStrategy, scenarios, type BuiltStrategy, type ChainOption, type MarketInputs, type ScenarioRow, type StrategyId } from './optionStrategies';

/** استراتژی‌های ریسک‌محدود با سود سقف‌دار، بدون نیاز به دارایی از قبل */
export const TARGET_CANDIDATES: readonly StrategyId[] = ['iron_condor', 'iron_butterfly', 'bull_put_spread', 'bear_call_spread', 'bull_call_spread', 'bear_put_spread'];

export const TARGET_MOVES = [20, 10, 5, 0, -5, -10, -20] as const;

export interface TargetPlan {
  b: BuiltStrategy;
  /** سود خالص اگر همه‌چیز طبق برنامه پیش برود: حداکثر سود − کارمزد */
  netMaxProfit: number;
  /** سرمایهٔ لازم: وثیقه (= حداکثر زیان) + کارمزد */
  capitalNeeded: number;
  /** زیان خالص در بدترین حالت: حداکثر زیان + کارمزد */
  worstLoss: number;
  /** سود هدف ÷ سرمایهٔ لازم */
  returnOnCapital: number;
  /** احتمال تقریبی سود از IV؛ null بدون IV */
  pop: number | null;
  /** سود یا زیان در سررسید پس از کسر کارمزد باز کردن */
  scenarios: (ScenarioRow & { net: number })[];
}

function plan(id: StrategyId, chain: readonly ChainOption[], m: MarketInputs, target: number): TargetPlan | null {
  // سقف ریسک صفر → کوچک‌ترین اندازه؛ از آن اعداد هر واحد به دست می‌آید
  const unit = buildStrategy(id, chain, m, 0, 0);
  if (!unit || unit.stats.maxProfit === null || unit.stats.maxLoss === null || unit.fees === null) return null;
  const perUnitNet = (unit.stats.maxProfit - unit.fees) / unit.qty;
  const perUnitLoss = unit.stats.maxLoss / unit.qty;
  if (!(perUnitNet > 0) || !(perUnitLoss > 0)) return null;
  const step = m.amountStep > 0 ? m.amountStep : m.minAmount;
  let qty = Math.max(m.minAmount, Math.ceil(target / perUnitNet / step - 1e-9) * step);
  // کارمزد سقف‌دار است و خطی نیست؛ اگر به هدف نرسید یک پله بزرگ‌تر
  for (let i = 0; i < 5; i++) {
    const b = buildStrategy(id, chain, m, perUnitLoss * qty * (1 + 1e-9), 0);
    if (!b || b.stats.maxProfit === null || b.stats.maxLoss === null || b.fees === null) return null;
    const net = b.stats.maxProfit - b.fees;
    if (net >= target - 0.005) {
      const capitalNeeded = b.stats.maxLoss + b.fees;
      return {
        b,
        netMaxProfit: net,
        capitalNeeded,
        worstLoss: b.stats.maxLoss + b.fees,
        returnOnCapital: net / capitalNeeded,
        pop: b.stats.pop,
        scenarios: scenarios(b, m.spot, m.T, TARGET_MOVES).map((r) => ({ ...r, net: r.atExpiry - b.fees! }))
      };
    }
    qty = Math.round((qty + step) * 1e8) / 1e8;
  }
  return null;
}

/**
 * همهٔ گزینه‌های رسیدن به هدف، مرتب‌شده: بیشترین احتمال سود، سپس سرمایهٔ کمتر.
 * گزینهٔ اول «پیشنهاد» است؛ بقیه برای مقایسه.
 */
export function plansForTarget(chain: readonly ChainOption[], m: MarketInputs, targetUsd: number): TargetPlan[] {
  if (!(targetUsd > 0)) return [];
  return TARGET_CANDIDATES.map((id) => plan(id, chain, m, targetUsd))
    .filter((p): p is TargetPlan => p !== null)
    .sort((a, b) => (b.pop ?? -1) - (a.pop ?? -1) || a.capitalNeeded - b.capitalNeeded);
}

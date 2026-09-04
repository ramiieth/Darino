/** ============================================================
 * DeFi Loop Engine — هماهنگ‌کننده (Reference + Economics + Risk جدا)
 *
 * معماری (Separation of Concerns):
 *  - reference/ : مدل مرجع DeFiLlama — LTV + ۵ Loop → Leverage/Total Supply/Borrow/Looped APY
 *  - economics/ : Net Profit شفاف — Gross Yield − Net Financing − Operating Costs
 *  - risk/      : Health Factor / Liquidation / Stress / Recommended Safe Loops
 *  - parsers/   : نرمال‌سازی ورودی‌ها و اجزای APY (بدون double-count)
 *
 * ⚠️ Reference Leverage هرگز با ضریب مخفی (borrowFactor) کاهش نمی‌یابد؛
 *    Risk فقط «وضعیت» را گزارش می‌کند و «توصیه» جدا است.
 * ⚠️ داده ناشناخته → null/N/A — هرگز حدس نمی‌زنیم.
 * ============================================================ */
import {
  calculateLoopLeverage,
  referenceLoop,
  referenceLoopsByLiquidity,
  REFERENCE_LOOPS
} from '@/features/defi-loop/domain/reference/leverage';
import { loopedApy } from '@/features/defi-loop/domain/reference/apy';
import {
  healthFactor,
  maxSafeBorrow,
  liquidationDistancePct,
  liquidationPriceDropPct,
  classifyRiskLevel,
  type RiskLevel,
  RISK_LEVEL_FA
} from '@/features/defi-loop/domain/risk/healthFactor';
import {
  stressHealthFactors,
  type StressPoint
} from '@/features/defi-loop/domain/risk/stressTest';
import {
  simulateSafeLoops,
  type RecStep
} from '@/features/defi-loop/domain/risk/recommendation';
import {
  computeEconomics,
  referenceEconomics,
  type LoopEconomics
} from '@/features/defi-loop/domain/economics/netProfit';

/* ---------------- تایپ‌های سطح امنیت (پیش‌فرض UI — نه واقعیت Protocol) ---------------- */

export type SafetyLevel = 'conservative' | 'balanced' | 'aggressive';

export const SAFETY_HF_MIN: Record<SafetyLevel, number> = {
  conservative: 2.0,
  balanced: 1.75,
  aggressive: 1.5
};

export const SAFETY_LABEL: Record<SafetyLevel, string> = {
  conservative: 'محافظه‌کارانه',
  balanced: 'متوازن',
  aggressive: 'تهاجمی'
};

/* ---------------- LoopParams ---------------- */

export interface LoopParams {
  initialCapital: number;
  /** APY پایه Supply (Decimal 0.05 = 5%) */
  supplyApy: number;
  /** APY پاداش Supply (Decimal) */
  rewardApy: number;
  /** APY پایه Borrow (Decimal) — null = ناشناخته */
  borrowApy: number | null;
  /** APY پاداش/Incentive Borrow (Decimal) — null = بدون پاداش (هزینه را کاهش می‌دهد) */
  borrowRewardApy?: number | null;
  /** LTV (Decimal) — null = ناشناخته */
  ltv: number | null;
  /** Liquidation Threshold (Decimal) — null = ناشناخته */
  liquidationThreshold: number | null;
  days: number;
  safety: SafetyLevel;
  /** هزینه هر Loop (gas + swap) — دلار */
  costPerLoopUsd: number;
  slippageUsd: number; // دلار
  bridgeFeeUsd: number;
  /** محدودیت تعداد Loop پروتکل — null = ناشناخته */
  protocolMaxLoops: number | null;
  /** نقدینگی قابل‌قرض‌گیری — null = ناشناخته */
  availableBorrowLiquidity: number | null;
  /** نرخ تنزیل Reward در سناریو (۱ = فعلی، ۰.۵ = محافظه‌کارانه، ۱.۵ = خوش‌بینانه) */
  rewardMultiplier?: number;
  /** نرخ تنزیل Supply (برای سناریوها) */
  supplyMultiplier?: number;
  /** نرخ تنزیل Borrow (برای سناریوها) */
  borrowMultiplier?: number;
}

export interface LoopStep {
  loop: number;
  supply: number;
  borrow: number;
  totalSupply: number;
  totalBorrow: number;
  leverage: number;
  healthFactor: number | null;
  status: 'safe' | 'warning' | 'unsafe' | 'stopped';
  reason?: string;
}

/* ---------------- خروجی‌های جدید (جدا) ---------------- */

/** Reference Loop — مدل مرجع DeFiLlama (بدون هیچ تعدیل ریسک) */
export interface LoopReference {
  /** تعداد گام (پیش‌فرض ۵ — محدود به سقف پروتکل/نقدینگی) */
  loops: number | null;
  /** Leverage = Σ LTV^i — null اگر LTV ناشناخته */
  leverage: number | null;
  totalSupply: number | null;
  totalBorrow: number | null;
  /** Effective Supply = Base + Reward (Decimal) */
  effectiveSupplyApy: number;
  /** Net Borrow = Base − Reward (Decimal) — null اگر Borrow ناشناخته */
  netBorrowApy: number | null;
  /** Looped APY (سالانه، Decimal) — خالص مرجع؛ Gas/Slippage داخل آن نیست */
  loopedApy: number | null;
  /** اقتصاد مرجع (بدون هزینه عملیاتی کاربر) — سالانه */
  refSupplyIncome: number | null;
  refBorrowCost: number | null;
  refNetProfit: number | null;
}

/** Risk — وضعیت ریسک (جدا از Reference) */
export interface LoopRisk {
  healthFactor: number | null;
  riskLevel: RiskLevel;
  /** ٪ فاصله تا لیکوییدیشن واقعی (HF=1) — افت قیمت مجاز Collateral */
  liquidationDistancePct: number | null;
  /** ٪ فاصله تا حد ایمنی (hfMin) */
  safetyDistancePct: number | null;
  stress: StressPoint[];
}

/** Recommendation — توصیه ایمن (جدا از Reference) */
export interface LoopRecommendation {
  recommendedLoops: number;
  recommendedLeverage: number;
  maxSafeLoops: number;
  reason: string;
}

export interface LoopResult {
  steps: LoopStep[];
  recommendedLoops: number;
  maxSafeLoops: number;
  totalSupply: number;
  totalBorrow: number;
  leverage: number;
  finalHealthFactor: number | null;
  /* ---------- سود و هزینه (همان فیلدهای قبلی — سازگاری) ---------- */
  supplyIncome: number;
  rewardIncome: number;
  borrowCost: number;
  grossProfit: number;
  totalCosts: number;
  netProfit: number;
  realRoi: number; // ٪
  realApy: number; // Decimal
  /** محاسبه کامل است یا پارامترهای کلیدی ناشناخته‌اند؟ */
  complete: boolean;
  warnings: string[];
  stops: string[];
  /* ---------- موتورهای جدا ---------- */
  reference: LoopReference;
  risk: LoopRisk;
  economics: LoopEconomics;
  recommendation: LoopRecommendation;
}

/* ---------------- اجرای کامل ---------------- */

export function runLoopStrategy(p: LoopParams): LoopResult {
  const warnings: string[] = [];
  const stops: string[] = [];
  const hfMin = SAFETY_HF_MIN[p.safety];
  const tf = p.days > 0 ? p.days / 365 : 1;

  const supplyRate = (p.supplyApy ?? 0) * (p.supplyMultiplier ?? 1);
  const rewardRate = (p.rewardApy ?? 0) * (p.rewardMultiplier ?? 1);
  const borrowRate = (p.borrowApy ?? 0) * (p.borrowMultiplier ?? 1);
  const borrowRewardRate = (p.borrowRewardApy ?? 0) * (p.rewardMultiplier ?? 1);
  const netBorrowRate = borrowRate - borrowRewardRate;
  const effectiveSupplyRate = supplyRate + rewardRate;

  /* ===== Reference Engine (مدل مرجع DeFiLlama — همیشه بدون تعدیل) ===== */
  const reference = buildReference(p, effectiveSupplyRate, netBorrowRate, tf);

  /* ===== پارامترهای ناقص → فقط بدون اهرم (N/A برای اهرم/ریسک) ===== */
  if (p.ltv === null || p.liquidationThreshold === null || p.borrowApy === null) {
    const econ = computeEconomics({
      initialCapital: p.initialCapital,
      stepSupplies: [p.initialCapital],
      stepBorrows: [],
      supplyRate,
      rewardRate,
      borrowRate,
      borrowRewardRate,
      costPerLoopUsd: p.costPerLoopUsd,
      slippageUsd: p.slippageUsd,
      bridgeFeeUsd: p.bridgeFeeUsd,
      days: p.days
    });
    return {
      steps: [{
        loop: 1, supply: p.initialCapital, borrow: 0,
        totalSupply: p.initialCapital, totalBorrow: 0, leverage: 1,
        healthFactor: null, status: 'safe'
      }],
      recommendedLoops: 1,
      maxSafeLoops: 1,
      totalSupply: p.initialCapital,
      totalBorrow: 0,
      leverage: 1,
      finalHealthFactor: null,
      supplyIncome: econ.supplyIncome,
      rewardIncome: econ.rewardIncome,
      borrowCost: econ.borrowCost,
      grossProfit: econ.grossYield,
      totalCosts: econ.financingCost + econ.operatingCosts,
      netProfit: econ.netProfit,
      realRoi: econ.realRoiPct,
      realApy: econ.realApy,
      complete: false,
      warnings: [
        ...warnings,
        'Borrow APY / LTV / Liquidation Threshold از API عمومی در دسترس نیست — بدون اهرم محاسبه شد (کاربر می‌تواند در Calculator وارد کند)'
      ],
      stops,
      reference,
      risk: {
        healthFactor: null,
        riskLevel: 'unknown',
        liquidationDistancePct: null,
        safetyDistancePct: null,
        stress: []
      },
      economics: econ,
      recommendation: {
        recommendedLoops: 0,
        recommendedLeverage: 1,
        maxSafeLoops: 0,
        reason: 'پارامترهای کلیدی (LTV/Borrow/LT) ناشناخته‌اند — بدون اهرم'
      }
    };
  }

  /* ===== Risk-constrained simulation (توصیه — جدا از Reference) ===== */
  const sim = simulateSafeLoops({
    initialCapital: p.initialCapital,
    ltv: p.ltv,
    liquidationThreshold: p.liquidationThreshold,
    hfMin,
    protocolMaxLoops: p.protocolMaxLoops,
    availableBorrowLiquidity: p.availableBorrowLiquidity,
    netSpreadRate: effectiveSupplyRate - netBorrowRate,
    costPerLoopUsd: p.costPerLoopUsd,
    timeFraction: tf
  });
  stops.push(...sim.stops);

  const steps: LoopStep[] = sim.steps.map((s: RecStep) => ({
    loop: s.loop,
    supply: s.supply,
    borrow: s.borrow,
    totalSupply: s.totalSupply,
    totalBorrow: s.totalBorrow,
    leverage: s.leverage,
    healthFactor: s.healthFactor,
    status: s.status
  }));

  const recommendedLoops = sim.recommendedLoops;
  const maxSafeLoops = sim.maxSafeLoops;
  const recommendedLeverage = sim.recommendedLeverage;

  // جدول و اقتصاد فقط در نقطه پیشنهادی (گام‌های «safe» — گام هشدار نمایش داده نمی‌شود)
  const recSteps = steps.slice(0, recommendedLoops);

  // وضعیت نهایی در نقطه پیشنهادی
  const recStep = recSteps[recSteps.length - 1];
  const finalSupply = recStep ? recStep.totalSupply : p.initialCapital;
  const finalBorrow = recStep ? recStep.totalBorrow : 0;
  const finalHf = healthFactor(finalSupply, finalBorrow, p.liquidationThreshold);

  /* ===== Economics (Net Profit شفاف) ===== */
  const economics = computeEconomics({
    initialCapital: p.initialCapital,
    stepSupplies: [p.initialCapital, ...recSteps.map((s) => s.supply)],
    stepBorrows: recSteps.map((s) => s.borrow),
    supplyRate,
    rewardRate,
    borrowRate,
    borrowRewardRate,
    costPerLoopUsd: p.costPerLoopUsd,
    slippageUsd: p.slippageUsd,
    bridgeFeeUsd: p.bridgeFeeUsd,
    days: p.days
  });

  /* ===== Risk (جدا) ===== */
  const risk: LoopRisk = {
    healthFactor: finalHf,
    riskLevel: classifyRiskLevel(finalHf),
    liquidationDistancePct: liquidationPriceDropPct(finalSupply, finalBorrow, p.liquidationThreshold),
    safetyDistancePct: liquidationDistancePct(finalHf, hfMin),
    stress:
      finalBorrow > 0
        ? stressHealthFactors(finalSupply, finalBorrow, p.liquidationThreshold, [0, 5, 10, 15, 20, 30])
        : []
  };

  if (borrowRate > 0 && p.borrowApy !== null) {
    warnings.push('Borrow APY متغیر است — هزینه Borrow برآوردی است (Estimated Borrow Cost)');
  }
  if (steps.length >= (p.protocolMaxLoops ?? 100) && p.protocolMaxLoops !== null) {
    stops.push(`محدودیت ${p.protocolMaxLoops} Loop پروتکل اعمال شد`);
  }

  const reason = stops[stops.length - 1] ?? 'تا حد ایمنی ادامه یافت';

  return {
    steps: recSteps,
    recommendedLoops,
    maxSafeLoops,
    totalSupply: finalSupply,
    totalBorrow: finalBorrow,
    leverage: finalSupply / p.initialCapital,
    finalHealthFactor: finalHf,
    supplyIncome: economics.supplyIncome,
    rewardIncome: economics.rewardIncome,
    borrowCost: economics.borrowCost,
    grossProfit: economics.grossYield,
    totalCosts: economics.financingCost + economics.operatingCosts,
    netProfit: economics.netProfit,
    realRoi: economics.realRoiPct,
    realApy: economics.realApy,
    complete: true,
    warnings,
    stops,
    reference,
    risk,
    economics,
    recommendation: {
      recommendedLoops,
      recommendedLeverage,
      maxSafeLoops,
      reason
    }
  };
}

/* ---------------- Reference Builder ---------------- */

function buildReference(
  p: LoopParams,
  effectiveSupplyRate: number,
  netBorrowRate: number,
  tf: number
): LoopReference {
  if (p.ltv === null) {
    return {
      loops: null,
      leverage: null,
      totalSupply: null,
      totalBorrow: null,
      effectiveSupplyApy: effectiveSupplyRate,
      netBorrowApy: p.borrowApy === null ? null : netBorrowRate,
      loopedApy: null,
      refSupplyIncome: null,
      refBorrowCost: null,
      refNetProfit: null
    };
  }

  // ۵ گام مرجع — محدود به سقف پروتکل و نقدینگی
  const loops = referenceLoopsByLiquidity(
    p.ltv,
    p.initialCapital,
    p.protocolMaxLoops !== null ? Math.min(REFERENCE_LOOPS, p.protocolMaxLoops) : REFERENCE_LOOPS,
    p.availableBorrowLiquidity
  );
  const ref = referenceLoop(p.ltv, p.initialCapital, loops);

  const netBorrow = p.borrowApy === null ? null : netBorrowRate;
  const refApy = loopedApy(effectiveSupplyRate, netBorrow, ref.leverage);

  let refEcon: ReturnType<typeof referenceEconomics> | null = null;
  if (netBorrow !== null) {
    refEcon = referenceEconomics({
      initialCapital: p.initialCapital,
      leverage: ref.leverage,
      effectiveSupplyApy: effectiveSupplyRate,
      netBorrowApy: netBorrow,
      days: p.days
    });
  }

  return {
    loops: ref.loops,
    leverage: ref.leverage,
    totalSupply: ref.totalSupply,
    totalBorrow: ref.totalBorrow,
    effectiveSupplyApy: effectiveSupplyRate,
    netBorrowApy: netBorrow,
    loopedApy: refApy,
    refSupplyIncome: refEcon?.supplyIncome ?? null,
    refBorrowCost: refEcon?.borrowCost ?? null,
    refNetProfit: refEcon?.netProfit ?? null
  };
}

/* ---------------- Re-export (سازگاری کامل API قبلی) ---------------- */

export { calculateLoopLeverage, REFERENCE_LOOPS } from '@/features/defi-loop/domain/reference/leverage';
export { loopedApy } from '@/features/defi-loop/domain/reference/apy';
export {
  healthFactor,
  maxSafeBorrow,
  liquidationDistancePct,
  liquidationPriceDropPct,
  classifyRiskLevel,
  RISK_LEVEL_FA,
  type RiskLevel
} from '@/features/defi-loop/domain/risk/healthFactor';
export { stressHealthFactors, type StressPoint } from '@/features/defi-loop/domain/risk/stressTest';
export type { LoopEconomics } from '@/features/defi-loop/domain/economics/netProfit';
export { parseLtvInput, parsePercentInput, parseSupplyComponents, effectiveSupplyAPY, netBorrowAPY } from '@/features/defi-loop/domain/parsers/yieldComponents';

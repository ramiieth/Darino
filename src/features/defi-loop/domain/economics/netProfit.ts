/**
 * Economics Engine — Net Profit شفاف و قابل Audit
 *
 *   Gross Yield          = Supply Income + Supply Rewards
 *   Net Financing Cost   = Borrow Interest − Borrow Rewards (Incentive)
 *   Operating Costs      = Gas + Slippage + Bridge + سایر
 *   Net Profit           = Gross Yield − Net Financing Cost − Operating Costs
 *
 * ⚠️ Gas/Slippage هرگز داخل «Looped APY مرجع DeFiLlama» نمی‌رود — فقط در Net Profit کاربر.
 * ⚠️ گرد کردن فقط در نمایش — محاسبه داخلی با دقت بالا.
 */

export interface EconomicsInput {
  /** سرمایه اولیه (دلار) */
  initialCapital: number;
  /** مجموع Supply هر گام (شامل سرمایه اولیه به‌عنوان گام صفر) */
  stepSupplies: number[];
  /** مجموع Borrow هر گام */
  stepBorrows: number[];
  supplyRate: number;      // Decimal
  rewardRate: number;      // Decimal
  borrowRate: number;      // Decimal (پایه)
  borrowRewardRate: number; // Decimal (incentive — هزینه را کاهش می‌دهد)
  costPerLoopUsd: number;
  slippageUsd: number;
  bridgeFeeUsd: number;
  days: number;
}

export interface LoopEconomics {
  /** days/365 */
  timeFraction: number;
  supplyIncome: number;
  rewardIncome: number;
  grossYield: number;
  borrowCost: number;
  borrowRewardIncome: number;
  /** = borrowCost − borrowRewardIncome (می‌تواند منفی = incentive بیش از بهره) */
  financingCost: number;
  operatingCosts: number;
  netProfit: number;
  /** ٪ — نسبت سود خالص به سرمایه اولیه در بازه */
  realRoiPct: number;
  /** Decimal — (1 + netProfit/C)^(365/days) − 1 — جدا از Looped APY مرجع */
  realApy: number;
}

export function computeEconomics(input: EconomicsInput): LoopEconomics {
  const tf = input.days > 0 ? input.days / 365 : 1;

  const supplyIncome =
    input.stepSupplies.reduce((s, x) => s + x, 0) * input.supplyRate * tf;
  const rewardIncome =
    input.stepSupplies.reduce((s, x) => s + x, 0) * input.rewardRate * tf;
  const borrowCost =
    input.stepBorrows.reduce((s, x) => s + x, 0) * input.borrowRate * tf;
  const borrowRewardIncome =
    input.stepBorrows.reduce((s, x) => s + x, 0) * input.borrowRewardRate * tf;

  const grossYield = supplyIncome + rewardIncome;
  const financingCost = borrowCost - borrowRewardIncome;
  const operatingCosts =
    input.costPerLoopUsd * input.stepBorrows.length + input.slippageUsd + input.bridgeFeeUsd;
  const netProfit = grossYield - financingCost - operatingCosts;

  const realRoiPct = input.initialCapital > 0 ? (netProfit / input.initialCapital) * 100 : 0;
  const realApy =
    input.initialCapital > 0 && input.days > 0
      ? Math.pow(1 + netProfit / input.initialCapital, 365 / input.days) - 1
      : 0;

  return {
    timeFraction: tf,
    supplyIncome,
    rewardIncome,
    grossYield,
    borrowCost,
    borrowRewardIncome,
    financingCost,
    operatingCosts,
    netProfit,
    realRoiPct,
    realApy
  };
}

/** Economics مرجع (۵ حلقه، بدون هزینه‌های عملیاتی کاربر) — همان اعداد صفحه DeFiLlama */
export function referenceEconomics(input: {
  initialCapital: number;
  leverage: number;
  effectiveSupplyApy: number;
  netBorrowApy: number;
  days: number;
}): {
  supplyIncome: number;
  borrowCost: number;
  netProfit: number;
  netProfitPct: number;
} {
  const tf = input.days > 0 ? input.days / 365 : 1;
  const totalSupply = input.initialCapital * input.leverage;
  const totalBorrow = totalSupply - input.initialCapital;
  const supplyIncome = totalSupply * input.effectiveSupplyApy * tf;
  const borrowCost = totalBorrow * input.netBorrowApy * tf;
  const netProfit = supplyIncome - borrowCost;
  return {
    supplyIncome,
    borrowCost,
    netProfit,
    netProfitPct: input.initialCapital > 0 ? (netProfit / input.initialCapital) * 100 : 0
  };
}

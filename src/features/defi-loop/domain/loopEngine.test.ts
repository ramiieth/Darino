/**
 * تست‌ها — DeFi Loop Engine (Reference + Economics + Risk جدا)
 *
 * Regression Reference: مدل DeFiLlama Leveraged Lending (صفحه /yields/loop)
 *   Leverage = Σ LTV^i (i=0..5) · Looped APY = Supply×Lev − Borrow×(Lev−1)
 *   منابع نمونه: MainMarket / Aave V3 / Dolomite / Neverland / HyperLend
 */
import { describe, expect, it } from 'vitest';
import {
  runLoopStrategy,
  healthFactor,
  maxSafeBorrow,
  liquidationDistancePct,
  liquidationPriceDropPct,
  classifyRiskLevel,
  stressHealthFactors,
  calculateLoopLeverage,
  loopedApy,
  parseLtvInput,
  parsePercentInput,
  parseSupplyComponents,
  SAFETY_HF_MIN
} from '@/features/defi-loop/domain/loopEngine';
import { computeApyStats, computeTvlStats, riskIndicators, opportunityScore } from '@/features/defi-loop/domain/yieldAnalytics';

/* ---------------- Tolerance (اسپک §29): ±0.05 واحد درصد برای APYها ---------------- */
const APY_TOL = 0.05; // percentage point
const expectLoopApy = (actualPct: number, expectedPct: number) => {
  expect(Math.abs(actualPct - expectedPct)).toBeLessThanOrEqual(APY_TOL);
};

describe('healthFactor — فرمول HF', () => {
  it('HF = (Supply × LT) / Borrow', () => {
    expect(healthFactor(17000, 7000, 0.8)).toBeCloseTo((17000 * 0.8) / 7000, 9);
    expect(healthFactor(10000, 0, 0.8)).toBeNull(); // بدون borrow
    expect(healthFactor(10000, 5000, null)).toBeNull(); // LT ناشناخته
  });
});

describe('maxSafeBorrow — حداکثر Borrow امن (ابزار ریسک)', () => {
  it('Loop اول: S×LT/(HFmin−LT)', () => {
    // S=10000, LT=0.8, HFmin=1.75 → 8000/0.95 = 8421
    expect(maxSafeBorrow(10000, 0, 0.8, 1.75)).toBeCloseTo(8421.0526, 2);
  });
  it('LT ناشناخته → null', () => {
    expect(maxSafeBorrow(10000, 0, null, 1.75)).toBeNull();
  });
  it('LT >= HFmin → null (نامعتبر)', () => {
    expect(maxSafeBorrow(10000, 0, 0.9, 0.8)).toBeNull();
  });
});

/* =====================================================================
   REGRESSION — جدول Leverage مرجع DeFiLlama (اسپک §9)
   ===================================================================== */
describe('calculateLoopLeverage — جدول مرجع DeFiLlama (Σ LTV^i, i=0..5)', () => {
  const table: { ltv: number; expected: number; displayed: string }[] = [
    { ltv: 0.45, expected: 1.8030840625, displayed: '1.8x' },
    { ltv: 0.59, expected: 2.3361450399, displayed: '2.3x' },
    { ltv: 0.62, expected: 2.4821046432, displayed: '2.5x' },
    { ltv: 0.7, expected: 2.94117, displayed: '2.9x' },
    { ltv: 0.75, expected: 3.2880859375, displayed: '3.3x' },
    { ltv: 0.85, expected: 4.1523365625, displayed: '4.2x' }
  ];

  it.each(table)('LTV $ltv → $expected (نمایش $displayed)', ({ ltv, expected, displayed }) => {
    const actual = calculateLoopLeverage(ltv, 5);
    expect(actual).toBeCloseTo(expected, 3);
    // نمایش با یک رقم اعشار دقیقاً همان DeFiLlama است
    expect(`${actual.toFixed(1)}x`).toBe(displayed);
  });

  it('بدون Hardcode — فرمول عمومی است (LTV وسط جدول)', () => {
    // 0.60 → 1+.6+.36+.216+.1296+.07776 = 2.38336
    expect(calculateLoopLeverage(0.6, 5)).toBeCloseTo(2.38336, 6);
    expect(calculateLoopLeverage(0.5, 5)).toBeCloseTo(1.96875, 6);
  });

  it('Off-by-one: ۵ گام یعنی Σ تا L⁵ (۶ جمله) — نه Σ تا L⁴', () => {
    const five = calculateLoopLeverage(0.75, 5);   // 1+L+...+L⁵ = 3.2880859375
    const four = calculateLoopLeverage(0.75, 4);   // 1+L+...+L⁴ = 3.05078125
    expect(five).toBeCloseTo(3.2880859375, 9);
    expect(four).toBeCloseTo(3.05078125, 9);
    expect(five).toBeGreaterThan(four);
    expect(five - four).toBeCloseTo(Math.pow(0.75, 5), 9);
  });

  it('دقت بالا در محاسبه داخلی — گرد کردن فقط در نمایش', () => {
    expect(calculateLoopLeverage(0.85, 5)).toBeCloseTo(4.1523365625, 12);
    expect(calculateLoopLeverage(0.75, 5)).toBeCloseTo(3.2880859375, 12);
  });

  it('LTV نامعتبر/صفر → بدون اهرم', () => {
    expect(calculateLoopLeverage(0, 5)).toBe(1);
    expect(calculateLoopLeverage(-0.1, 5)).toBe(1);
  });
});

/* =====================================================================
   REGRESSION — Looped APY نمونه‌های DeFiLlama (اسپک §11-14، 27)
   ===================================================================== */
describe('loopedApy — فرمول مرجع: Supply×Lev − Borrow×(Lev−1)', () => {
  it('MainMarket: 9.79% / 3.77% / LTV 70% → 21.48%', () => {
    const lev = calculateLoopLeverage(0.7, 5);
    const apy = loopedApy(0.0979, 0.0377, lev);
    expect(apy).not.toBeNull();
    expectLoopApy((apy as number) * 100, 21.48);
  });

  it('Aave V3 USDC: 5.32% / 3.81% / LTV 75% → 8.79%', () => {
    const lev = calculateLoopLeverage(0.75, 5);
    const apy = loopedApy(0.0532, 0.0381, lev);
    expectLoopApy((apy as number) * 100, 8.79);
  });

  it('Dolomite USD1: 7.45% / 3.63% / LTV 85% → 19.48%', () => {
    const lev = calculateLoopLeverage(0.85, 5);
    const apy = loopedApy(0.0745, 0.0363, lev);
    expectLoopApy((apy as number) * 100, 19.48);
  });

  it('Neverland USDC: Supply 6.43% / Borrow Base 6.39% − Incentive 2.72% = 3.67% / LTV 85% → 15.11%', () => {
    const lev = calculateLoopLeverage(0.85, 5);
    const netBorrow = 0.0639 - 0.0272; // 3.67% — incentive به‌صورت صریح
    expect(netBorrow).toBeCloseTo(0.0367, 9);
    const apy = loopedApy(0.0643, netBorrow, lev);
    expectLoopApy((apy as number) * 100, 15.11);
  });

  it('HyperLend: 5.82% / 7.35% / LTV 62% → 3.57% (Borrow > Supply — سود کم ولی مثبت)', () => {
    const lev = calculateLoopLeverage(0.62, 5);
    const apy = loopedApy(0.0582, 0.0735, lev);
    expectLoopApy((apy as number) * 100, 3.57);
  });

  it('Neverland با borrowApy خام (بدون incentive) → APY بالاتر از مرجع (نشان می‌دهد incentive مهم است)', () => {
    const lev = calculateLoopLeverage(0.85, 5);
    const withIncentive = loopedApy(0.0643, 0.0639 - 0.0272, lev) as number;
    const withoutIncentive = loopedApy(0.0643, 0.0639, lev) as number;
    expect(withIncentive).toBeGreaterThan(withoutIncentive);
  });

  it('اگر Borrow ناشناخته باشد → null (N/A — هرگز صفر حدس نمی‌زنیم)', () => {
    expect(loopedApy(0.05, null, 2.5)).toBeNull();
    expect(loopedApy(null, 0.03, 2.5)).toBeNull();
  });
});

/* =====================================================================
   REFERENCE — خروجی مرجع در runLoopStrategy
   ===================================================================== */
describe('Reference Engine در runLoopStrategy', () => {
  const base = {
    initialCapital: 10000,
    supplyApy: 0.0979, // MainMarket Supply (کل — بدون Reward جدا)
    rewardApy: 0,
    borrowApy: 0.0377,
    borrowRewardApy: 0,
    ltv: 0.7,
    liquidationThreshold: 0.85,
    days: 365,
    safety: 'aggressive' as const,
    costPerLoopUsd: 0,
    slippageUsd: 0,
    bridgeFeeUsd: 0,
    protocolMaxLoops: null,
    availableBorrowLiquidity: null
  };

  it('Leverage مرجع = 2.94117 (با LTV 70%) — بدون هیچ ضریب مخفی', () => {
    const r = runLoopStrategy(base);
    expect(r.reference.leverage).toBeCloseTo(2.94117, 3);
    expect(r.reference.loops).toBe(5);
    expect(r.reference.totalSupply).toBeCloseTo(29411.7, 1);
    expect(r.reference.totalBorrow).toBeCloseTo(19411.7, 1);
  });

  it('Looped APY مرجع = 21.48% و Ref Net Profit ≈ 21.48% سرمایه', () => {
    const r = runLoopStrategy(base);
    expectLoopApy((r.reference.loopedApy as number) * 100, 21.48);
    // اقتصاد مرجع: درآمد Supply 29411.7×9.79% ≈ 2879.38 · هزینه Borrow 19411.7×3.77% ≈ 731.82
    expect(r.reference.refSupplyIncome).toBeCloseTo(2879.38, 0);
    expect(r.reference.refBorrowCost).toBeCloseTo(731.82, 0);
    expect(r.reference.refNetProfit).toBeCloseTo(2147.55, 0);
  });

  it('Gas/Slippage داخل Looped APY مرجع نمی‌رود — فقط در Net Profit کاربر', () => {
    const plain = runLoopStrategy(base);
    const withCosts = runLoopStrategy({ ...base, costPerLoopUsd: 40, slippageUsd: 25 });
    expect(withCosts.reference.loopedApy).toBe(plain.reference.loopedApy); // مرجع ثابت
    expect(withCosts.economics.operatingCosts).toBeCloseTo(40 * withCosts.steps.length + 25, 4);
    expect(withCosts.economics.netProfit).toBeLessThan(plain.economics.netProfit);
  });

  it('LTV مستقیماً در Loop استفاده می‌شود: Borrow_i = LTV × Supply_i', () => {
    const r = runLoopStrategy({ ...base, ltv: 0.75, supplyApy: 0.05, rewardApy: 0.01, borrowApy: 0.04 });
    // گام ۱: supply=10000، borrow=7500
    expect(r.steps[0].supply).toBeCloseTo(10000, 6);
    expect(r.steps[0].borrow).toBeCloseTo(7500, 6);
    if (r.steps.length > 1) {
      expect(r.steps[1].supply).toBeCloseTo(r.steps[0].borrow, 6); // بازگشتی
      expect(r.steps[1].borrow).toBeCloseTo(0.75 * r.steps[1].supply, 6);
    }
  });

  it('LTV ناشناخته → Reference leverage = null (N/A)', () => {
    const r = runLoopStrategy({ ...base, ltv: null });
    expect(r.reference.leverage).toBeNull();
    expect(r.reference.loopedApy).toBeNull();
    expect(r.complete).toBe(false);
  });
});

/* =====================================================================
   RISK — جدایی کامل از Reference
   ===================================================================== */
describe('Risk Engine — جدا از Reference (اسپک §16-17، 24)', () => {
  const params = {
    initialCapital: 10000,
    supplyApy: 0.05,
    rewardApy: 0.02,
    borrowApy: 0.03,
    ltv: 0.85, // مرجع 4.15x — ولی ریسک بالا
    liquidationThreshold: 0.9,
    days: 90,
    safety: 'conservative' as const, // hfMin = 2.0
    costPerLoopUsd: 0.5,
    slippageUsd: 5,
    bridgeFeeUsd: 0,
    protocolMaxLoops: null,
    availableBorrowLiquidity: null
  };

  it('Reference = 4.15x ولی Recommendation = کمتر (هر دو حقیقت حفظ می‌شوند)', () => {
    const r = runLoopStrategy(params);
    // مرجع دست‌نخورده
    expect(r.reference.leverage).toBeCloseTo(4.1523, 3);
    // HF گام ۱: (18500×0.9)/8500 = 1.9588 < 2.0 → حتی ۱ گام هم توصیه نمی‌شود (بدون اهرم)
    expect(r.recommendation.recommendedLoops).toBe(0);
    expect(r.recommendation.recommendedLeverage).toBe(1);
    expect(r.leverage).toBe(1);
    expect(r.recommendation.maxSafeLoops).toBe(0);
    expect(r.stops.some((s) => s.includes('HF'))).toBe(true);
  });

  it('Reference هرگز با ضریب مخفی کاهش نمی‌یابد — حتی وقتی ریسک بالا است', () => {
    const r = runLoopStrategy(params);
    expect(r.reference.leverage).toBeCloseTo(4.1523365625, 6); // دقیق — بدون borrowFactor
  });

  it('با hfMin پایین‌تر (تهاجمی) توصیه بالاتر می‌رود — ولی Reference ثابت است', () => {
    const aggressive = runLoopStrategy({ ...params, safety: 'aggressive' }); // hfMin=1.5
    // گام ۱: HF=1.9588 ≥ 1.5 safe → 1 گام توصیه
    expect(aggressive.recommendation.recommendedLoops).toBe(1);
    expect(aggressive.recommendation.recommendedLeverage).toBeCloseTo(1.85, 6);
    expect(aggressive.reference.leverage).toBeCloseTo(4.1523365625, 6); // مرجع ثابت — دست‌نخورده
  });

  it('classifyRiskLevel — آستانه‌های اسپک §24', () => {
    expect(classifyRiskLevel(2.5)).toBe('low');
    expect(classifyRiskLevel(1.8)).toBe('moderate');
    expect(classifyRiskLevel(1.35)).toBe('high');
    expect(classifyRiskLevel(1.1)).toBe('very-high');
    expect(classifyRiskLevel(0.9)).toBe('liquidation');
    expect(classifyRiskLevel(null)).toBe('unknown');
  });

  it('liquidationPriceDropPct — فاصله تا HF=1', () => {
    // S=17000, B=7000, LT=0.8 → dd = 1 − 7000/(17000×0.8) = 48.53%
    expect(liquidationPriceDropPct(17000, 7000, 0.8)).toBeCloseTo(48.53, 1);
    expect(liquidationPriceDropPct(10000, 0, 0.8)).toBeNull(); // بدون بدهی
    expect(liquidationPriceDropPct(17000, 7000, null)).toBeNull();
  });
});

/* =====================================================================
   NET PROFIT — شفاف و قابل Audit (اسپک §19-22)
   ===================================================================== */
describe('Economics — Net Profit Engine', () => {
  it('مثال اسپک §20: 10000$, Supply 9.79%, Borrow 3.77%, LTV 70% → Net ≈ 2147.55$ (21.48%)', () => {
    const r = runLoopStrategy({
      initialCapital: 10000,
      supplyApy: 0.0979,
      rewardApy: 0,
      borrowApy: 0.0377,
      ltv: 0.7,
      liquidationThreshold: 0.85,
      days: 365,
      safety: 'aggressive',
      costPerLoopUsd: 0,
      slippageUsd: 0,
      bridgeFeeUsd: 0,
      protocolMaxLoops: null,
      availableBorrowLiquidity: null
    });
    expect(r.reference.totalSupply).toBeCloseTo(29411.7, 0);
    expect(r.reference.totalBorrow).toBeCloseTo(19411.7, 0);
    expect(r.reference.refNetProfit as number).toBeCloseTo(2147.55, 0);
    expect(r.reference.refNetProfit as number).toBeCloseTo(r.reference.refSupplyIncome! - r.reference.refBorrowCost!, 6);
  });

  it('Net Profit = Gross Yield − Net Financing − Operating (تفکیک کامل)', () => {
    const r = runLoopStrategy({
      initialCapital: 10000,
      supplyApy: 0.05,
      rewardApy: 0.03,
      borrowApy: 0.04,
      ltv: 0.6, // چند گام ممکن (HF با LT=0.8 و hfMin تهاجمی)
      liquidationThreshold: 0.8,
      days: 90,
      safety: 'aggressive',
      costPerLoopUsd: 3,
      slippageUsd: 5,
      bridgeFeeUsd: 2,
      protocolMaxLoops: null,
      availableBorrowLiquidity: null
    });
    const e = r.economics;
    expect(e.grossYield).toBeCloseTo(e.supplyIncome + e.rewardIncome, 9);
    expect(e.financingCost).toBeCloseTo(e.borrowCost - e.borrowRewardIncome, 9);
    expect(e.operatingCosts).toBeCloseTo(3 * r.steps.length + 5 + 2, 9);
    expect(e.netProfit).toBeCloseTo(e.grossYield - e.financingCost - e.operatingCosts, 6);
    expect(r.grossProfit).toBe(e.grossYield);
    expect(r.totalCosts).toBeCloseTo(e.financingCost + e.operatingCosts, 6);
    expect(r.netProfit).toBeCloseTo(e.netProfit, 6);
    expect(r.realRoi).toBeCloseTo((e.netProfit / 10000) * 100, 6);
  });

  it('Borrow Incentive: financingCost = borrowCost − borrowReward', () => {
    const r = runLoopStrategy({
      initialCapital: 10000,
      supplyApy: 0.0643,
      rewardApy: 0,
      borrowApy: 0.0639,
      borrowRewardApy: 0.0272, // Neverland incentive
      ltv: 0.85,
      liquidationThreshold: 0.9,
      days: 365,
      safety: 'aggressive',
      costPerLoopUsd: 0,
      slippageUsd: 0,
      bridgeFeeUsd: 0,
      protocolMaxLoops: null,
      availableBorrowLiquidity: null
    });
    // گام ۱: borrow = 8500 → borrowCost = 8500×0.0639 = 543.15 · reward = 8500×0.0272 = 231.2
    expect(r.economics.borrowCost).toBeCloseTo(8500 * 0.0639, 1);
    expect(r.economics.borrowRewardIncome).toBeCloseTo(8500 * 0.0272, 1);
    expect(r.economics.financingCost).toBeCloseTo(8500 * (0.0639 - 0.0272), 1);
  });

  it('Real APY (کاربر، پس از هزینه‌ها) ≠ Looped APY (مرجع) — دو عدد جدا', () => {
    const r = runLoopStrategy({
      initialCapital: 10000,
      supplyApy: 0.0979,
      rewardApy: 0,
      borrowApy: 0.0377,
      ltv: 0.7,
      liquidationThreshold: 0.85,
      days: 90,
      safety: 'aggressive',
      costPerLoopUsd: 40,
      slippageUsd: 25,
      bridgeFeeUsd: 0,
      protocolMaxLoops: null,
      availableBorrowLiquidity: null
    });
    // مرجع (سالانه): 21.48%
    expectLoopApy((r.reference.loopedApy as number) * 100, 21.48);
    // کاربر: پس از هزینه‌ها و در بازه ۹۰ روز — باید متفاوت و کمتر باشد
    const userApyPct = r.economics.realApy * 100;
    expect(userApyPct).toBeLessThan(21.48);
  });
});

/* =====================================================================
   PARSERS — نرمال‌سازی و جلوگیری از double-count (اسپک §33-35)
   ===================================================================== */
describe('Parsers — نرمال‌سازی ورودی‌ها', () => {
  it('parseLtvInput: «75%» / «0.75» / «75» → 0.75', () => {
    expect(parseLtvInput('75%')).toBeCloseTo(0.75, 9);
    expect(parseLtvInput('0.75')).toBeCloseTo(0.75, 9);
    expect(parseLtvInput('75')).toBeCloseTo(0.75, 9);
    expect(parseLtvInput(0.85)).toBeCloseTo(0.85, 9);
    expect(parseLtvInput('٪۸۵')).toBeNull(); // فارسی معتبر نیست → کاربر باید عدد وارد کند
  });

  it('parsePercentInput: «5%» / «0.05» / «5» → 0.05', () => {
    expect(parsePercentInput('5%')).toBeCloseTo(0.05, 9);
    expect(parsePercentInput('0.05')).toBeCloseTo(0.05, 9);
    expect(parsePercentInput('5')).toBeCloseTo(0.05, 9);
    expect(parsePercentInput('3.67%')).toBeCloseTo(0.0367, 9);
  });

  it('parseSupplyComponents: 1.75 + 8.04 = 9.79 — بدون double-count', () => {
    const c = parseSupplyComponents(9.79, 1.75, 8.04);
    expect(c.base).toBeCloseTo(0.0175, 9);
    expect(c.reward).toBeCloseTo(0.0804, 9);
    expect(c.base + c.reward).toBeCloseTo(0.0979, 9); // = کل
  });

  it('apyBase نال → پایه = کل − Reward (جلوگیری از جمع دوباره)', () => {
    const c = parseSupplyComponents(9.79, null, 8.04);
    expect(c.base).toBeCloseTo(0.0175, 9);
    expect(c.reward).toBeCloseTo(0.0804, 9);
    expect(c.base + c.reward).toBeCloseTo(0.0979, 9);
  });

  it('هرگز کل + Reward جمع نمی‌شود', () => {
    const c = parseSupplyComponents(9.79, 9.79, 8.04); // داده خراب — کل و base یکی
    expect(c.base + c.reward).toBeCloseTo(0.1783, 9); // 9.79+8.04 = 17.83% — نه 9.79+9.79
  });
});

/* =====================================================================
   runLoopStrategy — رفتار کلی (مدل جدید، بدون borrowFactor)
   ===================================================================== */
describe('runLoopStrategy — اجرای کامل Loop', () => {
  const base = {
    initialCapital: 10000,
    supplyApy: 0.05,
    rewardApy: 0.03,
    borrowApy: 0.04,
    ltv: 0.75,
    liquidationThreshold: 0.8,
    days: 90,
    safety: 'aggressive' as const, // HFmin=1.5
    costPerLoopUsd: 0.5,
    slippageUsd: 5,
    bridgeFeeUsd: 0,
    protocolMaxLoops: null,
    availableBorrowLiquidity: null
  };

  it('Borrow = LTV × Supply گام (مدل بازگشتی) — توقف با HF حداقل', () => {
    const r = runLoopStrategy(base);
    // گام ۱: supply=10000، borrow=7500 → S=17500، B=7500، HF=1.8667 ≥ 1.5 (safe)
    expect(r.steps[0].supply).toBeCloseTo(10000, 6);
    expect(r.steps[0].borrow).toBeCloseTo(7500, 6);
    expect(r.steps[0].healthFactor).toBeCloseTo(1.8667, 3);
    // گام ۲: borrow=5625 → HF=1.4095 < 1.5 → متوقف (فقط ۱ گام در جدول)
    expect(r.steps).toHaveLength(1);
    expect(r.leverage).toBeCloseTo(1.75, 6);
    expect(r.totalSupply).toBeCloseTo(17500, 6);
    expect(r.totalBorrow).toBeCloseTo(7500, 6);
    expect(r.stops.some((s) => s.includes('HF'))).toBe(true);
  });

  it('با LTV=0.55 دو گام ایمن ممکن است (HF گام ۲ = 1.738 ≥ 1.65)', () => {
    const r = runLoopStrategy({ ...base, ltv: 0.55 });
    expect(r.steps.length).toBe(2);
    expect(r.steps[1].supply).toBeCloseTo(r.steps[0].borrow, 6); // supply = borrow قبلی
    expect(r.steps[1].borrow).toBeCloseTo(0.55 * r.steps[1].supply, 6);
    // S = 10000 + 5500 + 3025 = 18525
    expect(r.leverage).toBeCloseTo(18525 / 10000, 6);
    expect(r.finalHealthFactor).toBeCloseTo((18525 * 0.8) / 8525, 6);
    // گام‌های ۳ و ۴ ممکن‌اند (HF به مجانب LT/L = 1.4545 نزدیک می‌شود) ولی در باند هشدار → در maxSafe اما نه در توصیه
    expect(r.recommendation.maxSafeLoops).toBe(4);
    expect(r.recommendation.recommendedLoops).toBe(2);
  });

  it('سود: Supply + Reward − Borrow − هزینه‌ها (سازگار با فرمول قبلی)', () => {
    const r = runLoopStrategy(base);
    const tf = 90 / 365;
    const totalSupplied = r.steps.reduce((s, x) => s + x.supply, 0) + base.initialCapital;
    expect(r.supplyIncome).toBeCloseTo(totalSupplied * base.supplyApy * tf, 4);
    expect(r.rewardIncome).toBeCloseTo(totalSupplied * base.rewardApy * tf, 4);
    const totalBorrowed = r.steps.reduce((s, x) => s + x.borrow, 0);
    expect(r.borrowCost).toBeCloseTo(totalBorrowed * base.borrowApy * tf, 4);
    expect(r.grossProfit).toBeCloseTo(r.supplyIncome + r.rewardIncome, 6);
    expect(r.totalCosts).toBeCloseTo(r.borrowCost + base.costPerLoopUsd * r.steps.length + base.slippageUsd, 4);
    expect(r.netProfit).toBeCloseTo(r.grossProfit - r.totalCosts, 4);
    expect(r.realRoi).toBeCloseTo((r.netProfit / 10000) * 100, 4);
    expect(r.realApy).toBeCloseTo(Math.pow(1 + r.netProfit / 10000, 365 / 90) - 1, 6);
  });

  it('پارامترهای ناشناخته (بدون LTV) → محاسبه بدون اهرم + هشدار + Reference N/A', () => {
    const r = runLoopStrategy({ ...base, ltv: null, liquidationThreshold: null, borrowApy: null });
    expect(r.complete).toBe(false);
    expect(r.steps).toHaveLength(1);
    expect(r.leverage).toBe(1);
    expect(r.reference.leverage).toBeNull();
    expect(r.reference.loopedApy).toBeNull();
    expect(r.risk.riskLevel).toBe('unknown');
    expect(r.warnings.some((w) => w.includes('در دسترس نیست'))).toBe(true);
  });

  it('توقف: هزینه غیرمنطقی نسبت به سود احتمالی', () => {
    const r = runLoopStrategy({ ...base, costPerLoopUsd: 500, supplyApy: 0.01, borrowApy: 0.009 });
    expect(r.stops.length).toBeGreaterThan(0);
  });

  it('محدودیت نقدینگی قابل‌قرض', () => {
    const r = runLoopStrategy({ ...base, availableBorrowLiquidity: 2000 });
    expect(r.totalBorrow).toBeLessThanOrEqual(2000 + 1e-6);
    expect(r.stops.some((s) => s.includes('نقدینگی'))).toBe(true);
  });

  it('محدودیت تعداد Loop پروتکل — هم شبیه‌سازی هم Reference سقف می‌خورند', () => {
    const r = runLoopStrategy({ ...base, protocolMaxLoops: 2, ltv: 0.6 });
    expect(r.steps.length).toBeLessThanOrEqual(2);
    expect(r.reference.loops).toBeLessThanOrEqual(2);
  });

  it('سناریوهای Reward (محافظه‌کارانه/پایه/خوش‌بینانه)', () => {
    const conservative = runLoopStrategy({ ...base, rewardMultiplier: 0.5 });
    const baseRun = runLoopStrategy({ ...base, rewardMultiplier: 1 });
    const bull = runLoopStrategy({ ...base, rewardMultiplier: 1.5 });
    expect(conservative.rewardIncome).toBeLessThan(baseRun.rewardIncome);
    expect(bull.rewardIncome).toBeGreaterThan(baseRun.rewardIncome);
  });

  it('Recommended <= MaxSafe (۰ = بدون اهرم)', () => {
    const r = runLoopStrategy(base);
    expect(r.recommendedLoops).toBeGreaterThanOrEqual(0);
    expect(r.recommendedLoops).toBeLessThanOrEqual(Math.max(0, r.maxSafeLoops));
  });

  it('هیچ borrowFactor در خروجی وجود ندارد', () => {
    const r = runLoopStrategy(base);
    expect(r.reference.leverage).toBeCloseTo(calculateLoopLeverage(0.75, 5), 9);
    // borrow دقیقاً LTV × supply — نه × 0.75 اضافی
    expect(r.steps[0].borrow).toBeCloseTo(0.75 * r.steps[0].supply, 9);
  });
});

describe('liquidationDistancePct + Stress Test', () => {
  it('فاصله تا حد ایمنی', () => {
    // HF=2, HFmin=1.5 → (1 − 0.75) = 25%
    expect(liquidationDistancePct(2, 1.5)).toBeCloseTo(25, 6);
    expect(liquidationDistancePct(1.4, 1.5)).toBeNull();
  });

  it('Stress: افت قیمت → HF کاهش و ریسک', () => {
    const r = stressHealthFactors(10000, 6000, 0.8, [0, 10, 20, 30]);
    expect(r[0].hf).toBeCloseTo((10000 * 0.8) / 6000, 6);
    expect(r[3].hf as number).toBeLessThan(r[0].hf as number);
    expect(['ok', 'warning', 'liquidation']).toContain(r[3].risk);
  });

  it('Stress با Collateral استیبل (sensitivity=0): HF ثابت می‌ماند (همان واحد حساب)', () => {
    const r = stressHealthFactors(10000, 6000, 0.8, [0, 10, 30], 0);
    expect(r[2].hf).toBeCloseTo(r[0].hf as number, 9);
  });

  it('Stress با Collateral غیرهم‌واحد (ETH/USDC): افت مستقیم روی HF', () => {
    const r = stressHealthFactors(10000, 6000, 0.8, [10], 1);
    expect(r[0].hf).toBeCloseTo((9000 * 0.8) / 6000, 6);
  });
});

describe('ApyStats / TvlStats', () => {
  const hist = Array.from({ length: 100 }, (_, i) => ({
    timestamp: new Date(Date.UTC(2026, 3, 1) + i * 86_400_000).toISOString(),
    apy: 0.05 + (i % 2) * 0.001 // تقریباً ثابت ۰.۰۵
  }));

  it('میانگین ۷/۳۰/۹۰ و Spike', () => {
    const s = computeApyStats(hist, 0.1); // فعلی ۲× میانگین → Spike
    expect(s.avg30d).not.toBeNull();
    expect(s.avg90d).not.toBeNull();
    expect(s.spikeDetected).toBe(true);
    expect(s.spikePct).toBeGreaterThan(30);
    expect(s.volatility).not.toBeNull();
    expect(s.min as number).toBeLessThan(s.max as number);
  });

  it('بدون تاریخچه → همه null', () => {
    const s = computeApyStats([], 0.05);
    expect(s.avg7d).toBeNull();
    expect(s.spikeDetected).toBe(false);
  });

  it('تغییر TVL ۳۰ روزه', () => {
    const tvlHist = Array.from({ length: 60 }, (_, i) => ({
      timestamp: new Date(Date.UTC(2026, 3, 1) + i * 86_400_000).toISOString(),
      tvlUsd: 10_000_000 + i * 100_000
    }));
    const t = computeTvlStats(tvlHist, 15_000_000);
    expect(t.change30d).not.toBeNull();
    expect(t.change30d).toBeGreaterThan(0);
  });
});

describe('Risk Indicators + Opportunity Score', () => {
  it('شاخص‌های ریسک از داده واقعی', () => {
    const r = riskIndicators({ leverage: 3.5, borrowApy: 0.1, rewardApy: 0.06, totalApy: 0.09, tvlUsd: 500_000, tvlChange30d: -20, volatility: 0.08, apySpike: true, outlier: false });
    const types = r.map((x) => x.type);
    expect(types).toContain('high-leverage');
    expect(types).toContain('high-borrow-cost');
    expect(types).toContain('low-tvl');
    expect(types).toContain('apy-spike');
    expect(types).toContain('tvl-declining');
  });

  it('Score: APY بالا با ریسک بالا امتیاز کمتر از APY متوسط با ثبات', () => {
    const risky = opportunityScore({ netApy: 0.3, stability: 0.1, tvlUsd: 300_000, liquidityScore: 0.1, rewardDependency: 0.9, auditKnown: null, leverageRisk: 0.9, borrowCostRisk: 0.9, spike: true, outlier: true, tvlDeclining: true });
    const solid = opportunityScore({ netApy: 0.1, stability: 0.9, tvlUsd: 30_000_000, liquidityScore: 0.9, rewardDependency: 0.2, auditKnown: true, leverageRisk: 0.2, borrowCostRisk: 0.2, spike: false, outlier: false, tvlDeclining: false });
    expect(solid).toBeGreaterThan(risky);
  });

  it('Score در محدوده ۰..۱۰۰', () => {
    const s = opportunityScore({ netApy: 0.05, stability: 0.5, tvlUsd: 5_000_000, liquidityScore: 0.5, rewardDependency: 0.5, auditKnown: null, leverageRisk: 0.5, borrowCostRisk: 0.5, spike: false, outlier: false, tvlDeclining: false });
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});

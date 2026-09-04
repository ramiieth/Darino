/**
 * تست‌های Pendle Analytics Engine — همه فرمول‌های مشخصات
 */
import { describe, expect, it } from 'vitest';
import {
  tokenAmount,
  redeemValue,
  profit,
  roiPct,
  daysToMaturity,
  simpleYield,
  annualizedReturn,
  effectiveApy,
  ptDiscount,
  ptFixedYield,
  ptFixedApy,
  calcPt,
  calcYt,
  calcLp,
  netProfit,
  realApy,
  opportunityScore,
  riskAdjustedReturn,
  riskScoreOf,
  projection,
  scenarios,
  breakEvenTokenPrice,
  breakEvenApyPct,
  compareMarkets
} from '@/features/pendle/engine/analytics';
import type { PendleMarketView } from '@/features/pendle/domain/pendle';

describe('PT Calculator (مرحله ۱-۴)', () => {
  it('مثال مشخصات: ۱۰٬۰۰۰ USDC با PT=0.948 → ۱۰٬۵۴۸.۵۲ PT', () => {
    expect(tokenAmount(10_000, 0.948)).toBeCloseTo(10_548.52, 2);
    expect(redeemValue(10_548.52)).toBeCloseTo(10_548.52, 2);
  });

  it('سود و ROI', () => {
    const redeem = redeemValue(tokenAmount(10_000, 0.948));
    const p = profit(redeem, 10_000);
    expect(p).toBeCloseTo(548.52, 2);
    expect(roiPct(p, 10_000)).toBeCloseTo(5.485, 2);
  });

  it('Fixed Yield و APY سالانه', () => {
    expect(ptDiscount(0.948)).toBeCloseTo(0.052, 3);
    expect(ptFixedYield(0.948)).toBeCloseTo(1 / 0.948 - 1, 6);
    expect(ptFixedApy(0.948, 95)).toBeCloseTo(Math.pow(1 / 0.948, 365 / 95) - 1, 4);
  });

  it('calcPt کامل — مثال ۹۵ روز', () => {
    const r = calcPt({
      investment: 10_000,
      ptPrice: 0.948,
      maturityIso: new Date(Date.now() + 95 * 86_400_000).toISOString()
    });
    expect(r.holdingDays).toBe(95);
    expect(r.ptAmount).toBeCloseTo(10_548.52, 1);
    expect(r.grossProfit).toBeCloseTo(548.52, 1);
    // Real APY بعد از هزینه‌ها (gas 5$، swap 0.1%، slippage 0.1%)
    expect(r.netProfitUsd).toBeLessThan(r.grossProfit);
    expect(r.realApyPct).toBeGreaterThan(0);
  });

  it('APY مؤثر با زمان', () => {
    expect(effectiveApy(0.05, 95)).toBeCloseTo(Math.pow(1.05, 365 / 95) - 1, 6);
    expect(annualizedReturn(0.05, 95)).toBeCloseTo(0.05 * 365 / 95, 6);
  });

  it('باگ xStocks: بازخرید با قیمت دارایی پایه (نه ۱) — عدد منفی کاذب رخ نمی‌دهد', () => {
    // سناریوی گزارش‌شده توسط کاربر: سرمایه ۱۰٬۰۰۰، PT=93.56، دارایی پایه 94.5، ۱۶ روز
    const r = calcPt({
      investment: 10_000,
      ptPrice: 93.56,
      maturityIso: new Date(Date.now() + 16 * 86_400_000).toISOString(),
      redemptionPrice: 94.5, // قیمت واقعی سهم پایه از API
      gas: 5,
      swapFeePct: 0.1,
      slippagePct: 0.1
    });
    // ۱۰٬۰۰۰ ÷ ۹۳٫۵۶ ≈ ۱۰۶٫۸۸ PT → بازخرید ۱۰۶٫۸۸ × ۹۴٫۵ ≈ ۱۰٬۱۰۰
    expect(r.ptAmount).toBeCloseTo(106.88, 1);
    expect(r.redeemValueUsd).toBeCloseTo(10_100.4, 0);
    // سود مثبت کوچک (+۱٪)، نه −۹٬۸۹۳
    expect(r.grossProfit).toBeGreaterThan(50);
    expect(r.grossProfit).toBeLessThan(200);
    expect(r.roiPct).toBeCloseTo(1.0, 0);
    expect(r.realApyPct).toBeGreaterThan(-100);
    expect(r.redemptionPriceUsed).toBe(94.5);
  });

  it('redemptionPrice ارسال نشود → پیش‌فرض ۱ (فقط استیبل) + قیمت استفاده‌شده گزارش می‌شود', () => {
    const r = calcPt({
      investment: 10_000,
      ptPrice: 0.948,
      maturityIso: new Date(Date.now() + 95 * 86_400_000).toISOString()
    });
    expect(r.redemptionPriceUsed).toBe(1);
    expect(r.redeemValueUsd).toBeCloseTo(10_548.52, 1);
  });

  it('redemptionPrice صفر/نامعتبر → هرگز استفاده نمی‌شود (پیش‌فرض ۱)', () => {
    const r = calcPt({
      investment: 10_000,
      ptPrice: 0.948,
      maturityIso: new Date(Date.now() + 95 * 86_400_000).toISOString(),
      redemptionPrice: 0
    });
    expect(r.redemptionPriceUsed).toBe(1);
  });
});

describe('YT و LP', () => {
  it('YT: درآمد + Break-even', () => {
    const r = calcYt(10_000, 0.05, 10, 5, 95);
    expect(r.yieldIncome).toBeCloseTo(10_000 * 0.1 * (95 / 365), 4);
    expect(r.rewardIncomeUsd).toBeCloseTo(10_000 * 0.05 * (95 / 365), 4);
    expect(r.totalIncome).toBeCloseTo(r.yieldIncome + r.rewardIncomeUsd, 4);
    expect(r.breakEvenApyPct).toBeCloseTo((0.05 / 95) * 365 * 100, 4);
    expect(r.maxLoss).toBe(10_000);
  });

  it('LP: همه اجزا', () => {
    const r = calcLp(10_000, 1, 8, 5, 2, 3, 1, 95);
    expect(r.underlyingYieldUsd).toBeCloseTo(10_000 * 0.08 * (95 / 365), 4);
    expect(r.tradingFeesUsd).toBeCloseTo(10_000 * 0.02 * (95 / 365), 4);
    expect(r.totalUsd).toBeCloseTo(r.underlyingYieldUsd + r.ptFixedUsd + r.tradingFeesUsd + r.rewardUsd + r.incentivesUsd, 4);
    expect(r.lpTokens).toBe(10_000);
  });
});

describe('Real APY (مرحله ۷-۸ — مهم‌ترین)', () => {
  it('سود خالص و Real APY', () => {
    const gross = 548.52;
    const net = netProfit(gross, 5, 10, 10); // gas+swap+slippage
    expect(net).toBeCloseTo(523.52, 2);
    expect(realApy(net, 10_000, 95)).toBeCloseTo(Math.pow(1 + net / 10_000, 365 / 95) - 1, 6);
  });

  it('سناریوها: ۶ حالت', () => {
    const s = scenarios({ investment: 10_000, ptPrice: 0.948, days: 95, apyPct: 21.5, rewardPct: 5, tvl: 10_000_000, gas: 5, swapFeePct: 0.1, slippagePct: 0.1 });
    expect(s.length).toBe(6);
    expect(s[0].realApyPct).toBeGreaterThan(0);
  });
});

describe('Opportunity Score و ریسک', () => {
  it('امتیاز ترکیبی (وزن‌ها)', () => {
    const score = opportunityScore(
      { realApyPct: 20, tvl: 50_000_000, liquidity: 30_000_000, volume: 5_000_000, rewardAprPct: 8, riskScore: 30 },
      { apy: [0, 40], tvl: [0, 100_000_000], liq: [0, 60_000_000], vol: [0, 10_000_000], reward: [0, 20] }
    );
    expect(score).toBeGreaterThan(50);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('Risk Adjusted Return', () => {
    expect(riskAdjustedReturn(20, 40)).toBeCloseTo(0.5, 6);
  });

  it('ریسک از TVL/نقدشوندگی', () => {
    expect(riskScoreOf({ details: { totalTvl: 100_000_000, liquidity: 80_000_000 } as never, daysToExpiry: 120 })).toBeLessThan(30);
    expect(riskScoreOf({ details: { totalTvl: 100_000, liquidity: 50_000 } as never, daysToExpiry: 10 })).toBeGreaterThan(60);
  });
});

describe('Projection', () => {
  it('۵٬۰۰۰ USDC → PT → سررسید', () => {
    const p = projection(5_000, 0.95, 95, 5.26);
    expect(p.ptAmount).toBeCloseTo(5_263.16, 2);
    expect(p.output).toBeGreaterThan(5_000);
    expect(p.dailyProfit).toBeCloseTo(p.totalProfit / 95, 6);
    expect(p.weeklyProfit).toBeCloseTo(p.dailyProfit * 7, 6);
    expect(p.monthlyProfit).toBeCloseTo(p.dailyProfit * 30, 6);
  });
});

describe('Break-even و مقایسه (مراحل ۵-۷)', () => {
  it('Break-even Price و APY', () => {
    expect(breakEvenTokenPrice(10_000, 10_526.315)).toBeCloseTo(0.95, 3);
    expect(breakEvenApyPct(100, 10_000, 95)).toBeCloseTo(100 / 10_000 * 365 / 95 * 100, 4);
  });

  it('مقایسه بازارها — بهترین مشخص می‌شود', () => {
    const mk = (name: string, fixedApy: number, tvl: number): PendleMarketView => ({
      name, protocol: 'P', address: name, chainId: 1, expiry: new Date(Date.now() + 95 * 86_400_000).toISOString(),
      pt: '', yt: '', sy: '', underlyingAsset: '', timestamp: '',
      details: { totalTvl: tvl, liquidity: tvl / 2, tradingVolume: tvl / 10, impliedApy: fixedApy / 100, underlyingApy: 0.05, swapFeeApy: 0.01, pendleApy: 0, ytFloatingApy: 0, feeRate: 0.001, aggregatedApy: fixedApy / 100, maxBoostedApy: 0, ytRoi: 0, ptRoi: 0 },
      lpApyBreakdown: { categories: [] }, ytApyBreakdown: { categories: [] }, lpRewardApyBreakdown: { categories: [] }, underlyingRewardApyBreakdown: { categories: [] },
      rewardTokens: [], points: {}, categoryIds: [],
      fixedApyPct: fixedApy, underlyingApyPct: 5, totalApyPct: fixedApy, lpApyPct: null, ytApyPct: null,
      rewardAprPct: 0, swapFeeApyPct: 1, ptDiscountPct: null, daysToExpiry: 95, marketType: 'PT', change24h: null, marketCap: null, leverage: null, status: null, change7d: null, change30d: null, change60d: null
    } as PendleMarketView);

    const metrics = compareMarkets([mk('A', 10, 1_000_000), mk('B', 25, 5_000_000), mk('C', 15, 2_000_000)], 10_000);
    expect(metrics).toHaveLength(3);
    const best = metrics.find((m) => m.isBest);
    expect(best?.market.name).toBe('B');
    expect(best?.opportunityScore).toBeGreaterThan(0);
    expect(best?.riskScore).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIVING_RESERVE_USDT,
  GOLD_TOKEN_COMPARISON,
  buildInitialUserBasket,
  buildStepsForStressRegime,
  buildWalletSyncedBasket,
  createBasketAssetItem,
  simulatePortfolioBasketDcaAndCommittee
} from './portfolioBasketDcaCommittee';

describe('portfolioBasketDcaCommittee', () => {
  it('builds the default 5-asset basket (XAUT, HYPE, ETH, BTC, SOL) calibrated for 17,681 USDC + 5,000 USDT', () => {
    const basket = buildInitialUserBasket({}, true);
    expect(basket.map((b) => b.symbol)).toEqual(['XAUT', 'HYPE', 'ETH', 'BTC', 'SOL']);

    const sim = simulatePortfolioBasketDcaAndCommittee({
      usdcBalanceUsd: 17681,
      usdtBalanceUsd: 5000,
      reserveDryPowderUsd: 5681,
      items: basket,
      analysisDateIso: '2026-11-16'
    });

    expect(sim.totalStableBalanceUsd).toBe(22681);
    expect(sim.deployableDcaBudgetUsd).toBe(17000);
    expect(sim.reserveDryPowderPct).toBeCloseTo(25.0, 0);

    const ethRow = sim.rows.find((r) => r.item.symbol === 'ETH')!;
    expect(ethRow.allocatedBudgetUsd).toBe(3600);
    expect(ethRow.item.existingQuantity).toBe(3.33);
    expect(ethRow.item.existingAvgCostUsd).toBe(2820);
    expect(ethRow.combinedNewAvgCostUsd).toBeLessThan(2410);
    expect(ethRow.combinedNewAvgCostUsd).toBeGreaterThan(2380);
    expect(ethRow.profitIfReachesOldAvgUsd).toBeGreaterThan(2200);

    const hypeRow = sim.rows.find((r) => r.item.symbol === 'HYPE')!;
    expect(hypeRow.allocatedBudgetUsd).toBe(3600);
    expect(hypeRow.dcaAverageEntryUsd).toBeLessThan(61);
    expect(hypeRow.committee.indicators.length).toBe(12);

    const xautRow = sim.rows.find((r) => r.item.symbol === 'XAUT')!;
    expect(xautRow.allocatedBudgetUsd).toBe(5000);
    expect(xautRow.usdtShareUsd).toBe(5000);
  });

  it('strictly excludes 5,000 USDT living expense reserve from DCA and computes severe-crash & 2-year-range stress tests', () => {
    const synced = buildWalletSyncedBasket({
      rows: [
        { symbol: 'USDC', currentQuantity: 12000, avgCostUsd: 1, currentPriceUsd: 1, currentValueUsd: 12000 },
        { symbol: 'USDT', currentQuantity: 5000, avgCostUsd: 1, currentPriceUsd: 1, currentValueUsd: 5000 },
        { symbol: 'ETH', currentQuantity: 3.440875, avgCostUsd: 2786, currentPriceUsd: 1800, currentValueUsd: 6193.58 }
      ],
      livePrices: { ETH: 1800, BTC: 65000, HYPE: 60, SOL: 72, XAUT: 3820 },
      regime: 'severe_crash'
    });

    expect(synced.usdcBalanceUsd).toBe(12000);
    expect(synced.usdtBalanceUsd).toBe(5000);

    const ethItem = synced.items.find((i) => i.symbol === 'ETH')!;
    expect(ethItem.existingQuantity).toBeCloseTo(3.440875, 4);
    expect(ethItem.existingAvgCostUsd).toBeCloseTo(2786, 1);
    expect(ethItem.dcaSteps).toHaveLength(4);
    expect(ethItem.dcaSteps[3].dropPctFromCurrent).toBe(-50);

    const sim = simulatePortfolioBasketDcaAndCommittee({
      usdcBalanceUsd: synced.usdcBalanceUsd,
      usdtBalanceUsd: synced.usdtBalanceUsd,
      livingReserveUsd: DEFAULT_LIVING_RESERVE_USDT,
      reserveDryPowderUsd: 2000,
      items: synced.items
    });

    // ۵,۰۰۰ تتر زندگی قفل شده؛ از ۱۲,۰۰۰ دلار مازاد، ۲,۰۰۰ دلار ذخیره اضطراری و ۱۰,۰۰۰ دلار بودجه DCA است
    expect(sim.livingReserveUsd).toBe(5000);
    expect(sim.investableStableUsd).toBe(12000);
    expect(sim.deployableDcaBudgetUsd).toBe(10000);
    expect(sim.monthlyDca24mUsd).toBeCloseTo(10000 / 24, 1);

    // هر ۴ سناریوی آزمون استرس باید تولید شوند و ۵,۰۰۰ تتر زندگی در همهٔ آن‌ها دست‌نخورده باشد
    expect(sim.stressScenarios).toHaveLength(4);
    for (const sc of sim.stressScenarios) {
      expect(sc.untouchedLivingReserveUsd).toBe(5000);
    }

    const crashScenario = sim.stressScenarios.find((s) => s.id === 'severe_crash')!;
    expect(crashScenario.avgCostVsLumpSumBenefitPct).toBeGreaterThan(0);

    const rangeSteps = buildStepsForStressRegime('ETH', 1800, 'two_year_range');
    expect(rangeSteps).toHaveLength(4);
    expect(rangeSteps[3].dropPctFromCurrent).toBe(-30);
  });

  it('flags duplicate gold tokens when both XAUT and PAXG are active and recommends XAUT for USDT holders', () => {
    expect(GOLD_TOKEN_COMPARISON).toHaveLength(2);
    expect(GOLD_TOKEN_COMPARISON.find((g) => g.symbol === 'XAUT')?.recommendedForUser).toBe(true);

    const basket = [
      ...buildInitialUserBasket({}, false),
      createBasketAssetItem('PAXG', {}, { allocationPct: 15 })
    ];

    const sim = simulatePortfolioBasketDcaAndCommittee({
      usdcBalanceUsd: 17681,
      usdtBalanceUsd: 5000,
      reserveDryPowderUsd: 5681,
      items: basket
    });

    expect(sim.advisories.some((a) => a.actionType === 'remove_duplicate_gold')).toBe(true);
  });
});

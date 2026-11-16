import { describe, expect, it } from 'vitest';
import {
  GOLD_TOKEN_COMPARISON,
  buildInitialUserBasket,
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
    // میانگین خرید اتریوم از ۲,۸۲۰ دلار به حدود ۲,۳۹۸.۵ دلار کاهش می‌یابد
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

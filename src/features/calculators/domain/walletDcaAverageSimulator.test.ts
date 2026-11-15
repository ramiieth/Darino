import { describe, expect, it } from 'vitest';
import {
  buildWalletCostHoldingPresets,
  simulateWalletAverageDown,
  solveRequiredBuyForTargetAverage
} from './walletDcaAverageSimulator';
import {
  getAssetAthAndRangeInfo,
  ingestLiveCoinGeckoAthRows
} from '@/features/markets/domain/athAndRangeAnalytics';

describe('Wallet & Dashboard Cost-Basis Connected DCA / New Average Buy Price Simulator', () => {
  it('extracts user ETH holding (3.33 ETH @ $2,820 = $9,390.60) and computes exact new average cost on single and multi-step DCA buys', () => {
    const presets = buildWalletCostHoldingPresets([], { ETH: 1829, BTC: 65586 });
    const ethPreset = presets.find((p) => p.symbol === 'ETH');
    expect(ethPreset).toBeDefined();
    expect(ethPreset!.currentQuantity).toBe(3.33);
    expect(ethPreset!.avgCostUsd).toBe(2820);
    expect(ethPreset!.totalBasisUsd).toBeCloseTo(9390.6, 1);

    // 1) Single new purchase of $1,829 at $1,829 (adds 1.00 ETH -> 4.33 ETH total, $11,219.60 total basis -> $2,591.13 new average)
    const singleSim = simulateWalletAverageDown({
      symbol: 'ETH',
      nameFa: 'اتریوم',
      existingQuantity: 3.33,
      existingAvgCostUsd: 2820,
      currentMarketPriceUsd: 1829,
      steps: [
        {
          stepIndex: 1,
          labelFa: 'پله اول خرید',
          buyAmountUsd: 1829,
          buyPriceUsd: 1829
        }
      ]
    });

    expect(singleSim.existing.totalBasisUsd).toBeCloseTo(9390.6, 2);
    expect(singleSim.afterNewBuys.addedUnits).toBeCloseTo(1, 4);
    expect(singleSim.afterNewBuys.totalQuantity).toBeCloseTo(4.33, 4);
    expect(singleSim.afterNewBuys.newAverageCostUsd).toBeCloseTo(2591.13, 1);
    expect(singleSim.afterNewBuys.avgCostChangeUsd).toBeLessThan(-220);
    expect(singleSim.afterNewBuys.profitIfReachesOldAvgCostUsd).toBeCloseTo(991, 0);

    // 2) Multi-step DCA ladder on dips: Step 1 ($1,000 @ $1,829), Step 2 ($1,000 @ $1,729), Step 3 ($1,000 @ $1,629)
    const ladderSim = simulateWalletAverageDown({
      symbol: 'ETH',
      nameFa: 'اتریوم',
      existingQuantity: 3.33,
      existingAvgCostUsd: 2820,
      currentMarketPriceUsd: 1829,
      steps: [
        { stepIndex: 1, labelFa: 'پله ۱', buyAmountUsd: 1000, buyPriceUsd: 1829 },
        { stepIndex: 2, labelFa: 'پله ۲', buyAmountUsd: 1000, buyPriceUsd: 1729 },
        { stepIndex: 3, labelFa: 'پله ۳', buyAmountUsd: 1000, buyPriceUsd: 1629 }
      ]
    });

    expect(ladderSim.stepByStep.length).toBe(3);
    expect(ladderSim.stepByStep[0].newAverageCostUsd).toBeLessThan(2820);
    expect(ladderSim.stepByStep[1].newAverageCostUsd).toBeLessThan(ladderSim.stepByStep[0].newAverageCostUsd);
    expect(ladderSim.stepByStep[2].newAverageCostUsd).toBeLessThan(ladderSim.stepByStep[1].newAverageCostUsd);
    expect(ladderSim.afterNewBuys.newAverageCostUsd).toBeCloseTo(2444.36, 1);
  });

  it('solves exact required USD purchase to reach a target average buy price', () => {
    const solved = solveRequiredBuyForTargetAverage({
      existingQuantity: 3.33,
      existingAvgCostUsd: 2820,
      buyPriceUsd: 1820,
      targetAvgCostUsd: 2320
    });
    expect(solved.possible).toBe(true);
    // To bring average exactly halfway between 2820 and 1820 (2320), you need equal units (3.33 ETH * $1,820 = $6,060.60)
    expect(solved.requiredBuyUnits).toBeCloseTo(3.33, 2);
    expect(solved.requiredBuyUsd).toBeCloseTo(6060.6, 1);
  });

  it('verifies updated CoinGecko All-Time Highs (BTC $126,080 on 2025-10-06, ETH $4,946.05 on 2025-08-24) and live ingestion', () => {
    const nowMs = Date.UTC(2026, 10, 15);
    const btc = getAssetAthAndRangeInfo({
      symbol: 'BTC',
      currentPrice: 65320,
      source: 'crypto',
      nowMs
    });
    expect(btc).not.toBeNull();
    expect(btc!.athPrice).toBe(126080);
    expect(btc!.athDateIso).toBe('2025-10-06');
    expect(btc!.drawdownFromAthPct).toBeCloseTo(-48.2, 1);

    const eth = getAssetAthAndRangeInfo({
      symbol: 'ETH',
      currentPrice: 1829.85,
      source: 'crypto',
      nowMs
    });
    expect(eth).not.toBeNull();
    expect(eth!.athPrice).toBe(4946.05);
    expect(eth!.athDateIso).toBe('2025-08-24');
    // 2025-08-24 to 2026-11-15 is ~1 year and 2 months (NOT 5 years)
    expect(eth!.elapsedSinceAthFa).toContain('۱ سال');

    // Test live CoinGecko row ingestion override
    ingestLiveCoinGeckoAthRows([
      {
        symbol: 'eth',
        ath: 4946.05,
        ath_date: '2025-08-24T19:00:00.000Z',
        ath_change_percentage: -63.0
      }
    ]);
    const ethAfterLive = getAssetAthAndRangeInfo({
      symbol: 'ETH',
      currentPrice: 1829.85,
      source: 'crypto',
      nowMs
    });
    expect(ethAfterLive!.athPrice).toBe(4946.05);
    expect(ethAfterLive!.athDateIso).toBe('2025-08-24');
  });
});

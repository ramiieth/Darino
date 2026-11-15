import { describe, expect, it } from 'vitest';
import {
  ETH_GAS_REGIMES,
  EXECUTION_VENUE_PRESETS,
  PAPER_TABLE_1,
  PAPER_TABLE_2_WIN_RATE_PCT,
  PAPER_TABLE_3_SHARPE,
  PAPER_TABLE_6_BY_MONTH,
  PAPER_TABLE_7_ON_THE_RUN,
  PAPER_TABLE_8_FUTURES,
  buildEomDcaPlan,
  buildEomTradeSignal,
  buildPaperBenchmarkStudy,
  computeDefaultDipLadderPrices,
  computeRoundTripCost,
  computeWalletSuggestedCapital,
  runEmpiricalEomStudy
} from './eomPaper';
import { EOM_SELECTABLE_ASSETS, buildFallbackDailySeries } from '../data/eomData';
import { getAssetAthAndRangeInfo } from '@/features/markets/domain/athAndRangeAnalytics';

describe('Hartley & Schwarz (2019) EOM Paper Engine, Price-Drop Limit DCA & Market ATH/Range Analytics', () => {
  it('preserves exact Table 1, Table 2 (Win Rate), Table 3 (Sharpe), Table 6, 7 & 8 figures from the paper', () => {
    expect(PAPER_TABLE_1['10Y'].lastTMeanPct[2]).toBe(0.25);
    expect(PAPER_TABLE_1['10Y'].lastTSePct[2]).toBe(0.05);
    expect(PAPER_TABLE_2_WIN_RATE_PCT['2Y'][2]).toBe(68);
    expect(PAPER_TABLE_2_WIN_RATE_PCT['5Y'][2]).toBe(64);
    expect(PAPER_TABLE_2_WIN_RATE_PCT['10Y'][2]).toBe(65);
    expect(PAPER_TABLE_3_SHARPE['2Y'].lastT[1]).toBe(1.11);
    expect(PAPER_TABLE_3_SHARPE['5Y'].lastT[1]).toBe(1.07);
    expect(PAPER_TABLE_3_SHARPE['10Y'].lastT[1]).toBe(0.87);
    expect(PAPER_TABLE_6_BY_MONTH[6].y10MeanPct[0]).toBe(0.38);
    expect(PAPER_TABLE_6_BY_MONTH[0].y10MeanPct[0]).toBe(0.27);
    expect(PAPER_TABLE_7_ON_THE_RUN['30Y'].dailyMeanPct[0]).toBe(0.25);
    expect(PAPER_TABLE_8_FUTURES['30Y'].lastTMeanPct[4]).toBe(0.33);
  });

  it('models low-slippage DEX with Ethereum gas under $0.50 vs high congestion gas ($15)', () => {
    const lowGas = computeRoundTripCost({
      oneWayFeePct: 0.01,
      oneWaySlippagePct: 0.01,
      gasUsdPerTx: 0.35,
      positionNotionalUsd: 10000,
      calendarDaysHeld: 4,
      annualFinancingPct: 0
    });
    expect(lowGas.gasCostPct).toBeCloseTo(0.007, 4);
    expect(lowGas.totalCostBps).toBeCloseTo(4.7, 2);

    const highGasSmallCap = computeRoundTripCost({
      oneWayFeePct: 0.01,
      oneWaySlippagePct: 0.01,
      gasUsdPerTx: 15,
      positionNotionalUsd: 2000,
      calendarDaysHeld: 4,
      annualFinancingPct: 0
    });
    expect(highGasSmallCap.gasCostPct).toBeCloseTo(1.5, 4);
    expect(highGasSmallCap.totalCostBps).toBeCloseTo(154, 1);
  });

  it('verifies 2Y, 5Y, and 10Y Treasury EOM setups across all Ethereum gas regimes and DEX/Perp venues', () => {
    for (const mat of ['2Y', '5Y', '10Y'] as const) {
      const study = buildPaperBenchmarkStudy({
        maturity: mat,
        oneWayFeePct: 0.01,
        oneWaySlippagePct: 0.01,
        gasUsdPerTx: 0.35,
        positionNotionalUsd: 10000,
        annualFinancingPct: 0
      });
      expect(study.windows.length).toBe(10);
      expect(study.gasSensitivity.length).toBe(ETH_GAS_REGIMES.length);
      if (mat === '5Y' || mat === '10Y') {
        expect(study.gasSensitivity[0].profitable).toBe(true);
        expect(study.optimalWindow.netWinRatePct).toBeGreaterThan(55);
      }
    }

    expect(EXECUTION_VENUE_PRESETS.map((v) => v.id)).toEqual([
      'dex-eth-low-slip',
      'dex-l2-solana',
      'lighter',
      'lighter-robinhood',
      'arcus',
      'ondo-perps',
      'hyperliquid'
    ]);
  });

  it('runs Equation (1) & (2) empirical backtest across all asset groups (Crypto, Stocks, Gold, Oil) and produces entry/exit tickets', () => {
    for (const asset of EOM_SELECTABLE_ASSETS.filter((a) => !a.paperMaturity)) {
      const candles = buildFallbackDailySeries(asset, 540);
      const study = runEmpiricalEomStudy(candles, {
        coin: asset.symbolDisplay,
        oneWayFeePct: 0.01,
        oneWaySlippagePct: 0.01,
        gasUsdPerTx: 0.35,
        positionNotionalUsd: 10000,
        annualFinancingPct: 0
      });
      expect(study).not.toBeNull();
      expect(study!.windows.length).toBe(10);
      expect(study!.totalMonths).toBeGreaterThanOrEqual(15);

      const ticket = buildEomTradeSignal({
        coin: asset.symbolDisplay,
        referencePrice: asset.refPrice,
        selectedT: study!.optimalT,
        windowStats: study!.optimalWindow,
        roundTripCostPct: 0.047,
        capitalUsd: 10000,
        userRiskPct: 1,
        isDexSpot: true,
        now: new Date(Date.UTC(2026, 10, 25, 14, 0, 0))
      });
      expect(ticket.execution.entryPrice).toBe(asset.refPrice);
      expect(ticket.execution.targetPrice).toBeGreaterThan(ticket.execution.entryPrice);
      expect(ticket.execution.stopLossPrice).toBeLessThan(ticket.execution.entryPrice);
      expect(ticket.execution.maxRiskLossUsd).toBe(100);
      expect(ticket.exitDateIso).toBe('2026-11-30');
    }
  });

  it('supports Price-Drop Limit Ladder DCA (e.g. ETH $1,829 / $1,729 / $1,629) and cumulative fill scenarios', () => {
    const suggested = computeWalletSuggestedCapital({
      walletTotalUsd: 25000,
      perpEquityUsd: 4000,
      userRiskPct: 1,
      stopDistancePct: 1.5,
      isPerpVenue: false
    });
    expect(suggested.detectedBalanceUsd).toBe(25000);
    expect(suggested.recommendedCapitalUsd).toBe(7500);

    const autoLadder = computeDefaultDipLadderPrices({
      referencePrice: 1900,
      monthlyStdPct: 5.6,
      mode: 'limit-dip-ladder'
    });
    expect(autoLadder[0]).toBeLessThan(1900);
    expect(autoLadder[1]).toBeLessThan(autoLadder[0]);
    expect(autoLadder[2]).toBeLessThan(autoLadder[1]);

    const study = buildPaperBenchmarkStudy({
      maturity: '10Y',
      oneWayFeePct: 0.01,
      oneWaySlippagePct: 0.01,
      gasUsdPerTx: 0.35,
      positionNotionalUsd: 3000,
      annualFinancingPct: 0
    });
    const ethSignal = buildEomTradeSignal({
      coin: 'ETH',
      referencePrice: 1900,
      selectedT: 3,
      windowStats: {
        ...study.windows[2],
        grossLastTMeanPct: 2.8,
        netLastTMeanPct: 2.75,
        stdMonthlyPct: 5.5,
        p5ReturnPct: -4.2
      },
      roundTripCostPct: 0.05,
      capitalUsd: 3000,
      userRiskPct: 1.5,
      isDexSpot: true,
      now: new Date(Date.UTC(2026, 10, 25, 14, 0, 0))
    });

    const customDipDca = buildEomDcaPlan({
      mode: 'limit-dip-ladder',
      signal: ethSignal,
      capitalUsd: 3000,
      gasUsdPerTx: 0.35,
      customStepPrices: [1829, 1729, 1629],
      now: new Date(Date.UTC(2026, 10, 25, 14, 0, 0))
    });

    expect(customDipDca.tranches.map((t) => t.priceEstimate)).toEqual([1829, 1729, 1629]);
    expect(customDipDca.scenarios.length).toBe(3);
    // Average entry price drops as more dip steps fill:
    expect(customDipDca.scenarios[1].averageEntryPrice).toBeLessThan(customDipDca.scenarios[0].averageEntryPrice);
    expect(customDipDca.scenarios[2].averageEntryPrice).toBeLessThan(customDipDca.scenarios[1].averageEntryPrice);
    expect(customDipDca.boostedWinRatePct).toBeGreaterThanOrEqual(80.5);
  });

  it('computes ATH drawdown, elapsed time since ATH, and trading range duration across Crypto, Tokenized Equities, Gold, Oil, and Bonds', () => {
    const btcInfo = getAssetAthAndRangeInfo({
      symbol: 'BTC',
      currentPrice: 65586,
      source: 'crypto',
      nowMs: Date.UTC(2026, 10, 15)
    });
    expect(btcInfo).not.toBeNull();
    expect(btcInfo!.athPrice).toBe(126080);
    expect(btcInfo!.athDateIso).toBe('2025-10-06');
    expect(btcInfo!.drawdownFromAthPct).toBeCloseTo(-47.98, 1);
    expect(btcInfo!.rangeLow).toBe(65000);
    expect(btcInfo!.rangeHigh).toBe(80000);
    expect(btcInfo!.rangeDurationDays).toBeGreaterThan(100);

    const ethInfo = getAssetAthAndRangeInfo({
      symbol: 'ETH',
      currentPrice: 1829.85,
      source: 'crypto',
      nowMs: Date.UTC(2026, 10, 15)
    });
    expect(ethInfo).not.toBeNull();
    expect(ethInfo!.athPrice).toBe(4946.05);
    expect(ethInfo!.athDateIso).toBe('2025-08-24');

    const nvdaTokenized = getAssetAthAndRangeInfo({
      symbol: 'NVDAON',
      currentPrice: 197.11,
      source: 'ondo',
      nowMs: Date.UTC(2026, 10, 15)
    });
    expect(nvdaTokenized).not.toBeNull();
    expect(nvdaTokenized!.baseSymbol).toBe('NVDA');
    expect(nvdaTokenized!.athPrice).toBe(218.5);

    const goldInfo = getAssetAthAndRangeInfo({
      symbol: 'PAXG',
      currentPrice: 3826.69,
      source: 'crypto',
      nowMs: Date.UTC(2026, 10, 15)
    });
    expect(goldInfo).not.toBeNull();
    expect(goldInfo!.athPrice).toBe(5619.09);
    expect(goldInfo!.rangeLow).toBe(3750);

    const oilInfo = getAssetAthAndRangeInfo({
      symbol: 'WTI',
      currentPrice: 85,
      source: 'tradfi',
      nowMs: Date.UTC(2026, 10, 15)
    });
    expect(oilInfo).not.toBeNull();
    expect(oilInfo!.athPrice).toBe(147.27);
  });
});

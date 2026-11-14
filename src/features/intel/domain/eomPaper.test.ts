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
  buildEomTradeSignal,
  buildPaperBenchmarkStudy,
  computeRoundTripCost,
  runEmpiricalEomStudy
} from './eomPaper';
import { EOM_SELECTABLE_ASSETS, buildFallbackDailySeries } from '../data/eomData';

describe('Hartley & Schwarz (2019) EOM Paper Engine & Live Backtest Verification', () => {
  it('preserves exact Table 1, Table 2 (Win Rate), Table 3 (Sharpe), Table 6, 7 & 8 figures from the paper', () => {
    // Table 1: 10-Year last 3 days excess return = 0.25% (SE 0.05)
    expect(PAPER_TABLE_1['10Y'].lastTMeanPct[2]).toBe(0.25);
    expect(PAPER_TABLE_1['10Y'].lastTSePct[2]).toBe(0.05);
    // Table 2: Win rate at t=3 is 68% (2Y), 64% (5Y), 65% (10Y)
    expect(PAPER_TABLE_2_WIN_RATE_PCT['2Y'][2]).toBe(68);
    expect(PAPER_TABLE_2_WIN_RATE_PCT['5Y'][2]).toBe(64);
    expect(PAPER_TABLE_2_WIN_RATE_PCT['10Y'][2]).toBe(65);
    // Table 3: Sharpe ratio at t=2 is 1.11 (2Y), 1.07 (5Y), 0.87 (10Y)
    expect(PAPER_TABLE_3_SHARPE['2Y'].lastT[1]).toBe(1.11);
    expect(PAPER_TABLE_3_SHARPE['5Y'].lastT[1]).toBe(1.07);
    expect(PAPER_TABLE_3_SHARPE['10Y'].lastT[1]).toBe(0.87);
    // Table 6: July j=1 10Y is 0.38%, January j=1 10Y is 0.27%
    expect(PAPER_TABLE_6_BY_MONTH[6].y10MeanPct[0]).toBe(0.38);
    expect(PAPER_TABLE_6_BY_MONTH[0].y10MeanPct[0]).toBe(0.27);
    // Table 7 & 8: 30Y On-the-Run j=1 is 0.25%, 30Y Futures t=5 is 0.33%
    expect(PAPER_TABLE_7_ON_THE_RUN['30Y'].dailyMeanPct[0]).toBe(0.25);
    expect(PAPER_TABLE_8_FUTURES['30Y'].lastTMeanPct[4]).toBe(0.33);
  });

  it('models low-slippage DEX with Ethereum gas under $0.50 vs high congestion gas ($15)', () => {
    // On $10,000 capital, $0.35 gas per swap ($0.70 round-trip) = 0.7 bps
    const lowGas = computeRoundTripCost({
      oneWayFeePct: 0.01, // 1 bps pool fee
      oneWaySlippagePct: 0.01, // 1 bps slippage
      gasUsdPerTx: 0.35, // < $0.50 Ethereum gas
      positionNotionalUsd: 10000,
      calendarDaysHeld: 4,
      annualFinancingPct: 0
    });
    expect(lowGas.gasCostPct).toBeCloseTo(0.007, 4); // 0.7 bps
    expect(lowGas.totalCostBps).toBeCloseTo(4.7, 2); // 4 bps pool+slip + 0.7 bps gas = 4.7 bps total!

    // When Ethereum gas spikes to $15 per swap ($30 round-trip) on $2,000 position = 150 bps (1.5%)
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
      // In sub-$0.50 Ethereum gas on a $10k position, 5Y and 10Y are strongly profitable
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
});

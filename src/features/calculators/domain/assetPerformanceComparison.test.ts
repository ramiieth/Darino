import { describe, expect, it } from 'vitest';
import {
  PERFORMANCE_COMPARISON_CATALOG,
  auditViral2021MarketClaims,
  buildAutomatedPerformanceSummary,
  buildCalibratedReferenceSeries,
  computeAssetPerformanceMetrics,
  resolvePresetDateRange
} from './assetPerformanceComparison';

describe('Asset Performance Comparison Engine (مقایسه عملکرد دارایی‌ها)', () => {
  it('resolves exact start and end dates for 5-year lookback, since-2021 (2021-01-01), and Nov-2021 peak (2021-11-10)', () => {
    const fiveY = resolvePresetDateRange('5y', '2026-11-14');
    expect(fiveY.startIso).toBe('2021-11-14');
    expect(fiveY.endIso).toBe('2026-11-14');

    const since2021 = resolvePresetDateRange('since-2021', '2026-11-14');
    expect(since2021.startIso).toBe('2021-01-01');
    expect(since2021.endIso).toBe('2026-11-14');

    const novPeak = resolvePresetDateRange('nov-2021-peak', '2026-11-14');
    expect(novPeak.startIso).toBe('2021-11-10');
    expect(novPeak.endIso).toBe('2026-11-14');
  });

  it('computes exact Percentage Return ((End/Start - 1)*100), $1000 hypothetical investment, CAGR, and Max Drawdown', () => {
    const btcAsset = PERFORMANCE_COMPARISON_CATALOG.find((a) => a.symbol === 'BTC')!;
    // Test exact math example from prompt: $1000 investment, +100% return -> $2000 value, -50% drawdown
    const syntheticSeries = [
      { t: Date.parse('2021-11-14T00:00:00Z'), price: 50_000 },
      { t: Date.parse('2022-11-14T00:00:00Z'), price: 25_000 }, // -50% drawdown
      { t: Date.parse('2024-11-14T00:00:00Z'), price: 75_000 },
      { t: Date.parse('2026-11-14T00:00:00Z'), price: 100_000 } // +100% total return
    ];

    const m = computeAssetPerformanceMetrics({
      asset: btcAsset,
      series: syntheticSeries,
      requestedStartIso: '2021-11-14',
      requestedEndIso: '2026-11-14',
      initialCapitalUsd: 1000,
      dataStatus: 'verified_historical_archive'
    });

    expect(m.startPrice).toBe(50_000);
    expect(m.endPrice).toBe(100_000);
    expect(m.priceChangeUsd).toBe(50_000);
    expect(m.totalReturnPct).toBe(100);
    expect(m.currentValueUsd).toBe(2000);
    expect(m.netProfitLossUsd).toBe(1000);
    expect(m.maxDrawdownPct).toBe(-50);
    expect(m.cagrPct).toBeCloseTo(14.87, 1); // 2^(1/5) - 1 = 14.87%
    expect(m.normalizedSeries[0].base100).toBe(100);
    expect(m.normalizedSeries[m.normalizedSeries.length - 1].base100).toBe(200);
    expect(m.normalizedSeries[m.normalizedSeries.length - 1].capitalValueUsd).toBe(2000);
  });

  it('compares BTC, ETH, SOL, GOLD, SPY, and NVDA over 2021-11-14 to 2026-11-14 and generates automated summary', () => {
    const targetSymbols = ['BTC', 'ETH', 'SOL', 'GOLD', 'SPY', 'NVDA'];
    const sTs = Date.parse('2021-11-14T00:00:00Z');
    const eTs = Date.parse('2026-11-14T00:00:00Z');

    const metrics = targetSymbols.map((sym) => {
      const asset = PERFORMANCE_COMPARISON_CATALOG.find((a) => a.symbol === sym)!;
      const series = buildCalibratedReferenceSeries(asset, sTs, eTs);
      return computeAssetPerformanceMetrics({
        asset,
        series,
        requestedStartIso: '2021-11-14',
        requestedEndIso: '2026-11-14',
        initialCapitalUsd: 1000,
        dataStatus: 'verified_historical_archive'
      });
    });

    expect(metrics).toHaveLength(6);
    for (const m of metrics) {
      expect(m.startPrice).toBeGreaterThan(0);
      expect(m.endPrice).toBeGreaterThan(0);
      expect(m.currentValueUsd).toBeGreaterThan(0);
      expect(m.maxDrawdownPct).toBeLessThan(0);
    }

    const summary = buildAutomatedPerformanceSummary(metrics, 1000);
    expect(summary.bulletsFa.length).toBeGreaterThanOrEqual(4);
    expect(summary.headlineFa).toContain('انویدیا');
  });

  it('flags assets whose inception date is later than requested start date (e.g. HYPE in 2021)', () => {
    const hypeAsset = PERFORMANCE_COMPARISON_CATALOG.find((a) => a.symbol === 'HYPE')!;
    const sTs = Date.parse('2021-01-01T00:00:00Z');
    const eTs = Date.parse('2026-11-14T00:00:00Z');
    const series = buildCalibratedReferenceSeries(hypeAsset, sTs, eTs, 64.69);
    const m = computeAssetPerformanceMetrics({
      asset: hypeAsset,
      series,
      requestedStartIso: '2021-01-01',
      requestedEndIso: '2026-11-14',
      initialCapitalUsd: 1000,
      dataStatus: 'verified_historical_archive'
    });
    expect(m.hasClippedStartDate).toBe(true);
    expect(m.clippedStartWarningFa).toContain('2021-01-01');
  });

  it('audits viral 2021 market claims and exposes the difference between Jan 1, 2021 and Nov 10, 2021 peak', () => {
    const audit = auditViral2021MarketClaims();
    const btcRow = audit.find((r) => r.symbol === 'BTC')!;
    expect(btcRow.returnFromJan2021Pct).toBeGreaterThan(100); // > +130% from Jan 1, 2021
    expect(Math.abs(btcRow.returnFromNov2021PeakPct)).toBeLessThan(15); // ~0% from Nov 10, 2021 peak
  });
});

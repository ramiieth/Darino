import { describe, expect, it } from 'vitest';
import { borosRaw } from '../../../../tests/fixtures/boros';
import { mapMarket } from '../data/borosService';
import { analyzeEntry, isolatedThreshold, scanEntries, sizeFromBudget } from './entryAnalysis';

const NOW = 1800000000;
const m = { ...mapMarket(borosRaw, NOW * 1000), collateralSymbol: 'ETH', collateralPriceUsd: 3000, maturity: NOW + 30 * 86400, status: 'GOOD' as const, volume24h: 10000, markApr: .08, floatingApr: .12, marginFloor: .06, kIM: .5, kMM: .06, ytmFloor: 5 / 365, fundingHistory: Array.from({ length: 30 }, (_, i) => ({ ts: NOW - (30 - i) * 86400, c: .11 + i / 10000 })) };
const input = () => ({ m, direction: 'long' as const, sizeYu: 10, capitalUsd: 300, entryRate: .08, floatingRate: .12, feesUsd: 1, gasUsd: .2, slippageUsd: .3, nowSec: NOW });

describe('pre-entry analysis', () => {
  it('forecasts native YU profit in USD and deducts manual costs exactly once', () => {
    const a = analyzeEntry(input())!;
    const gross = 10 * 3000 * (.12 - .08) * 30 / 365;
    expect(a.preview.expectedSettlementPnl).toBeCloseTo(gross);
    expect(a.costs).toBe(1.5);
    expect(a.net).toBeCloseTo(gross - 1.5);
    expect(a.capitalRemaining).toBeCloseTo(300 - a.margin - 1.5);
    expect(a.roiCapital).toBeCloseTo(a.net! / 300 * 100);
    expect(a.breakEvenFloating).toBeCloseTo(.08 + 1.5 / (30000 * 30 / 365));
  });
  it('includes current mark-to-entry losses in free margin without double-counting maturity profit', () => {
    const a = analyzeEntry({ ...input(), entryRate: .1 })!;
    expect(a.capitalRemaining).toBeCloseTo(300 + a.preview.expectedMtm - a.margin - 1.5);
    expect(a.net).toBeCloseTo(a.preview.expectedSettlementPnl - 1.5);
  });
  it('keeps missing costs unknown but accepts explicit zero costs', () => {
    const a = analyzeEntry({ ...input(), feesUsd: null })!;
    expect(a.net).toBeNull(); expect(a.threshold.rate).toBeNull(); expect(a.state).toBe('incomplete');
    expect(analyzeEntry({ ...input(), feesUsd: 0, gasUsd: 0, slippageUsd: 0 })!.net).toBeGreaterThan(0);
  });
  it('does not substitute minimum margin for all capital in liquidation', () => {
    const a = analyzeEntry(input())!;
    const b = analyzeEntry({ ...input(), capitalUsd: 500 })!;
    expect(b.threshold.rate!).toBeLessThan(a.threshold.rate!);
    expect(a.threshold.state).toBe('estimated');
  });
  it('solves the signed equity equals maintenance margin equation for both directions', () => {
    for (const direction of ['long', 'short'] as const) {
      const threshold = isolatedThreshold(m, direction, 10, .1, .08, NOW);
      expect(threshold.state).toBe('estimated');
      const r = threshold.rate!;
      const t = 30 / 365;
      const sign = direction === 'long' ? 1 : -1;
      const equity = .1 + sign * 10 * (r - .08) * t;
      const mm = 10 * Math.max(Math.abs(r), .06) * .06 * t;
      expect(equity).toBeCloseTo(mm, 12);
      expect(sign * (r - .08)).toBeLessThan(0);
      const beyond = r - sign * .001;
      expect(.1 + sign * 10 * (beyond - .08) * t).toBeLessThan(10 * Math.max(Math.abs(beyond), .06) * .06 * t);
    }
  });
  it('solves roots within the rate floor and across negative APR', () => {
    const inside = isolatedThreshold(m, 'long', 10, .03, .08, NOW);
    expect(Math.abs(inside.rate!)).toBeLessThan(.06);
    const negative = isolatedThreshold(m, 'long', 10, .3, .08, NOW);
    expect(negative.rate).toBeLessThan(-.06);
  });
  it('uses the time floor for maintenance margin near maturity', () => {
    const near = { ...m, maturity: NOW + 3600 };
    const a = isolatedThreshold(near, 'short', 10, .1, .08, NOW);
    const t = 1 / (24 * 365);
    expect(a.state).toBe('estimated');
    expect(.1 - 10 * (a.rate! - .08) * t).toBeCloseTo(10 * Math.abs(a.rate!) * .06 * 5 / 365, 12);
  });
  it('flags already unhealthy collateral and never returns a fabricated threshold', () => {
    expect(isolatedThreshold(m, 'long', 10, 0, .08, NOW).state).toBe('unsafe');
    expect(isolatedThreshold({ ...m, kMM: NaN }, 'long', 10, .1, .08, NOW).rate).toBeNull();
    expect(isolatedThreshold({ ...m, maturity: NOW }, 'short', 10, .1, .08, NOW).state).toBe('unavailable');
  });
  it('applies an optional manual margin without changing maintenance formula', () => {
    const a = analyzeEntry({ ...input(), marginUsd: 250 })!;
    expect(a.margin).toBe(250); expect(a.capitalRemaining).toBe(48.5);
    expect(a.threshold.rate).toBe(analyzeEntry(input())!.threshold.rate);
    expect(analyzeEntry({ ...input(), marginUsd: 400 })!.state).toBe('underfunded');
  });
  it('reserves fees before allocating capital into YU with the selected entry rate', () => {
    const size = sizeFromBudget(m, 300, 50, 20, NOW, .1)!;
    expect(size * 3000 * .1 * .5 * 30 / 365).toBeCloseTo(140);
    expect(sizeFromBudget(m, 300, 101, 0, NOW)).toBeNull();
    expect(sizeFromBudget(m, 10, 50, 20, NOW)).toBe(0);
  });
  it('does not promote volumes beyond estimated market liquidity', () => {
    expect(scanEntries([{ ...m, volume24h: .01 }], 300, 50, { feesUsd: 0, gasUsd: 0, slippageUsd: 0 }, NOW)).toEqual([]);
  });
  it('rejects invalid manual amounts and price data', () => {
    expect(analyzeEntry({ ...input(), gasUsd: -1 })).toBeNull();
    expect(analyzeEntry({ ...input(), marginUsd: 0 })).toBeNull();
    expect(analyzeEntry({ ...input(), slippageUsd: Infinity })).toBeNull();
    expect(analyzeEntry({ ...input(), m: { ...m, collateralPriceUsd: 0 } })).toBeNull();
  });
  it('scans both directions, excluding stale, closed, unlisted and negative opportunities', () => {
    const costs = { feesUsd: 1, gasUsd: .2, slippageUsd: .3 };
    const shortMarket = { ...m, marketId: 222, floatingApr: .02 };
    const results = scanEntries([m, shortMarket, { ...m, marketId: 223, status: 'CLOSE_ONLY' }, { ...m, marketId: 224, snapshotAt: (NOW - 3600) * 1000 }, { ...m, marketId: 225, isUiWhitelisted: false }], 300, 50, costs, NOW);
    expect(results.map(r => `${r.m.marketId}-${r.direction}`)).toEqual(expect.arrayContaining([`${m.marketId}-long`, '222-short']));
    expect(results).toHaveLength(2);
    expect(results.every(r => r.result.net! > 0 && r.result.capitalRemaining! >= 0)).toBe(true);
    expect(scanEntries([m], 300, 50, { ...costs, feesUsd: null }, NOW)).toEqual([]);
  });
});

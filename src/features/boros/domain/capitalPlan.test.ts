import { describe, expect, it } from 'vitest';
import { borosRaw } from '../../../../tests/fixtures/boros';
import { mapMarket } from '../data/borosService';
import { planCapital, recommendCapital } from './capitalPlan';
const NOW = 1800000000;
const m = { ...mapMarket(borosRaw, NOW * 1000), collateralSymbol: 'ETH', collateralPriceUsd: 3000, maturity: NOW + 54 * 86400, status: 'GOOD' as const, volume24h: 1e8, notionalOI: 1e8, markApr: .084, floatingApr: .1095, marginFloor: .06, kIM: .5, kMM: .06, ytmFloor: 5 / 365, fundingHistory: [{ ts: NOW - 86400, c: .1 }, { ts: NOW, c: .11 }] };
const input = { capitalUsd: 300, allocationPct: 50, gasUsd: 1, entranceUsd: 1, impactPoints: .22 };
describe('capital planner', () => {
  it('uses execution impact in APR exactly once and computes fees for each market', () => {
    const row = planCapital([m], input, NOW).find(r => r.direction === 'long')!;
    expect(row.entryRate).toBeCloseTo(.0862);
    const gross = row.sizeYu * 3000 * (.1095 - .0862) * 54 / 365;
    expect(row.result.net).toBeCloseTo(gross - row.fees.total - 2);
    expect(row.result.costs).toBeCloseTo(row.fees.total + 2);
    expect(row.result.capitalRemaining!).toBeGreaterThan(0);
    const budget = (300 - 2) / 2;
    expect(row.result.margin + row.fees.total - row.result.preview.expectedMtm).toBeCloseTo(budget);
  });
  it('applies opposite adverse rate direction for shorts', () => {
    const row = planCapital([m], input, NOW).find(r => r.direction === 'short')!;
    expect(row.entryRate).toBeCloseTo(.0818);
    expect(row.result.net).toBeLessThan(0);
  });
  it('never turns missing or invalid assumptions into zero', () => {
    for (const key of ['gasUsd', 'entranceUsd', 'impactPoints'] as const) {
      expect(planCapital([m], { ...input, [key]: null }, NOW)).toEqual([]);
      expect(planCapital([m], { ...input, [key]: -1 }, NOW)).toEqual([]);
    }
    expect(planCapital([m], { ...input, allocationPct: 101 }, NOW)).toEqual([]);
    expect(planCapital([m], { ...input, gasUsd: 0, entranceUsd: 0, impactPoints: 0 }, NOW)).toHaveLength(2);
  });
  it('rejects stale, expired, paused, unpriced and unknown-fee markets', () => {
    for (const bad of [{ snapshotAt: (NOW - 301) * 1000 }, { maturity: NOW }, { status: 'PAUSED' as const }, { collateralPriceUsd: undefined }, { takerFee: NaN }]) expect(planCapital([{ ...m, ...bad }], input, NOW)).toEqual([]);
  });
  it('compares different collateral prices and market fees in USD, ranking net dollars', () => {
    const second = { ...m, marketId: 129, collateralPriceUsd: 1, collateralSymbol: 'USDT', takerFee: .2 };
    const rows = planCapital([second, m], input, NOW);
    expect(recommendCapital(rows)?.m.marketId).toBe(m.marketId);
    expect(rows.every((row, i) => i === 0 || rows[i - 1].result.net! >= row.result.net!)).toBe(true);
  });
  it('does not recommend positive forecasts with unconfirmed liquidity', () => {
    const rows = planCapital([{ ...m, volume24h: 0, notionalOI: 0 }], input, NOW);
    expect(rows.some(r => r.result.net! > 0)).toBe(true);
    expect(recommendCapital(rows)).toBeNull();
  });
  it('equal floating and reference rates have negative net after costs', () => {
    const rows = planCapital([{ ...m, floatingApr: m.markApr }], { ...input, impactPoints: 0 }, NOW);
    expect(rows.every(r => r.result.net! < 0)).toBe(true);
    expect(recommendCapital(rows)).toBeNull();
  });
});

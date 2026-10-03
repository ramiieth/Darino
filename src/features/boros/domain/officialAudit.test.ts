import { describe, expect, it } from 'vitest';
import { borosRaw } from '../../../../tests/fixtures/boros';
import { mapMarket } from '../data/borosService';
import { MarginCalculator } from './engine/margin';
import { FeeCalculator } from './engine/fees';
import { BorosCalculationEngine, historicalAprOf } from './engine';
import { projectCapital } from './engine/projection';
import { orderPreview } from './preview';
import { calcGrossProfit } from './calc';
import { assessFreshness } from './engine/anomaly';
import { rankUserCapitalOpportunities } from './collateral';
import { compareMarkets, runScenario } from './calc';

const NOW = 1800000000;
const market = () => ({ ...mapMarket(borosRaw, NOW * 1000), maturity: NOW + 19 * 86400, markApr: .08, floatingApr: .1, collateralPriceUsd: 3000, assetMarkPrice: 3000 });

describe('official Boros accounting regressions', () => {
  it('uses per-market tThresh, including the 10-day floor', () => {
    const m = mapMarket({ ...borosRaw, config: { ...borosRaw.config, tThresh: 864000 } });
    expect(m.ytmFloor).toBeCloseTo(10 / 365, 12);
  });
  it('uses absolute size and APR for negative-rate margin', () => {
    expect(MarginCalculator.calc({ size: -2, rate: -.2, rateFloor: .08, ytm: .1, ytmFloor: .01, imRatio: .5 })).toBeCloseTo(.02);
  });
  it('has no margin, sensitivity or carrying costs after maturity', () => {
    const m = { ...market(), maturity: NOW };
    expect(MarginCalculator.calcMarket(m, 2, .1, NOW)).toBe(0);
    expect(FeeCalculator.calc({ m, size: 2, nowSec: NOW }).total).toBe(0);
    expect(FeeCalculator.settlementsCount(m, NOW)).toBe(0);
  });
  it('retains the last six hours in PnL, margin and fees', () => {
    const m = { ...market(), maturity: NOW + 21600 };
    const a = BorosCalculationEngine.analyze({ m, size: 1000, nowSec: NOW });
    expect(a.valid).toBe(true);
    expect(a.grossLongPnl).toBeCloseTo(1000 * .02 * .25 / 365, 12);
    expect(a.fees!.settlementCost).toBeCloseTo(1000 * m.settleFeeRate * .25 / 365, 12);
    expect(calcGrossProfit('long', 1000, .08, .1, .25, 28800)).toBeCloseTo(a.grossLongPnl, 12);
  });
  it('charges an early-close fee at remaining time, not opening time', () => {
    const m = market();
    const f = FeeCalculator.calc({ m, size: 2, nowSec: NOW, closeAtSec: NOW + 9 * 86400 });
    expect(f.exitFee).toBeCloseTo(2 * m.takerFee * 10 / 365, 12);
    expect(FeeCalculator.calc({ m, size: 2, nowSec: NOW }).exitFee).toBe(0);
  });
  it('keeps native YU separate from dollar amounts and USD gas', () => {
    const m = market();
    const p = orderPreview({ m, notional: 2, fixedApr: .08, underlyingApr: .1, direction: 'long', availableCollateral: .1, collateralPriceUsd: 3000, gasUsd: 4, slippageRate: 0, nowSec: NOW })!;
    expect(p.marginRequiredUsd).toBeCloseTo(p.marginRequiredAsset! * 3000, 10);
    expect(p.rateSensitivityAsset).toBeCloseTo(2 * 19 / 365 * .01, 12);
    expect(p.rateSensitivityUsd).toBeCloseTo(p.rateSensitivityAsset! * 3000, 10);
    expect(p.expectedSettlementPnl).toBeCloseTo(2 * .02 * 19 / 365 * 3000, 10);
    expect(p.fees.gasFee).toBe(4);
    expect(p.fees.entryFee).toBeCloseTo(2 * m.takerFee * 19 / 365 * 3000, 10);
  });
  it('does not add present MTM to full future settlement a second time', () => {
    const m = market();
    const p = orderPreview({ m, notional: 2, fixedApr: .06, underlyingApr: .1, direction: 'long', availableCollateral: .1, collateralPriceUsd: 3000, slippageRate: 0, nowSec: NOW })!;
    expect(p.expectedMtm).toBeGreaterThan(0);
    expect(p.expectedNetPnl).toBeCloseTo(p.expectedSettlementPnl - p.totalCostUsd!, 10);
  });
  it('the fixed-rate input changes both simulation outputs', () => {
    const m = market();
    const a = BorosCalculationEngine.analyze({ m, size: 1000, nowSec: NOW, fixedApr: .1 });
    expect(a.grossLongPnl).toBeCloseTo(0, 12);
    const p = projectCapital({ m, capitalUsd: 1000, direction: 'long', fixedApr: .1, nowSec: NOW })!;
    expect(p.expectedSettlementPnl).toBeCloseTo(0, 12);
    expect(p.expectedNetPnl).toBeCloseTo(-p.fees.total, 10);
  });
  it('zero APR and negative APR history remain valid observations', () => {
    expect(historicalAprOf({ ...market(), ohlcv: [{ ts: NOW, c: -.1 }, { ts: NOW + 1, c: 0 }] })).toEqual([-.1, 0]);
  });
  it('implied history cannot generate floating-rate scenarios', () => {
    const m = { ...market(), ohlcv: Array.from({ length: 30 }, (_, i) => ({ ts: NOW - i * 86400, c: .2 })) };
    const a = BorosCalculationEngine.analyze({ m, size: 1000, nowSec: NOW });
    expect(a.stress.available).toBe(false);
    expect(a.meanReversion.available).toBe(false);
    expect(a.realizedLongPnl).toBe(0);
  });
  it('daily candles are not mistaken for stale live snapshots', () => {
    const m = { ...market(), ohlcv: [{ ts: NOW - 86400, c: .1 }] };
    expect(assessFreshness(m, NOW).stale).toBe(false);
    expect(assessFreshness({ ...m, snapshotAt: (NOW - 7200) * 1000 }, NOW).stale).toBe(true);
  });
  it.each(['PAUSED', 'CLOSE_ONLY', 'UNKNOWN'] as const)('does not promote a %s market', status => {
    const a = BorosCalculationEngine.analyze({ m: { ...market(), status }, size: 100000, nowSec: NOW });
    expect(a.statusLong).toBe('not-attractive');
    expect(a.rankLong).toBe(0);
    expect(a.stageLong).toBe('stage1-valid');
  });
  it('preserves explicit zero protocol fees', () => {
    const a = BorosCalculationEngine.analyze({ m: { ...market(), takerFee: 0, settleFeeRate: 0 }, size: 1000, nowSec: NOW });
    expect(a.feesSource).toBe('api-config');
    expect(a.fees!.total).toBe(0);
  });
  it('refuses missing protocol configuration instead of inventing ratios', () => {
    expect(() => mapMarket({ ...borosRaw, config: {} })).toThrow('invalid boros market configuration');
  });
  it('the default direction evaluates both sides rather than skipping every market', () => {
    const m = { ...market(), floatingApr: .12, volume24h: 100000, ohlcv: Array.from({ length: 20 }, (_, i) => ({ ts: NOW - i * 60, c: .08 })) };
    const rows = rankUserCapitalOpportunities([m, { ...m, marketId: 999, floatingApr: .04 }], .1, 3000, { slippageRate: 0, gasUsd: 0, nowSec: NOW });
    expect(rows.map(r => r.direction).sort()).toEqual(['long', 'short']);
  });
  it('comparison reports annualized long scenario economics, not the mark rate', () => {
    const [r] = compareMarkets([market()], 1000, undefined, NOW);
    expect(r.netApr).toBeCloseTo(r.expectedReturn / 1000 * 365 / 19 * 100, 10);
    expect(r.netApr).not.toBe(8);
  });
  it('unpriced execution costs keep positive economics conditional', () => {
    const a = BorosCalculationEngine.analyze({ m: { ...market(), floatingApr: .12 }, size: 1000, nowSec: NOW });
    expect(a.grossLongPnl).toBeGreaterThan(0);
    expect(a.statusLong).toBe('conditional');
  });
  it('compatibility scenarios use the requested horizon, not a fabricated one-year market', () => {
    const m = market();
    const r = runScenario(m, 'long', 1000, .08, 19, 0, 0, 'پایه', .1);
    expect(r.fees.entryFee).toBeCloseTo(1000 * .0005 * 19 / 365, 12);
    expect(r.fees.exitFee).toBe(0);
    expect(r.gross).toBeCloseTo(1000 * .02 * 19 / 365, 12);
  });
  it('valid high annualized break-even is not silently hidden by a 100% cap', () => {
    const a = BorosCalculationEngine.analyze({ m: { ...market(), maturity: NOW + 86400 }, size: 1000, gasUsd: 5, nowSec: NOW });
    expect(a.breakEvenLong).toBeGreaterThan(1);
  });
  it('non-finite entry rates and missing fee parameters are never eligible', () => {
    expect(BorosCalculationEngine.analyze({ m: market(), size: 1000, fixedApr: Infinity, nowSec: NOW }).valid).toBe(false);
    expect(BorosCalculationEngine.analyze({ m: { ...market(), takerFee: NaN }, size: 1000, nowSec: NOW }).valid).toBe(false);
    expect(projectCapital({ m: market(), capitalUsd: 1000, direction: 'long', fixedApr: Infinity, nowSec: NOW })).toBeNull();
  });
});


describe('directional scenario regressions', () => {
  it('uses the selected short direction for constant and mean-reversion models', () => {
    const m = { ...market(), fundingHistory: Array.from({ length: 30 }, (_, i) => ({ ts: NOW - (30 - i) * 86400, c: .1 + i * .001 })) };
    const long = BorosCalculationEngine.analyze({ m, size: 1000, direction: 'long', nowSec: NOW });
    const short = BorosCalculationEngine.analyze({ m, size: 1000, direction: 'short', nowSec: NOW });
    expect(short.constantRateScenario.settlementPnl).toBeCloseTo(-long.constantRateScenario.settlementPnl);
    expect(short.meanReversion.netPnl! + long.meanReversion.netPnl!).toBeCloseTo(-2 * long.fees!.total);
    expect(short.stress.bearNet!).toBeLessThan(short.stress.baseNet!);
    expect(short.stress.bullNet!).toBeGreaterThan(short.stress.baseNet!);
    expect(short.statusLong).toBe(long.statusLong);
    expect(short.statusShort).toBe(long.statusShort);
  });
  it('retains zero and negative rates in stress history and allows negative stress rates', async () => {
    const { stressScenario } = await import('./engine/scenarioModels');
    const stress = stressScenario({ direction: 'short', size: 1000, fixedRate: 0, currentFloating: -.01, days: 30, totalCosts: 0, margin: 10, historicalApr: [-.1, -.09, -.08, -.07, -.06, -.05, -.04, -.03, -.02, 0] });
    expect(stress).not.toBeNull();
    expect(stress!.bearRate).toBeLessThan(-.01);
    expect(stress!.bear.netPnl).toBeGreaterThan(stress!.bull.netPnl);
  });
  it('cannot classify a losing high-rate short scenario as robust', async () => {
    const { classifyRobustness } = await import('./engine/scenarioModels');
    expect(classifyRobustness({ bearNet: 10, baseNet: 5, bullNet: -1 })).toBe('conditional');
  });
});

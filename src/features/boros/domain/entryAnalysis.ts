/** Pre-entry, isolated-position model. Never an account health or execution quote. */
import type { BorosDirection, BorosMarket } from './types';
import { orderPreview } from './preview';
import { MarginCalculator } from './engine/margin';
import { assessLiquidity } from './engine/anomaly';
import { stressScenario } from './engine/scenarioModels';

export type EntryState = 'unavailable' | 'incomplete' | 'underfunded' | 'negative' | 'positive' | 'conditional';

export interface EntryInput {
  m: BorosMarket;
  direction: BorosDirection;
  sizeYu: number;
  capitalUsd: number;
  entryRate: number;
  floatingRate: number;
  gasUsd: number | null;
  slippageUsd: number | null;
  /** Total lifetime protocol fees, including market entrance; excludes gas/slippage. */
  feesUsd: number | null;
  /** Optional margin requirement copied from Boros; does not change maintenance formula. */
  marginUsd?: number | null;
  nowSec?: number;
}

export interface IsolatedThreshold {
  rate: number | null; // decimal APR
  health: number | null;
  state: 'estimated' | 'unsafe' | 'unavailable';
}

/** Solve C + signedSize*(r-entry)*T = |size|*max(|r|,floor)*kMM*max(T,timeFloor).
 * Costs are deducted up front, conservatively including future known fees.
 * Only the first adverse-direction root is used; no other positions/settlements/orders.
 */
export function isolatedThreshold(m: BorosMarket, direction: BorosDirection, size: number, cashAfterCosts: number, entry: number, nowSec: number): IsolatedThreshold {
  const t = (m.maturity - nowSec) / (365 * 86400);
  if (![size, cashAfterCosts, entry, t, m.markApr, m.kMM, m.marginFloor, m.ytmFloor].every(Number.isFinite) || size <= 0 || t <= 0 || m.kMM <= 0 || m.marginFloor < 0 || m.ytmFloor! < 0) return { rate: null, health: null, state: 'unavailable' };
  const sign = direction === 'long' ? 1 : -1;
  const slope = sign * size * t;
  const constant = cashAfterCosts - slope * entry;
  const mmScale = size * m.kMM * Math.max(t, m.ytmFloor!);
  const equity = constant + slope * m.markApr;
  const mm = mmScale * Math.max(Math.abs(m.markApr), m.marginFloor);
  const health = mm > 0 ? equity / mm : null;
  if (equity <= mm) return { rate: null, health, state: 'unsafe' };
  const f = m.marginFloor;
  const regions = [
    { lo: -Infinity, hi: -f, a: slope + mmScale, b: constant },
    { lo: -f, hi: f, a: slope, b: constant - mmScale * f },
    { lo: f, hi: Infinity, a: slope - mmScale, b: constant }
  ];
  const roots = regions.flatMap(({ lo, hi, a, b }) => {
    if (Math.abs(a) < 1e-15) return [];
    const r = -b / a;
    return Number.isFinite(r) && r >= lo - 1e-12 && r <= hi + 1e-12 && sign * (r - m.markApr) < 0 ? [r] : [];
  }).sort((a, b) => Math.abs(a - m.markApr) - Math.abs(b - m.markApr));
  return { rate: roots[0] ?? null, health, state: roots.length ? 'estimated' : 'unavailable' };
}

export function analyzeEntry(i: EntryInput) {
  const nowSec = i.nowSec ?? Math.floor(Date.now() / 1000);
  const price = i.m.collateralPriceUsd;
  if (![i.m.markApr, i.m.kIM, i.m.marginFloor, i.m.takerFee, i.m.settleFeeRate].every(Number.isFinite) || i.m.kIM <= 0 || i.m.marginFloor < 0 || i.m.takerFee < 0 || i.m.settleFeeRate < 0 || (i.marginUsd != null && i.marginUsd <= 0)) return null;
  if (!price || price <= 0 || !Number.isFinite(price) || !Number.isFinite(i.capitalUsd) || i.capitalUsd <= 0) return null;
  for (const v of [i.gasUsd, i.slippageUsd, i.feesUsd, i.marginUsd]) if (v != null && (!Number.isFinite(v) || v < 0)) return null;
  const preview = orderPreview({ m: i.m, direction: i.direction, notional: i.sizeYu, availableCollateral: i.capitalUsd / price, collateralPriceUsd: price, fixedApr: i.entryRate, underlyingApr: i.floatingRate, nowSec });
  if (!preview) return null;
  const estimatedFees = preview.fees.entryFee + preview.fees.exitFee + preview.fees.settlementCost;
  const completeCosts = i.feesUsd !== null && i.gasUsd !== null && i.slippageUsd !== null;
  const costs = completeCosts ? i.feesUsd! + i.gasUsd! + i.slippageUsd! : null;
  if (![preview.expectedMtm, preview.expectedSettlementPnl, preview.marginRequiredUsd, estimatedFees].every(Number.isFinite)) return null;
  const margin = i.marginUsd ?? preview.marginRequiredUsd;
  const net = costs !== null ? preview.expectedSettlementPnl - costs : null;
  const capitalRemaining = costs !== null ? i.capitalUsd + preview.expectedMtm - margin - costs : null;
  const threshold = costs !== null ? isolatedThreshold(i.m, i.direction, i.sizeYu, (i.capitalUsd - costs) / price, i.entryRate, nowSec) : { rate: null, health: null, state: 'unavailable' as const };
  const history = (i.m.fundingHistory ?? []).map(p => p.c).filter(Number.isFinite);
  const stress = costs !== null ? stressScenario({ direction: i.direction, size: i.sizeYu * price, fixedRate: i.entryRate, currentFloating: i.floatingRate, days: preview.daysToMaturity, totalCosts: costs, margin, historicalApr: history }) : null;
  const scenarioMin = stress ? Math.min(stress.bear.netPnl, stress.bull.netPnl, stress.base.netPnl) : null;
  const scenarioMax = stress ? Math.max(stress.bear.netPnl, stress.bull.netPnl, stress.base.netPnl) : null;
  const fresh = i.m.snapshotAt != null && nowSec * 1000 - i.m.snapshotAt >= -60000 && nowSec * 1000 - i.m.snapshotAt <= 5 * 60000;
  const liquidity = assessLiquidity(i.m, i.sizeYu * price);
  const state: EntryState = !fresh || i.m.status !== 'GOOD' ? 'unavailable' : costs === null ? 'incomplete' : capitalRemaining! < 0 || threshold.state === 'unsafe' ? 'underfunded' : net! <= 0 ? 'negative' : liquidity.available && liquidity.executable && threshold.state === 'estimated' && scenarioMin !== null && scenarioMin > 0 ? 'positive' : 'conditional';
  const breakEvenFloating = costs === null ? null : i.entryRate + (i.direction === 'long' ? 1 : -1) * costs / (i.sizeYu * price * preview.daysToMaturity / 365);
  return { liquidity, breakEvenFloating, preview, margin, costs, estimatedFees, net, capitalRemaining, threshold, scenarioMin, scenarioMax, state, roiCapital: net === null ? null : net / i.capitalUsd * 100 };
}

/** Converts collateral budget into YU. Costs reserved before the selected allocation. */
export function sizeFromBudget(m: BorosMarket, capitalUsd: number, allocationPct: number, reservedCostsUsd: number, nowSec = Math.floor(Date.now() / 1000), entryRate = m.markApr) {
  const price = m.collateralPriceUsd;
  if (![capitalUsd, allocationPct, reservedCostsUsd].every(Number.isFinite) || capitalUsd <= 0 || allocationPct <= 0 || allocationPct > 100 || reservedCostsUsd < 0 || !price || price <= 0) return null;
  const perYu = Math.max(MarginCalculator.calcMarket(m, 1, entryRate, nowSec), MarginCalculator.calcMarket(m, 1, m.markApr, nowSec)) * price;
  return perYu > 0 ? Math.max(0, capitalUsd - reservedCostsUsd) * allocationPct / 100 / perYu : null;
}

export function scanEntries(markets: BorosMarket[], capitalUsd: number, allocationPct: number, costs: Pick<EntryInput, 'gasUsd' | 'feesUsd' | 'slippageUsd'>, nowSec = Math.floor(Date.now() / 1000)) {
  if (Object.values(costs).some(v => v === null || !Number.isFinite(v) || v < 0)) return [];
  const reserve = costs.gasUsd! + costs.feesUsd! + costs.slippageUsd!;
  return markets.flatMap(m => {
    const sizeYu = sizeFromBudget(m, capitalUsd, allocationPct, reserve, nowSec);
    if (!sizeYu || !m.isUiWhitelisted) return [];
    return (['long', 'short'] as const).flatMap(direction => {
      const result = analyzeEntry({ m, direction, sizeYu, capitalUsd, entryRate: m.markApr, floatingRate: m.floatingApr, ...costs, nowSec });
      return result && !(result.liquidity.available && !result.liquidity.executable) && (result.state === 'positive' || result.state === 'conditional') ? [{ m, direction, sizeYu, result }] : [];
    });
  }).sort((a, b) => (b.result.scenarioMin ?? -Infinity) - (a.result.scenarioMin ?? -Infinity) || b.result.net! - a.result.net!);
}

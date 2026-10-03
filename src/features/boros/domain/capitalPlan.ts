import type { BorosDirection, BorosMarket } from './types';
import { analyzeEntry } from './entryAnalysis';
import { FeeCalculator } from './engine/fees';
import { MarginCalculator } from './engine/margin';

export interface CapitalPlanInput {
  capitalUsd: number;
  allocationPct: number;
  gasUsd: number | null;
  entranceUsd: number | null;
  /** Adverse execution APR impact in percentage points, an assumption, not a book quote. */
  impactPoints: number | null;
}
export function planCapital(markets: BorosMarket[], input: CapitalPlanInput, nowSec = Math.floor(Date.now() / 1000)) {
  const { capitalUsd, allocationPct, gasUsd, entranceUsd, impactPoints } = input;
  if (![capitalUsd, allocationPct].every(Number.isFinite) || capitalUsd <= 0 || allocationPct <= 0 || allocationPct > 100 || [gasUsd, entranceUsd, impactPoints].some(v => v == null || !Number.isFinite(v) || v < 0)) return [];
  const fixedCosts = gasUsd! + entranceUsd!;
  const budget = (capitalUsd - fixedCosts) * allocationPct / 100;
  if (budget <= 0) return [];
  return markets.flatMap(m => {
    const price = m.collateralPriceUsd;
    if (!m.isUiWhitelisted || m.status !== 'GOOD' || !price || !Number.isFinite(price) || price <= 0 || m.maturity <= nowSec || !Number.isFinite(m.floatingApr)) return [];
    return (['long', 'short'] as BorosDirection[]).flatMap(direction => {
      // Mark is only a reference. Adverse execution impact is included in rate, NEVER again in costs.
      const entryRate = m.markApr + (direction === 'long' ? 1 : -1) * impactPoints! / 100;
      const feesOne = FeeCalculator.calc({ m, size: 1, nowSec, unitPriceUsd: price });
      const marginOne = Math.max(MarginCalculator.calcMarket(m, 1, entryRate, nowSec), MarginCalculator.calcMarket(m, 1, m.markApr, nowSec)) * price;
      const lossOne = impactPoints! / 100 * price * (m.maturity - nowSec) / (365 * 86400);
      const perUnit = marginOne + feesOne.total + lossOne;
      if (!Number.isFinite(perUnit) || perUnit <= 0 || feesOne.total < 0) return [];
      const sizeYu = budget / perUnit;
      const fees = FeeCalculator.calc({ m, size: sizeYu, nowSec, unitPriceUsd: price });
      const result = analyzeEntry({ m, direction, sizeYu, capitalUsd, entryRate, floatingRate: m.floatingApr, gasUsd, feesUsd: fees.total + entranceUsd!, slippageUsd: 0, nowSec });
      if (!result || result.state === 'unavailable' || result.state === 'underfunded' || result.net == null) return [];
      return [{ m, direction, sizeYu, entryRate, result, fees, entranceUsd: entranceUsd!, gasUsd: gasUsd!, impactPoints: impactPoints! }];
    });
  }).sort((a, b) => b.result.net! - a.result.net! || a.m.marketId - b.m.marketId || a.direction.localeCompare(b.direction));
}
export type CapitalCandidate = ReturnType<typeof planCapital>[number];
/** Screening only; public OI/volume cannot prove full order execution. */
export function recommendCapital(rows: CapitalCandidate[]) {
  return rows.find(row => row.result.net! > 0 && row.result.threshold.state === 'estimated' && row.result.liquidity.available && row.result.liquidity.executable) ?? null;
}

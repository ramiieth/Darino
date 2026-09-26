/**
 * Portfolio overview — presentation view-model for the Dashboard.
 *
 * Reads the accounting single source of truth (cash + holdings + cost basis)
 * and merged live prices; derives display values only:
 *   value = qty × price, unrealized = value − costBasis,
 *   24h change of a position = value × c / (100 + c)  (c = 24h % of the asset)
 *
 * Never invents numbers: a holding without a price stays `null` and marks the
 * totals as `partial`; before accounting loads everything is `loading`.
 * No accounting/domain behaviour is changed here.
 */
import { useMemo } from 'react';
import type { AccountingState } from '@/features/accounting/data/useAccounting';
import { isCashStablecoin, CASH_STABLECOIN_SYMBOL } from '@/features/accounting/domain/types';
import { COINS, COIN_NAMES_FA } from '@/features/simulation/domain/constants';
import { useMergedCryptoPrices } from '@/shared/hooks/useMergedCryptoPrices';

const SYMBOL_TO_ID: Record<string, string> = Object.fromEntries(
  Object.entries(COINS).map(([id, sym]) => [sym, id])
);

export interface PositionView {
  symbol: string;
  nameFa: string;
  qty: number;
  avgCost: number;
  costBasis: number;
  price: number | null;
  value: number | null;
  unrealized: number | null;
  unrealizedPct: number | null;
  change24hPct: number | null;
  change24hUsd: number | null;
  /** Share of net worth, % */
  share: number | null;
}

export interface AllocationSlice {
  key: string;
  label: string;
  value: number;
  share: number;
}

export interface PortfolioOverview {
  state: 'loading' | 'ready';
  /** Prices come from cache/snapshot rather than a live response */
  stale: boolean;
  fetchedAt: number | null;
  cash: number | null;
  positions: PositionView[];
  holdingsValue: number | null;
  netWorth: number | null;
  /** Holdings that have no price — totals exclude them */
  unpriced: string[];
  change24hUsd: number | null;
  change24hPct: number | null;
  unrealizedTotal: number | null;
  costBasisTotal: number;
  realizedPnl: number | null;
  allocation: AllocationSlice[];
}

/** `acc` = the screen's single accounting instance (see AccountingContext) */
export function usePortfolioOverview(acc: AccountingState): PortfolioOverview {
  const merged = useMergedCryptoPrices();

  return useMemo<PortfolioOverview>(() => {
    if (acc.loading) {
      return {
        state: 'loading',
        stale: false,
        fetchedAt: null,
        cash: null,
        positions: [],
        holdingsValue: null,
        netWorth: null,
        unpriced: [],
        change24hUsd: null,
        change24hPct: null,
        unrealizedTotal: null,
        costBasisTotal: 0,
        realizedPnl: null,
        allocation: []
      };
    }

    const cash = acc.cashBalance;
    const unpriced: string[] = [];
    let holdingsValue = 0;
    let change24hUsd = 0;
    let changeKnown = false;
    let unrealizedTotal = 0;
    let costBasisTotal = 0;

    const rows = acc.holdings
      .filter((h) => !isCashStablecoin(h.symbol) && h.qty > 0)
      .map((h) => {
        const id = SYMBOL_TO_ID[h.symbol];
        const p = id ? merged.prices[id] : undefined;
        const price = typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : null;
        const value = price !== null ? price * h.qty : null;
        const unrealized = value !== null ? value - h.costBasis : null;
        const c = id ? merged.changes24h[id] : undefined;
        const change24hPct = typeof c === 'number' && Number.isFinite(c) ? c : null;
        const change24hUsd =
          value !== null && change24hPct !== null ? (value * change24hPct) / (100 + change24hPct) : null;
        if (value === null) unpriced.push(h.symbol);
        else {
          holdingsValue += value;
          unrealizedTotal += unrealized ?? 0;
          costBasisTotal += h.costBasis;
        }
        return {
          symbol: h.symbol,
          nameFa: (id && COIN_NAMES_FA[id]) || h.symbol,
          qty: h.qty,
          avgCost: h.avgCost,
          costBasis: h.costBasis,
          price,
          value,
          unrealized,
          unrealizedPct: unrealized !== null && h.costBasis > 0 ? (unrealized / h.costBasis) * 100 : null,
          change24hPct,
          change24hUsd,
          share: null as number | null
        };
      });

    for (const r of rows) {
      if (r.change24hUsd !== null) {
        change24hUsd += r.change24hUsd;
        changeKnown = true;
      }
    }

    const netWorth = cash + holdingsValue;
    for (const r of rows) r.share = r.value !== null && netWorth > 0 ? (r.value / netWorth) * 100 : null;
    rows.sort((a, b) => (b.value ?? -1) - (a.value ?? -1));

    const allocation: AllocationSlice[] = [
      ...rows
        .filter((r) => r.value !== null && r.value > 0)
        .map((r) => ({ key: r.symbol, label: r.nameFa, value: r.value as number, share: r.share ?? 0 })),
      ...(cash > 0
        ? [{ key: 'cash', label: `نقد (${CASH_STABLECOIN_SYMBOL})`, value: cash, share: netWorth > 0 ? (cash / netWorth) * 100 : 0 }]
        : [])
    ];

    const prevNet = netWorth - change24hUsd;
    return {
      state: 'ready',
      stale: !merged.live,
      fetchedAt: merged.fetchedAt,
      cash,
      positions: rows,
      holdingsValue,
      netWorth,
      unpriced,
      change24hUsd: changeKnown ? change24hUsd : null,
      change24hPct: changeKnown && prevNet > 0 ? (change24hUsd / prevNet) * 100 : null,
      unrealizedTotal: rows.some((r) => r.value !== null) ? unrealizedTotal : null,
      costBasisTotal,
      realizedPnl: acc.realizedPnl,
      allocation
    };
  }, [acc.loading, acc.cashBalance, acc.holdings, acc.realizedPnl, merged]);
}

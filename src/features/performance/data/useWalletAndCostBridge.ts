/**
 * پل اتصال زندهٔ کیف پول‌ها، بهای تمام‌شده (FIFO / Snapshot) و تاریخچهٔ چرخه‌های معاملاتی (Active Trading Cycles)
 * به بخش «عملکرد و مقایسه سرمایه» و «تحلیل هوشمند».
 *
 *   • محاسبهٔ بهای خرید، ارزش روز، سود/زیان باز و سود تحقق‌یافتهٔ فروش‌ها (همان منطق داشبورد)
 *   • استخراج چرخه‌های خرید و فروش رمزارز از تاریخچهٔ سواپ‌ها و معاملات کیف پول‌ها
 *   • مقایسهٔ عملکرد معامله‌گری فعال (Active Trading + FIFO PnL) در برابر نگهداری ساده (Buy & Hold)
 */
import { useMemo } from 'react';
import { getPref } from '@/features/custody/data/repository';
import { useConnectedPortfolio } from '@/features/connected/data/useConnectedPortfolio';
import { useActivity } from '@/features/connected/data/useActivity';
import { tokenName, chainIdentity } from '@/features/connected/presentation/identity';
import { allSourceCostSummary, type BasisRow } from '@/features/cost-basis/domain/allSources';
import { useCostSources } from '@/features/cost-basis/data';
import { COST_PREF, verifiedCash, type CostBook } from '@/features/cost-basis/domain/book';
import { usePerpVenues } from '@/features/perps/data/usePerpVenues';
import { perpTotals } from '@/features/perps/domain/perpPortfolio';

export interface AssetCycleSummary {
  symbol: string;
  nameFa: string;
  icon: string | null;
  buyCount: number;
  sellCount: number;
  totalBoughtUsd: number;
  totalSoldUsd: number;
  currentQuantity: number;
  currentValueUsd: number;
  costBasisUsd: number | null;
  avgCostUsd: number | null;
  currentPriceUsd: number | null;
  unrealizedPnlUsd: number | null;
  unrealizedPnlPct: number | null;
  provider: 'wallet' | 'arcus' | 'boros' | 'perp';
  sourceLabel: string;
  status: string;
}

export interface RecentTradeItem {
  id: string;
  at: number;
  chainName: string;
  soldSymbol: string;
  soldQty: string;
  soldValueUsd: number | null;
  boughtSymbol: string;
  boughtQty: string;
  boughtValueUsd: number | null;
  feeUsd: number | null;
}

export interface WalletAndCostBridge {
  connectedWalletsCount: number;
  totalLiveUsd: number | null;
  costBasis: {
    totalBasisUsd: number;
    totalCurrentValueUsd: number;
    totalUnrealizedPnlUsd: number;
    totalUnrealizedPnlPct: number | null;
    realizedPnlUsd: number | null;
    perpAllTimePnlUsd: number | null;
    perpRealizedPnlUsd: number | null;
    perpUnrealizedPnlUsd: number | null;
    combinedNetPnlUsd: number;
    coveredAssetsCount: number;
    missingBasisCount: number;
    rows: AssetCycleSummary[];
  };
  tradingCycles: {
    totalSwapsCount: number;
    totalVolumeUsd: number;
    totalGasFeesUsd: number;
    activeTradedAssetsCount: number;
    multiCycleAssets: { symbol: string; nameFa: string; buys: number; sells: number; volumeUsd: number }[];
    recentTrades: RecentTradeItem[];
  };
}

export function useWalletAndCostBridge(): WalletAndCostBridge {
  const portfolio = useConnectedPortfolio();
  const activity = useActivity(portfolio);
  const book = getPref<CostBook>(COST_PREF)?.value;
  const { boros, extraWallets } = useCostSources(portfolio);
  const perps = usePerpVenues(portfolio.arcus);

  return useMemo(() => {
    const summary = allSourceCostSummary(portfolio, book, activity.links, boros, extraWallets, perps);
    const pTotals = perpTotals(perps);

    // ۱. استخراج چرخه‌های خرید و فروش از تاریخچهٔ تراکنش‌های کیف پول‌های متصل
    const cycleMap = new Map<string, { symbol: string; nameFa: string; buys: number; sells: number; boughtUsd: number; soldUsd: number }>();
    const recentTrades: RecentTradeItem[] = [];
    let totalSwapsCount = 0;
    let totalVolumeUsd = 0;
    let totalGasFeesUsd = 0;

    const allTxs = portfolio.wallets
      .flatMap((w) => w.state?.history ?? [])
      .filter((tx) => !tx.spam && tx.status === 'confirmed')
      .sort((a, b) => Date.parse(b.minedAt) - Date.parse(a.minedAt));

    const seenTxIds = new Set<string>();
    for (const tx of allTxs) {
      const txKey = `${tx.chain}:${tx.hash}`;
      if (seenTxIds.has(txKey)) continue;
      seenTxIds.add(txKey);

      if (tx.fee && Number.isFinite(tx.fee) && tx.fee > 0) {
        totalGasFeesUsd += tx.fee;
      }

      if (tx.type !== 'trade') continue;
      const incoming = tx.transfers.filter((t) => t.direction === 'in');
      const outgoing = tx.transfers.filter((t) => t.direction === 'out');
      if (!incoming.length || !outgoing.length) continue;

      totalSwapsCount++;
      const buy = incoming[0];
      const sell = outgoing[0];
      const tradeVal = Math.max(buy.value ?? 0, sell.value ?? 0);
      totalVolumeUsd += tradeVal;

      // ثبت فروش دارایی خروجی (اگر استیبل‌کوین نقد نیست)
      if (sell.symbol && !verifiedCash(sell.chain ?? tx.chain, sell.contract, sell)) {
        const sym = sell.symbol.toUpperCase();
        const cur = cycleMap.get(sym) ?? { symbol: sym, nameFa: tokenName(sym, sell.name), buys: 0, sells: 0, boughtUsd: 0, soldUsd: 0 };
        cur.sells += 1;
        cur.soldUsd += sell.value ?? tradeVal;
        cycleMap.set(sym, cur);
      }

      // ثبت خرید دارایی ورودی (اگر استیبل‌کوین نقد نیست)
      if (buy.symbol && !verifiedCash(buy.chain ?? tx.chain, buy.contract, buy)) {
        const sym = buy.symbol.toUpperCase();
        const cur = cycleMap.get(sym) ?? { symbol: sym, nameFa: tokenName(sym, buy.name), buys: 0, sells: 0, boughtUsd: 0, soldUsd: 0 };
        cur.buys += 1;
        cur.boughtUsd += buy.value ?? tradeVal;
        cycleMap.set(sym, cur);
      }

      if (recentTrades.length < 15) {
        recentTrades.push({
          id: txKey,
          at: Date.parse(tx.minedAt),
          chainName: chainIdentity(tx.chain).name,
          soldSymbol: sell.symbol || '—',
          soldQty: sell.quantity || '0',
          soldValueUsd: sell.value,
          boughtSymbol: buy.symbol || '—',
          boughtQty: buy.quantity || '0',
          boughtValueUsd: buy.value,
          feeUsd: tx.fee
        });
      }
    }

    // ترکیب با لاتها و خریدهای ثبت‌شده در دفتر بهای خرید (CostBook)
    for (const lot of book?.lots ?? []) {
      const sym = lot.asset.symbol.toUpperCase();
      const cur = cycleMap.get(sym) ?? { symbol: sym, nameFa: tokenName(sym, lot.asset.name), buys: 0, sells: 0, boughtUsd: 0, soldUsd: 0 };
      cur.buys = Math.max(cur.buys, 1);
      const lotCost = Number(lot.quantity) * Number(lot.unitCost);
      if (Number.isFinite(lotCost) && lotCost > cur.boughtUsd) cur.boughtUsd = lotCost;
      cycleMap.set(sym, cur);
    }

    // ۲. ساخت ردیف‌های بهای تمام‌شده و سود/زیان هر دارایی
    let totalBasisUsd = 0;
    let totalCurrentValueUsd = 0;
    let totalUnrealizedPnlUsd = 0;
    let coveredAssetsCount = 0;
    let missingBasisCount = 0;

    const rows: AssetCycleSummary[] = summary.rows.map((r: BasisRow) => {
      const sym = r.asset.symbol.toUpperCase();
      const cyc = cycleMap.get(sym);
      const valUsd = r.priced ? r.value.toNumber() : 0;
      const pnlVal = r.pnl ?? r.estimatedPnl;

      if (r.basis !== null && r.basis > 0) {
        totalBasisUsd += r.basis;
        totalCurrentValueUsd += valUsd;
        if (pnlVal !== null) totalUnrealizedPnlUsd += pnlVal;
        coveredAssetsCount++;
      } else {
        missingBasisCount++;
      }

      return {
        symbol: r.asset.symbol,
        nameFa: r.provider === 'perp' ? r.asset.name : tokenName(r.asset.symbol, r.asset.name),
        icon: r.asset.icon,
        buyCount: cyc?.buys ?? (r.basis !== null ? 1 : 0),
        sellCount: cyc?.sells ?? 0,
        totalBoughtUsd: cyc?.boughtUsd ?? (r.basis ?? 0),
        totalSoldUsd: cyc?.soldUsd ?? 0,
        currentQuantity: r.quantity.toNumber(),
        currentValueUsd: valUsd,
        costBasisUsd: r.basis,
        avgCostUsd: r.avgCost,
        currentPriceUsd: r.price,
        unrealizedPnlUsd: pnlVal,
        unrealizedPnlPct: r.pnlPct ?? (pnlVal !== null && r.basis && r.basis > 0 ? (pnlVal / r.basis) * 100 : null),
        provider: r.provider,
        sourceLabel: r.sourceLabel,
        status: r.status
      };
    });

    const realizedSpot = summary.result?.realized ? Number(summary.result.realized) : null;
    const realizedPnlUsd = realizedSpot !== null && Number.isFinite(realizedSpot) ? realizedSpot : null;

    const combinedNetPnlUsd =
      totalUnrealizedPnlUsd +
      (realizedPnlUsd ?? 0) +
      (pTotals.realizedPnl ?? 0);

    const multiCycleAssets = [...cycleMap.values()]
      .filter((c) => c.buys + c.sells > 0)
      .map((c) => ({
        symbol: c.symbol,
        nameFa: c.nameFa,
        buys: c.buys,
        sells: c.sells,
        volumeUsd: Math.round(c.boughtUsd + c.soldUsd)
      }))
      .sort((a, b) => b.volumeUsd - a.volumeUsd || (b.buys + b.sells) - (a.buys + a.sells));

    return {
      connectedWalletsCount: portfolio.wallets.length + portfolio.arcus.length,
      totalLiveUsd: portfolio.total,
      costBasis: {
        totalBasisUsd: Math.round(totalBasisUsd * 100) / 100,
        totalCurrentValueUsd: Math.round(totalCurrentValueUsd * 100) / 100,
        totalUnrealizedPnlUsd: Math.round(totalUnrealizedPnlUsd * 100) / 100,
        totalUnrealizedPnlPct: totalBasisUsd > 0 ? (totalUnrealizedPnlUsd / totalBasisUsd) * 100 : null,
        realizedPnlUsd: realizedPnlUsd !== null ? Math.round(realizedPnlUsd * 100) / 100 : null,
        perpAllTimePnlUsd: pTotals.allTimePnl,
        perpRealizedPnlUsd: pTotals.realizedPnl,
        perpUnrealizedPnlUsd: pTotals.unrealizedPnl,
        combinedNetPnlUsd: Math.round(combinedNetPnlUsd * 100) / 100,
        coveredAssetsCount,
        missingBasisCount,
        rows
      },
      tradingCycles: {
        totalSwapsCount,
        totalVolumeUsd: Math.round(totalVolumeUsd),
        totalGasFeesUsd: Math.round(totalGasFeesUsd * 100) / 100,
        activeTradedAssetsCount: multiCycleAssets.length,
        multiCycleAssets,
        recentTrades
      }
    };
  }, [portfolio, activity.links, book, boros, extraWallets, perps]);
}

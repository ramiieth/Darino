/**
 * پل اتصال زندهٔ کیف پول‌ها و بهای تمام‌شدهٔ دارایی‌های موجود (FIFO / Current Basis داشبورد)
 * به بخش «عملکرد و مقایسه سرمایه» و «تحلیل هوشمند».
 *
 *   • تمرکز صرفاً بر دارایی‌های موجود فعلی در کیف پول و حساب‌های متصل
 *   • محاسبهٔ بهای خرید، میانگین خرید، ارزش روز و سود/زیان باز هر دارایی موجود (همان منطق داشبورد)
 *   • بدون نمایش رمزارزهای فروخته‌شدهٔ قدیمی یا چرخه‌های خرید و فروش گذشته
 */
import { useMemo } from 'react';
import { getPref } from '@/features/custody/data/repository';
import { useConnectedPortfolio } from '@/features/connected/data/useConnectedPortfolio';
import { useActivity } from '@/features/connected/data/useActivity';
import { tokenName } from '@/features/connected/presentation/identity';
import { allSourceCostSummary, type BasisRow } from '@/features/cost-basis/domain/allSources';
import { useCostSources } from '@/features/cost-basis/data';
import { COST_PREF, type CostBook } from '@/features/cost-basis/domain/book';
import { usePerpVenues } from '@/features/perps/data/usePerpVenues';
import { perpTotals } from '@/features/perps/domain/perpPortfolio';

export interface CurrentAssetCostRow {
  symbol: string;
  nameFa: string;
  icon: string | null;
  currentQuantity: number;
  currentValueUsd: number;
  costBasisUsd: number | null;
  avgCostUsd: number | null;
  currentPriceUsd: number | null;
  unrealizedPnlUsd: number | null;
  unrealizedPnlPct: number | null;
  sharePct: number | null;
  provider: 'wallet' | 'arcus' | 'boros' | 'perp';
  sourceLabel: string;
  status: string;
}

export interface WalletAndCostBridge {
  connectedWalletsCount: number;
  totalLiveUsd: number | null;
  costBasis: {
    totalBasisUsd: number;
    totalCurrentValueUsd: number;
    totalUnrealizedPnlUsd: number;
    totalUnrealizedPnlPct: number | null;
    perpEquityUsd: number | null;
    perpUnrealizedPnlUsd: number | null;
    perpAllTimePnlUsd: number | null;
    coveredAssetsCount: number;
    missingBasisCount: number;
    rows: CurrentAssetCostRow[];
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

    let totalBasisUsd = 0;
    let totalCurrentValueUsd = 0;
    let totalUnrealizedPnlUsd = 0;
    let coveredAssetsCount = 0;
    let missingBasisCount = 0;

    // فقط دارایی‌های موجود فعلی در کیف پول و حساب‌های متصل
    const activeRows = summary.rows.filter((r: BasisRow) => r.quantity.gt(0));

    const totalPortfolioVal = activeRows.reduce((acc, r) => acc + (r.priced ? r.value.toNumber() : 0), 0);

    const rows: CurrentAssetCostRow[] = activeRows.map((r: BasisRow) => {
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

      const sharePct =
        r.share !== null
          ? r.share
          : totalPortfolioVal > 0 && r.priced
            ? (valUsd / totalPortfolioVal) * 100
            : null;

      return {
        symbol: r.asset.symbol,
        nameFa: r.provider === 'perp' ? r.asset.name : tokenName(r.asset.symbol, r.asset.name),
        icon: r.asset.icon,
        currentQuantity: r.quantity.toNumber(),
        currentValueUsd: valUsd,
        costBasisUsd: r.basis,
        avgCostUsd: r.avgCost,
        currentPriceUsd: r.price,
        unrealizedPnlUsd: pnlVal,
        unrealizedPnlPct: r.pnlPct ?? (pnlVal !== null && r.basis && r.basis > 0 ? (pnlVal / r.basis) * 100 : null),
        sharePct,
        provider: r.provider,
        sourceLabel: r.sourceLabel,
        status: r.status
      };
    });

    // مرتب‌سازی نزولی بر اساس ارزش روز دارایی‌های موجود
    rows.sort((a, b) => b.currentValueUsd - a.currentValueUsd);

    return {
      connectedWalletsCount: portfolio.wallets.length + portfolio.arcus.length,
      totalLiveUsd: portfolio.total,
      costBasis: {
        totalBasisUsd: Math.round(totalBasisUsd * 100) / 100,
        totalCurrentValueUsd: Math.round(totalCurrentValueUsd * 100) / 100,
        totalUnrealizedPnlUsd: Math.round(totalUnrealizedPnlUsd * 100) / 100,
        totalUnrealizedPnlPct: totalBasisUsd > 0 ? (totalUnrealizedPnlUsd / totalBasisUsd) * 100 : null,
        perpEquityUsd: pTotals.equity,
        perpUnrealizedPnlUsd: pTotals.unrealizedPnl,
        perpAllTimePnlUsd: pTotals.allTimePnl,
        coveredAssetsCount,
        missingBasisCount,
        rows
      }
    };
  }, [portfolio, activity.links, book, boros, extraWallets, perps]);
}

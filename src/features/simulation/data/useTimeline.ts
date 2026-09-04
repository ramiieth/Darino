/**
 * هوک ترکیب داده‌ها → موتور محاسبات بازه
 * رمزارز (TanStack) + سهام (استور بازار) + سناریوی سفارشی → TimelineResult
 */
import { useMemo } from 'react';
import { buildTimeline } from '@/features/simulation/domain/engine';
import { useMergedCryptoPrices } from '@/shared/hooks/useMergedCryptoPrices';
import { useStockPrices } from './useStockPrices';
import { useSettingsStore } from '@/shared/store/settingsStore';
import { useAssetMeta } from '@/shared/hooks/useAssetMeta';
import { useInvestableCash, investableCashOr } from '@/shared/hooks/useInvestableCash';

export function useTimeline(timeline: 1 | 2) {
  const crypto = useMergedCryptoPrices();
  const {
    liveMap: stockLive,
    refreshing,
    done,
    total,
    lastCycleAt,
    errorCount,
    budgetInfo
  } = useStockPrices(true);
  const assetMeta = useAssetMeta();
  const scenario = useSettingsStore((s) => s.scenario);
  const hydrated = useSettingsStore((s) => s.hydrated);
  // سرمایه پایه = موجودی نقد واقعی حسابداری (Single Source of Truth)
  // پس از هر برداشت/فروش برای مخارج، همین مقدار به‌روز می‌شود.
  const investable = useInvestableCash();
  const base = investableCashOr(investable.cash);

  const result = useMemo(() => {
    return buildTimeline({
      timeline,
      liveCrypto: crypto.prices,
      liveStocks: Object.keys(stockLive).length > 0 ? stockLive : null,
      tokenizedPrices:
        Object.keys(assetMeta.tokenizedPrices).length > 0 ? assetMeta.tokenizedPrices : null,
      ethLivePrice: crypto.prices.ethereum ?? null,
      overrides: {
        baseCapital2025: base,
        baseCapital2026: base,
        ethRefJuly2026: hydrated ? scenario.ethRefJuly2026 : undefined
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, crypto.prices, stockLive, assetMeta.tokenizedPrices, scenario, hydrated, base]);

  return {
    ...result,
    cryptoStatus: {
      live: crypto.live,
      fetchedAt: crypto.fetchedAt
    },
    stockStatus: { refreshing, done, total, lastCycleAt, errorCount, budgetInfo },
    tokenizedStatus: {
      syncing: assetMeta.syncing,
      liveCount: assetMeta.liveCount,
      lastSyncAt: assetMeta.fetchedAt
    }
  };
}

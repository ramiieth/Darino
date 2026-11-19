/**
 * چشم‌انداز خودکار لحظهٔ ورود — کندل روزانهٔ هایپرلیکوئید (۵۰۰۰ روز، یک درخواست برای هر نماد، کش ۳۰ دقیقه)
 *   طلا/نقرهٔ لایتر (XAU/XAG) → xyz:GOLD / xyz:SILVER · کریپتوی بقیهٔ پلتفرم‌ها → دارایی پایه در هایپرلیکوئید
 *   علاوه بر روند روزانه و هفتگی، ATR14 و سطوح پیشنهادی خودکار (استاپ و هدف ۲R) را هم می‌سازد.
 */
import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { ClassifiedTrade, MarketOutlook, TradePlan } from '../domain/types';
import { tradfiCoin } from '../domain/excursions';
import { baseOf } from '../domain/roundTrips';
import { autoOutlook, buildSuggestedPlanLevels, dailyAtr } from '../domain/autoPlan';
import { fetchCandles } from './useExcursions';

const DAY = 86_400_000;
const MAX_COINS = 16;

export const outlookCoin = (t: Pick<ClassifiedTrade, 'venue' | 'symbol'>) => tradfiCoin(t.symbol) ?? (t.venue === 'hyperliquid' ? t.symbol : baseOf(t.symbol));

/** برنامه‌های خودکار + چشم‌انداز لحظهٔ ورود + استاپ/هدف پیشنهادی نوسان‌محور (ATR14) */
export function useAutoOutlook(trades: readonly ClassifiedTrade[], auto: ReadonlyMap<string, TradePlan>) {
  const coins = useMemo(() => {
    const count = new Map<string, number>();
    for (const t of trades) if (auto.has(t.id)) { const c = outlookCoin(t); count.set(c, (count.get(c) ?? 0) + 1); }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_COINS).map(([c]) => c);
  }, [trades, auto]);
  const q = useQueries({
    queries: coins.map((coin) => ({ queryKey: ['journal-candles', coin, '1d'], queryFn: () => fetchCandles(coin, '1d', DAY), staleTime: 30 * 60_000, gcTime: 60 * 60_000, retry: 1 }))
  });
  const stamp = q.map((x) => x.dataUpdatedAt).join(',');
  const plans = useMemo(() => {
    const sets = new Map(coins.map((c, i) => [c, q[i].data?.candles ?? null]));
    const out = new Map<string, TradePlan>();
    for (const t of trades) {
      const p = auto.get(t.id);
      if (!p) continue;
      const candles = sets.get(outlookCoin(t));
      const o: MarketOutlook | null = candles ? autoOutlook(candles, t.openTime, t.direction) : null;
      const atr = candles ? dailyAtr(candles, t.openTime) : null;
      const suggested = buildSuggestedPlanLevels({
        entry: p.entry,
        direction: t.direction,
        outlook: o ?? p.outlook,
        atr
      });
      out.set(t.id, {
        ...p,
        outlook: o ?? p.outlook,
        entryWhy: p.entryWhy || suggested?.entryWhy || '',
        stopWhy: p.stop !== null ? 'استاپ ثبت‌شده روی خود صرافی' : suggested?.stopWhy ?? p.stopWhy,
        targetWhy: p.target !== null ? 'هدف (TP) ثبت‌شده روی خود صرافی' : suggested?.targetWhy ?? p.targetWhy,
        auto: p.auto ? { ...p.auto, outlookAuto: !!o || p.auto.outlookAuto, suggested } : p.auto
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, trades, auto, coins]);
  return { plans, loading: q.some((x) => x.isPending) };
}

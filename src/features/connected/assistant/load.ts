import { loadAssistantStablecoins } from './stablecoins';
import { loadBoros, useBorosStore } from '@/features/boros/data/useBoros';
import { loadTopPerformers, usePerfStore } from '@/features/cryptomarkets/data/useTopPerformers';
import { syncUniverse, useMarketsStore } from '@/features/markets/pipeline/store';
import { loadTvlFlow, useTvlFlowStore } from '@/features/defi/data/useTvlFlow';
import { useSettingsStore } from '@/shared/store/settingsStore';
import { useWatchlistStore } from '@/shared/store/watchlistStore';
import { useVehicleStore } from '@/features/vehicle/data/useVehicles';
import { usePropertyMarketStore } from '@/features/propertyMarket/data/store';
import { useUsdtStore, usdtIsStale } from '@/shared/store/usdtStore';
/** Reuse the app's deduplicated loaders and caches. Never start property collection or trading. */
export function prepareAssistantData(force = false): Promise<PromiseSettledResult<void>[]> {
    const now = Date.now();
    const due = (at: number | null, ttl: number) => force || at === null || now - at > ttl;
    const tasks: Promise<void>[] = [loadAssistantStablecoins(), useSettingsStore.getState().hydrate(), useWatchlistStore.getState().hydrate(), useVehicleStore.getState().hydrate(), usePropertyMarketStore.getState().hydrate()];
    if (due(useBorosStore.getState().loadedAt, 120000))
        tasks.push(loadBoros());
    if (due(usePerfStore.getState().loadedAt, 300000))
        tasks.push(loadTopPerformers());
    if (due(useTvlFlowStore.getState().loadedAt, 300000))
        tasks.push(loadTvlFlow());
    for (const universe of ['crypto_top_200', 'ondo_tokenized', 'xstocks'] as const)
        if (due(useMarketsStore.getState().lastSyncAt[universe], 300000))
            tasks.push(syncUniverse(universe));
    tasks.push(useUsdtStore.getState().hydrate().then(() => { if (force || usdtIsStale(useUsdtStore.getState().quote))
        return useUsdtStore.getState().refresh(); }));
    return Promise.allSettled(tasks);
}
/** Slow history jobs continue in background; a chat request must not wait minutes for all stocks. */
export async function waitForAssistantData(timeoutMs = 12000): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        await Promise.race([prepareAssistantData(), new Promise<void>(resolve => { timer = setTimeout(resolve, timeoutMs); })]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}

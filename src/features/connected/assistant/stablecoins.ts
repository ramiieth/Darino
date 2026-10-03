import { cgFetch } from '@/shared/lib/coingeckoGate';
import { COINGECKO_BASE } from '@/app/config/apiConfig';
import { cacheBulkGetPrice, cachePutPrice } from '@/shared/lib/db';
import { useAssistantInsights } from '@/shared/assistant/insights';
import { tokenName } from '../presentation/identity';
import type { InsightRow } from '@/shared/assistant/schema';
const key = 'cg:stablecoins:top30';
let pending: Promise<void> | null = null;
const numeric = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;
function publish(coins: unknown, at: number, stale: boolean) {
    if (!Array.isArray(coins))
        return;
    const rows: InsightRow[] = coins.slice(0, 30).flatMap(v => {
        if (!v || typeof v.symbol !== 'string' || typeof v.name !== 'string')
            return [];
        return [{ name: tokenName(v.symbol, v.name).slice(0, 160), symbol: v.symbol.slice(0, 40), kind: 'استیبل‌کوین', source: 'api', status: stale ? 'stale' : 'ready', asOf: at, metrics: { priceUsd: numeric(v.current_price), marketCapUsd: numeric(v.market_cap), return1dPct: numeric(v.price_change_percentage_24h) } }];
    });
    useAssistantInsights.getState().put('stablecoins', rows);
}
/** Same cache and endpoint as the DeFi table; retain a dated snapshot on failure. */
export function loadAssistantStablecoins(): Promise<void> {
    if (pending)
        return pending;
    pending = (async () => {
        const rec = await cacheBulkGetPrice([key]).catch(() => new Map());
        const cached = rec.get(key);
        if (cached) {
            publish(cached.price, cached.fetchedAt, Date.now() - cached.fetchedAt > 60000);
            if (Date.now() - cached.fetchedAt < 60000)
                return;
        }
        try {
            const response = await cgFetch(`${COINGECKO_BASE}/coins/markets?vs_currency=usd&category=stablecoins&order=market_cap_desc&per_page=30&page=1&price_change_percentage=24h`, { timeoutMs: 10000 });
            if (!response.ok)
                return;
            const data = await response.json();
            if (!Array.isArray(data))
                return;
            const at = Date.now();
            publish(data, at, false);
            await cachePutPrice(key, { price: data as unknown as number, source: 'live', fetchedAt: at }).catch(() => undefined);
        }
        catch { /* Missing data remains missing, dated cache stays available. */ }
    })().finally(() => { pending = null; });
    return pending;
}

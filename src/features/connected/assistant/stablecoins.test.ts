// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock('@/shared/lib/coingeckoGate', () => ({ cgFetch: mocks.fetch }));
vi.mock('@/shared/lib/db', () => ({ cacheBulkGetPrice: mocks.read, cachePutPrice: mocks.write }));
import { loadAssistantStablecoins } from './stablecoins';
import { useAssistantInsights } from '@/shared/assistant/insights';
const data = [{ symbol: 'usdg', name: 'Global Dollar', current_price: 1, market_cap: 100, price_change_percentage_24h: 0 }];
beforeEach(() => { vi.clearAllMocks(); mocks.read.mockResolvedValue(new Map()); mocks.write.mockResolvedValue(undefined); useAssistantInsights.setState({ rows: {} }); });
describe('stablecoin section data', () => {
    it('publishes and caches actual prices from the same DeFi endpoint, deduplicating concurrent loads', async () => {
        mocks.fetch.mockResolvedValue(new Response(JSON.stringify(data)));
        await Promise.all([loadAssistantStablecoins(), loadAssistantStablecoins()]);
        expect(mocks.fetch).toHaveBeenCalledTimes(1);
        expect(mocks.fetch.mock.calls[0][0]).toContain('category=stablecoins');
        const row = useAssistantInsights.getState().rows.stablecoins[0];
        expect(row.metrics.priceUsd).toBe(1);
        expect(row.status).toBe('ready');
        expect(row.name).toBe('یو اس دی جی');
        expect(mocks.write).toHaveBeenCalledTimes(1);
    });
    it('retains the original dated cache after a quota failure', async () => {
        const at = Date.now() - 86400000;
        mocks.read.mockResolvedValue(new Map([['cg:stablecoins:top30', { price: data, fetchedAt: at }]]));
        mocks.fetch.mockResolvedValue(new Response('{}', { status: 429 }));
        await loadAssistantStablecoins();
        const row = useAssistantInsights.getState().rows.stablecoins[0];
        expect(row.status).toBe('stale');
        expect(row.asOf).toBe(at);
        expect(mocks.write).not.toHaveBeenCalled();
    });
    it('does not make a provider request for a fresh shared cache', async () => {
        mocks.read.mockResolvedValue(new Map([['cg:stablecoins:top30', { price: data, fetchedAt: Date.now() }]]));
        await loadAssistantStablecoins();
        expect(mocks.fetch).not.toHaveBeenCalled();
    });
});

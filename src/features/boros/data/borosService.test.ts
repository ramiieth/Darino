import { beforeEach, describe, expect, it, vi } from 'vitest';
import { borosRaw } from '../../../../tests/fixtures/boros';
const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), fetch: vi.fn() }));
vi.mock('@/shared/lib/db', () => ({ cacheBulkGetPrice: mocks.get, cachePutPrice: mocks.put }));
vi.mock('@/shared/lib/fetchWithRetry', () => ({ fetchWithRetry: mocks.fetch }));
vi.mock('@/features/cryptomarkets/data/useTopPerformers', () => ({ mapLimit: async (rows: unknown[], _n: number, fn: (m: unknown) => Promise<void>) => Promise.all(rows.map(fn)) }));
import { fetchBorosMarkets, fetchBorosOhlcv, fetchBorosFundingHistory, mapMarket } from './borosService';
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const assets = { results: [{ tokenId: borosRaw.tokenId, isCollateral: true, symbol: 'WETH', metadata: { proSymbol: 'ETH' }, usdPrice: '3000' }] };
beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue(new Map()); mocks.put.mockResolvedValue(undefined); });
describe('Boros official API adapter', () => {
  it('does not save partial pages as a complete live snapshot', async () => {
    mocks.fetch.mockImplementation(async (url: string) => url.includes('resumeToken=next') ? reply({}, 503) : reply({ results: [borosRaw], resumeToken: 'next' }));
    await expect(fetchBorosMarkets()).rejects.toThrow('no boros market data');
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it('retains the last complete snapshot and its timestamp on page failure', async () => {
    const fetchedAt = Date.now() - 600000;
    const old = [mapMarket(borosRaw, fetchedAt)];
    mocks.get.mockResolvedValue(new Map([['boros:markets:v2', { price: old, fetchedAt }]]));
    mocks.fetch.mockResolvedValue(reply({}, 429));
    expect(await fetchBorosMarkets()).toEqual({ markets: old, stale: true, fetchedAt });
  });
  it('joins collateral tokenId and accepts a complete empty market list', async () => {
    mocks.fetch.mockImplementation(async (url: string) => url.includes('/assets') ? reply(assets) : reply({ results: [borosRaw], resumeToken: null }));
    const result = await fetchBorosMarkets();
    expect(result.markets[0].collateralSymbol).toBe('ETH');
    expect(result.markets[0].collateralPriceUsd).toBe(3000);
    mocks.fetch.mockImplementation(async (url: string) => url.includes('/assets') ? reply(assets) : reply({ results: [], resumeToken: null }));
    expect((await fetchBorosMarkets()).markets).toEqual([]);
  });
  it('supports cursor envelopes and rejects repeating cursors', async () => {
    mocks.fetch.mockResolvedValue(reply({ results: [borosRaw], cursor: { next: 'loop', hasMore: true } }));
    await expect(fetchBorosMarkets()).rejects.toThrow();
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it('uses upstream timestamp, never relabels an old response as fresh', async () => {
    const timestamp = Math.floor(Date.now() / 1000) - 7200;
    mocks.fetch.mockImplementation(async (url: string) => url.includes('/assets') ? reply(assets) : reply({ results: [borosRaw], syncStatus: { timestamp } }));
    const result = await fetchBorosMarkets();
    expect(result.stale).toBe(true);
    expect(result.fetchedAt).toBe(timestamp * 1000);
    expect(result.markets[0].snapshotAt).toBe(timestamp * 1000);
  });
  it('does not confuse an ETH underlying price with USDT collateral', async () => {
    const raw = { ...borosRaw, tokenId: 3, data: { ...borosRaw.data, assetMarkPrice: 3000 } };
    const collateral = { results: [{ tokenId: 3, isCollateral: true, symbol: 'USD₮0', metadata: { proSymbol: 'USDT' }, usdPrice: '1' }] };
    mocks.fetch.mockImplementation(async (url: string) => url.includes('/assets') ? reply(collateral) : reply({ results: [raw] }));
    const m = (await fetchBorosMarkets()).markets[0];
    expect(m.asset).toBe('ETH');
    expect(m.assetMarkPrice).toBe(3000);
    expect(m.collateralSymbol).toBe('USDT');
    expect(m.collateralPriceUsd).toBe(1);
  });
  it('keeps negative/zero candles, sorts and deduplicates timestamps', async () => {
    mocks.fetch.mockResolvedValue(reply({ results: [{ ts: 20, c: 0 }, { ts: 10, c: -.1 }, { ts: 10, c: -.2 }, { ts: 30, c: null }] }));
    expect(await fetchBorosOhlcv(128)).toEqual([{ ts: 10, c: -.2 }, { ts: 20, c: 0 }]);
    expect(mocks.fetch.mock.calls[0][0]).toContain('startTimestamp=');
    expect(mocks.fetch.mock.calls[0][0]).not.toContain('&limit=');
  });
  it('uses actual oracle observations and excludes pre-history and unsettled buckets', async () => {
    mocks.fetch.mockResolvedValue(reply({ metadata: { firstDataTimestamp: { u: 10 }, uLastSettledTimestamp: 20 }, results: [{ ts: 1, u: .9 }, { ts: 10, u: -.1 }, { ts: 20, u: 0 }, { ts: 30, u: .5 }] }));
    expect(await fetchBorosFundingHistory(128)).toEqual([{ ts: 10, c: -.1 }, { ts: 20, c: 0 }]);
    expect(mocks.fetch.mock.calls[0][0]).toContain('/indicators?');
    expect(mocks.fetch.mock.calls[0][0]).toContain('select=u');
  });
});

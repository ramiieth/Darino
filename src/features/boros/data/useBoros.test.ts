import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BorosMarket } from '../domain/types';
const mocks = vi.hoisted(() => ({ markets: vi.fn(), history: vi.fn() }));
vi.mock('./borosService', () => ({ fetchBorosMarkets: mocks.markets, syncBorosOhlcv: mocks.history }));
vi.mock('@/shared/hooks/useAutoSync', () => ({ useAutoSync: vi.fn() }));
import { loadBoros, resetBorosLoad, useBorosStore } from './useBoros';
beforeEach(() => {
  vi.clearAllMocks(); resetBorosLoad();
  useBorosStore.setState({ markets: [], loading: false, error: false, stale: false, syncProgress: null, loadedAt: null });
});
describe('Boros history publication', () => {
  it('publishes a new market reference after async enrichment; cached input stays untouched', async () => {
    const m = { marketId: 1, ohlcv: [] } as unknown as BorosMarket;
    const cached = [m];
    mocks.markets.mockResolvedValue({ markets: cached, fetchedAt: 12345, stale: false });
    mocks.history.mockImplementation(async (rows: BorosMarket[]) => { rows[0].ohlcv = [{ ts: 1, c: -.1 }]; });
    await loadBoros();
    const st = useBorosStore.getState();
    expect(st.markets).not.toBe(cached);
    expect(st.markets[0]).not.toBe(m);
    expect(st.markets[0].ohlcv).toEqual([{ ts: 1, c: -.1 }]);
    expect(m.ohlcv).toEqual([]);
    expect(st.loadedAt).toBe(12345);
  });
  it('marks retained data stale when refresh fails, and preserves its timestamp', async () => {
    const old = [{ marketId: 1 }] as BorosMarket[];
    useBorosStore.setState({ markets: old, loadedAt: 12345 });
    mocks.markets.mockRejectedValue(new Error('offline'));
    await loadBoros();
    expect(useBorosStore.getState().markets).toBe(old);
    expect(useBorosStore.getState().stale).toBe(true);
    expect(useBorosStore.getState().loadedAt).toBe(12345);
    expect(useBorosStore.getState().loading).toBe(false);
  });
});

// @vitest-environment jsdom
/**
 * نرخ زنده تتر — ترتیب منابع و فالبک (بدون شبکه)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  fetchJson: vi.fn(),
  isRemoteAllowed: vi.fn(() => true),
  settings: new Map<string, unknown>()
}));
vi.mock('@/repositories/remoteClient', () => ({ fetchJson: h.fetchJson, isRemoteAllowed: h.isRemoteAllowed }));
vi.mock('@/shared/lib/db', () => ({
  settingGet: vi.fn(async (k: string, d: unknown) => (h.settings.has(k) ? h.settings.get(k) : d)),
  settingSet: vi.fn(async (k: string, v: unknown) => void h.settings.set(k, v))
}));

import { useUsdtStore, usdtIsStale, USDT_STALE_MS } from './usdtStore';

const BITPIN_OK = [{ symbol: 'USDT_IRT', price: '233151', timestamp: 1790430690 }];

function reset() {
  h.settings.clear();
  h.fetchJson.mockReset();
  useUsdtStore.setState({ quote: null, status: 'idle', preferred: 'wallex', error: null, hydrated: false });
}

describe('useUsdtStore', () => {
  beforeEach(reset);

  it('پیش‌فرض والکس از مسیر سرور', async () => {
    h.fetchJson.mockResolvedValue({ ok: true, source: 'wallex', priceToman: 233341, tradedAt: 1 });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(BITPIN_OK))));
    await useUsdtStore.getState().hydrate();
    await useUsdtStore.getState().refresh();
    const s = useUsdtStore.getState();
    expect(s.status).toBe('live');
    expect(s.quote).toMatchObject({ source: 'wallex', priceToman: 233341 });
    expect(h.fetchJson).toHaveBeenCalledWith('/api/usdt?source=wallex', expect.anything());
    expect(h.settings.get('usdtLastQuoteV1')).toMatchObject({ priceToman: 233341 });
  });

  it('والکس/سرور ناموفق → بیت‌پین مستقیم از مرورگر (بدون سرور)', async () => {
    h.fetchJson.mockRejectedValue(new Error('HTTP 404'));
    const f = vi.fn(async () => new Response(JSON.stringify(BITPIN_OK)));
    vi.stubGlobal('fetch', f);
    await useUsdtStore.getState().refresh();
    expect(useUsdtStore.getState().quote).toMatchObject({ source: 'bitpin', priceToman: 233151 });
    expect(String((f.mock.calls[0] as unknown[])[0])).toContain('api.bitpin.ir');
  });

  it('ترجیح بیت‌پین → اول بیت‌پین مستقیم؛ سرور صدا زده نمی‌شود', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(BITPIN_OK))));
    await useUsdtStore.getState().setPreferred('bitpin');
    expect(useUsdtStore.getState().quote?.source).toBe('bitpin');
    expect(h.fetchJson).not.toHaveBeenCalled();
    expect(h.settings.get('usdtSourceV1')).toBe('bitpin');
  });

  it('همه ناموفق + نرخ ذخیره‌شده → «stale» با همان نرخ', async () => {
    h.settings.set('usdtLastQuoteV1', { source: 'bitpin', priceToman: 230000, tradedAt: null, fetchedAt: 1 });
    h.fetchJson.mockRejectedValue(new Error('down'));
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await useUsdtStore.getState().hydrate();
    expect(useUsdtStore.getState().status).toBe('stale');
    await useUsdtStore.getState().refresh();
    expect(useUsdtStore.getState()).toMatchObject({ status: 'stale', quote: { priceToman: 230000 } });
    expect(useUsdtStore.getState().error).toContain('wallex');
  });

  it('همه ناموفق بدون نرخ ذخیره‌شده → unavailable (عدد جعلی ساخته نمی‌شود)', async () => {
    h.fetchJson.mockResolvedValue({ ok: false, error: 'HTTP 403' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
    await useUsdtStore.getState().refresh();
    expect(useUsdtStore.getState()).toMatchObject({ status: 'unavailable', quote: null });
  });

  it('پاسخ سرور با قیمت نامعقول (ریال) رد می‌شود', async () => {
    h.fetchJson.mockResolvedValue({ ok: true, priceToman: 2_331_510 * 10 });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('x'); }));
    await useUsdtStore.getState().refresh();
    expect(useUsdtStore.getState().quote).toBeNull();
  });

  it('درخواست‌های همزمان یکی می‌شوند', async () => {
    h.fetchJson.mockResolvedValue({ ok: true, priceToman: 233000 });
    await Promise.all([useUsdtStore.getState().refresh(), useUsdtStore.getState().refresh()]);
    expect(h.fetchJson).toHaveBeenCalledTimes(1);
  });

  it('usdtIsStale', () => {
    const now = 10 * USDT_STALE_MS;
    expect(usdtIsStale(null, now)).toBe(true);
    expect(usdtIsStale({ source: 'wallex', priceToman: 1e5, tradedAt: null, fetchedAt: now - 1000 }, now)).toBe(false);
    expect(usdtIsStale({ source: 'wallex', priceToman: 1e5, tradedAt: null, fetchedAt: now - USDT_STALE_MS - 1 }, now)).toBe(true);
  });
});

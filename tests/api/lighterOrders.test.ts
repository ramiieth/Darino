import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLighterOrders, trimLighterOrder } from '../../api/_perpsRead';

const markets = new Map([[92, 'XAU'], [1, 'BTC']]);
const TOKEN = 'ro:281474976710654:single:1893456000:abcdef0123';

describe('سفارش‌های استاپ/هدف لایتر', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('فقط stop-loss و take-profit؛ زمان ثانیه → میلی‌ثانیه؛ is_ask = فروش', () => {
    expect(trimLighterOrder({ order_id: '7', market_index: 92, type: 'stop-loss', is_ask: true, trigger_price: '3950.5', created_at: 1793795092, updated_at: 1793795992, status: 'filled' }, markets))
      .toEqual({ id: '7', sym: 'XAU', kind: 'sl', side: 'sell', trigger: 3950.5, placed: 1793795092000, ended: 1793795992000, status: 'filled' });
    expect(trimLighterOrder({ order_id: '8', market_index: 1, type: 'take-profit-limit', is_ask: false, trigger_price: '60000', timestamp: 1793795092, status: 'open' }, markets)).toMatchObject({ kind: 'tp', side: 'buy', ended: null });
    expect(trimLighterOrder({ order_id: '9', market_index: 1, type: 'limit', trigger_price: '0', timestamp: 1 }, markets)).toBeNull();
    expect(trimLighterOrder({ order_id: '10', market_index: 5, type: 'stop-loss', trigger_price: '1', timestamp: 1 }, markets)).toBeNull();
  });

  it('بدون توکن: بدون هیچ درخواستی configured=false', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    vi.stubEnv('LIGHTER_READ_TOKEN', '');
    vi.stubEnv('LIGHTER_RO_TOKEN', '');
    const r = await getLighterOrders('lighter-mainnet-orders', '281474976710654', 0);
    expect(r).toMatchObject({ configured: false, from: null, orders: [] });
    expect(f).not.toHaveBeenCalled();
  });

  it('با توکن: هدر Authorization، توکن در پاسخ نمی‌آید', async () => {
    vi.stubEnv('LIGHTER_READ_TOKEN', `junk, ${TOKEN}`);
    const seen: { url: string; auth: string | null }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const h = new Headers(init?.headers);
      seen.push({ url, auth: h.get('authorization') });
      const body = url.includes('orderBookDetails') ? { code: 200, order_book_details: [{ market_id: 92, symbol: 'XAU' }] }
        : url.includes('accountActiveOrders') ? { code: 200, orders: [{ order_id: '1', market_index: 92, type: 'stop-loss', is_ask: true, trigger_price: '3900', created_at: 1793795092, status: 'open' }] }
        : { code: 200, orders: [], next_cursor: '' };
      return new Response(JSON.stringify(body), { status: 200 });
    }));
    const r = await getLighterOrders('lighter-mainnet-orders', '281474976710654', 0);
    expect(r).toMatchObject({ configured: true, complete: true, from: 0 });
    expect(r.orders).toHaveLength(1);
    expect(seen.filter((x) => x.url.includes('account')).every((x) => x.auth === TOKEN)).toBe(true);
    expect(seen.find((x) => x.url.includes('orderBookDetails'))?.auth).toBeNull();
    expect(JSON.stringify(r)).not.toContain('abcdef0123');
  });
});

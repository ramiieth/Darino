// @vitest-environment node
/** غربال میم‌کوین روی سرور: ساخت تدریجی با سقف درخواست، فقط میزبان‌های مجاز، فهرست انتظار و اعلان */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AlertsStore } from '../../api/_alerts';

const fetchMock = vi.fn();
const DAY = 86_400_000;
const MINT = 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm';
const ok = (d: unknown) => new Response(JSON.stringify(d));
const rising = (n: number) => ({
  prices: Array.from({ length: n }, (_, i) => [i * DAY, 1.01 ** i]),
  market_caps: Array.from({ length: n }, (_, i) => [i * DAY, 4e7]),
  total_volumes: Array.from({ length: n }, (_, i) => [i * DAY, 5e5])
});
const market = (id: string, mc: number, vol = 1e6) => ({ id, symbol: id, name: id.toUpperCase(), image: 'https://x/y.png', market_cap: mc, total_volume: vol, ath_change_percentage: -70 });

function upstream(markets: unknown[]) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/coins/markets')) return ok(markets);
    if (url.includes('/market_chart')) return ok(rising(90));
    if (/\/coins\/[a-z-]+\?/.test(url)) return ok({ platforms: { solana: MINT } });
    if (url.startsWith('https://api.rugcheck.xyz/')) return ok({ mint: MINT, mintAuthority: null, freezeAuthority: null, topHolders: [{ owner: 'a', pct: 9 }], markets: [{ lp: { lpLockedPct: 100 } }], risks: [] });
    throw new Error(`unexpected ${url}`);
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('غربال میم‌کوین', () => {
  it('فقط کوین‌های بالای دروازه؛ در هر تیک حداکثر ۴ کوین؛ کلید CoinGecko فقط روی سرور', async () => {
    upstream([market('zcat', 4e7), market('troll', 3e7), market('tiny', 1e6), market('dead', 2e7, 10), ...['a', 'b', 'c'].map((x) => market(`coin-${x}`, 1e7))]);
    const { warmMemeScreen, getMemeScreen } = await import('../../api/_memeScreen');
    expect(await warmMemeScreen()).toBe(1); // ۵ کوین واجد شرایط، ۴ تازه شد
    const p = (await getMemeScreen())!;
    expect(p.total).toBe(5);
    expect(p.pending).toBe(1);
    expect(p.coins.map((c) => c.id).sort()).toEqual(['coin-a', 'coin-b', 'troll', 'zcat']);
    expect(p.coins.every((c) => c.passes && c.mint === MINT)).toBe(true);
    expect(p.regime.state).toBe('unknown'); // کمتر از ۱۰ کوین
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.every((u) => u.startsWith('https://api.coingecko.com/api/v3/') || u.startsWith('https://api.rugcheck.xyz/'))).toBe(true);
    expect(urls.filter((u) => u.includes('coingecko')).every((u) => u.includes('x_cg_demo_api_key='))).toBe(true);
    // تیک بعدی فقط باقی‌مانده را می‌گیرد؛ کوین تازه دوباره درخواست نمی‌شود
    fetchMock.mockClear();
    expect(await warmMemeScreen()).toBe(0);
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('/market_chart'))).toHaveLength(1);
  });

  it('مسیر عمومی /api/intel?op=memeScreen؛ منبع خراب ← ۵۰۲ بدون کش', async () => {
    upstream([market('zcat', 4e7)]);
    const handler = (await import('../../api/_intelRoute')).default;
    const res = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
    await handler({ method: 'GET', url: '/api/intel?op=memeScreen' } as IncomingMessage, res as unknown as ServerResponse);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.end.mock.calls[0][0]).coins[0]).toMatchObject({ id: 'zcat', passes: true });

    vi.resetModules();
    fetchMock.mockImplementation(async () => new Response('down', { status: 500 }));
    const handler2 = (await import('../../api/_intelRoute')).default;
    const res2 = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
    await handler2({ method: 'GET', url: '/api/intel?op=memeScreen' } as IncomingMessage, res2 as unknown as ServerResponse);
    expect(res2.statusCode).toBe(502);
    expect(res2.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
});

describe('فهرست انتظار روی حساب', () => {
  function memoryStore(): AlertsStore & { kv: Map<string, unknown> } {
    const kv = new Map<string, unknown>();
    return {
      kv,
      async get<T>(u: string, k: string) { return (kv.get(`${u}|${k}`) as T) ?? null; },
      async put(u, k, p) { kv.set(`${u}|${k}`, JSON.parse(JSON.stringify(p))); },
      async subscriptions() { return []; },
      async addSubscription() {},
      async removeSubscription() {},
      async users() { return []; },
      async holdings() { return []; }
    };
  }

  it('ذخیره و بازگشت؛ کوینی که همین الان آماده است اعلان «تازه» نمی‌گیرد؛ گذر بعدی اعلان می‌دهد', async () => {
    // ۱۲ کوین در روند صعودی ← رژیم روشن
    upstream(Array.from({ length: 12 }, (_, i) => market(`coin-${String.fromCharCode(97 + i)}`, 2e7)));
    const { warmMemeScreen } = await import('../../api/_memeScreen');
    for (let i = 0; i < 3; i++) await warmMemeScreen();
    const { handleAlertsOp } = await import('../../api/_alerts');
    const store = memoryStore();
    const body = (b: Record<string, unknown>) => async () => b;

    expect(await handleAlertsOp(store, 'memes-watch-put', 'POST', 'u1', body({ ids: ['coin-a', 'BAD ID', 'coin-a'] }))).toEqual([200, { ids: ['coin-a'] }]);
    expect(await handleAlertsOp(store, 'memes-watch-get', 'GET', 'u1', body({}))).toEqual([200, { ids: ['coin-a'] }]);
    expect(store.kv.get('u1|memeWatch')).toEqual({ ids: ['coin-a'], last: { 'coin-a': true } });

    // اگر قبلاً «نه» بوده، تیک بعدی یک اعلان می‌فرستد و تکرار نمی‌کند
    await store.put('u1', 'memeWatch', { ids: ['coin-a'], last: { 'coin-a': false } });
    const { checkUser } = await import('../../api/_alerts');
    await store.put('u1', 'rules', { funding: [], liquidation: { enabled: false, thresholdPct: 15 } });
    const r1 = await checkUser(store, 'u1');
    expect(r1.sent).toBe(1);
    expect((store.kv.get('u1|log') as { title: string }[])[0].title).toBe('COIN-A: همهٔ فیلترها رد شد');
    expect((await checkUser(store, 'u1')).sent).toBe(0);
  });
});

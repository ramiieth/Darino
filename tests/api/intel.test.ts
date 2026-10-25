// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

const fetchMock = vi.fn();
const MINT = 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm';
function response() {
  return { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
}
const body = (res: ReturnType<typeof response>) => JSON.parse(res.end.mock.calls[0][0]);
async function call(url: string) {
  vi.resetModules();
  const handler = (await import('../../api/_intelRoute')).default;
  const res = response();
  await handler({ method: 'GET', url } as IncomingMessage, res as unknown as ServerResponse);
  return res;
}
const ok = (d: unknown) => new Response(JSON.stringify(d));

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

describe('/api/intel', () => {
  it('token: سه منبع ترکیب می‌شوند؛ منبع خراب فقط کنار می‌رود', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('gopluslabs')) return ok({ code: 1, result: { [MINT]: { mintable: { status: '0' }, freezable: { status: '1' } } } });
      if (url.includes('rugcheck')) return new Response('down', { status: 500 });
      if (url.includes('dexscreener')) return ok({ pairs: [{ chainId: 'solana', liquidity: { usd: 200000 }, priceUsd: '0.17', url: 'https://dexscreener.com/solana/x' }, { chainId: 'base', liquidity: { usd: 9e9 } }] });
      throw new Error(url);
    });
    const r = body(await call(`/api/intel?op=token&chain=solana&address=${MINT}`));
    expect(r.verdict).toBe('danger');
    expect(r.sources).toEqual(['GoPlus', 'DexScreener']);
    expect(r.market.liquidityUsd).toBe(200000);
  });

  it('token: آدرس نامعتبر برای شبکه → ۴۰۰ بدون درخواست بیرونی', async () => {
    const res = await call(`/api/intel?op=token&chain=ethereum&address=${MINT}`);
    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('memes: ترند GeckoTerminal + حکم سریع RugCheck', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('geckoterminal')) return ok({
        data: [{ attributes: { address: 'p1', reserve_in_usd: '100' }, relationships: { base_token: { data: { id: 't1' } } } }],
        included: [{ id: 't1', type: 'token', attributes: { address: MINT, symbol: 'WIF', name: 'dogwifhat' } }]
      });
      if (url.includes('rugcheck')) return ok({ risks: [{ name: 'x', level: 'danger' }] });
      throw new Error(url);
    });
    const r = body(await call('/api/intel?op=memes'));
    expect(r.list).toBe('trending');
    expect(r.tokens[0]).toMatchObject({ symbol: 'WIF', safety: { verdict: 'danger', dangers: 2 } }); // RugCheck + نقدینگی ۱۰۰ دلاری
  });
});

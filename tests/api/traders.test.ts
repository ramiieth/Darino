// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { aggregatePositions } from '../../src/features/traders/domain/positions';

const fetchMock = vi.fn();
const row = (c: string, allTime: number) => ({
  ethAddress: '0x' + c.repeat(40),
  accountValue: '1000000',
  displayName: null,
  windowPerformances: [
    ['day', { pnl: '0', roi: '0', vlm: '0' }],
    ['week', { pnl: '0', roi: '0', vlm: '0' }],
    ['month', { pnl: '10000', roi: '0.01', vlm: '5000000' }],
    ['allTime', { pnl: String(allTime), roi: '0.5', vlm: '0' }]
  ]
});
const board = { leaderboardRows: [row('1', 100), row('2', 900), { ethAddress: 'bad' }] };

function response() {
  return { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
}
const body = (res: ReturnType<typeof response>) => JSON.parse(res.end.mock.calls[0][0]);

async function freshHandler() {
  vi.resetModules();
  return (await import('../../api/_tradersRoute')).default;
}
const call = (handler: Awaited<ReturnType<typeof freshHandler>>, method = 'GET', url = '/api/traders') => {
  const res = response();
  return handler({ method, url } as IncomingMessage, res as unknown as ServerResponse).then(() => res);
};
const A1 = '0x' + '1'.repeat(40), A2 = '0x' + '2'.repeat(40);
const portfolio = [['perpAllTime', { accountValueHistory: [[0, '1000'], [40 * 86_400_000, '1500']], pnlHistory: [[0, '0'], [40 * 86_400_000, '500']], vlm: '0' }]];
const fills = [
  { coin: 'ETH', side: 'B', sz: '1', px: '3000', startPosition: '0', time: 1, dir: 'Open Long', closedPnl: '0', fee: '1' },
  { coin: 'ETH', side: 'A', sz: '1', px: '3100', startPosition: '1', time: 2, dir: 'Close Long', closedPnl: '100', fee: '1' }
];
function hlMock(extra?: (b: Record<string, unknown>) => unknown) {
  return async (url: string, init?: RequestInit) => {
    if (url.includes('stats-data.hyperliquid.xyz')) return new Response(JSON.stringify(board));
    const b = JSON.parse(String(init?.body ?? '{}'));
    const x = extra?.(b);
    if (x !== undefined) return new Response(JSON.stringify(x));
    if (b.type === 'portfolio') return new Response(JSON.stringify(portfolio));
    if (b.type === 'userFills') return new Response(JSON.stringify(fills));
    throw new Error('unexpected ' + url);
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  delete process.env.DATABASE_URL;
});

describe('/api/traders', () => {
  it('لیدربورد را خلاصه، مرتب و کش می‌کند', async () => {
    const handler = await freshHandler();
    fetchMock.mockResolvedValue(new Response(JSON.stringify(board)));
    const first = await call(handler);
    expect(first.statusCode).toBe(200);
    const payload = body(first);
    expect(payload.totalAccounts).toBe(2);
    expect(payload.candidates.map((c: { address: string }) => c.address)).toEqual(['0x' + '2'.repeat(40), '0x' + '1'.repeat(40)]);
    expect(first.setHeader).toHaveBeenCalledWith('Cache-Control', expect.stringContaining('s-maxage=3600'));
    await call(handler);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('قطعی منبع بدون نسخهٔ قبلی → ۵۰۲ بدون داده ساختگی', async () => {
    const handler = await freshHandler();
    fetchMock.mockResolvedValue(new Response('down', { status: 503 }));
    const res = await call(handler);
    expect(res.statusCode).toBe(502);
    expect(body(res).candidates).toBeUndefined();
  });

  it('فقط GET', async () => {
    const handler = await freshHandler();
    const res = await call(handler, 'POST');
    expect(res.statusCode).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('summaries: در هر درخواست حداکثر ۳ خلاصهٔ تازه، کش برای درخواست بعدی، آدرس نامعتبر نادیده', async () => {
    const handler = await freshHandler();
    fetchMock.mockImplementation(hlMock());
    const many = [A1, A2, ...['3', '4', '5'].map((c) => '0x' + c.repeat(40))];
    const r1 = body(await call(handler, 'GET', `/api/traders?op=summaries&addresses=${many.join(',')},bad`));
    expect(Object.keys(r1.summaries)).toHaveLength(3);
    expect(r1.pending).toBe(2);
    expect(r1.summaries[A1]).toMatchObject({ address: A1, closedCount: 1, winRate: 100, totalPnl: 500, allWins: true, profitFactor: null });
    const r2 = body(await call(handler, 'GET', `/api/traders?op=summaries&addresses=${many.join(',')}`));
    expect(Object.keys(r2.summaries)).toHaveLength(5);
    expect(r2.pending).toBe(0);
    const calls = fetchMock.mock.calls.length;
    await call(handler, 'GET', `/api/traders?op=summaries&addresses=${A1}`);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it('positions: پوزیشن‌های باز برترها تجمیع و کش می‌شوند', async () => {
    const handler = await freshHandler();
    fetchMock.mockImplementation(hlMock((b) => b.type === 'clearinghouseState'
      ? { marginSummary: { accountValue: '1000000' }, assetPositions: [{ position: { coin: 'BTC', szi: b.user === A1 ? '1' : '-2', positionValue: b.user === A1 ? '80000' : '160000', entryPx: '79000', liquidationPx: '70000', unrealizedPnl: '10' } }] }
      : undefined));
    const p = body(await call(handler, 'GET', '/api/traders?op=positions'));
    expect(p.traders).toBe(2);
    expect(aggregatePositions(p.positions)[0]).toMatchObject({ coin: 'BTC', longUsd: 80000, shortUsd: 160000, longCount: 1, shortCount: 1, netUsd: -80000 });
    const n = fetchMock.mock.calls.length;
    await call(handler, 'GET', '/api/traders?op=positions');
    expect(fetchMock.mock.calls.length).toBe(n);
  });
});

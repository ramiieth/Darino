import { describe, expect, it } from 'vitest';
import type { Fill } from './types';
import { MAX_FOLLOW, followMessage, mergeSaved, positionEvents, sanitizeSaved } from './follow';
import { aggregatePositions, positionsOf } from './positions';
import { isSteady } from './summary';

const A = (c: string) => '0x' + c.repeat(40);
let tid = 0;
const fill = (coin: string, side: 'B' | 'A', sz: number, px: number, start: number, time: number, closedPnl = 0): Fill => ({
  coin, side, sz: String(sz), px: String(px), startPosition: String(start), time, closedPnl: String(closedPnl), dir: '', tid: ++tid
});

describe('آدرس‌های من', () => {
  it('پاک‌سازی: آدرس نامعتبر و تکراری حذف، حروف کوچک، سقف دنبال کردن', () => {
    const many = Array.from({ length: MAX_FOLLOW + 3 }, (_, i) => ({ address: '0x' + i.toString(16).padStart(40, '0'), follow: true }));
    const s = sanitizeSaved([{ address: A('A'), label: ' <b>نهنگ</b> ', follow: true }, { address: A('a') }, { address: 'bad' }, ...many]);
    expect(s[0]).toMatchObject({ address: A('a'), label: 'bنهنگ/b', follow: true });
    expect(s.filter((x) => x.follow)).toHaveLength(MAX_FOLLOW);
    expect(s.filter((x) => x.address === A('a'))).toHaveLength(1);
  });

  it('ادغام: حساب مرجع است و آدرس‌های تازهٔ محلی اضافه می‌شوند', () => {
    const server = sanitizeSaved([{ address: A('1'), label: 'سرور', follow: true }]);
    const local = sanitizeSaved([{ address: A('1'), label: 'محلی' }, { address: A('2') }]);
    expect(mergeSaved(server, local).map((s) => [s.address, s.label, s.follow])).toEqual([[A('1'), 'سرور', true], [A('2'), null, false]]);
  });
});

describe('رویدادهای پوزیشن برای اعلان', () => {
  it('باز کردن، بستن با سود، برگشت جهت و نادیده گرفتن تغییر کوچک', () => {
    const ev = positionEvents([
      fill('ETH', 'B', 10, 3000, 0, 1),
      fill('BTC', 'A', 2, 80000, 2, 1, 5000),
      fill('SOL', 'A', 300, 150, 100, 1, -20),
      fill('HYPE', 'B', 1, 40, 500, 1)
    ]);
    expect(ev.map((e) => [e.coin, e.kind, e.side])).toEqual([
      ['BTC', 'close', 'long'],
      ['ETH', 'open', 'long'],
      ['SOL', 'flip', 'short']
    ]);
    expect(ev[0]).toMatchObject({ usd: 160000, pnl: 5000 });
    const msg = followMessage('نهنگ', ev);
    expect(msg.title).toContain('نهنگ');
    expect(msg.body).toContain('لانگ BTC را بست @ 80,000 · سود +$5.0k');
    expect(msg.body).toContain('لانگ ETH باز کرد $30.0k @ 3,000');
  });

  it('چند fill پشت‌سرهم یک رویداد خالص می‌سازند', () => {
    const ev = positionEvents([fill('ETH', 'B', 5, 3000, 0, 1), fill('ETH', 'B', 5, 3010, 5, 2)]);
    expect(ev).toEqual([expect.objectContaining({ coin: 'ETH', kind: 'open', usd: 30100 })]);
  });
});

describe('پوزیشن‌های برترها', () => {
  const state = (coin: string, szi: number, value: number, entry: number, liq: number | null, account = 1_000_000) => ({
    marginSummary: { accountValue: String(account) },
    assetPositions: [{ position: { coin, szi: String(szi), positionValue: String(value), entryPx: String(entry), liquidationPx: liq === null ? null : String(liq), unrealizedPnl: '100', leverage: { value: 5 } } }]
  });

  it('تجمیع به تفکیک دارایی با میانگین ورود وزنی و سطوح لیکوئید مرتب بر اساس فاصله', () => {
    const p = [
      ...positionsOf(A('1'), true, state('BTC', 1, 80000, 70000, 60000)),
      ...positionsOf(A('2'), false, state('BTC', 3, 240000, 78000, 76000)),
      ...positionsOf(A('3'), true, state('BTC', -1, 80000, 85000, 95000)),
      ...positionsOf(A('4'), true, state('ETH', 10, 30000, 2900, null))
    ];
    const [btc, eth] = aggregatePositions(p);
    expect(btc).toMatchObject({ coin: 'BTC', markPx: 80000, longUsd: 320000, shortUsd: 80000, longCount: 2, shortCount: 1, netUsd: 240000 });
    expect(btc.avgEntryLong).toBeCloseTo(76000);
    expect(btc.liqLevels.map((l) => l.px)).toEqual([76000, 95000, 60000]);
    expect(btc.liqLevels[0].distancePct).toBeCloseTo(-5);
    expect(eth.liqLevels).toEqual([]);
    expect(p[0].accountPct).toBe(8);
  });
});

describe('ثابت‌قدم', () => {
  it('ماه‌های سودده، افت و مارکت‌میکر', () => {
    expect(isSteady({ months: 12, positiveMonths: 9, maxDrawdownPct: 20, makerLike: false })).toBe(true);
    expect(isSteady({ months: 12, positiveMonths: 6, maxDrawdownPct: 20, makerLike: false })).toBe(false);
    expect(isSteady({ months: 12, positiveMonths: 10, maxDrawdownPct: 70, makerLike: false })).toBe(false);
    expect(isSteady({ months: 4, positiveMonths: 4, maxDrawdownPct: 5, makerLike: false })).toBe(false);
    expect(isSteady({ months: 12, positiveMonths: 12, maxDrawdownPct: 1, makerLike: true })).toBe(false);
  });
});

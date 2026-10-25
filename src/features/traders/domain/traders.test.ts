import { describe, expect, it } from 'vitest';
import type { HlFill } from '@/features/hyperliquid/data/hyperliquidService';
import { buildRoundTrips } from './roundTrips';
import { buildReport, copyabilityOf } from './report';
import { pnlCurve, type HlPortfolio } from './portfolio';
import { parseLeaderboard, selectCandidates, isHlAddress } from './candidates';

const H = 3_600_000;
let tid = 0;
function fill(coin: string, side: 'B' | 'A', sz: number, px: number, start: number, time: number, closedPnl = 0, fee = 0): HlFill {
  return { coin, side, sz: String(sz), px: String(px), startPosition: String(start), time, closedPnl: String(closedPnl), fee: String(fee), dir: '', hash: '', tid: ++tid };
}

describe('buildRoundTrips', () => {
  it('باز و بستن چندمرحله‌ای = یک معامله با میانگین ورود و خروج', () => {
    const t = buildRoundTrips([
      fill('ETH', 'B', 1, 3000, 0, 0, 0, 1),
      fill('ETH', 'B', 1, 3100, 1, H, 0, 1),
      fill('ETH', 'A', 1, 3200, 2, 2 * H, 150, 1),
      fill('ETH', 'A', 1, 3300, 1, 3 * H, 250, 1)
    ]);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ coin: 'ETH', side: 'long', complete: true, openTime: 0, closeTime: 3 * H, entryPx: 3050, exitPx: 3250, grossPnl: 400, fees: 4, net: 396, fills: 4 });
    expect(t[0].maxNotional).toBeCloseTo(2 * 3100);
  });

  it('عبور از صفر (Long > Short): معاملهٔ اول بسته و شورت تازه باز می‌شود؛ کارمزد تقسیم می‌شود', () => {
    const t = buildRoundTrips([
      fill('BTC', 'B', 1, 100, 0, 0),
      fill('BTC', 'A', 3, 110, 1, H, 10, 3),
      fill('BTC', 'B', 2, 105, -2, 2 * H, 10, 2)
    ]);
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ side: 'long', closeTime: H, grossPnl: 10, fees: 1, net: 9, complete: true });
    expect(t[1]).toMatchObject({ side: 'short', openTime: H, closeTime: 2 * H, entryPx: 110, exitPx: 105, grossPnl: 10, fees: 4, net: 6, complete: true });
  });

  it('پوزیشنی که قبل از شروع داده باز بوده ناقص است؛ پوزیشن باز در انتها closeTime ندارد', () => {
    const t = buildRoundTrips([
      fill('SOL', 'A', 5, 150, 5, 0, 20),
      fill('SOL', 'B', 2, 140, 0, H)
    ]);
    expect(t[0]).toMatchObject({ complete: false, closeTime: 0 });
    expect(t[1]).toMatchObject({ complete: true, closeTime: null, side: 'long' });
  });

  it('fillهای هم‌زمان با زنجیرهٔ پوزیشن مرتب می‌شوند، نه tid (دادهٔ واقعی هایپرلیکوئید)', () => {
    const flip = { ...fill('BTC', 'B', 2.32955, 80761, -1.87485, 5 * H, -84), tid: 455106331023863 };
    const close = { ...fill('BTC', 'B', 0.0022, 80760, -1.87705, 5 * H, -0.15), tid: 605892418317813 };
    const t = buildRoundTrips([
      fill('BTC', 'A', 1.87925, 80000, 0, 0),
      fill('BTC', 'B', 0.0022, 80700, -1.87925, 4 * H, -0.17),
      flip,
      close,
      fill('BTC', 'A', 0.4547, 80800, 0.4547, 6 * H, 0.03)
    ]);
    expect(t).toHaveLength(2);
    expect(t.every((x) => x.complete && x.closeTime !== null && x.exitPx !== null)).toBe(true);
    expect(t.map((x) => x.side)).toEqual(['short', 'long']);
    expect(t[0].closeTime).toBe(5 * H);
  });

  it('اسپات و fill نامعتبر نادیده گرفته می‌شوند؛ ترتیب ورودی مهم نیست', () => {
    const t = buildRoundTrips([
      fill('ETH', 'A', 1, 3100, 1, H, 100),
      fill('@107', 'B', 10, 1, 0, 0),
      fill('PURR/USDC', 'B', 10, 1, 0, 0),
      fill('ETH', 'B', 0, 3000, 0, 0),
      fill('ETH', 'B', 1, 3000, 0, 0)
    ]);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ coin: 'ETH', net: 100, complete: true });
  });
});

describe('buildReport', () => {
  function trades(results: number[], holdH = 6): HlFill[] {
    return results.flatMap((pnl, i) => [fill('ETH', 'B', 1, 1000, 0, i * 24 * H), fill('ETH', 'A', 1, 1000 + pnl / 100, 1, i * 24 * H + holdH * H, pnl)]);
  }

  it('نرخ برد روی معاملهٔ کامل، نه fill', () => {
    const r = buildReport(trades([100, -50, 200, -50]), null, 4 * 24 * H);
    expect(r.closedCount).toBe(4);
    expect(r.winRate).toBe(50);
    expect(r.avgWin).toBe(150);
    expect(r.avgLoss).toBe(-50);
    expect(r.profitFactor).toBe(3);
    expect(r.expectancy).toBe(50);
    expect(r.netPnl).toBe(200);
    expect(r.maxLossStreak).toBe(1);
    expect(r.best?.net).toBe(200);
    expect(r.worst?.net).toBe(-50);
  });

  it('برد ۹۰٪ با زیان کل و ریسک دم صریحاً اعلام می‌شود', () => {
    const r = buildReport(trades([...Array(9).fill(100), -1500]), null, 10 * 24 * H);
    expect(r.winRate).toBe(90);
    expect(r.profitFactor).toBeCloseTo(0.6);
    const text = r.verdicts.map((v) => v.text).join(' ');
    expect(text).toContain('در مجموع زیان‌ده');
    expect(text).toContain('ریسک دم');
    expect(text).toContain('کافی نیست');
  });

  it('قابلیت کپی دستی از مدت نگهداری و تعداد معامله در روز', () => {
    expect(copyabilityOf(8, 1, 40)).toBe('manual');
    expect(copyabilityOf(0.2, 50, 40)).toBe('fast');
    expect(copyabilityOf(2, 8, 40)).toBe('unknown');
    expect(copyabilityOf(8, 1, 3)).toBe('unknown');
    expect(buildReport(trades(Array(40).fill(10), 8), null, 40 * 24 * H).copyability).toBe('manual');
  });

  it('رسیدن به سقف ۲۰۰۰ fill = سابقهٔ بریده', () => {
    const many = Array.from({ length: 2000 }, (_, i) => fill('ETH', i % 2 ? 'A' : 'B', 1, 1000, i % 2, i * H));
    const r = buildReport(many, null);
    expect(r.truncated).toBe(true);
    expect(r.verdicts.some((v) => v.text.includes('۲۰۰۰'))).toBe(true);
  });
});

describe('pnlCurve', () => {
  const d = (s: string) => Date.parse(s);
  const pf: HlPortfolio = [
    ['day', { accountValueHistory: [], pnlHistory: [], vlm: '0' }],
    ['perpAllTime', {
      accountValueHistory: [[d('2026-01-01'), '1000'], [d('2026-01-31'), '1500'], [d('2026-02-15'), '1200'], [d('2026-03-20'), '1800']],
      pnlHistory: [[d('2026-01-01'), '0'], [d('2026-01-31'), '500'], [d('2026-02-15'), '200'], [d('2026-03-20'), '800']],
      vlm: '0'
    }]
  ];

  it('سود ماهانه، ماه‌های سودده و افت از قله', () => {
    const c = pnlCurve(pf);
    expect(c.totalPnl).toBe(800);
    expect(c.months).toEqual([{ month: '2026-01', pnl: 500 }, { month: '2026-02', pnl: -300 }, { month: '2026-03', pnl: 600 }]);
    expect(c.positiveMonths).toBe(2);
    expect(c.maxDrawdownUsd).toBe(300);
    // TWR: +50٪ (1000→1500)، −20٪ (300/1500)، +50٪ (600/1200)
    expect(c.maxDrawdownPct).toBeCloseTo(20);
  });

  it('افت فقط در ۱۲ ماه اخیر سنجیده می‌شود', () => {
    const y = 365 * 86_400_000;
    const c = pnlCurve([['perpAllTime', {
      accountValueHistory: [[0, '1000'], [1, '10'], [2 * y, '100000'], [2 * y + 1, '95000']],
      pnlHistory: [[0, '0'], [1, '-990'], [2 * y, '99000'], [2 * y + 1, '94000']],
      vlm: '0'
    }]]);
    expect(c.maxDrawdownPct).toBeCloseTo(5);
  });

  it('واریز بزرگ درصد افت را خراب نمی‌کند', () => {
    const c = pnlCurve([['perpAllTime', {
      accountValueHistory: [[1, '10000'], [2, '9000'], [3, '1009000'], [4, '1010000']],
      pnlHistory: [[1, '0'], [2, '-1000'], [3, '-1000'], [4, '0']],
      vlm: '0'
    }]]);
    expect(c.maxDrawdownPct).toBeCloseTo(10);
    expect(c.maxDrawdownUsd).toBe(1000);
  });

  it('پاسخ خالی یا خراب', () => {
    expect(pnlCurve(null)).toMatchObject({ totalPnl: null, months: [], maxDrawdownUsd: 0, maxDrawdownPct: null });
  });
});

describe('candidates', () => {
  const row = (address: string, accountValue: number, allTime: number, month: number, monthVlm: number, name: string | null = null) => ({
    ethAddress: address,
    accountValue: String(accountValue),
    displayName: name,
    windowPerformances: [
      ['day', { pnl: '0', roi: '0', vlm: '0' }],
      ['week', { pnl: '0', roi: '0', vlm: '0' }],
      ['month', { pnl: String(month), roi: String(month / accountValue), vlm: String(monthVlm) }],
      ['allTime', { pnl: String(allTime), roi: String(allTime / accountValue), vlm: '0' }]
    ]
  });
  const a = (c: string) => '0x' + c.repeat(40);

  it('مارکت‌میکر، حساب کوچک، زیان‌ده ماه و ردیف خراب حذف؛ مرتب بر اساس سود کل', () => {
    const rows = parseLeaderboard({
      leaderboardRows: [
        row(a('1'), 500_000, 200_000, 10_000, 5_000_000, 'Good'),
        row(a('2'), 80_000_000, 9_000_000, 50_000, 33_000_000_000), // MM: turnover ~400
        row(a('3'), 50_000, 100_000, 1_000, 100_000), // small
        row(a('4'), 1_000_000, 900_000, -5_000, 10_000_000), // losing month
        row(a('5'), 2_000_000, 1_000_000, 50_000, 40_000_000),
        { ethAddress: 'bad', accountValue: '1' }
      ]
    });
    expect(rows).toHaveLength(5);
    const c = selectCandidates(rows);
    expect(c.map((x) => x.address)).toEqual([a('5'), a('1')]);
    expect(c[1].displayName).toBe('Good');
    expect(c[0].turnover).toBe(20);
  });

  it('اعتبارسنجی آدرس', () => {
    expect(isHlAddress(a('a'))).toBe(true);
    expect(isHlAddress(' ' + a('B') + ' ')).toBe(true);
    expect(isHlAddress('0x123')).toBe(false);
    expect(parseLeaderboard(null)).toEqual([]);
  });
});

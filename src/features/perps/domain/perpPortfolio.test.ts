import { describe, expect, it } from 'vitest';
import type { ArcusAccount, ArcusPosition } from '@/features/arcus/api/types';
import type { ArcusPortfolio } from '@/features/arcus/api/types';
import { arcusPeriodPnl, fromArcus, fromLighter, lighterSeriesPnl, perpTotals, positionsPnl, sumKnown, fromHlLike, hlPortfolioPnl, ledgerNetDeposits, type HlPortfolioSeries, perpInNetWorth, fromKeyed, type PerpVenueAccount } from './perpPortfolio';

const arcusPos = (o: Partial<ArcusPosition>): ArcusPosition =>
  ({ marketDisplayName: 'BTC-USD', side: 'LONG', size: '0.1', averageEntryPrice: '100000', unrealizedPnl: '25.5', markPx: '100255', ...o }) as ArcusPosition;
const arcusAcc = (equity: string, netDeposits: string) => ({ equity, netDeposits }) as ArcusAccount;

describe('perpPortfolio', () => {
  it('جمع مقادیر معلوم و پرچم ناقص', () => {
    expect(sumKnown([1, null, 2])).toEqual({ sum: 3, partial: true });
    expect(sumKnown([null])).toEqual({ sum: null, partial: true });
    expect(sumKnown([])).toEqual({ sum: null, partial: false });
  });

  it('آرکوس: سود/زیان باز، سود/زیان کل = ارزش − خالص واریز، شورت و mark صفر', () => {
    const a = fromArcus('a', 'x', arcusAcc('1200', '1000'), [arcusPos({}), arcusPos({ side: 'SHORT', size: '-2', unrealizedPnl: '-5.5', markPx: '0' })], 'ready', false);
    expect(a.unrealizedPnl).toBeCloseTo(20, 9);
    expect(a.allTimePnl).toBe(200);
    expect(a.positions[1]).toMatchObject({ side: 'short', size: 2, mark: null });
    // حساب بدون فعالیت (null) = صفر؛ هنوز دریافت‌نشده (undefined) = نامعلوم
    expect(fromArcus('a', 'x', null, [], 'ready', false)).toMatchObject({ equity: 0, unrealizedPnl: 0, allTimePnl: 0 });
    expect(fromArcus('a', 'x', undefined, null, 'loading', false)).toMatchObject({ equity: null, unrealizedPnl: null });
  });

  it('لایتر: چند زیرحساب یکی می‌شوند؛ PnL نامعلوم حدس زده نمی‌شود', () => {
    const p = { symbol: 'USO', side: 'short' as const, size: 3, entry: 145, pnl: -12.5, liquidation: 190 };
    const l = fromLighter('l', 'x', 'lighter-robinhood', [
      { index: 1, equity: 1000, available: null, assets: [], positions: [p] },
      { index: 2, equity: 250, available: null, assets: [], positions: [{ ...p, pnl: 2.5, liquidation: 0 }] }
    ], 'ready', false);
    expect(l).toMatchObject({ equity: 1250, unrealizedPnl: -10, allTimePnl: null, unit: 'USDG' });
    expect(l.positions[1].liquidation).toBeNull();
    expect(positionsPnl([{ ...p, mark: null, pnl: null }])).toBeNull();
  });

  it('جمع کل همهٔ پلتفرم‌ها', () => {
    const arcus = fromArcus('a', 'x', arcusAcc('1200', '1000'), [arcusPos({})], 'ready', false);
    const lighter = fromLighter('l', 'y', 'lighter-robinhood', [{ index: 1, equity: 500, available: null, assets: [], positions: [{ symbol: 'USO', side: 'long', size: 1, entry: 1, pnl: -5.5, liquidation: null }] }], 'ready', false);
    const t = perpTotals([arcus, lighter]);
    // سری سود/زیان لایتر هنوز نیامده → کل فقط از آرکوس و partial
    expect(t).toMatchObject({ equity: 1700, unrealizedPnl: 20, allTimePnl: 200, realizedPnl: 174.5, positions: 2, accounts: 2, partial: true });
    const loading = fromLighter('z', 'z', 'lighter-mainnet', null, 'loading', false);
    expect(perpTotals([arcus, lighter, loading])).toMatchObject({ equity: 1700, unrealizedPnl: 20, partial: true });
  });

  it('آرکوس: بسته‌شده = کل − باز؛ دوره‌ها از آخرین نقطهٔ perpDay/Week/Month', () => {
    const portfolio = { data: [
      ['totalDay', { pnlHistory: [[1, '0'], [2, '99']] }],
      ['perpDay', { pnlHistory: [[1, '0'], [2, '-8.25']] }],
      ['perpWeek', { pnlHistory: [[1, '0'], [2, '8.3']] }],
      ['perpMonth', { pnlHistory: [] }]
    ] } as unknown as ArcusPortfolio;
    expect(arcusPeriodPnl(portfolio)).toEqual({ day: -8.25, week: 8.3, month: null });
    expect(arcusPeriodPnl(null)).toEqual({ day: null, week: null, month: null });
    // همهٔ پوزیشن‌ها بسته: بسته‌شده = کل
    const closed = fromArcus('a', 'x', arcusAcc('3.8', '141.9'), [], 'ready', false, portfolio);
    expect(closed.realizedPnl).toBeCloseTo(-138.1, 9);
    expect(closed.periodPnl.day).toBe(-8.25);
    const open = fromArcus('a', 'x', arcusAcc('1200', '1000'), [arcusPos({ unrealizedPnl: '30' })], 'ready', false);
    expect(open).toMatchObject({ allTimePnl: 200, realizedPnl: 170 });
  });

  it('لایتر: trade_pnl تجمعی → کل و تغییر دوره‌ای؛ حساب جدید مبنای صفر', () => {
    const now = 1_000_000;
    const h = 3600;
    const s = {
      hourly: [[now - 8 * 86400, 50], [now - 7 * 86400, 60], [now - 86400 - h, 90], [now - 86400, 100], [now - h, 115], [now, 120]] as [number, number][],
      daily: [[now - 31 * 86400, 10], [now - 30 * 86400, 20], [now - 86400, 100], [now, 120]] as [number, number][]
    };
    expect(lighterSeriesPnl(s, now)).toEqual({ allTime: 120, day: 20, week: 60, month: 100 });
    const young = { hourly: [[now - 2 * h, 0], [now, -7]] as [number, number][], daily: [[now, -7]] as [number, number][] };
    expect(lighterSeriesPnl(young, now)).toEqual({ allTime: -7, day: -7, week: -7, month: -7 });
    expect(lighterSeriesPnl({ hourly: [], daily: [] }, now).allTime).toBeNull();
  });

  it('لایتر: زیرحساب‌ها جمع می‌شوند؛ سری نامعلوم یکی → نامعلوم', () => {
    const now = 1_000_000;
    const p = { symbol: 'ETH', side: 'long' as const, size: 1, entry: 2000, pnl: 15, liquidation: null, mark: 2015 };
    const subs = [
      { index: 1, equity: 1000, available: null, assets: [], positions: [p] },
      { index: 2, equity: 50, available: null, assets: [], positions: [] }
    ];
    const series = (v: number) => ({ hourly: [[now, v]] as [number, number][], daily: [[now, v]] as [number, number][] });
    const l = fromLighter('l', 'x', 'lighter-robinhood', subs, 'ready', false, [series(100), series(-40)], now);
    expect(l).toMatchObject({ allTimePnl: 60, unrealizedPnl: 15, realizedPnl: 45 });
    expect(l.positions[0].mark).toBe(2015);
    expect(fromLighter('l', 'x', 'lighter-robinhood', subs, 'ready', false, [series(100), undefined], now).allTimePnl).toBeNull();
    // آدرس بدون حساب = صفر
    expect(fromLighter('l', 'x', 'lighter-robinhood', [], 'ready', false, [], now)).toMatchObject({ allTimePnl: 0, realizedPnl: 0, periodPnl: { day: 0, week: 0, month: 0 } });
  });
});

describe('هایپرلیکوئید و تی‌اکس‌فلو', () => {
  const A = '0x' + '1'.repeat(40);
  const state = {
    marginSummary: { accountValue: '12000' },
    assetPositions: [
      { position: { coin: 'BTC', szi: '0.5', entryPx: '80000', positionValue: '41000', unrealizedPnl: '1000', liquidationPx: '60000' } },
      { position: { coin: 'ETH-USDC', szi: '-2', entryPx: '2400', positionValue: '4600', unrealizedPnl: '200', liquidationPx: null } },
      { position: { coin: 'SOL', szi: '0', positionValue: '0', unrealizedPnl: '0' } }
    ]
  };

  it('هایپرلیکوئید: پوزیشن‌ها، ارزش، سود/زیان کل و دوره‌ای از portfolio', () => {
    const portfolio: HlPortfolioSeries = [
      ['perpDay', { pnlHistory: [[1, '0'], [2, '150']] }],
      ['perpWeek', { pnlHistory: [[1, '0'], [2, '-300']] }],
      ['perpMonth', { pnlHistory: [[1, '0'], [2, '900']] }],
      ['perpAllTime', { pnlHistory: [[1, '0'], [2, '5000']] }]
    ];
    const a = fromHlLike('h1', 'اصلی', 'hyperliquid', A, state, 'ready', false, { portfolio });
    expect(a).toMatchObject({ venue: 'hyperliquid', address: A, equity: 12000, unrealizedPnl: 1200, allTimePnl: 5000, realizedPnl: 3800, periodPnl: { day: 150, week: -300, month: 900 } });
    expect(a.positions).toEqual([
      { symbol: 'BTC', side: 'long', size: 0.5, entry: 80000, mark: 82000, pnl: 1000, liquidation: 60000 },
      { symbol: 'ETH', side: 'short', size: 2, entry: 2400, mark: 2300, pnl: 200, liquidation: null }
    ]);
    expect(hlPortfolioPnl(null)).toEqual({ allTime: null, day: null, week: null, month: null });
  });

  it('تی‌اکس‌فلو: سود کل = ارزش − خالص واریز؛ دوره‌ای نامعلوم (حدس زده نمی‌شود)', () => {
    const ledger = [
      { time: 1, delta: { type: 'deposit', usdc: '10000' } },
      { time: 2, delta: { type: 'withdraw', usdc: '1000', fee: '1' } }
    ];
    const a = fromHlLike('t1', 'تی‌اکس', 'txflow', A, state, 'ready', false, { ledger });
    expect(ledgerNetDeposits(ledger)).toBe(8999);
    expect(a).toMatchObject({ equity: 12000, allTimePnl: 3001, realizedPnl: 1801, periodPnl: { day: null, week: null, month: null } });
  });

  it('رویداد ناشناخته در دفتر یا state دریافت‌نشده → نامعلوم، نه صفر', () => {
    expect(ledgerNetDeposits([{ time: 1, delta: { type: 'deposit', usdc: '5' } }, { time: 2, delta: { type: 'internalTransfer', usdc: '5' } }])).toBeNull();
    expect(ledgerNetDeposits(null)).toBeNull();
    const a = fromHlLike('t2', 'x', 'txflow', A, null, 'error', false);
    expect(a).toMatchObject({ equity: null, unrealizedPnl: null, allTimePnl: null, positions: [] });
    expect(perpTotals([a, fromHlLike('h', 'y', 'hyperliquid', A, state, 'ready', false)]).partial).toBe(true);
  });
});

describe('حساب‌های پرپ در ارزش کل دارایی', () => {
  const acc = (id: string, venue: PerpVenueAccount['venue'], equity: number | null, extra: Partial<PerpVenueAccount> = {}): PerpVenueAccount => ({
    id, venue, label: id, unit: 'USDC', equity, unrealizedPnl: null, allTimePnl: null, realizedPnl: null,
    periodPnl: { day: null, week: null, month: null }, positions: [], status: 'ready', stale: false, ...extra
  });

  it('همهٔ صرافی‌ها جز آرکوس (آرکوس از قبل در جمع است)', () => {
    const r = perpInNetWorth([acc('rh', 'lighter-robinhood', 1200), acc('hl', 'hyperliquid', 300), acc('ar', 'arcus', 999)], []);
    expect(r.equity).toBe(1500);
    expect(r.accounts.map((a) => a.id)).toEqual(['rh', 'hl']);
    expect(r.partial).toBe(false);
  });

  it('حسابی که کیف پول متصل همان را به‌عنوان موقعیت همان پروتکل نشان می‌دهد دوباره شمرده نمی‌شود', () => {
    const r = perpInNetWorth([acc('hl', 'hyperliquid', 300, { address: '0xAbC' })], [{ address: '0xabc', protocols: ['Hyperliquid', null] }]);
    expect(r.equity).toBeNull();
    expect(r.duplicates.map((a) => a.id)).toEqual(['hl']);
    // همان آدرس بدون موقعیت هایپرلیکوئید در Zerion ← شمرده می‌شود
    expect(perpInNetWorth([acc('hl', 'hyperliquid', 300, { address: '0xAbC' })], [{ address: '0xabc', protocols: ['Uniswap'] }]).equity).toBe(300);
  });

  it('حساب در حال دریافت: جمع ناقص علامت می‌خورد', () => {
    const r = perpInNetWorth([acc('rh', 'lighter-robinhood', 1200), acc('o', 'ondo', null, { status: 'loading' })], []);
    expect(r).toMatchObject({ equity: 1200, partial: true });
  });
});

describe('خطای حساب‌های کلیددار', () => {
  it('پیام خطای سرور به حساب می‌رسد (فقط در title برچسب «دریافت نشد»)', () => {
    expect(fromKeyed({ venue: 'ondo', error: 'HTTP 401 · invalid key' }, 'اوندو')).toMatchObject({ status: 'error', error: 'HTTP 401 · invalid key' });
  });
});

import { describe, expect, it } from 'vitest';
import { IRX_COINS, irxRows, irxSummary, irxUrl, parseIrx, parseOmpMarketId, type IrxQuote } from './irExchanges';

// پاسخ‌های واقعی (کوتاه‌شده) — ۳۱ اکتبر ۲۰۲۶
const NOBITEX = { status: 'ok', stats: {
  'usdt-rls': { isClosed: false, bestSell: '2696530', bestBuy: '2690880', latest: '2691030' },
  'btc-rls': { isClosed: false, bestSell: '208300000000', bestBuy: '208009900390', latest: '208009900300' }
} };
const WALLEX = { result: {
  ask: [{ price: 269388, quantity: 11.86, sum: '3194941.68' }, { price: 269393, quantity: 487.4 }],
  bid: [{ price: 269010, quantity: 50 }, { price: 268900, quantity: 10 }]
} };
const BITPIN = { asks: [['20840000000', '0.00247469'], ['20840057474', '0.00036487']], bids: [['20820000000', '0.01'], ['20810000000', '0.2']] };
const RAMZINEX = { data: [
  { sell: 208399999999, buy: 208000000010, base_currency_symbol: { en: 'btc' }, quote_currency_symbol: { en: 'irr' }, is_delist: 0, is_temporarily_suspended: 0 },
  { sell: 77600, buy: 77400, base_currency_symbol: { en: 'btc' }, quote_currency_symbol: { en: 'usdt' }, is_delist: 0 }
] };
const EXIR = { 'usdt-irt': { bids: [[268100, 6.36], [268000, 116.94]], asks: [[269900, 3], [270500, 10]] } };
const BIT24 = { success: true, data: { buy_orders: [{ price: '20874026519', amount: '0.11' }], sell_orders: [{ price: '20899000000', amount: '0.2' }, { price: '20880000000', amount: '0.01' }] } };
const OMP_MARKETS = { data: [
  { id: 1, baseCurrencyId: 'BTC', quoteCurrencyId: 'IRR', status: 'LISTED' },
  { id: 9, baseCurrencyId: 'BTC', quoteCurrencyId: 'USDT', status: 'LISTED' }
] };
const OMP_DEPTH = { status: 'OK', data: { bids: [['208826000000', '0.001']], asks: [['209500000000', '0.002']] } };
const ABAN = { data: [
  { symbol: 'USDT', coin_type: 'COIN', is_active: true, price_buy: '270956', price_sell: '269457' },
  { symbol: 'BTC', coin_type: 'COIN', is_active: true, price_buy: '21000173824.00000000', price_sell: '20883995328.00000000' }
] };
const OKEX = [
  { asset: 'USDT', allowBuy: true, buyAmt: '269150', sellAmt: '269150' },
  { asset: 'BTC', allowBuy: true, buyAmt: '20865544227.5', sellAmt: '20865546919' }
];
const TETHERLAND = { data: [{ symbol: 'USDT', toman_amount: 269200, price: '1.00' }] };

describe('صرافی‌های ایران: خواندن پاسخ‌ها', () => {
  it('نوبیتکس ریالی است: ÷۱۰', () => {
    expect(parseIrx('nobitex', 'USDT', NOBITEX)).toEqual({ bid: 269_088, ask: 269_653 });
    expect(parseIrx('nobitex', 'ETH', NOBITEX)).toBeNull();
  });

  it('دفترهای سفارش: بهترین‌ها با min/max، هر ترتیبی', () => {
    expect(parseIrx('wallex', 'USDT', WALLEX)).toEqual({ bid: 269_010, ask: 269_388 });
    expect(parseIrx('bitpin', 'BTC', BITPIN)).toEqual({ bid: 20_820_000_000, ask: 20_840_000_000 });
    expect(parseIrx('exir', 'USDT', EXIR)).toEqual({ bid: 268_100, ask: 269_900 });
    expect(parseIrx('bit24', 'BTC', BIT24)).toEqual({ bid: 20_874_026_519, ask: 20_880_000_000 });
    expect(parseIrx('tabdeal', 'TON', { asks: [], bids: [] })).toBeNull();
  });

  it('رمزینکس: فقط بازار ریالی، ÷۱۰', () => {
    expect(parseIrx('ramzinex', 'BTC', RAMZINEX)).toEqual({ bid: 20_800_000_001, ask: 20_839_999_999.9 });
  });

  it('او‌ام‌پی‌فینکس: شناسهٔ بازار ریالی، سپس دفتر ÷۱۰', () => {
    expect(parseOmpMarketId(OMP_MARKETS, 'BTC')).toBe(1);
    expect(parseOmpMarketId(OMP_MARKETS, 'TON')).toBeNull();
    expect(parseIrx('ompfinex', 'BTC', OMP_DEPTH)).toEqual({ bid: 20_882_600_000, ask: 20_950_000_000 });
  });

  it('قیمت‌گذارها: آبان (price_buy = خرید کاربر)، اوکی (فیلدهای جابه‌جا)، تترلند (یک قیمت)', () => {
    expect(parseIrx('abantether', 'USDT', ABAN)).toEqual({ bid: 269_457, ask: 270_956 });
    expect(parseIrx('okex', 'BTC', OKEX)).toEqual({ bid: 20_865_544_227.5, ask: 20_865_546_919 });
    expect(parseIrx('tetherland', 'USDT', TETHERLAND)).toEqual({ bid: 269_200, ask: 269_200 });
  });

  it('نشانی هر ارز ساخته می‌شود و پاسخ خراب null است', () => {
    expect(irxUrl('wallex', 'BTC')).toBe('https://api.wallex.ir/v1/depth?symbol=BTCTMN');
    expect(irxUrl('bitpin', 'USDT')).toBe('https://api.bitpin.ir/api/v1/mth/orderbook/USDT_IRT/');
    for (const c of IRX_COINS) expect(parseIrx('nobitex', c, null)).toBeNull();
    expect(parseIrx('okex', 'USDT', { error: 'x' })).toBeNull();
  });
});

describe('صرافی‌های ایران: مقایسه', () => {
  const quotes: Record<string, IrxQuote> = {
    nobitex: { bid: 269_088, ask: 269_653 },
    wallex: { bid: 269_010, ask: 269_388 },
    abantether: { bid: 269_457, ask: 270_956 },
    exir: { bid: 268_100, ask: 269_900 }
  };

  it('ارزان‌ترین خرید اول، اسپرد هر صرافی', () => {
    const rows = irxRows(quotes);
    expect(rows.map((r) => r.exchange)).toEqual(['wallex', 'nobitex', 'exir', 'abantether']);
    expect(rows[0].spread).toBeCloseTo(378 / 269_199, 6);
  });

  it('واحد اشتباه (ریال) و دفتر وارونه کنار می‌روند', () => {
    const rows = irxRows({ ...quotes, ramzinex: { bid: 2_690_000, ask: 2_700_000 }, bitpin: { bid: 280_000, ask: 269_000 } });
    expect(rows.map((r) => r.exchange)).not.toContain('ramzinex');
    expect(rows.map((r) => r.exchange)).not.toContain('bitpin');
  });

  it('خلاصه: بهترین فروش، فاصله و آربیتراژ ناخالص فقط بین دو صرافی متفاوت', () => {
    const s = irxSummary(irxRows(quotes))!;
    expect(s.cheapest.exchange).toBe('wallex');
    expect(s.bestSell.exchange).toBe('abantether');
    expect(s.gap).toBeCloseTo(270_956 / 269_388 - 1, 8);
    expect(s.arbitrage).toMatchObject({ buy: { exchange: 'wallex' }, sell: { exchange: 'abantether' } });
    expect(s.arbitrage!.gross).toBeCloseTo(269_457 / 269_388 - 1, 8);
  });

  it('بدون فرصت آربیتراژ و بدون داده', () => {
    expect(irxSummary(irxRows({ wallex: { bid: 100, ask: 101 }, nobitex: { bid: 99, ask: 102 } }))!.arbitrage).toBeNull();
    expect(irxSummary([])).toBeNull();
  });
});

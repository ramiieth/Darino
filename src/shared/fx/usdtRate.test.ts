/**
 * نرخ تتر — پارس پاسخ واقعی والکس/بیت‌پین (ساختار سپتامبر ۲۰۲۶)
 */
import { describe, it, expect } from 'vitest';
import { fetchUsdtDirect, isSaneUsdtPrice, parseBitpinTickers, parseWallexTrades } from './usdtRate';

const WALLEX = {
  result: {
    latestTrades: [
      { symbol: 'USDTTMN', quantity: '39.7', price: '233341.0000000000000000', sum: '9263637.7', isBuyOrder: true, timestamp: '2026-09-26T13:52:58Z' },
      { symbol: 'USDTTMN', quantity: '15.72', price: '233439.0000000000000000', isBuyOrder: true, timestamp: '2026-09-26T13:52:40Z' }
    ]
  },
  success: true
};
const BITPIN = [
  { symbol: 'BTC_IRT', price: '19557959233', timestamp: 1790430633.527379 },
  { symbol: 'USDT_IRT', price: '233151', daily_change_price: 0.5, timestamp: 1790430690.286708 }
];

describe('parseWallexTrades', () => {
  it('آخرین معامله USDTTMN', () => {
    expect(parseWallexTrades(WALLEX)).toEqual({ priceToman: 233341, tradedAt: Date.parse('2026-09-26T13:52:58Z') });
  });
  it('پاسخ خالی/خراب/نماد دیگر → null', () => {
    expect(parseWallexTrades({ result: { latestTrades: [] } })).toBeNull();
    expect(parseWallexTrades(null)).toBeNull();
    expect(parseWallexTrades({ result: { latestTrades: [{ symbol: 'BTCTMN', price: '1' }] } })).toBeNull();
  });
});

describe('parseBitpinTickers', () => {
  it('USDT_IRT (IRT = تومان) + زمان به میلی‌ثانیه', () => {
    expect(parseBitpinTickers(BITPIN)).toEqual({ priceToman: 233151, tradedAt: 1790430690287 });
  });
  it('بدون USDT_IRT → null', () => {
    expect(parseBitpinTickers([BITPIN[0]])).toBeNull();
    expect(parseBitpinTickers({})).toBeNull();
  });
});

describe('بازه معقول', () => {
  it('ریال (۱۰ برابر) یا صفر رد می‌شود', () => {
    expect(isSaneUsdtPrice(233151)).toBe(true);
    expect(isSaneUsdtPrice(23_315_100)).toBe(false);
    expect(isSaneUsdtPrice(0)).toBe(false);
    expect(parseBitpinTickers([{ symbol: 'USDT_IRT', price: '2331510000' }])).toBeNull();
  });
});

describe('fetchUsdtDirect', () => {
  it('HTTP خطا / JSON نامعتبر → پرتاب خطا', async () => {
    await expect(fetchUsdtDirect('bitpin', async () => new Response('x', { status: 503 }))).rejects.toThrow('HTTP 503');
    await expect(fetchUsdtDirect('bitpin', async () => new Response('[]'))).rejects.toThrow('invalid price');
  });
  it('موفق → منبع + زمان دریافت', async () => {
    const q = await fetchUsdtDirect('wallex', async () => new Response(JSON.stringify(WALLEX)));
    expect(q.source).toBe('wallex');
    expect(q.priceToman).toBe(233341);
    expect(q.fetchedAt).toBeGreaterThan(0);
  });
});

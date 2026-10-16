/**
 * تست‌های دادهٔ دلتا نوترال — پیام WebSocket فاندینگ اوندو و نرمال‌سازی بازارها
 */
import { describe, expect, it } from 'vitest';
import { normalizeOndo, parseOndoFunding, type OndoPublicMarket } from './deltaMarkets';

const update = (data: unknown) => ({ type: 'update', channel: 'fundingRatesPerps', data });

describe('parseOndoFunding — کانال عمومی fundingRatesPerps', () => {
  it('نرخ ساعتی و آخرین قیمت مارک (اولین premium)', () => {
    expect(
      parseOndoFunding(
        update([
          { market: 'MSTR-USD.P', rate: '0.0000063', premiums: [{ mark: '142.2' }, { mark: '141' }] },
          { market: 'BTC-USD.P', rate: '0.0000125', premiums: [] }
        ])
      )
    ).toEqual({ 'MSTR-USD.P': { rate: 0.0000063, mark: 142.2 }, 'BTC-USD.P': { rate: 0.0000125, mark: null } });
  });

  it('پیام‌های دیگر، بازار نامعتبر و نرخ نامعتبر نادیده گرفته می‌شوند', () => {
    expect(parseOndoFunding({ type: 'subscribed', channel: 'fundingRatesPerps', data: [] })).toEqual({});
    expect(parseOndoFunding({ type: 'error', msg: 'channel unsupported' })).toEqual({});
    expect(parseOndoFunding(null)).toEqual({});
    expect(
      parseOndoFunding(update([{ market: 'https://evil.example', rate: '0.1' }, { market: 'ETH-USD.P', rate: 'abc' }, 'x']))
    ).toEqual({});
  });
});

describe('normalizeOndo', () => {
  const market: OndoPublicMarket = {
    market: 'MSTR-USD.P',
    base: 'MSTR',
    name: 'Strategy',
    tags: ['Stock'],
    makerFee: 0.0001,
    takerFee: 0.00025,
    maxLeverage: 10,
    maintenanceMarginRate: 0.05,
    markPrice: 140
  };

  it('کارمزد کسری → ٪، دسته از برچسب، فاندینگ و قیمت زندهٔ WebSocket', () => {
    const [q] = normalizeOndo([market], { 'MSTR-USD.P': { rate: 0.0000063, mark: 142.2 } });
    expect(q).toMatchObject({
      venue: 'ondo',
      base: 'MSTR',
      category: 'equity',
      markPrice: 142.2,
      fundingHourly: 0.0000063,
      maxLeverage: 10,
      maintenanceMarginFraction: 0.05,
      volume24hUsd: null
    });
    expect(q.makerFeePct).toBeCloseTo(0.01, 12);
    expect(q.takerFeePct).toBeCloseTo(0.025, 12);
  });

  it('بدون دادهٔ WebSocket: قیمت سرور و فاندینگ نامعلوم', () => {
    const [q] = normalizeOndo([{ ...market, tags: [], makerFee: null }], {});
    expect(q.markPrice).toBe(140);
    expect(q.fundingHourly).toBeNull();
    expect(q.category).toBe('other');
    expect(q.makerFeePct).toBeNull();
  });
});

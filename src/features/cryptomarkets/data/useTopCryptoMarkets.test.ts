/**
 * تست‌ها — فالبک مقاوم بازار کریپتو (کش تازه ← زنده ← اسنپ‌شات ۲۴ ساعته)
 */
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchTopMarketsOnce,
  resetTopMarketsInFlight
} from '@/features/cryptomarkets/data/useTopCryptoMarkets';
import { cacheClearPrices, cachePutPrice } from '@/shared/lib/db';
import { cgGate } from '@/shared/lib/coingeckoGate';

const SNAPSHOT_KEY = 'crypto:top200:last';
const FRESH_KEY = 'crypto:top200';

const SAMPLE = [
  {
    id: 'bitcoin',
    symbol: 'btc',
    name: 'Bitcoin',
    current_price: 64500,
    market_cap: 1.29e12,
    price_change_percentage_24h: 0.2,
    price_change_percentage_7d_in_currency: 1.5,
    price_change_percentage_30d_in_currency: -8.4
  }
];

describe('fetchTopMarketsOnce — فالبک بازار', () => {
  beforeEach(() => {
    resetTopMarketsInFlight();
    cgGate.reset();
    vi.unstubAllGlobals();
  });

  afterEach(async () => {
    resetTopMarketsInFlight();
    vi.unstubAllGlobals();
    await cacheClearPrices();
  });

  it('کش تازه (۶۰ ثانیه) → بدون درخواست شبکه', async () => {
    await cachePutPrice(FRESH_KEY, {
      price: SAMPLE as unknown as number,
      source: 'live',
      fetchedAt: Date.now()
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchTopMarketsOnce();
    expect(res.stale).toBe(false);
    expect(res.data[0].symbol).toBe('btc');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('شکست شبکه → اسنپ‌شات موفق قبلی با برچسب stale (نه خطا)', async () => {
    await cachePutPrice(SNAPSHOT_KEY, {
      price: SAMPLE as unknown as number,
      source: 'live',
      fetchedAt: Date.now() - 2 * 60 * 60 * 1000 // ۲ ساعت پیش
    });
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchTopMarketsOnce();
    expect(res.stale).toBe(true);
    expect(res.data[0].current_price).toBe(64500);
    expect(res.fetchedAt).toBeLessThan(Date.now());
  });

  it('شکست شبکه → اسنپ‌شات منقضی (>۷ روز) → خطا', async () => {
    await cachePutPrice(SNAPSHOT_KEY, {
      price: SAMPLE as unknown as number,
      source: 'live',
      fetchedAt: Date.now() - 8 * 24 * 60 * 60 * 1000
    });
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchTopMarketsOnce()).rejects.toThrow('no market data available');
  });

  it('بدون هیچ کشی + شکست شبکه → خطا', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchTopMarketsOnce()).rejects.toThrow('no market data available');
  });

  it('موفقیت شبکه → هم کش تازه و هم اسنپ‌شات ذخیره میشود', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(SAMPLE), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchTopMarketsOnce();
    expect(res.stale).toBe(false);
    expect(res.data).toHaveLength(1);

    // شبیه‌سازی گذشت ۷۰ ثانیه: کش تازه منقضی میشود ولی اسنپ‌شات می‌ماند
    await cachePutPrice(FRESH_KEY, {
      price: SAMPLE as unknown as number,
      source: 'live',
      fetchedAt: Date.now() - 70_000
    });
    cgGate.reset(); // ریست صف سراسری بین دو بخش تست
    const fetchMock2 = vi.fn().mockRejectedValue(new Error('rate limited'));
    vi.stubGlobal('fetch', fetchMock2);
    resetTopMarketsInFlight();
    const res2 = await fetchTopMarketsOnce();
    expect(res2.stale).toBe(true);
    expect(res2.data[0].id).toBe('bitcoin');
  });
});

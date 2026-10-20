/**
 * Hyperliquid: نرمال‌سازی بازارهای اصلی و HIP-3، کارمزد با فرمول رسمی، انتخاب یک بازار برای هر دارایی،
 * فاندینگ تسویه‌شده با صفحه‌بندی و دفتر سفارش
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchHyperliquidBook,
  fetchHyperliquidFundingHistory,
  hip3FeeScale,
  normalizeHyperliquidDex,
  parseHyperliquidBook,
  parseHyperliquidFundings,
  pickPerBase,
  type HyperliquidMarket
} from './hyperliquidMarkets';

const ctx = (funding: string, markPx: string, dayNtlVlm: string) => ({ funding, markPx, oraclePx: markPx, dayNtlVlm, openInterest: '1' });

describe('normalizeHyperliquidDex', () => {
  it('بازار اصلی: کارمزد پایه، مارجین نگهداری = ۱ ÷ (۲ × اهرم)، بازار حذف‌شده کنار می‌رود', () => {
    const list = normalizeHyperliquidDex(null, [
      {
        universe: [
          { name: 'BTC', maxLeverage: 40 },
          { name: 'OLD', maxLeverage: 3, isDelisted: true }
        ]
      },
      [ctx('0.0000125', '100000', '5000000'), ctx('0.001', '1', '1')]
    ]);
    expect(list).toHaveLength(1);
    const btc = list[0];
    expect(btc).toMatchObject({ coin: 'BTC', dex: null, base: 'BTC', category: 'crypto', markPrice: 100000, maxLeverage: 40, volume24hUsd: 5000000 });
    expect(btc.fundingHourly).toBeCloseTo(0.0000125, 12);
    expect(btc.takerFeePct).toBeCloseTo(0.045, 12);
    expect(btc.makerFeePct).toBeCloseTo(0.015, 12);
    expect(btc.maintenanceMarginFraction).toBeCloseTo(1 / 80, 12);
  });

  it('HIP-3: نام بدون پیشوند DEX، کارمزد × ضریب سازنده، growth mode = ۹۰٪ تخفیف', () => {
    const list = normalizeHyperliquidDex('xyz', [
      {
        universe: [
          { name: 'xyz:TSLA', maxLeverage: 10, deployerFeeScale: '1.0', growthMode: 'enabled' },
          { name: 'xyz:BB', maxLeverage: 10, deployerFeeScale: '0.5' }
        ]
      },
      [ctx('0.00001', '366', '1000000'), ctx('-0.0001', '8', '2000000')]
    ]);
    const [tsla, bb] = list;
    expect(tsla).toMatchObject({ coin: 'xyz:TSLA', dex: 'xyz', base: 'TSLA', category: 'other' });
    expect(tsla.takerFeePct).toBeCloseTo(0.045 * 2 * 0.1, 12);
    expect(bb.base).toBe('BB');
    expect(bb.takerFeePct).toBeCloseTo(0.045 * 1.5, 12);
    expect(bb.makerFeePct).toBeCloseTo(0.015 * 1.5, 12);
  });

  it('پاسخ نامعتبر → خالی', () => {
    expect(normalizeHyperliquidDex(null, null)).toEqual([]);
    expect(normalizeHyperliquidDex(null, [{}])).toEqual([]);
  });
});

describe('hip3FeeScale (فرمول رسمی)', () => {
  it('کمتر از ۱ → ضریب + ۱؛ ۱ و بیشتر → ۲ × ضریب؛ نامعلوم → ۲ (محافظه‌کارانه)', () => {
    expect(hip3FeeScale(0)).toBe(1);
    expect(hip3FeeScale(0.5)).toBe(1.5);
    expect(hip3FeeScale(1)).toBe(2);
    expect(hip3FeeScale(3)).toBe(6);
    expect(hip3FeeScale(null)).toBe(2);
  });
});

describe('pickPerBase — یک بازار برای هر دارایی', () => {
  const m = (coin: string, dex: string | null, volume: number): HyperliquidMarket => ({
    coin,
    dex,
    base: coin.split(':').pop()!.toUpperCase(),
    nameFa: coin,
    category: dex ? 'other' : 'crypto',
    markPrice: 1,
    fundingHourly: 0,
    maxLeverage: 3,
    maintenanceMarginFraction: 1 / 6,
    takerFeePct: 0.045,
    makerFeePct: 0.015,
    volume24hUsd: volume
  });

  it('بازار اصلی بر HIP-3 مقدم است، حتی کم‌حجم‌تر', () => {
    const out = pickPerBase([m('flx:BTC', 'flx', 9e9), m('BTC', null, 1e6)]);
    expect(out.map((x) => x.coin)).toEqual(['BTC']);
  });

  it('بین چند HIP-3 پرحجم‌ترین انتخاب و فهرست بر اساس حجم مرتب می‌شود', () => {
    const out = pickPerBase([m('km:TSLA', 'km', 1e5), m('xyz:TSLA', 'xyz', 2e8), m('ETH', null, 3e8)]);
    expect(out.map((x) => x.coin)).toEqual(['ETH', 'xyz:TSLA']);
  });
});

describe('فاندینگ و دفتر سفارش', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fundingHistory: کسری ساعتی، ردیف خراب کنار می‌رود', () => {
    const pts = parseHyperliquidFundings([
      { coin: 'BTC', fundingRate: '0.0000125', premium: '0', time: 1_792_321_200_068 },
      { coin: 'BTC', fundingRate: 'x', time: 1 }
    ]);
    expect(pts).toEqual([{ hour: 1_792_321_200_000, rate: 0.0000125 }]);
  });

  it('صفحه‌بندی: ۵۰۰ ردیف → صفحهٔ بعد از آخرین زمان + ۱', async () => {
    const bodies: Record<string, unknown>[] = [];
    const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ coin: 'xyz:BB', fundingRate: '0.00001', time: from + i * 3_600_000 }));
    const first = page(1_000_000_000_000, 500);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        bodies.push(body);
        return new Response(JSON.stringify(bodies.length === 1 ? first : page(first[499].time + 3_600_000, 20)), { status: 200 });
      })
    );
    const pts = await fetchHyperliquidFundingHistory('xyz:BB', 1_000_000_000_000);
    expect(pts).toHaveLength(520);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({ type: 'fundingHistory', coin: 'xyz:BB', startTime: 1_000_000_000_000 });
    expect(bodies[1].startTime).toBe(first[499].time + 1);
  });

  it('نام بازار نامعتبر هرگز ارسال نمی‌شود', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(fetchHyperliquidFundingHistory('BTC"}', 0)).rejects.toThrow('invalid market');
    await expect(fetchHyperliquidBook('../x')).rejects.toThrow('invalid market');
    expect(f).not.toHaveBeenCalled();
  });

  it('l2Book: [bids, asks] مرتب با قیمت وسط', () => {
    const b = parseHyperliquidBook({
      coin: 'BTC',
      levels: [
        [
          { px: '99', sz: '1', n: 1 },
          { px: '100', sz: '2', n: 1 }
        ],
        [
          { px: '102', sz: '1', n: 1 },
          { px: '101', sz: '0', n: 1 }
        ]
      ]
    });
    expect(b.bids.map((l) => l.price)).toEqual([100, 99]);
    expect(b.asks).toEqual([{ price: 102, size: 1 }]);
    expect(b.mid).toBe(101);
  });
});

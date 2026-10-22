/**
 * تست‌های نرمال‌سازی تاریخچهٔ فاندینگ و دفتر سفارش سه صرافی + انتخاب جهت از میانگین ۷ روز
 */
import { describe, expect, it } from 'vitest';
import { floorHour } from '@/features/calculators/domain';
import {
  buildOpportunity,
  parseArcusFundings,
  parseLighterBook,
  parseLighterFundings,
  parseOndoFundings,
  parseTupleBook,
  parseTxflowBook
} from './fundingHistory';
import type { VenueQuote } from './deltaMarkets';

describe('تاریخچهٔ فاندینگ → کسری ساعتی، مثبت = لانگ می‌پردازد', () => {
  it('Lighter: rate درصدی است و direction=short یعنی نرخ منفی', () => {
    const pts = parseLighterFundings({
      fundings: [
        { timestamp: 1792245600, value: '0.98', rate: '0.0012', direction: 'long' },
        { timestamp: 1792249200, value: '0.01', rate: '0.0001', direction: 'short' },
        { timestamp: 'x', rate: '0.1', direction: 'long' }
      ]
    });
    expect(pts).toHaveLength(2);
    expect(pts[0].hour).toBe(1792245600_000);
    expect(pts[0].rate).toBeCloseTo(0.000012, 15);
    expect(pts[1].rate).toBeCloseTo(-0.000001, 15);
  });

  it('Arcus: زمان میکروثانیه (رشتهٔ حفظ‌شدهٔ BigInt) و نرخ ساعتی کسری', () => {
    const pts = parseArcusFundings({
      fundingRates: [
        { fundingRate: '0.0000125', time: '1792245600000000' },
        { fundingRate: '0.0000125', time: 1792242000000000 },
        { fundingRate: 'bad', time: '1792242000000000' },
        { fundingRate: '0.1', time: '12' }
      ]
    });
    expect(pts).toEqual([
      { hour: 1792245600_000, rate: 0.0000125 },
      { hour: 1792242000_000, rate: 0.0000125 }
    ]);
  });

  it('Ondo (خروجی سرور دارینو)', () => {
    expect(parseOndoFundings({ rates: [{ t: 1792245600_007, r: 0.0000119 }, { t: null, r: 1 }] })).toEqual([
      { hour: floorHour(1792245600_007), rate: 0.0000119 }
    ]);
    expect(parseOndoFundings(null)).toEqual([]);
  });
});

describe('دفتر سفارش', () => {
  it('Lighter: سفارش‌های تکی، مرتب از بهترین قیمت و قیمت وسط', () => {
    const b = parseLighterBook({
      asks: [{ price: '101', remaining_base_amount: '1' }, { price: '100.5', remaining_base_amount: '2' }],
      bids: [{ price: '99', remaining_base_amount: '1' }, { price: '99.5', remaining_base_amount: '0' }, { price: '100', remaining_base_amount: '3' }]
    });
    expect(b.asks.map((l) => l.price)).toEqual([100.5, 101]);
    expect(b.bids.map((l) => l.price)).toEqual([100, 99]);
    expect(b.mid).toBeCloseTo(100.25, 12);
  });

  it('Arcus/Ondo: تاپل [قیمت، حجم]؛ سطح نامعتبر حذف', () => {
    const b = parseTupleBook({ bids: [['81426.6', '0.9'], ['x', '1']], asks: [['81426.7', '0.09']] });
    expect(b.bids).toEqual([{ price: 81426.6, size: 0.9 }]);
    expect(b.mid).toBeCloseTo(81426.65, 9);
    expect(parseTupleBook({}).mid).toBeNull();
  });
});

describe('buildOpportunity — جهت از میانگین ۷ روز، نه نرخ لحظه‌ای', () => {
  const quote = (venue: VenueQuote['venue'], fundingHourly: number): VenueQuote => ({
    venue,
    ref: venue === 'lighter' ? '1' : 'BTC-USD',
    base: 'BTC',
    display: 'BTC-USD',
    nameFa: 'بیت‌کوین',
    category: 'crypto',
    markPrice: 100,
    fundingHourly,
    makerFeePct: 0,
    takerFeePct: 0,
    maxLeverage: 10,
    maintenanceMarginFraction: 0.03,
    volume24hUsd: null
  });
  const NOW = Date.UTC(2026, 9, 17, 12);
  const hours = (rate: number) => Array.from({ length: 168 }, (_, i) => ({ hour: floorHour(NOW) - i * 3_600_000, rate }));

  it('الان A گران‌تر است ولی در ۷ روز B گران‌تر بوده → Short روی B', () => {
    const a = quote('lighter', 0.00005);
    const b = quote('arcus', 0.00001);
    const o = buildOpportunity(a, b, hours(0.00001), hours(0.00003), NOW);
    expect(o.short.venue).toBe('arcus');
    expect(o.long.venue).toBe('lighter');
    expect(o.projectedFrom).toBe('avg7d');
    expect(o.projectedHourly).toBeCloseTo(0.00002, 12);
    expect(o.currentApr).toBeCloseTo((0.00001 - 0.00005) * 8760 * 100, 9); // الان به ضرر همین جهت
    expect(o.stability).toBe('high');
  });

  it('بدون تاریخچهٔ کافی → نرخ لحظه‌ای با برچسب', () => {
    const o = buildOpportunity(quote('lighter', 0.00005), quote('arcus', 0.00001), undefined, undefined, NOW);
    expect(o.short.venue).toBe('lighter');
    expect(o.projectedFrom).toBe('current');
    expect(o.stability).toBe('unknown');
    expect(o.projectedHourly).toBeCloseTo(0.00004, 12);
  });
});

describe('لایتر و لایتر رابین‌هود: فاندینگ جدا', () => {
  it('تاریخچهٔ هر کدام از سرور خودش؛ هرگز مخلوط نمی‌شوند', async () => {
    const { vi } = await import('vitest');
    const { fetchFundingHistory } = await import('./fundingHistory');
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      urls.push(String(u));
      const rate = String(u).includes('api.rh.lighter.xyz') ? '0.0004' : '0.0012';
      return new Response(JSON.stringify({ code: 200, fundings: [{ timestamp: 1_792_321_200, value: '1', rate, direction: 'long' }] }), { status: 200 });
    }));
    const rh = await fetchFundingHistory('lighterRh', '12');
    const main = await fetchFundingHistory('lighter', '12');
    expect(urls[0]).toContain('api.rh.lighter.xyz');
    expect(urls[1]).toContain('mainnet.zklighter.elliot.ai');
    expect(rh[0].rate).not.toBe(main[0].rate);
    vi.unstubAllGlobals();
  });
});

describe('فارم پوینت: جفت‌ها و نامزدها', () => {
  const q = (venue: VenueQuote['venue'], base: string, fundingHourly: number, volume24hUsd: number | null): VenueQuote => ({
    venue,
    ref: base,
    base,
    display: base,
    nameFa: base,
    category: 'crypto',
    markPrice: 100,
    fundingHourly,
    makerFeePct: 0,
    takerFeePct: 0,
    maxLeverage: 10,
    maintenanceMarginFraction: 0.05,
    volume24hUsd
  });
  const book = (quotes: VenueQuote[]) => ({ status: 'ready' as const, quotes });

  it('farmPairs: صرافی پوینت در یک طرف، همهٔ صرافی‌های دیگر در طرف دیگر', async () => {
    const { farmPairs } = await import('./fundingHistory');
    expect(farmPairs('arcus')).toEqual([
      ['arcus', 'ondo'],
      ['arcus', 'lighter'],
      ['arcus', 'lighterRh'],
      ['arcus', 'hyperliquid'],
      ['arcus', 'qfex'],
      ['arcus', 'txflow']
    ]);
    expect(farmPairs('lighterRh').every(([a, b]) => a === 'lighterRh' && b !== 'lighterRh')).toBe(true);
  });

  it('حالت farm: بازار کم‌حجم کنار می‌رود و نیمی از فهرست پرحجم‌ترین‌هاست، نه فقط بیشترین اختلاف', async () => {
    const { pickCandidates } = await import('./fundingHistory');
    const books = {
      arcus: book([q('arcus', 'SPIKE', 0.01, 50_000), q('arcus', 'HOT', 0.0002, 2e6), q('arcus', 'BTC', 0.00001, 9e8), q('arcus', 'ETH', 0.00001, 5e8)]),
      hyperliquid: book([q('hyperliquid', 'SPIKE', 0, 9e6), q('hyperliquid', 'HOT', 0, 3e6), q('hyperliquid', 'BTC', 0.000012, 2e9), q('hyperliquid', 'ETH', 0.000011, 1e9)]),
      ondo: book([]),
      lighter: book([]),
      lighterRh: book([]),
      qfex: book([]),
      txflow: book([])
    };
    const pairs = [['arcus', 'hyperliquid']] as const;
    expect(pickCandidates(books, 2, pairs, 'spread').map((c) => c.base)).toEqual(['SPIKE', 'HOT']);
    expect(pickCandidates(books, 2, pairs, 'farm').map((c) => c.base)).toEqual(['HOT', 'BTC']);
  });

  it('دفتر سفارش لایتر رابین‌هود از سرور خودش', async () => {
    const { vi } = await import('vitest');
    const { fetchOrderBook } = await import('./fundingHistory');
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string) => {
        urls.push(String(u));
        return new Response(JSON.stringify({ bids: [{ price: '99', remaining_base_amount: '1' }], asks: [{ price: '101', remaining_base_amount: '1' }] }), { status: 200 });
      })
    );
    const b = await fetchOrderBook('lighterRh', '16');
    expect(urls[0]).toContain('api.rh.lighter.xyz/api/v1/orderBookOrders');
    expect(b.mid).toBe(100);
    vi.unstubAllGlobals();
  });
});

describe('کیوفکس و تی‌اکس‌فلو', () => {
  it('دفتر TxFlow: levels = [bids, asks]، سطح خالی حذف', () => {
    const b = parseTxflowBook({ levels: [[{ px: '99', sz: '1', n: 1 }, { px: '98', sz: '0', n: 0 }], [{ px: '101', sz: '2', n: 1 }]] });
    expect(b.bids).toEqual([{ price: 99, size: 1 }]);
    expect(b.asks).toEqual([{ price: 101, size: 2 }]);
    expect(b.mid).toBe(100);
    expect(parseTxflowBook({ message: 'invalid request' }).mid).toBeNull();
  });

  it('TxFlow تاریخچهٔ عمومی ندارد (بدون درخواست)؛ QFEX از پروکسی خودش، نه اوندو', async () => {
    const { vi } = await import('vitest');
    const { fetchFundingHistory, fetchOrderBook } = await import('./fundingHistory');
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string, init?: RequestInit) => {
        calls.push({ url: String(u), init });
        const body = String(u).includes('qfex-perps-history')
          ? { market: 'AAPL-USD', rates: [{ t: 1792245600_000, r: 0.000003 }] }
          : String(u).includes('qfex-perps-depth')
            ? { bids: [[99, 1]], asks: [[101, 1]] }
            : { levels: [[{ px: '9', sz: '1' }], [{ px: '11', sz: '1' }]] };
        return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
      })
    );
    expect(await fetchFundingHistory('txflow', '59')).toEqual([]);
    expect(calls).toHaveLength(0);
    expect(await fetchFundingHistory('qfex', 'AAPL-USD')).toEqual([{ hour: 1792245600_000, rate: 0.000003 }]);
    expect(calls[0].url).toContain('op=qfex-perps-history&market=AAPL-USD');
    expect((await fetchOrderBook('qfex', 'AAPL-USD')).mid).toBe(100);
    expect(calls[1].url).toContain('op=qfex-perps-depth');
    expect((await fetchOrderBook('txflow', '59')).mid).toBe(10);
    expect(calls[2].url).toBe('https://rpc.txflow.com/info');
    expect(JSON.parse(String(calls[2].init?.body))).toEqual({ type: 'l2Book', coin: '59' });
    await expect(fetchOrderBook('txflow', '1&x')).rejects.toThrow('invalid market');
    vi.unstubAllGlobals();
  });
});

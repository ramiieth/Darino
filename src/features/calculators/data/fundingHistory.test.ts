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
  parseTupleBook
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

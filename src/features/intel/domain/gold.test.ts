import { describe, expect, it } from 'vitest';
import { PURE_GRAMS, decompose, intrinsicToman, parseQuote, parseTgjuHistory, percentileOf, platformRows, platformsVsBazaar, premiumSeries, premiumStats, pureValueToman, valuation, type DayClose } from './gold';

// پاسخ‌های واقعی (کوتاه‌شده) که از شبکهٔ Vercel در ۲۷ اکتبر ۲۰۲۶ گرفته شد
const MILLI = { code: 0, data: { date: '2026-10-27T19:07:00', price18: 259180 }, message: 'ok' };
const WALLGOLD = { result: [
  { symbol: 'GLD_18C_750TMN', side: 'buy', price: '26006000' },
  { symbol: 'GLD_18C_750TMN', side: 'sell', price: '25850000' },
  { symbol: 'GLD_24C_TMN', side: 'buy', price: '34000000' }
] };
const MELLIGOLD = { message: 'Success', data: { price_buy: 26069654, price_sell: 26069654 } };
const DARIC = { Data: { BestBuyPrice: '26020601', BestSellPrice: '26154996' }, IsSuccess: true };
const TGJU = { recordsFiltered: 2, data: [
  ['2,704,600', '2,704,600', '2,727,100', '2,715,000', '<span class="high">1</span>', '<span>0.1%</span>', '2026/10/26', '1405/08/04'],
  ['2,700,000', '2,690,000', '2,710,000', '2,705,500', '-', '-', '2026/10/25', '1405/08/03']
] };

describe('طلای ایران: خواندن پاسخ‌ها', () => {
  it('میلی: ریال در میلی‌گرم ×۱۰۰ = تومان در گرم، یک قیمت', () => {
    expect(parseQuote('milli', MILLI)).toEqual({ buy: 25_918_000, sell: 25_918_000 });
  });

  it('وال‌گلد: فقط نماد ۱۸ عیار', () => {
    expect(parseQuote('wallgold', WALLGOLD)).toEqual({ buy: 26_006_000, sell: 25_850_000 });
  });

  it('دریک: کاربر به بهترین پیشنهاد فروش می‌خرد', () => {
    expect(parseQuote('daric', DARIC)).toEqual({ buy: 26_154_996, sell: 26_020_601 });
    expect(parseQuote('melligold', MELLIGOLD)).toEqual({ buy: 26_069_654, sell: 26_069_654 });
  });

  it('پاسخ خراب یا واحد اشتباه: بدون قیمت', () => {
    expect(parseQuote('milli', { code: 1, data: { price18: 259180 } })).toBeNull();
    expect(parseQuote('milli', { code: 0, data: { price18: 2591 } })).toBeNull();
    expect(parseQuote('daric', { Data: { BestBuyPrice: '0', BestSellPrice: '26154996' } })).toBeNull();
    expect(parseQuote('wallgold', null)).toBeNull();
  });

  it('tgju: بستهٔ روز با تاریخ میلادی، صعودی', () => {
    expect(parseTgjuHistory(TGJU)).toEqual([
      { t: Date.UTC(2026, 9, 25), close: 2_705_500 },
      { t: Date.UTC(2026, 9, 26), close: 2_715_000 }
    ]);
    expect(parseTgjuHistory({ data: [['x']] })).toEqual([]);
  });
});

describe('طلای ایران: حباب', () => {
  it('ارزش طلای خالص: ۱۸ عیار ۰.۷۵ گرم، سکهٔ امامی ۷.۳۲ گرم', () => {
    expect(intrinsicToman(4058.9, 269_787)).toBeCloseTo(pureValueToman(PURE_GRAMS.geram18, 4058.9, 269_787), 6);
    expect(pureValueToman(PURE_GRAMS.sekee, 31.1034768, 1)).toBeCloseTo(7.3224, 9);
  });

  it('سری حباب: انس آخرین مقدار تا همان روز، دلار همان روز، دادهٔ خراب کنار', () => {
    const d = (t: number, close: number): DayClose => ({ t, close });
    const ounce = [d(0, 31.1034768)];
    const dollar = [d(1, 100), d(2, 100), d(3, 100)];
    const gold = [d(1, 75), d(2, 78), d(3, 500), d(4, 75)];
    expect(premiumSeries(gold, ounce, dollar, 0.75)).toEqual([d(1, 0), { t: 2, close: expect.closeTo(0.04, 9) }]);
  });

  it('توزیع: فقط با دست‌کم ۲۵۰ روز', () => {
    const s = Array.from({ length: 300 }, (_, i) => ({ t: i, close: (i - 150) / 1000 }));
    expect(premiumStats(s)).toMatchObject({ p10: -0.12, p50: 0, p90: 0.12, days: 300, since: 0 });
    expect(premiumStats(s.slice(0, 100))).toBeNull();
    expect(percentileOf(-0.13, premiumStats(s)!)).toBe('low');
    expect(percentileOf(0, premiumStats(s)!)).toBe('mid');
  });

  it('ارزان/گران: بیرون از p10–p90 و بیشتر از هزینه', () => {
    const rows = platformRows({ milli: { buy: 100, sell: 100 } }, 100);
    const stats = { p10: -0.025, p50: 0.003, p90: 0.031, days: 3442, since: 0 };
    expect(valuation(0.0034, rows, stats).state).toBe('fair'); // ۲۷ اکتبر با دلار آزاد
    expect(valuation(-0.03, rows, stats).state).toBe('cheap');
    expect(valuation(0.04, rows, stats).state).toBe('rich');
    expect(valuation(null, rows, stats).state).toBe('unknown');
  });

  it('با تتر (بدون دلار آزاد): آستانهٔ گشادتر، تاریخچه کنار', () => {
    const rows = platformRows({ milli: { buy: 99, sell: 99 }, wallgold: { buy: 98, sell: 98 } }, 100);
    const v = valuation(-0.0157, rows, { p10: -0.01, p50: 0, p90: 0.01, days: 300, since: 0 }, 'usdt');
    expect(v.state).toBe('fair');
    expect(v.low).toBeCloseTo(-0.025, 9);
  });

  it('فاصلهٔ پلتفرم‌ها با بازار (۲۷ اکتبر: حدود ۱.۵٪ ارزان‌تر)', () => {
    const rows = platformRows({ milli: { buy: 25_917_000, sell: 25_917_000 }, daric: { buy: 26_028_847, sell: 26_028_847 } }, null);
    expect(platformsVsBazaar(rows, 26_363_600)).toBeCloseTo(-0.015, 3);
    expect(platformsVsBazaar(rows, null)).toBeNull();
  });

  it('حباب هر پلتفرم از میانهٔ خرید و فروش؛ مرتب از ارزان‌ترین خرید', () => {
    const rows = platformRows({ daric: { buy: 102, sell: 98 }, milli: { buy: 99, sell: 99 } }, 100);
    expect(rows.map((r) => r.platform)).toEqual(['milli', 'daric']);
    expect(rows[1].spread).toBeCloseTo(0.04, 9);
    expect(rows[0].premium).toBeCloseTo(-0.01, 9);
  });

  it('تجزیهٔ رشد: ایران = انس × دلار × حباب', () => {
    const d = decompose(30, [100, 121], [100, 110], [100, 110]);
    expect(d.iran).toBeCloseTo(0.21, 9);
    expect(d.premium).toBeCloseTo(0, 9);
    expect(decompose(7, [100, 105], [100, 100], [100, 100]).premium).toBeCloseTo(0.05, 9);
  });
});

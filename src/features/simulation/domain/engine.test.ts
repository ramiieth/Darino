/**
 * تست‌های واحد — موتور محاسبات و قالب‌بندی (ممیزی §۱۳: تست خودکار)
 * اجرا: npm test
 */
import { describe, expect, it } from 'vitest';
import { computeValue, computeProfitLoss, computeVsEth, computeEthBenchmark } from '@/shared/utils/math';
import { renderRow, buildTimeline, resolveTokenizedPrice, resolvePrice, isPlausibleTokenizedPrice } from '@/features/simulation/domain/engine';
import { fmtUSD, fmtPct, fmtToman, fmtNum } from '@/shared/utils/formatters';

describe('math', () => {
  it('Value = (Base / Buy) × Current', () => {
    expect(computeValue(32_516.6, 3335, 1875)).toBeCloseTo((32_516.6 / 3335) * 1875, 6);
    expect(computeValue(32_516.6, null, 100)).toBeNull();
    expect(computeValue(32_516.6, 100, null)).toBeNull();
  });

  it('Profit/Loss = Value − Base', () => {
    expect(computeProfitLoss(36_900, 32_516.6)).toBeCloseTo(4_383.4, 6);
    expect(computeProfitLoss(null, 100)).toBeNull();
  });

  it('Vs ETH = Value − (Base/Ref)×Live', () => {
    const bench = computeEthBenchmark(32_516.6, 3335, 1875);
    expect(bench).not.toBeNull();
    expect(bench).toBeCloseTo((32_516.6 / 3335) * 1875, 6);
    expect(computeVsEth(36_900, bench)).toBeCloseTo(36_900 - (bench as number), 6);
    expect(computeVsEth(36_900, null)).toBeNull();
  });
});

describe('renderRow (الگوی الزامی امن)', () => {
  it('قیمت null → همه ستون‌ها N/A بدون حذف ردیف', () => {
    const r = renderRow('SOLSTICE', 0.52, null, 32_516.6, 18_300);
    expect(r.asset).toBe('SOLSTICE');
    expect(r.currentPrice).toBe('N/A');
    expect(r.value).toBe('N/A');
    expect(r.profitLoss).toBe('N/A');
    expect(r.vsEth).toBe('N/A');
  });

  it('قیمت معتبر → محاسبه با فرمت $ لاتین', () => {
    const r = renderRow('ETH', 3335, 1875, 32_516.6, 18_300);
    expect(r.value).toMatch(/^\$[\d,]+\.\d{2}$/);
    expect(r.currentPrice).toBe('$1,875.00');
  });
});

describe('engine (پوشش کامل)', () => {
  it('بازه ۱: ۳۲ رمزارز + ۷۳ سنتی = ۱۰۵ ردیف، بدون توکن‌ایز', () => {
    const r = buildTimeline({
      timeline: 1,
      liveCrypto: null,
      liveStocks: null,
      tokenizedPrices: null,
      ethLivePrice: null
    });
    expect(r.rows.length).toBe(105);
    expect(r.rows.every((row) => row.kind !== 'tokenized')).toBe(true);
    // اوراق دولتی با واحد درصد و ارزش N/A
    const us10y = r.rows.find((x) => x.symbol === 'US10Y');
    expect(us10y?.unit).toBe('pct');
    expect(us10y?.valueUsd).toBeNull();
    expect(us10y?.changePct).not.toBeNull();
    // کالاهای جدید حضور دارند
    expect(r.rows.some((x) => x.symbol === 'WTI')).toBe(true);
    expect(r.rows.some((x) => x.symbol === 'EWJ')).toBe(true);
  });

  it('بازه ۲: ۳۲ + ۱۳۵ + ۷۳ = ۲۴۰ ردیف', () => {
    const r = buildTimeline({
      timeline: 2,
      liveCrypto: null,
      liveStocks: null,
      tokenizedPrices: null,
      ethLivePrice: null
    });
    expect(r.rows.length).toBe(240);
    expect(r.rows.filter((x) => x.kind === 'tokenized').length).toBe(135);
    expect(r.rows.filter((x) => x.kind === 'tradfi').length).toBe(73);
  });

  it('اسنپ‌شات توکن‌ایز فقط ۱ ژوئیه ۲۰۲۶', () => {
    expect(resolveTokenizedPrice('COHRON', null).price).toBe(367.71);
    expect(resolveTokenizedPrice('COHRON', { COHRON: 336.14 }).price).toBe(336.14);
    expect(resolveTokenizedPrice('COHRON', { COHRON: 336.14 }).source).toBe('live');
    // هیچ فالبک غیر از ۱ ژوئیه ۲۰۲۶ وجود ندارد
    expect(resolvePrice('NOTHING', null).price).toBeNull();
  });
});

describe('formatters (سیاست نمایش مالی)', () => {
  it('قیمت‌ها لاتین با $', () => {
    expect(fmtUSD(36_900)).toBe('$36,900.00');
  });
  it('درصد لاتین با علامت', () => {
    expect(fmtPct(2.41)).toBe('+2.41%');
    expect(fmtPct(-1.2)).toBe('-1.20%');
  });
  it('تومان با ارقام فارسی', () => {
    expect(fmtToman(36_900, 1_480_000)).toBe('≈ ۵٫۴۶ میلیارد تومان');
    expect(fmtNum(1234.5)).toContain('۱');
  });
});

describe('نگهبان صحت قیمت توکن‌ایز (مثل خطای BACON)', () => {
  it('قیمت زنده ۸۳۶.۹۰ برای BACON (مرجع ۵۸.۴۸) → مشکوک → اسنپ‌شات', () => {
    const r = resolveTokenizedPrice('BACON', { BACON: 836.9 });
    expect(r.price).toBe(58.48);
    expect(r.source).toBe('snapshot');
  });
  it('قیمت زنده ۶۲.۳۰ برای BACON → معقول → زنده', () => {
    expect(isPlausibleTokenizedPrice('BACON', 62.3)).toBe(true);
    const r = resolveTokenizedPrice('BACON', { BACON: 62.3 });
    expect(r.price).toBe(62.3);
    expect(r.source).toBe('live');
  });
});

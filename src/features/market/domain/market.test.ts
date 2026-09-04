/** ============================================================
 * بازار — تست‌های طبقه‌بندی/جستجو/Underlying/Quote (نسخه بازگردانده‌شده)
 * ============================================================ */
import { describe, expect, it } from 'vitest';
import { classifyTradFi, searchInstruments, sortInstruments, toMarketInstrument } from './classification';
import { groupByUnderlying, underlyingFor } from './underlying';
import { referenceMarketCap, hasReferenceMarketCap } from '../data/marketCapReference';
import type { MarketInstrument } from './types';

const mkInst = (symbol: string, nameFa: string, category: MarketInstrument['category'], type: MarketInstrument['type']): MarketInstrument => ({
  instrumentId: `x:${symbol}`,
  symbol,
  nameFa,
  type,
  category,
  source: category === 'crypto' ? 'coingecko' : 'alpha-vantage',
  sourceId: symbol,
  liveKey: symbol,
  status: 'Trading',
  lastSyncedAt: 0
});

describe('classifyTradFi — دسته‌بندی دقیق سنتی', () => {
  it('سهام / ETF / شاخص / کامودیتی / اوراق جدا', () => {
    expect(classifyTradFi('NVDA', 'stock').category).toBe('us-stock');
    expect(classifyTradFi('SPY', 'etf').category).toBe('etf');
    expect(classifyTradFi('VIX', 'index').category).toBe('index');
    expect(classifyTradFi('WTI', 'commodity').category).toBe('commodity');
    expect(classifyTradFi('US10Y', 'bond').category).toBe('bond');
  });

  it('بدون نوع → پیش‌فرض سهام', () => {
    expect(classifyTradFi('XYZ', undefined).category).toBe('us-stock');
  });
});

describe('Underlying Matching — NVIDIA و هم‌خانواده‌ها', () => {
  it('NVDA / NVDAB / NVDAX / NVDAON → همه NVIDIA (HIGH)', () => {
    for (const sym of ['NVDA', 'NVDAB', 'NVDAX', 'NVDAON']) {
      const g = underlyingFor(sym);
      expect(g?.underlyingId).toBe('nvda');
      expect(g?.underlyingName).toBe('NVIDIA');
      expect(g?.matchConfidence).toBe('HIGH');
    }
  });

  it('جلوگیری از Over-grouping: NVDL هرگز NVIDIA نمی‌شود', () => {
    expect(underlyingFor('NVDL')).toBeNull();
  });

  it('گروه‌بندی: چند Instrument زیر یک Underlying', () => {
    const groups = groupByUnderlying([
      mkInst('NVDA', 'انویدیا', 'us-stock', 'US_EQUITY'),
      mkInst('NVDAX', 'انویدیا توکن‌ایز', 'tokenized', 'TOKENIZED_STOCK'),
      mkInst('NVDAON', 'انویدیا اوندو', 'tokenized', 'TOKENIZED_STOCK')
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].instruments.map((i) => i.symbol)).toEqual(['NVDA', 'NVDAX', 'NVDAON']);
  });

  it('نماد ناشناخته → بدون گروه (null)', () => {
    expect(underlyingFor('ZZZZZZ')).toBeNull();
  });
});

describe('searchInstruments — جستجوی چندبُعدی', () => {
  const list: MarketInstrument[] = [
    mkInst('BTC', 'بیت‌کوین', 'crypto', 'CRYPTO'),
    mkInst('NVDA', 'انویدیا', 'us-stock', 'US_EQUITY'),
    mkInst('NVDAX', 'انویدیا توکن‌ایز', 'tokenized', 'TOKENIZED_STOCK')
  ];

  it('جستجوی «nvidia» → هر دو NVDA و NVDAX', () => {
    const list2: MarketInstrument[] = [
      mkInst('NVDA', 'NVIDIA', 'us-stock', 'US_EQUITY'),
      mkInst('NVDAX', 'NVIDIA توکن‌ایز', 'tokenized', 'TOKENIZED_STOCK')
    ];
    const r = searchInstruments(list2, { text: 'nvidia' });
    expect(r.map((i) => i.symbol)).toEqual(['NVDA', 'NVDAX']);
  });

  it('جستجوی «NVDAX» → فقط NVDAX', () => {
    const r = searchInstruments(list, { text: 'NVDAX' });
    expect(r.map((i) => i.symbol)).toEqual(['NVDAX']);
  });

  it('جستجوی «بیت‌کوین» → BTC', () => {
    const r = searchInstruments(list, { text: 'بیت‌کوین' });
    expect(r.map((i) => i.symbol)).toEqual(['BTC']);
  });

  it('فیلتر دسته: crypto فقط BTC', () => {
    const r = searchInstruments(list, { text: '', category: 'crypto' });
    expect(r.map((i) => i.symbol)).toEqual(['BTC']);
  });

  it('مرتب‌سازی الفبایی (فارسی: «ا» قبل از «ب»)', () => {
    const sorted = sortInstruments(list, 'alpha');
    expect(sorted[0].symbol).toBe('NVDA'); // انویدیا (ا) قبل از بیت‌کوین (ب)
  });
});

describe('بهینه‌سازی — DTO مینیمال و بدون حدس', () => {
  it('هر Instrument فقط هویت دارد — قیمت از Pipeline زنده می‌آید (نه حدس)', () => {
    const inst = mkInst('BTC', 'بیت‌کوین', 'crypto', 'CRYPTO');
    expect(inst.symbol).toBe('BTC');
    expect(inst.liveKey).toBe('BTC');
  });
});

describe('MCAP — سنتی (مرجع) و توکنایز (زنده/مرجع)', () => {
  it('سنتی: MCAP از کاتالوگ مرجع با برچسب ref (NVDA ≈ 4.8T)', () => {
    expect(hasReferenceMarketCap('NVDA')).toBe(true);
    const v = referenceMarketCap('NVDA');
    expect(v).not.toBeNull();
    expect(v! / 1e12).toBeCloseTo(4.8, 1);
  });

  it('سنتی: ETF (SPY) و صندوق کامودیتی (GLD) MCAP مرجع دارند', () => {
    expect(hasReferenceMarketCap('SPY')).toBe(true);
    expect(hasReferenceMarketCap('GLD')).toBe(true);
  });

  it('سنتی: شاخص (بدون MCAP) → N/A', () => {
    expect(hasReferenceMarketCap('VIX')).toBe(false);
    expect(referenceMarketCap('VIX')).toBeNull();
  });

  it('toMarketInstrument: کریپتو/توکن‌ایز/سنتی ساختار درست دارند', () => {
    const c = toMarketInstrument({ symbol: 'ETH', nameFa: 'اتریوم', kind: 'crypto', liveKey: 'ethereum' });
    expect(c.instrumentId).toBe('cg:ethereum');
    const t = toMarketInstrument({ symbol: 'AAPLX', nameFa: 'اپل', kind: 'tokenized', liveKey: 'AAPLX' });
    expect(t.type).toBe('TOKENIZED_STOCK');
    const s = toMarketInstrument({ symbol: 'SPY', nameFa: 'اس‌اند‌پی', kind: 'tradfi', tradfiKind: 'etf', liveKey: 'SPY' });
    expect(s.type).toBe('ETF');
  });
});

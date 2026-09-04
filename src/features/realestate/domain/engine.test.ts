/** ============================================================
 * Real Estate — تست‌های موتور
 *
 *  - Snapshot Immutable: قیمت دلاری در لحظه ثبت؛ تغییر نرخ بعدی هرگز Recalculate نمی‌شود
 *  - سود دارایی (تومانی/دلاری/درصدی — اتوماتیک)
 *  - بازدهی محله بین دو Snapshot (تومانی و دلاری جدا — مثال رشد اسمی/افت واقعی)
 *  - رتبه‌بندی محله‌ها · آمار · مقایسه با سایر دارایی‌ها
 *  - کاتالوگ: ۱۶ محله اهواز · ۲ نوع ملک · ۳ وضعیت
 * ============================================================ */
import { describe, expect, it } from 'vitest';
import {
  buildSnapshot,
  toUsd,
  buildRealAsset,
  assetProfit,
  neighborhoodReturn,
  rankNeighborhoods,
  neighborhoodStats,
  benchmarkComparison,
  BENCHMARK_FA
} from '@/features/realestate/domain/engine';
import type { RealEstateSnapshot } from '@/features/realestate/domain/types';
import { NEIGHBORHOODS, PROPERTY_TYPES, BUILDING_CONDITIONS, CITIES } from '@/features/realestate/data/catalog';

function makeSnap(ts: number, label: string, rate: number, prices: Record<string, number>): RealEstateSnapshot {
  return buildSnapshot({
    dateTs: ts,
    dateLabel: label,
    usdRate: rate,
    prices: Object.entries(prices).map(([nb, price]) => ({
      neighborhoodId: nb,
      propertyType: 'apartment',
      buildingCondition: 'new',
      averagePricePerSqmToman: price
    }))
  });
}

describe('toUsd + Snapshot Immutable', () => {
  it('قیمت دلاری = تومان ÷ نرخ همان روز', () => {
    expect(toUsd(50_000_000, 200_000)).toBe(250);
    expect(toUsd(null, 200_000)).toBeNull();
    expect(toUsd(1000, 0)).toBeNull();
  });

  it('تغییر نرخ دلار بعدی هرگز Snapshot قبلی را تغییر نمی‌دهد', () => {
    const snap1 = makeSnap(1000, 'ت۱', 200_000, { golestan: 50_000_000 }); // 250 دلار
    const snap2 = makeSnap(2000, 'ت۲', 250_000, { golestan: 60_000_000 }); // 240 دلار
    const r1 = snap1.records[0];
    expect(r1.averagePricePerSqmUsd).toBe(250);
    // با نرخ snap2 حساب نشود:
    expect(r1.averagePricePerSqmUsd).not.toBe(50_000_000 / 250_000);
    expect(snap2.records[0].averagePricePerSqmUsd).toBe(240);
  });
});

describe('buildRealAsset + assetProfit — سود اتوماتیک تومانی/دلاری', () => {
  it('خرید ۱۰ میلیارد @ دلار ۲۰۰k = ۵۰,۰۰۰ دلار · ارزش ۱۳ میلیارد @ دلار ۲۵۰k = ۵۲,۰۰۰ دلار', () => {
    const a = buildRealAsset({
      propertyType: 'apartment',
      city: 'ahvaz',
      neighborhoodId: 'ahvaz-golestan',
      buildingCondition: 'new',
      ownershipDateJalali: '۱۸ مرداد ۱۴۰۵',
      ownershipDateGregorian: 1786276800000,
      ownershipUsdRate: 200_000,
      purchasePriceToman: 10_000_000_000,
      valuationDateJalali: '۱۸ آبان ۱۴۰۵',
      valuationDateGregorian: 1788868800000,
      valuationUsdRate: 250_000,
      currentValueToman: 13_000_000_000
    });
    expect(a.purchasePriceUsd).toBeCloseTo(50_000, 6);
    expect(a.currentValueUsd).toBeCloseTo(52_000, 6);
    const p = assetProfit(a);
    expect(p.profitToman).toBe(3_000_000_000);
    expect(p.profitPctToman).toBeCloseTo(30, 6);
    expect(p.profitUsd).toBeCloseTo(2_000, 6);
    expect(p.profitPctUsd).toBeCloseTo(4, 6);
  });

  it('مثال معکوس: تومان رشد ولی دلار افت (نرخ دلار زیاد شده)', () => {
    const a = buildRealAsset({
      propertyType: 'apartment',
      city: 'ahvaz',
      neighborhoodId: 'ahvaz-golestan',
      buildingCondition: 'new',
      ownershipDateJalali: 'ت۱',
      ownershipDateGregorian: 1000,
      ownershipUsdRate: 186_500,
      purchasePriceToman: 10_000_000_000, // ≈ 53,619 دلار
      valuationDateJalali: 'ت۲',
      valuationDateGregorian: 2000,
      valuationUsdRate: 250_000,
      currentValueToman: 13_000_000_000 // ≈ 52,000 دلار
    });
    const p = assetProfit(a);
    expect(p.profitPctToman).toBeCloseTo(30, 6); // تومان +۳۰٪
    expect(p.profitPctUsd).toBeLessThan(0);      // دلار منفی
  });
});

describe('neighborhoodReturn — بازدهی محله بین دو Snapshot', () => {
  it('گلستان: ۵۰M → ۶۰M تومان = +۲۰٪ · دلار ۲۵۰ → ۲۴۰ = -۴٪', () => {
    const s1 = makeSnap(1000, 'شروع', 200_000, { golestan: 50_000_000 });
    const s2 = makeSnap(2000, 'پایان', 250_000, { golestan: 60_000_000 });
    const r = neighborhoodReturn(s1, s2, 'golestan');
    expect(r.tomanChange).toBe(10_000_000);
    expect(r.tomanPct).toBeCloseTo(20, 6);
    expect(r.startUsd).toBe(250);
    expect(r.endUsd).toBe(240);
    expect(r.usdPct).toBeCloseTo(-4, 6);
  });

  it('محله بدون داده در Snapshot → N/A (نه ۰)', () => {
    const s1 = makeSnap(1000, 'شروع', 200_000, { golestan: 50_000_000 });
    const s2 = makeSnap(2000, 'پایان', 250_000, { saadi: 60_000_000 }); // گلستان ندارد
    const r = neighborhoodReturn(s1, s2, 'golestan');
    expect(r.endToman).toBeNull();
    expect(r.tomanPct).toBeNull();
  });
});

describe('rankNeighborhoods + neighborhoodStats', () => {
  const NBS = [
    { id: 'golestan', name: 'گلستان' },
    { id: 'saadi', name: 'سعدی' },
    { id: 'padad', name: 'پاداد' }
  ];
  const s1 = makeSnap(1000, 'شروع', 200_000, { golestan: 50_000_000, saadi: 40_000_000, padad: 60_000_000 });
  const s2 = makeSnap(2000, 'پایان', 250_000, { golestan: 60_000_000, saadi: 50_000_000, padad: 55_000_000 });

  it('رتبه‌بندی تومانی: گلستان(+۲۰٪) > سعدی(+۲۵٪)؟ — مقادیر را چک کنیم', () => {
    // گلستان +20% · سعدی +25% · پاداد -8.3%
    const ranked = rankNeighborhoods(NBS, s1, s2, 'toman-pct');
    expect(ranked[0].neighborhoodId).toBe('saadi'); // +25% اول
    expect(ranked[2].neighborhoodId).toBe('padad'); // منفی آخر
  });

  it('مرتب‌سازی worst → پاداد اول (بیشترین کاهش)', () => {
    const ranked = rankNeighborhoods(NBS, s1, s2, 'worst');
    expect(ranked[0].neighborhoodId).toBe('padad');
  });

  it('آمار: ۳ محله قابل مقایسه، ۲ رشد، ۱ افت', () => {
    const st = neighborhoodStats(NBS, s1, s2);
    expect(st.comparableCount).toBe(3);
    expect(st.gainers).toBe(2);
    expect(st.losers).toBe(1);
  });
});

describe('benchmarkComparison — مقایسه با سایر دارایی‌ها', () => {
  it('ETH: 3000→3600 دلار (+۲۰٪) · تومانی با نرخ 200k→250k = +۵۰٪', () => {
    const c = benchmarkComparison('ethereum', 3000, 3600, 200_000, 250_000, 10_000_000_000);
    expect(c.usdPct).toBeCloseTo(20, 6);
    expect(c.tomanPct).toBeCloseTo((1.2 * 1.25 - 1) * 100, 4); // +50%
  });

  it('دلار: دلاری ۰٪ · تومانی = تغییر نرخ', () => {
    const c = benchmarkComparison('usd', 1, 1, 200_000, 250_000, 1000);
    expect(c.usdPct).toBe(0);
    expect(c.tomanPct).toBeCloseTo(25, 6);
  });

  it('قیمت ناموجود → N/A (نه حدس)', () => {
    const c = benchmarkComparison('bitcoin', null, 60_000, 200_000, 250_000, 1000);
    expect(c.usdPct).toBeNull();
    expect(c.tomanPct).toBeNull();
  });

  it('BENCHMARK_FA همه را دارد', () => {
    expect(BENCHMARK_FA.ethereum).toBe('ETH');
    expect(BENCHMARK_FA['tether-gold']).toContain('طلا');
    expect(BENCHMARK_FA.vehicle).toContain('خودرو');
  });
});

describe('کاتالوگ — گزینه‌های آماده', () => {
  it('شهر اهواز + ۱۶ محله + ۲ نوع ملک + ۳ وضعیت ساختمان', () => {
    expect(CITIES.map((c) => c.name)).toContain('اهواز');
    expect(NEIGHBORHOODS.length).toBe(16);
    const names = NEIGHBORHOODS.map((n) => n.name);
    for (const nb of ['گلستان', 'سعدی', 'فرهنگ شهر', 'امانیه', 'کیان‌پارس شرقی', 'مهر شهر']) {
      expect(names).toContain(nb);
    }
    expect(PROPERTY_TYPES.map((t) => t.name)).toEqual(['آپارتمان', 'خانه ویلایی']);
    expect(BUILDING_CONDITIONS.find((c) => c.isPrimary)?.name).toBe('نوساز / کلید اول');
    expect(BUILDING_CONDITIONS.length).toBe(3);
  });
});

/**
 * تغییر قیمت دلاری در طول زمان — ۱ تا ۶۰ ماه، فقط بین آگهی‌های هم‌نوع (میانگین)
 */
import { describe, it, expect } from 'vitest';
import {
  CHANGE_PERIODS_MONTHS,
  areaChanges,
  changeTable,
  computeChange,
  findBaseSnapshot,
  monthsBefore,
  snapshotRate,
  usdSeries
} from './history';

/** یک منطقه آزمایشی (کل اهواز دیگر ردیف ندارد) */
const CITY_KEY = 'main';
import type { AreaPriceStats, PropertyMarketSnapshot } from './types';
import { tehranDayKey } from '@/shared/fx/usdtHistory';

/** نوع پیش‌فرض تست‌ها */
const T = 'age1' as const;

/** آمار ناحیه با یک نوع «۱ سال ساخت» (میانگین = ppm/total) */
function stats(ppm: number, total: number, count = 10): AreaPriceStats {
  return {
    medianTomanPerM2: ppm,
    meanTomanPerM2: ppm,
    p25TomanPerM2: ppm,
    p75TomanPerM2: ppm,
    listingCount: count,
    medianTotalToman: total,
    medianAreaSqm: 100,
    byType: { [T]: { count, medianPpm: ppm, meanPpm: ppm, medianTotal: total || null, meanTotal: total || null } }
  };
}

function snap(
  date: string,
  city: [number, number],
  nbs: Record<string, [number, number, number?]>,
  rate: number | null,
  fxSource?: PropertyMarketSnapshot['fxSource']
): PropertyMarketSnapshot {
  const ts = Date.parse(date);
  return {
    id: `pmsnap-${ts}`,
    dateTs: ts,
    dateLabel: date.slice(0, 10),
    city: 'ahvaz',
    source: 'divar',
    fxRateAtSnapshotToman: rate,
    ...(fxSource ? { fxSource } : rate ? { fxSource: 'wallex' as const } : {}),
    cityStats: stats(city[0], city[1]),
    neighborhoodStats: [
      { neighborhoodKey: CITY_KEY, displayName: CITY_KEY, stats: stats(city[0], city[1]) },
      ...Object.entries(nbs).map(([k, v]) => ({ neighborhoodKey: k, displayName: k, stats: stats(v[0], v[1], v[2] ?? 10) }))
    ],
    cleaning: { raw: 0, normalized: 0, valid: 0, deduplicated: 0, outliersRemoved: 0, market: 0, rejectReasons: {} },
    createdAt: ts
  };
}

describe('تقویم و حد تحمل', () => {
  it('monthsBefore ماه تقویمی (پایان ماه امن)', () => {
    expect(new Date(monthsBefore(Date.parse('2026-09-26T00:00:00Z'), 3)).toISOString().slice(0, 10)).toBe('2026-06-26');
    expect(new Date(monthsBefore(Date.parse('2026-03-31T00:00:00Z'), 1)).toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(new Date(monthsBefore(Date.parse('2026-09-26T00:00:00Z'), 36)).toISOString().slice(0, 10)).toBe('2023-09-26');
  });
  it('دوره‌ها دقیقاً مطابق درخواست', () => {
    expect([...CHANGE_PERIODS_MONTHS]).toEqual([1, 3, 6, 9, 12, 16, 24, 32, 36, 48, 60]);
  });
});

describe('نرخ Snapshot', () => {
  it('ترتیب: نرخ تتر ثبت‌شده → تاریخچه روز؛ نرخ دستی قدیمی هرگز', () => {
    const daily = { [tehranDayKey(Date.parse('2026-06-26T10:00:00Z'))]: 200000 };
    expect(snapshotRate(snap('2026-06-26T10:00:00Z', [1, 1], {}, 210000), daily)).toEqual({ rate: 210000, source: 'snapshot' });
    expect(snapshotRate(snap('2026-06-26T10:00:00Z', [1, 1], {}, null), daily)).toEqual({ rate: 200000, source: 'history' });
    // نرخ دستی قدیمی (ممکن است اشتباه باشد) فقط وقتی تاریخچه نیست
    expect(snapshotRate(snap('2026-06-26T10:00:00Z', [1, 1], {}, 1_480_000, 'manual-legacy'), daily)).toEqual({ rate: 200000, source: 'history' });
    expect(snapshotRate(snap('2026-06-26T10:00:00Z', [1, 1], {}, 1_480_000, 'manual-legacy'), {})).toBeNull();
    expect(snapshotRate(snap('2026-06-26T10:00:00Z', [1, 1], {}, null), {})).toBeNull();
  });
});

describe('computeChange', () => {
  // ۳ ماه پیش: هر متر ۶۰ میلیون، تتر ۲۰۰ هزار → $300 ؛ امروز: ۸۰ میلیون، تتر ۲۵۰ هزار → $320 (+6.67٪)
  const S = [
    snap('2026-06-25T10:00:00Z', [60e6, 6e9], { golestan: [60e6, 6e9], kianpars: [100e6, 12e9] }, 200000),
    snap('2026-09-26T10:00:00Z', [80e6, 8e9], { golestan: [70e6, 7e9], kianpars: [150e6, 15e9] }, 250000)
  ];

  it('کل اهواز — هر متر و قیمت کل به دلار + تومانی + تتر', () => {
    const r = computeChange(S, CITY_KEY, 3, {}, T);
    expect(r.status).toBe('ok');
    expect(r.base!.ppmUsd).toBe(300);
    expect(r.now!.ppmUsd).toBe(320);
    expect(r.ppmUsdPct).toBeCloseTo(6.6667, 3);
    expect(r.base!.totalUsd).toBe(30000);
    expect(r.now!.totalUsd).toBe(32000);
    expect(r.totalUsdPct).toBeCloseTo(6.6667, 3);
    expect(r.ppmTomanPct).toBeCloseTo(33.333, 2);
    expect(r.ratePct).toBe(25);
  });

  it('محله با کاهش دلاری (رشد تومانی کمتر از رشد تتر)', () => {
    const r = computeChange(S, 'golestan', 3, {}, T);
    // 60M/200k=$300 → 70M/250k=$280 → −6.67٪
    expect(r.ppmUsdPct).toBeCloseTo(-6.6667, 3);
    expect(r.ppmTomanPct).toBeCloseTo(16.667, 2);
  });

  it('دوره بلندتر از تاریخچه → pending با تاریخ در دسترس شدن', () => {
    const r = computeChange(S, CITY_KEY, 12, {}, T);
    expect(r.status).toBe('pending');
    expect(new Date(r.availableFrom!).toISOString().slice(0, 10)).toBe('2027-06-25');
    expect(r.now!.ppmUsd).toBe(320); // مقدار فعلی همچنان در دسترس
  });

  it('محله‌ای که در Snapshot مبنا نبود → no-area', () => {
    const S2 = [S[0], snap('2026-09-26T10:00:00Z', [80e6, 8e9], { newarea: [50e6, 5e9] }, 250000)];
    expect(computeChange(S2, 'newarea', 3, {}, T).status).toBe('no-area');
  });

  it('Snapshot بدون نرخ → از تاریخچه روزانه همان تاریخ', () => {
    const S3 = [snap('2026-06-25T10:00:00Z', [60e6, 6e9], {}, null), S[1]];
    const daily = { [tehranDayKey(Date.parse('2026-06-25T10:00:00Z'))]: 200000 };
    expect(computeChange(S3, CITY_KEY, 3, {}, T).status).toBe('no-rate');
    const r = computeChange(S3, CITY_KEY, 3, daily, T);
    expect(r.status).toBe('ok');
    expect(r.base!.rateSource).toBe('history');
  });

  it('نمونه کم (کمتر از ۳ آگهی) علامت می‌خورد', () => {
    const S4 = [
      snap('2026-06-25T10:00:00Z', [60e6, 6e9], { x: [60e6, 6e9, 2] }, 200000),
      snap('2026-09-26T10:00:00Z', [80e6, 8e9], { x: [70e6, 7e9, 5] }, 250000)
    ];
    expect(computeChange(S4, 'x', 3, {}, T).lowSample).toBe(true);
  });

  it('بدون قیمت کل → فقط هر متر', () => {
    const old = snap('2026-06-25T10:00:00Z', [60e6, 0], {}, 200000);
    const r = computeChange([old, S[1]], CITY_KEY, 3, {}, T);
    expect(r.ppmUsdPct).not.toBeNull();
    expect(r.totalUsdPct).toBeNull();
  });
});

describe('انتخاب Snapshot مبنا', () => {
  it('نزدیک‌ترین به هدف در حد تحمل؛ خارج از حد → null', () => {
    const cur = snap('2026-09-26T10:00:00Z', [1, 1], {}, 1);
    const a = snap('2026-06-10T10:00:00Z', [1, 1], {}, 1); // ۱۶ روز قبل از هدف (حد تحمل ۳ ماه = ۱۸ روز)
    const b = snap('2026-06-30T10:00:00Z', [1, 1], {}, 1); // ۴ روز بعد از هدف
    expect(findBaseSnapshot([a, b, cur], cur, 3)?.id).toBe(b.id);
    expect(findBaseSnapshot([a, cur], cur, 3)?.id).toBe(a.id);
    const far = snap('2026-05-20T10:00:00Z', [1, 1], {}, 1);
    expect(findBaseSnapshot([far, cur], cur, 3)).toBeNull();
  });
  it('Snapshot خیلی نزدیک به امروز مبنای ۱ ماهه نمی‌شود', () => {
    const cur = snap('2026-09-26T10:00:00Z', [1, 1], {}, 1);
    const recent = snap('2026-09-20T10:00:00Z', [1, 1], {}, 1);
    expect(findBaseSnapshot([recent, cur], cur, 1)).toBeNull();
  });
});

describe('جدول و رتبه‌بندی', () => {
  // ۳۶ ماه تاریخچه ماهانه ساختگی
  const series: PropertyMarketSnapshot[] = [];
  for (let i = 36; i >= 0; i--) {
    const ts = monthsBefore(Date.parse('2026-09-26T10:00:00Z'), i);
    series.push(snap(new Date(ts).toISOString(), [50e6 + (36 - i) * 1e6, 5e9], { a: [40e6 + (36 - i) * 2e6, 4e9], b: [60e6, 6e9] }, 100000 + (36 - i) * 3000));
  }
  it('۳۶ ماه داده → ۹ دوره اول ok؛ ۴۸ و ۶۰ ماه «در انتظار» با تاریخ', () => {
    const rows = changeTable(series, CITY_KEY, {}, T);
    expect(rows.map((r) => r.months)).toEqual([1, 3, 6, 9, 12, 16, 24, 32, 36, 48, 60]);
    expect(rows.slice(0, 9).every((r) => r.status === 'ok')).toBe(true);
    expect(rows[9].status).toBe('pending');
    expect(rows[10].status).toBe('pending');
    expect(rows[9].availableFrom).toBeGreaterThan(rows[8].now!.dateTs);
  });

  it('۶۰ ماه تاریخچه → دوره ۶۰ ماه ok', () => {
    const long: PropertyMarketSnapshot[] = [];
    for (let i = 60; i >= 0; i -= 12) {
      const ts = monthsBefore(Date.parse('2026-09-26T10:00:00Z'), i);
      long.push(snap(new Date(ts).toISOString(), [50e6 + (60 - i) * 1e6, 5e9], {}, 50000 + (60 - i) * 3000));
    }
    const r = computeChange(long, CITY_KEY, 60, {}, T);
    expect(r.status).toBe('ok');
    expect(computeChange(long, CITY_KEY, 48, {}, T).status).toBe('ok');
  });
  it('رتبه‌بندی مناطق بر اساس رشد دلاری', () => {
    const rows = areaChanges(series, 12, {}, T).filter((r) => r.key !== CITY_KEY);
    expect(rows[0].key).toBe('a'); // رشد تومانی بیشتر → بالاتر
    expect(rows[0].change.status).toBe('ok');
    expect(rows[1].change.ppmUsdPct!).toBeLessThan(0); // b ثابت تومانی، تتر رشد → کاهش دلاری
  });
  it('سری دلاری برای نمودار', () => {
    expect(usdSeries(series, 'a', {}, T).length).toBe(37);
  });
});

describe('منطقه در مقایسه زمانی', () => {
  it('Snapshot قدیمی با کلید ادغامی «kianpars» با منطقه «kianpars» جدید مقایسه می‌شود', () => {
    const old = snap('2026-06-25T10:00:00Z', [60e6, 6e9], { kianpars: [100e6, 10e9] }, 200000);
    const cur = snap('2026-09-26T10:00:00Z', [80e6, 8e9], { 'kianpars-east': [150e6, 15e9] }, 250000);
    cur.groupStats = [{ neighborhoodKey: 'kianpars', displayName: 'کیانپارس', stats: stats(140e6, 14e9) }];
    const r = computeChange([old, cur], 'kianpars', 3, {}, T);
    expect(r.status).toBe('ok');
    expect(r.base!.ppmUsd).toBe(500);
    expect(r.now!.ppmUsd).toBe(560);
    // محله جزئی که قبلاً وجود نداشت → no-area (نه عدد جعلی)
    expect(computeChange([old, cur], 'kianpars-east', 3, {}, T).status).toBe('no-area');
  });

  it('رتبه‌بندی = گروه‌ها + محله‌های مستقل (تنها سطح: منطقه)', () => {
    const a = snap('2026-06-25T10:00:00Z', [60e6, 6e9], { golestan: [60e6, 6e9], 'kianabad-east': [90e6, 9e9] }, 200000);
    a.groupStats = [{ neighborhoodKey: 'kianabad', displayName: 'کیان‌آباد', stats: stats(90e6, 9e9) }];
    const b = snap('2026-09-26T10:00:00Z', [80e6, 8e9], { golestan: [70e6, 7e9], 'kianabad-east': [110e6, 11e9] }, 250000);
    b.groupStats = [{ neighborhoodKey: 'kianabad', displayName: 'کیان‌آباد', stats: stats(110e6, 11e9) }];
    const g = areaChanges([a, b], 3, {}, T);
    expect(g.map((r) => r.key).filter((k) => k !== CITY_KEY).sort()).toEqual(['golestan', 'kianabad']);
  });

});

describe('مقایسه هم‌نوع (کلید اول / N سال ساخت)', () => {
  it('byType در Snapshot → تغییر دلاری فقط بین آگهی‌های هم‌نوع', () => {
    const a = snap('2026-06-25T10:00:00Z', [60e6, 6e9], {}, 200000);
    a.neighborhoodStats[0].stats.byType = { 'first-key': { count: 5, medianPpm: 90e6, meanPpm: 100e6, medianTotal: 9e9, meanTotal: 10e9 } };
    const b = snap('2026-09-26T10:00:00Z', [80e6, 8e9], {}, 250000);
    b.neighborhoodStats[0].stats.byType = { 'first-key': { count: 6, medianPpm: 150e6, meanPpm: 130e6, medianTotal: 15e9, meanTotal: 13e9 } };
    const r = computeChange([a, b], CITY_KEY, 3, {}, 'first-key');
    // میانگین (نه میانه): $500 → $520
    expect(r.base!.ppmUsd).toBe(500);
    expect(r.now!.ppmUsd).toBe(520);
    expect(r.ppmUsdPct).toBeCloseTo(4, 6);
    expect(r.totalUsdPct).toBeCloseTo(4, 6);
    // نوعی که در Snapshot نیست → no-type (نه عدد ساختگی)
    expect(computeChange([a, b], CITY_KEY, 3, {}, 'age3').status).toBe('no-type');
  });
});

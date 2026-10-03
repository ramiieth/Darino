import { describe, expect, it } from 'vitest';
import { categoryOf } from './brands';
import { brandSummaries, buildCarViews, findBaseSnapshot, periodAvailableFrom, priceSeries, trimChanges } from './changes';
import { mergeCarSnapshots } from './snapshot';
import type { CarPriceRow, CarSnapshot } from './types';

const DAY = 86_400_000;
const T0 = Date.parse('2026-09-01T08:00:00Z');

function row(id: string, market: number | null, extra: Partial<CarPriceRow> = {}): CarPriceRow {
  return {
    id,
    modelId: `m${id}`,
    brand: 'iran-khodro',
    model: `مدل ${id}`,
    year: '1405',
    option: null,
    market,
    dealer: 1_000_000_000,
    marketUpdatedAt: null,
    srcChangePct: null,
    ...extra
  };
}

function snap(dayOffset: number, rate: number | null, rows: CarPriceRow[]): CarSnapshot {
  const ts = T0 + dayOffset * DAY;
  const day = new Date(ts + 3.5 * 3600_000).toISOString().slice(0, 10);
  return { id: `car-${day}`, day, dateTs: ts, source: 'car.ir', usdtRate: rate, usdtSource: rate ? 'wallex' : null, brandNames: {}, rows, createdAt: ts };
}

describe('دسته خودرو', () => {
  it('سال میلادی = وارداتی؛ شمسی = داخلی (برند ایرانی) یا مونتاژی', () => {
    expect(categoryOf('kia', '2025')).toBe('imported');
    expect(categoryOf('iran-khodro', '1405')).toBe('domestic');
    expect(categoryOf('saipa', '1404')).toBe('domestic');
    expect(categoryOf('chery', '1404')).toBe('assembled');
    expect(categoryOf('iran-khodro', '2025')).toBe('imported');
  });
});

describe('Snapshot مبنا', () => {
  const snaps = [snap(0, 100_000, []), snap(6, 100_000, []), snap(29, 100_000, []), snap(30, 100_000, [])];
  const latest = snaps[3];

  it('روزانه: Snapshot روز قبل', () => {
    expect(findBaseSnapshot(snaps, latest, 1)?.dateTs).toBe(snaps[2].dateTs);
  });
  it('ماهانه: نزدیک‌ترین به ۳۰ روز قبل', () => {
    expect(findBaseSnapshot(snaps, latest, 30)?.dateTs).toBe(snaps[0].dateTs);
  });
  it('هفتگی: خارج از حد تحمل → null', () => {
    expect(findBaseSnapshot(snaps, latest, 7)).toBeNull();
  });
  it('هیچ‌وقت خودِ آخرین Snapshot مبنا نیست', () => {
    expect(findBaseSnapshot([latest], latest, 1)).toBeNull();
  });
  it('زمان در دسترس شدن دوره', () => {
    expect(periodAvailableFrom(snaps, 30)).toBe(T0 + 24 * DAY);
    expect(periodAvailableFrom([], 30)).toBeNull();
  });
});

describe('تغییر تومانی و دلاری', () => {
  // قیمت ۱۰٪ بالا رفته ولی دلار ۲۰٪ گران شده → دلاری منفی
  const s0 = snap(0, 100_000, [row('a', 2_000_000_000), row('b', 1_000_000_000)]);
  const s30 = snap(30, 120_000, [row('a', 2_200_000_000), row('b', 900_000_000), row('c', 3_000_000_000)]);
  const snaps = [s0, s30];

  it('ماهانه: درصد و مبلغ تومانی + دلاری با نرخ هر روز', () => {
    const { views, base } = buildCarViews(snaps, 30, {});
    expect(base?.id).toBe(s0.id);
    const a = views.find((v) => v.row.id === 'a')!.change!;
    expect(a.basis).toBe('snapshot');
    expect(a.tomanAbs).toBe(200_000_000);
    expect(a.tomanPct).toBeCloseTo(10);
    expect(a.fromUsd).toBeCloseTo(20_000);
    expect(a.toUsd).toBeCloseTo(18_333.33, 1);
    expect(a.usdPct).toBeCloseTo(-8.333, 2);
    expect(views.find((v) => v.row.id === 'b')!.change!.tomanPct).toBeCloseTo(-10);
    // خودروی تازه (بدون قیمت قبلی) → بدون تغییر ساختگی
    expect(views.find((v) => v.row.id === 'c')!.change).toBeNull();
  });

  it('نرخ ثبت‌نشده → نرخ روزانه تاریخچه همان روز', () => {
    const noRate = snap(0, null, [row('a', 2_000_000_000)]);
    const { views } = buildCarViews([noRate, s30], 30, { [noRate.day]: 80_000 });
    expect(views.find((v) => v.row.id === 'a')!.change!.fromUsd).toBeCloseTo(25_000);
  });

  it('روزانه بدون Snapshot دیروز → از درصد تغییر منبع (basis=source)', () => {
    const today = snap(0, 100_000, [
      row('a', 1_100_000_000, { srcChangePct: 10, marketUpdatedAt: T0 - 3600_000 }),
      row('old', 1_000_000_000, { srcChangePct: 5, marketUpdatedAt: T0 - 40 * DAY })
    ]);
    const { views } = buildCarViews([today], 1, {});
    const a = views.find((v) => v.row.id === 'a')!;
    expect(a.change?.basis).toBe('source');
    expect(a.change?.fromToman).toBeCloseTo(1_000_000_000);
    // قیمت قدیمی منبع → تغییر روزانه نیست و «به‌روز نشده» است
    const old = views.find((v) => v.row.id === 'old')!;
    expect(old.change).toBeNull();
    expect(old.stale).toBe(true);
    // دوره‌های بلندتر هرگز از درصد منبع ساخته نمی‌شوند
    expect(buildCarViews([today], 30, {}).views.every((v) => v.change === null)).toBe(true);
  });

  it('اختلاف بازار با کارخانه و معادل دلاری', () => {
    const v = buildCarViews(snaps, 30, {}).views.find((x) => x.row.id === 'a')!;
    expect(v.gapPct).toBeCloseTo(120);
    expect(v.marketUsd).toBeCloseTo(18_333.33, 1);
  });

  it('خلاصه برند، روند و تغییر در همه دوره‌ها', () => {
    const { views } = buildCarViews(snaps, 30, {});
    const [ik] = brandSummaries(views);
    expect(ik).toMatchObject({ brand: 'iran-khodro', count: 3, up: 1, down: 1 });
    expect(ik.tomanPct).toBeCloseTo(0);
    expect(priceSeries(snaps, 'a', {}).map((p) => p.toman)).toEqual([2_000_000_000, 2_200_000_000]);
    const periods = trimChanges(snaps, 'a', {});
    expect(periods.find((p) => p.key === '30d')?.change?.tomanPct).toBeCloseTo(10);
    expect(periods.find((p) => p.key === '7d')?.change).toBeNull();
  });
});

describe('ادغام Snapshotها', () => {
  it('هر روز یک Snapshot — جدیدتر می‌ماند، مرتب صعودی', () => {
    const a = snap(0, 1, []);
    const b = { ...snap(0, 2, []), dateTs: a.dateTs + 3600_000 };
    const c = snap(-1, 3, []);
    const merged = mergeCarSnapshots([a, c], [b, { bad: true } as never]);
    expect(merged.map((s) => s.usdtRate)).toEqual([3, 2]);
  });
});

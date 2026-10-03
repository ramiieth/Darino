import { describe, expect, it } from 'vitest';
import { categoryOf } from './brands';
import {
  CHANGE_PERIODS,
  buildCarViews,
  findBaseSnapshot,
  monthsBefore,
  periodAvailableFrom,
  periodOf,
  priceSeries,
  seriesIndex,
  trimChanges
} from './changes';
import { mergeCarSnapshots } from './snapshot';

import { T0, row, snap } from './__fixtures__/snaps';

const DAY = 86_400_000;

describe('دوره‌ها', () => {
  it('روزانه، هفتگی و ۱ تا ۷۲ ماهه', () => {
    expect(CHANGE_PERIODS.map((p) => p.key)).toEqual([
      '1d', '7d', '1m', '3m', '6m', '9m', '12m', '15m', '18m', '21m', '24m', '30m', '36m', '42m', '48m', '54m', '60m', '66m', '72m'
    ]);
    expect(periodOf('12m').label).toBe('۱۲ ماهه');
    expect(periodOf('nope').key).toBe('1d');
  });
  it('ماه تقویمی: ۳۱ → آخر ماه', () => {
    expect(new Date(monthsBefore(Date.parse('2026-03-31T00:00:00Z'), 1)).toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(new Date(monthsBefore(Date.parse('2026-10-04T00:00:00Z'), 12)).toISOString().slice(0, 10)).toBe('2025-10-04');
  });
});

describe('دسته خودرو', () => {
  it('سال میلادی = وارداتی؛ شمسی = داخلی (برند ایرانی) یا مونتاژی', () => {
    expect(categoryOf('kia', '2025')).toBe('imported');
    expect(categoryOf('iran-khodro', '1405')).toBe('domestic');
    expect(categoryOf('saipa', '1404')).toBe('domestic');
    expect(categoryOf('chery', '1404')).toBe('assembled');
  });
});

describe('Snapshot مبنا', () => {
  const snaps = [snap(0, 100_000, []), snap(6, 100_000, []), snap(29, 100_000, []), snap(30, 100_000, [])];
  const latest = snaps[3];

  it('روزانه: Snapshot روز قبل', () => {
    expect(findBaseSnapshot(snaps, latest, periodOf('1d'))?.dateTs).toBe(snaps[2].dateTs);
  });
  it('۱ ماهه: نزدیک‌ترین به یک ماه تقویمی قبل', () => {
    expect(findBaseSnapshot(snaps, latest, periodOf('1m'))?.dateTs).toBe(snaps[0].dateTs);
  });
  it('هفتگی: خارج از حد تحمل → null', () => {
    expect(findBaseSnapshot(snaps, latest, periodOf('7d'))).toBeNull();
  });
  it('۱۲ ماهه بدون تاریخچه کافی → null + زمان در دسترس شدن', () => {
    expect(findBaseSnapshot(snaps, latest, periodOf('12m'))).toBeNull();
    const from = periodAvailableFrom(snaps, periodOf('12m'))!;
    expect(from).toBeGreaterThan(T0 + 300 * DAY);
    expect(from).toBeLessThan(T0 + 366 * DAY);
  });
  it('هیچ‌وقت خودِ آخرین Snapshot مبنا نیست', () => {
    expect(findBaseSnapshot([latest], latest, periodOf('1d'))).toBeNull();
  });
});

describe('تغییر تومانی و دلاری', () => {
  const s0 = snap(0, 100_000, [row('a', 2_000_000_000), row('b', 1_000_000_000)]);
  const s30 = snap(30, 120_000, [row('a', 2_200_000_000), row('b', 900_000_000), row('c', 3_000_000_000)]);
  const snaps = [s0, s30];

  it('۱ ماهه: درصد و مبلغ تومانی + دلاری با نرخ هر روز', () => {
    const { views, base } = buildCarViews(snaps, periodOf('1m'), {});
    expect(base?.id).toBe(s0.id);
    const a = views.find((v) => v.row.id === 'a')!.change!;
    expect(a.tomanAbs).toBe(200_000_000);
    expect(a.tomanPct).toBeCloseTo(10);
    expect(a.usdPct).toBeCloseTo(-8.333, 2);
    expect(views.find((v) => v.row.id === 'c')!.change).toBeNull();
  });

  it('نرخ ثبت‌نشده → نرخ روزانه تاریخچه همان روز', () => {
    const noRate = snap(0, null, [row('a', 2_000_000_000)]);
    const { views } = buildCarViews([noRate, s30], periodOf('1m'), { [noRate.day]: 80_000 });
    expect(views.find((v) => v.row.id === 'a')!.change!.fromUsd).toBeCloseTo(25_000);
  });

  it('روزانه بدون Snapshot دیروز → از درصد تغییر منبع (basis=source)', () => {
    const today = snap(0, 100_000, [
      row('a', 1_100_000_000, { srcChangePct: 10, marketUpdatedAt: T0 - 3600_000 }),
      row('old', 1_000_000_000, { srcChangePct: 5, marketUpdatedAt: T0 - 40 * DAY })
    ]);
    const { views } = buildCarViews([today], periodOf('1d'), {});
    expect(views.find((v) => v.row.id === 'a')!.change).toMatchObject({ basis: 'source' });
    const old = views.find((v) => v.row.id === 'old')!;
    expect(old.change).toBeNull();
    expect(old.stale).toBe(true);
    expect(buildCarViews([today], periodOf('1m'), {}).views.every((v) => v.change === null)).toBe(true);
  });

  it('روند، ایندکس روند و تغییر در همه دوره‌ها', () => {
    expect(priceSeries(snaps, 'a', {}).map((p) => p.toman)).toEqual([2_000_000_000, 2_200_000_000]);
    expect(seriesIndex(snaps, {}).get('a')?.map((p) => p.toman)).toEqual([2_000_000_000, 2_200_000_000]);
    const periods = trimChanges(snaps, 'a', {});
    expect(periods).toHaveLength(CHANGE_PERIODS.length);
    expect(periods.find((p) => p.period.key === '1m')?.change?.tomanPct).toBeCloseTo(10);
    expect(periods.find((p) => p.period.key === '7d')?.change).toBeNull();
  });
});

describe('ادغام Snapshotها', () => {
  it('هر روز یک Snapshot — جدیدتر می‌ماند، مرتب صعودی', () => {
    const a = snap(0, 1, []);
    const b = { ...snap(0, 2, []), dateTs: a.dateTs + 3600_000 };
    const c = snap(-1, 3, []);
    expect(mergeCarSnapshots([a, c], [b, { bad: true } as never]).map((s) => s.usdtRate)).toEqual([3, 2]);
  });
});

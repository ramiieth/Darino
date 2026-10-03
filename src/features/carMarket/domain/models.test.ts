import { describe, expect, it } from 'vitest';
import { periodOf } from './changes';
import { brandSummaries, buildModelMarket, marketSummary, statusLabel } from './models';
import { row, snap } from './__fixtures__/snaps';

const DAY = 86_400_000;
// ۱۲ مهر ۱۴۰۵ (۴ اکتبر ۲۰۲۶)
const NOW = Date.parse('2026-10-04T08:00:00Z');

describe('نمای مدل — مبنای قیمت آخرین سال ساخت', () => {
  const rows = [
    row('q02', 825_000_000, { modelId: 'quick', model: 'کوییک', brand: 'saipa', year: '1402', dealer: null, marketUpdatedAt: NOW - 200 * DAY }),
    row('d03', 1_530_000_000, { modelId: 'dena', model: 'دنا پلاس', year: '1403', dealer: null }),
    row('d05', 2_460_000_000, { modelId: 'dena', model: 'دنا پلاس', year: '1405', dealer: 1_357_000_000, marketUpdatedAt: NOW }),
    // دو ردیف هم‌سال: ردیف تازه‌تر مبناست
    row('s1', 1_250_000_000, { modelId: 'saina', model: 'ساینا', brand: 'saipa', year: '1404', dealer: null, marketUpdatedAt: NOW - 20 * DAY }),
    row('s2', 1_360_000_000, { modelId: 'saina', model: 'ساینا', brand: 'saipa', year: '1404', dealer: null, marketUpdatedAt: NOW }),
    row('k', 3_000_000_000, { modelId: 'kia', model: 'کیا K5', brand: 'kia', year: '2025', dealer: null, marketUpdatedAt: NOW }),
    row('b', 9_000_000_000, { modelId: 'bmw', model: 'ب ام و', brand: 'bmw', year: '2018', dealer: null, marketUpdatedAt: NOW })
  ];
  const { models } = buildModelMarket([snap(0, 100_000, rows, NOW)], periodOf('1d'), {});
  const m = (k: string) => models.find((x) => x.key === k)!;

  it('یک کارت برای هر مدل؛ مبنا = آخرین سال، تیپ‌ها جدیدترین اول', () => {
    expect(models).toHaveLength(5);
    expect(m('dena').basis.row.id).toBe('d05');
    expect(m('dena').trims.map((t) => t.row.year)).toEqual(['1405', '1403']);
    expect(m('saina').basis.row.id).toBe('s2');
  });

  it('وضعیت تولید', () => {
    expect(m('dena').status).toBe('current'); // مدل ۱۴۰۵ + قیمت کارخانه
    expect(m('saina').status).toBe('no-new'); // آخرین مدل ۱۴۰۴، بدون قیمت کارخانه
    expect(m('quick').status).toBe('stopped'); // ۱۴۰۲ و ۲۰۰ روز به‌روز نشده
    expect(m('kia').status).toBe('current'); // وارداتی ۲۰۲۵
    expect(m('bmw').status).toBe('stopped');
    expect(statusLabel(m('bmw'))).toBe('توقف واردات');
    expect(statusLabel(m('quick'))).toBe('توقف تولید');
  });
});

describe('سال جدید فقط با قیمت کارخانه', () => {
  it('مبنای قیمت = آخرین سال دارای قیمت بازار؛ وضعیت = در حال عرضه', () => {
    const rows = [
      row('t05', null, { modelId: 'tiggo', model: 'تیگو ۷', brand: 'chery', year: '1405', dealer: 5_320_000_000, marketUpdatedAt: null }),
      row('t04', 6_500_000_000, { modelId: 'tiggo', model: 'تیگو ۷', brand: 'chery', year: '1404', dealer: null, marketUpdatedAt: NOW })
    ];
    const [m] = buildModelMarket([snap(0, 100_000, rows, NOW)], periodOf('1d'), {}).models;
    expect(m.basis.row.id).toBe('t04');
    expect(m.basis.marketUsd).toBeCloseTo(65_000);
    expect(m.latestYear).toBe('1405');
    expect(m.status).toBe('current');
  });
});

describe('مدل حذف‌شده از car.ir', () => {
  it('با آخرین قیمت ثبت‌شده و «توقف تولید» نمایش داده می‌شود', () => {
    const old = snap(-10, 100_000, [row('x', 900_000_000, { modelId: 'gone', model: 'تیبا', year: '1401' }), row('a', 1e9)], NOW);
    const today = snap(0, 100_000, [row('a', 1.1e9)], NOW);
    const { models } = buildModelMarket([old, today], periodOf('1d'), {});
    const gone = models.find((x) => x.key === 'gone')!;
    expect(gone).toMatchObject({ delisted: true, status: 'stopped', lastSeenTs: old.dateTs, change: null });
    expect(gone.basis.row.market).toBe(900_000_000);
    expect(models).toHaveLength(2);
  });
});

describe('خلاصه بازار و برند', () => {
  it('توقف تولید از میانگین بازار کنار گذاشته می‌شود', () => {
    const s0 = snap(-1, 100_000, [row('a', 1e9, { modelId: 'A' }), row('b', 1e9, { modelId: 'B', year: '1401', dealer: null })], NOW);
    const s1 = snap(0, 100_000, [row('a', 1.1e9, { modelId: 'A' }), row('b', 0.5e9, { modelId: 'B', year: '1401', dealer: null })], NOW);
    const { models } = buildModelMarket([s0, s1], periodOf('1d'), {});
    const sum = marketSummary(models);
    expect(sum).toMatchObject({ models: 1, withChange: 1, up: 1, down: 0 });
    expect(sum.tomanPct).toBeCloseTo(10);
    const [ik] = brandSummaries(models);
    expect(ik).toMatchObject({ models: 2, stopped: 1, minToman: 0.5e9, maxToman: 1.1e9 });
  });
});

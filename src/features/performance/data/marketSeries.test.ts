/** خودروهای چندگانه، قیمت دیوار از آبان ۱۴۰۵، چارک بالای مسکن، قیمت دستی، میانگین‌ها و مهاجرت تنظیمات */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/repositories/remoteClient', () => ({ fetchJson: vi.fn() }));
vi.mock('@/shared/store/usdtStore', () => ({ useUsdtHistoryStore: vi.fn() }));
vi.mock('@/features/carMarket/data/store', () => ({ useCarMarketStore: vi.fn() }));
vi.mock('@/features/propertyMarket/data/store', () => ({ usePropertyMarketStore: vi.fn() }));
vi.mock('@/features/custody/data/repository', () => ({ savePref: vi.fn(), useCustodyStore: vi.fn() }));

import { DIVAR_CAR_FROM, averageSeries, carSeries, propertySeries, withManual } from './useMarketSeries';
import { mergeSettings } from './store';
import { activeMarkets, analyzePeriod, geminiPayload } from '../domain/analysis';
import type { CarPriceRow, CarSnapshot } from '@/features/carMarket/domain/types';
import type { PropertyMarketSnapshot } from '@/features/propertyMarket/domain/types';
import type { ManualPricePoint, PerfSettings, ValueRecord } from '../domain/types';

// ⚠️ اعداد فقط ورودی آزمون‌اند
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const row = (p: Partial<CarPriceRow>): CarPriceRow => ({
  id: '58', modelId: '472', brand: 'iran-khodro', model: 'پژو 207 دستی', year: '1404', option: null, market: 100, dealer: 50,
  marketUpdatedAt: null, srcChangePct: null, ...p
});
const snap = (iso: string, rows: CarPriceRow[]): CarSnapshot => ({
  id: `car-${iso}`, day: iso, dateTs: day(iso), source: 'car.ir', usdtRate: null, usdtSource: null, brandNames: {}, rows, createdAt: day(iso)
});

describe('carSeries', () => {
  it('قیمت بازار car.ir (نه کارخانه) تا مهر ۱۴۰۵، سپس دیوار همان مدل و سال', () => {
    const snaps = [
      snap('2026-10-01', [row({ market: 100, dealer: 40 })]),
      snap('2026-10-25', [
        row({ market: 110 }),
        row({ id: 'dv:Peugeot 207i manual TU5:1404', modelId: 'dv:Peugeot 207i manual TU5', source: 'divar', market: 120, n: 3 }),
        row({ id: 'dv:Peugeot 207i manual-normal:1404', modelId: 'dv:Peugeot 207i manual-normal', source: 'divar', market: 130, n: 1 }),
        // سقف شیشه‌ای و سال دیگر نباید وارد شوند
        row({ id: 'dv:Peugeot 207i Manual P:1404', modelId: 'dv:Peugeot 207i Manual P', source: 'divar', market: 999, n: 9 }),
        row({ id: 'dv:Peugeot 207i manual TU5:1403', modelId: 'dv:Peugeot 207i manual TU5', year: '1403', source: 'divar', market: 999, n: 9 })
      ])
    ];
    expect(DIVAR_CAR_FROM).toBe(day('2026-10-23'));
    const s = carSeries(snaps, '472', day('2026-10-01'))!;
    expect(s.id).toBe('car:472');
    // دیوار وزن‌دار (۱۲۰×۳ + ۱۳۰) ÷ ۴ = ۱۲۳؛ car.ir همان روز ۱۱۰ → ضریب ۱۲۳/۱۱۰؛ قبل از آبان ۱۰۰ × ضریب
    const dv = Math.round((120 * 3 + 130) / 4);
    expect(s.points).toEqual([[day('2026-10-01'), Math.round(100 * dv / 110)], [day('2026-10-25'), dv]]);
    expect(s.source).toContain('دیوار');
    expect(s.source).toContain('هم‌تراز');
  });
  it('بدون پرش: درصد تغییر car.ir حفظ، قیمت فعلی دقیقاً دیوار، قیمت دستی قبل از آبان و روز بی‌آگهی بعد از آبان هم‌تراز', () => {
    const dv = (iso: string, market: number) => row({ id: `dv:Peugeot 207i manual TU5:1404`, modelId: 'dv:Peugeot 207i manual TU5', source: 'divar', market, n: 5 });
    const snaps = [
      snap('2026-09-01', [row({ market: 1000 })]),
      snap('2026-10-20', [row({ market: 1100 })]),
      snap('2026-10-24', [row({ market: 1100 }), dv('2026-10-24', 1320)]),
      snap('2026-10-30', [row({ market: 1150 })]),
      snap('2026-11-05', [row({ market: 1200 }), dv('2026-11-05', 1452)])
    ];
    const manual: ManualPricePoint[] = [{ id: 'm', market: 'car:472', dateTs: day('2025-01-01'), price: 500, source: 'منبع' }];
    const s = carSeries(snaps, '472', day('2025-01-01'), manual)!;
    const v = Object.fromEntries(s.points.map(([t, x]) => [new Date(t).toISOString().slice(0, 10), x]));
    // ضریب ۱۳۲۰/۱۱۰۰ = ۱٫۲
    expect(v['2025-01-01']).toBe(600);
    expect(v['2026-09-01']).toBe(1200);
    expect(v['2026-10-20']).toBe(1320);
    expect(v['2026-10-24']).toBe(1320); // روز اتصال: بدون پرش
    expect(v['2026-10-30']).toBe(1380); // بعد از آبان بی‌آگهی دیوار: car.ir × ضریب
    expect(v['2026-11-05']).toBe(1452); // قیمت فعلی = دیوار
    expect(v['2026-10-20'] / v['2026-09-01']).toBeCloseTo(1100 / 1000, 10);
  });
  it('بعد از آبان بدون آگهی کافی دیوار → car.ir', () => {
    const snaps = [snap('2026-10-25', [row({ market: 110 }), row({ id: 'dv:x', modelId: 'dv:Peugeot 207i manual TU5', source: 'divar', market: 120, n: 2 })])];
    expect(carSeries(snaps, '472', day('2026-10-25'))!.points).toEqual([[day('2026-10-25'), 110]]);
  });
  it('قیمت دستی تاریخی قبل از Snapshotها اضافه می‌شود', () => {
    const manual: ManualPricePoint[] = [{ id: 'm', market: 'car:472', dateTs: day('2025-01-01') + 12 * 3_600_000, price: 50, source: 'همراه مکانیک' }];
    const s = carSeries([snap('2026-10-01', [row({ market: 100 })])], '472', day('2025-01-01'), manual)!;
    expect(s.points).toEqual([[day('2025-01-01'), 50], [day('2026-10-01'), 100]]);
    expect(s.source).toContain('همراه مکانیک');
  });
});

describe('propertySeries', () => {
  it('چارک بالا (p75)، نه میانه', () => {
    const ps = {
      dateTs: day('2026-10-01'),
      neighborhoodStats: [],
      groupStats: [{ neighborhoodKey: 'kianpars', displayName: 'کیانپارس', stats: { medianTomanPerM2: 100, meanTomanPerM2: 105, p25TomanPerM2: 80, p75TomanPerM2: 140, listingCount: 10 } }]
    } as unknown as PropertyMarketSnapshot;
    const s = propertySeries([ps], 'kianpars')!;
    expect(s.points).toEqual([[day('2026-10-01'), 140]]);
    expect(s.detail).toContain('چارک بالا');
  });
});

describe('averageSeries / withManual', () => {
  const ser = (id: string, pts: [number, number][]) => ({ id, points: pts, unit: 'toman' as const, frequency: 'snapshot' as const, source: 't', fetchedAt: 0 });
  it('میانگین هم‌وزن از اولین روز مشترک', () => {
    const a = ser('a', [[day('2026-01-01'), 100], [day('2026-02-01'), 200]]);
    const b = ser('b', [[day('2026-01-01'), 300], [day('2026-02-01'), 300]]);
    const avg = averageSeries('car_avg', [a, b], 's', 'd')!;
    // (۲ + ۱) / ۲ = ۱.۵ × میانگین پایه ۲۰۰
    expect(avg.points).toEqual([[day('2026-01-01'), 200], [day('2026-02-01'), 300]]);
    expect(averageSeries('x', [a], 's', 'd')).toBeUndefined();
  });
  it('Snapshot همان روز بر قیمت دستی مقدم است', () => {
    const m = withManual({ points: [[day('2026-01-01'), 100]], source: 'app' }, [{ id: '1', market: 'k', dateTs: day('2026-01-01') + 5, price: 1, source: 's' }], 'k')!;
    expect(m.points).toEqual([[day('2026-01-01'), 100]]);
    expect(m.manualCount).toBe(0);
  });
});

describe('settings & analysis', () => {
  it('تنظیمات قدیمی: خودروها و چهار محله یک بار اضافه، انتخاب قبلی حفظ', () => {
    const s = mergeSettings({ enabledMarkets: ['btc'], carModelId: '999', neighborhoods: ['shahrak-daneshgah'] } as Partial<PerfSettings>);
    expect(s.carModelIds).toEqual(['999', '472', '473', '761', '762']);
    expect(s.neighborhoods).toEqual(['shahrak-daneshgah', 'kianpars', 'kianabad', 'golestan', 'padad']);
    expect(s.enabledMarkets).toEqual(['btc', 'car', 'property']);
    // تنظیمات نسخهٔ ۲ دست نمی‌خورد (کاربر حذف کرده باشد، برنمی‌گردد)
    expect(mergeSettings({ ...s, carModelIds: ['473'] }).carModelIds).toEqual(['473']);
  });
  it('هر مدل یک ردیف + میانگین؛ بازهٔ کوتاه‌تر داده به Gemini می‌رسد', () => {
    const settings = mergeSettings(null);
    const ms = activeMarkets({ ...settings, enabledMarkets: ['car', 'property'] }, { neighborhoods: { kianpars: 'کیانپارس' }, cars: { '472': 'پژو 207 دستی' } });
    expect(ms.map((m) => m.id)).toEqual(['car:472', 'car:473', 'car:761', 'car:762', 'car_avg', 'prop:kianpars', 'prop:kianabad', 'prop:golestan', 'prop:padad', 'prop:shahrak-daneshgah', 'prop_avg']);
    expect(ms[0].name).toBe('خودرو — پژو 207 دستی');

    const rec = (id: string, iso: string): ValueRecord => ({ id, dateTs: day(iso) + 8 * 3_600_000, usd: 1000, rateToman: 100_000, rateSource: 'manual', toman: 100_000_000, note: '', origin: 'manual', createdAt: 0, updatedAt: 0 });
    const rs = [rec('a', '2025-01-01'), rec('b', '2026-11-05')];
    const car = { id: 'car:472', points: [[day('2026-10-01'), 100], [day('2026-11-05'), 110]] as [number, number][], unit: 'toman' as const, frequency: 'snapshot' as const, source: 'car.ir', fetchedAt: 0 };
    const a = analyzePeriod(rs[0], rs[1], rs, [], settings, ms.slice(0, 1), { 'car:472': car });
    expect(a.rows[0].status).toBe('insufficient');
    expect(a.rows[0].sinceDataStart?.change).toBeCloseTo(0.1, 10);
    const p = geminiPayload(a, rs, [], () => 'j', day('2026-11-06'));
    expect(p.markets[0].dataFrom).toBe('2026-10-01');
    expect(p.markets[0].changeSinceDataStart?.change).toBe(0.1);
  });
  it('چند دستگاه خودرو با سرمایهٔ شروع: ۳۰٬۵۰۰ دلار × ۱۰۰٬۰۰۰ تومان ÷ ۴۰۰ میلیون = ۷٫۶۲۵ دستگاه', () => {
    const settings = mergeSettings(null);
    const ms = activeMarkets({ ...settings, enabledMarkets: ['car'], carModelIds: ['472'] }, { neighborhoods: {} });
    const rec = (id: string, iso: string, rate: number): ValueRecord => ({ id, dateTs: day(iso) + 8 * 3_600_000, usd: 30_500, rateToman: rate, rateSource: 'manual', toman: 30_500 * rate, note: '', origin: 'manual', createdAt: 0, updatedAt: 0 });
    const rs = [rec('a', '2025-01-01', 100_000), rec('b', '2026-11-05', 120_000)];
    const car = { id: 'car:472', points: [[day('2025-01-01'), 400_000_000], [day('2026-11-05'), 1_000_000_000]] as [number, number][], unit: 'toman' as const, frequency: 'snapshot' as const, source: 'm', fetchedAt: 0 };
    const a = analyzePeriod(rs[0], rs[1], rs, [], settings, ms, { 'car:472': car });
    expect(a.rows[0].units).toEqual({ count: 7.625, label: 'دستگاه', priceStart: 400_000_000, priceEnd: 1_000_000_000 });
    expect(a.rows[0].endToman).toBe(7_625_000_000);
    const p = geminiPayload(a, rs, [], () => 'j', day('2026-11-06'));
    expect(p.markets[0].unitsBought).toMatchObject({ count: 7.63, unit: 'دستگاه', sellValueEndToman: 7_625_000_000 });
  });
});

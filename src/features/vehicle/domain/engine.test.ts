/** ============================================================
 * Vehicle Investment — تست‌های موتور (خالص)
 *
 *  - Immutable Snapshot: قیمت دلاری در لحظه ثبت، هرگز Recalculate نمی‌شود
 *  - بازدهی تومانی/دلاری جدا · اختلاف نمایندگی/بازار · رتبه‌بندی
 *  - مقایسه با سایر دارایی‌ها (ETH/BTC/XAUT/USDT/دلار)
 *  - داده ناموجود → N/A (هرگز ۰/حدس)
 * ============================================================ */
import { describe, expect, it } from 'vitest';
import {
  buildSnapshot,
  toUsd,
  vehicleReturn,
  vehicleReturnRange,
  dealerMarketGap,
  rankVehicles,
  vehicleStats,
  benchmarkComparison,
  findExistingVehicle,
  BENCHMARK_FA
} from '@/features/vehicle/domain/engine';
import type { Vehicle, VehicleSnapshot } from '@/features/vehicle/domain/types';
import {
  VEHICLES,
  snapshot1Prices,
  SNAPSHOT1_TS,
  SNAPSHOT1_USD_RATE,
  SNAPSHOT1_JALALI,
  SNAPSHOT1_SOURCE
} from '@/features/vehicle/data/dataset';

/** دو خودرو نمونه برای تست */
const TEST_VEHICLES: Vehicle[] = [
  { id: 'v1', brand: 'BrandA', name: 'ModelX', modelYear: '2025', category: 'imported' },
  { id: 'v2', brand: 'BrandB', name: 'ModelY', modelYear: '1405', category: 'domestic' },
  { id: 'v3', brand: 'BrandC', name: 'NoDealer', modelYear: null, category: 'domestic' }
];

function makeSnap(
  ts: number,
  label: string,
  rate: number,
  prices: Record<string, number | null>,
  dealerOverride?: Partial<Record<string, number | null>>
): VehicleSnapshot {
  return buildSnapshot(TEST_VEHICLES, {
    dateTs: ts,
    dateLabel: label,
    usdRate: rate,
    priceSource: 'test',
    marketPrices: prices,
    dealerPrices: {
      v1: 10_000_000_000, // نمایندگی v1
      v2: 5_000_000_000,
      v3: null,
      ...dealerOverride
    }
  });
}

describe('toUsd — محاسبه دلاری در لحظه ثبت', () => {
  it('قیمت دلاری = تومان ÷ نرخ همان روز', () => {
    expect(toUsd(186_500, 186_500)).toBe(1);
    expect(toUsd(18_650_000_000, 186_500)).toBeCloseTo(100_000, 6);
  });
  it('قیمت/نرخ ناموجود → null (N/A — نه ۰)', () => {
    expect(toUsd(null, 186_500)).toBeNull();
    expect(toUsd(1000, 0)).toBeNull();
    expect(toUsd(-5, 186_500)).toBeNull();
  });
});

describe('Immutable Snapshot — تغییر نرخ دلار بعدی هرگز Snapshot قبلی را تغییر نمی‌دهد', () => {
  it('قیمت دلاری Snapshot ثابت می‌ماند حتی اگر نرخ بعدی تغییر کند', () => {
    const snap1 = makeSnap(1000, 'تاریخ ۱', 186_500, { v1: 18_650_000_000, v2: 9_325_000_000, v3: 1_000_000_000 });
    const snap2 = makeSnap(2000, 'تاریخ ۲', 200_000, { v1: 20_000_000_000, v2: 9_000_000_000, v3: 1_100_000_000 });
    // v1 در snap1: 18.65M ÷ 186500 = 100,000 دلار — با نرخ جدید 200k نباید عوض شود
    const r1 = snap1.records.find((r) => r.vehicleId === 'v1')!;
    expect(r1.marketPriceUsd).toBeCloseTo(100_000, 6);
    // محاسبه دستی با نرخ snap2 غلط است:
    expect(r1.marketPriceUsd).not.toBeCloseTo(18_650_000_000 / 200_000, 6);
    // snap2 مستقل:
    const r2 = snap2.records.find((r) => r.vehicleId === 'v1')!;
    expect(r2.marketPriceUsd).toBeCloseTo(100_000, 6);
  });
});

describe('vehicleReturn — بازدهی تومانی و دلاری جدا', () => {
  const snap1 = makeSnap(1000, 'شروع', 186_500, { v1: 10_000_000_000, v2: 10_000_000_000, v3: 5_000_000_000 });
  const snap2 = makeSnap(2000, 'پایان', 250_000, { v1: 15_000_000_000, v2: 8_000_000_000, v3: 5_500_000_000 });

  it('تومانی: +50% برای v1 (10→15 میلیارد)', () => {
    const r = vehicleReturn(snap1, snap2, 'v1', 'market');
    expect(r.tomanChange).toBe(5_000_000_000);
    expect(r.tomanPct).toBeCloseTo(50, 6);
  });

  it('دلاری: v1 از 53,619 به 60,000 → +11.9% (با وجود رشد دلار)', () => {
    const r = vehicleReturn(snap1, snap2, 'v1', 'market');
    expect(r.startUsd).toBeCloseTo(10_000_000_000 / 186_500, 6);
    expect(r.endUsd).toBeCloseTo(15_000_000_000 / 250_000, 6);
    expect(r.usdPct).toBeCloseTo((60_000 / 53_619.3 - 1) * 100, 1);
    expect(r.usdPct).toBeLessThan(r.tomanPct!); // رشد تومانی > رشد دلاری
  });

  it('مثال معکوس: تومان رشد ولی دلار افت (مهم برای سرمایه‌گذاری)', () => {
    // v2: 10→8 میلیارد تومان (افت) — ولی دلار 186.5k→250k
    const r = vehicleReturn(snap1, snap2, 'v2', 'market');
    expect(r.tomanPct).toBeCloseTo(-20, 6);
    expect(r.usdPct).toBeLessThan(r.tomanPct!); // افت دلاری بیشتر
  });

  it('بازدهی نمایندگی (dealer) جدا محاسبه می‌شود', () => {
    // نمایندگی v1: 10→12 میلیارد (متفاوت از بازار 10→15)
    const snapD1 = makeSnap(1000, 'شروع', 186_500, { v1: 10_000_000_000, v2: 1, v3: 1 });
    const snapD2 = makeSnap(2000, 'پایان', 250_000, { v1: 15_000_000_000, v2: 1, v3: 1 }, { v1: 12_000_000_000 });
    const r = vehicleReturn(snapD1, snapD2, 'v1', 'dealer');
    expect(r.startToman).toBe(10_000_000_000); // نمایندگی v1
    // نمایندگی v1 در snapD2 = 12M (override)
    expect(r.endToman).toBe(12_000_000_000);
    expect(r.tomanPct).toBeCloseTo(20, 6);
    // بازدهی بازار همان Position: +50% — دو معیار جدا
    const m = vehicleReturn(snapD1, snapD2, 'v1', 'market');
    expect(m.tomanPct).toBeCloseTo(50, 6);
  });

  it('قیمت ناموجود در هر دو Snapshot → N/A (نه ۰)', () => {
    const r = vehicleReturn(snap1, snap2, 'v3', 'dealer'); // v3 نمایندگی ندارد
    expect(r.startToman).toBeNull();
    expect(r.tomanPct).toBeNull();
  });
});

describe('vehicleReturnRange — بازه انتخابی', () => {
  it('بازه All Time = اولین تا آخرین Snapshot', () => {
    const s1 = makeSnap(1000, 'ت۱', 186_500, { v1: 10_000_000_000, v2: 1, v3: 1 });
    const s2 = makeSnap(2000, 'ت۲', 200_000, { v1: 12_000_000_000, v2: 1, v3: 1 });
    const s3 = makeSnap(3000, 'ت۳', 220_000, { v1: 15_000_000_000, v2: 1, v3: 1 });
    const r = vehicleReturnRange([s1, s2, s3], 'v1', 'market');
    expect(r!.tomanPct).toBeCloseTo(50, 6); // 10→15 میلیارد
    // بازه تا Snapshot دوم (endIndex=1) → 10→12 میلیارد = +20%
    const r2 = vehicleReturnRange([s1, s2, s3], 'v1', 'market', 1);
    expect(r2!.tomanPct).toBeCloseTo(20, 6);
  });
});

describe('dealerMarketGap — اختلاف نمایندگی و بازار', () => {
  it('اختلاف مطلق و درصدی', () => {
    const snap = makeSnap(1000, 'ت', 186_500, { v1: 12_000_000_000, v2: 1, v3: 1 }); // v1 بازار 12M، نمایندگی 10M
    const g = dealerMarketGap(snap, 'v1');
    expect(g.gapToman).toBe(2_000_000_000);
    expect(g.gapPct).toBeCloseTo(20, 6);
  });
  it('بدون نمایندگی → N/A (خطا نمی‌دهد)', () => {
    const snap = makeSnap(1000, 'ت', 186_500, { v1: 1, v2: 1, v3: 1_000_000_000 });
    const g = dealerMarketGap(snap, 'v3');
    expect(g.dealerToman).toBeNull();
    expect(g.gapPct).toBeNull();
  });
});

describe('rankVehicles — رتبه‌بندی', () => {
  const s1 = makeSnap(1000, 'شروع', 186_500, {
    v1: 10_000_000_000, v2: 10_000_000_000, v3: 10_000_000_000
  });
  const s2 = makeSnap(2000, 'پایان', 200_000, {
    v1: 15_000_000_000, // +50%
    v2: 12_000_000_000, // +20%
    v3: 9_000_000_000   // -10%
  });

  it('مرتب‌سازی بر اساس رشد تومانی (نزولی)', () => {
    const ranked = rankVehicles(TEST_VEHICLES, s1, s2, 'toman-pct');
    expect(ranked[0].vehicle.id).toBe('v1');
    expect(ranked[1].vehicle.id).toBe('v2');
    expect(ranked[2].vehicle.id).toBe('v3');
    expect(ranked[0].rank).toBe(1);
  });

  it('مرتب‌سازی «بیشترین کاهش» (worst) → v3 اول', () => {
    const ranked = rankVehicles(TEST_VEHICLES, s1, s2, 'worst');
    expect(ranked[0].vehicle.id).toBe('v3');
  });

  it('مرتب‌سازی دلاری می‌تواند با تومانی متفاوت باشد', () => {
    const rankedUsd = rankVehicles(TEST_VEHICLES, s1, s2, 'usd-pct');
    // v1: دلاری (15000/2)/ (10000/1.865) → 7500/5361.9 = +39.9%
    // v2: (12000/2)/(10000/1.865) = 6000/5361.9 = +11.9%
    // v3: (9000/2)/5361.9 = -16.1%
    expect(rankedUsd[0].vehicle.id).toBe('v1');
    expect(rankedUsd[2].vehicle.id).toBe('v3');
  });

  it('خودرو بدون قیمت در یکی از Snapshot‌ها از رتبه حذف می‌شود (نه ۰)', () => {
    const sBad = makeSnap(2000, 'پایان', 200_000, { v1: 15_000_000_000, v2: null, v3: 9_000_000_000 });
    const ranked = rankVehicles(TEST_VEHICLES, s1, sBad, 'toman-pct');
    expect(ranked.some((r) => r.vehicle.id === 'v2')).toBe(false);
  });
});

describe('vehicleStats — آمار بازه', () => {
  it('میانگین و تعداد رشد/افت', () => {
    const s1 = makeSnap(1000, 'شروع', 186_500, { v1: 10_000_000_000, v2: 10_000_000_000, v3: 10_000_000_000 });
    const s2 = makeSnap(2000, 'پایان', 200_000, { v1: 15_000_000_000, v2: 12_000_000_000, v3: 9_000_000_000 });
    const st = vehicleStats(TEST_VEHICLES, s1, s2);
    expect(st.comparableCount).toBe(3);
    expect(st.avgTomanPct).toBeCloseTo((50 + 20 - 10) / 3, 6);
    expect(st.gainersToman).toBe(2);
    expect(st.losersToman).toBe(1);
  });
});

describe('benchmarkComparison — مقایسه با سایر دارایی‌ها', () => {
  it('ETH: بازدهی دلاری و تومانی (ترکیب با تغییر نرخ دلار)', () => {
    // ETH: 3000 → 3600 دلار (+20%) · دلار: 186.5k → 250k
    const c = benchmarkComparison('ethereum', 3000, 3600, 186_500, 250_000, 10_000_000_000);
    expect(c.usdPct).toBeCloseTo(20, 6);
    // تومانی: 1.2 × (250/186.5) − 1 = +60.86%
    expect(c.tomanPct).toBeCloseTo((1.2 * (250_000 / 186_500) - 1) * 100, 4);
    expect(c.endValueToman).toBeCloseTo(10_000_000_000 * (1 + c.tomanPct! / 100), 4);
  });

  it('دلار (USD): بازدهی دلاری صفر، تومانی = تغییر نرخ', () => {
    const c = benchmarkComparison('usd', 1, 1, 186_500, 250_000, 10_000_000_000);
    expect(c.usdPct).toBeCloseTo(0, 6);
    expect(c.tomanPct).toBeCloseTo((250_000 / 186_500 - 1) * 100, 6);
  });

  it('قیمت تاریخی ناموجود → N/A (نه ۰ و نه حدس)', () => {
    const c = benchmarkComparison('bitcoin', null, 60_000, 186_500, 250_000, 1000);
    expect(c.usdPct).toBeNull();
    expect(c.tomanPct).toBeNull();
    expect(c.endValueToman).toBeNull();
  });

  it('BENCHMARK_FA همه دارایی‌ها را دارد', () => {
    expect(BENCHMARK_FA.ethereum).toBe('ETH');
    expect(BENCHMARK_FA['tether-gold']).toContain('طلا');
    expect(BENCHMARK_FA.usd).toContain('دلار');
  });
});

describe('Dataset اولیه — ۱۸ مرداد ۱۴۰۵', () => {
  it('شامل همه خودروهاست و قیمت بازار هر خودرو > 0', () => {
    expect(VEHICLES.length).toBeGreaterThan(50);
    const { marketPrices, dealerPrices } = snapshot1Prices();
    for (const v of VEHICLES) {
      expect(marketPrices[v.id]).toBeTypeOf('number');
      expect(marketPrices[v.id]!).toBeGreaterThan(0);
      // نمایندگی می‌تواند null باشد (N/A) — ولی اگر هست باید > 0
      if (dealerPrices[v.id] !== null) expect(dealerPrices[v.id]!).toBeGreaterThan(0);
    }
  });

  it('نرخ دلار ثبت‌شده = 186,500 و تاریخ = 18 مرداد 1405', () => {
    expect(SNAPSHOT1_USD_RATE).toBe(186_500);
    expect(SNAPSHOT1_JALALI).toBe('۱۸ مرداد ۱۴۰۵');
    expect(SNAPSHOT1_SOURCE).toContain('میانگین');
    // timestamp یکشنبه ۹ آگوست 2026
    const d = new Date(SNAPSHOT1_TS);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(7); // August
    expect(d.getUTCDate()).toBe(9);
    expect(d.getUTCDay()).toBe(0); // Sunday
  });

  it('Snapshot اول با buildSnapshot ساخته می‌شود و دلاری‌ها در لحظه ثبت می‌شوند', () => {
    const { marketPrices, dealerPrices } = snapshot1Prices();
    const snap = buildSnapshot(VEHICLES, {
      dateTs: SNAPSHOT1_TS,
      dateLabel: SNAPSHOT1_JALALI,
      usdRate: SNAPSHOT1_USD_RATE,
      priceSource: SNAPSHOT1_SOURCE,
      marketPrices,
      dealerPrices
    });
    expect(snap.records.length).toBe(VEHICLES.length);
    // BMW iX3: 16,561,000,000 ÷ 186,500 ≈ 88,799 دلار
    const bmw = snap.records.find((r) => r.vehicleId === 'bmw-ix3-2025')!;
    expect(bmw.marketPriceUsd).toBeCloseTo(16_561_000_000 / 186_500, 2);
    // تویوتا نمایندگی ندارد → null
    const toyota = snap.records.find((r) => r.vehicleId === 'toyota-corolla')!;
    expect(toyota.dealerPriceToman).toBeNull();
    expect(toyota.dealerPriceUsd).toBeNull();
  });
});

/* ================= انتخاب خودرو / ثبت خودرو جدید ================= */
describe('findExistingVehicle — تشخیص خودرو موجود (جلوگیری از ثبت تکراری)', () => {
  it('برند + نام یکسان → خودرو پیدا می‌شود (بدون توجه به فاصله/حروف بزرگ)', () => {
    const found = findExistingVehicle(TEST_VEHICLES, '  branda ', 'modelx');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('v1');
  });

  it('خودروی واقعاً جدید → null (مجاز به ثبت دستی)', () => {
    expect(findExistingVehicle(TEST_VEHICLES, 'چری', 'تیگو ۹')).toBeNull();
    expect(findExistingVehicle(TEST_VEHICLES, 'BMW', 'iX5')).toBeNull();
  });

  it('همان برند ولی مدل متفاوت → null (مدل جدید مجاز است)', () => {
    expect(findExistingVehicle(TEST_VEHICLES, 'BrandA', 'ModelZ')).toBeNull();
  });

  it('برند یا نام خالی → null', () => {
    expect(findExistingVehicle(TEST_VEHICLES, '', 'ModelX')).toBeNull();
    expect(findExistingVehicle(TEST_VEHICLES, 'BrandA', '  ')).toBeNull();
  });
});

describe('ثبت خودرو جدید در Snapshot — بدون تغییر Snapshotهای قبلی', () => {
  it('خودروی جدید به Snapshot جدید اضافه می‌شود و Snapshot قبلی دست‌نخورده می‌ماند', () => {
    const snap1 = makeSnap(1000, 'تاریخ ۱', 186_500, { v1: 10_000_000_000, v2: 1, v3: 1 });
    const newCar: Vehicle = { id: 'new-1', brand: 'چری', name: 'تیگو ۹', modelYear: '1405', category: 'domestic' };
    const all = [...TEST_VEHICLES, newCar];
    const snap2 = buildSnapshot(all, {
      dateTs: 2000,
      dateLabel: 'تاریخ ۲',
      usdRate: 195_000,
      priceSource: 'test',
      marketPrices: { v1: 10_000_000_000, v2: 1, v3: 1, 'new-1': 2_500_000_000 },
      dealerPrices: { 'new-1': 2_000_000_000 }
    });
    // خودروی جدید در snap2 هست
    const rec = snap2.records.find((r) => r.vehicleId === 'new-1')!;
    expect(rec.marketPriceToman).toBe(2_500_000_000);
    expect(rec.marketPriceUsd).toBeCloseTo(2_500_000_000 / 195_000, 6);
    // snap1 دست‌نخورده — خودروی جدید آنجا نیست
    expect(snap1.records.some((r) => r.vehicleId === 'new-1')).toBe(false);
    expect(snap1.records.length).toBe(3);
    expect(snap2.records.length).toBe(4);
  });
});

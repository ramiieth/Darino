/**
 * تست‌ها — TVL Flow Analytics (محاسبات جریان سرمایه)
 */
import { describe, expect, it } from 'vitest';
import {
  computePeriodChanges,
  tvlAt,
  downsample,
  flowLevel,
  rankByUsd,
  FLOW_PERIODS,
  type TvlPoint
} from '@/features/defi/domain/tvlFlow';

const DAY = 86_400;
const NOW = 1_800_000_000;

/** سری روزانه: از ۴۰۰ روز پیش (مقدار پایه) تا امروز با رشد/کاهش ثابت روزانه */
function dailySeries(baseTvl: number, growthPerDay: number): TvlPoint[] {
  const pts: TvlPoint[] = [];
  for (let i = 0; i <= 400; i++) {
    pts.push({ date: NOW - (400 - i) * DAY, tvl: baseTvl * Math.pow(1 + growthPerDay, i) });
  }
  return pts;
}

describe('computePeriodChanges — تغییرات بازه‌ای TVL', () => {
  it('رشد ۱٪ روزانه → هر ۵ بازه صعودی با درصد درست', () => {
    const c = computePeriodChanges(dailySeries(100, 0.01), NOW);
    expect(c[7]?.trend).toBe('up');
    expect(c[365]?.trend).toBe('up');
    // ۷ روز: 1.01^7 − 1 ≈ 7.2٪
    expect(c[7]?.pct).toBeGreaterThan(7);
    expect(c[7]?.pct).toBeLessThan(7.3);
    // ۳۰ روز: 1.01^30 − 1 ≈ 34.8٪
    expect(c[30]?.pct).toBeGreaterThan(34);
    expect(c[30]?.pct).toBeLessThan(35.5);
  });

  it('کاهش → روند نزولی و تغییر دلاری منفی', () => {
    const c = computePeriodChanges(dailySeries(1000, -0.02), NOW);
    expect(c[30]?.trend).toBe('down');
    expect(c[30]?.usd).toBeLessThan(0);
    expect(c[90]?.trend).toBe('down');
  });

  it('بدون تغییر → flat', () => {
    // سری روزانه ثابت ۴۰۰ روزه
    const pts: TvlPoint[] = Array.from({ length: 401 }, (_, i) => ({
      date: NOW - (400 - i) * DAY,
      tvl: 500
    }));
    expect(computePeriodChanges(pts, NOW)[7]?.trend).toBe('flat');
    expect(computePeriodChanges(pts, NOW)[30]?.trend).toBe('flat');
    expect(computePeriodChanges(pts, NOW)[365]?.pct).toBe(0);
  });

  it('سری ناکافی → خالی/ناموجود', () => {
    expect(computePeriodChanges([], NOW)).toEqual({});
    const short = [{ date: NOW - 5 * DAY, tvl: 10 }, { date: NOW, tvl: 11 }];
    expect(computePeriodChanges(short, NOW)[365]).toBeNull();
    expect(computePeriodChanges(short, NOW)[7]).not.toBeNull();
  });

  it('همه بازه‌ها حاضرند', () => {
    const c = computePeriodChanges(dailySeries(100, 0.005), NOW);
    for (const d of FLOW_PERIODS) {
      expect(c[d], `period ${d}`).not.toBeNull();
    }
  });
});

describe('tvlAt — نزدیک‌ترین نقطه', () => {
  it('نقطه نزدیک به هدف را می‌دهد', () => {
    const pts = [
      { date: NOW - 32 * DAY, tvl: 10 },
      { date: NOW - 28 * DAY, tvl: 20 }
    ];
    expect(tvlAt(pts, NOW - 30 * DAY)).toBe(20);
  });

  it('فاصله بیش از ۴ روز → null', () => {
    expect(tvlAt([{ date: NOW - 100 * DAY, tvl: 1 }], NOW - 30 * DAY)).toBeNull();
  });
});

describe('downsample — کاهش نقاط نمودار', () => {
  it('نقاط اضافی حذف و آخرین نقطه حفظ می‌شود', () => {
    const pts = Array.from({ length: 200 }, (_, i) => ({ date: NOW - i, tvl: i }));
    const d = downsample(pts, 52);
    expect(d.length).toBeLessThanOrEqual(53);
    expect(d[d.length - 1]).toEqual(pts[pts.length - 1]);
  });

  it('سری کوتاه دست‌نخورده می‌ماند', () => {
    const pts = [{ date: 1, tvl: 1 }, { date: 2, tvl: 2 }];
    expect(downsample(pts, 52)).toHaveLength(2);
  });
});

describe('flowLevel — طبقه‌بندی Heatmap', () => {
  it('ورود زیاد/کم، بدون تغییر، خروج کم/زیاد', () => {
    expect(flowLevel(20)).toBe(4);
    expect(flowLevel(5)).toBe(3);
    expect(flowLevel(0.5)).toBe(0);
    expect(flowLevel(-5)).toBe(2);
    expect(flowLevel(-20)).toBe(1);
    expect(flowLevel(null)).toBe(0);
    expect(flowLevel(undefined)).toBe(0);
  });
});

describe('rankByUsd — رتبه‌بندی ورود/خروج', () => {
  it('بیشترین ورود و خروج بر اساس تغییر دلاری', () => {
    const rows = [
      { name: 'A', c: { usd: 100, pct: 5, trend: 'up' as const } },
      { name: 'B', c: { usd: -50, pct: -3, trend: 'down' as const } },
      { name: 'C', c: { usd: 500, pct: 10, trend: 'up' as const } },
      { name: 'D', c: { usd: -200, pct: -8, trend: 'down' as const } }
    ];
    const { inflow, outflow } = rankByUsd(rows, (r) => r.c);
    expect(inflow[0].name).toBe('C');
    expect(inflow[1].name).toBe('A');
    expect(outflow[0].name).toBe('D');
    expect(outflow[1].name).toBe('B');
  });

  it('بدون داده → لیست خالی', () => {
    const { inflow, outflow } = rankByUsd([{ name: 'X', c: null }], (r) => r.c);
    expect(inflow).toHaveLength(0);
    expect(outflow).toHaveLength(0);
  });
});

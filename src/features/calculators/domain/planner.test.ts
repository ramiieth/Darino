/**
 * تست‌های برنامهٔ من — خرید پله‌ای، تقسیم سرمایه و رتبه‌بندی دلتا نوترال
 */
import { describe, expect, it } from 'vitest';
import { allocatePlan, calcDeltaNeutral, holdingOf, ladderLots, ladderPlan, LADDER_STYLES, rankDeltaOptions, remainingLots, sellAs, type Lot } from '@/features/calculators/domain';

describe('خرید پله‌ای', () => {
  it('۹۰۰۰ دلار در ۲۰۰۰ / ۱۸۰۰ / ۱۶۰۰ → حدود ۵٫۰۴ واحد با میانگین حدود ۱۷۸۵', () => {
    // قیمت فعلی ۲۵۰۰ با ریزش ۲۰، ۲۸ و ۳۶٪
    const l = ladderPlan(2500, 9000, [20, 28, 36]);
    expect(l.steps.map((s) => s.price)).toEqual([2000, 1800, 1600]);
    expect(l.steps.every((s) => s.usd === 3000)).toBe(true);
    expect(l.totalQty).toBeCloseTo(1.5 + 3000 / 1800 + 1.875, 9);
    expect(l.avgPrice).toBeCloseTo(9000 / l.totalQty, 9);
    expect(l.avgPrice!).toBeLessThan(1800);
    expect(l.deepestDropPct).toBe(36);
  });

  it('سبک‌های آماده عمیق‌ترشان پایین‌تر می‌خرند', () => {
    const c = ladderPlan(2000, 3000, LADDER_STYLES.careful).avgPrice!;
    const d = ladderPlan(2000, 3000, LADDER_STYLES.deep).avgPrice!;
    expect(d).toBeLessThan(c);
  });

  it('مبلغ یا قیمت صفر، ریزش نامعتبر: بدون تقسیم بر صفر', () => {
    expect(ladderPlan(0, 1000, [10]).avgPrice).toBeNull();
    expect(ladderPlan(2000, 0, [10]).avgPrice).toBeNull();
    expect(ladderPlan(2000, 1000, [0, 100, -5, Number.NaN]).steps).toHaveLength(0);
  });
});

describe('تقسیم سرمایه', () => {
  it('ذخیره جدا؛ خرید پله‌ای سهمی از سرمایه‌گذاری؛ بقیه ذخیرهٔ فرصت', () => {
    const a = allocatePlan(5000, 15960, 2000, 75);
    expect(a.total).toBe(22960);
    expect(a.ladder).toBe(11970);
    expect(a.opportunity).toBe(3990);
    expect(a.reserve + a.ladder + a.opportunity + a.delta).toBe(a.total);
  });

  it('ورودی منفی = ۰ و سهم بیش از ۱۰۰ = ۱۰۰', () => {
    const a = allocatePlan(-1, 1000, Number.NaN, 150);
    expect([a.reserve, a.delta, a.ladder, a.opportunity]).toEqual([0, 0, 1000, 0]);
  });
});

describe('رتبه‌بندی دلتا نوترال', () => {
  const leg = (fundingHourly: number, feePct = 0.02) => ({ feePct, fundingHourly, maintenanceMarginFraction: 0.05, markPrice: 100 });

  it('سرمایهٔ ۲۰۰۰ با اهرم ۲ = ۱۰۰۰ مارجین و ۲۰۰۰ ارزش هر طرف؛ همان calcDeltaNeutral؛ بیشترین خالص اول', () => {
    const ranked = rankDeltaOptions(
      [
        { key: 'a', long: leg(0), short: leg(0.00001) },
        { key: 'b', long: leg(0), short: leg(0.00005) }
      ],
      2000,
      2,
      24 * 7
    );
    expect(ranked.map((o) => o.key)).toEqual(['b', 'a']);
    expect(ranked[0].result.capital).toBeCloseTo(2000, 9);
    expect(ranked[0].result.notional).toBe(2000);
    const direct = calcDeltaNeutral({ notional: 2000, leverage: 2, holdHours: 168, cycles: 1, long: leg(0), short: leg(0.00005) });
    expect(ranked[0].result.net).toBe(direct.net);
  });
});

describe('بهای تمام‌شده — FIFO / LIFO / میانگین', () => {
  // ۳٫۳ واحد قبلی در ۲۸۳۰ + سه پله
  const existing: Lot[] = [{ qty: 3.3, unitCost: 2830, at: 1, source: 'existing' }];
  const plan = ladderPlan(2500, 9000, [20, 28, 36]);

  it('میانگین بعد از پر شدن همهٔ پله‌ها حدود ۲۲۰۰؛ با پله‌های کمتر بالاتر', () => {
    const all = holdingOf([...existing, ...ladderLots(plan, 3, 1)]);
    expect(all.qty).toBeCloseTo(3.3 + plan.totalQty, 9);
    expect(all.avgCost).toBeCloseTo((3.3 * 2830 + 9000) / (3.3 + plan.totalQty), 9);
    expect(all.avgCost!).toBeLessThan(2210);
    expect(holdingOf([...existing, ...ladderLots(plan, 1, 1)]).avgCost!).toBeGreaterThan(all.avgCost!);
    expect(holdingOf(existing).avgCost).toBe(2830);
  });

  it('فروش نیمی در ۲۵۰۰: FIFO اول بسته‌های گران قبلی (زیان بیشتر)، LIFO اول پله‌های ارزان (سود)، میانگین بین این دو', () => {
    const lots = [...existing, ...ladderLots(plan, 3, 1)];
    const half = holdingOf(lots).qty / 2;
    const fifo = sellAs(lots, half, 2500, 'fifo');
    const lifo = sellAs(lots, half, 2500, 'lifo');
    const avg = sellAs(lots, half, 2500, 'average');
    expect(fifo.realized).toBeLessThan(avg.realized);
    expect(avg.realized).toBeLessThan(lifo.realized);
    expect(fifo.proceeds).toBe(lifo.proceeds);
    // فروش همه: هر سه روش یک عدد
    const q = holdingOf(lots).qty;
    expect(sellAs(lots, q, 2500, 'fifo').realized).toBeCloseTo(sellAs(lots, q, 2500, 'average').realized, 6);
    expect(sellAs(lots, q, 2500, 'lifo').realized).toBeCloseTo(sellAs(lots, q, 2500, 'average').realized, 6);
  });

  it('فروش‌های قبلی از قدیمی‌ترین بسته‌ها کم می‌شوند؛ بیشتر از موجودی فروخته نمی‌شود', () => {
    const lots: Lot[] = [
      { qty: 1, unitCost: 3000, at: 1, source: 'existing' },
      { qty: 2, unitCost: 2000, at: 2, source: 'existing' }
    ];
    const left = remainingLots(lots, 2.5);
    // ۰٫۵ واحد فروخته‌شده از بستهٔ قدیمی ۳۰۰۰ دلاری کم می‌شود
    expect(left).toEqual([
      { qty: 0.5, unitCost: 3000, at: 1, source: 'existing' },
      { qty: 2, unitCost: 2000, at: 2, source: 'existing' }
    ]);
    expect(holdingOf(left).qty).toBe(2.5);
    expect(holdingOf(left).cost).toBe(0.5 * 3000 + 2 * 2000);
    expect(sellAs(lots, 10, 1000, 'fifo').qty).toBe(3);
    expect(remainingLots(lots, null)).toHaveLength(2);
  });
});

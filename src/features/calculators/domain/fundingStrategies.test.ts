/**
 * تست‌های موتور استراتژی‌های فاندینگ + سلامت دادهٔ استراتژی‌ها
 */
import { describe, expect, it } from 'vitest';
import {
  apyToApr,
  aprToApy,
  carryDays,
  compareStrategies,
  evaluateStrategy,
  intervalToApr,
  inverseLiquidationMovePct,
  liquidationMovePct,
  validateStrategyInputs,
  type StrategyInputs
} from '@/features/calculators/domain';
import { FIELD_META, STRATEGIES, strategyById } from '@/features/calculators/data/fundingStrategies';

const spotPerp = strategyById('spotPerp');
const perpPerp = strategyById('perpPerp');
const lendShort = strategyById('lendShort');
const yr = (days: number) => days / 365;

describe('سالانه‌سازی', () => {
  it('فاندینگ هر بازه → APR و APY ↔ APR', () => {
    expect(intervalToApr(0.01, 8)).toBeCloseTo(10.95, 9);
    expect(intervalToApr(0.00125, 1)).toBeCloseTo(10.95, 9);
    expect(aprToApy(apyToApr(5))).toBeCloseTo(5, 9);
    expect(aprToApy(10)).toBeCloseTo((Math.pow(1 + 0.1 / 365, 365) - 1) * 100, 9);
  });

  it('روزهای وزن‌دار با برگشت فاندینگ', () => {
    expect(carryDays(0, 30)).toBe(30);
    expect(carryDays(0, 30, { flipAfterDays: 10, flipFactor: -1 })).toBe(-10);
    expect(carryDays(0, 30, { carryFactor: 1.5 })).toBe(45);
    expect(carryDays(20, 30, { flipAfterDays: 10, flipFactor: 0.5 })).toBe(5);
  });
});

describe('اسپات–پرپ با فاندینگ مثبت', () => {
  const i = spotPerp.defaults;
  const r = evaluateStrategy(spotPerp.legs, i);
  const N = 10_000 / (1 + 1 / 3 + 0.1);

  it('نوتیونال، درآمد و هزینه‌های تفکیک‌شده', () => {
    expect(r.notional).toBeCloseTo(N, 6);
    expect(r.capitalLocked).toBeCloseTo(10_000, 6);
    expect(r.grossFunding).toBeCloseTo(N * 0.16425 * yr(30), 6);
    expect(r.costs.fees).toBeCloseTo(N * 0.003, 6); // ۰٫۱٪×۲ + ۰٫۰۵٪×۲
    expect(r.costs.slippage).toBeCloseTo(N * 0.0012, 6);
    expect(r.costs.transfer).toBe(15);
    expect(r.net).toBeCloseTo(r.grossFunding - N * 0.0042 - 15, 6);
    expect(r.netAprPct).toBeCloseTo((r.net / 10_000) * (365 / 30) * 100, 6);
    expect(r.capitalEfficiencyPct).toBeCloseTo((1 / 1.43333333333) * 100, 4);
    expect(r.net).toBeGreaterThan(0);
    expect(r.warnings).not.toContain('netNegative');
  });

  it('سربه‌سر: روز و APR', () => {
    const dailyFunding = r.grossFunding / 30;
    expect(r.breakEvenDays).toBeCloseTo((N * 0.0042 + 15) / dailyFunding, 6);
    // با فاندینگ سربه‌سر، سود خالص صفر می‌شود
    const be = evaluateStrategy(spotPerp.legs, { ...i, fundingA: (r.breakEvenCarryAprPct! / 8760) * 8 });
    expect(be.net).toBeCloseTo(0, 6);
  });
});

describe('پرپ–پرپ', () => {
  const i = perpPerp.defaults;
  it('اسپرد فاندینگ دو صرافی', () => {
    const r = evaluateStrategy(perpPerp.legs, i);
    const N = 10_000 / (2 * (1 / 3 + 0.1));
    expect(r.notional).toBeCloseTo(N, 6);
    expect(r.grossFunding).toBeCloseTo(N * 0.3285 * yr(30), 6);
    // لانگ در B با فاندینگ منفی هم دریافت می‌کند
    const neg = evaluateStrategy(perpPerp.legs, { ...i, fundingB: -0.01 });
    expect(neg.grossFunding).toBeCloseTo(N * (0.3285 + 0.1095) * yr(30), 6);
    expect(r.warnings).not.toContain('intervalMismatch');
  });

  it('بازهٔ متفاوت → هشدار؛ برگشت اسپرد → زیان', () => {
    expect(evaluateStrategy(perpPerp.legs, { ...i, intervalB: 1 }).warnings).toContain('intervalMismatch');
    const flip = evaluateStrategy(perpPerp.legs, i, { flipAfterDays: 0, flipFactor: -1 });
    expect(flip.grossFunding).toBeLessThan(0);
    expect(flip.warnings).toContain('netNegative');
  });
});

describe('لندینگ + شورت', () => {
  it('دو درآمد: بهرهٔ لندینگ + فاندینگ', () => {
    const i = lendShort.defaults;
    const r = evaluateStrategy(lendShort.legs, i);
    const N = 10_000 / (1 + 1 / 3 + 0.1);
    expect(r.yieldIncome).toBeCloseTo(N * (apyToApr(5) / 100) * yr(30), 6);
    expect(r.grossFunding).toBeCloseTo(N * 0.1095 * yr(30), 6);
    expect(r.net).toBeCloseTo(r.yieldIncome + r.grossFunding - r.totalCosts, 6);
    // فاندینگ منفی کوچک‌تر از APY → هنوز درآمد carry مثبت
    const neg = evaluateStrategy(lendShort.legs, { ...i, fundingA: -0.002 });
    expect(neg.yieldIncome + neg.grossFunding).toBeGreaterThan(0);
  });
});

describe('سود خالص منفی', () => {
  it('فاندینگ کم و نگهداری کوتاه', () => {
    const r = evaluateStrategy(spotPerp.legs, { ...spotPerp.defaults, fundingA: 0.001, holdDays: 3 });
    expect(r.net).toBeLessThan(0);
    expect(r.warnings).toEqual(expect.arrayContaining(['netNegative', 'breakEvenBeyondHold']));
  });

  it('فاندینگ منفی → سربه‌سر هرگز', () => {
    const r = evaluateStrategy(spotPerp.legs, { ...spotPerp.defaults, fundingA: -0.01 });
    expect(r.breakEvenDays).toBeNull();
  });
});

describe('فاصلهٔ لیکوئیدیشن', () => {
  const i: StrategyInputs = { ...spotPerp.defaults, entryPrice: 1000 };
  const r = evaluateStrategy(spotPerp.legs, i);
  const effLev = 1 / (1 / 3 + 0.1);

  it('شورت خطی با بافر؛ اسپات لیکویید نمی‌شود', () => {
    const expected = ((1 + 1 / effLev) / 1.005 - 1) * 100;
    expect(r.legs[1].liquidationMovePct).toBeCloseTo(expected, 6);
    expect(r.legs[1].liquidationMovePct).toBeCloseTo(liquidationMovePct('short', effLev, 0.005)!, 9);
    expect(r.legs[1].liquidationPrice).toBeCloseTo(1000 * (1 + expected / 100), 6);
    expect(r.legs[0].liquidationMovePct).toBeNull();
    expect(r.nearestLiquidationPct).toBeCloseTo(expected, 6);
  });

  it('اهرم بالا → هشدار فاصله؛ رالی بیش از فاصله → لیکویید و زیان وثیقه', () => {
    expect(evaluateStrategy(spotPerp.legs, { ...i, leverage: 20, marginBufferPct: 0 }).warnings).toContain('liquidationNear');
    const s = evaluateStrategy(spotPerp.legs, i, { priceMovePct: 50 });
    expect(s.legs[1].liquidated).toBe(true);
    expect(s.grossFunding).toBe(0);
    expect(s.pricePnl).toBeCloseTo(-s.legs[1].locked + s.notional * 0.5, 6);
    expect(s.warnings).toContain('liquidated');
  });

  it('رالی کمتر از فاصله → فقط مارجین اضافه', () => {
    const s = evaluateStrategy(spotPerp.legs, i, { priceMovePct: 20 });
    expect(s.legs[1].liquidated).toBe(false);
    expect(s.marginTopUp).toBeCloseTo(s.notional * 0.2, 6);
    expect(s.pricePnl).toBe(0);
  });
});

describe('سایر استراتژی‌ها', () => {
  it('کوین‌مارجین با وثیقهٔ اسپات: بازدهی سرمایه بالاتر و بدون لیکویید', () => {
    const inv = strategyById('inverseShort');
    const r = evaluateStrategy(inv.legs, inv.defaults, { priceMovePct: 80 });
    expect(r.capitalEfficiencyPct).toBeCloseTo(100 / 1.05, 6);
    expect(r.legs[1].liquidationMovePct).toBeNull();
    expect(r.warnings).not.toContain('liquidated');
    expect(inverseLiquidationMovePct('short', 2, 0)).toBeCloseTo(100, 9);
  });

  it('بیسیس سررسیددار: همگرایی و هزینهٔ رول', () => {
    const b = strategyById('basisFutures');
    const r90 = evaluateStrategy(b.legs, b.defaults);
    expect(r90.futuresCarry).toBeCloseTo(r90.notional * 0.02, 6);
    const r180 = evaluateStrategy(b.legs, { ...b.defaults, holdDays: 180 });
    expect(r180.futuresCarry).toBeCloseTo(r180.notional * 0.04, 6);
    expect(r180.costs.fees - r90.costs.fees).toBeCloseTo(r90.notional * 0.001, 6); // یک رول
  });

  it('اسپات معکوس: بهرهٔ قرض هزینه است', () => {
    const rev = strategyById('reverseSpotPerp');
    const r = evaluateStrategy(rev.legs, rev.defaults);
    expect(r.grossFunding).toBeGreaterThan(0);
    expect(r.costs.borrow).toBeCloseTo(r.notional * 0.06 * yr(30), 6);
  });

  it('LST: دیپگ مستقیم زیان است', () => {
    const l = strategyById('lstShort');
    const r = evaluateStrategy(l.legs, l.defaults, { depegPct: 3 });
    expect(r.pricePnl).toBeCloseTo(-r.notional * 0.03, 6);
  });
});

describe('مقایسه و اعتبارسنجی', () => {
  it('رتبه‌بندی بر اساس APR و امتیاز ریسک', () => {
    const rows = compareStrategies(STRATEGIES, { capital: 10_000, holdDays: 30, leverage: 3 });
    expect(rows).toHaveLength(STRATEGIES.length);
    for (let k = 1; k < rows.length; k++) expect(rows[k - 1].result.netAprPct!).toBeGreaterThanOrEqual(rows[k].result.netAprPct!);
    expect(new Set(rows.map((r) => r.rankByRisk)).size).toBe(rows.length);
  });

  it('ورودی نامعتبر', () => {
    const e = validateStrategyInputs({ ...spotPerp.defaults, capital: 0, leverage: 0.5, intervalA: 3 as never, fundingA: 9 });
    expect(Object.keys(e)).toEqual(expect.arrayContaining(['capital', 'leverage', 'intervalA', 'fundingA']));
    expect(validateStrategyInputs(spotPerp.defaults)).toEqual({});
  });
});

describe('دادهٔ استراتژی‌ها', () => {
  it.each(STRATEGIES.map((s) => [s.id, s] as const))('%s کامل و معتبر است', (_, s) => {
    expect(s.legs).toHaveLength(2);
    expect(new Set(s.scenarios.map((x) => x.kind))).toEqual(new Set(['best', 'base', 'stress']));
    expect(s.risks.length).toBeGreaterThan(0);
    expect(s.checklist.length).toBeGreaterThan(0);
    for (const k of [...s.inputs, s.sensitivityKey]) expect(FIELD_META[k]).toBeDefined();
    expect(validateStrategyInputs(s.defaults)).toEqual({});
    for (const sc of s.scenarios) expect(Number.isFinite(evaluateStrategy(s.legs, { ...s.defaults, ...sc.overrides }, sc.stress).net)).toBe(true);
  });
});

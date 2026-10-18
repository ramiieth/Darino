/**
 * تست‌های دفتر سود و زیان دلتا و سناریوی خروج دلتا نوترال —
 * تفکیک ناخالص/هزینه/خالص، سرمایهٔ نهایی، بدون دوباره‌شماری، لیکویید و حساسیت
 */
import { describe, expect, it } from 'vitest';
import { calcDeltaNeutral, deltaLedger, deltaSensitivity, realDeltaNet, type DeltaInput } from '@/features/calculators/domain';

describe('deltaLedger — سازگاری حسابداری', () => {
  it('۱۰۰۰ دلار، ۲۰ دلار سود معاملاتی، ۵ دلار هزینهٔ خالص فاندینگ و سایر → خالص ۱۵، نهایی ۱۰۱۵', () => {
    const l = deltaLedger({ baseCapital: 1000, grossTrading: 20, funding: -3, fees: 0, slippage: 0, otherCosts: 2 });
    expect(l.net).toBe(15);
    expect(l.finalEquity).toBe(1015);
    expect(l.roiPct).toBeCloseTo(1.5, 12);
  });

  it('هر قلم فقط یک بار: خالص = ناخالص + فاندینگ − کارمزد − اسلیپیج − سایر', () => {
    const l = deltaLedger({ baseCapital: 500, grossTrading: 12.5, funding: 4, fees: 3, slippage: 1.25, otherCosts: 6 });
    expect(l.totalCosts).toBeCloseTo(10.25, 12);
    expect(l.net).toBeCloseTo(12.5 + 4 - 10.25, 12);
    expect(l.finalEquity).toBeCloseTo(500 + l.net, 12);
  });

  it('سود ناخالص مثبت ولی خالص منفی پس از هزینه‌ها', () => {
    const l = deltaLedger({ baseCapital: 1000, grossTrading: 5, funding: 1, fees: 4, slippage: 2, otherCosts: 3 });
    expect(l.grossTrading).toBeGreaterThan(0);
    expect(l.net).toBe(-3);
    expect(l.finalEquity).toBe(997);
  });

  it('سرمایهٔ صفر یا نامعتبر: بازده null، هزینهٔ منفی/NaN صفر', () => {
    const l = deltaLedger({ baseCapital: Number.NaN, grossTrading: Number.NaN, funding: 2, fees: -5, slippage: Number.NaN, otherCosts: 0 });
    expect(l.baseCapital).toBe(0);
    expect(l.roiPct).toBeNull();
    expect(l.totalCosts).toBe(0);
    expect(l.net).toBe(2);
  });
});

// Long روی صرافی ارزان‌تر (۱۰۰) · Short روی گران‌تر (۱۰۱)
const BASE: DeltaInput = {
  notional: 10_000,
  leverage: 3,
  holdHours: 24,
  cycles: 1,
  long: { feePct: 0.02, fundingHourly: 0.00001, maintenanceMarginFraction: 0.05, markPrice: 100 },
  short: { feePct: 0.03, fundingHourly: 0.00005, maintenanceMarginFraction: 0.03, markPrice: 101 }
};

describe('دلتا نوترال — سناریوی خروج و مسیر سرمایه', () => {
  it('بدون سناریو و اسلیپیج: سود قیمت صفر و خالص = فاندینگ − کارمزد (رفتار قبلی)', () => {
    const r = calcDeltaNeutral(BASE);
    expect(r.pricePnl).toBe(0);
    expect(r.slippage).toBe(0);
    expect(r.net).toBeCloseTo(r.funding - r.fees, 9);
    expect(r.exitBasis).toBe('keep');
  });

  it('فاندینگ دریافتی در برابر پرداختی', () => {
    const r = calcDeltaNeutral(BASE);
    expect(r.long.funding).toBeCloseTo(-10_000 * 0.00001 * 24, 9);
    expect(r.short.funding).toBeCloseTo(10_000 * 0.00005 * 24, 9);
    const flipped = calcDeltaNeutral({ ...BASE, long: BASE.short, short: BASE.long });
    expect(flipped.funding).toBeCloseTo(-r.funding, 9);
  });

  it('زیان یک طرف = سود طرف دیگر وقتی قیمت هر دو ۱۰٪ بالا می‌رود (اختلاف قیمت ثابت)', () => {
    const r = calcDeltaNeutral({ ...BASE, exit: { priceMovePct: 10, basis: 'keep' } });
    expect(r.long.pricePnl).toBeCloseTo(1000, 9);
    expect(r.short.pricePnl).toBeCloseTo(-1000, 9);
    expect(r.pricePnl).toBeCloseTo(0, 9);
    expect(r.long.exitPrice).toBeCloseTo(110, 9);
    expect(r.short.exitPrice).toBeCloseTo(111.1, 9);
  });

  it('کارمزد ورود روی ارزش ورود، کارمزد خروج روی ارزش خروج', () => {
    const r = calcDeltaNeutral({ ...BASE, exit: { priceMovePct: 10, basis: 'keep' } });
    expect(r.entryFees).toBeCloseTo(10_000 * (0.02 + 0.03) / 100, 9);
    expect(r.exitFees).toBeCloseTo(11_000 * (0.02 + 0.03) / 100, 9);
    expect(r.fees).toBeCloseTo(r.entryFees + r.exitFees, 9);
  });

  it('همگرایی اختلاف قیمت: هر دو طرف سود می‌کنند و سود قیمت ≈ ارزش × اختلاف قیمت', () => {
    const r = calcDeltaNeutral({ ...BASE, exit: { priceMovePct: 0, basis: 'converge' } });
    expect(r.exitBasis).toBe('converge');
    expect(r.long.pricePnl).toBeCloseTo(10_000 * (100.5 / 100 - 1), 9);
    expect(r.short.pricePnl).toBeCloseTo(10_000 * (1 - 100.5 / 101), 9);
    expect(r.long.pricePnl).toBeGreaterThan(0);
    expect(r.short.pricePnl).toBeGreaterThan(0);
    expect(r.pricePnl).toBeCloseTo(10_000 * 100.5 * (1 / 100 - 1 / 101), 9);
  });

  it('سود ناخالص مثبت، خالص منفی با کارمزد و اسلیپیج زیاد', () => {
    const r = calcDeltaNeutral({ ...BASE, holdHours: 0, slippagePct: 0.3, exit: { priceMovePct: 0, basis: 'converge' } });
    expect(r.pricePnl).toBeGreaterThan(0);
    expect(r.net).toBeLessThan(0);
    expect(r.breakEvenPoints).toBeCloseTo(-r.net, 9);
  });

  it('اسلیپیج صفر و غیرصفر: فقط یک بار و جدا از سود قیمت', () => {
    const zero = calcDeltaNeutral({ ...BASE, slippagePct: 0 });
    const some = calcDeltaNeutral({ ...BASE, slippagePct: 0.05, cycles: 2 });
    expect(zero.slippage).toBe(0);
    // ۲ طرف × (ورود + خروج) × ۰٫۰۵٪ × ۲ دور
    expect(some.slippage).toBeCloseTo(2 * 20_000 * 0.0005 * 2, 9);
    expect(some.pricePnl).toBe(0);
    expect(some.net).toBeCloseTo(some.funding - some.fees - some.slippage, 9);
    expect(some.costPerBp).toBeCloseTo(some.volume * 0.0001, 9);
  });

  it('سرمایهٔ نهایی = موجودی دو صرافی پس از بستن + سرمایهٔ آزاد = مبنا + خالص', () => {
    const r = calcDeltaNeutral({ ...BASE, availableCapital: 10_000, slippagePct: 0.01, exit: { priceMovePct: -5, basis: 'converge' } });
    expect(r.ledger.baseCapital).toBe(10_000);
    expect(r.freeCapital).toBeCloseTo(10_000 - r.capital, 9);
    expect(r.long.closingBalance + r.short.closingBalance + r.freeCapital).toBeCloseTo(r.ledger.finalEquity, 9);
    expect(r.ledger.finalEquity).toBeCloseTo(10_000 + r.net, 9);
    expect(r.ledger.roiPct).toBeCloseTo((r.net / 10_000) * 100, 9);
    expect(r.returnPct).toBeCloseTo((r.net / r.capital) * 100, 9);
  });

  it('بدون سرمایهٔ کل: مبنا = مارجین، سرمایهٔ آزاد صفر؛ سرمایهٔ کم → کمبود', () => {
    const r = calcDeltaNeutral(BASE);
    expect(r.ledger.baseCapital).toBeCloseTo(r.capital, 9);
    expect(r.freeCapital).toBeCloseTo(0, 9);
    expect(r.capitalShortfall).toBe(false);
    expect(calcDeltaNeutral({ ...BASE, availableCapital: 1000 }).capitalShortfall).toBe(true);
  });

  it('دلتا: دلاری خالص صفر، مقدار دو طرف به اندازهٔ اختلاف قیمت فرق دارد', () => {
    const r = calcDeltaNeutral(BASE);
    expect(r.netDeltaUsd).toBe(0);
    expect(r.long.quantity).toBeCloseTo(100, 9);
    expect(r.short.quantity).toBeCloseTo(10_000 / 101, 9);
    expect(r.quantityImbalancePct).toBeCloseTo(((100 - 10_000 / 101) / ((100 + 10_000 / 101) / 2)) * 100, 9);
    expect(r.grossExposure).toBe(20_000);
  });

  it('بدون قیمت مارک: همگرایی ممکن نیست → ثابت، مقدار نامعلوم (صفر فرض نمی‌شود)', () => {
    const r = calcDeltaNeutral({ ...BASE, long: { ...BASE.long, markPrice: null }, exit: { priceMovePct: 0, basis: 'converge' } });
    expect(r.exitBasis).toBe('keep');
    expect(r.long.quantity).toBeNull();
    expect(r.quantityImbalancePct).toBeNull();
    expect(r.pricePnl).toBe(0);
  });

  it('لیکویید در سناریو: کل مارجین طرف بازنده، بدون فاندینگ و هزینهٔ خروج آن طرف', () => {
    const lev5 = { ...BASE, leverage: 5 };
    const down = calcDeltaNeutral({ ...lev5, exit: { priceMovePct: -25, basis: 'keep' } });
    expect(down.long.liquidatedAtExit).toBe(true);
    expect(down.short.liquidatedAtExit).toBe(false);
    expect(down.long.pricePnl).toBeCloseTo(-2000, 9);
    expect(down.long.funding).toBe(0);
    expect(down.long.exitFees).toBe(0);
    expect(down.short.pricePnl).toBeCloseTo(2500, 9);
    expect(down.liquidated).toBe(true);
    const up = calcDeltaNeutral({ ...lev5, exit: { priceMovePct: 25, basis: 'keep' } });
    expect(up.short.liquidatedAtExit).toBe(true);
    expect(up.short.pricePnl).toBeCloseTo(-2000, 9);
  });

  it('حرکت قیمت −۱۰۰٪ یا بیشتر قیمت منفی نمی‌سازد', () => {
    const r = calcDeltaNeutral({ ...BASE, leverage: 1, exit: { priceMovePct: -150, basis: 'keep' } });
    expect(r.long.exitPrice).toBe(0);
    expect(Number.isFinite(r.net)).toBe(true);
  });

  it('بازده سالانه فقط روی فاندینگ پس از هزینه است، نه سود قیمت', () => {
    const r = calcDeltaNeutral({ ...BASE, exit: { priceMovePct: 0, basis: 'converge' } });
    expect(r.carry).toBeCloseTo(r.funding - r.fees - r.slippage, 9);
    expect(r.aprOnCapital).toBeCloseTo((r.carry / r.capital) * 365 * 100, 6);
  });
});

describe('حساسیت دلتا نوترال', () => {
  it('حرکت قیمت و مدت نگهداری از همان مدل؛ لیکویید علامت می‌خورد', () => {
    const s = deltaSensitivity({ ...BASE, leverage: 5 }, [-25, 0, 25], [8, 24, 168]);
    expect(s.priceMoves.map((p) => p.liquidated)).toEqual([true, false, true]);
    expect(s.priceMoves[1].net).toBeCloseTo(calcDeltaNeutral({ ...BASE, leverage: 5 }).net, 9);
    // اسپرد مثبت → مدت بیشتر، خالص بیشتر
    expect(s.holds[2].net).toBeGreaterThan(s.holds[1].net);
    expect(s.holds[1].net).toBeGreaterThan(s.holds[0].net);
    expect(s.holds[1].net).toBeCloseTo(calcDeltaNeutral({ ...BASE, leverage: 5, holdHours: 24 }).net, 9);
  });

  it('بزرگ‌ترین قلم؛ همه صفر → null', () => {
    // ۲۴ ساعت: کارمزد ۱۰ دلار > فاندینگ ۹٫۶ · ۷ روز: فاندینگ ۶۷٫۲ دلار
    expect(deltaSensitivity(BASE).driver).toBe('fees');
    expect(deltaSensitivity({ ...BASE, holdHours: 168 }).driver).toBe('funding');
    expect(deltaSensitivity({ ...BASE, exit: { priceMovePct: 0, basis: 'converge' } }).driver).toBe('price');
    const zero = { feePct: 0, fundingHourly: 0, maintenanceMarginFraction: 0.05, markPrice: 100 };
    expect(deltaSensitivity({ ...BASE, long: zero, short: zero }).driver).toBeNull();
  });
});

describe('سود واقعی دلتا — سرمایهٔ نهایی و سربه‌سر اسپرد', () => {
  const base = {
    capitalPerSide: 1000,
    leverage: 2,
    holdDays: 30,
    transferCostUsd: 6,
    spreadHourly: 0.2 / 8760,
    longFeePct: 0,
    shortFeePct: 0.025,
    longSlipPct: 0.01,
    shortSlipPct: 0.01,
    longMmf: 0.03,
    shortMmf: 0.0125
  };

  it('سرمایهٔ نهایی = سرمایهٔ دو طرف + خالص؛ هزینه‌ها یک بار', () => {
    const r = realDeltaNet(base);
    expect(r.costs).toBeCloseTo(r.fees + r.slippage! + r.transfer, 12);
    expect(r.net).toBeCloseTo(r.funding - r.costs!, 9);
    expect(r.finalEquity).toBeCloseTo(2000 + r.net!, 9);
  });

  it('در اسپرد سربه‌سر، سود خالص صفر می‌شود', () => {
    const r = realDeltaNet(base);
    const atBe = realDeltaNet({ ...base, spreadHourly: r.breakEvenSpreadApr! / 8760 / 100 });
    expect(atBe.net).toBeCloseTo(0, 9);
    expect(r.costPerBp).toBeCloseTo(2000 * 4 * 0.0001, 12);
  });

  it('فاندینگ پرداختی (اسپرد منفی) → زیان بیشتر از هزینه‌ها', () => {
    const r = realDeltaNet({ ...base, spreadHourly: -0.1 / 8760 });
    expect(r.funding).toBeLessThan(0);
    expect(r.net!).toBeLessThan(-r.costs!);
  });

  it('اسلیپیج نامعلوم: خالص، هزینهٔ کل، سرمایهٔ نهایی و سربه‌سر اسپرد null؛ سرمایهٔ صفر بدون تقسیم بر صفر', () => {
    const r = realDeltaNet({ ...base, shortSlipPct: null });
    expect([r.net, r.costs, r.finalEquity, r.breakEvenSpreadApr]).toEqual([null, null, null, null]);
    const z = realDeltaNet({ ...base, capitalPerSide: 0 });
    expect(z.capital).toBe(0);
    expect(z.returnPct).toBeNull();
    expect(z.breakEvenSpreadApr).toBeNull();
  });

  it('مدت نگهداری بیشتر با اسپرد مثبت، خالص بیشتر', () => {
    expect(realDeltaNet({ ...base, holdDays: 30 }).net!).toBeGreaterThan(realDeltaNet({ ...base, holdDays: 7 }).net!);
  });
});

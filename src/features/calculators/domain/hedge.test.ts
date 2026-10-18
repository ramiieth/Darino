/**
 * تست‌های ماشین‌حساب پوشش ریسک (هج) — دو نمونهٔ مرجع، مقایسه با سرمایهٔ یکسان، هزینه‌ها،
 * وثیقهٔ نامشخص، لیکویید و حالت‌های مرزی. همهٔ اعداد از فرمول‌ها به دست می‌آیند.
 */
import { describe, expect, it } from 'vitest';
import { calcHedge, hedgePayoff, toNumber, type HedgeInput } from '@/features/calculators/domain';

// ۱۰٬۰۰۰ اسپات · Short ۳٬۰۰۰ · وثیقهٔ فیوچرز ۳٬۰۰۰ (اهرم ۱) · بدون هزینه
const REF: HedgeInput = {
  spot: 10_000,
  shortNotional: 3_000,
  futuresCollateral: 3_000,
  cash: 0,
  dropPct: 25,
  risePct: 18,
  feePct: 0,
  slippagePct: 0,
  fundingPct8h: 0,
  holdDays: 0,
  otherCosts: 0
};

describe('هج — ساختار پرتفوی', () => {
  const r = calcHedge(REF);

  it('سرمایهٔ اولیه، نسبت هج، مواجهه و اهرم مؤثر از هم جدا هستند', () => {
    expect(r.totalStart).toBe(13_000);
    expect(r.ratioPct).toBe(30);
    expect(r.grossExposure).toBe(13_000);
    expect(r.netExposure).toBe(7_000);
    expect(r.effectiveLeverage).toBe(1);
    expect(r.collateralWipeoutPct).toBe(100);
  });

  it('مواجههٔ ناخالص سرمایه نیست: با وثیقهٔ ۱٬۰۰۰ همان ۱۳٬۰۰۰ می‌ماند ولی سرمایه ۱۱٬۰۰۰ است', () => {
    const lev3 = calcHedge({ ...REF, futuresCollateral: 1_000 });
    expect(lev3.grossExposure).toBe(13_000);
    expect(lev3.totalStart).toBe(11_000);
    expect(lev3.effectiveLeverage).toBe(3);
  });
});

describe('نمونهٔ مرجع اول — ریزش ۲۵٪', () => {
  const s = calcHedge(REF).drop;

  it('اسپات، سود Short، موجودی فیوچرز و سرمایهٔ نهایی', () => {
    expect(s.movePct).toBe(-25);
    expect(s.spotEnd).toBe(7_500);
    expect(s.shortGross).toBe(750);
    expect(s.futuresEnd).toBe(3_750);
    expect(s.totalEnd).toBe(11_250);
    expect(s.net).toBe(-1_750);
    expect(s.roiPct).toBeCloseTo(-13.4615384615, 8);
    expect(s.shortRoePct).toBe(25);
  });

  it('بدون هج با همان سرمایه: ۷٬۵۰۰ اسپات + ۳٬۰۰۰ نقد = ۱۰٬۵۰۰؛ مزیت هج ۷۵۰', () => {
    expect(s.unhedgedEnd).toBe(10_500);
    expect(s.unhedgedNet).toBe(-2_500);
    expect(s.hedgeEffectGross).toBe(750);
    expect(s.hedgeEffectNet).toBe(750);
    expect(s.totalEnd! - s.unhedgedEnd!).toBe(s.hedgeEffectNet);
    expect(s.roiDiffPp).toBeCloseTo((750 / 13_000) * 100, 8);
  });
});

describe('نمونهٔ مرجع دوم — رشد ۱۸٪', () => {
  const s = calcHedge(REF).rise;

  it('اسپات، زیان Short، موجودی فیوچرز و سرمایهٔ نهایی', () => {
    expect(s.spotEnd).toBe(11_800);
    expect(s.shortGross).toBe(-540);
    expect(s.futuresEnd).toBe(2_460);
    expect(s.totalEnd).toBe(14_260);
    expect(s.net).toBe(1_260);
    expect(s.roiPct).toBeCloseTo(9.6923076923, 8);
    expect(s.liquidated).toBe(false);
  });

  it('بدون هج: ۱۴٬۸۰۰؛ اثر مالی هج −۵۴۰ (هج در رشد مزیت نشان نمی‌دهد)', () => {
    expect(s.unhedgedEnd).toBe(14_800);
    expect(s.hedgeEffectNet).toBe(-540);
    expect(s.totalEnd! - s.unhedgedEnd!).toBe(-540);
  });
});

describe('هزینه‌ها — هر قلم یک بار', () => {
  const withCosts: HedgeInput = { ...REF, feePct: 0.05, slippagePct: 0.02, fundingPct8h: 0.01, holdDays: 30, otherCosts: 4 };

  it('کارمزد ورود روی ارزش ورود، خروج روی ارزش خروج؛ اسلیپیج هر دو', () => {
    const s = calcHedge(withCosts).drop;
    expect(s.entryFee).toBeCloseTo(3_000 * 0.0005, 12);
    expect(s.exitFee).toBeCloseTo(2_250 * 0.0005, 12);
    expect(s.slippage).toBeCloseTo((3_000 + 2_250) * 0.0002, 12);
  });

  it('فاندینگ دریافتی: ۳ تسویه در روز روی ارزش اسمی', () => {
    const s = calcHedge(withCosts).drop;
    expect(s.funding).toBeCloseTo(3_000 * 0.0001 * 90, 12);
  });

  it('فاندینگ پرداختی (نرخ منفی) زیان است', () => {
    expect(calcHedge({ ...withCosts, fundingPct8h: -0.01 }).rise.funding).toBeCloseTo(-27, 12);
  });

  it('خالص = سود Short + فاندینگ − کارمزد − اسلیپیج − سایر؛ موجودی و سرمایهٔ نهایی سازگار', () => {
    for (const s of [calcHedge(withCosts).drop, calcHedge(withCosts).rise]) {
      const hedgeNet = s.shortGross + s.funding - s.fees - s.slippage - s.otherCosts;
      expect(s.hedgeEffectNet).toBeCloseTo(hedgeNet, 9);
      expect(s.futuresEnd!).toBeCloseTo(3_000 + s.shortGross + s.funding - s.fees - s.slippage, 9);
      expect(s.totalEnd!).toBeCloseTo(s.spotEnd + s.futuresEnd! + s.cashEnd - s.otherCosts, 9);
      expect(s.net!).toBeCloseTo(s.totalEnd! - 13_000, 9);
      expect(s.totalEnd! - s.unhedgedEnd!).toBeCloseTo(s.hedgeEffectNet, 9);
    }
  });

  it('هزینه‌های تخمینی بدون تغییر قیمت', () => {
    const b = calcHedge(withCosts).baseCosts;
    expect(b.fees).toBeCloseTo(3_000 * 0.0005 * 2, 12);
    expect(b.slippage).toBeCloseTo(6_000 * 0.0002, 12);
    expect(b.funding).toBeCloseTo(27, 12);
    expect(b.total).toBeCloseTo(3 + 1.2 + 4 - 27, 12);
  });

  it('وجه نقد مستقل در هر دو حالت یکسان است و مقایسه را تغییر نمی‌دهد', () => {
    const r = calcHedge({ ...REF, cash: 2_000 });
    expect(r.totalStart).toBe(15_000);
    expect(r.drop.totalEnd).toBe(13_250);
    expect(r.drop.unhedgedEnd).toBe(12_500);
    expect(r.drop.hedgeEffectNet).toBe(750);
  });
});

describe('وثیقهٔ نامشخص — از ارزش اسمی حدس زده نمی‌شود', () => {
  const r = calcHedge({ ...REF, futuresCollateral: null });

  it('سرمایهٔ اولیه، موجودی فیوچرز، سرمایهٔ نهایی و بازده null؛ نه ۱۳٬۰۰۰', () => {
    expect(r.totalStart).toBeNull();
    expect(r.effectiveLeverage).toBeNull();
    expect(r.drop.futuresEnd).toBeNull();
    expect(r.drop.totalEnd).toBeNull();
    expect(r.drop.roiPct).toBeNull();
    expect(r.drop.unhedgedEnd).toBeNull();
  });

  it('آنچه بدون وثیقه معلوم است همچنان محاسبه می‌شود', () => {
    expect(r.drop.spotEnd).toBe(7_500);
    expect(r.drop.shortGross).toBe(750);
    expect(r.drop.hedgeEffectNet).toBe(750);
    expect(r.ratioPct).toBe(30);
  });
});

describe('لیکویید Short در رشد شدید', () => {
  it('اهرم ۳ و رشد ۴۰٪: موجودی فیوچرز صفر و زیان Short = کل وثیقه', () => {
    const s = calcHedge({ ...REF, futuresCollateral: 1_000, risePct: 40 }).rise;
    expect(s.liquidated).toBe(true);
    expect(s.futuresEnd).toBe(0);
    expect(s.shortGross).toBe(-1_000);
    expect(s.shortRoePct).toBe(-100);
    expect(s.totalEnd).toBe(14_000);
    expect(s.hedgeEffectNet).toBe(-1_000);
  });

  it('قیمت لیکویید صرافی مقدم است: با حد ۲۰٪، رشد ۲۵٪ لیکویید و رشد ۱۸٪ نه', () => {
    const r = calcHedge({ ...REF, risePct: 25, liquidationRisePct: 20 });
    expect(r.collateralWipeoutPct).toBe(20);
    expect(r.rise.liquidated).toBe(true);
    expect(r.rise.futuresEnd).toBe(0);
    expect(r.drop.liquidated).toBe(false);
    expect(calcHedge({ ...REF, liquidationRisePct: 20 }).rise.liquidated).toBe(false);
  });

  it('رشد بیش از ۱۰۰٪ بریده نمی‌شود', () => {
    const s = calcHedge({ ...REF, risePct: 150 }).rise;
    expect(s.spotEnd).toBe(25_000);
    expect(s.liquidated).toBe(true);
    expect(s.totalEnd).toBe(25_000);
  });

  it('ریزش بیش از ۱۰۰٪ = ۱۰۰٪ (قیمت منفی نمی‌شود)', () => {
    const s = calcHedge({ ...REF, dropPct: 150 }).drop;
    expect(s.spotEnd).toBe(0);
    expect(s.shortGross).toBe(3_000);
  });
});

describe('حالت‌های مرزی', () => {
  it('بدون Short: هج و بدون هج یکسان', () => {
    const r = calcHedge({ ...REF, shortNotional: 0 });
    expect(r.ratioPct).toBe(0);
    expect(r.drop.hedgeEffectNet).toBe(0);
    expect(r.drop.totalEnd).toBe(r.drop.unhedgedEnd);
    expect(r.collateralWipeoutPct).toBeNull();
  });

  it('اسپات صفر: نسبت هج نامعلوم، بدون تقسیم بر صفر', () => {
    const r = calcHedge({ ...REF, spot: 0 });
    expect(r.ratioPct).toBeNull();
    expect(r.drop.totalEnd).toBe(3_750);
    expect(Number.isFinite(r.drop.roiPct!)).toBe(true);
  });

  it('هج ۱۰۰٪ و اهرم ۱: ارزش کل در ریزش و رشد ثابت می‌ماند', () => {
    const r = calcHedge({ ...REF, shortNotional: 10_000, futuresCollateral: 10_000, dropPct: 40, risePct: 40 });
    expect(r.drop.totalEnd).toBe(20_000);
    expect(r.rise.totalEnd).toBe(20_000);
  });

  it('ورودی منفی یا NaN = ۰', () => {
    const r = calcHedge({ ...REF, shortNotional: -50, cash: Number.NaN, risePct: -5, feePct: -1 });
    expect(r.ratioPct).toBe(0);
    expect(r.cash).toBe(0);
    expect(r.rise.spotEnd).toBe(10_000);
    expect(r.rise.fees).toBe(0);
  });
});

describe('toNumber — ورودی متنی', () => {
  it('خالی یا نامعتبر = ۰', () => {
    expect(toNumber('')).toBe(0);
    expect(toNumber('abc')).toBe(0);
    expect(toNumber('.')).toBe(0);
    expect(toNumber('-')).toBe(0);
  });

  it('ارقام فارسی، جداکنندهٔ هزارگان و اعشار فارسی', () => {
    expect(toNumber('۱۰۰۰')).toBe(1000);
    expect(toNumber('1,250.5')).toBe(1250.5);
    expect(toNumber('۲٫۵')).toBe(2.5);
  });
});

describe('منحنی ارزش پرتفوی (hedgePayoff)', () => {
  it('همان اعداد سناریوها؛ مرتب و بدون تکرار؛ ریزش بیش از ۱۰۰٪ حذف', () => {
    const r = calcHedge(REF);
    const p = hedgePayoff(REF, [18, -25, 0, -25, -150]);
    expect(p.map((x) => x.movePct)).toEqual([-25, 0, 18]);
    expect(p[0].hedged).toBe(r.drop.totalEnd);
    expect(p[0].unhedged).toBe(r.drop.unhedgedEnd);
    expect(p[2].hedged).toBe(r.rise.totalEnd);
    expect(p[1].hedged).toBe(13_000);
  });

  it('شیب با هج کمتر است: هج ۳۰٪ یعنی ۷۰٪ حساسیت بدون هج', () => {
    const [a, b] = hedgePayoff(REF, [0, 10]);
    const [c, d] = [a.unhedged!, b.unhedged!];
    expect((b.hedged! - a.hedged!) / (d - c)).toBeCloseTo(0.7, 12);
  });

  it('لیکویید در منحنی دیده می‌شود؛ وثیقهٔ نامشخص → null', () => {
    expect(hedgePayoff({ ...REF, futuresCollateral: 1_000 }, [40])[0].liquidated).toBe(true);
    const u = hedgePayoff({ ...REF, futuresCollateral: null }, [0])[0];
    expect([u.hedged, u.unhedged]).toEqual([null, null]);
  });
});

/**
 * تست‌های اجرا و پایش دلتا — محاسبهٔ ساده در برابر دو تفسیر اجرای ربات، POV، عدم توازن، حد ضرر و جفت واقعی
 */
import { describe, expect, it } from 'vitest';
import { calcDeltaNeutral, calcExecution, liquidationMovePct, pairExposure, type ExecutionInput } from '@/features/calculators/domain';

// ۲۰۰۰ دلار کل = ۱۰۰۰ هر طرف · فاندینگ خالص ۰٫۰۱٪ در ساعت · کارمزد ۰٫۰۲٪ هر طرف
const BASE: ExecutionInput = {
  totalNotional: 2000,
  leverage: 3,
  durationHours: 24,
  long: { feePct: 0.02, builderFeePct: 0, fundingHourly: 0, volume24hUsd: 24_000_000, maintenanceMarginFraction: 0.05, markPrice: 100 },
  short: { feePct: 0.02, builderFeePct: 0, fundingHourly: 0.0001, volume24hUsd: 24_000_000, maintenanceMarginFraction: 0.03, markPrice: 100 },
  stopLossPct: 75,
  lagPct: 5,
  stressMovePct: 5
};

describe('محاسبهٔ ساده در برابر اجرای ربات', () => {
  const r = calcExecution(BASE);

  it('Notional کل نصف‌نصف؛ محاسبهٔ ساده دقیقاً همان دلتا نوترال با ۱۰۰۰ هر طرف', () => {
    expect(r.legNotional).toBe(1000);
    expect(r.totalMargin).toBeCloseTo(2000 / 3, 9);
    const dn = calcDeltaNeutral({
      notional: 1000,
      leverage: 3,
      holdHours: 24,
      cycles: 1,
      long: { feePct: 0.02, fundingHourly: 0, maintenanceMarginFraction: 0.05, markPrice: 100 },
      short: { feePct: 0.02, fundingHourly: 0.0001, maintenanceMarginFraction: 0.03, markPrice: 100 }
    });
    expect(r.simple.net).toBe(dn.net);
    // مثال گزارش: فاندینگ ۲٫۴۰ − کارمزد ۰٫۸۰ = ۱٫۶۰
    expect(r.simple.funding).toBeCloseTo(2.4, 9);
    expect(r.simple.fees).toBeCloseTo(0.8, 9);
    expect(r.simple.net).toBeCloseTo(1.6, 9);
  });

  it('پر شدن در کل مدت: به‌طور میانگین نصف پوزیشن باز → فاندینگ ۱٫۲۰، خالص ۰٫۴۰', () => {
    expect(r.wholeFill.fillHours).toBe(24);
    expect(r.wholeFill.exposureHours).toBe(12);
    expect(r.wholeFill.funding).toBeCloseTo(1.2, 9);
    expect(r.wholeFill.net).toBeCloseTo(0.4, 9);
  });

  it('پر شدن سریع با حجم زیاد ≈ محاسبهٔ ساده', () => {
    // ۱۰۰۰ ÷ (۵۰٪ × ۱٬۰۰۰٬۰۰۰ در ساعت) = ۰٫۰۰۲ ساعت
    expect(r.minDurationHours).toBeCloseTo(0.002, 12);
    expect(r.quickFill.exposureHours).toBeCloseTo(24 - 0.001, 9);
    expect(r.quickFill.net!).toBeCloseTo(r.simple.net, 3);
    expect(r.quickFill.net!).toBeLessThan(r.simple.net);
  });

  it('پر شدن ۲ ساعته: فاندینگ ۲٫۳۰، خالص ۱٫۵۰ (مثال گزارش)', () => {
    // ۱۰۰۰ ÷ (۰٫۵ × حجم ساعتی) = ۲ → حجم ۲۴ساعته = ۲۴٬۰۰۰
    const slow = calcExecution({ ...BASE, long: { ...BASE.long, volume24hUsd: 24_000 }, short: { ...BASE.short, volume24hUsd: 24_000 } });
    expect(slow.minDurationHours).toBeCloseTo(2, 9);
    expect(slow.quickFill.funding).toBeCloseTo(2.3, 9);
    expect(slow.quickFill.net).toBeCloseTo(1.5, 9);
  });

  it('builder fee فقط در ستون‌های ربات؛ محاسبهٔ ساده آن را ندارد', () => {
    const b = calcExecution({ ...BASE, short: { ...BASE.short, builderFeePct: 0.02 } });
    expect(b.fees.builder).toBeCloseTo(0.4, 9);
    expect(b.wholeFill.fees).toBeCloseTo(1.2, 9);
    expect(b.simple.fees).toBeCloseTo(0.8, 9);
  });
});

describe('سهم از حجم بازار (POV) و حداقل مدت', () => {
  it('سهم هر طرف از حجم در طول مدت', () => {
    const r = calcExecution(BASE);
    expect(r.pov.long).toBeCloseTo((1000 / 24_000_000) * 100, 12);
    expect(calcExecution({ ...BASE, durationHours: 1 }).pov.long).toBeCloseTo((1000 / 1_000_000) * 100, 12);
  });

  it('طرف کندتر حداقل مدت را تعیین می‌کند؛ مدت کمتر → هشدار', () => {
    const r = calcExecution({ ...BASE, durationHours: 1, short: { ...BASE.short, volume24hUsd: 12_000 } });
    // ۱۰۰۰ ÷ (۰٫۵ × ۵۰۰ در ساعت) = ۴ ساعت
    expect(r.minDurationHours).toBeCloseTo(4, 9);
    expect(r.durationTooShort).toBe(true);
  });

  it('حجم نامعلوم (اوندو): POV، حداقل مدت و ستون پر شدن سریع نامشخص؛ پر شدن کل مدت همچنان معلوم', () => {
    const r = calcExecution({ ...BASE, short: { ...BASE.short, volume24hUsd: null } });
    expect(r.pov.short).toBeNull();
    expect(r.minDurationHours).toBeNull();
    expect(r.durationTooShort).toBe(false);
    expect(r.quickFill.net).toBeNull();
    expect(r.wholeFill.net).toBeCloseTo(0.4, 9);
  });

  it('بیش از ۲۴ ساعت مجاز نیست', () => {
    expect(calcExecution({ ...BASE, durationHours: 30 }).durationTooLong).toBe(true);
  });
});

describe('عدم توازن', () => {
  it('۵٪ عقب‌ماندگی: ۵۰ دلار بی‌پوشش، ۲٫۵۶٪ → Unbalanced؛ با حرکت ۵٪ قیمت ۲٫۵۰ دلار', () => {
    const i = calcExecution(BASE).imbalance;
    expect(i.netExposureUsd).toBe(50);
    expect(i.netExposurePct).toBeCloseTo((50 / 1950) * 100, 9);
    expect(i.unbalanced).toBe(true);
    expect(i.worstCaseUsd).toBeCloseTo(2.5, 9);
  });

  it('۱٪ عقب‌ماندگی زیر آستانهٔ ۱٪ می‌ماند', () => {
    const i = calcExecution({ ...BASE, lagPct: 1 }).imbalance;
    expect(i.netExposurePct).toBeCloseTo((10 / 1990) * 100, 9);
    expect(i.unbalanced).toBe(false);
  });
});

describe('حد ضرر در برابر لیکویید', () => {
  it('اهرم ۳ و حد ضرر ۷۵٪: روی مارجین ۲۵٪، روی قیمت ۷۵٪؛ لیکویید جدا', () => {
    const s = calcExecution(BASE).stop;
    expect(s.long.marginBasedMovePct).toBe(25);
    expect(s.long.priceBasedMovePct).toBe(75);
    expect(s.long.liquidationMovePct).toBe(liquidationMovePct('long', 3, 0.05));
    expect(s.short.liquidationMovePct).toBe(liquidationMovePct('short', 3, 0.03));
    expect(s.long.marginBasedMovePct!).toBeLessThan(s.long.liquidationMovePct!);
    expect(s.long.priceBasedMovePct!).toBeGreaterThan(s.long.liquidationMovePct!);
  });

  it('بدون سقف: آستانه‌های حد ضرر null', () => {
    const s = calcExecution({ ...BASE, stopLossPct: null }).stop;
    expect(s.long.marginBasedMovePct).toBeNull();
    expect(s.long.priceBasedMovePct).toBeNull();
  });
});

describe('جفت واقعی (پایش)', () => {
  it('Long ۱۰۰۰ و Short ۹۰۰: مواجهه ۱۹۰۰، عدم توازن ۱۰۰ (۵٫۲۶٪) → Unbalanced', () => {
    const e = pairExposure([
      { side: 'long', notional: 1000, unrealizedPnl: 12 },
      { side: 'short', notional: -900, unrealizedPnl: -10 }
    ]);
    expect(e.totalUsd).toBe(1900);
    expect(e.netUsd).toBe(100);
    expect(e.netPct).toBeCloseTo((100 / 1900) * 100, 9);
    expect(e.unbalanced).toBe(true);
    expect(e.unrealizedPnl).toBe(2);
    expect(e.partial).toBe(false);
  });

  it('ارزش یا سود/زیان نامعلوم صفر فرض نمی‌شود', () => {
    const e = pairExposure([
      { side: 'long', notional: null, unrealizedPnl: null },
      { side: 'short', notional: 500, unrealizedPnl: 1 }
    ]);
    expect(e.partial).toBe(true);
    expect(e.unrealizedPnl).toBeNull();
  });
});

/**
 * تست‌های ماشین‌حساب هج — مثال متن آموزشی، کارمزد، تقسیم بر صفر و ورودی متنی
 */
import { describe, expect, it } from 'vitest';
import { calcHedge, toNumber, type HedgeInput } from '@/features/calculators/domain';

const DEFAULTS: HedgeInput = { spot: 1000, short: 300, dropPct: 25, risePct: 18, fee: 0 };

describe('هج — مقادیر پیش‌فرض (مثال متن آموزشی)', () => {
  const r = calcHedge(DEFAULTS);

  it('نسبت هج ۳۰٪', () => {
    expect(r.ratioPct).toBe(30);
  });

  it('ریزش ۲۵٪ ← اسپات ۷۵۰، Short ۳۷۵، مجموع ۱۱۲۵', () => {
    expect(r.drop.spotValue).toBe(750);
    expect(r.drop.shortValue).toBe(375);
    expect(r.drop.total).toBe(1125);
    expect(r.drop.unhedged).toBe(750);
    expect(r.drop.diff).toBe(375);
    expect(r.drop.diffPct).toBe(50);
  });

  it('رشد ۱۸٪ ← اسپات ۱۱۸۰، Short ۲۴۶، مجموع ۱۴۲۶', () => {
    expect(r.rise.spotValue).toBe(1180);
    expect(r.rise.shortValue).toBe(246);
    expect(r.rise.total).toBe(1426);
    expect(r.rise.unhedged).toBe(1180);
    expect(r.rise.diff).toBe(246);
  });
});

describe('هج — کارمزد و حالت‌های مرزی', () => {
  it('کارمزد از مجموع هر دو سناریو کم می‌شود', () => {
    const r = calcHedge({ ...DEFAULTS, fee: 10 });
    expect(r.drop.fee).toBe(10);
    expect(r.drop.total).toBe(1115);
    expect(r.rise.total).toBe(1416);
    expect(r.rise.diff).toBe(236);
  });

  it('بدون Short، مجموع برابر «بدون هج» است', () => {
    const r = calcHedge({ ...DEFAULTS, short: 0 });
    expect(r.ratioPct).toBe(0);
    expect(r.drop.diff).toBe(0);
    expect(r.rise.diff).toBe(0);
  });

  it('ارزش اسپات صفر: بدون تقسیم بر صفر (نسبت و درصد = ۰)', () => {
    const r = calcHedge({ ...DEFAULTS, spot: 0 });
    expect(r.ratioPct).toBe(0);
    expect(r.drop.diffPct).toBe(0);
    expect(r.rise.diffPct).toBe(0);
    expect(Number.isFinite(r.drop.total)).toBe(true);
    expect(r.drop.total).toBe(375);
  });

  it('ورودی منفی = ۰ و درصد بیش از ۱۰۰ = ۱۰۰', () => {
    const r = calcHedge({ spot: 1000, short: -50, dropPct: 150, risePct: -5, fee: -3 });
    expect(r.ratioPct).toBe(0);
    expect(r.drop.spotValue).toBe(0);
    expect(r.rise.spotValue).toBe(1000);
    expect(r.rise.fee).toBe(0);
  });

  it('هج ۱۰۰٪ در ریزش، ارزش کل را حفظ می‌کند', () => {
    const r = calcHedge({ spot: 1000, short: 1000, dropPct: 40, risePct: 40, fee: 0 });
    expect(r.drop.total).toBe(2000);
    expect(r.rise.total).toBe(2000);
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

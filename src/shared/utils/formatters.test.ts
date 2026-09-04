/**
 * تست‌ها — قالب‌بندی قیمت (fmtUSD): اعداد بزرگ، قیمت‌های ریز، استیبل‌کوین
 */
import { describe, expect, it } from 'vitest';
import { fmtUSD, fmtPct, fmtToman, fmtRelativeAge } from '@/shared/utils/formatters';

describe('fmtUSD — نمایش قیمت دلاری', () => {
  it('اعداد بزرگ: دو رقم اعشار با جداکننده هزارگان', () => {
    expect(fmtUSD(36_900)).toBe('$36,900.00');
    expect(fmtUSD(64_519.123)).toBe('$64,519.12');
    expect(fmtUSD(1_000_000)).toBe('$1,000,000.00');
  });

  it('قیمت‌های ریز (زیر ۰.۰۱ دلار): ۴ رقم معنادار — بدون $0.00', () => {
    expect(fmtUSD(0.0000047)).toBe('$0.0000047'); // SHIB
    expect(fmtUSD(0.0000028)).toBe('$0.0000028'); // PEPE
    expect(fmtUSD(0.0002)).toBe('$0.0002'); // HTX
  });

  it('قیمت‌های ۰.۰۱ تا ۱ دلار: تا ۶ رقم اعشار', () => {
    expect(fmtUSD(0.0174)).toBe('$0.0174'); // VET
    expect(fmtUSD(0.5)).toBe('$0.50');
    expect(fmtUSD(0.9995)).toBe('$0.9995'); // USDC/USDT نزدیک ۱
  });

  it('قیمت یک دلار و بالاتر: دو رقم اعشار', () => {
    expect(fmtUSD(1)).toBe('$1.00');
    expect(fmtUSD(1.005)).toBe('$1.01');
  });

  it('مقادیر نامعتبر → N/A', () => {
    expect(fmtUSD(null)).toBe('N/A');
    expect(fmtUSD(undefined)).toBe('N/A');
    expect(fmtUSD(NaN)).toBe('N/A');
  });

  it('حالت compact برای اعداد خیلی بزرگ', () => {
    expect(fmtUSD(1_290_000_000_000, true)).toBe('$1.3T');
    expect(fmtUSD(72_100_000, true)).toBe('$72.1M');
  });
});

describe('fmtPct — درصد لاتین', () => {
  it('علامت صریح مثبت/منفی', () => {
    expect(fmtPct(2.41)).toBe('+2.41%');
    expect(fmtPct(-1.2)).toBe('-1.20%');
    expect(fmtPct(null)).toBe('N/A');
  });
});

describe('fmtToman — معادل تومانی با ارقام فارسی', () => {
  it('میلیارد تومان', () => {
    expect(fmtToman(36_900, 1_480_000)).toContain('میلیارد تومان');
    expect(fmtToman(36_900, 1_480_000)).toMatch(/[۰-۹]/);
  });
});

describe('fmtRelativeAge — سن نسبی داده (ارقام فارسی)', () => {
  const now = 1_700_000_000_000;

  it('کمتر از ۱۰ ثانیه → همین الان', () => {
    expect(fmtRelativeAge(now - 5000, now)).toBe('همین الان');
  });

  it('ثانیه → ارقام فارسی', () => {
    expect(fmtRelativeAge(now - 45_000, now)).toBe('۴۵ ثانیه پیش');
  });

  it('دقیقه → ارقام فارسی', () => {
    expect(fmtRelativeAge(now - 3 * 60_000, now)).toBe('۳ دقیقه پیش');
    expect(fmtRelativeAge(now - 61 * 60_000, now)).toBe('۱ ساعت پیش');
  });

  it('ساعت و روز', () => {
    expect(fmtRelativeAge(now - 5 * 3600_000, now)).toBe('۵ ساعت پیش');
    expect(fmtRelativeAge(now - 2 * 86_400_000, now)).toBe('۲ روز پیش');
  });

  it('مقادیر نامعتبر → خط تیره', () => {
    expect(fmtRelativeAge(null, now)).toBe('—');
    expect(fmtRelativeAge(undefined, now)).toBe('—');
    expect(fmtRelativeAge(NaN, now)).toBe('—');
  });
});

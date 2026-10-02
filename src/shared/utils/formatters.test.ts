/**
 * تست‌ها — قالب‌بندی قیمت (fmtUSD): اعداد بزرگ، قیمت‌های ریز، استیبل‌کوین
 */
import { describe, expect, it } from 'vitest';
import { fmtUSD, fmtUsdSigned, fmtPct, fmtToman, fmtRelativeAge } from '@/shared/utils/formatters';

describe('fmtUSD — نمایش قیمت دلاری', () => {
  it('اعداد بزرگ: دو رقم اعشار با جداکننده هزارگان', () => {
    expect(fmtUSD(36_900)).toBe('۳۶,۹۰۰.۰۰ دلار');
    expect(fmtUSD(64_519.123)).toBe('۶۴,۵۱۹.۱۲ دلار');
    expect(fmtUSD(1_000_000)).toBe('۱,۰۰۰,۰۰۰.۰۰ دلار');
  });

  it('قیمت‌های ریز (زیر ۰.۰۱ دلار): ۴ رقم معنادار — بدون $0.00', () => {
    expect(fmtUSD(0.0000047)).toBe('۰.۰۰۰۰۰۴۷ دلار'); // SHIB
    expect(fmtUSD(0.0000028)).toBe('۰.۰۰۰۰۰۲۸ دلار'); // PEPE
    expect(fmtUSD(0.0002)).toBe('۰.۰۰۰۲ دلار'); // HTX
  });

  it('قیمت‌های ۰.۰۱ تا ۱ دلار: تا ۶ رقم اعشار', () => {
    expect(fmtUSD(0.0174)).toBe('۰.۰۱۷۴ دلار'); // VET
    expect(fmtUSD(0.5)).toBe('۰.۵۰ دلار');
    expect(fmtUSD(0.9995)).toBe('۰.۹۹۹۵ دلار'); // USDC/USDT نزدیک ۱
  });

  it('قیمت یک دلار و بالاتر: دو رقم اعشار', () => {
    expect(fmtUSD(1)).toBe('۱.۰۰ دلار');
    expect(fmtUSD(1.005)).toBe('۱.۰۱ دلار');
  });

  it('مقادیر نامعتبر → «—»', () => {
    expect(fmtUSD(null)).toBe('—');
    expect(fmtUSD(undefined)).toBe('—');
    expect(fmtUSD(NaN)).toBe('—');
  });

  it('حالت compact برای اعداد خیلی بزرگ', () => {
    expect(fmtUSD(1_290_000_000_000, true)).toBe('۱.۳ تریلیون دلار');
    expect(fmtUSD(72_100_000, true)).toBe('۷۲.۱ میلیون دلار');
  });

  it('منفی: علامت پیش از نماد ارز (نه «$-12.50»)', () => {
    expect(fmtUSD(-12.5)).toBe('-۱۲.۵۰ دلار');
    expect(fmtUSD(-72_100_000, true)).toBe('-۷۲.۱ میلیون دلار');
    expect(fmtUSD(-0.5)).toBe('-۰.۵۰ دلار');
  });
});

describe('fmtUsdSigned — سود/زیان دلاری با علامت صریح', () => {
  it('مثبت/منفی/صفر/نامشخص', () => {
    expect(fmtUsdSigned(12.5)).toBe('+۱۲.۵۰ دلار');
    expect(fmtUsdSigned(-12.5)).toBe('-۱۲.۵۰ دلار');
    expect(fmtUsdSigned(0)).toBe('۰.۰۰ دلار');
    expect(fmtUsdSigned(null)).toBe('—');
    // amounts never use the sub-dollar price precision
    expect(fmtUsdSigned(-0.657706)).toBe('-۰.۶۶ دلار');
    expect(fmtUsdSigned(0.025306)).toBe('+۰.۰۳ دلار');
  });
});

describe('fmtPct — درصد لاتین', () => {
  it('علامت صریح مثبت/منفی', () => {
    expect(fmtPct(2.41)).toBe('+۲.۴۱٪');
    expect(fmtPct(-1.2)).toBe('-۱.۲۰٪');
    expect(fmtPct(null)).toBe('—');
  });
});

describe('سیاست اعداد: ارقام فارسی با «,» و «.» — هیچ رقم انگلیسی', () => {
  it('هیچ خروجی رقم لاتین یا «$» یا «٬/٫» ندارد', () => {
    for (const out of [fmtUSD(1234.23), fmtUSD(0.5), fmtUSD(5e9, true), fmtUsdSigned(-3.2), fmtPct(12.345), fmtToman(100, 150000)]) {
      expect(out).not.toMatch(/[0-9$٬٫]/);
    }
    expect(fmtUSD(1234.23)).toBe('۱,۲۳۴.۲۳ دلار');
  });
});

describe('fmtToman — معادل تومانی با ارقام فارسی', () => {
  it('میلیارد تومان', () => {
    expect(fmtToman(36_900, 148_000)).toContain('میلیارد تومان');
    expect(fmtToman(36_900, 148_000)).toMatch(/[۰-۹]/);
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

/**
 * تست‌ها — موتور تاریخ مشترک (شمسی ↔ میلادی)
 */
import { describe, expect, it } from 'vitest';
import {
  toJalaali,
  toGregorian,
  gregorianToTimestamp,
  isLeapJalaliYear,
  jalaliMonthLength,
  isValidJalali,
  jalaaliToTimestamp,
  parseJalali,
  parseJalaliToTs,
  formatJalali,
  formatGregorianIso,
  formatDualDate
} from '@/shared/utils/jalali';

describe('تبدیل شمسی ↔ میلادی (نقاط مرجع)', () => {
  it('نوروز ۱۴۰۵ = ۱ فروردین ۱۴۰۵ = ۲۰۲۶-۰۳-۲۱', () => {
    expect(toGregorian(1405, 1, 1)).toEqual({ year: 2026, month: 3, day: 21 });
    expect(toJalaali(2026, 3, 21)).toEqual({ year: 1405, month: 1, day: 1 });
  });

  it('نوروز ۱۴۰۴ = ۲۰۲۵-۰۳-۲۱', () => {
    expect(toGregorian(1404, 1, 1)).toEqual({ year: 2025, month: 3, day: 21 });
  });

  it('نوروز ۱۳۵۴ = ۱۹۷۵-۰۳-۲۱', () => {
    expect(toGregorian(1354, 1, 1)).toEqual({ year: 1975, month: 3, day: 21 });
  });

  it('۱ مهر ۱۴۰۰ = ۲۰۲۱-۰۹-۲۳', () => {
    expect(toGregorian(1400, 7, 1)).toEqual({ year: 2021, month: 9, day: 23 });
  });

  it('۲۹ اسفند ۱۴۰۴ = ۲۰۲۶-۰۳-۲۰ (سال غیرکبیسه)', () => {
    expect(toGregorian(1404, 12, 29)).toEqual({ year: 2026, month: 3, day: 20 });
  });

  it('۳۰ اسفند ۱۴۰۳ = ۲۰۲۵-۰۳-۲۰ (سال کبیسه)', () => {
    expect(toGregorian(1403, 12, 30)).toEqual({ year: 2025, month: 3, day: 20 });
  });
});

describe('کبیسه و طول ماه', () => {
  it('۱۴۰۳ کبیسه است، ۱۴۰۴ نیست', () => {
    expect(isLeapJalaliYear(1403)).toBe(true);
    expect(isLeapJalaliYear(1404)).toBe(false);
  });

  it('طول ماه‌ها: ۶ ماه اول ۳۱، ۵ ماه بعد ۳۰، اسفند ۲۹/۳۰', () => {
    expect(jalaliMonthLength(1404, 1)).toBe(31);
    expect(jalaliMonthLength(1404, 6)).toBe(31);
    expect(jalaliMonthLength(1404, 7)).toBe(30);
    expect(jalaliMonthLength(1404, 11)).toBe(30);
    expect(jalaliMonthLength(1404, 12)).toBe(29);
    expect(jalaliMonthLength(1403, 12)).toBe(30);
  });

  it('اعتبارسنجی تاریخ', () => {
    expect(isValidJalali(1404, 12, 30)).toBe(false);
    expect(isValidJalali(1404, 13, 1)).toBe(false);
    expect(isValidJalali(1404, 5, 17)).toBe(true);
  });
});

describe('بازگشت دورهای (round-trip)', () => {
  it('شمسی → میلادی → شمسی', () => {
    for (const [jy, jm, jd] of [
      [1405, 1, 1],
      [1404, 5, 17],
      [1403, 12, 30],
      [1370, 7, 15],
      [1300, 11, 29]
    ] as const) {
      const g = toGregorian(jy, jm, jd);
      expect(toJalaali(g.year, g.month, g.day)).toEqual({ year: jy, month: jm, day: jd });
    }
  });
});

describe('پارس و قالب‌بندی', () => {
  it('پارس ارقام فارسی و لاتین', () => {
    expect(parseJalali('۱۴۰۴/۰۵/۱۷')).toEqual({ year: 1404, month: 5, day: 17 });
    expect(parseJalali('1404/5/17')).toEqual({ year: 1404, month: 5, day: 17 });
    expect(parseJalali('1404-05-17')).toEqual({ year: 1404, month: 5, day: 17 });
    expect(parseJalali('1404/13/1')).toBeNull();
    expect(parseJalali('abc')).toBeNull();
  });

  it('timestamp → فرمت فارسی و ایزو', () => {
    const ts = jalaaliToTimestamp(1405, 5, 17);
    expect(formatJalali(ts)).toBe('۱۴۰۵/۰۵/۱۷');
    expect(formatGregorianIso(ts)).toBe('2026-08-08'); // ۱۴۰۵/۰۵/۱۷ = ۲۰۲۶/۰۸/۰۸
    expect(parseJalaliToTs('1405/05/17')).toBe(ts);
    expect(formatDualDate(ts)).toContain('شمسی');
    expect(formatDualDate(ts)).toContain('میلادی');
  });

  it('تاریخ معادل امروز (۲۰۲۶-۰۸-۰۷) = ۱۴۰۵/۰۵/۱۶', () => {
    const ts = gregorianToTimestamp(2026, 8, 7);
    expect(formatJalali(ts)).toBe('۱۴۰۵/۰۵/۱۶');
  });

  it('تاریخ معادل امروز شمسی با تقویم واقعی هماهنگ است', () => {
    const now = Date.now();
    const d = new Date(now);
    const j = toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
    // تبدیل معکوس همان تاریخ امروز را بدهد
    const g = toGregorian(j.year, j.month, j.day);
    expect(g).toEqual({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
  });
});

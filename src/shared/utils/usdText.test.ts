import { describe, expect, it } from 'vitest';
import { stripBidi, usdText as raw } from './formatters';

const usdText = (...a: Parameters<typeof raw>) => stripBidi(raw(...a));

describe('usdText — سیاست ارز', () => {
  it('بدون «$»، ارقام فارسی، همیشه دو رقم اعشار', () => {
    expect(usdText(23605)).toBe('۲۳,۶۰۵.۰۰ دلار');
    expect(usdText(-7268.456)).toBe('-۷,۲۶۸.۴۶ دلار');
    expect(usdText(12.5, { signed: true })).toBe('+۱۲.۵۰ دلار');
    expect(usdText(0)).toBe('۰.۰۰ دلار');
    expect(usdText(null)).toBe('—');
  });
  it('compact برای اعداد بزرگ', () => {
    expect(usdText(1_250_000, { compact: true })).toBe('۱.۳ میلیون دلار');
    expect(usdText(-30_000, { compact: true })).toBe('-۳۰ هزار دلار');
    expect(usdText(250, { compact: true })).toBe('۲۵۰.۰۰ دلار');
  });
  it('جهت جدا: عدد داخل LRI و کل عبارت داخل RLI؛ اعلان‌ها ساده', () => {
    expect(raw(-12.5)).toBe('\u2067\u2066-۱۲.۵۰\u2069 دلار\u2069');
    expect(raw(1_250_000, { compact: true })).toBe('\u2067\u2066۱.۳\u2069 میلیون دلار\u2069');
    expect(raw(5, { plain: true })).toBe('۵.۰۰ دلار');
  });
});

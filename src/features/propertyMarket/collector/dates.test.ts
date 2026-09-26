/**
 * تاریخ انتشار/آخرین به‌روزرسانی آگهی و «کلید اول» — متن واقعی دیوار/شیپور
 */
import { describe, it, expect } from 'vitest';
import { detectFirstKey, findDivarDates, parseDivarDatesText, parseJalaliDateTimeFa, parseRelativeAgeFa } from './dates';

// متن واقعی صفحه جزئیات دیوار (مهر ۱۴۰۵)
const REAL = 'انتشار آگهی: ۵ شهریور ۱۴۰۵، ۱۸:۱۲\nآخرین نردبان: ۴ مهر ۱۴۰۵، ۱۸:۵۹\nآخرین به‌روز‌رسانی: ۴ مهر ۱۴۰۵، ۱۸:۵۹';

describe('تاریخ شمسی', () => {
  it('«۴ مهر ۱۴۰۵، ۱۸:۵۹» به وقت تهران', () => {
    expect(new Date(parseJalaliDateTimeFa('۴ مهر ۱۴۰۵، ۱۸:۵۹')!).toISOString()).toBe('2026-09-26T15:29:00.000Z');
    expect(new Date(parseJalaliDateTimeFa('۱ فروردین ۱۴۰۵')!).toISOString().slice(0, 10)).toBe('2026-03-21');
    expect(parseJalaliDateTimeFa('۳۵ مهر ۱۴۰۵')).toBeNull();
    expect(parseJalaliDateTimeFa('بی‌تاریخ')).toBeNull();
  });
  it('بلوک تاریخ‌های دیوار', () => {
    const d = parseDivarDatesText(REAL);
    expect(new Date(d.publishedAt!).toISOString().slice(0, 10)).toBe('2026-08-27');
    expect(d.bumpedAt).toBe(d.updatedAt);
    expect(new Date(d.updatedAt!).toISOString().slice(0, 10)).toBe('2026-09-26');
  });
  it('جست‌وجوی بازگشتی در ساختار واقعی (EXPANDABLE_SECTION)', () => {
    const detail = { sections: [{}, { widgets: [{}, { widget_type: 'EXPANDABLE_SECTION', data: { widget_list: [{ data: { text: REAL } }] } }] }] };
    expect(findDivarDates(detail)?.updatedAt).not.toBeNull();
    expect(findDivarDates({ sections: [] })).toBeNull();
  });
});

describe('برچسب نسبی (شیپور)', () => {
  const now = Date.parse('2026-09-26T12:00:00Z');
  const D = 86_400_000;
  it('ساعاتی/دقایقی پیش، دیروز، N روز/هفته/ماه', () => {
    expect(parseRelativeAgeFa('ساعاتی پیش', now)).toBe(now);
    expect(parseRelativeAgeFa('دقایقی پیش', now)).toBe(now);
    expect(parseRelativeAgeFa('دیروز', now)).toBe(now - D);
    expect(parseRelativeAgeFa('3 روز پیش', now)).toBe(now - 3 * D);
    expect(parseRelativeAgeFa('۲ هفته پیش', now)).toBe(now - 14 * D);
    expect(parseRelativeAgeFa('2 هفته پیش', now)).toBe(now - 14 * D);
    expect(parseRelativeAgeFa('۳ ماه پیش', now)).toBe(now - 90 * D);
    expect(parseRelativeAgeFa('یک ماه پیش', now)).toBe(now - 30 * D);
    expect(parseRelativeAgeFa('ماه پیش', now)).toBe(now - 30 * D);
    expect(parseRelativeAgeFa('', now)).toBeNull();
    expect(parseRelativeAgeFa(null, now)).toBeNull();
  });
});

describe('کلید اول', () => {
  it('فقط متن صریح', () => {
    expect(detectFirstKey('تکواحدی 140 متری کلیداول 1405')).toBe(true);
    expect(detectFirstKey(null, 'سال ساخت: نوساز کلید اول\nفول امکانات')).toBe(true);
    expect(detectFirstKey('کلید‌اول، ۲ خواب')).toBe(true);
    expect(detectFirstKey('نوساز ۱۴۰۴، کلید دوم')).toBe(false);
    expect(detectFirstKey('نوساز')).toBe(false);
    expect(detectFirstKey(null, undefined)).toBe(false);
  });
});

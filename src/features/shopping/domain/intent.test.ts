import { describe, expect, it } from 'vitest';
import { cityByName } from './cities';
import { jalaliToGregorian, parseBudget, parseShopQuery } from './intent';

// ۲۱ مهر ۱۴۰۵، ظهر تهران
const NOW = Date.UTC(2026, 9, 13, 9, 0);
const ahvaz = cityByName('اهواز')!;
const ask = (text: string) => parseShopQuery(text, { now: NOW, home: ahvaz });

describe('فهم درخواست فارسی خرید', () => {
  it('کالای کارکرده در شیپور اهواز', () => {
    const q = ask('بهترین پلی‌استیشن ۵ اسلیم کارکرده در شیپور شهر اهواز را معرفی کن');
    expect(q.intents).toEqual(['product']);
    expect(q.used).toBe(true);
    expect(q.city?.name).toBe('اهواز');
    expect(q.named).toContain('sheypoor');
    expect(q.keywords).toBe('پلی استیشن 5 اسلیم');
  });

  it('فهرست گزینه‌ها با «یا»: نخستین کالا جستجو می‌شود', () => {
    expect(ask('آیفون یا جارو برقی دست دوم در تهران').keywords).toBe('آیفون');
  });

  it('پرواز ارزان با مبدأ و مقصد', () => {
    const q = ask('ارزان‌ترین پرواز به کیش از اهواز را پیدا کن');
    expect(q.intents).toEqual(['flight']);
    expect(q.origin?.iata).toBe('AWZ');
    expect(q.destinations.map((c) => c.name)).toEqual(['کیش']);
    expect(q.sort).toBe('cheapest');
    expect(q.date).toBeNull();
  });

  it('پرواز یا قطار به چند مقصد؛ مبدأ پیش‌فرض شهر کاربر', () => {
    const q = ask('ارزان‌ترین پرواز یا قطار به مشهد یا تهران فردا');
    expect(q.intents).toEqual(['flight', 'train']);
    expect(q.origin?.name).toBe('اهواز');
    expect(q.destinations.map((c) => c.name)).toEqual(['مشهد', 'تهران']);
    expect(q.date).toBe('2026-10-14');
  });

  it('اقامت با سقف شبانه و چند گزینهٔ بودجه', () => {
    const q = ask('یک ویلا یا اتاق هتل با شبی حداکثر ۲ یا ۳ یا ۴ میلیون تومان در شهر مشهد پیشنهاد بده');
    expect(q.intents).toContain('stay');
    expect(q.maxPrice).toBe(4_000_000);
    expect(q.destinations[0].name).toBe('مشهد');
  });

  it('«شمال» یعنی شهرهای شمالی', () => {
    const q = ask('ارزان‌ترین ویلا در شمال برای ۴ نفر ۲ شب');
    expect(q.destinations.map((c) => c.name)).toContain('رامسر');
    expect(q.guests).toBe(4);
    expect(q.nights).toBe(2);
  });

  it('غذا در اسنپ‌فود با تخفیف', () => {
    const q = ask('ارزان‌ترین پیتزای تخفیف‌خورده در اهواز از اسنپ‌فود');
    expect(q.intents).toEqual(['food']);
    expect(q.named).toEqual(['snappfood']);
    expect(q.city?.name).toBe('اهواز');
    expect(q.keywords).toBe('پیتزای');
  });

  it('پزشک با نوبت خالی؛ «بهترین» بر «ارزان» اولویت دارد', () => {
    const q = ask('یک متخصص پوست با نوبت خالی در اهواز پیدا کن که بر اساس نظرات کاربران بهترین باشد');
    expect(q.intents).toEqual(['doctor']);
    expect(q.sort).toBe('best');
    expect(q.keywords).toBe('متخصص پوست');
  });

  it('تاریخ شمسی و بودجهٔ بازه‌ای', () => {
    expect(jalaliToGregorian(1405, 7, 21)).toEqual([2026, 10, 13]);
    expect(jalaliToGregorian(1403, 12, 30)).toEqual([2025, 3, 20]);
    expect(ask('پرواز به تهران ۲۵ مهر').date).toBe('2026-10-17');
    expect(ask('پرواز به تهران ۱ مهر').date).toBe('2027-09-23');
    expect(parseBudget('گوشی بین 10 تا 20 میلیون')).toMatchObject({ min: 10_000_000, max: 20_000_000 });
    expect(parseBudget('لپ تاپ زیر 500 هزار تومان').max).toBe(500_000);
  });
});

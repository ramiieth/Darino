/**
 * شیپور — پارسر با فیکسچر «پاسخ واقعی» API (برش‌خورده، سپتامبر ۲۰۲۶)
 */
import { describe, it, expect } from 'vitest';
import list from './__fixtures__/sheypoor-list.json';
import detail from './__fixtures__/sheypoor-detail.json';
import {
  parseSheypoorDetail,
  parseSheypoorList,
  sheypoorDate,
  sheypoorIdFromToken,
  sheypoorListUrl,
  sheypoorNeighborhood,
  sheypoorPrice,
  sheypoorToken
} from './sheypoor';
import { emptySeed } from './parse';

describe('sheypoor — ابزارها', () => {
  it('URL فهرست با/بدون کرسر', () => {
    expect(sheypoorListUrl('ahvaz')).toBe('https://www.sheypoor.com/api/v10.0.0/search/ahvaz/houses-apartments-for-sale');
    expect(sheypoorListUrl('ahvaz', '[1.0, 2]_x')).toContain('?f=%5B1.0%2C%202%5D_x');
    expect(sheypoorListUrl('ahvaz', null, 'https://sheypoor.com')).toMatch(/^https:\/\/sheypoor\.com\/api\//);
  });
  it('توکن با پیشوند (بدون برخورد با دیوار) و بازگشت', () => {
    expect(sheypoorToken('123')).toBe('sh-123');
    expect(sheypoorIdFromToken('sh-123')).toBe('123');
    expect(sheypoorIdFromToken('gagCBuEm')).toBeNull();
  });
  it('محله از مکان — فقط شهر اهواز', () => {
    expect(sheypoorNeighborhood('اهواز، زیتون کارگری', 'اهواز')).toEqual({ inCity: true, neighborhood: 'زیتون کارگری' });
    expect(sheypoorNeighborhood('خوزستان، اهواز، مهرشهر', 'اهواز')).toEqual({ inCity: true, neighborhood: 'مهرشهر' });
    expect(sheypoorNeighborhood('تهران، آهنگ', 'اهواز').inCity).toBe(false);
    expect(sheypoorNeighborhood('اهواز', 'اهواز')).toEqual({ inCity: true, neighborhood: null });
    expect(sheypoorNeighborhood(null, 'اهواز').inCity).toBe(false);
  });
  it('قیمت: رشته/عدد/توافقی', () => {
    expect(sheypoorPrice([{ amount: '4,800,000,000', currency: 'تومان' }])).toBe(4_800_000_000);
    expect(sheypoorPrice([{ amount: 10140000000, currency: 'تومان' }])).toBe(10_140_000_000);
    expect(sheypoorPrice([{ label: 'قیمت', amount: 'توافقی', currency: '' }])).toBeNull();
    expect(sheypoorPrice(null)).toBeNull();
  });
  it('تاریخ ثبت به وقت ایران', () => {
    expect(sheypoorDate('2026-09-25 23:10:40.6535')).toBe(Date.parse('2026-09-25T23:10:40+03:30'));
    expect(sheypoorDate('bad')).toBeNull();
  });
});

describe('parseSheypoorList — پاسخ واقعی', () => {
  const r = parseSheypoorList(list, 'اهواز');

  it('فقط آگهی‌های اهواز (تبلیغ تهران، بنر و فروشگاه حذف)', () => {
    const tokens = [...r.seeds.keys()];
    expect(tokens).toContain('sh-458052102');
    expect(tokens).toContain('sh-467667012');
    expect(tokens).not.toContain('sh-467196001'); // «تهران، آهنگ»
    expect(tokens.every((t) => t.startsWith('sh-'))).toBe(true);
    expect(r.seeds.size).toBe(5);
  });

  it('قیمت، محله، منبع و لینک', () => {
    const s = r.seeds.get('sh-458052102')!;
    expect(s.source).toBe('sheypoor');
    expect(s.totalPriceToman).toBe(4_800_000_000);
    expect(s.neighborhood).toBe('زیتون کارگری');
    expect(s.url.startsWith('https://www.sheypoor.com/v/')).toBe(true);
    expect(s.areaSqm).toBeNull(); // فهرست متراژ ندارد → جزئیات لازم است
  });

  it('کرسر صفحه بعد از meta.f', () => {
    expect(typeof r.nextCursor).toBe('string');
    expect(r.normalCount).toBe(3);
  });

  it('ورودی خراب → بدون خطا', () => {
    expect(parseSheypoorList(null, 'اهواز').seeds.size).toBe(0);
    expect(parseSheypoorList({ data: 'x' }, 'اهواز').nextCursor).toBeNull();
    // صفحه بدون آگهی عادی = انتهای نتایج (حتی اگر meta.f باشد)
    expect(parseSheypoorList({ data: [], meta: { f: 'abc' } }, 'اهواز').nextCursor).toBeNull();
  });
});

describe('parseSheypoorDetail — پاسخ واقعی', () => {
  it('متراژ، اتاق، طبقه، قیمت هر متر، امکانات، تاریخ', () => {
    const s = parseSheypoorDetail(emptySeed('sh-467667012', 'sheypoor'), detail, 'اهواز');
    expect(s.areaSqm).toBe(78);
    expect(s.rooms).toBe(2);
    expect(s.floor).toBe(2);
    expect(s.pricePerSqmToman).toBe(130_000_000);
    expect(s.totalPriceToman).toBe(10_140_000_000);
    expect(s.propertyKind).toBe('apartment');
    expect(s.parking).toBe(true);
    expect(s.elevator).toBe(true);
    expect(s.storage).toBe(true);
    expect(s.neighborhood).toBe('مهرشهر');
    expect(s.listedAt).not.toBeNull();
  });

  it('عنوان «…/اندیشه/تهران» → نشانه ملک شهر دیگر', () => {
    const s = parseSheypoorDetail(emptySeed('sh-467667012', 'sheypoor'), detail, 'اهواز');
    expect(s.otherCity).toBe('تهران');
  });

  it('داده فهرست مقدم است (فقط فیلد خالی پر می‌شود)', () => {
    const seed = emptySeed('sh-1', 'sheypoor');
    seed.totalPriceToman = 1;
    seed.neighborhood = 'گلستان';
    parseSheypoorDetail(seed, detail, 'اهواز');
    expect(seed.totalPriceToman).toBe(1);
    expect(seed.neighborhood).toBe('گلستان');
  });

  it('ویلایی/خانه و «ندارد»', () => {
    const d = {
      data: {
        attributes: {
          attributes: [
            { key: 'نوع ملک', value: 'خانه ویلایی' },
            { key: 'آسانسور', value: 'ندارد' },
            { key: 'طبقه ملک', value: 'همکف' }
          ]
        }
      }
    };
    const s = parseSheypoorDetail(emptySeed('sh-2', 'sheypoor'), d, 'اهواز');
    expect(s.propertyKind).toBe('villa-house');
    expect(s.elevator).toBe(false);
    expect(s.floor).toBe(0);
  });

  it('ورودی خراب → seed بدون تغییر', () => {
    const s = emptySeed('sh-3', 'sheypoor');
    expect(parseSheypoorDetail(s, null, 'اهواز')).toEqual(emptySeed('sh-3', 'sheypoor'));
    expect(parseSheypoorDetail(s, { data: { attributes: { attributes: 'x' } } }, 'اهواز').areaSqm).toBeNull();
  });
});

import { sheypoorAge } from './sheypoor';

describe('سن بنا شیپور', () => {
  it('«4 سال» / «نوساز» / نامفهوم', () => {
    expect(sheypoorAge('4 سال')).toBe(4);
    expect(sheypoorAge('۱۲ سال')).toBe(12);
    expect(sheypoorAge('نوساز')).toBe(0);
    expect(sheypoorAge('زیر یک سال')).toBe(0);
    expect(sheypoorAge('نامشخص')).toBeNull();
    expect(sheypoorAge(null)).toBeNull();
  });
  it('پاسخ واقعی («4 سال») → سال ساخت = سال شمسی ثبت آگهی − ۴', () => {
    const s = parseSheypoorDetail(emptySeed('sh-467667012', 'sheypoor'), detail, 'اهواز');
    // addedAt واقعی: 2026-09-25 → ۱۴۰۵
    expect(s.yearBuilt).toBe(1401);
  });
});

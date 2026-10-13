import { describe, expect, it } from 'vitest';
import { rankItems, relevance, topPick } from './rank';
import type { ShopItem } from './types';

const base = (p: Partial<ShopItem> & Pick<ShopItem, 'id' | 'title'>): ShopItem => ({
  service: 'sheypoor', url: 'https://www.sheypoor.com/v/x.html', summary: null, image: null, priceToman: null, priceBeforeToman: null,
  discountPercent: 0, rating: null, ratingCount: null, location: null, available: true, facts: [], mapUrl: null, soonDays: null, ...p
});
const q = { intents: ['product' as const], sort: 'best' as const, maxPrice: null, minPrice: null, keywords: 'پلی استیشن 5 اسلیم' };

describe('رتبه‌بندی دستیار خرید', () => {
  it('املای فارسی و لاتین یک کالا یکی است؛ لوازم جانبی جریمه می‌شوند', () => {
    expect(relevance('ps5 اسلیم 1ترابایت', q.keywords)).toBe(1);
    expect(relevance('PlayStation 5 Slim Digital', q.keywords)).toBe(1);
    expect(relevance('روکش دسته پلی استیشن 5 اسلیم', q.keywords)).toBeLessThan(0.5);
    expect(relevance('تعمیرات دسته ps4', q.keywords)).toBeLessThan(0.34);
    // عدد و اسم اصلی شرط‌اند
    expect(relevance('تلویزیون 32 اینچ ال ای دی', 'تلویزیون 55 اینچ')).toBeLessThan(0.34);
    expect(relevance('تلویزیون LED مدل X سایز 55 اینچ', 'تلویزیون 55 اینچ')).toBe(1);
    expect(relevance('چاقو آشپزخانه با دسته پلاستیکی', 'ظروف پلاستیکی آشپزخانه')).toBeLessThan(0.34);
    expect(relevance('ظرف نگهدارنده پلاستیکی آشپزخانه', 'ظروف پلاستیکی آشپزخانه')).toBe(1);
  });

  it('آگهی ارزان ولی نامربوط بالای کالای اصلی نمی‌آید', () => {
    const r = rankItems([
      base({ id: 'a', title: 'فروش روکش دسته پی اس فایو', priceToman: 250_000 }),
      base({ id: 'b', title: 'تعمیرات تخصصی دسته ps4', priceToman: 500_000 }),
      base({ id: 'c', title: 'ps5 اسلیم 1 ترابایت', priceToman: 133_000_000, service: 'divar', url: 'https://divar.ir/v/abcd' }),
      base({ id: 'd', title: 'پلی استیشن 5 اسلیم دیجیتال', priceToman: 140_000_000 }),
      base({ id: 'e', title: 'PS5 Slim با دو دسته', priceToman: 150_000_000 })
    ], q);
    expect(r.map((i) => i.id)).toEqual(['c', 'd', 'e']);
    expect(r[0].reasons).toContain('ارزان‌ترین گزینه');
    expect(topPick(r)?.why).toMatch(/^دیوار: ارزان‌ترین گزینه/);
  });

  it('بودجه، موجودی، ۲۰ نتیجه و سقف ۱۰ از هر منبع', () => {
    const many = Array.from({ length: 14 }, (_, i) => base({ id: `s${i}`, title: `ps5 slim ${i}`, priceToman: 100_000_000 + i }));
    const other = Array.from({ length: 15 }, (_, i) => base({ id: `d${i}`, service: 'divar', title: `ps5 slim دیوار ${i}`, priceToman: 120_000_000 + i }));
    const r = rankItems([...many, ...other, base({ id: 'x', title: 'ps5 slim گران', priceToman: 300_000_000 }), base({ id: 'y', title: 'ps5 slim', priceToman: 1, available: false })], { ...q, maxPrice: 200_000_000 });
    expect(r).toHaveLength(20);
    expect(r.filter((i) => i.service === 'sheypoor')).toHaveLength(10);
    expect(r.some((i) => i.id === 'x' || i.id === 'y')).toBe(false);
    expect(r.map((i) => i.rank)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('پزشک: رضایت و تعداد نظر و نوبت نزدیک‌تر', () => {
    const doc = (id: string, rating: number, count: number, soonDays: number | null) =>
      base({ id, title: id, service: 'paziresh24', url: 'https://www.paziresh24.com/dr/x/', rating, ratingCount: count, soonDays });
    const r = rankItems([doc('کم‌نظر', 5, 2, 0), doc('پرنظر', 4.8, 300, 5), doc('دیر', 4.8, 300, 40)], { ...q, intents: ['doctor'], keywords: 'پوست' });
    expect(r.map((i) => i.id)).toEqual(['پرنظر', 'دیر', 'کم‌نظر']);
  });
});

describe('دقت نتایج', () => {
  it('اندازهٔ ۸ کیلو با ۶.۸ کیلو یکی نیست؛ «مخصوص شلوار» خودِ شلوار نیست', () => {
    expect(relevance('ماشین لباسشویی 6.8 کیلویی', 'ماشین لباسشویی 8 کیلویی')).toBeLessThan(0.34);
    expect(relevance('ماشین لباسشویی 8 کیلوگرم اتوماتیک', 'ماشین لباسشویی 8 کیلویی')).toBe(1);
    expect(relevance('کمربند مردانه چرم مخصوص کت و شلوار', 'شلوار مردانه')).toBeLessThan(0.34);
    expect(relevance('شلوار کتان مردانه', 'شلوار مردانه')).toBe(1);
    expect(relevance('سس مایونز کم چرب ۳۰۰ گرمی مهرام', 'سس مایونز 300 گرمی')).toBe(1);
    expect(relevance('سوسیس آلمانی 1 کیلوگرمی', 'سوسیس 1 کیلویی')).toBe(1);
    expect(relevance('روغن مایع ۱۰۰۰ گرمی', 'روغن مایع 1 کیلو')).toBe(1);
  });
});

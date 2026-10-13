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

  it('بودجه، موجودی و سقف ۶ نتیجه از هر منبع', () => {
    const many = Array.from({ length: 9 }, (_, i) => base({ id: `s${i}`, title: `ps5 slim ${i}`, priceToman: 100_000_000 + i }));
    const other = Array.from({ length: 5 }, (_, i) => base({ id: `d${i}`, service: 'divar', title: `ps5 slim دیوار ${i}`, priceToman: 120_000_000 + i }));
    const r = rankItems([...many, ...other, base({ id: 'x', title: 'ps5 slim گران', priceToman: 300_000_000 }), base({ id: 'y', title: 'ps5 slim', priceToman: 1, available: false })], { ...q, maxPrice: 200_000_000 });
    expect(r).toHaveLength(10);
    expect(r.filter((i) => i.service === 'sheypoor')).toHaveLength(6);
    expect(r.some((i) => i.id === 'x' || i.id === 'y')).toBe(false);
    expect(r.map((i) => i.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('پزشک: رضایت و تعداد نظر و نوبت نزدیک‌تر', () => {
    const doc = (id: string, rating: number, count: number, soonDays: number | null) =>
      base({ id, title: id, service: 'paziresh24', url: 'https://www.paziresh24.com/dr/x/', rating, ratingCount: count, soonDays });
    const r = rankItems([doc('کم‌نظر', 5, 2, 0), doc('پرنظر', 4.8, 300, 5), doc('دیر', 4.8, 300, 40)], { ...q, intents: ['doctor'], keywords: 'پوست' });
    expect(r.map((i) => i.id)).toEqual(['پرنظر', 'دیر', 'کم‌نظر']);
  });
});

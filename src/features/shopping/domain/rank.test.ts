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

  it('بودجه، موجودی، ۳۰ نتیجه و سهم برابر هر منبع (سهم پرنشده را بقیه پر می‌کنند)', () => {
    const many = Array.from({ length: 20 }, (_, i) => base({ id: `s${i}`, title: `ps5 slim ${i}`, priceToman: 100_000_000 + i }));
    const other = Array.from({ length: 20 }, (_, i) => base({ id: `d${i}`, service: 'divar', title: `ps5 slim دیوار ${i}`, priceToman: 120_000_000 + i }));
    const extra = [base({ id: 'x', title: 'ps5 slim گران', priceToman: 300_000_000 }), base({ id: 'y', title: 'ps5 slim', priceToman: 1, available: false })];
    const r = rankItems([...many, ...other, ...extra], { ...q, maxPrice: 200_000_000 });
    expect(r).toHaveLength(30);
    expect(r.filter((i) => i.service === 'sheypoor')).toHaveLength(15);
    expect(r.filter((i) => i.service === 'divar')).toHaveLength(15);
    expect(r.some((i) => i.id === 'x' || i.id === 'y')).toBe(false);
    expect(r.map((i) => i.rank)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    // منبع کم‌نتیجه: سهمش به منبع دیگر می‌رسد، هیچ منبعی محدود نمی‌شود
    const few = rankItems([...many, ...other.slice(0, 4)], { ...q, maxPrice: 200_000_000 });
    expect(few.filter((i) => i.service === 'sheypoor')).toHaveLength(20);
    expect(few.filter((i) => i.service === 'divar')).toHaveLength(4);
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
  it('دستهٔ فروشگاه تعیین می‌کند چه چیزی «روغن» یا «کیک» است، نه فقط واژهٔ عنوان', () => {
    const g = (id: string, title: string, category: string | null, service: ShopItem['service'] = 'bamadar') =>
      base({ id, title, category, service, url: 'https://bamadar.com/market/search', priceToman: 100_000 });
    const pool = [
      g('o1', 'روغن زیتون فرابکر سی سام', 'روغن'), g('o2', 'لادن طلایی روغن زیتون بکر 250 میلی لیتر', 'روغن'),
      g('o3', 'روغن زیتون (هر کیلوگرم)', null), g('f1', 'اویلا روغن مخصوص سرخ کردنی', 'روغن'),
      g('x1', 'تن ماهی مکنزی در روغن زیتون', 'تن ماهی'), g('x2', 'پودر صابون رختشویی با روغن نارگیل', null),
      g('x3', 'ژل مو الترا استرانگ حاوی روغن آرگان', null), g('x4', 'کیک روغنی دوقلو نظری', 'کیک و کلوچه'),
      g('s1', 'روغن آفتابگردان لادن', 'خواربار و نان › روغن پخت و پز و سالاد', 'snappmarket'),
      g('x5', 'صابون حمام روغن زیتون دورو', 'آرایشی و بهداشتی › صابون', 'snappmarket'),
      g('x6', 'پد جاذب روغن پرسان', 'خانه و سبک زندگی › لوازم یکبارمصرف › پد جاذب روغن', 'snappmarket'),
      g('c1', 'نادری کیک دو قلو کاکائو', 'کیک و کلوچه'), g('c2', 'پودر کیک بروانی مرطوب', 'پودر کیک'),
      g('c3', 'آل وایت مسواک کیک آف', 'بهداشت دهان و دندان')
    ];
    const ids = (keywords: string) => rankItems(pool, { ...q, intents: ['grocery'], keywords }).map((i) => i.id).sort();
    expect(ids('روغن زیتون')).toEqual(['o1', 'o2', 'o3']);
    expect(ids('روغن')).toEqual(['f1', 'o1', 'o2', 'o3', 's1']);
    expect(ids('کیک')).toEqual(['c1', 'x4']);
    // برند بدون نشانهٔ دسته فیلتر نمی‌شود
    const brand = [pool[1], pool[3], pool[8]];
    expect(rankItems(brand, { ...q, intents: ['grocery'], keywords: 'لادن' }).map((i) => i.id).sort()).toEqual(['o2', 's1']);
  });
  it('کالای دقیق در چند فروشگاه هست → برند دیگر و «کم چرب» به‌جای «پرچرب» نمی‌آید؛ «پر چرب» = «پرچرب»', () => {
    const y = (id: string, title: string, service: ShopItem['service']) => base({ id, title, service, url: 'https://snapp.market/x', priceToman: 500_000 });
    const pool = [
      y('a', 'ماست پرچرب حاوی ویتامین D3 ست میهن 2 کیلوگرمی', 'snappmarket'), y('b', 'میهن ماست ست پرچرب 4% 2 کیلوگرم', 'bamadar'),
      y('c', 'ماست ست پر چرب 2 کیلوگرمی میهن', 'okala'), y('x1', 'ماست کم چرب میهن 2 کیلوگرمی', 'snappmarket'),
      y('x2', 'ماست پرچرب 3% چربی پگاه 2 کیلوگرمی', 'okala'), y('x3', 'ماست پرچرب ست میهن 900 گرمی', 'snappmarket')
    ];
    const ids = rankItems(pool, { ...q, intents: ['grocery'], keywords: 'ماست پرچرب میهن 2 کیلویی' }).map((i) => i.id).sort();
    expect(ids).toEqual(['a', 'b', 'c']);
  });
});

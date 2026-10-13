// @vitest-environment node
/** مجموعهٔ درخواست‌های واقعی کاربر در همهٔ دسته‌ها: نیت، عبارت جستجو، شهر و منابع درست */
import { describe, expect, it } from 'vitest';
import { plan } from '../../api/_shop';
import { cityByName } from '../../src/features/shopping/domain/cities';
import { parseShopQuery } from '../../src/features/shopping/domain/intent';

const NOW = Date.UTC(2026, 9, 13, 9, 0);
const ask = (text: string) => {
  const q = parseShopQuery(text, { now: NOW, home: cityByName('اهواز') });
  const p = plan(q, NOW);
  return { ...q, tasks: [...new Set(p.tasks.map((t) => t.service))], hints: p.hints, links: p.linkOnly };
};

type Case = [text: string, expected: { intents?: string[]; keywords?: string; tasks?: string[]; city?: string; deal?: string | null; noHint?: boolean }];
const CASES: Case[] = [
  // کالا: فروشگاه آنلاین + آگهی دیوار/شیپور
  ['قیمت یخچال ساید بای ساید', { intents: ['product'], keywords: 'یخچال ساید بای ساید', tasks: ['torob', 'digikala', 'technolife', 'masterkala', 'sheypoor', 'divar'] }],
  ['ارزان‌ترین ماشین لباسشویی', { intents: ['product'], keywords: 'ماشین لباسشویی' }],
  ['ظروف پلاستیکی آشپزخانه', { intents: ['product'], keywords: 'ظروف پلاستیکی آشپزخانه' }],
  ['جاروبرقی زیر ۱۰ میلیون در دیوار', { intents: ['product'], keywords: 'جاروبرقی', tasks: ['sheypoor', 'divar'] }],
  ['گوشی آیفون ۱۳ دست دوم', { intents: ['product'], keywords: 'گوشی آیفون 13', tasks: ['sheypoor', 'divar'] }],
  // استخدام، املاک، خودرو، خدمات
  ['آگهی های استخدامی دیوار را نشان بده', { intents: ['job'], keywords: '', tasks: ['divar'] }],
  ['استخدام منشی در اهواز', { intents: ['job'], keywords: 'منشی', tasks: ['divar', 'sheypoor'] }],
  ['اجاره آپارتمان ۸۰ متری در کیانپارس', { intents: ['estate'], deal: 'rent', tasks: ['divar', 'sheypoor'] }],
  ['خرید خانه ویلایی در اهواز', { intents: ['estate'], deal: 'buy' }],
  ['پژو ۲۰۶ مدل ۹۸ زیر ۷۰۰ میلیون', { intents: ['car'], keywords: 'پژو 206 مدل 98', tasks: ['divar', 'sheypoor'] }],
  ['قطعات یدکی خودرو پراید', { intents: ['car'] }],
  ['تعمیر کولر گازی', { intents: ['service'], keywords: 'تعمیر کولر گازی', tasks: ['divar', 'sheypoor'] }],
  ['بهترین آرایشگاه زنانه', { intents: ['service'] }],
  // سوپرمارکت و میوه
  ['بهترین میوه فروشی که قیمت ارزان بفروشه را در شهر من معرفی بکن', { intents: ['grocery'], keywords: 'میوه', city: 'اهواز', tasks: ['snappmarket', 'okala', 'bamadar', 'snappfood'] }],
  ['ارزان‌ترین شیر کم چرب', { intents: ['grocery'], keywords: 'شیر کم چرب', tasks: ['snappmarket', 'okala', 'bamadar'] }],
  ['گوشت قرمز تازه', { intents: ['grocery'], tasks: ['snappmarket', 'okala', 'bamadar', 'snappfood'] }],
  // غذا
  ['مرغ سوخاری', { intents: ['food', 'grocery'] }],
  ['کباب کوبیده ارزان در اهواز', { intents: ['food'], keywords: 'کباب کوبیده', tasks: ['snappfood'] }],
  ['آیس لاته در کافه‌های اهواز', { intents: ['food'], tasks: ['snappfood'] }],
  // سفر
  ['پرواز های امروز را نشان بده', { intents: ['flight'], tasks: ['mrbilit', 'alibaba'] }],
  ['قطار فردا به تهران', { intents: ['train'], tasks: ['mrbilit'], noHint: true }],
  ['هتل در مشهد شبی زیر ۳ میلیون', { intents: ['stay'], tasks: ['otaghak'] }],
  ['ویلا در شمال برای ۴ نفر', { intents: ['stay'], tasks: ['otaghak'] }],
  ['اتوبوس vip به تهران', { intents: ['bus'], tasks: ['mrbilit'], noHint: true }],
  ['تاکسی دربست اهواز به تهران', { intents: ['taxi'], tasks: ['mrbilit'], noHint: true }],
  ['اتوبوس شیراز به اصفهان', { intents: ['bus'], tasks: ['mrbilit'], noHint: true }],
  ['سفر به مشهد', { intents: ['flight', 'train', 'bus', 'taxi'], tasks: ['mrbilit', 'alibaba'] }],
  ['پرواز به تهران و همدان و شیراز و اصفهان و کرج', { intents: ['flight'], tasks: ['mrbilit', 'alibaba'] }],
  ['ارزان‌ترین تور کیش', { intents: ['tour'], tasks: ['jabama'] }],
  ['بهترین تور', { intents: ['tour'], tasks: ['jabama'] }],
  // خرید اقساطی: کالا + فروشگاه‌های همان دسته
  ['ارزان‌ترین شلوار مردانه با خرید اقساطی', { intents: ['fashion'], keywords: 'شلوار مردانه', tasks: ['torob', 'digikala', 'shopino', 'sheypoor', 'divar', 'snapppay', 'digipay'] }],
  ['لوازم آشپزخانه قسطی با اسنپ پی', { keywords: 'لوازم آشپزخانه' }],
  // خرید روزانه با وزن و برند
  ['ارزان‌ترین سس مایونز ۳۰۰ گرمی', { intents: ['grocery'], keywords: 'سس مایونز 300 گرمی', tasks: ['snappmarket', 'okala', 'bamadar'] }],
  ['سوسیس و کالباس یک کیلویی', { intents: ['grocery'], keywords: 'سوسیس کالباس 1 کیلویی' }],
  // سلامت، کتاب، زیبایی
  ['دندانپزشک خوب با نوبت خالی', { intents: ['doctor'], tasks: ['paziresh24', 'doctoreto'] }],
  ['جراح چشم لیزیک در تهران', { intents: ['doctor'], city: 'تهران' }],
  ['کتاب صوتی ملت عشق', { intents: ['book'], keywords: 'ملت عشق', tasks: ['taaghche'] }],
  ['کرم ضد آفتاب برای پوست چرب', { intents: ['beauty'], tasks: ['khanoumi', 'asalbanoo', 'digikala'] }]
];

describe('مجموعهٔ درخواست‌های واقعی', () => {
  for (const [text, exp] of CASES) {
    it(text, () => {
      const r = ask(text);
      if (exp.intents) expect(r.intents).toEqual(exp.intents);
      if (exp.keywords !== undefined) expect(r.keywords).toBe(exp.keywords);
      if (exp.tasks) expect(r.tasks).toEqual(exp.tasks);
      if (exp.city) expect(r.city?.name).toBe(exp.city);
      if (exp.deal !== undefined) expect(r.deal).toBe(exp.deal);
      if (exp.noHint) expect(r.hints).toEqual([]);
      expect(r.tasks.length + r.links.length + r.hints.length).toBeGreaterThan(0);
      if (text.includes('اقساط') || text.includes('قسطی')) expect(r.installment).toBe(true);
    });
  }
});

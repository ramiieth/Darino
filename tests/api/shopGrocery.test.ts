/** سوپرمارکت‌ها: شناسهٔ عددی اکالا و جستجوی دوباره با عبارت کوتاه‌تر */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { widen } from '../../api/_shop';
import { okala } from '../../api/_shopLocal';
import { cityByName } from '../../src/features/shopping/domain/cities';

const ahvaz = cityByName('اهواز');
afterEach(() => vi.unstubAllGlobals());

describe('سوپرمارکت‌ها — نتایج کامل', () => {
  it('اکالا: شناسهٔ عددی کالا و فروشگاه دور ریخته نمی‌شود', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('categories')
      ? { data: { categories: [{ id: 1, name: 'لبنیات', latinName: 'dairy', children: [{ id: 2, name: 'ماست پرچرب', latinName: 'full-fat-yogurt' }] }] } }
      : { data: [{ store: { storeId: 6944, storeName: 'شریعتی', earliestSlot: { isClosed: false } },
        products: [{ id: 4534, name: 'ماست ست پرچرب 2 کیلوگرمی میهن', price: 2290000, okPrice: 2221300, hasQuantity: true, supplyStatus: 1 },
          { id: 4535, name: 'ناموجود', price: 1, okPrice: 1, hasQuantity: false, supplyStatus: 2 }] }] }), { status: 200, headers: { 'content-type': 'application/json' } })));
    const r = await okala({ keywords: 'ماست پرچرب میهن', city: ahvaz, sort: 'best', maxPrice: null, minPrice: null, used: false });
    expect(r.map((i) => [i.id, i.priceToman])).toEqual([['ok-6944-4534', 222130]]);
  });
  it('جستجوی فروشگاه عبارت کامل را نفهمید؟ با عبارت کوتاه‌تر دوباره می‌پرسد', async () => {
    const asked: string[] = [];
    const source = async (q: { keywords: string }) => {
      asked.push(q.keywords);
      return q.keywords.includes('2') ? [base('سس مایونز 420 گرمی')] : [base('میهن ماست ست پرچرب 4% 2 کیلوگرم')];
    };
    const base = (title: string) => ({ id: title, service: 'bamadar' as const, title, url: 'https://bamadar.com/market/search', summary: null, image: null, priceToman: 1, priceBeforeToman: null, discountPercent: 0, rating: null, ratingCount: null, location: null, available: true, facts: [], mapUrl: null, soonDays: null });
    const r = await widen(source, { keywords: 'ماست پرچرب میهن 2 کیلویی' });
    expect(asked).toEqual(['ماست پرچرب میهن 2 کیلویی', 'ماست پرچرب میهن']);
    expect(r[0].title).toContain('میهن ماست');
  });
});

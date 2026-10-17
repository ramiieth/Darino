// @vitest-environment node
/** فیدیبو (کتاب) و جاباما (اقامت): فقط میزبان مجاز، تبدیل قیمت، لینک امن و حذف کارت نامعتبر */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fidibo } from '../../api/_shopGoods';
import { jabamaStays } from '../../api/_shopTravel';
import { cityByName } from '../../src/features/shopping/domain/cities';

afterEach(() => { vi.unstubAllGlobals(); });
const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });

describe('فیدیبو', () => {
  it('جستجوی عمومی، قیمت کمپین، نوع کتاب و لینک امن', async () => {
    const f = vi.fn().mockResolvedValue(ok({ data: { result: [{ items: [
      { id: 86020, status: 'published', title: '<b>ملت عشق</b>', subtitle: 'الیف شافاک', footerText: 'آوانامه', content_type: 'audiobook', price: 406000, campaign: { discounted_price: 203000 }, rate: { score: 4.5, responses: 2562 }, cover: { image: 'https://cdn.fidibo.com/a.jpg' }, action: { inputs: [{ key: 'slug', value: '86020-کتاب-صوتی-ملت-عشق' }] } },
      { id: 4339, title: 'ملت عشق', content_type: 'ebook', rate: { score: 0, responses: 0 }, cover: { image: 'https://evil.example/x.jpg' }, action: { inputs: [{ key: 'slug', value: '../../evil' }] } },
      { id: null, title: '' }
    ] }] } }));
    vi.stubGlobal('fetch', f);
    const items = await fidibo({ keywords: 'ملت عشق', sort: 'cheapest', maxPrice: null, minPrice: null });
    const url = new URL(f.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://api.fidibo.com/flex/search/list/content');
    expect(url.searchParams.get('order')).toBe('LOWEST_PRICE');
    expect(f.mock.calls[0][1].headers.Cookie).toBeUndefined();
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ service: 'fidibo', title: 'ملت عشق', priceToman: 203000, priceBeforeToman: 406000, discountPercent: 50, rating: 4.5, ratingCount: 2562, summary: 'الیف شافاک · آوانامه', image: 'https://cdn.fidibo.com/a.jpg' });
    expect(items[0].url).toBe(`https://fidibo.com/book/${encodeURI('86020-کتاب-صوتی-ملت-عشق')}`);
    expect(items[0].facts).toContainEqual({ label: 'نوع', value: 'کتاب صوتی' });
    // اسلاگ نامعتبر → فقط شناسه؛ تصویر دامنهٔ دیگر حذف؛ قیمت صفر = رایگان
    expect(items[1]).toMatchObject({ url: 'https://fidibo.com/book/4339', image: null, priceToman: 0, rating: null });
    expect(items[1].facts).toContainEqual({ label: 'قیمت', value: 'رایگان' });
  });
});

describe('جاباما — اقامت', () => {
  const ramsar = cityByName('رامسر')!;
  const q = { cities: [ramsar], date: '2026-10-20', nights: 2, guests: 4, maxPrice: 5_000_000, minPrice: null, sort: 'cheapest' as const, today: '2026-10-18' };
  const card = { code: 481016, name: 'اقامتگاه سنتی فلت آرتان', type: 'traditional', reservation_type: 'instant', location: { city: 'رامسر', province: 'مازندران', geo: { lat: 36.83, long: 50.68 } }, rate_review: { score: 4.2, count: 72 }, capacity: { base: 6 }, image: 'https://cdn.jabama.com/a.jpeg', price: { mainPrice: 16_000_000, discountedPrice: 15_400_000, nights_count: 2, isDefaultDate: false, fa_checkin: '1405-07-28', fa_checkout: '1405-07-30' } };

  it('درخواست با شهر، تاریخ میلادی عددی، نفرات و بودجهٔ کل اقامت به ریال', async () => {
    const f = vi.fn().mockResolvedValue(ok({ result: { items: [card, { code: 1, name: 'بد', type: 'Villa<script>', price: {} }] } }));
    vi.stubGlobal('fetch', f);
    const items = await jabamaStays(q);
    const [url, init] = f.mock.calls[0];
    expect(new URL(url).hostname).toBe('gw.jabama.com');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({ 'location-cities': ['ramsar'], date: { start: 20261020, end: 20261022 }, capacity: 4, price: { end: 5_000_000 * 10 * 2 }, sort: 'price', 'sort-direction': 'false' });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'jbs-481016', service: 'jabama', priceToman: 770_000, priceBeforeToman: 800_000, discountPercent: 4, rating: 4.2, ratingCount: 72,
      location: 'رامسر، مازندران', summary: 'سنتی · رزرو آنی', image: 'https://cdn.jabama.com/a.jpeg',
      url: 'https://www.jabama.com/stay/traditional-481016?checkIn=1405-07-28&checkOut=1405-07-30&passengersCount=4'
    });
    expect(items[0].facts).toContainEqual({ label: 'قیمت', value: 'هر شب' });
  });

  it('بدون شهر درخواستی ارسال نمی‌شود', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    expect(await jabamaStays({ ...q, cities: [] })).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('رتبه‌بندی اقامت از دو منبع', () => {
  it('«ویلا» در عنوان جاباما هست و در اتاقک نیست؛ هیچ‌کدام حذف نمی‌شوند', async () => {
    const { rankItems } = await import('../../src/features/shopping/domain/rank');
    const { item } = await import('../../api/_shopGoods');
    const stay = (service: 'otaghak' | 'jabama', id: string, title: string, price: number) => item({ id, service, title, url: `https://x/${id}`, priceToman: price, rating: 4.6, ratingCount: 40 });
    const items = [
      stay('jabama', 'jbs-1', 'ویلا دوخوابه پناه', 2_900_000), stay('jabama', 'jbs-2', 'ویلا یک خوابه لاله', 2_500_000), stay('jabama', 'jbs-3', 'ویلا ساحلی تیته', 3_000_000),
      stay('otaghak', 'ot-1', 'طاهرسرا با جکوزی', 4_800_000), stay('otaghak', 'ot-2', 'استخردار آبگرم الورا', 2_200_000)
    ];
    const ranked = rankItems(items, { intents: ['stay'], sort: 'best', maxPrice: null, minPrice: null, keywords: 'ویلا', alternatives: [] });
    expect(new Set(ranked.map((i) => i.service))).toEqual(new Set(['jabama', 'otaghak']));
    expect(ranked).toHaveLength(5);
  });
});

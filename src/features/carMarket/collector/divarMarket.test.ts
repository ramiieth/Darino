import { describe, expect, it } from 'vitest';
import { buildDivarSearchBody, divarRows, modelFa, parseDivarCars, type DivarCarAd } from './divarMarket';
import { carryDivar, mergeCarSnapshots } from '../domain/snapshot';
import type { CarPriceRow, CarSnapshot } from '../domain/types';

// شکل واقعی پاسخ دیوار (کوتاه‌شده، ۲۷ اکتبر ۲۰۲۶)
const car = (model: string, year: string, priceRial: string, token: string, km = '100000') => ({
  '@type': 'Car', model, productionDate: year, mileageFromOdometer: { value: km },
  offers: { priceCurrency: 'IRR', price: priceRial }, url: `https://divar.ir/v/x/${token}`
});
const PAGE = {
  seo_details: { linked_data: [
    { '@type': 'BreadcrumbList' },
    car('Peugeot 206 5', '1395', '15800000000', 'gagHuvAz'),
    car('Peugeot 206 SD V9', '1389', '13400000000', 'gagHOumg'),
    car('JAC S5 automatic', '1398', '20000000000', 'gagAAAAA'), // فهرست عمومی، برند دیگر
    car('Peugeot 405 GLX-petrol', '1390', '10000000', 'gagBBBBB') // ۱ میلیون تومان: پیش‌قسط
  ] },
  pagination: { has_next_page: true, data: { page: 2 } }
};

describe('بازار دست‌دوم دیوار', () => {
  it('فقط آگهی‌های همان برند با قیمت معقول؛ ریال ← تومان؛ صفحهٔ بعد', () => {
    const { ads, next } = parseDivarCars(PAGE, 'Peugeot');
    expect(ads).toEqual([
      { token: 'gagHuvAz', model: 'Peugeot 206 5', year: 1395, km: 100000, price: 1_580_000_000 },
      { token: 'gagHOumg', model: 'Peugeot 206 SD V9', year: 1389, km: 100000, price: 1_340_000_000 }
    ]);
    expect(next).toEqual({ page: 2 });
    expect(parseDivarCars({ seo_details: { linked_data: [] }, pagination: { has_next_page: false } }, 'Peugeot').next).toBeNull();
  });

  it('فیلتر brand_model تهران و صفحه‌بندی', () => {
    const b = buildDivarSearchBody('Pride', { p: 1 }) as { city_ids: string[]; search_data: { form_data: { data: { brand_model: { repeated_string: { value: string[] } } } } }; pagination_data: unknown };
    expect(b.city_ids).toEqual(['1']);
    expect(b.search_data.form_data.data.brand_model.repeated_string.value).toEqual(['Pride']);
    expect(b.pagination_data).toEqual({ p: 1 });
  });

  it('نام فارسی مدل', () => {
    expect(modelFa('Tiba Sedan SX-normal')).toBe('تیبا صندوق‌دار SX');
    expect(modelFa('Pride 131 SE')).toBe('پراید 131 SE');
    expect(modelFa('Peugeot 405 GLX-petrol')).toBe('پژو 405 GLX بنزینی');
    expect(modelFa('Quick manual R-normal')).toBe('کوییک دنده‌ای R');
  });

  it('میانهٔ هر مدل + سال، بدون قیمت‌های پرت، دست‌کم ۳ آگهی', () => {
    const ad = (price: number, i: number, model = 'Pride 131 SE', year = 1399): DivarCarAd => ({ token: `t${model}${year}${i}`, model, year, km: null, price });
    const rows = divarRows([
      ad(1_000_000_000, 1), ad(1_070_000_000, 2), ad(1_100_000_000, 3), ad(300_000_000, 4), // آخری پرت
      ad(900_000_000, 5, 'Pride 131 SE', 1390), ad(950_000_000, 6, 'Pride 131 SE', 1390) // فقط ۲ آگهی
    ], 123);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'dv:Pride 131 SE:1399', modelId: 'dv:Pride 131 SE', brand: 'saipa', model: 'پراید 131 SE', year: '1399', market: 1_070_000_000, n: 3, source: 'divar', marketUpdatedAt: 123 });
  });
});

describe('ادغام Snapshot همان روز', () => {
  const row = (id: string, source?: 'divar'): CarPriceRow => ({ id, modelId: id, brand: 'saipa', model: id, year: '1404', option: null, market: 1e9, dealer: null, marketUpdatedAt: 1, srcChangePct: null, ...(source ? { source } : {}) });
  const snap = (dateTs: number, rows: CarPriceRow[]): CarSnapshot => ({ id: 'car-2026-10-27', day: '2026-10-27', dateTs, source: 'car.ir', usdtRate: null, usdtSource: null, brandNames: {}, rows, createdAt: dateTs });

  it('واکشی تازه‌تر مرورگر (بدون دیوار) ردیف‌های دیوار سرور را نگه می‌دارد', () => {
    const server = snap(1, [row('a'), row('dv:x', 'divar')]);
    const browser = snap(2, [row('a')]);
    expect(mergeCarSnapshots([server], [browser])[0].rows.map((r) => r.id)).toEqual(['a', 'dv:x']);
    expect(carryDivar(server, browser)).toBe(server);
  });

  it('روز تازهٔ مرورگر (هنوز بدون دیوار) ردیف‌های دیوار دیروز را می‌گیرد؛ قدیمی‌تر از ۱۴ روز نه', () => {
    const DAY = 86_400_000;
    const at = (d: number, rows: CarPriceRow[]): CarSnapshot => ({ ...snap(d * DAY, rows), id: `car-${d}`, day: `d${d}` });
    const merged = mergeCarSnapshots([at(1, [row('a'), row('dv:x', 'divar')]), at(2, [row('a')])]);
    expect(merged[1].rows.map((r) => r.id)).toEqual(['a', 'dv:x']);
    expect(merged[0].rows.map((r) => r.id)).toEqual(['a', 'dv:x']);
    expect(mergeCarSnapshots([at(1, [row('dv:x', 'divar')]), at(20, [row('a')])])[1].rows.map((r) => r.id)).toEqual(['a']);
  });
});

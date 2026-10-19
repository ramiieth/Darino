/**
 * بازبینی قیمت‌ها: حصار پرت لگاریتمی، تفکیک کیان‌آباد از عنوان، بازهٔ قیمت و تازه‌سازی Cron
 */
import { describe, it, expect } from 'vitest';
import { refreshNewestListings } from './refresh';
import { filterOutliers, newCleaningReport, splitExceptions } from './pipeline';
import type { Fetcher } from './client';
import type { PropertyMarketListing } from '../domain/types';
import { resolveNeighborhood } from '../data/catalog';
import { spreadOf, typeCellsOf, type ListingView } from '../service/propertyMarketService';

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json' } });
const row = (token: string, district: string, price: string) => ({
  widget_type: 'POST_ROW',
  data: { middle_description_text: price, action: { payload: { token, web_info: { title: `آگهی ${token}`, district_persian: district } } } }
});

const lst = (token: string, nb: string, ppm: number): PropertyMarketListing =>
  ({ token, source: 'divar', city: 'ahvaz', neighborhoodKey: nb, pricePerSqmToman: ppm, scrapedAt: 1 }) as unknown as PropertyMarketListing;

describe('حصار پرت لگاریتمی', () => {
  it('پروژهٔ لوکس واقعی می‌ماند؛ خطای واحد (۷ میلیون) حذف می‌شود', () => {
    // کیانپارس واقعی (۲۰۲۶-۱۰): بازهٔ ۹۵ تا ۴۵۰ میلیون + یک آگهی ۵۵۰ میلیونی ۱۴۰۵
    const kp = [95, 103, 111, 138, 150, 162, 186, 205, 226, 244, 257, 277, 295, 300, 311, 330, 370, 410, 450, 550].map((m, i) => lst(`k${i}`, 'kianpars-other', m * 1e6));
    const mahdis = [65, 68, 69, 72, 79, 7].map((m, i) => lst(`m${i}`, 'raw:کوی مهدیس', m * 1e6));
    const rep = newCleaningReport();
    const kept = new Set(filterOutliers([...kp, ...mahdis], rep).map((l) => l.token));
    expect(kept.has('k19')).toBe(true); // ۵۵۰ میلیون
    expect(kept.has('m5')).toBe(false); // ۷ میلیون
    expect(rep.outliersRemoved).toBe(1);
  });
});

describe('استثنا: واقعی ولی بدون اثر روی میانگین', () => {
  it('۵۵۰ میلیون کیانپارس حذف نمی‌شود، ولی جزو آگهی‌های عادی (مبنای میانگین) هم نیست', () => {
    // ۵۰ آگهی واقعی کیانپارس در دیوار (۲۰۲۶-۱۰-۱۹)، میلیون تومان هر متر
    const real = [550, 450, 450, 410, 370, 330, 320, 317, 311, 300, 300, 300, 300, 299, 295, 295, 290, 277, 267, 265, 257, 255, 254, 250, 244, 239, 226, 226, 217, 217, 205, 204, 186, 183, 179, 177, 176, 162, 161, 156, 150, 149, 148, 138, 138, 121, 111, 109, 103, 95];
    const kp = real.map((m, i) => lst(`k${i}`, 'kianpars-other', m * 1e6));
    const kept = filterOutliers(kp, newCleaningReport());
    expect(kept).toHaveLength(50);
    const { regular, exceptions } = splitExceptions(kept);
    expect(exceptions.map((l) => l.token)).toEqual(['k0']);
    expect(regular).toHaveLength(49);
  });
  it('منطقهٔ کم‌نمونه استثنا ندارد', () => {
    const few = [100, 110, 500].map((m, i) => lst(`f${i}`, 'padad', m * 1e6));
    expect(splitExceptions(few).exceptions).toHaveLength(0);
  });
});

describe('محله از عنوان صریح', () => {
  it('محلهٔ دیوار «کیانپارس» ولی عنوان «کیان آباد شرقی» → کیان‌آباد شرقی', () => {
    expect(resolveNeighborhood('کیانپارس', 'آپارتمان ۱۰۵متری نوساز برند کیان آباد شرقی').key).toBe('kianabad-east');
  });
  it('«کیانپارس شرقی» در عنوان همچنان کیانپارس شرقی است', () => {
    expect(resolveNeighborhood('کیانپارس', '۱۷۵متری کیانپارس شرقی').key).toBe('kianpars-east');
    expect(resolveNeighborhood('کیانپارس', 'کیانپارس، خیابان ۳ شرقی').key).toBe('kianpars-east');
  });
});

describe('بازهٔ قیمت (نه فقط بالاترین)', () => {
  const views = [100, 200, 300, 400, 500].map((m, i) => ({ token: `v${i}`, pricePerSqmToman: m * 1e6, totalPriceToman: m * 1e8, yearBuilt: 1405 }) as unknown as ListingView);
  it('پراکندگی: مرز ۲۵٪ و ۱۰٪ گران‌تر', () => {
    const s = spreadOf(views)!;
    expect(s.median).toBe(300e6);
    expect(s.p75).toBe(400e6);
    expect(s.p90).toBeCloseTo(460e6, -3);
  });
  it('خانهٔ جدول: بازهٔ ۲۵٪ تا ۷۵٪ با نمونهٔ کافی؛ با نمونهٔ کم بازه‌ای نیست', () => {
    const c = typeCellsOf(views, null, 1405).b0!;
    expect(c.ppmRange).toEqual([200e6, 400e6]);
    expect(typeCellsOf(views.slice(0, 3), null, 1405).b0!.ppmRange).toBeNull();
    expect(spreadOf(views.slice(0, 3))).toBeNull();
  });
});

describe('Cron: تازه‌سازی جدیدترین آگهی‌ها', () => {
  it('قیمت تازهٔ آگهی شناخته‌شده + متراژ ذخیره‌شده؛ آگهی جدید با جزئیات', async () => {
    const calls: string[] = [];
    const fetcher: Fetcher = async (url) => {
      calls.push(url);
      if (url.includes('/places/cities')) return json({ cities: [{ id: 7, slug: 'ahvaz', name: 'اهواز' }] });
      if (url.includes('/postlist/'))
        return json({ list_widgets: [row('old1', 'گلستان', '۲۰,۰۰۰,۰۰۰,۰۰۰ تومان'), row('new1', 'کیانپارس', '۳۰,۰۰۰,۰۰۰,۰۰۰ تومان')], pagination: { has_next_page: false, data: null } });
      return json({ sections: [{ widgets: [{ widget_type: 'GROUP_INFO_ROW', data: { items: [{ title: 'متراژ', value: '100' }] } }] }] });
    };
    const stored = { ...lst('old1', 'golestan', 150e6), areaSqm: 200, yearBuilt: 1400, totalPriceToman: 30e9, neighborhood: 'گلستان' } as PropertyMarketListing;
    const r = await refreshNewestListings({ known: new Map([['old1', stored]]), timeBudgetMs: 30_000, pauseMs: 0, fetcher, now: 1_000 });
    expect(r.complete).toBe(true);
    const old1 = r.listings.find((l) => l.token === 'old1')!;
    expect(old1.areaSqm).toBe(200);
    expect(old1.pricePerSqmToman).toBe(100e6); // ۲۰ میلیارد ÷ ۲۰۰ متر — قیمت تازه، نه ۱۵۰ ذخیره‌شده
    expect(old1.scrapedAt).toBe(1_000);
    expect(r.listings.find((l) => l.token === 'new1')!.pricePerSqmToman).toBe(300e6);
    expect(calls.some((u) => u.endsWith('/old1'))).toBe(false); // جزئیات آگهی شناخته‌شده دوباره گرفته نمی‌شود
  });
});

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claimJobs, relayAuthorized, relayEndpoint, relaySearch, submitResult, _test } from '../../api/_shopRelay';
import { foodTypes, parseSnappfood, snappfood } from '../../api/_shopLocal';
import { cityByName } from '../../src/features/shopping/domain/cities';
// @ts-expect-error plain ESM script without type declarations
import { findImage, normalize, runJob, searchUrl, validJob } from '../../tools/snappfood-bridge/bridge.mjs';

const KEY = 'a'.repeat(64);
const ahvaz = cityByName('اهواز')!;
const job = { query: 'پیتزا', lat: ahvaz.lat, lon: ahvaz.lon, types: [0], discount: false };

const rawItem = {
  id: 9876, title: 'پیتزا پپرونی', description: 'خمیر نازک', price: 480000, priceAfterDiscount: 336000, discountRatio: 30, normalized_rating: 9.2,
  images: [{ image_url: 'https://cdn.snappfood.ir/media/products/9876.jpg' }],
  vendor: { code: 'p3x9kq', title: 'پیتزا شیلا', logo: 'https://cdn.snappfood.ir/media/logo/p3x9kq.png', rating: 8.8, commentCount: 1520, is_open: true, deliveryFee: 25000, area: 'کیانپارس', vendorTypeTitle: 'فست فود' }
};

beforeEach(() => { vi.stubEnv('SHOP_RELAY_KEY', KEY); vi.stubEnv('DATABASE_URL', ''); _test.memory.clear(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('پل اسنپ‌فود — سمت مک', () => {
  it('فقط کار معتبر و فقط آدرس ثابت اسنپ‌فود', () => {
    expect(validJob(job)).toBe(true);
    for (const bad of [{ ...job, query: '' }, { ...job, query: 'x'.repeat(61) }, { ...job, lat: 51.5 }, { ...job, types: [4] }, { ...job, types: [0, 1, 2, 3] }, { ...job, discount: 'yes' }, null]) expect(validJob(bad)).toBe(false);
    const u = new URL(searchUrl({ ...job, discount: true }, 2));
    expect(u.origin + u.pathname).toBe('https://snappfood.ir/search/api/v5/search');
    expect(u.searchParams.get('superType')).toBe('[2]');
    expect(u.searchParams.get('filters')).toBe('["has_discount"]');
  });

  it('فقط فیلدهای لازم را می‌فرستد؛ عکس و لوگو پیدا می‌شوند', () => {
    const n = normalize({ ...rawItem, secretField: 'x', vendor: { ...rawItem.vendor, phone: '0912' } });
    expect(n).toEqual({
      id: 9876, title: 'پیتزا پپرونی', desc: 'خمیر نازک', price: 480000, final: 336000, discountRatio: 30, rating10: 9.2,
      image: 'https://cdn.snappfood.ir/media/products/9876.jpg',
      vendor: { code: 'p3x9kq', title: 'پیتزا شیلا', logo: 'https://cdn.snappfood.ir/media/logo/p3x9kq.png', rating10: 8.8, comments: 1520, open: true, fee: 25000, area: 'کیانپارس', type: 'فست فود' }
    });
    expect(findImage({ image: 'javascript:alert(1)' })).toBeNull();
  });

  it('۴۰۳ اسنپ‌فود = «blocked» و درخواست دیگری فرستاده نمی‌شود', async () => {
    const f = vi.fn(async () => new Response('<html>', { status: 403 }));
    vi.stubGlobal('fetch', f);
    expect(await runJob({ ...job, types: [0, 2] })).toEqual({ ok: false, items: [], error: 'blocked' });
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('پل اسنپ‌فود — سمت سرور', () => {
  it('کلید فقط با Bearer و دقیقاً برابر', () => {
    expect(relayAuthorized(`Bearer ${KEY}`)).toBe(true);
    expect(relayAuthorized(`Bearer ${'b'.repeat(64)}`)).toBe(false);
    expect(relayAuthorized(KEY)).toBe(false);
    expect(relayAuthorized(undefined)).toBe(false);
    vi.stubEnv('SHOP_RELAY_KEY', 'short');
    expect(relayAuthorized('Bearer short')).toBe(false);
  });

  it('endpoint بدون کلید درست چیزی نشان نمی‌دهد', async () => {
    const res = { statusCode: 0, body: '', setHeader() {}, end(b: string) { this.body = b; } };
    await relayEndpoint({ method: 'GET', headers: { authorization: 'Bearer wrong-key-wrong-key-wrong-key-wrong' } } as never, res as never);
    expect(res.statusCode).toBe(401);
  });

  it('چرخهٔ کامل: دستیار → صف → پل مک → نتیجه با لوگو، عکس و لینک اسنپ‌فود', async () => {
    await claimJobs(); // ضربان: پل روشن است
    const pending = snappfood({ keywords: 'پیتزا', city: ahvaz, sort: 'best', maxPrice: null, minPrice: null, used: false });
    await new Promise((r) => setTimeout(r, 50));
    const jobs = await claimJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].job).toEqual({ query: 'پیتزا', lat: ahvaz.lat, lon: ahvaz.lon, types: [0], discount: false });
    expect(await submitResult({ id: jobs[0].id, ok: true, items: [normalize(rawItem)] })).toBe(true);
    const items = await pending;
    expect(items[0]).toMatchObject({
      service: 'snappfood', title: 'پیتزا پپرونی', priceToman: 336000, priceBeforeToman: 480000, discountPercent: 30, rating: 4.6, ratingCount: 1520,
      image: 'https://cdn.snappfood.ir/media/products/9876.jpg', brandLogo: 'https://cdn.snappfood.ir/media/logo/p3x9kq.png',
      url: 'https://snappfood.ir/restaurant/menu/p3x9kq?productId=9876', summary: 'فست فود پیتزا شیلا', location: 'اهواز، کیانپارس'
    });
    // همان جستجو تا ۱۰ دقیقه از کش جواب می‌گیرد
    expect((await relaySearch(job)).ok).toBe(true);
  });

  it('پل خاموش → فوراً لینک مستقیم، بدون انتظار', async () => {
    await expect(snappfood({ keywords: 'پیتزا', city: ahvaz, sort: 'best', maxPrice: null, minPrice: null, used: false })).rejects.toThrow('پل مک خاموش است');
  });

  it('نتیجهٔ جعلی/خطرناک از پل پاک‌سازی می‌شود', async () => {
    const bad = parseSnappfood([
      { ...normalize(rawItem), image: 'javascript:alert(1)', vendor: { ...normalize(rawItem).vendor, logo: 'https://evil.example/x.png' } },
      { ...normalize(rawItem), id: 1, vendor: { ...normalize(rawItem).vendor, code: '../../admin' } }
    ], ahvaz);
    expect(bad).toHaveLength(1);
    expect(bad[0].image).toBeNull();
    expect(bad[0].brandLogo).toBeNull();
    expect(await submitResult({ id: 'not-a-claimed-job', ok: true, items: [] })).toBe(false);
  });

  it('کافه و شیرینی هم جستجو می‌شوند', () => {
    expect(foodTypes('آیس لاته')).toEqual([0, 2, 3]);
    expect(foodTypes('کباب کوبیده')).toEqual([0]);
  });
});

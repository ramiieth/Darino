import { describe, expect, it } from 'vitest';
import type { ParsedDetail } from '../collector/divarCar';
import { buildAd, mergeAds, pruneAds, touchFromRow } from './ads';
import { brandSlugOf } from './brandOf';
import { baselineTargets, buildGroups, marketIndex } from './compare';
import type { ArvandCity, CarAd } from './types';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-04T08:00:00Z');

function detail(title: string, model: string, year: string, price: string, desc = '', updatedAt: number | null = NOW): ParsedDetail {
  return {
    title,
    description: desc,
    fields: { 'برند و مدل': model, 'مدل (سال تولید)': year, 'قیمت پایه': price, کارکرد: '۱۲۰۰۰۰' },
    listedAt: updatedAt,
    updatedAt
  };
}

let seq = 0;
function ad(city: ArvandCity, title: string, model: string, year: string, priceB: number, extra: Partial<CarAd> = {}, desc = ''): CarAd {
  const token = `tok${String(++seq).padStart(4, '0')}`;
  const a = buildAd({
    row: { token, title, priceText: null, kmText: null, where: null, image: null },
    detail: detail(title, model, year, String(priceB * 1e9), desc),
    city,
    now: NOW,
    baselineFor: city === 'tehran' ? model : null
  });
  return { ...a, ...extra };
}

describe('ساخت و به‌روزرسانی آگهی', () => {
  it('طبقه‌بندی + قیمت + تاریخچه', () => {
    const a = ad('ahvaz', 'سانتافه پلاک اروند', 'هیوندای سانتافه', '۲۰۱۵', 3.3);
    expect(a).toMatchObject({ region: 'khuz', plate: 'arvand', year: 2015, price: 3.3e9, km: 120000 });
    expect(a.priceHistory).toEqual([{ ts: NOW, price: 3.3e9 }]);
  });

  it('قیمت نامعقول کنار گذاشته می‌شود', () => {
    expect(ad('ahvaz', 'پلاک اروند', 'کیا', '۲۰۱۷', 0.01).price).toBeNull();
  });

  it('ردیف جستجو: تغییر قیمت در تاریخچه و زمان دیده‌شدن', () => {
    const a = ad('abadan', 'اپتیما پلاک اروند', 'کیا اپتیما', '۲۰۱۷', 2.7);
    const t = touchFromRow(a, { token: a.token, title: a.title, priceText: '۲,۵۰۰,۰۰۰,۰۰۰ تومان', kmText: null, where: 'آبادان', image: null }, NOW + DAY);
    expect(t.price).toBe(2.5e9);
    expect(t.priceHistory.map((p) => p.price)).toEqual([2.7e9, 2.5e9]);
    expect(t.lastSeenAt).toBe(NOW + DAY);
    // قیمت تکراری دوباره ثبت نمی‌شود
    expect(touchFromRow(t, { ...t, priceText: '۲,۵۰۰,۰۰۰,۰۰۰ تومان', kmText: null, where: null, image: null }, NOW + 2 * DAY).priceHistory).toHaveLength(2);
  });
});

describe('حذف آگهی‌های قدیمی/ناموجود', () => {
  const run = NOW + DAY;
  const seen = { ...ad('ahvaz', 'پلاک اروند', 'کیا', '۲۰۱۷', 2), lastSeenAt: run + 1000 };
  const unseen = { ...ad('ahvaz', 'پلاک اروند', 'کیا', '۲۰۱۷', 2), lastSeenAt: NOW };
  const old = { ...ad('ahvaz', 'پلاک اروند', 'کیا', '۲۰۱۷', 2), lastSeenAt: run + 1000, updatedAt: run - 40 * DAY };
  const notArvand = { ...ad('ahvaz', 'کیا تمیز', 'کیا', '۲۰۱۷', 2), lastSeenAt: run + 1000 };

  it('دیده‌نشده در جستجوی کامل، بیش از ۳۰ روز بی‌فعالیت و غیراروند حذف می‌شوند', () => {
    const { kept, removed } = pruneAds([seen, unseen, old, notArvand], { now: run + 2000, runStartedAt: run, completed: ['khuz'] });
    expect(kept.map((a) => a.token)).toEqual([seen.token]);
    expect(removed).toEqual(expect.arrayContaining([unseen.token, old.token, notArvand.token]));
  });

  it('جستجوی ناقص منطقه → آگهی دیده‌نشده حذف نمی‌شود', () => {
    const { kept } = pruneAds([unseen], { now: run + 2000, runStartedAt: run, completed: [] });
    expect(kept).toHaveLength(1);
  });

  it('ادغام دستگاه‌ها: lastSeenAt جدیدتر می‌ماند', () => {
    expect(mergeAds([unseen], [{ ...unseen, price: 1.5e9, lastSeenAt: NOW + 5 }])[0].price).toBe(1.5e9);
  });
});

describe('مقایسه با پلاک ملی', () => {
  const model = 'هیوندای سانتافه ix 45 2400cc';
  const ads = [
    ad('ahvaz', 'پلاک اروند', model, '۲۰۱۵', 3.0),
    ad('abadan', 'پلاک اروند', model, '۲۰۱۵', 3.2),
    ad('khorramshahr', 'منطقه آزاد', model, '۲۰۱۵', 3.4),
    ad('ahvaz', 'پلاک اروند', model, '۲۰۱۵', 30), // پرت (صفر اضافه)
    ad('ahvaz', 'فروش ماشین های اروندی', model, '۲۰۱۵', 1.0), // نمایشگاهی
    ad('ahvaz', 'کف گمرک', model, '۲۰۱۵', 2.0), // کف گمرک — جدا
    ad('tehran', 'سانتافه', model, '۲۰۱۵', 6.0),
    ad('tehran', 'سانتافه', model, '۲۰۱۵', 6.5),
    ad('tehran', 'سانتافه', model, '۲۰۱۵', 7.0),
    ad('tehran', 'سانتافه', model, '۲۰۱۴', 5.0)
  ];
  const [g] = buildGroups(ads);

  it('میانه هم‌مدل و هم‌سال، بدون پرت/نمایشگاهی/کف گمرک', () => {
    expect(g.arvand.n).toBe(3);
    expect(g.arvand.median).toBe(3.2e9);
    expect(g.national.n).toBe(3);
    expect(g.national.median).toBe(6.5e9);
    expect(g.gapPct).toBeCloseTo((3.2 / 6.5 - 1) * 100);
    expect(g.lowSample).toBe(false);
  });

  it('شاخص بازار و مدل‌های نیازمند مبنا', () => {
    expect(marketIndex(buildGroups(ads))).toMatchObject({ comparable: 1, arvandAds: 3 });
    expect(baselineTargets(ads)).toEqual([model]);
  });

  it('بدون مبنای ملی → اختلاف null', () => {
    const [only] = buildGroups(ads.filter((a) => a.region === 'khuz'));
    expect(only.gapPct).toBeNull();
  });
});

describe('برند از مدل دیوار', () => {
  it.each([
    ['هیوندای سانتافه ix 45', 'hyundai'],
    ['ام‌جی 5', 'mg'],
    ['اوشان UNI-Z 1.5 لیتری', 'changan'],
    ['تویوتا لندکروزر', 'toyota'],
    ['بنز C200', null]
  ])('%s → %s', (m, slug) => expect(brandSlugOf(m)).toBe(slug));
});

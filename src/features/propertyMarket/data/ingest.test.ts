/**
 * ورود داده و Snapshot — مسیر سرور (دیوار) + پاک‌سازی داده قبلی
 */
import { describe, it, expect } from 'vitest';
import { buildSnapshot, ingestSeeds, listingsInWindow, purgeStoredListings, MARKET_WINDOW_DAYS } from './ingest';
import { emptySeed, type ParsedListingSeed } from '../collector/parse';
import type { PropertyMarketListing } from '../domain/types';

const NOW = Date.parse('2026-09-26T12:00:00Z');
const DAY = 86_400_000;

function seed(token: string, nb: string, area: number, ppm: number, source: string = 'divar'): ParsedListingSeed {
  const s = emptySeed(token, source as 'divar');
  s.neighborhood = nb;
  s.areaSqm = area;
  s.totalPriceToman = area * ppm;
  s.propertyKind = 'apartment';
  return s;
}

describe('ingestSeeds', () => {
  it('نرمال/اعتبارسنجی + شمارش جدید؛ شیپور و زیر ۹۰ متر رد', () => {
    const r = ingestSeeds({
      existing: [],
      seeds: [
        seed('a', 'کیانپارس', 100, 150e6),
        seed('sh-1', 'گلستان', 100, 90e6, 'sheypoor'),
        seed('s', 'گلستان', 80, 90e6),
        emptySeed('bad')
      ],
      city: 'ahvaz',
      cityId: '7',
      now: NOW
    });
    expect(r.added).toBe(1);
    expect(r.listings.map((l) => l.token)).toEqual(['a']);
    expect(r.listings[0].cityId).toBe('7');
    expect(r.report.rejectReasons['missing-price']).toBe(1);
    expect(r.report.rejectReasons['not-divar']).toBe(1);
    expect(r.report.rejectReasons['area-too-small']).toBe(1);
  });

  it('آگهی دوباره‌دیده‌شده → تازه (scrapedAt جدید) و جزو changed؛ جدید شمرده نمی‌شود', () => {
    const first = ingestSeeds({ existing: [], seeds: [seed('a', 'گلستان', 100, 90e6)], city: 'ahvaz', now: NOW - 10 * DAY });
    const second = ingestSeeds({ existing: first.listings, seeds: [seed('a', 'گلستان', 100, 90e6)], city: 'ahvaz', now: NOW });
    expect(second.added).toBe(0);
    expect(second.listings.length).toBe(1);
    expect(second.listings[0].scrapedAt).toBe(NOW);
    expect(second.changed.length).toBe(1);
  });

  it('آگهی دوباره ثبت‌شده با توکن دیگر (همان طبقه و مشخصات) → یکی', () => {
    const a = seed('d1', 'گلستان', 100, 90e6);
    const b = seed('d2', 'گلستان', 100, 90e6);
    a.floor = b.floor = 3;
    const r = ingestSeeds({ existing: [], seeds: [a, b], city: 'ahvaz', now: NOW });
    expect(r.listings.length).toBe(1);
    expect(r.report.deduplicated).toBe(1);
  });

  it('رد: ملک شهر دیگر و ویلایی', () => {
    const tehran = seed('t', 'گلستان', 100, 90e6);
    tehran.title = '۱۲۰ متر / منطقه ۵ / پونک';
    const villa = seed('v', 'گلستان', 200, 50e6);
    villa.propertyKind = 'villa-house';
    const flagged = seed('f', 'گلستان', 90, 80e6);
    flagged.otherCity = 'جنت آباد';
    const r = ingestSeeds({ existing: [], seeds: [tehran, villa, flagged], city: 'ahvaz', now: NOW });
    expect(r.listings.length).toBe(0);
    expect(r.report.rejectReasons['other-city']).toBe(2);
    expect(r.report.rejectReasons['not-apartment']).toBe(1);
  });

  it('آگهی شناخته‌شده بدون جزئیات → متراژ/سال ساخت از نسخه ذخیره؛ قیمت تازه از فهرست', () => {
    const first = seed('k', 'گلستان', 120, 90e6);
    first.yearBuilt = 1402;
    first.floor = 3;
    const stored = ingestSeeds({ existing: [], seeds: [first], city: 'ahvaz', now: NOW - DAY }).listings;
    const fromList = emptySeed('k');
    fromList.neighborhood = 'گلستان';
    fromList.propertyKind = 'apartment';
    fromList.totalPriceToman = 120 * 100e6; // قیمت تازه
    const r = ingestSeeds({ existing: stored, seeds: [fromList], city: 'ahvaz', now: NOW });
    const l = r.listings[0];
    expect(r.listings.length).toBe(1);
    expect(l.areaSqm).toBe(120);
    expect(l.yearBuilt).toBe(1402);
    expect(l.floor).toBe(3);
    expect(l.pricePerSqmToman).toBe(100e6);
    expect(l.scrapedAt).toBe(NOW);
  });

  it('seed خراب (بدون توکن) بی‌صدا نادیده گرفته می‌شود', () => {
    const r = ingestSeeds({ existing: [], seeds: [null as unknown as ParsedListingSeed, { token: '' } as ParsedListingSeed], city: 'ahvaz', now: NOW });
    expect(r.listings).toEqual([]);
  });
});

describe('buildSnapshot', () => {
  const base = ingestSeeds({
    existing: [],
    seeds: [
      seed('k1', 'کیانپارس', 100, 150e6),
      seed('k2', 'کیانپارس', 100, 160e6),
      seed('g1', 'گلستان', 100, 90e6),
      seed('g2', 'گلستان', 90, 95e6)
    ],
    city: 'ahvaz',
    now: NOW
  }).listings;

  it('آمار شهر/محله/منطقه + منبع دیوار', () => {
    const snap = buildSnapshot({ listings: base, now: NOW })!;
    expect(snap.id).toBe(`pmsnap-${NOW}`);
    expect(snap.source).toBe('divar');
    expect(snap.sourceCounts).toEqual({ divar: 4 });
    expect(snap.cityStats.listingCount).toBe(4);
    expect(snap.neighborhoodStats.map((n) => n.neighborhoodKey).sort()).toEqual(['golestan', 'kianpars-other']);
    // منطقه کیانپارس (گروه) با همه آگهی‌های عضو
    expect(snap.groupStats?.map((g) => g.neighborhoodKey)).toEqual(['kianpars']);
    expect(snap.groupStats?.[0].stats.listingCount).toBe(2);
    expect(snap.cityStats.meanTotalToman).toBeGreaterThan(0);
    expect(snap.cleaning.market).toBe(4);
  });

  it('آگهی‌های خارج از پنجره بازار حساب نمی‌شوند؛ داده خالی → null', () => {
    const old = base.map((l) => ({ ...l, scrapedAt: NOW - (MARKET_WINDOW_DAYS + 1) * DAY }));
    expect(listingsInWindow(old, NOW)).toEqual([]);
    expect(buildSnapshot({ listings: old, now: NOW })).toBeNull();
    expect(buildSnapshot({ listings: [], now: NOW })).toBeNull();
  });

  it('گزارش ورود همین اجرا در قیف Snapshot منعکس می‌شود', () => {
    const ing = ingestSeeds({ existing: [], seeds: [seed('z', 'گلستان', 100, 90e6), emptySeed('no')], city: 'ahvaz', now: NOW });
    const snap = buildSnapshot({ listings: ing.listings, now: NOW, ingestReport: ing.report })!;
    expect(snap.cleaning.raw).toBe(2);
    expect(snap.cleaning.rejectReasons['missing-price']).toBe(1);
  });
});

import { rekeyListings } from './ingest';

describe('rekeyListings — مهاجرت خودکار کلید محله', () => {
  it('کلید قدیمی ادغامی → محله رسمی + شرقی/غربی از عنوان؛ idempotent', () => {
    const old = ingestSeeds({ existing: [], seeds: [seed('k', 'کیان اباد', 100, 90e6)], city: 'ahvaz', now: NOW }).listings[0];
    const legacyKeyed = { ...old, neighborhoodKey: 'kianabad', title: '۱۱۰متر/کیان اباد شرقی' };
    const r1 = rekeyListings([legacyKeyed]);
    expect(r1.changed.length).toBe(1);
    expect(r1.listings[0].neighborhoodKey).toBe('kianabad-east');
    const r2 = rekeyListings(r1.listings);
    expect(r2.changed.length).toBe(0);
  });

  it('منطقه: گروه‌بندی آگهی‌های کیان‌آباد شرقی/غربی در Snapshot', () => {
    const e = seed('e', 'کیان اباد', 100, 100e6);
    e.title = 'کیان اباد شرقی';
    const w = seed('w', 'کیان اباد', 100, 80e6);
    w.title = 'کیان آباد غربی';
    const ls = ingestSeeds({ existing: [], seeds: [e, w], city: 'ahvaz', now: NOW }).listings;
    const snap = buildSnapshot({ listings: ls, now: NOW })!;
    expect(snap.neighborhoodStats.map((n) => n.neighborhoodKey).sort()).toEqual(['kianabad-east', 'kianabad-west']);
    const g = snap.groupStats!.find((x) => x.neighborhoodKey === 'kianabad')!;
    expect(g.stats.listingCount).toBe(2);
    expect(g.stats.medianTomanPerM2).toBe(90e6);
    expect(g.stats.meanTomanPerM2).toBe(90e6);
  });
});

describe('purgeStoredListings — داده قبلی با قواعد فعلی', () => {
  it('شیپور، زیر ۹۰ متر و محله متناقض حذف؛ بقیه می‌ماند', () => {
    const ok = ingestSeeds({ existing: [], seeds: [seed('ok', 'کیانپارس', 120, 150e6)], city: 'ahvaz', now: NOW }).listings[0];
    const stored: PropertyMarketListing[] = [
      ok,
      { ...ok, token: 'sh', source: 'sheypoor' as never },
      { ...ok, token: 'small', areaSqm: 75 },
      { ...ok, token: 'andisheh', title: 'آپارتمان کیانپارس اندیشه' }
    ];
    const r = purgeStoredListings(stored);
    expect(r.listings.map((l) => l.token)).toEqual(['ok']);
    expect(r.removed.sort()).toEqual(['andisheh', 'sh', 'small']);
  });
});

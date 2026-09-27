// @vitest-environment jsdom
/**
 * استور بازار املاک — جمع‌آوری فقط از مسیر سرور (دیوار) — بدون شبکه
 *
 * رگرسیون‌های اصلی:
 *  - «سرور در دسترس نیست» به‌خاطر health/دیتابیس → حالا فقط ping خود فانکشن
 *  - پیشرفت هر تکه فوراً ذخیره شود
 *  - داده قبلی نامعتبر (شیپور، زیر ۹۰ متر، محله متناقض) هنگام بارگذاری حذف شود
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  fetchJson: vi.fn(),
  isRemoteAllowed: vi.fn(() => true),
  isRemoteReady: vi.fn(async () => false),
  bulkPut: vi.fn(async () => undefined),
  bulkDelete: vi.fn(async (_keys: string[]) => undefined),
  snapPut: vi.fn(async () => undefined)
}));

vi.mock('@/repositories/remoteClient', () => ({
  fetchJson: h.fetchJson,
  isRemoteAllowed: h.isRemoteAllowed,
  isRemoteReady: h.isRemoteReady
}));
vi.mock('@/shared/lib/db', () => ({
  getDb: vi.fn(async () => ({
    pmListings: { toArray: async () => [], put: async () => undefined, bulkPut: h.bulkPut, bulkDelete: h.bulkDelete },
    pmSnapshots: { toArray: async () => [], put: h.snapPut, get: async () => undefined },
    realAssets: { toArray: async () => [] },
    realEstateSnapshots: { toArray: async () => [] }
  })),
  settingGet: vi.fn(async (_key: string, def: unknown) => def),
  settingSet: vi.fn(async () => undefined)
}));

import { usePropertyMarketStore } from './store';
import { useUsdtStore } from '@/shared/store/usdtStore';
import { emptySeed, type ParsedListingSeed } from '../collector/parse';
import type { ListingSource, PropertyMarketListing } from '../domain/types';

function seed(token: string, nb: string, ppm: number): ParsedListingSeed {
  const s = emptySeed(token);
  s.neighborhood = nb;
  s.areaSqm = 100;
  s.totalPriceToman = ppm * 100;
  s.propertyKind = 'apartment';
  return s;
}

type Body = { action: string; source?: ListingSource; cursor?: unknown };

/** سرور ساختگی: برای هر منبع فهرست پاسخ تکه‌ها */
function fakeServer(opts: {
  ping?: boolean;
  chunks?: Partial<Record<ListingSource, Array<Record<string, unknown>>>>;
}) {
  const idx: Record<string, number> = {};
  h.fetchJson.mockImplementation(async (_path: string, o?: { method?: string; body?: Body }) => {
    const body = o?.body;
    if (!body) return { configured: false, listings: [], snapshots: [] };
    if (body.action === 'ping') {
      if (opts.ping === false) throw new Error('HTTP 404');
      return { ok: true, service: 'darino-property-market' };
    }
    if (body.action === 'persist') return { ok: true, persisted: false };
    if (body.action === 'collectChunk') {
      const src = body.source as ListingSource;
      const list = opts.chunks?.[src] ?? [];
      const i = idx[src] ?? 0;
      idx[src] = i + 1;
      return list[Math.min(i, list.length - 1)] ?? { ok: false, error: 'source unreachable' };
    }
    return { ok: false };
  });
}

function chunk(source: ListingSource, seeds: ParsedListingSeed[], done: boolean, pagesRead = 1) {
  return {
    ok: true,
    source,
    done,
    cityId: '7',
    seeds,
    fetchedDetails: seeds.length,
    failedDetails: 0,
    pending: 0,
    cursor: { source, cityId: '7', paginationData: null, hasNextPage: !done, seenTokens: seeds.map((s) => s.token), pendingSeeds: [], pagesRead }
  };
}

beforeEach(() => {
  // نرخ تتر در این تست‌ها در دسترس نیست (بدون شبکه واقعی) → Snapshot بدون نرخ
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
  useUsdtStore.setState({ quote: null, status: 'idle', preferred: 'wallex', error: null, hydrated: true });
  h.fetchJson.mockReset();
  h.bulkPut.mockClear();
  h.snapPut.mockClear();
  h.isRemoteAllowed.mockReturnValue(true);
  usePropertyMarketStore.setState({
    listings: [],
    snapshots: [],
    hydrated: true,
    collect: usePropertyMarketStore.getInitialState().collect
  });
});

describe('startCollection — مسیر سرور (دیوار)', () => {
  it('سرور پاسخ ping نمی‌دهد → unavailable با پیام فارسی (بدون تلاش کلکشن)', async () => {
    fakeServer({ ping: false });
    await usePropertyMarketStore.getState().startCollection();
    const c = usePropertyMarketStore.getState().collect;
    expect(c.status).toBe('unavailable');
    expect(c.message).toContain('سرور جمع‌آوری در دسترس نیست');
    expect(h.fetchJson.mock.calls.some((call) => (call[1] as { body?: Body })?.body?.action === 'collectChunk')).toBe(false);
  });

  it('بدون وابستگی به health/دیتابیس؛ فقط دیوار؛ ذخیره تکه‌به‌تکه', async () => {
    fakeServer({
      chunks: {
        divar: [chunk('divar', [seed('d1', 'کیانپارس', 150e6), seed('d2', 'گلستان', 90e6)], false), chunk('divar', [seed('d3', 'گلستان', 95e6)], true, 2)]
      }
    });
    await usePropertyMarketStore.getState().startCollection();
    const st = usePropertyMarketStore.getState();
    expect(st.collect.status).toBe('done');
    expect(st.collect.sources.divar).toMatchObject({ status: 'done', valid: 3, pages: 2 });
    expect(Object.keys(st.collect.sources)).toEqual(['divar']);
    expect(st.collect.added).toBe(3);
    expect(st.snapshots.length).toBe(1);
    expect(st.snapshots[0].source).toBe('divar');
    const sources = h.fetchJson.mock.calls.map((c) => (c[1] as { body?: Body })?.body).filter((b) => b?.action === 'collectChunk').map((b) => b!.source);
    expect(new Set(sources)).toEqual(new Set(['divar']));
    expect(h.bulkPut).toHaveBeenCalledTimes(2);
    expect(h.snapPut).toHaveBeenCalledTimes(1);
    expect(h.fetchJson.mock.calls.some((call) => (call[1] as { body?: Body })?.body?.action === 'persist')).toBe(true);
  });

  it('خطای موقت یک‌باره → تلاش مجدد موفق', async () => {
    fakeServer({ chunks: { divar: [{ ok: false, error: 'HTTP 504' }, chunk('divar', [seed('d1', 'گلستان', 90e6)], true)] } });
    await usePropertyMarketStore.getState().startCollection();
    const st = usePropertyMarketStore.getState();
    expect(st.collect.sources.divar.status).toBe('done');
    expect(st.listings.length).toBe(1);
  }, 15_000);

  it('دیوار در دسترس نیست → error با دلیل فارسی و بدون Snapshot', async () => {
    fakeServer({ chunks: {} });
    await usePropertyMarketStore.getState().startCollection();
    const c = usePropertyMarketStore.getState().collect;
    expect(c.status).toBe('error');
    expect(c.message).toContain('دیوار در دسترس نبود');
    expect(usePropertyMarketStore.getState().snapshots.length).toBe(0);
  }, 20_000);

  it('توقف توسط کاربر → داده تا همان لحظه حفظ و Snapshot ثبت می‌شود', async () => {
    let n = 0;
    h.fetchJson.mockImplementation(async (_p: string, o?: { body?: Body }) => {
      const b = o?.body;
      if (b?.action === 'ping') return { ok: true, service: 'darino-property-market' };
      if (b?.action === 'collectChunk') {
        n += 1;
        if (n === 1) usePropertyMarketStore.getState().cancelCollection();
        return chunk('divar', [seed(`c${n}`, 'گلستان', 90e6)], false, n);
      }
      return { ok: true };
    });
    await usePropertyMarketStore.getState().startCollection();
    const st = usePropertyMarketStore.getState();
    expect(n).toBe(1);
    expect(st.collect.sources.divar.status).toBe('cancelled');
    expect(st.listings.length).toBe(1);
    expect(st.collect.status).toBe('done');
    expect(st.collect.message).toContain('متوقف');
  });

  it('اجرای همزمان دوم نادیده گرفته می‌شود', async () => {
    fakeServer({ chunks: { divar: [chunk('divar', [seed('d1', 'گلستان', 90e6)], true)] } });
    const a = usePropertyMarketStore.getState().startCollection();
    const b = usePropertyMarketStore.getState().startCollection();
    await Promise.all([a, b]);
    const pings = h.fetchJson.mock.calls.filter((c) => (c[1] as { body?: Body })?.body?.action === 'ping').length;
    expect(pings).toBe(1);
  });
});

function stored(token: string, patch: Partial<PropertyMarketListing> = {}): PropertyMarketListing {
  return {
    token, url: '', city: 'ahvaz', cityId: '7', neighborhood: 'گلستان', neighborhoodKey: 'golestan',
    propertyKind: 'apartment', areaSqm: 100, rooms: 2, yearBuilt: null, floor: null, totalPriceToman: 9e9,
    pricePerSqmToman: 9e7, parking: null, elevator: null, storage: null, balcony: null, title: null,
    listedAt: null, scrapedAt: 5, source: 'divar', ...patch
  };
}

async function hydrateWith(local: PropertyMarketListing[], remote?: PropertyMarketListing[]) {
  const { getDb } = await import('@/shared/lib/db');
  vi.mocked(getDb).mockResolvedValueOnce({
    pmListings: { toArray: async () => local, put: async () => undefined, bulkPut: h.bulkPut, bulkDelete: h.bulkDelete },
    pmSnapshots: { toArray: async () => [], put: h.snapPut, get: async () => undefined },
    realAssets: { toArray: async () => [] },
    realEstateSnapshots: { toArray: async () => [] }
  } as never);
  if (remote) {
    h.isRemoteReady.mockResolvedValueOnce(true);
    h.fetchJson.mockResolvedValueOnce({ listings: remote, snapshots: [] });
  }
  usePropertyMarketStore.setState({ hydrated: false });
  await usePropertyMarketStore.getState().hydrate();
}

describe('hydrate', () => {
  it('پشتیبان Neon ادغام می‌شود (جایگزین نمی‌شود)', async () => {
    await hydrateWith([stored('local1')], [stored('remote1')]);
    const tokens = usePropertyMarketStore.getState().listings.map((l) => l.token).sort();
    expect(tokens).toEqual(['local1', 'remote1']);
    expect(usePropertyMarketStore.getState().remoteConnected).toBe(true);
  });

  it('داده قبلی نامعتبر (شیپور، زیر ۹۰ متر، کیانپارس+اندیشه) حذف می‌شود — از IndexedDB هم', async () => {
    h.bulkDelete.mockClear();
    await hydrateWith(
      [
        stored('ok'),
        stored('sh', { source: 'sheypoor' as never }),
        stored('small', { areaSqm: 70 }),
        stored('andisheh', { neighborhood: 'کیانپارس', neighborhoodKey: 'kianpars-other', title: 'کیانپارس اندیشه ۱۲۰ متر' })
      ],
      [stored('sh-remote', { source: 'sheypoor' as never })]
    );
    expect(usePropertyMarketStore.getState().listings.map((l) => l.token)).toEqual(['ok']);
    expect(((h.bulkDelete.mock.calls[0] as unknown[])[0] as string[]).sort()).toEqual(['andisheh', 'sh', 'sh-remote', 'small']);
  });
});

describe('Snapshot + نرخ تتر', () => {
  it('نرخ زنده تتر و میانه قیمت کل در Snapshot ثبت می‌شود', async () => {
    useUsdtStore.setState({
      quote: { source: 'wallex', priceToman: 233000, tradedAt: null, fetchedAt: Date.now() },
      status: 'live',
      hydrated: true
    });
    fakeServer({ chunks: { divar: [chunk('divar', [seed('r1', 'گلستان', 90e6), seed('r2', 'گلستان', 100e6)], true)] } });
    await usePropertyMarketStore.getState().startCollection();
    const snap = usePropertyMarketStore.getState().snapshots[0];
    expect(snap.fxRateAtSnapshotToman).toBe(233000);
    expect(snap.fxSource).toBe('wallex');
    expect(snap.cityStats.medianTotalToman).toBe(9_500_000_000);
  });

  it('نرخ در دسترس نیست → Snapshot بدون نرخ (بعداً از تاریخچه روزانه؛ هرگز عدد دستی/جعلی)', async () => {
    fakeServer({ chunks: { divar: [chunk('divar', [seed('q1', 'گلستان', 90e6)], true)] } });
    await usePropertyMarketStore.getState().startCollection();
    const snap = usePropertyMarketStore.getState().snapshots[0];
    expect(snap.fxRateAtSnapshotToman).toBeNull();
    expect(snap.fxSource).toBeUndefined();
  });
});

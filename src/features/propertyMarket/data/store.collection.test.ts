// @vitest-environment jsdom
/**
 * استور بازار املاک — ارکستراسیون جمع‌آوری (سرور/فایل/پل) — بدون شبکه
 *
 * رگرسیون‌های اصلی:
 *  - «سرور در دسترس نیست» به‌خاطر health/دیتابیس → حالا فقط ping خود فانکشن
 *  - خطای یک منبع نباید کل جمع‌آوری را متوقف کند
 *  - پیشرفت هر تکه فوراً ذخیره شود
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  fetchJson: vi.fn(),
  isRemoteAllowed: vi.fn(() => true),
  isRemoteReady: vi.fn(async () => false),
  bulkPut: vi.fn(async () => undefined),
  snapPut: vi.fn(async () => undefined)
}));

vi.mock('@/repositories/remoteClient', () => ({
  fetchJson: h.fetchJson,
  isRemoteAllowed: h.isRemoteAllowed,
  isRemoteReady: h.isRemoteReady
}));
vi.mock('@/shared/lib/db', () => ({
  getDb: vi.fn(async () => ({
    pmListings: { toArray: async () => [], put: async () => undefined, bulkPut: h.bulkPut },
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
import { makeSeedPayload } from '../bridge/protocol';
import type { ListingSource, PropertyMarketListing } from '../domain/types';

function seed(token: string, nb: string, ppm: number, source: ListingSource = 'divar'): ParsedListingSeed {
  const s = emptySeed(token, source);
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
    cityId: source === 'divar' ? '7' : 'ahvaz',
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
    enabledSources: { divar: true, sheypoor: true },
    collect: usePropertyMarketStore.getInitialState().collect,
    importState: { status: 'idle', message: null, at: null }
  });
});

describe('startCollection — مسیر سرور', () => {
  it('سرور پاسخ ping نمی‌دهد → unavailable + پیشنهاد پل مرورگر (بدون تلاش کلکشن)', async () => {
    fakeServer({ ping: false });
    await usePropertyMarketStore.getState().startCollection();
    const c = usePropertyMarketStore.getState().collect;
    expect(c.status).toBe('unavailable');
    expect(c.serverUnavailable).toBe(true);
    expect(c.message).toContain('پل مرورگر');
    expect(h.fetchJson.mock.calls.some((call) => (call[1] as { body?: Body })?.body?.action === 'collectChunk')).toBe(false);
  });

  it('هیچ وابستگی به health/دیتابیس ندارد (isRemoteReady=false) و هر دو منبع را جمع می‌کند', async () => {
    fakeServer({
      chunks: {
        divar: [chunk('divar', [seed('d1', 'کیانپارس', 150e6), seed('d2', 'گلستان', 90e6)], false), chunk('divar', [seed('d3', 'گلستان', 95e6)], true, 2)],
        sheypoor: [chunk('sheypoor', [seed('sh-1', 'پاداد', 60e6, 'sheypoor')], true)]
      }
    });
    await usePropertyMarketStore.getState().startCollection();
    const st = usePropertyMarketStore.getState();
    expect(st.collect.status).toBe('done');
    expect(st.collect.sources.divar).toMatchObject({ status: 'done', valid: 3, pages: 2 });
    expect(st.collect.sources.sheypoor).toMatchObject({ status: 'done', valid: 1 });
    expect(st.collect.added).toBe(4);
    expect(st.listings.length).toBe(4);
    expect(st.snapshots.length).toBe(1);
    expect(st.snapshots[0].source).toBe('mixed');
    expect(st.snapshots[0].sourceCounts).toEqual({ divar: 3, sheypoor: 1 });
    // ذخیره تکه‌به‌تکه (نه فقط در پایان)
    expect(h.bulkPut).toHaveBeenCalledTimes(3);
    expect(h.snapPut).toHaveBeenCalledTimes(1);
    // پشتیبان best-effort
    expect(h.fetchJson.mock.calls.some((call) => (call[1] as { body?: Body })?.body?.action === 'persist')).toBe(true);
  });

  it('خطای یک منبع (دیوار) → منبع دیگر ادامه می‌دهد و Snapshot ثبت می‌شود', async () => {
    fakeServer({
      chunks: {
        divar: [{ ok: false, error: 'source unreachable' }],
        sheypoor: [chunk('sheypoor', [seed('sh-1', 'پاداد', 60e6, 'sheypoor')], true)]
      }
    });
    await usePropertyMarketStore.getState().startCollection();
    const st = usePropertyMarketStore.getState();
    expect(st.collect.sources.divar.status).toBe('error');
    expect(st.collect.sources.divar.error).toContain('دسترسی');
    expect(st.collect.status).toBe('done');
    expect(st.collect.message).toContain('دیوار در دسترس نبود');
    expect(st.snapshots.length).toBe(1);
  }, 15_000);

  it('خطای موقت یک‌باره → تلاش مجدد موفق', async () => {
    fakeServer({
      chunks: {
        divar: [{ ok: false, error: 'HTTP 504' }, chunk('divar', [seed('d1', 'گلستان', 90e6)], true)]
      }
    });
    await usePropertyMarketStore.getState().setSourceEnabled('sheypoor', false);
    await usePropertyMarketStore.getState().startCollection();
    const st = usePropertyMarketStore.getState();
    expect(st.collect.sources.divar.status).toBe('done');
    expect(st.collect.sources.sheypoor.status).toBe('skipped');
    expect(st.listings.length).toBe(1);
  }, 15_000);

  it('هر دو منبع ناموفق → error + serverUnavailable (پیشنهاد پل)', async () => {
    fakeServer({ chunks: {} });
    await usePropertyMarketStore.getState().startCollection();
    const c = usePropertyMarketStore.getState().collect;
    expect(c.status).toBe('error');
    expect(c.serverUnavailable).toBe(true);
    expect(c.message).toContain('پل مرورگر');
    expect(usePropertyMarketStore.getState().snapshots.length).toBe(0);
  }, 20_000);

  it('همه منابع خاموش → خطای صریح بدون درخواست', async () => {
    usePropertyMarketStore.setState({ enabledSources: { divar: false, sheypoor: false } });
    fakeServer({});
    await usePropertyMarketStore.getState().startCollection();
    expect(usePropertyMarketStore.getState().collect.status).toBe('error');
    expect(h.fetchJson).not.toHaveBeenCalled();
  });

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
    expect(st.collect.sources.sheypoor.status).toBe('cancelled');
    expect(st.listings.length).toBe(1);
    expect(st.collect.status).toBe('done');
    expect(st.collect.message).toContain('متوقف');
  });

  it('اجرای همزمان دوم نادیده گرفته می‌شود', async () => {
    fakeServer({ chunks: { divar: [chunk('divar', [seed('d1', 'گلستان', 90e6)], true)], sheypoor: [chunk('sheypoor', [], true)] } });
    const a = usePropertyMarketStore.getState().startCollection();
    const b = usePropertyMarketStore.getState().startCollection();
    await Promise.all([a, b]);
    const pings = h.fetchJson.mock.calls.filter((c) => (c[1] as { body?: Body })?.body?.action === 'ping').length;
    expect(pings).toBe(1);
  });
});

describe('ورود فایل / پل مرورگر (بدون سرور)', () => {
  it('فایل معتبر → آگهی‌ها + Snapshot، بدون هیچ درخواست collect', async () => {
    h.isRemoteAllowed.mockReturnValue(false); // کاملاً آفلاین
    const payload = makeSeedPayload({
      source: 'divar',
      cityId: '7',
      via: 'bridge',
      seeds: [seed('f1', 'کیانپارس', 150e6), seed('f2', 'گلستان', 90e6)]
    });
    const r = await usePropertyMarketStore.getState().importFileText(JSON.stringify(payload));
    expect(r).toMatchObject({ ok: true, added: 2 });
    const st = usePropertyMarketStore.getState();
    expect(st.listings.length).toBe(2);
    expect(st.snapshots.length).toBe(1);
    expect(st.importState.status).toBe('done');
    expect(st.importState.message).toContain('دیوار');
    expect(h.fetchJson).not.toHaveBeenCalled();
  });

  it('آرایه‌ای از payloadها (دیوار + شیپور) در یک فایل', async () => {
    const text = JSON.stringify([
      makeSeedPayload({ source: 'divar', cityId: '7', via: 'script', seeds: [seed('a', 'گلستان', 90e6)] }),
      makeSeedPayload({ source: 'sheypoor', cityId: 'ahvaz', via: 'script', seeds: [seed('sh-2', 'پاداد', 60e6, 'sheypoor')] })
    ]);
    const r = await usePropertyMarketStore.getState().importFileText(text);
    expect(r.added).toBe(2);
    expect(usePropertyMarketStore.getState().snapshots[0].source).toBe('mixed');
  });

  it('JSON خراب / فایل نامرتبط / بدون آگهی معتبر → پیام خطای فارسی', async () => {
    expect((await usePropertyMarketStore.getState().importFileText('{bad')).ok).toBe(false);
    expect(usePropertyMarketStore.getState().importState.message).toContain('JSON');
    expect((await usePropertyMarketStore.getState().importFileText('{"a":1}')).ok).toBe(false);
    const noPrice = makeSeedPayload({ source: 'divar', cityId: null, via: 'bridge', seeds: [emptySeed('np')] });
    const r = await usePropertyMarketStore.getState().importFileText(JSON.stringify(noPrice));
    expect(r.ok).toBe(false);
    expect(usePropertyMarketStore.getState().snapshots.length).toBe(0);
  });

  it('ورود دوباره همان داده → آگهی جدید صفر، بدون تکرار', async () => {
    const text = JSON.stringify(makeSeedPayload({ source: 'divar', cityId: '7', via: 'bridge', seeds: [seed('x', 'گلستان', 90e6)] }));
    await usePropertyMarketStore.getState().importFileText(text);
    const r = await usePropertyMarketStore.getState().importFileText(text);
    expect(r.added).toBe(0);
    expect(usePropertyMarketStore.getState().listings.length).toBe(1);
  });
});

describe('hydrate — پشتیبان Neon ادغام می‌شود (جایگزین نمی‌شود)', () => {
  it('آگهی محلی حفظ + آگهی سرور اضافه', async () => {
    const local: PropertyMarketListing = {
      token: 'local1', url: '', city: 'ahvaz', cityId: '7', neighborhood: 'گلستان', neighborhoodKey: 'golestan',
      propertyKind: 'apartment', areaSqm: 100, rooms: 2, yearBuilt: null, floor: null, totalPriceToman: 9e9,
      pricePerSqmToman: 9e7, parking: null, elevator: null, storage: null, balcony: null, title: null,
      listedAt: null, scrapedAt: 5, source: 'divar'
    };
    const { getDb } = await import('@/shared/lib/db');
    vi.mocked(getDb).mockResolvedValueOnce({
      pmListings: { toArray: async () => [local], put: async () => undefined, bulkPut: h.bulkPut },
      pmSnapshots: { toArray: async () => [], put: h.snapPut, get: async () => undefined },
      realAssets: { toArray: async () => [] },
      realEstateSnapshots: { toArray: async () => [] }
    } as never);
    h.isRemoteReady.mockResolvedValueOnce(true);
    h.fetchJson.mockResolvedValueOnce({ listings: [{ ...local, token: 'remote1' }], snapshots: [] });
    usePropertyMarketStore.setState({ hydrated: false });
    await usePropertyMarketStore.getState().hydrate();
    const tokens = usePropertyMarketStore.getState().listings.map((l) => l.token).sort();
    expect(tokens).toEqual(['local1', 'remote1']);
    expect(usePropertyMarketStore.getState().remoteConnected).toBe(true);
  });
});

describe('Snapshot + نرخ تتر', () => {
  it('نرخ زنده تتر و میانه قیمت کل در Snapshot ثبت می‌شود', async () => {
    useUsdtStore.setState({
      quote: { source: 'wallex', priceToman: 233000, tradedAt: null, fetchedAt: Date.now() },
      status: 'live',
      hydrated: true
    });
    const text = JSON.stringify(makeSeedPayload({ source: 'divar', cityId: '7', via: 'bridge', seeds: [seed('r1', 'گلستان', 90e6), seed('r2', 'گلستان', 100e6)] }));
    await usePropertyMarketStore.getState().importFileText(text);
    const snap = usePropertyMarketStore.getState().snapshots[0];
    expect(snap.fxRateAtSnapshotToman).toBe(233000);
    expect(snap.fxSource).toBe('wallex');
    expect(snap.cityStats.medianTotalToman).toBe(9_500_000_000);
    expect(snap.neighborhoodStats[0].stats.medianTotalToman).toBe(9_500_000_000);
  });

  it('نرخ در دسترس نیست → Snapshot بدون نرخ (بعداً از تاریخچه روزانه پر می‌شود؛ عدد جعلی نه)', async () => {
    const text = JSON.stringify(makeSeedPayload({ source: 'divar', cityId: '7', via: 'bridge', seeds: [seed('q1', 'گلستان', 90e6)] }));
    await usePropertyMarketStore.getState().importFileText(text);
    const snap = usePropertyMarketStore.getState().snapshots[0];
    expect(snap.fxRateAtSnapshotToman).toBeNull();
    expect(snap.fxSource).toBeUndefined();
  });
});

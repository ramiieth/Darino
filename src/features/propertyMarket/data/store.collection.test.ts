// @vitest-environment jsdom
/**
 * استور بازار املاک — رگرسیون «جمع‌آوری از دیوار وقتی دیتابیس در دسترس نیست»
 *
 * باگ اصلی: دکمه «جمع‌آوری از دیوار» پیش‌نیاز را `isRemoteReady`
 * (اتصال دیتابیس Neon) گذاشته بود؛ بنابراین وقتی دیتابیس تنظیم/وصل نبود،
 * خطای «سرور دیتابیس در دسترس نیست» نمایش داده می‌شد — درحالی‌که کلکشن
 * دیوار از مسیر سرور انجام می‌شود و به دیتابیس نیازی ندارد.
 *
 * انتظار جدید: پیش‌نیاز فقط «در دسترس بودن خود سرور» است؛ اگر دیتابیس
 * نباشد، سرور آگهی‌ها را برمی‌گرداند و کلاینت آن‌ها را در finalize پس
 * می‌فرستد و محلی ذخیره می‌کند.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

const remote = vi.hoisted(() => ({
  fetchJson: vi.fn(),
  isRemoteAllowed: vi.fn(() => true),
  isServerReachable: vi.fn(async () => true),
  // دیتابیس وصل نیست — سناریوی اصلی این رگرسیون
  isRemoteReady: vi.fn(async () => false)
}));

vi.mock('@/repositories/remoteClient', () => remote);
vi.mock('@/shared/lib/db', () => ({
  getDb: vi.fn(async () => null),
  settingGet: vi.fn(async (_key: string, def: unknown) => def),
  settingSet: vi.fn(async () => undefined)
}));

import { usePropertyMarketStore } from './store';
import type { PropertyMarketListing, PropertyMarketSnapshot } from '../domain/types';

function listing(token: string, nbKey: string, ppm: number): PropertyMarketListing {
  return {
    token,
    url: `https://divar.ir/v/${token}`,
    city: 'ahvaz',
    cityId: '6',
    neighborhood: 'کیانپارس',
    neighborhoodKey: nbKey,
    propertyKind: 'apartment',
    areaSqm: 100,
    rooms: 2,
    yearBuilt: 1398,
    floor: 2,
    totalPriceToman: ppm * 100,
    pricePerSqmToman: ppm,
    parking: null,
    elevator: null,
    storage: null,
    balcony: null,
    title: null,
    listedAt: null,
    scrapedAt: 1,
    source: 'divar'
  };
}

const SNAPSHOT: PropertyMarketSnapshot = {
  id: 'pmsnap-test-1',
  dateTs: 1726000000000,
  dateLabel: '2024-09-11',
  city: 'ahvaz',
  source: 'divar',
  fxRateAtSnapshotToman: null,
  cityStats: {
    medianTomanPerM2: 51_000_000,
    meanTomanPerM2: 51_000_000,
    p25TomanPerM2: 50_000_000,
    p75TomanPerM2: 52_000_000,
    listingCount: 2
  },
  neighborhoodStats: [],
  cleaning: {
    raw: 2,
    normalized: 2,
    valid: 2,
    deduplicated: 0,
    outliersRemoved: 0,
    market: 2,
    rejectReasons: {}
  },
  createdAt: 1726000000000
};

const CURSOR = {
  cityId: '6',
  paginationData: null,
  hasNextPage: false,
  seenTokens: ['a1', 'b2'],
  pendingTokens: [],
  pagesRead: 1
};

function resetStore(): void {
  usePropertyMarketStore.setState({
    listings: [],
    snapshots: [],
    legacyAssets: [],
    scenario: { futureUsdRateToman: null, propertyTomanGrowthPct: null, updatedAt: 0 },
    loading: false,
    hydrated: true,
    remoteConnected: false,
    collect: {
      status: 'idle',
      message: null,
      chunks: 0,
      listingsAdded: 0,
      detailsFetched: 0,
      cursor: null,
      serverUnavailable: false
    }
  });
}

describe('startCollection — کلکشن بدون وابستگی به دیتابیس', () => {
  beforeEach(() => {
    resetStore();
    remote.fetchJson.mockReset();
    remote.isServerReachable.mockReset();
    remote.isServerReachable.mockResolvedValue(true);
  });

  it('دیتابیس در دسترس نیست ولی سرور هست → کلکشن اجرا و محلی ذخیره می‌شود', async () => {
    const l1 = listing('a1', 'kianpars', 50_000_000);
    const l2 = listing('b2', 'golestan', 52_000_000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let finalizeBody: any = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    remote.fetchJson.mockImplementation(async (path: string, opts?: any) => {
      if (opts?.method === 'POST' && opts.body?.action === 'collectChunk') {
        return {
          ok: true,
          done: true,
          cursor: CURSOR,
          added: 2,
          fetchedDetails: 0,
          failedDetails: 0,
          persisted: false,
          listings: [l1, l2]
        };
      }
      if (opts?.method === 'POST' && opts.body?.action === 'finalize') {
        finalizeBody = opts.body;
        return { ok: true, snapshot: SNAPSHOT, persisted: false };
      }
      return { configured: false, listings: [], snapshots: [] }; // GET
    });

    await usePropertyMarketStore.getState().startCollection();

    const st = usePropertyMarketStore.getState();
    // کلکشن نباید به‌خاطر نبود دیتابیس «غیرقابل دسترس» شود
    expect(st.collect.status).toBe('done');
    expect(st.collect.serverUnavailable).toBe(false);
    // آگهی‌های دریافتی از سرور باید در finalize پس فرستاده شوند
    expect(Array.isArray(finalizeBody?.listings)).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(finalizeBody.listings.map((l: any) => l.token).sort()).toEqual(['a1', 'b2']);
    // Snapshot و آگهی‌ها در استور محلی می‌نشینند
    expect(st.snapshots.some((s) => s.id === SNAPSHOT.id)).toBe(true);
    expect(st.listings.map((l) => l.token).sort()).toEqual(['a1', 'b2']);
  });

  it('حالت ذخیره سمت سرور (persisted:true) → کلاینت لیست انباشته نمی‌فرستد', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let finalizeBody: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    remote.fetchJson.mockImplementation(async (_path: string, opts?: any) => {
      if (opts?.method === 'POST' && opts.body?.action === 'collectChunk') {
        return { ok: true, done: true, cursor: CURSOR, added: 2, fetchedDetails: 0, failedDetails: 0, persisted: true };
      }
      if (opts?.method === 'POST' && opts.body?.action === 'finalize') {
        finalizeBody = opts.body;
        return { ok: true, snapshot: SNAPSHOT, persisted: true };
      }
      return { configured: true, listings: [listing('a1', 'kianpars', 50_000_000)], snapshots: [] };
    });

    await usePropertyMarketStore.getState().startCollection();

    const st = usePropertyMarketStore.getState();
    expect(st.collect.status).toBe('done');
    expect(finalizeBody?.listings).toBeUndefined();
    expect(st.listings.map((l) => l.token)).toEqual(['a1']);
  });

  it('سرور هم در دسترس نیست → وضعیت unavailable با پیام شفاف درباره سرور', async () => {
    remote.isServerReachable.mockResolvedValue(false);

    await usePropertyMarketStore.getState().startCollection();

    const st = usePropertyMarketStore.getState();
    expect(st.collect.status).toBe('unavailable');
    expect(st.collect.serverUnavailable).toBe(true);
    expect(st.collect.message ?? '').toContain('سرور در دسترس نیست');
    // هیچ درخواست کلکشنی نباید رفته باشد
    expect(remote.fetchJson).not.toHaveBeenCalled();
  });

  it('خطای دیوار از سرور → وضعیت error (نه unavailable)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    remote.fetchJson.mockImplementation(async (_path: string, opts?: any) => {
      if (opts?.method === 'POST' && opts.body?.action === 'collectChunk') {
        return { ok: false, error: 'divar unreachable' };
      }
      return { configured: false, listings: [], snapshots: [] };
    });

    await usePropertyMarketStore.getState().startCollection();

    const st = usePropertyMarketStore.getState();
    expect(st.collect.status).toBe('error');
    // پیام کاربرپسند فارسی (نه متن خام خطا)
    expect(st.collect.message ?? '').toContain('دیوار از سمت سرور در دسترس نبود');
  });
});

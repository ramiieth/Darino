// @vitest-environment node
/**
 * /api/propertyMarket — کلکشنر بدون حالت (بازطراحی ۲۰۲۶-۰۹)
 *
 * باگ اصلی: کلکشن به health/دیتابیس گره خورده بود → «سرور در دسترس نیست».
 * حالا: ping و collectChunk هیچ وابستگی‌ای به دیتابیس ندارند؛ خطای منبع
 * به‌صورت { ok:false } صریح برمی‌گردد (نه ۵۰۰).
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  collectChunk: vi.fn(),
  fetchCities: vi.fn(),
  fetchListPage: vi.fn(),
  dbCalled: vi.fn()
}));

vi.mock('../src/features/propertyMarket/collector/run.js', async (orig) => {
  const actual = await orig<typeof import('../src/features/propertyMarket/collector/run.js')>();
  return { ...actual, collectChunk: h.collectChunk };
});
vi.mock('../src/features/propertyMarket/collector/client.js', async (orig) => {
  const actual = await orig<typeof import('../src/features/propertyMarket/collector/client.js')>();
  return { ...actual, fetchCities: h.fetchCities, fetchListPage: h.fetchListPage };
});
// دیتابیس تنظیم نشده — هر فراخوانی db() باید رخ ندهد
vi.mock('./_neon.js', async (orig) => {
  const actual = await orig<typeof import('./_neon.js')>();
  return {
    ...actual,
    isDbConfigured: () => false,
    db: () => {
      h.dbCalled();
      throw new Error('no db');
    }
  };
});

import handler from './propertyMarket';

function call(method: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve) => {
    const buf = body ? Buffer.from(JSON.stringify(body)) : Buffer.alloc(0);
    const req = {
      method,
      headers: {},
      on(ev: string, cb: (b?: Buffer) => void) {
        if (ev === 'data') cb(buf);
        else if (ev === 'end') cb();
      }
    };
    const res = {
      statusCode: 0,
      setHeader() {},
      end(b: string) {
        resolve({ status: this.statusCode, body: JSON.parse(b) });
      }
    };
    void handler(req as never, res as never);
  });
}

const SEED = {
  token: 'gagCBuEm',
  source: 'divar',
  title: 't',
  neighborhood: 'گلستان',
  propertyKind: 'apartment',
  areaSqm: 90,
  rooms: 2,
  yearBuilt: 1387,
  floor: 3,
  totalPriceToman: 3_100_000_000,
  pricePerSqmToman: null,
  parking: null,
  elevator: false,
  storage: null,
  balcony: null,
  listedAt: null,
  url: 'https://divar.ir/v/gagCBuEm'
};

beforeEach(() => {
  h.collectChunk.mockReset();
  h.fetchCities.mockReset();
  h.fetchListPage.mockReset();
  h.dbCalled.mockReset();
});

describe('/api/propertyMarket', () => {
  it('ping بدون دیتابیس و بدون شبکه بیرونی', async () => {
    const r = await call('POST', { action: 'ping' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, service: 'darino-property-market' });
    expect(h.dbCalled).not.toHaveBeenCalled();
    expect(h.collectChunk).not.toHaveBeenCalled();
  });

  it('collectChunk: seedها + کرسر برمی‌گردند (بدون دیتابیس)', async () => {
    h.collectChunk.mockResolvedValue({
      source: 'divar',
      cursor: { source: 'divar', cityId: '7', paginationData: null, hasNextPage: false, seenTokens: ['gagCBuEm'], pendingSeeds: [], pagesRead: 1 },
      seeds: [SEED],
      cityId: '7',
      done: true,
      fetchedDetails: 1,
      failedDetails: 0,
      pending: 0
    });
    const r = await call('POST', { action: 'collectChunk', source: 'divar', cursor: null });
    expect(r.body).toMatchObject({ ok: true, source: 'divar', done: true, cityId: '7', fetchedDetails: 1 });
    expect((r.body.seeds as unknown[]).length).toBe(1);
    expect(h.dbCalled).not.toHaveBeenCalled();
    expect(h.collectChunk.mock.calls[0][0]).toMatchObject({ city: 'ahvaz', source: 'divar' });
  });

  it('collectChunk: کرسر پاس داده می‌شود؛ شیپور (حذف‌شده) یا منبع نامعتبر → دیوار', async () => {
    h.collectChunk.mockResolvedValue({ source: 'divar', cursor: {}, seeds: [], cityId: '7', done: true, fetchedDetails: 0, failedDetails: 0, pending: 0 });
    await call('POST', { action: 'collectChunk', source: 'divar', cursor: { source: 'divar', cityId: '7', pagesRead: 2 } });
    expect(h.collectChunk.mock.calls[0][0].cursor.pagesRead).toBe(2);
    await call('POST', { action: 'collectChunk', source: 'sheypoor' });
    expect(h.collectChunk.mock.calls[1][0].source).toBe('divar');
    await call('POST', { action: 'collectChunk', source: 'evil' });
    expect(h.collectChunk.mock.calls[2][0].source).toBe('divar');
  });

  it('collectChunk: خطای شبکه منبع → ok:false صریح (نه ۵۰۰)', async () => {
    h.collectChunk.mockRejectedValue(new TypeError('fetch failed'));
    const r = await call('POST', { action: 'collectChunk', source: 'divar' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: false, source: 'divar', error: 'source unreachable' });
  });

  it('diagnose: وضعیت دیوار', async () => {
    h.fetchCities.mockResolvedValue([{ id: 7, slug: 'ahvaz', name: 'اهواز' }]);
    h.fetchListPage.mockResolvedValue({
      list_widgets: [{ widget_type: 'POST_ROW', data: { action: { payload: { token: 'a', web_info: {} } } } }]
    });
    const r = await call('POST', { action: 'diagnose' });
    const results = r.body.results as Record<string, { ok: boolean; listings: number; error?: string }>;
    expect(results.divar).toMatchObject({ ok: true, listings: 1 });
    expect(results.sheypoor).toBeUndefined();
  });

  it('persist بدون دیتابیس → ok با persisted:false', async () => {
    const r = await call('POST', { action: 'persist', listings: [], snapshot: null });
    expect(r.body).toEqual({ ok: true, persisted: false });
  });

  it('GET بدون دیتابیس → configured:false و فهرست خالی', async () => {
    const r = await call('GET');
    expect(r.body).toEqual({ configured: false, listings: [], snapshots: [] });
  });

  it('متد/اکشن نامعتبر', async () => {
    expect((await call('PUT')).status).toBe(405);
    expect((await call('POST', { action: 'x' })).status).toBe(400);
  });
});

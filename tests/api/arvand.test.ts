// @vitest-environment node
/**
 * /api/propertyMarket — عملیات خودروهای اروند (api/_arvand.ts)
 *  - ورودی نامعتبر رد می‌شود · جستجو و جزئیات از دیوار پارس می‌شوند
 *  - آگهی ناموجود در failed می‌آید · بدون دیتابیس ذخیره نمی‌شود (بدون خطا)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import listPage from '../../src/features/arvandCars/collector/__fixtures__/divar-list.json';
import detailPage from '../../src/features/arvandCars/collector/__fixtures__/divar-detail-arvand.json';

vi.mock('../../api/_neon.js', async (orig) => {
  const actual = await orig<typeof import('../../api/_neon.js')>();
  return { ...actual, isDbConfigured: () => false, db: () => { throw new Error('no db'); } };
});

import handler from '../../api/propertyMarket';

function call(method: string, opts: { url?: string; body?: unknown } = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve) => {
    const buf = opts.body ? Buffer.from(JSON.stringify(opts.body)) : Buffer.alloc(0);
    const req = {
      method,
      url: opts.url ?? '/api/propertyMarket',
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

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });

describe('خودروهای اروند در /api/propertyMarket', () => {
  it('جستجوی نامعتبر → ۴۰۰', async () => {
    expect((await call('POST', { body: { action: 'arvandSearch', city: 'paris', query: 'x' } })).status).toBe(400);
    expect((await call('POST', { body: { action: 'arvandSearch', city: 'ahvaz', query: '' } })).status).toBe(400);
  });

  it('جستجو: درخواست دسته خودرو شهر درست + ردیف‌های پارس‌شده', async () => {
    fetchMock.mockResolvedValue(ok(listPage));
    const r = await call('POST', { body: { action: 'arvandSearch', city: 'abadan', query: 'اروند' } });
    expect(r.body.ok).toBe(true);
    expect((r.body.rows as unknown[]).length).toBe(3);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent.city_ids).toEqual(['24']);
    expect(sent.search_data.form_data.data.category.str.value).toBe('light');
  });

  it('جزئیات: توکن نامعتبر حذف، آگهی ناموجود در failed', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/gone12345') ? new Response('{}', { status: 404 }) : ok(detailPage)
    );
    const r = await call('POST', { body: { action: 'arvandDetails', tokens: ['gaBvkO5p', 'gone12345', '../evil'] } });
    expect(r.body.ok).toBe(true);
    expect(Object.keys(r.body.details as object)).toEqual(['gaBvkO5p']);
    expect(r.body.failed).toEqual(['gone12345']);
    expect(r.body.remaining).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 20_000);

  it('بدون دیتابیس: ذخیره و تاریخچه بدون خطا', async () => {
    expect((await call('POST', { body: { action: 'arvandPersist', ads: [], removed: [] } })).body).toEqual({ ok: true, persisted: false });
    expect((await call('GET', { url: '/api/propertyMarket?market=arvand' })).body).toEqual({ configured: false, ads: [], snapshots: [] });
  });
});

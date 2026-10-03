// @vitest-environment node
/**
 * /api/propertyMarket — عملیات بازار خودرو (car.ir) در همان فانکشن (سقف ۱۲ فانکشن)
 *  - carPrices بدون دیتابیس کار می‌کند
 *  - Cron فقط با CRON_SECRET / User-Agent ورسل
 *  - نبود دیتابیس → پاسخ صریح بدون خطا
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ fetchCarIrPrices: vi.fn(), dbConfigured: false, queries: [] as string[] }));

vi.mock('../../src/features/carMarket/collector/carIr.js', async (orig) => {
  const actual = await orig<typeof import('../../src/features/carMarket/collector/carIr.js')>();
  return { ...actual, fetchCarIrPrices: h.fetchCarIrPrices };
});
vi.mock('../../src/shared/fx/usdtRate.js', async (orig) => {
  const actual = await orig<typeof import('../../src/shared/fx/usdtRate.js')>();
  return { ...actual, fetchUsdtDirect: async () => ({ source: 'wallex', priceToman: 100_000, tradedAt: null, fetchedAt: 0 }) };
});
vi.mock('../../api/_schema.js', () => ({ ensureSchema: async () => true }));
vi.mock('../../api/_authCore.js', () => ({ requireSession: async () => ({ userId: 'u1' }) }));
vi.mock('../../api/_neon.js', async (orig) => {
  const actual = await orig<typeof import('../../api/_neon.js')>();
  return {
    ...actual,
    isDbConfigured: () => h.dbConfigured,
    db: () => (strings: TemplateStringsArray) => {
      h.queries.push(strings.join('?'));
      return Promise.resolve([]);
    }
  };
});

import handler from '../../api/propertyMarket';

const PARSED = {
  rows: [{ id: '1', modelId: '9', brand: 'kia', model: 'کیا', year: '2025', option: null, market: 3e9, dealer: null, marketUpdatedAt: null, srcChangePct: null }],
  brandNames: { kia: 'کیا' },
  sourceUpdatedAt: null
};

function call(
  method: string,
  opts: { url?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve) => {
    const buf = opts.body ? Buffer.from(JSON.stringify(opts.body)) : Buffer.alloc(0);
    const req = {
      method,
      url: opts.url ?? '/api/propertyMarket',
      headers: opts.headers ?? {},
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

beforeEach(() => {
  h.fetchCarIrPrices.mockReset();
  h.dbConfigured = false;
  h.queries = [];
  delete process.env.CRON_SECRET;
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('بازار خودرو در /api/propertyMarket', () => {
  it('carPrices: فهرست قیمت بدون دیتابیس', async () => {
    h.fetchCarIrPrices.mockResolvedValue(PARSED);
    const r = await call('POST', { body: { action: 'carPrices' } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, rows: PARSED.rows });
  });

  it('carPrices: خطای منبع → ok:false صریح (نه ۵۰۰)', async () => {
    h.fetchCarIrPrices.mockRejectedValue(new Error('fetch failed'));
    const r = await call('POST', { body: { action: 'carPrices' } });
    expect(r).toMatchObject({ status: 200, body: { ok: false, error: 'source unreachable' } });
  });

  it('Cron بدون مجوز → ۴۰۱', async () => {
    const r = await call('GET', { url: '/api/propertyMarket?market=car&cron=1' });
    expect(r.status).toBe(401);
    process.env.CRON_SECRET = 's3cret';
    const r2 = await call('GET', { url: '/api/propertyMarket?market=car&cron=1', headers: { 'user-agent': 'vercel-cron/1.0' } });
    expect(r2.status).toBe(401);
  });

  it('Cron با مجوز و دیتابیس → Snapshot امروز با نرخ تتر ذخیره می‌شود', async () => {
    process.env.CRON_SECRET = 's3cret';
    h.dbConfigured = true;
    h.fetchCarIrPrices.mockResolvedValue(PARSED);
    const r = await call('GET', { url: '/api/propertyMarket?market=car&cron=1', headers: { authorization: 'Bearer s3cret' } });
    expect(r.body).toMatchObject({ ok: true, persisted: true, rows: 1, usdt: 100_000 });
    expect(h.queries.some((q) => q.includes('INSERT INTO "carPriceSnapshots"'))).toBe(true);
  });

  it('Cron بدون دیتابیس → persisted:false', async () => {
    const r = await call('GET', { url: '/api/propertyMarket?market=car&cron=1', headers: { 'user-agent': 'vercel-cron/1.0' } });
    expect(r.body).toMatchObject({ ok: true, persisted: false });
    expect(h.fetchCarIrPrices).not.toHaveBeenCalled();
  });

  it('GET تاریخچه بدون دیتابیس → configured:false', async () => {
    const r = await call('GET', { url: '/api/propertyMarket?market=car' });
    expect(r.body).toEqual({ configured: false, snapshots: [] });
  });

  it('carPersist: Snapshot نامعتبر رد می‌شود', async () => {
    h.dbConfigured = true;
    const r = await call('POST', { body: { action: 'carPersist', snapshot: { id: 'x', day: 'd', dateTs: 1, rows: [{}] } } });
    expect(r.status).toBe(400);
    expect(h.queries.some((q) => q.includes('carPriceSnapshots'))).toBe(false);
  });
});

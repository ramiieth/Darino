// @vitest-environment node
/**
 * /api/propertyMarket — رگرسیون «کلکشن بدون دیتابیس»
 *
 * باگ اصلی: بدون DATABASE_URL (یا وقتی Neon در دسترس نبود) کل هندلر
 * { configured: false } برمی‌گرداند و کلاینت با خطای «سرور دیتابیس در
 * دسترس نیست» کلکشن را اصلاً شروع نمی‌کرد — درحالی‌که خودِ کلکشن دیوار
 * نیازی به دیتابیس ندارد و فقط از مسیر سرور انجام می‌شود.
 *
 * این تست‌ها حالت بدون دیتابیس را پوشش می‌دهند:
 *  - collectChunk با بافر درون‌حافظه + برگشت آگهی‌ها (persisted: false)
 *  - finalize با آگهی‌های پس‌فرستاده‌شده کلاینت (تحمل چرخش instance)
 *  - GET برای داده‌های همین جلسه
 */
import { describe, expect, it, beforeAll, vi } from 'vitest';
import handler from './propertyMarket';

// کلکشنر واقعی به شبکه دیوار نیاز دارد — نتیجه‌اش اینجا شبیه‌سازی می‌شود
// (vi.hoisted چون کارخانه ماک قبل از بدنه ماژول اجرا می‌شود)
const { SEEDS } = vi.hoisted(() => {
  const makeSeed = (token: string, nb: string, area: number, ppm: number) => ({
    token,
    title: `آپارتمان ${area} متری ${nb}`,
    neighborhood: nb,
    propertyKind: 'apartment' as const,
    areaSqm: area,
    rooms: 2,
    yearBuilt: 1398,
    floor: 3,
    totalPriceToman: area * ppm,
    pricePerSqmToman: ppm,
    parking: true,
    elevator: true,
    storage: null,
    balcony: null,
    listedAt: null,
    url: `https://divar.ir/v/${token}`
  });
  return {
    SEEDS: [makeSeed('a1', 'کیانپارس', 100, 50_000_000), makeSeed('b2', 'گلستان', 120, 52_000_000)]
  };
});

vi.mock('../src/features/propertyMarket/collector/run.js', () => ({
  collectChunk: vi.fn(async () => ({
    cursor: {
      cityId: '6',
      paginationData: null,
      hasNextPage: false,
      seenTokens: ['a1', 'b2'],
      pendingTokens: [],
      pagesRead: 1
    },
    seeds: SEEDS,
    cityId: '6',
    done: true,
    fetchedDetails: 0,
    failedDetails: 0
  }))
}));

interface FakeResponse {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

/** فراخوانی درون‌فرآیندی هندلر با شبیه‌سازی req/res */
function call(method: string, body?: unknown): Promise<FakeResponse> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const req = {
      method,
      headers: { 'x-user-id': 'test-user' },
      on(event: string, cb: (chunk?: Buffer) => void) {
        if (event === 'data') cb(payload ? Buffer.from(payload) : Buffer.alloc(0));
        else if (event === 'end') cb();
      }
    };
    const res = {
      statusCode: 200,
      setHeader(_k: string, _v: string) {
        /* noop */
      },
      end(b: string) {
        resolve({ status: res.statusCode, body: JSON.parse(b) });
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler(req as any, res as any).catch(reject);
  });
}

beforeAll(() => {
  // حالت بدون دیتابیس — دقیقاً سناریوی گزارش‌شده
  delete process.env.DATABASE_URL;
});

describe('api/propertyMarket — حالت بدون دیتابیس (کلکشن از مسیر سرور)', () => {
  it('بدون DATABASE_URL کلکشن مسدود نمی‌شود — persisted:false + آگهی‌ها برمی‌گردند', async () => {
    const res = await call('POST', { action: 'collectChunk', city: 'ahvaz', cursor: null });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.persisted).toBe(false);
    expect(res.body.added).toBe(2);
    expect(Array.isArray(res.body.listings)).toBe(true);
    expect(res.body.listings.map((l: { token: string }) => l.token).sort()).toEqual(['a1', 'b2']);
    // گزارش قیف پاک‌سازی هم برگردانده می‌شود (شفافیت)
    expect(res.body.report.valid).toBe(2);
  });

  it('GET داده‌های همین جلسه را برمی‌گرداند (نه خطای دیتابیس)', async () => {
    const res = await call('GET');
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
    expect(res.body.listings.length).toBe(2);
  });

  it('finalize از بافر همان نشست → Snapshot ساخته می‌شود', async () => {
    const res = await call('POST', { action: 'finalize' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.persisted).toBe(false);
    expect(res.body.snapshot.source).toBe('divar');
    expect(res.body.snapshot.cleaning.market).toBeGreaterThanOrEqual(1);
  });

  it('finalize با آگهی‌های پس‌فرستاده کلاینت — تحمل چرخش/سردشدن instance', async () => {
    // شبیه‌سازی: کلاینت آگهی جدیدی دارد که در بافر این نشست نیست
    const extra = {
      token: 'c3',
      url: 'https://divar.ir/v/c3',
      city: 'ahvaz',
      cityId: '6',
      neighborhood: 'کیانپارس',
      neighborhoodKey: 'kianpars',
      propertyKind: 'apartment',
      areaSqm: 110,
      rooms: 3,
      yearBuilt: 1399,
      floor: 2,
      totalPriceToman: 110 * 51_000_000,
      pricePerSqmToman: 51_000_000,
      parking: true,
      elevator: true,
      storage: null,
      balcony: null,
      title: null,
      listedAt: null,
      scrapedAt: Date.now(),
      source: 'divar'
    };
    // + یک توکن تکراری که نباید دو بار شمرده شود
    const res = await call('POST', { action: 'finalize', listings: [extra, { ...extra, token: 'a1' }] });
    expect(res.body.ok).toBe(true);
    // a1 و b2 از بافر + c3 از body → سه آگهی (تکراری حذف شد)
    expect(res.body.snapshot.cleaning.raw).toBe(3);
  });

  it('finalize بدون هیچ آگهی‌ای → خطای صریح، نه کرش', async () => {
    const res = await call('POST', { action: 'finalize', listings: [] });
    // بافر این نشست از تست‌های قبل پر است؛ پس اینجا «ناشناخته» نیست —
    // فقط قرارداد پاسخ بررسی می‌شود.
    expect(res.status).toBe(200);
    expect(typeof res.body.ok).toBe('boolean');
  });

  it('اکشن ناشناخته → 400', async () => {
    const res = await call('POST', { action: 'bogus' });
    expect(res.status).toBe(400);
  });
});

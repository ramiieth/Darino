/** فراخوان مشترک Gemini: مدل بازنشسته → مدل جایگزین؛ شلوغی موقت → تلاش دوباره؛ علت واقعی در پیام خطا */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzePerformance, _resetGeminiDiscovery } from '../../api/_assistant';

const ok = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }), { status: 200 });
const err = (status: number, message: string) => new Response(JSON.stringify({ error: { message } }), { status });
const urls: string[] = [];
/** پاسخ ListModels گوگل در تست‌ها (پیش‌فرض: خالی → زنجیرهٔ ثابت) */
let listed: string[] = [];
const isList = (u: unknown) => /\/models\?/.test(String(u));
const listResponse = () => new Response(JSON.stringify({ models: listed.map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) }), { status: 200 });

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test';
  // تست‌های زنجیرهٔ Flash از ۳.۸ شروع می‌کنند؛ پیش‌فرض Argon در describe جدا
  process.env.GEMINI_MODEL = 'gemini-3.8-flash';
  delete process.env.GEMINI_MODEL_PERFORMANCE;
  urls.length = 0;
  listed = [];
  _resetGeminiDiscovery();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

function serve(...responses: Response[]) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => { if (isList(u)) return listResponse(); urls.push(String(u)); return responses.shift() ?? err(500, 'x'); });
}
const run = () => analyzePerformance({ analysis: { a: 1 } });

describe('gemini()', () => {
  it('مدل تنظیم‌شده ۴۰۴ → مدل جایگزین', async () => {
    serve(err(404, 'models/gemini-3.8-flash is not found'), ok('گزارش'));
    await expect(run()).resolves.toBe('گزارش');
    expect(urls[1]).toContain('/models/gemini-3.7-flash:');
  });
  it('۵۰۳ شلوغی → فوراً مدل جایگزین (نه تکرار همان مدل شلوغ)', async () => {
    serve(err(503, 'This model is currently experiencing high demand.'), ok('گزارش'));
    await expect(run()).resolves.toBe('گزارش');
    expect(urls[0]).toContain('/models/gemini-3.8-flash:');
    expect(urls[1]).toContain('/models/gemini-3.7-flash:');
  });
  it('همهٔ مدل‌ها شلوغ → تکرار با مکث روی آخرین مدل، سپس پیام شلوغی', async () => {
    serve(...Array.from({ length: 12 }, () => err(503, 'high demand')));
    await expect(run()).rejects.toMatchObject({ status: 503 });
    expect(new Set(urls.map((u) => u.split('/models/')[1].split(':')[0])).size).toBe(4);
  }, 20_000);
  it('کلید نامعتبر → پیام روشن، بدون تلاش بی‌فایده', async () => {
    serve(err(400, 'API key not valid. Please pass a valid API key.'));
    await expect(run()).rejects.toMatchObject({ status: 503, message: 'کلید Gemini در سرور نامعتبر است' });
    expect(urls).toHaveLength(1);
  });
  it('سهمیهٔ همهٔ مدل‌ها → ۴۲۹ (بعد از امتحان همه)', async () => {
    serve(...Array.from({ length: 20 }, () => err(429, 'quota')));
    await expect(run()).rejects.toMatchObject({ status: 429 });
    expect(new Set(urls.map((u) => u.split('/models/')[1].split(':')[0])).size).toBe(4);
  }, 20_000);
  it('سهمیهٔ یک مدل (۴۲۹) → مدل بعدی، نه خطا', async () => {
    serve(err(429, 'quota'), ok('گزارش'));
    await expect(run()).resolves.toBe('گزارش');
    expect(urls[1]).toContain('/models/gemini-3.7-flash:');
  });
  it('پاسخ خالی → مدل بعدی', async () => {
    serve(new Response(JSON.stringify({ candidates: [{ content: { parts: [] }, finishReason: 'OTHER' }] }), { status: 200 }), ok('گزارش'));
    await expect(run()).resolves.toBe('گزارش');
    expect(urls[1]).toContain('/models/gemini-3.7-flash:');
  });
  it('thinkingConfig ناسازگار → همان مدل بدون آن', async () => {
    const bodies: string[] = [];
    let n = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, init) => {
      if (isList(u)) return listResponse();
      urls.push(String(u)); bodies.push(String(init?.body));
      return n++ === 0 ? err(400, 'Thinking level is not supported for this model.') : ok('گزارش');
    });
    await expect(run()).resolves.toBe('گزارش');
    expect(urls[0]).toBe(urls[1]);
    expect(bodies[1]).not.toContain('thinkingLevel');
  });
  it('خطای ۴xx دیگر روی یک مدل → مدل بعدی', async () => {
    serve(err(400, 'Request contains an invalid argument.'), ok('گزارش'));
    await expect(run()).resolves.toBe('گزارش');
  });
});

describe('چند کلید Gemini', () => {
  const used: string[] = [];
  const lanes = ['GEMINI_API_KEY_CHAT', 'GEMINI_API_KEY_PERFORMANCE', 'GEMINI_API_KEY_REVIEW', 'GEMINI_API_KEY_TOOLS'];
  function serveKeys(...responses: Response[]) {
    used.length = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => { if (isList(_u)) return listResponse(); used.push(String((init?.headers as Record<string, string>)['x-goog-api-key'])); return responses.shift() ?? err(500, 'x'); });
  }
  afterEach(() => { for (const n of lanes) delete process.env[n]; });

  it('بخش عملکرد اول کلید اختصاصی خودش را مصرف می‌کند', async () => {
    process.env.GEMINI_API_KEY_PERFORMANCE = 'perf-1';
    serveKeys(ok('گزارش'));
    await expect(run()).resolves.toBe('گزارش');
    expect(used).toEqual(['perf-1']);
  });
  it('۴۲۹ روی یک کلید → کلید بعدی همان لحظه', async () => {
    process.env.GEMINI_API_KEY_PERFORMANCE = 'perf-2';
    process.env.GEMINI_API_KEY_CHAT = 'chat-2';
    serveKeys(err(429, 'quota'), ok('گزارش'));
    await expect(run()).resolves.toBe('گزارش');
    expect(used[0]).toBe('perf-2'); expect(used).toHaveLength(2); expect(used[1]).not.toBe('perf-2');
  });
  it('کلید نامعتبر → کلید بعدی', async () => {
    process.env.GEMINI_API_KEY_PERFORMANCE = 'perf-bad';
    serveKeys(err(400, 'API key not valid.'), ok('گزارش'));
    await expect(run()).resolves.toBe('گزارش');
    expect(used[1]).not.toBe('perf-bad');
  });
  it('سهمیهٔ همهٔ کلیدها تمام → ۴۲۹', async () => {
    process.env.GEMINI_API_KEY_PERFORMANCE = 'perf-3';
    serveKeys(...Array.from({ length: 30 }, () => err(429, 'q')));
    await expect(run()).rejects.toMatchObject({ status: 429 });
    expect(new Set(used)).toEqual(new Set(['perf-3', 'test']));
  }, 20_000);
});

describe('مدل اختصاصی بخش (اختیاری)', () => {
  it('با GEMINI_MODEL=Flash: Flash، نه Pro', async () => {
    serve(ok('گزارش'));
    await expect(run()).resolves.toBe('گزارش');
    expect(urls[0]).toContain('/models/gemini-3.8-flash:');
  });
  describe('با GEMINI_MODEL_PERFORMANCE=Pro', () => {
  beforeEach(() => { process.env.GEMINI_MODEL_PERFORMANCE = 'gemini-pro-latest'; });
  afterEach(() => { delete process.env.GEMINI_MODEL_PERFORMANCE; });
  it('Pro شلوغ → Flash', async () => {
    serve(err(503, 'high demand'), ok('گزارش'));
    await expect(run()).resolves.toBe('گزارش');
    expect(urls[1]).toContain('/models/gemini-3.8-flash:');
  });
  it('Pro کند (timeout) → Flash به‌جای خطا', async () => {
    let n = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => {
      if (isList(u)) return listResponse();
      urls.push(String(u));
      if (n++ === 0) { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e; }
      return ok('گزارش');
    });
    await expect(run()).resolves.toBe('گزارش');
    expect(urls[1]).toContain('/models/gemini-3.8-flash:');
  });
});
});

describe('کشف مدل‌های Flash فعال از گوگل', () => {
  it('۳.۸ شلوغ → جدیدترین Flash فعال این کلید؛ مدل ناموجود (۳.۷/۳.۶) اصلاً امتحان نمی‌شود', async () => {
    listed = ['gemini-3.8-flash', 'gemini-3.9-flash', 'gemini-3.5-flash', 'gemini-3.9-flash-lite', 'gemini-2.5-flash-image'];
    serve(err(503, 'high demand'), ok('گزارش'));
    await expect(run()).resolves.toBe('گزارش');
    expect(urls[1]).toContain('/models/gemini-3.9-flash:');
    expect(urls.some((u) => /3\.[76]-flash/.test(u))).toBe(false);
  });
  it('ترتیب بعد از کشف: جدیدترین اول، سپس gemini-flash-latest', async () => {
    listed = ['gemini-3.5-flash', 'gemini-3.8-flash'];
    serve(err(503, 'x'), err(503, 'x'), ok('گزارش'));
    await expect(run()).resolves.toBe('گزارش');
    expect(urls.map((u) => u.split('/models/')[1].split(':')[0])).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-flash-latest']);
  });
  it('مسیر عادی: بدون درخواست فهرست مدل (بدون تأخیر)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ok('گزارش'));
    await expect(run()).resolves.toBe('گزارش');
    expect(spy.mock.calls.some(([u]) => isList(u))).toBe(false);
  });
});

describe('پیش‌فرض: Gemini 4 Argon', () => {
  beforeEach(() => { delete process.env.GEMINI_MODEL; });
  it('اول Argon', async () => {
    serve(ok('گزارش'));
    await expect(run()).resolves.toBe('گزارش');
    expect(urls[0]).toContain('/models/gemini-4-argon:');
  });
  it('Argon شلوغ → Flash 3.8', async () => {
    serve(err(503, 'high demand'), ok('گزارش'));
    await expect(run()).resolves.toBe('گزارش');
    expect(urls[1]).toContain('/models/gemini-3.8-flash:');
  });
  it('Argon در دسترس نیست (۴۰۴) → Flash 3.8', async () => {
    serve(err(404, 'models/gemini-4-argon is not found'), ok('گزارش'));
    await expect(run()).resolves.toBe('گزارش');
    expect(urls[1]).toContain('/models/gemini-3.8-flash:');
  });
});

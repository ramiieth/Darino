/** فراخوان مشترک Gemini: مدل بازنشسته → مدل جایگزین؛ شلوغی موقت → تلاش دوباره؛ علت واقعی در پیام خطا */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzePerformance } from '../../api/_assistant';

const ok = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }), { status: 200 });
const err = (status: number, message: string) => new Response(JSON.stringify({ error: { message } }), { status });
const urls: string[] = [];

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test';
  delete process.env.GEMINI_MODEL;
  urls.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

function serve(...responses: Response[]) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => { urls.push(String(u)); return responses.shift() ?? err(500, 'x'); });
}
const run = () => analyzePerformance({ analysis: { a: 1 } });

describe('gemini()', () => {
  it('مدل تنظیم‌شده ۴۰۴ → مدل جایگزین', async () => {
    serve(err(404, 'models/gemini-3.8-flash is not found'), ok('گزارش'));
    await expect(run()).resolves.toBe('گزارش');
    expect(urls[1]).toContain('/models/gemini-flash-latest:');
  });
  it('۵۰۳ شلوغی → تلاش دوباره روی همان مدل', async () => {
    serve(err(503, 'The model is overloaded'), ok('گزارش'));
    await expect(run()).resolves.toBe('گزارش');
    expect(urls[0]).toBe(urls[1]);
  });
  it('کلید نامعتبر → پیام روشن، بدون تلاش بی‌فایده', async () => {
    serve(err(400, 'API key not valid. Please pass a valid API key.'));
    await expect(run()).rejects.toMatchObject({ status: 503, message: 'کلید Gemini در سرور نامعتبر است' });
    expect(urls).toHaveLength(1);
  });
  it('سهمیه → ۴۲۹', async () => {
    serve(err(429, 'quota'));
    await expect(run()).rejects.toMatchObject({ status: 429 });
  });
});

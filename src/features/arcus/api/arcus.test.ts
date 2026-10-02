/** کلاینت Arcus — fetch ساختگی؛ هیچ درخواست واقعی ارسال نمی‌شود */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetArcusClientForTests, arcusGet, ArcusError, buildArcusUrl, cooldownRemaining, parseJsonPreservingBigInts } from './client';
import { fetchHistory } from './paginate';
import { backoffDelay, subscribeFrames } from './live';
import { usToMsNumber } from './types';

const ADDR = '0x5555555555555555555555555555555555555555';

function res(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
}

beforeEach(() => __resetArcusClientForTests());
afterEach(() => vi.useRealTimers());

describe('URL و ورودی', () => {
  it('میزبان و مسیر ثابت؛ پارامتر دلخواه رد می‌شود', () => {
    expect(buildArcusUrl('testnet', '/v1/account', { address: ADDR, accountIndex: 3 })).toBe(
      `https://api.testnet.arcus.xyz/v1/account?address=${ADDR}&accountIndex=3`
    );
    expect(buildArcusUrl('mainnet', '/v1/positions', { address: ADDR })).toMatch(/^https:\/\/api\.arcus\.xyz\//);
    expect(() => buildArcusUrl('testnet', '/v1/account', { address: ADDR, url: 'http://x' } as never)).toThrow();
    expect(() => buildArcusUrl('testnet', '/v1/placeOrder' as never, { address: ADDR })).toThrow();
  });

  it('زیرحساب خارج از ۰..۹ و آدرس نامعتبر رد می‌شود', () => {
    expect(() => buildArcusUrl('testnet', '/v1/account', { address: ADDR, accountIndex: 10 })).toThrow(ArcusError);
    expect(() => buildArcusUrl('testnet', '/v1/account', { address: '0x12' })).toThrow(ArcusError);
  });

  it('زمان میلی‌ثانیه به‌جای میکروثانیه رد می‌شود', () => {
    expect(() => buildArcusUrl('testnet', '/v1/fills', { address: ADDR, from: 1_800_000_000_000 })).toThrow(/میکروثانیه/);
    expect(() => buildArcusUrl('testnet', '/v1/fills', { address: ADDR, from: '1800000000000000' })).not.toThrow();
  });
});

describe('دقت JSON', () => {
  it('اعداد صحیح بزرگ رشته می‌شوند؛ داخل رشته‌ها دست نمی‌خورند', () => {
    const v = parseJsonPreservingBigInts('{"createdAt":1800000000000123,"seq":18446744073709551615,"a":"1234567890123456789","p":"50000.5","n":12,"f":-0.25}') as Record<string, unknown>;
    expect(v.createdAt).toBe('1800000000000123');
    expect(v.seq).toBe('18446744073709551615');
    expect(v.a).toBe('1234567890123456789');
    expect(v.n).toBe(12);
    expect(v.f).toBe(-0.25);
    expect(usToMsNumber('1800000000000999')).toBe(1_800_000_000_000);
  });
});

describe('خطاها', () => {
  it('404 بدون فعالیت، 403 whitelist، 400 ورودی', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(res(404, { error: 'this account has no activity yet' }))
      .mockResolvedValueOnce(res(403, { error: 'address not on access whitelist' }))
      .mockResolvedValueOnce(res(400, { error: 'invalid address' }));
    await expect(arcusGet('testnet', '/v1/account', { address: ADDR }, { fetchImpl: f })).rejects.toMatchObject({ kind: 'no_activity' });
    await expect(arcusGet('mainnet', '/v1/account', { address: ADDR }, { fetchImpl: f })).rejects.toMatchObject({ kind: 'not_whitelisted' });
    await expect(arcusGet('testnet', '/v1/positions', { address: ADDR }, { fetchImpl: f })).rejects.toMatchObject({ kind: 'invalid_input' });
  });

  it('429: retryAfterMs رعایت می‌شود و تا پایان مهلت درخواست جدید ارسال نمی‌شود؛ محیط دیگر مستقل است', async () => {
    let now = 1_000_000;
    const f = vi.fn().mockResolvedValue(res(429, { error: 'rate limited', retryAfterMs: 850 }, { 'Retry-After': '1' }));
    await expect(arcusGet('testnet', '/v1/account', { address: ADDR }, { fetchImpl: f, now: () => now })).rejects.toMatchObject({ kind: 'rate_limited', retryAfterMs: 850 });
    expect(cooldownRemaining('testnet', now)).toBe(850);
    await expect(arcusGet('testnet', '/v1/positions', { address: ADDR }, { fetchImpl: f, now: () => now })).rejects.toMatchObject({ kind: 'rate_limited' });
    expect(f).toHaveBeenCalledTimes(1);
    expect(cooldownRemaining('mainnet', now)).toBe(0);
    now += 900;
    f.mockResolvedValueOnce(res(200, { positions: {} }));
    await expect(arcusGet('testnet', '/v1/positions', { address: ADDR }, { fetchImpl: f, now: () => now })).resolves.toEqual({ positions: {} });
  });

  it('429 بدون بدنه: هدر Retry-After (ثانیه)', async () => {
    const now = 5_000;
    const f = vi.fn().mockResolvedValue(res(429, '', { 'Retry-After': '3' }));
    await expect(arcusGet('testnet', '/v1/account', { address: ADDR }, { fetchImpl: f, now: () => now })).rejects.toMatchObject({ retryAfterMs: 3000 });
  });

  it('timeout', async () => {
    const f = vi.fn((_u: string, init?: RequestInit) => new Promise<Response>((_r, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted')))));
    await expect(arcusGet('testnet', '/v1/account', { address: ADDR }, { fetchImpl: f as unknown as typeof fetch, timeoutMs: 10 })).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('قطع شبکه', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(arcusGet('testnet', '/v1/account', { address: ADDR }, { fetchImpl: f })).rejects.toMatchObject({ kind: 'offline' });
  });

  it('درخواست‌های هم‌زمان یکسان یکی می‌شوند', async () => {
    const f = vi.fn().mockResolvedValue(res(200, { positions: {} }));
    const [a, b] = await Promise.all([
      arcusGet('testnet', '/v1/positions', { address: ADDR }, { fetchImpl: f }),
      arcusGet('testnet', '/v1/positions', { address: ADDR }, { fetchImpl: f })
    ]);
    expect(a).toEqual(b);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('درخواست بدون کوکی و بدون دنبال‌کردن ریدایرکت', async () => {
    const f = vi.fn().mockResolvedValue(res(200, { positions: {} }));
    await arcusGet('testnet', '/v1/positions', { address: ADDR }, { fetchImpl: f });
    const init = f.mock.calls[0][1] as RequestInit;
    expect(init.credentials).toBe('omit');
    expect(init.redirect).toBe('error');
    expect(init.method).toBe('GET');
  });
});

describe('صفحه‌بندی تاریخچه', () => {
  const fill = (id: number, t: string) => ({ tradeId: String(id), orderId: 'o', marketId: 1, marketDisplayName: 'TEST-USD', side: 'BUY', originalSize: '1', size: '1', price: '1', fee: '0', role: 'TAKER', createdAt: t });

  it('مرز هم‌پوشان با شناسه حذف می‌شود و رکورد هم‌زمان جا نمی‌افتد', async () => {
    const urls: string[] = [];
    const pages = [
      { fills: [fill(5, '1800000000000500'), fill(4, '1800000000000400'), fill(3, '1800000000000300')] },
      // to=300 شامل است → رکورد ۳ تکراری + رکورد ۲ با همان زمان ۳۰۰
      { fills: [fill(3, '1800000000000300'), fill(2, '1800000000000300'), fill(1, '1800000000000100')] },
      { fills: [fill(1, '1800000000000100')] }
    ];
    const f = vi.fn(async (u: string) => {
      urls.push(u);
      return res(200, pages[urls.length - 1]);
    });
    const r = await fetchHistory('fills', { env: 'testnet', address: ADDR, accountIndex: 0, limit: 3, fetchImpl: f as unknown as typeof fetch });
    expect(r.rows.map((x) => x.tradeId)).toEqual(['5', '4', '3', '2', '1']);
    expect(r.complete).toBe(true);
    expect(new URL(urls[1]).searchParams.get('to')).toBe('1800000000000300');
  });

  it('صفحهٔ پر بدون رکورد جدید → «ناقص» صریح، نه پرش زمانی', async () => {
    const same = { fills: [fill(1, '1800000000000300'), fill(2, '1800000000000300')] };
    const f = vi.fn(async () => res(200, same));
    const r = await fetchHistory('fills', { env: 'testnet', address: ADDR, accountIndex: 0, limit: 2, fetchImpl: f as unknown as typeof fetch });
    expect(r.complete).toBe(false);
    expect(r.limitation).toMatch(/زمان یکسان/);
    expect(r.rows).toHaveLength(2);
  });

  it('funding همیشه from صریح دارد (پیش‌فرض ۳۰ روزه‌ی API کنار گذاشته می‌شود)', async () => {
    const f = vi.fn(async (_u: string) => res(200, { fundingPayments: [] }));
    await fetchHistory('funding', { env: 'testnet', address: ADDR, accountIndex: 4, fetchImpl: f as unknown as typeof fetch });
    const u = new URL(f.mock.calls[0][0]);
    expect(u.searchParams.get('from')).toBe('100000000000000');
    expect(u.searchParams.get('accountIndex')).toBe('4');
  });
});

describe('WebSocket', () => {
  it('backoff نمایی با jitter و سقف ۳۰ ثانیه', () => {
    expect(backoffDelay(0, () => 0)).toBe(500);
    expect(backoffDelay(0, () => 1)).toBe(1000);
    expect(backoffDelay(10, () => 1)).toBe(30_000);
  });

  it('subscribe با آدرس و زیرحساب صحیح برای همهٔ کانال‌ها', () => {
    const frames = subscribeFrames(ADDR.toUpperCase().replace('0X', '0x'), 7).map((f) => JSON.parse(f));
    expect(frames.map((f) => f.channel)).toEqual(['account', 'positions', 'orders', 'userFills', 'funding', 'accountTransferUpdates']);
    expect(frames.every((f) => f.accountIndex === 7 && f.id === ADDR.toLowerCase() && f.type === 'subscribe')).toBe(true);
  });
});

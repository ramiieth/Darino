/**
 * فاز ۴ تست‌ها — سرویس شبکه: موفق، 500، Timeout، 429
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithRetry, fetchJson, ApiTimeoutError, NETWORK_TIMEOUT_MS } from '@/shared/lib/fetchWithRetry';
import { RateLimitError } from '@/shared/lib/throttler';

const fetchMock = vi.fn();

function resetFetch() {
  fetchMock.mockReset();
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('fetchWithRetry — موفق', () => {
  beforeEach(resetFetch);
  afterEach(() => vi.unstubAllGlobals());

  it('پاسخ 200 بدون بازتلاش Parse می‌شود', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const data = await fetchJson<{ ok: number }>('https://example.test/api');
    expect(data).toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('پاسخ JSON ساختار درست از DefiLlama Parse می‌شود', async () => {
    const body = { protocols: [{ name: 'Hyperliquid', total24h: 123 }] };
    fetchMock.mockResolvedValueOnce(jsonResponse(body));
    vi.stubGlobal('fetch', fetchMock);
    const data = await fetchJson<{ protocols: { name: string; total24h: number }[] }>(
      'https://api.llama.fi/overview/derivatives'
    );
    expect(data.protocols[0].total24h).toBe(123);
  });
});

describe('fetchWithRetry — خطاهای 5xx و بازتلاش', () => {
  beforeEach(resetFetch);
  afterEach(() => vi.unstubAllGlobals());

  it('خطای 500 → بازتلاش نمایی → موفق نهایی', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({ done: true }));
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    const p = fetchJson<{ done: boolean }>('https://example.test/api');
    // پسماند نمایی ۱s + ۲s
    await vi.advanceTimersByTimeAsync(1200);
    await vi.advanceTimersByTimeAsync(2200);
    const data = await p;
    expect(data).toEqual({ done: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('خطای 500 مداوم → پس از ۳ بازتلاش خطا پرتاب می‌شود', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    const p = fetchJson('https://example.test/api').catch((e) => e);
    await vi.advanceTimersByTimeAsync(1200);
    await vi.advanceTimersByTimeAsync(2200);
    await vi.advanceTimersByTimeAsync(4200);
    const err = (await p) as Error;
    expect(err.message).toContain('HTTP 500');
    expect(fetchMock).toHaveBeenCalledTimes(4); // ۱ اولیه + ۳ بازتلاش
    vi.useRealTimers();
  });

  it('خطای 404 → بدون بازتلاش (فقط ۱ درخواست)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchJson('https://example.test/api')).rejects.toThrow('HTTP 404');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('Timeout → خطای ApiTimeoutError و بازتلاش', async () => {
    // شبیه‌سازی timeout: fetch با AbortError رد می‌شود
    fetchMock.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    fetchMock.mockResolvedValueOnce(jsonResponse({ t: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    const p = fetchJson<{ t: number }>('https://example.test/api', { timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(60);
    await vi.advanceTimersByTimeAsync(1100);
    const data = await p;
    expect(data).toEqual({ t: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe('fetchWithRetry — 429 بدون بازتلاش', () => {
  beforeEach(resetFetch);
  afterEach(() => vi.unstubAllGlobals());

  it('429 → RateLimitError فوری (بدون بازتلاش)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 429));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchJson('https://example.test/api')).rejects.toBeInstanceOf(RateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

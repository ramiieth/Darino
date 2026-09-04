/**
 * درخواست شبکه مقاوم (فاز ۳ مدیریت خطا):
 *  - Timeout: حداکثر ۸ ثانیه برای همه درخواست‌ها
 *  - بازتلاش هوشمند (Exponential Backoff): تا ۳ بار برای خطاهای شبکه/5xx
 *  - 429 → RateLimitError (بدون بازتلاش؛ استفاده از کش + هشدار کم‌رنگ)
 */
import { RateLimitError } from '@/shared/lib/throttler';

export const NETWORK_TIMEOUT_MS = 8_000;
export const MAX_RETRIES = 3;

export class ApiTimeoutError extends Error {
  constructor() {
    super('Request timed out');
    this.name = 'ApiTimeoutError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

export interface FetchWithRetryOptions {
  retries?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
}

/** درخواست fetch با timeout و بازتلاش نمایی */
export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const { retries = MAX_RETRIES, timeoutMs = NETWORK_TIMEOUT_MS, headers } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        method: options.method ?? 'GET',
        body: options.body,
        headers: headers ?? { accept: 'application/json' }
      });
      clearTimeout(timer);

      // 429: بدون بازتلاش — مصرف‌کننده از کش استفاده می‌کند
      if (res.status === 429) {
        throw new RateLimitError('Rate limited (429)');
      }
      // 5xx / 408: بازتلاش با پسماند نمایی
      if (res.status >= 500 || res.status === 408) {
        lastError = new Error(`HTTP ${res.status}`);
        if (attempt < retries) {
          await sleep(1_000 * 2 ** attempt);
          continue;
        }
        throw lastError;
      }
      return res;
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof RateLimitError) throw e;
      if (isAbort(e)) {
        lastError = new ApiTimeoutError();
      } else {
        lastError = e;
      }
      if (attempt < retries) {
        await sleep(1_000 * 2 ** attempt);
        continue;
      }
      throw lastError;
    }
  }
  throw lastError;
}

/** دریافت JSON امن با fetchWithRetry */
export async function fetchJson<T>(url: string, options?: FetchWithRetryOptions): Promise<T> {
  const res = await fetchWithRetry(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

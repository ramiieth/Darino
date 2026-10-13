import { HttpError, fetchJson } from '@/repositories/remoteClient';
import type { DkProduct, DkSearchResult, DkSort } from '../domain/types';

// Session-lifetime memo: re-opening a product, the compare sheet or a previous
// search is instant. The server keeps its own 10–15 minute cache upstream.
const TTL = 10 * 60_000;
const memo = new Map<string, { at: number; p: Promise<unknown> }>();

function remember<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.p as Promise<T>;
  const p = load();
  memo.set(key, { at: Date.now(), p });
  p.catch(() => memo.delete(key));
  if (memo.size > 200) memo.delete(memo.keys().next().value as string);
  return p;
}

export function searchProducts(q: string, sort: DkSort, page = 1): Promise<DkSearchResult> {
  return remember(`s:${q}:${sort}:${page}`, () =>
    fetchJson<DkSearchResult>(`/api/integrations?op=dk-search&q=${encodeURIComponent(q)}&sort=${sort}&page=${page}`, { timeoutMs: 45000 })
  );
}

export function getProduct(id: number): Promise<DkProduct> {
  return remember(`p:${id}`, () => fetchJson<DkProduct>(`/api/integrations?op=dk-product&id=${id}`, { timeoutMs: 45000 }));
}

// The server allows 30 product reads a minute per account; prefetch spends at most 6 of them.
const prefetched: number[] = [];

/** Warm the detail cache when the pointer rests on a card (desktop) — failures are ignored. */
export function prefetchProduct(id: number): void {
  const hit = memo.get(`p:${id}`);
  if (hit && Date.now() - hit.at < TTL) return;
  const now = Date.now();
  while (prefetched.length && now - prefetched[0] > 60_000) prefetched.shift();
  if (prefetched.length >= 6) return;
  prefetched.push(now);
  getProduct(id).catch(() => undefined);
}

/** پیام خطای قابل‌نمایش به کاربر */
export function errorText(e: unknown): string {
  if (e instanceof HttpError) {
    if (e.status === 401) return 'برای استفاده از این بخش وارد حساب شوید';
    if (e.status === 429) return e.code ?? 'درخواست‌ها زیاد شد؛ یک دقیقه بعد تلاش کنید';
    return e.code ?? 'دیجی‌کالا پاسخ نداد';
  }
  if (e instanceof DOMException && e.name === 'AbortError') return 'پاسخ دیجی‌کالا طول کشید؛ دوباره تلاش کنید';
  return 'ارتباط با سرور برقرار نشد';
}

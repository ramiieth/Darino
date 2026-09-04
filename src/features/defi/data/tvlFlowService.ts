/**
 * TVL Flow — سرویس DefiLlama (فقط API رسمی)
 *  - /v2/chains : لیست همه زنجیره‌ها + TVL فعلی (یک درخواست)
 *  - /v2/historicalChainTvl/{chain} : سری تاریخی هر زنجیره (کش ۲۴ ساعت)
 *  - /protocols : همه پروتکل‌ها + TVL و تغییر ۱/۷ روز (کش ۱ ساعت)
 * کش IndexedDB + بازتلاش + اجرای محدود همزمان (Rate Limit Handling)
 */
import { fetchJson } from '@/shared/lib/fetchWithRetry';
import { cacheBulkGetPrice, cachePutPrice } from '@/shared/lib/db';
import { mapLimit } from '@/features/cryptomarkets/data/useTopPerformers';
import type { TvlPoint } from '@/features/defi/domain/tvlFlow';

const LLAMA = 'https://api.llama.fi';

export interface ChainTvlRow {
  name: string;
  tvl: number;
}

/** لیست همه زنجیره‌ها + TVL (کش ۵ دقیقه) */
export async function fetchAllChains(): Promise<ChainTvlRow[]> {
  const ck = 'tvl:chains';
  try {
    const rec = await cacheBulkGetPrice([ck]);
    const r = rec.get(ck);
    if (r && Date.now() - r.fetchedAt < 5 * 60_000) {
      return r.price as unknown as ChainTvlRow[];
    }
  } catch { /* ادامه */ }
  const data = await fetchJson<
    { name: string; tvl: number }[]
  >(`${LLAMA}/v2/chains`, { retries: 1, timeoutMs: 15_000 });
  const out = data.map((c) => ({ name: c.name, tvl: c.tvl ?? 0 }));
  try {
    await cachePutPrice(ck, { price: out as unknown as number, source: 'live', fetchedAt: Date.now() });
  } catch { /* خاموش */ }
  return out;
}

/** سری تاریخی یک زنجیره (کش ۲۴ ساعت) */
export async function fetchChainHistory(name: string): Promise<TvlPoint[] | null> {
  const ck = `tvl:hist:${name}`;
  try {
    const rec = await cacheBulkGetPrice([ck]);
    const r = rec.get(ck);
    if (r && Date.now() - r.fetchedAt < 24 * 60 * 60 * 1000) {
      return r.price as unknown as TvlPoint[];
    }
  } catch { /* ادامه */ }
  try {
    const data = await fetchJson<{ date: number; tvl: number }[]>(
      `${LLAMA}/v2/historicalChainTvl/${encodeURIComponent(name)}`,
      { retries: 1, timeoutMs: 15_000 }
    );
    const pts = data.map((p) => ({ date: p.date, tvl: p.tvl }));
    if (pts.length > 0) {
      try {
        await cachePutPrice(ck, { price: pts as unknown as number, source: 'snapshot', fetchedAt: Date.now() });
      } catch { /* خاموش */ }
    }
    return pts;
  } catch {
    return null;
  }
}

/** پروتکل فشرده برای کش سبک */
export interface ProtocolCompact {
  n: string; // نام
  s: string; // slug
  t: number; // tvl
  c1: number | null; // change_1d
  c7: number | null; // change_7d
  cat: string; // دسته
  ch: string; // زنجیره اصلی
  lg: string; // لوگو
}

/** همه پروتکل‌ها (کش ۱ ساعت — فشرده برای کاهش حجم) */
export async function fetchAllProtocols(): Promise<ProtocolCompact[]> {
  const ck = 'tvl:protocols';
  try {
    const rec = await cacheBulkGetPrice([ck]);
    const r = rec.get(ck);
    if (r && Date.now() - r.fetchedAt < 60 * 60 * 1000) {
      return r.price as unknown as ProtocolCompact[];
    }
  } catch { /* ادامه */ }
  const data = await fetchJson<
    {
      name: string;
      slug: string;
      tvl?: number;
      change_1d?: number | null;
      change_7d?: number | null;
      category?: string;
      chain?: string;
      logo?: string;
    }[]
  >(`${LLAMA}/protocols`, { retries: 1, timeoutMs: 25_000 });
  const out: ProtocolCompact[] = data.map((p) => ({
    n: p.name,
    s: p.slug,
    t: p.tvl ?? 0,
    c1: p.change_1d ?? null,
    c7: p.change_7d ?? null,
    cat: p.category ?? '',
    ch: p.chain ?? '',
    lg: p.logo ?? ''
  }));
  try {
    await cachePutPrice(ck, { price: out as unknown as number, source: 'live', fetchedAt: Date.now() });
  } catch { /* خاموش */ }
  return out;
}

/**
 * همگام‌سازی تاریخچه زنجیره‌ها در پس‌زمینه (پیش‌رونده):
 *  - اولویت با زنجیره‌های بزرگ‌تر (TVL نزولی)
 *  - حداکثر `limit` درخواست همزمان + سقف نشست `sessionCap`
 *  - از کش استفاده می‌کند؛ فقط زنجیره‌های بدون کش درخواست می‌شوند
 */
export async function syncChainHistories(
  chains: ChainTvlRow[],
  opts: { limit?: number; sessionCap?: number; onProgress?: (done: number, total: number) => void } = {}
): Promise<Record<string, TvlPoint[]>> {
  const { limit = 4, sessionCap = 80, onProgress } = opts;
  const sorted = [...chains].sort((a, b) => b.tvl - a.tvl);
  const candidates = sorted.filter((c) => c.tvl > 0).slice(0, sessionCap);
  const found: Record<string, TvlPoint[]> = {};
  let done = 0;
  await mapLimit(candidates, limit, async (c) => {
    const pts = await fetchChainHistory(c.name);
    if (pts) found[c.name] = pts;
    done += 1;
    if (onProgress && done % 5 === 0) onProgress(done, candidates.length);
  });
  onProgress?.(candidates.length, candidates.length);
  return found;
}

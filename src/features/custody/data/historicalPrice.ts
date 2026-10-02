/** ============================================================
 * قیمت تاریخی برای ارزش‌گذاری عملیات (سند دفتر کل)
 *  • از زیرساخت موجود اپ (CoinGecko market_chart/range از طریق پروکسی) — نزدیک‌ترین نقطه به زمان عملیات.
 *  • همیشه همراه منبع و زمان نقطهٔ قیمت؛ اگر داده نبود → null (هیچ قیمتی حدس زده نمی‌شود).
 *  • کاربر می‌تواند مقدار را دستی اصلاح کند.
 * ============================================================ */
import { fetchCryptoHistory } from '@/features/calculators/data/historical';

export interface HistoricalPrice {
  usd: number;
  /** زمان نقطهٔ قیمت (ms) */
  at: number;
  source: string;
}

const WINDOW_MS = 3 * 3600_000;

export async function priceAt(coingeckoId: string, atMs: number): Promise<HistoricalPrice | null> {
  const points = await fetchCryptoHistory(coingeckoId, atMs - WINDOW_MS, atMs + WINDOW_MS);
  if (!points || points.length === 0) return null;
  let best = points[0];
  for (const p of points) if (Math.abs(p.t - atMs) < Math.abs(best.t - atMs)) best = p;
  // نقطه‌ای دورتر از پنجره قابل‌اعتماد نیست
  if (Math.abs(best.t - atMs) > WINDOW_MS) return null;
  return { usd: best.price, at: best.t, source: 'کوین‌گکو — قیمت تاریخی' };
}

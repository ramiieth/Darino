/** ============================================================
 * GET /api/usdt?source=wallex|bitpin — نرخ زنده تتر به تومان
 *
 * والکس فقط به origin خودش CORS می‌دهد → مرورگر باید از این مسیر بخواند.
 * بیت‌پین CORS آزاد دارد و مرورگر مستقیم می‌خواند؛ این مسیر فقط فالبک است.
 * بدون دیتابیس و بدون حالت. کش کوتاه CDN (۱۵ ثانیه).
 * ============================================================ */
import type { ServerResponse, IncomingMessage } from 'node:http';
import { json } from './_neon.js';
import { fetchUsdtDirect, type UsdtSource } from '../src/shared/fx/usdtRate.js';
import { fetchDailyRatesDirect } from '../src/shared/fx/usdtHistory.js';

const MAX_HISTORY_MS = 5 * 366 * 86_400_000;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    json(res, 405, { ok: false, error: 'method not allowed' });
    return;
  }
  const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
  const source: UsdtSource = params.get('source') === 'bitpin' ? 'bitpin' : 'wallex';

  /* ---------- تاریخچه روزانه: ?history=1&from=ms&to=ms ---------- */
  if (params.get('history') === '1') {
    const to = Math.min(Number(params.get('to')) || Date.now(), Date.now());
    const from = Math.max(Number(params.get('from')) || to - 400 * 86_400_000, to - MAX_HISTORY_MS);
    try {
      const rates = await fetchDailyRatesDirect(source, from, to, undefined, 15_000);
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
      json(res, 200, { ok: true, source, rates });
    } catch (e) {
      json(res, 200, { ok: false, source, error: e instanceof Error ? e.message.slice(0, 120) : 'unavailable' });
    }
    return;
  }

  try {
    const quote = await fetchUsdtDirect(source, undefined, 8000);
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    json(res, 200, { ok: true, ...quote });
  } catch (e) {
    json(res, 200, { ok: false, source, error: e instanceof Error ? e.message.slice(0, 120) : 'unavailable' });
  }
}

/** ============================================================
 * /api/cg — پروکسی سرور-سمت CoinGecko برای Production (Vercel)
 *
 * Client (PROD):  /api/cg/coins/markets?...   →  api.coingecko.com/api/v3/coins/markets?...
 *
 * کلید فقط سرور-سمت: process.env.COINGECKO_API_KEY یا fallback کلید داخلی
 * (در Vite dev این مسیر وجود ندارد — آنجا /coingecko-api پروکسی می‌شود).
 * ⚠️ کلید هرگز به Client نمی‌رسد.
 * ============================================================ */
import type { ServerResponse, IncomingMessage } from 'node:http';
import { resolveProxyTarget } from './_proxyPath.js';

const UPSTREAM = 'https://api.coingecko.com';
const PREFIX = '/api/cg';
/** fallback کلید demo — سرور-سمت (مانند vite.config.ts)؛ با env جایگزین می‌شود */
const FALLBACK_KEY = process.env.COINGECKO_API_KEY ?? 'CG-1fJVsdhGGY6Jrb5DTZazvScK';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    // ۱) مسیر بعد از prefix → upstream (مثلاً /coins/markets)
    //    روی Vercel زیرمسیر از طریق `__p` می‌رسد (rewrite با destination ثابت)
    const { path, search } = resolveProxyTarget(req.url, PREFIX);

    const upstream = new URL(`${UPSTREAM}/api/v3${path}`);
    // کپی query + تزریق کلید (سرور-سمت)
    search.forEach((v: string, k: string) => upstream.searchParams.set(k, v));
    if (!upstream.searchParams.has('x_cg_demo_api_key')) {
      upstream.searchParams.set('x_cg_demo_api_key', FALLBACK_KEY);
    }

    const upstreamRes = await fetch(upstream.toString(), {
      headers: { accept: 'application/json' }
    });
    const body = await upstreamRes.text();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.statusCode = upstreamRes.status;
    res.end(body);
  } catch (e) {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 502;
    res.end(JSON.stringify({ error: 'upstream_error', message: e instanceof Error ? e.message.slice(0, 120) : 'error' }));
  }
}

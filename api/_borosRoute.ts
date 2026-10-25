/** ============================================================
 * /api/boros — پروکسی سرور-سمت Boros برای Production (Vercel)
 *
 * Client (PROD): /api/boros/...  →  api-boros.pendle.finance/apis/v1/...
 * Dev (Vite):    /boros-api/...  (پروکسی vite.config.ts)
 * ============================================================ */
import type { ServerResponse, IncomingMessage } from 'node:http';
import { resolveProxyTarget } from './_proxyPath.js';

const UPSTREAM = 'https://api-boros.pendle.finance';
const PREFIX = '/api/boros';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const { path, search } = resolveProxyTarget(req.url, PREFIX);

    if ((req.method ?? 'GET') !== 'GET') {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET');
      res.end(JSON.stringify({ error: 'method_not_allowed' }));
      return;
    }
    if (!['/markets', '/markets/ohlcv', '/assets', '/indicators'].includes(path)) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'unsupported_readonly_endpoint' }));
      return;
    }
    const upstream = new URL(`${UPSTREAM}/apis/v1${path}`);
    search.forEach((v: string, k: string) => upstream.searchParams.set(k, v));

    const upstreamRes = await fetch(upstream.toString(), {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(20000)
    });
    const body = await upstreamRes.text();
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = upstreamRes.status;
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(body);
  } catch (e) {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 502;
    res.end(JSON.stringify({ error: 'upstream_error', message: e instanceof Error ? e.message.slice(0, 120) : 'error' }));
  }
}

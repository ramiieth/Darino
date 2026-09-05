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

    const upstream = new URL(`${UPSTREAM}/apis/v1${path}`);
    search.forEach((v: string, k: string) => upstream.searchParams.set(k, v));

    const upstreamRes = await fetch(upstream.toString(), {
      headers: { accept: 'application/json' }
    });
    const body = await upstreamRes.text();
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = upstreamRes.status;
    res.end(body);
  } catch (e) {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 502;
    res.end(JSON.stringify({ error: 'upstream_error', message: e instanceof Error ? e.message.slice(0, 120) : 'error' }));
  }
}

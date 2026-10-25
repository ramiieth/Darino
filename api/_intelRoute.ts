/** ============================================================
 * /api/intel — امنیت توکن و میم‌کوین‌های داغ (عمومی، فقط‌خواندنی، بدون کلید)
 *
 *  GET /api/intel?op=token&chain=solana&address=…  ← GoPlus + RugCheck + DexScreener → حکم (کش ۳۰ دقیقه)
 *  GET /api/intel?op=memes&list=trending|new        ← استخرهای ترند/تازهٔ سولانا از GeckoTerminal
 *       + حکم سریع RugCheck برای هر توکن (کش ۳ دقیقه)
 *
 * منبعی که خطا بدهد فقط از حکم کنار می‌رود (sources نشان می‌دهد کدام‌ها پاسخ داده‌اند).
 * ============================================================ */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { json } from './_neon.js';
import { providerCacheKey, readProviderCache, writeProviderCache } from './_providerCache.js';
import { pool } from './_hyperliquid.js';
import { assessToken, EVM_CHAIN_ID, isTokenAddress, listVerdict, type Chain, type TokenSafety } from '../src/features/intel/domain/tokenSafety.js';
import { parsePools, type MemeToken } from '../src/features/intel/domain/memes.js';

const CHAINS: Chain[] = ['solana', 'ethereum', 'base', 'bsc', 'arbitrum'];
const TOKEN_MS = 30 * 60_000;
const MEMES_MS = 3 * 60_000;

export type MemeRow = MemeToken & { safety: ReturnType<typeof listVerdict> };
export interface MemesPayload { fetchedAt: number; list: 'trending' | 'new'; tokens: MemeRow[] }

type Raw = Record<string, unknown>;

async function getJson(url: string, timeoutMs = 10_000): Promise<Raw | null> {
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    return body && typeof body === 'object' ? (body as Raw) : null;
  } catch {
    return null;
  }
}

async function goplus(chain: Chain, address: string): Promise<Raw | null> {
  const url = chain === 'solana'
    ? `https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=${address}`
    : `https://api.gopluslabs.io/api/v1/token_security/${EVM_CHAIN_ID[chain]}?contract_addresses=${address}`;
  const body = await getJson(url);
  const result = (body?.result ?? {}) as Record<string, Raw>;
  return result[address] ?? result[address.toLowerCase()] ?? null;
}

const rugSummary = (address: string, timeoutMs = 10_000) => getJson(`https://api.rugcheck.xyz/v1/tokens/${address}/report/summary`, timeoutMs);

async function loadToken(chain: Chain, address: string): Promise<TokenSafety> {
  const [g, rug, dex] = await Promise.all([
    goplus(chain, address),
    chain === 'solana' ? rugSummary(address) : Promise.resolve(null),
    getJson(`https://api.dexscreener.com/latest/dex/tokens/${address}`)
  ]);
  const pairs = (Array.isArray(dex?.pairs) ? (dex!.pairs as Raw[]) : []).filter((p) => p.chainId === chain);
  return assessToken({ chain, address, goplus: g, rug, pairs });
}

async function loadMemes(list: 'trending' | 'new'): Promise<MemesPayload> {
  const path = list === 'new' ? 'new_pools' : 'trending_pools';
  const body = await getJson(`https://api.geckoterminal.com/api/v2/networks/solana/${path}?include=base_token&page=1`, 15_000);
  if (!body) throw new Error('geckoterminal unavailable');
  const tokens = parsePools(body).slice(0, 20);
  const rugs = await pool(tokens, 4, (t) => rugSummary(t.address, 6_000));
  return { fetchedAt: Date.now(), list, tokens: tokens.map((t, i) => ({ ...t, safety: listVerdict(rugs[i], t) })) };
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if ((req.method ?? 'GET') !== 'GET') {
    json(res, 405, { error: 'method_not_allowed' });
    return;
  }
  const params = new URL(req.url ?? '/', 'http://internal').searchParams;
  const op = params.get('op');
  try {
    if (op === 'token') {
      const chain = params.get('chain') as Chain;
      const raw = (params.get('address') ?? '').trim();
      if (!CHAINS.includes(chain) || !isTokenAddress(chain, raw)) {
        json(res, 400, { error: 'آدرس یا شبکه معتبر نیست' });
        return;
      }
      const address = chain === 'solana' ? raw : raw.toLowerCase();
      const key = providerCacheKey(`token-v1:${chain}:${address}`);
      let payload = await readProviderCache<TokenSafety>(key);
      if (!payload) {
        payload = await loadToken(chain, address);
        if (payload.sources.length) await writeProviderCache(key, payload, TOKEN_MS);
      }
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=1800');
      json(res, 200, payload);
      return;
    }
    if (op === 'memes') {
      const list = params.get('list') === 'new' ? 'new' : 'trending';
      const key = providerCacheKey(`memes-v1:${list}`);
      let payload = await readProviderCache<MemesPayload>(key);
      if (!payload) {
        payload = await loadMemes(list);
        await writeProviderCache(key, payload, MEMES_MS);
      }
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=180');
      json(res, 200, payload);
      return;
    }
    json(res, 404, { error: 'unknown_op' });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    json(res, 502, { error: 'منبع داده در دسترس نیست', detail: e instanceof Error ? e.message.slice(0, 120) : 'error' });
  }
}

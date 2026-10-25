/**
 * میم‌کوین‌های داغ سولانا — از استخرهای ترند GeckoTerminal (فعالیت واقعی، نه تبلیغ پولی)
 * Pure: پاسخ JSON:API خام → فهرست توکن‌ها (یک ردیف برای هر توکن، استیبل و SOL کنار می‌روند).
 */

export interface MemeToken {
  address: string;
  symbol: string;
  name: string;
  image: string | null;
  poolAddress: string;
  /** شناسهٔ DEX در GeckoTerminal؛ «pump-fun» یعنی هنوز روی بوندینگ‌کرو */
  dex: string | null;
  priceUsd: number | null;
  marketCap: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  volume1h: number | null;
  change1h: number | null;
  change24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  buyers24h: number | null;
  sellers24h: number | null;
  createdAt: number | null;
}

type Raw = Record<string, unknown>;
const n = (v: unknown) => {
  const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(x) ? x : null;
};
const SKIP = new Set(['So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB']);

export function parsePools(raw: unknown): MemeToken[] {
  const body = (raw ?? {}) as { data?: Raw[]; included?: Raw[] };
  const tokens = new Map<string, Raw>();
  for (const inc of body.included ?? []) if (inc?.type === 'token' && typeof inc.id === 'string') tokens.set(inc.id, (inc.attributes ?? {}) as Raw);
  const out: MemeToken[] = [];
  for (const pool of body.data ?? []) {
    const a = (pool?.attributes ?? {}) as Raw;
    const baseId = ((pool?.relationships as Raw | undefined)?.base_token as Raw | undefined)?.data as Raw | undefined;
    const dexRef = ((pool?.relationships as Raw | undefined)?.dex as Raw | undefined)?.data as Raw | undefined;
    const t = tokens.get(String(baseId?.id ?? ''));
    const address = typeof t?.address === 'string' ? t.address : '';
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address) || SKIP.has(address) || out.some((m) => m.address === address)) continue;
    const tx = ((a.transactions as Raw | undefined)?.h24 ?? {}) as Raw;
    const vol = (a.volume_usd ?? {}) as Raw;
    const ch = (a.price_change_percentage ?? {}) as Raw;
    const image = typeof t?.image_url === 'string' && t.image_url.startsWith('https://') && !t.image_url.includes('missing') ? t.image_url : null;
    out.push({
      address,
      symbol: String(t?.symbol ?? '').slice(0, 20),
      name: String(t?.name ?? '').slice(0, 60),
      image,
      poolAddress: String(a.address ?? ''),
      dex: typeof dexRef?.id === 'string' ? dexRef.id : null,
      priceUsd: n(a.base_token_price_usd),
      marketCap: n(a.market_cap_usd) ?? n(a.fdv_usd),
      liquidityUsd: n(a.reserve_in_usd),
      volume24h: n(vol.h24),
      volume1h: n(vol.h1),
      change1h: n(ch.h1),
      change24h: n(ch.h24),
      buys24h: n(tx.buys),
      sells24h: n(tx.sells),
      buyers24h: n(tx.buyers),
      sellers24h: n(tx.sellers),
      createdAt: typeof a.pool_created_at === 'string' ? Date.parse(a.pool_created_at) || null : null
    });
  }
  return out;
}

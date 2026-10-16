/** Fixed public GET destinations. No SDK, signing, cookies or upstream credentials. */
import { ProviderError } from './_zerion.js';
const MAINNET='https://mainnet.zklighter.elliot.ai';
const LIGHTER = 'https://api.rh.lighter.xyz';
const ONDO = 'https://api.ondoperps.xyz';
async function read(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { method: 'GET', headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new ProviderError(response.status === 429 ? 429 : 502, 'دریافت اطلاعات پلتفرم انجام نشد');
  const raw: unknown = await response.json();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ProviderError(502, 'پاسخ پلتفرم معتبر نیست');
  const data = raw as Record<string, unknown>;
  if (!data || typeof data !== 'object' || Array.isArray(data) || (data.code !== undefined && data.code !== 200 && data.code !== 0) || data.success === false) throw new ProviderError(502, 'پاسخ پلتفرم معتبر نیست');
  return data;
}
type Row = Record<string, unknown>;
const asRow = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const fin = (v: unknown): number | null => {
  if ((typeof v !== 'number' && typeof v !== 'string') || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
export interface OndoPublicMarket {
  market: string; base: string; name: string; tags: string[];
  /** کسری (0.00025 = ۰٫۰۲۵٪) */
  makerFee: number | null; takerFee: number | null;
  maxLeverage: number | null; maintenanceMarginRate: number | null; markPrice: number | null;
}
/** Only the public fields the calculators need — the raw payload is ~240KB. */
export function trimOndoMarkets(markets: unknown, prices: unknown): OndoPublicMarket[] {
  const marks = asRow(asRow(prices).result);
  const pairs = asRow(asRow(asRow(markets).result).perps).tradingPairs;
  return (Array.isArray(pairs) ? pairs : []).map(asRow).flatMap((m) => {
    const market = typeof m.market === 'string' ? m.market : '';
    const base = String(asRow(m.pair).base ?? '');
    if (!/^[A-Z0-9]{1,20}-USD\.P$/.test(market) || !/^[A-Z0-9]{1,20}$/.test(base)) return [];
    const tier = asRow(Array.isArray(m.marginInfo) ? m.marginInfo[0] : null);
    return [{
      market, base, name: String(m.longName ?? base).slice(0, 80),
      tags: (Array.isArray(m.tags) ? m.tags : []).filter((t): t is string => typeof t === 'string').slice(0, 5),
      makerFee: fin(m.makerFee), takerFee: fin(m.takerFee),
      maxLeverage: fin(tier.maxLeverage), maintenanceMarginRate: fin(tier.maintenanceMarginRate),
      markPrice: fin(asRow(marks[market]).markPrice)
    }];
  });
}
let ondoPublic: { at: number; data: { markets: OndoPublicMarket[]; fetchedAt: number } } | null = null;
/** Public market config for unauthenticated calculators; one upstream pair per minute per instance. */
export async function getOndoPublicMarkets(): Promise<{ markets: OndoPublicMarket[]; fetchedAt: number }> {
  if (ondoPublic && Date.now() - ondoPublic.at < 60_000) return ondoPublic.data;
  const [markets, prices] = await Promise.all([read(`${ONDO}/v1/markets`), read(`${ONDO}/v1/perps/mark_prices`)]);
  const data = { markets: trimOndoMarkets(markets, prices), fetchedAt: Date.now() };
  if (!data.markets.length) throw new ProviderError(502, 'پاسخ پلتفرم معتبر نیست');
  ondoPublic = { at: data.fetchedAt, data };
  return data;
}
export async function getPerpsRead(op: string, address: string): Promise<unknown> {
  if (op === 'lighter-mainnet-markets'||op === 'lighter-markets') {
    const host=op==='lighter-mainnet-markets'?MAINNET:LIGHTER;
    const [books,metadata]=await Promise.all([read(`${host}/api/v1/orderBookDetails`),read(`${host}/api/v1/tokenlist`).catch(()=>null)]);
    return {...books,...(Array.isArray(metadata?.tokens)?{tokens:metadata.tokens}:{})};
  }
  if (op === 'ondo-markets') {
    const [markets, prices] = await Promise.all([read(`${ONDO}/v1/markets`), read(`${ONDO}/v1/perps/mark_prices`)]);
    return { markets, prices };
  }
  if (!['lighter-account','lighter-mainnet-account'].includes(op)) throw new ProviderError(400, 'درخواست ناشناخته');
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new ProviderError(400, 'آدرس عمومی EVM معتبر وارد کنید');
  const host=op==='lighter-mainnet-account'?MAINNET:LIGHTER;
  const accounts: unknown[] = []; const cursors = new Set<string>(); let cursor = '';
  // Bounded pagination: never silently present a partial equity total.
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({ by: 'l1_address', value: address, active_only: 'true' });
    if (cursor) query.set('cursor', cursor);
    const data = await read(`${host}/api/v1/account?${query}`);
    if (!Array.isArray(data.accounts)) throw new ProviderError(502, 'پاسخ حساب معتبر نیست');
    accounts.push(...data.accounts);
    if (!data.next_cursor) return { accounts, fetchedAt: Date.now() };
    cursor = String(data.next_cursor);
    if (cursors.has(cursor) || cursor.length > 2048) break;
    cursors.add(cursor);
  }
  throw new ProviderError(502, 'فهرست حساب‌ها کامل دریافت نشد');
}

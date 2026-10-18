/**
 * Derive (derive.xyz) — public options market data, read-only, no keys.
 * REST: POST https://api.derive.xyz/v3/public/<method>  (the browser can't call it: no CORS for our origin)
 *   get_all_currencies                       which currencies list options, spot price
 *   get_all_instruments {instrument_type:'option', currency, expired:false}   expiries, strikes, fees, min size
 *   get_tickers {instrument_type:'option', currency, expiry_date:'YYYYMMDD'}  bid/ask, mark, IV, Greeks, OI
 *   get_tickers {instrument_type:'perp', currency}                            perp mark + hourly funding
 *   get_index_chart_data {currency, period:86400, start_timestamp, end_timestamp}  daily index candles (HV)
 * Responses are trimmed to the fields the calculator uses and cached briefly.
 */
import { ProviderError } from './_zerion.js';

const BASE = 'https://api.derive.xyz/v3/public';
const CURRENCY_RE = /^[A-Z0-9]{2,10}$/;
const EXPIRY_RE = /^\d{8}$/;

type Row = Record<string, unknown>;
const row = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const fin = (v: unknown): number | null => {
  if ((typeof v !== 'number' && typeof v !== 'string') || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function call(method: string, params: Row, timeoutMs = 15_000): Promise<unknown> {
  const r = await fetch(`${BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(params),
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!r.ok) throw new ProviderError(r.status === 429 ? 429 : 502, 'دریافت دادهٔ Derive انجام نشد');
  const body = row(await r.json());
  if (body.error) throw new ProviderError(502, 'پاسخ Derive معتبر نیست');
  return body.result;
}

const cache = new Map<string, { at: number; data: unknown }>();
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data as T;
  const data = await load();
  if (cache.size > 300) cache.clear();
  cache.set(key, { at: Date.now(), data });
  return data;
}

/* ---------------- trimming (pure, tested) ---------------- */

export interface DeriveMarket {
  currency: string;
  spot: number | null;
  spot24h: number | null;
  /** option open interest in base units, across risk universes */
  optionOi: number;
}

export function trimCurrencies(result: unknown): DeriveMarket[] {
  return (Array.isArray(result) ? result : []).map(row).flatMap((c) => {
    const currency = typeof c.currency === 'string' ? c.currency : '';
    const option = row(c.option);
    if (!CURRENCY_RE.test(currency) || !option.name) return [];
    const universes = Array.isArray(option.universes) ? option.universes.map(row) : [];
    const optionOi = universes.reduce((s, u) => s + (fin(row(u.oi).current_open_interest) ?? 0), 0);
    return [{ currency, spot: fin(c.spot_price), spot24h: fin(c.spot_price_24h), optionOi }];
  });
}

export interface DeriveInstrumentMeta {
  expiries: string[];
  minAmount: number | null;
  amountStep: number | null;
  makerFeeRate: number | null;
  takerFeeRate: number | null;
  baseFee: number | null;
  /** cap on the per-contract fee as a fraction of option price */
  feeCapRate: number | null;
}

const ymd = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10).replace(/-/g, '');

export function trimInstruments(result: unknown, nowSec: number): DeriveInstrumentMeta {
  const list = (Array.isArray(row(result).instruments) ? (row(result).instruments as unknown[]) : []).map(row);
  const live = list.filter((i) => i.is_active === true && (fin(row(i.option_details).expiry) ?? 0) > nowSec);
  const expiries = [...new Set(live.map((i) => ymd(fin(row(i.option_details).expiry)!)))].sort();
  const first = live[0] ?? {};
  return {
    expiries,
    minAmount: fin(first.minimum_amount),
    amountStep: fin(first.amount_step),
    makerFeeRate: fin(first.maker_fee_rate),
    takerFeeRate: fin(first.taker_fee_rate),
    baseFee: fin(first.base_fee),
    feeCapRate: fin(first.mark_price_fee_rate_cap)
  };
}

export interface DeriveOption {
  name: string;
  strike: number;
  type: 'C' | 'P';
  bid: number | null;
  ask: number | null;
  bidSize: number | null;
  askSize: number | null;
  mark: number | null;
  iv: number | null;
  bidIv: number | null;
  askIv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  oi: number | null;
  volume: number | null;
}

const NAME_RE = /^([A-Z0-9]{2,10})-(\d{8})-(\d+(?:\.\d+)?)-([CP])$/;

export function trimTickers(result: unknown): { options: DeriveOption[]; index: number | null; forward: number | null } {
  const tickers = row(row(result).tickers);
  let index: number | null = null;
  let forward: number | null = null;
  const options = Object.entries(tickers).flatMap(([name, raw]): DeriveOption[] => {
    const m = NAME_RE.exec(name);
    if (!m) return [];
    const t = row(raw);
    const p = row(t.option_pricing);
    const st = row(t.stats);
    index ??= fin(t.I);
    forward ??= fin(p.f);
    const pos = (v: unknown) => {
      const n = fin(v);
      return n !== null && n > 0 ? n : null;
    };
    return [
      {
        name,
        strike: Number(m[3]),
        type: m[4] as 'C' | 'P',
        bid: pos(t.b),
        ask: pos(t.a),
        bidSize: pos(t.B),
        askSize: pos(t.A),
        mark: fin(t.M) ?? fin(p.m),
        iv: fin(p.i),
        bidIv: pos(p.bi),
        askIv: pos(p.ai),
        delta: fin(p.d),
        gamma: fin(p.g),
        theta: fin(p.t),
        vega: fin(p.v),
        oi: fin(st.oi),
        volume: fin(st.v)
      }
    ];
  });
  options.sort((a, b) => a.strike - b.strike || a.type.localeCompare(b.type));
  return { options, index, forward };
}

export function trimPerp(result: unknown, currency: string): { mark: number | null; index: number | null; fundingHourly: number | null } {
  const t = row(row(row(result).tickers)[`${currency}-PERP`]);
  return { mark: fin(t.M), index: fin(t.I), fundingHourly: fin(t.f) };
}

export function trimHistory(result: unknown): { t: number; close: number }[] {
  return (Array.isArray(result) ? result : [])
    .map(row)
    .flatMap((c) => {
      const t = fin(c.timestamp);
      const close = fin(c.close_price) ?? fin(c.price);
      return t !== null && close !== null && close > 0 ? [{ t: t * 1000, close }] : [];
    })
    .sort((a, b) => a.t - b.t);
}

/* ---------------- ops ---------------- */

/** سررسید ۱۴ تا ۴۵ روزه نزدیک به ۳۰ روز (سررسید Derive ساعت ۰۸:۰۰ UTC) — برای ترکیب چندبازاری */
export function pickExpiry30(expiries: readonly string[], nowMs: number): string {
  const days = (e: string) => (Date.UTC(+e.slice(0, 4), +e.slice(4, 6) - 1, +e.slice(6, 8), 8) - nowMs) / 86_400_000;
  const band = expiries.filter((e) => days(e) >= 14 && days(e) <= 45);
  const pool = band.length ? band : expiries.filter((e) => days(e) >= 7);
  if (!pool.length) return expiries[0];
  return pool.reduce((a, b) => (Math.abs(days(b) - 30) < Math.abs(days(a) - 30) ? b : a));
}

export const DERIVE_OPS = ['derive-markets', 'derive-chain', 'derive-history'] as const;

export async function getDerive(op: string, params: URLSearchParams): Promise<unknown> {
  if (op === 'derive-markets') return { markets: await cached('cur', 60_000, async () => trimCurrencies(await call('get_all_currencies', {}))), fetchedAt: Date.now() };
  const currency = (params.get('currency') ?? '').toUpperCase();
  if (!CURRENCY_RE.test(currency)) throw new ProviderError(400, 'نماد بازار معتبر نیست');
  if (op === 'derive-history') {
    const end = Math.floor(Date.now() / 1000);
    const candles = await cached(`h:${currency}`, 30 * 60_000, async () =>
      trimHistory(await call('get_index_chart_data', { currency, period: 86400, start_timestamp: end - 45 * 86400, end_timestamp: end }))
    );
    return { currency, candles };
  }
  if (op !== 'derive-chain') throw new ProviderError(400, 'درخواست ناشناخته');
  const meta = await cached(`i:${currency}`, 10 * 60_000, async () =>
    trimInstruments(await call('get_all_instruments', { instrument_type: 'option', currency, expired: false, page_size: 1000 }), Math.floor(Date.now() / 1000))
  );
  if (!meta.expiries.length) throw new ProviderError(404, 'این دارایی در Derive آپشن ندارد');
  const wanted = params.get('expiry') ?? '';
  const expiry = EXPIRY_RE.test(wanted) && meta.expiries.includes(wanted) ? wanted : wanted === 'auto' ? pickExpiry30(meta.expiries, Date.now()) : meta.expiries[0];
  const [chain, perp] = await Promise.all([
    cached(`t:${currency}:${expiry}`, 15_000, async () => trimTickers(await call('get_tickers', { instrument_type: 'option', currency, expiry_date: expiry }))),
    cached(`p:${currency}`, 15_000, async () => trimPerp(await call('get_tickers', { instrument_type: 'perp', currency }).catch(() => null), currency))
  ]);
  return { currency, expiry, ...meta, ...chain, perp, fetchedAt: Date.now() };
}

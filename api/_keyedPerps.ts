/** ============================================================
 * حساب‌های پرپچوال با کلید API فقط‌خواندنی — اوندو پرپس (فقط سرور)
 *
 * کلیدها فقط در Environment Variables ورسل؛ هرگز به مرورگر، لاگ یا پاسخ نمی‌رسند:
 *   ONDO_PERPS_KEY_ID · ONDO_PERPS_API_SECRET           (اوندو: HMAC-SHA256 روی timestamp+method+path+body)
 * فقط endpointهای خواندنی صدا زده می‌شوند. پلتفرمی که کلیدش تنظیم نشده اصلاً نمایش داده نمی‌شود.
 *
 * آدرس عمومی حساب‌هایی که با آدرس خوانده می‌شوند (بدون فیلد آدرس در UI؛ چند آدرس با کاما):
 *   HYPERLIQUID_ADDRESS · LIGHTER_ADDRESS · LIGHTER_ROBINHOOD_ADDRESS · TXFLOW_ADDRESS
 * سرور فقط آدرس را برمی‌گرداند؛ خواندن حساب مثل حساب‌های ثبت‌شده در مرورگر انجام می‌شود.
 * ============================================================ */
import { createHmac } from 'node:crypto';
import { ondoSnapshot, type KeyedSnapshot, type KeyedVenue } from '../src/features/perps/domain/keyedVenues.js';

const ONDO = 'https://api.ondoperps.xyz';
const CACHE_MS = 20_000;
const EVM = /^0x[0-9a-fA-F]{40}$/;

export type KeyedResult = KeyedSnapshot | { venue: KeyedVenue; error: string };

const env = (k: string) => process.env[k]?.trim() || '';

export function configuredVenues(): KeyedVenue[] {
  const out: KeyedVenue[] = [];
  if (env('ONDO_PERPS_KEY_ID') && env('ONDO_PERPS_API_SECRET')) out.push('ondo');
  return out;
}

class VenueError extends Error {}

async function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: 'application/json', ...headers }, redirect: 'error', signal: AbortSignal.timeout(12_000) });
  const text = await res.text();
  if (!res.ok) {
    // فقط کد و پیام کوتاه سرویس؛ هیچ هدر یا کلیدی برگردانده نمی‌شود
    let msg = '';
    try {
      const b = JSON.parse(text) as Record<string, unknown>;
      msg = String(b.error_code ?? b.msg ?? b.detail ?? b.error ?? '').slice(0, 80);
    } catch { /* متن غیر JSON */ }
    throw new VenueError(`HTTP ${res.status}${msg ? ` · ${msg}` : ''}`);
  }
  return JSON.parse(text);
}

/* ---------------- اوندو ---------------- */

export function ondoHeaders(path: string, keyId: string, secret: string, now = Date.now()): Record<string, string> {
  const timestamp = String(now);
  const sign = createHmac('sha256', secret).update(timestamp + 'GET' + path).digest('hex');
  return { 'ONDO-KEY-ID': keyId, 'ONDO-TIMESTAMP': timestamp, 'ONDO-SIGN': sign };
}

async function ondo(): Promise<KeyedSnapshot> {
  const get = (path: string) => getJson(ONDO + path, ondoHeaders(path, env('ONDO_PERPS_KEY_ID'), env('ONDO_PERPS_API_SECRET')));
  const [balance, positions, g24, g7, g30] = await Promise.all([
    get('/v1/perps/balance'),
    get('/v1/perps/positions'),
    get('/v1/portfolio/summary/graph?range=24h').catch(() => null),
    get('/v1/portfolio/summary/graph?range=7d').catch(() => null),
    get('/v1/portfolio/summary/graph?range=30d').catch(() => null)
  ]);
  return ondoSnapshot({ balance, positions, graphs: { '24h': g24, '7d': g7, '30d': g30 } });
}

/* ---------------- آدرس‌های env ---------------- */

export type AddressVenue = 'hyperliquid' | 'lighter-mainnet' | 'lighter-robinhood' | 'txflow';
const ADDRESS_ENV: Record<AddressVenue, string> = {
  hyperliquid: 'HYPERLIQUID_ADDRESS',
  'lighter-mainnet': 'LIGHTER_ADDRESS',
  'lighter-robinhood': 'LIGHTER_ROBINHOOD_ADDRESS',
  txflow: 'TXFLOW_ADDRESS'
};

/** آدرس‌های معتبر EVM هر پلتفرم از env (نامعتبرها بی‌صدا کنار می‌روند؛ حداکثر ۵ برای هر پلتفرم) */
export function envAddresses(): Record<AddressVenue, string[]> {
  const out = {} as Record<AddressVenue, string[]>;
  for (const [venue, key] of Object.entries(ADDRESS_ENV) as [AddressVenue, string][]) {
    out[venue] = [...new Set(env(key).split(/[,\s]+/).filter((a) => EVM.test(a)).map((a) => a.toLowerCase()))].slice(0, 5);
  }
  return out;
}

/* ---------------- همه ---------------- */

let cache: { at: number; data: KeyedResult[] } | null = null;
const LOADERS: Record<KeyedVenue, () => Promise<KeyedSnapshot>> = { ondo };

export async function getKeyedPerps(fresh = false): Promise<KeyedResult[]> {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const data = await Promise.all(
    configuredVenues().map(async (venue): Promise<KeyedResult> => {
      try {
        return await LOADERS[venue]();
      } catch (e) {
        return { venue, error: e instanceof VenueError ? e.message : 'ارتباط با سرویس برقرار نشد' };
      }
    })
  );
  cache = { at: Date.now(), data };
  return data;
}

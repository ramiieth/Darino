/** ============================================================
 * حساب‌های پرپچوال با کلید API فقط‌خواندنی — آستر، کیوفکس، اوندو پرپس (فقط سرور)
 *
 * کلیدها فقط در Environment Variables ورسل؛ هرگز به مرورگر، لاگ یا پاسخ نمی‌رسند:
 *   ONDO_PERPS_KEY_ID · ONDO_PERPS_API_SECRET           (اوندو: HMAC-SHA256 روی timestamp+method+path+body)
 *   QFEX_PUBLIC_KEY · QFEX_SECRET_KEY                   (کیوفکس: HMAC-SHA256 روی nonce:unix_ts)
 *   ASTER_USER · ASTER_SIGNER · ASTER_SIGNER_PRIVATE_KEY (آستر V3: امضای EIP-712 کیف پول API)
 * فقط endpointهای خواندنی صدا زده می‌شوند. پلتفرمی که کلیدش تنظیم نشده اصلاً نمایش داده نمی‌شود.
 * ============================================================ */
import { createHmac, randomBytes } from 'node:crypto';
import { addressOf, signMessage } from './_eip712.js';
import { ASTER_INCOME_LIMIT, asterSnapshot, ondoSnapshot, qfexSnapshot, type KeyedSnapshot, type KeyedVenue } from '../src/features/perps/domain/keyedVenues.js';

const ONDO = 'https://api.ondoperps.xyz';
const QFEX = 'https://api.qfex.com';
const ASTER = 'https://fapi.asterdex.com';
const ASTER_DOMAIN = { name: 'AsterSignTransaction', version: '1', chainId: 1666, verifyingContract: '0x0000000000000000000000000000000000000000' };
const CACHE_MS = 20_000;
const EVM = /^0x[0-9a-fA-F]{40}$/;

export type KeyedResult = KeyedSnapshot | { venue: KeyedVenue; error: string };

const env = (k: string) => process.env[k]?.trim() || '';

export function configuredVenues(): KeyedVenue[] {
  const out: KeyedVenue[] = [];
  if (env('ASTER_USER') && env('ASTER_SIGNER') && env('ASTER_SIGNER_PRIVATE_KEY')) out.push('aster');
  if (env('QFEX_PUBLIC_KEY') && env('QFEX_SECRET_KEY')) out.push('qfex');
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

/* ---------------- کیوفکس ---------------- */

export function qfexHeaders(publicKey: string, secret: string, now = Date.now(), nonce = randomBytes(16).toString('hex')): Record<string, string> {
  const ts = String(Math.floor(now / 1000));
  return {
    'x-qfex-public-key': publicKey,
    'x-qfex-nonce': nonce,
    'x-qfex-timestamp': ts,
    'x-qfex-hmac-signature': createHmac('sha256', secret).update(`${nonce}:${ts}`).digest('hex')
  };
}

async function qfex(): Promise<KeyedSnapshot> {
  // هر درخواست nonce تازه می‌خواهد (یکتا در ۱۵ دقیقه)
  const get = (path: string) => getJson(QFEX + path, qfexHeaders(env('QFEX_PUBLIC_KEY'), env('QFEX_SECRET_KEY')));
  const [positions, equity] = await Promise.all([get('/user/positions'), get('/user/account-equity?duration=1w').catch(() => null)]);
  return qfexSnapshot({ positions, equity });
}

/* ---------------- آستر V3 ---------------- */

let asterNonce = 0;
/** nonce میکروثانیه، یکتا و صعودی برای هر کیف پول API */
const nextAsterNonce = () => (asterNonce = Math.max(Date.now() * 1000, asterNonce + 1));

export function asterQuery(params: Record<string, string>, user: string, signer: string, privateKey: string, nonce = nextAsterNonce()): string {
  const qs = new URLSearchParams({ ...params, user, signer, nonce: String(nonce) }).toString();
  return `${qs}&signature=${signMessage(ASTER_DOMAIN, qs, privateKey)}`;
}

async function aster(): Promise<KeyedSnapshot> {
  const user = env('ASTER_USER'), signer = env('ASTER_SIGNER'), key = env('ASTER_SIGNER_PRIVATE_KEY');
  if (!EVM.test(user) || !EVM.test(signer)) throw new VenueError('آدرس ASTER_USER یا ASTER_SIGNER معتبر نیست');
  if (addressOf(key).toLowerCase() !== signer.toLowerCase()) throw new VenueError('کلید ASTER_SIGNER_PRIVATE_KEY با ASTER_SIGNER نمی‌خواند');
  const get = (path: string, params: Record<string, string> = {}) => getJson(`${ASTER}${path}?${asterQuery(params, user, signer, key)}`, {});
  const account = await get('/fapi/v3/account');
  const positions = await get('/fapi/v3/positionRisk');
  const incomes = await get('/fapi/v3/income', { startTime: String(Date.now() - 30 * 86_400_000), limit: String(ASTER_INCOME_LIMIT) }).catch(() => []);
  return asterSnapshot({ account, positions, incomes });
}

/* ---------------- همه ---------------- */

let cache: { at: number; data: KeyedResult[] } | null = null;
const LOADERS: Record<KeyedVenue, () => Promise<KeyedSnapshot>> = { aster, qfex, ondo };

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

/** ============================================================
 * Arcus — کلاینت فقط‌خواندنی REST (مستقیم از مرورگر)
 *
 * مرجع: docs.arcus.xyz/api-reference (introduction · rate-limits · public/*)
 *  • مسیرهای عمومی خواندن حساب فقط با `address` (+ `accountIndex`) کار می‌کنند؛
 *    هیچ API Key، امضا یا کلید خصوصی لازم نیست و درخواست نمی‌شود.
 *  • Arcus هدر `Access-Control-Allow-Origin: *` برمی‌گرداند، پس پروکسی سرور لازم نیست:
 *    آدرس کاربر به سرور دارینو نمی‌رسد و هیچ endpoint دلخواهی ساخته نمی‌شود (بدون SSRF).
 *  • فقط دو میزبان ثابت و فهرست بستهٔ مسیرهای GET مجاز است.
 *  • ۴۲۹: Retry-After / retryAfterMs رعایت می‌شود و تا پایان مهلت درخواستی ارسال نمی‌شود.
 *  • درخواست‌های هم‌زمان یکسان یکی می‌شوند.
 *  • اعداد صحیح بزرگ (زمان میکروثانیه، sequence) به رشته تبدیل می‌شوند تا دقت از بین نرود.
 * ============================================================ */
import type { ArcusEnv } from '@/features/custody/domain/types';

export const ARCUS_HOSTS: Record<ArcusEnv, { rest: string; ws: string }> = {
  mainnet: { rest: 'https://api.arcus.xyz', ws: 'wss://api.arcus.xyz/v1/ws' },
  testnet: { rest: 'https://api.testnet.arcus.xyz', ws: 'wss://api.testnet.arcus.xyz/v1/ws' }
};

/** مسیرهای مجاز (فقط GET عمومی) */
export const ARCUS_READ_PATHS = [
  '/v1/account',
  '/v1/positions',
  '/v1/openOrders',
  '/v1/orders',
  '/v1/fills',
  '/v1/funding',
  '/v1/portfolio',
  '/v1/accountTransferUpdates',
  '/v1/leverages',
  '/v1/markets'
] as const;
export type ArcusReadPath = (typeof ARCUS_READ_PATHS)[number];

const ALLOWED_PARAMS = new Set(['address', 'accountIndex', 'market', 'limit', 'from', 'to', 'status']);

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
/** حداقل مقدار from/to طبق مستندات (میکروثانیه) */
export const MIN_US = 100000000000000n;

export type ArcusErrorKind =
  | 'offline'
  | 'timeout'
  | 'invalid_input'
  | 'not_whitelisted'
  | 'no_activity'
  | 'rate_limited'
  | 'server'
  | 'bad_response';

export class ArcusError extends Error {
  constructor(
    public kind: ArcusErrorKind,
    message: string,
    public status: number | null = null,
    /** برای rate_limited: مهلت انتظار (ms) */
    public retryAfterMs: number | null = null
  ) {
    super(message);
    this.name = 'ArcusError';
  }
}

export const ERROR_TEXT: Record<ArcusErrorKind, string> = {
  offline: 'اتصال اینترنت برقرار نیست',
  timeout: 'پاسخ آرکوس در زمان مقرر نرسید',
  invalid_input: 'آدرس یا زیرحساب نامعتبر است',
  not_whitelisted: 'آرکوس خواندن این آدرس را مجاز نمی‌داند (آدرس در فهرست دسترسی آرکوس نیست)',
  no_activity: 'این زیرحساب هنوز هیچ فعالیتی ندارد',
  rate_limited: 'محدودیت تعداد درخواست آرکوس — پس از مهلت اعلام‌شده دوباره تلاش می‌شود',
  server: 'خطای سرور آرکوس',
  bad_response: 'پاسخ آرکوس قابل خواندن نبود'
};

/* ---------------- JSON با حفظ دقت اعداد صحیح بزرگ ---------------- */

/**
 * هر عدد صحیح با بیش از ۱۵ رقم را (بیرون از رشته‌ها) داخل کوتیشن می‌گذارد.
 * زمان‌های میکروثانیه (۱۶ رقم) و sequenceها بدون گرد شدن به رشته تبدیل می‌شوند.
 */
export function parseJsonPreservingBigInts(text: string): unknown {
  let out = '';
  let i = 0;
  let inStr = false;
  while (i < text.length) {
    const c = text[i];
    if (inStr) {
      out += c;
      if (c === '\\') {
        out += text[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (c === '"') inStr = false;
      i++;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
      i++;
      continue;
    }
    if (c === '-' || (c >= '0' && c <= '9')) {
      let j = i + 1;
      while (j < text.length && /[0-9eE+\-.]/.test(text[j])) j++;
      const tok = text.slice(i, j);
      const digits = tok.replace('-', '');
      out += /^-?\d+$/.test(tok) && digits.length > 15 ? `"${tok}"` : tok;
      i = j;
      continue;
    }
    out += c;
    i++;
  }
  return JSON.parse(out);
}

/* ---------------- اعتبارسنجی ورودی ---------------- */

export function validateAccountInput(address: string, accountIndex: number): string | null {
  if (!ADDRESS_RE.test(address.trim())) return 'آدرس کیف پول باید 0x و ۴۰ رقم هگز باشد';
  if (!Number.isInteger(accountIndex) || accountIndex < 0 || accountIndex > 9) return 'شمارهٔ زیرحساب باید عددی بین ۰ تا ۹ باشد';
  return null;
}

export type QueryValue = string | number | bigint | string[] | undefined | null;

export function buildArcusUrl(env: ArcusEnv, path: ArcusReadPath, params: Record<string, QueryValue>): string {
  if (!(ARCUS_READ_PATHS as readonly string[]).includes(path)) throw new ArcusError('invalid_input', 'مسیر مجاز نیست');
  const host = ARCUS_HOSTS[env];
  if (!host) throw new ArcusError('invalid_input', 'محیط نامعتبر');
  const u = new URL(path, host.rest);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (!ALLOWED_PARAMS.has(k)) throw new ArcusError('invalid_input', `پارامتر مجاز نیست: ${k}`);
    if (k === 'address' && !ADDRESS_RE.test(String(v))) throw new ArcusError('invalid_input', ERROR_TEXT.invalid_input);
    if (k === 'accountIndex') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 9) throw new ArcusError('invalid_input', ERROR_TEXT.invalid_input);
    }
    if ((k === 'from' || k === 'to') && BigInt(String(v)) < MIN_US) {
      // جلوگیری از ارسال میلی‌ثانیه به‌جای میکروثانیه (طبق مستندات → 400 یا نتیجهٔ خالی گمراه‌کننده)
      throw new ArcusError('invalid_input', 'واحد زمان باید میکروثانیه باشد');
    }
    if (Array.isArray(v)) u.searchParams.set(k, v.join(','));
    else u.searchParams.set(k, String(v));
  }
  return u.toString();
}

/* ---------------- اجرای درخواست ---------------- */

export interface FetchOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/** مهلت ۴۲۹ به تفکیک محیط (لایهٔ per-IP مشترک است) */
const cooldownUntil: Record<ArcusEnv, number> = { mainnet: 0, testnet: 0 };
const inflight = new Map<string, Promise<unknown>>();

export function retryAfterFrom(res: Response, body: unknown): number {
  const ms = (body as { retryAfterMs?: unknown } | null)?.retryAfterMs;
  if (typeof ms === 'number' && ms >= 0) return ms;
  const h = res.headers.get('Retry-After');
  const s = h ? Number(h) : NaN;
  return Number.isFinite(s) && s > 0 ? s * 1000 : 2000;
}

export function cooldownRemaining(env: ArcusEnv, now = Date.now()): number {
  return Math.max(0, cooldownUntil[env] - now);
}

async function doFetch<T>(env: ArcusEnv, url: string, opts: FetchOptions): Promise<T> {
  const now = opts.now ?? Date.now;
  const wait = cooldownUntil[env] - now();
  if (wait > 0) throw new ArcusError('rate_limited', ERROR_TEXT.rate_limited, 429, wait);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ArcusError('offline', ERROR_TEXT.offline);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort('timeout'), opts.timeoutMs ?? 12_000);
  const onAbort = () => ctrl.abort('cancel');
  opts.signal?.addEventListener('abort', onAbort);
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: ctrl.signal,
      // هیچ کوکی/اعتبارنامه‌ای ارسال نمی‌شود؛ ریدایرکت دنبال نمی‌شود
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      referrerPolicy: 'no-referrer'
    });
  } catch (e) {
    if (ctrl.signal.aborted && ctrl.signal.reason === 'timeout') throw new ArcusError('timeout', ERROR_TEXT.timeout);
    if (opts.signal?.aborted) throw e;
    throw new ArcusError('offline', ERROR_TEXT.offline);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }

  const text = await res.text().catch(() => '');
  let body: unknown = null;
  try {
    body = text ? parseJsonPreservingBigInts(text) : null;
  } catch {
    body = null;
  }
  const errMsg = (body as { error?: unknown } | null)?.error;

  if (res.status === 429) {
    const ms = retryAfterFrom(res, body);
    cooldownUntil[env] = now() + ms;
    throw new ArcusError('rate_limited', ERROR_TEXT.rate_limited, 429, ms);
  }
  if (res.status === 404 && typeof errMsg === 'string' && /no activity/i.test(errMsg)) {
    throw new ArcusError('no_activity', ERROR_TEXT.no_activity, 404);
  }
  if (res.status === 403 && typeof errMsg === 'string' && /whitelist/i.test(errMsg)) {
    throw new ArcusError('not_whitelisted', ERROR_TEXT.not_whitelisted, 403);
  }
  if (res.status === 400) throw new ArcusError('invalid_input', typeof errMsg === 'string' ? `${ERROR_TEXT.invalid_input} (${errMsg.slice(0, 80)})` : ERROR_TEXT.invalid_input, 400);
  if (!res.ok) throw new ArcusError('server', `${ERROR_TEXT.server} (HTTP ${res.status})`, res.status);
  if (body === null || typeof body !== 'object') throw new ArcusError('bad_response', ERROR_TEXT.bad_response, res.status);
  return body as T;
}

export function arcusGet<T>(env: ArcusEnv, path: ArcusReadPath, params: Record<string, QueryValue>, opts: FetchOptions = {}): Promise<T> {
  const url = buildArcusUrl(env, path, params);
  const hit = inflight.get(url);
  if (hit) return hit as Promise<T>;
  const p = doFetch<T>(env, url, opts).finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

/** فقط تست */
export function __resetArcusClientForTests(): void {
  cooldownUntil.mainnet = 0;
  cooldownUntil.testnet = 0;
  inflight.clear();
}

/** Read-only HTTP for the shopping assistant: fixed host allowlist, no user cookies or credentials, short cache. */
import { obj } from '../src/features/connected/domain/model.js';

export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';

// Only these exact hosts are ever requested; a redirect elsewhere is refused.
const HOSTS = new Set([
  'www.technolife.com', 'masterkala.com', 'api-go.shopino.app', 'www.khanoumi.com', 'asalbanooshop.com',
  'www.sheypoor.com', 'api.divar.ir', 'snappfood.ir', 'svc.snapp.market', 'flight.atighgasht.com', 'train.mrbilit.com',
  'core.otaghak.com', 'apigw.paziresh24.com', 'api.doctoreto.com', 'get.taaghche.com'
]);

// Links and images shown to the user must be https on the service's own domains.
const LINK_ROOTS = [
  'digikala.com', 'technolife.com', 'masterkala.com', 'shopino.app', 'khanoumi.com', 'asalbanooshop.com', 'sheypoor.com',
  'divar.ir', 'divarcdn.com', 'snappfood.ir', 'snapp.market', 'snapp.express', 'mrbilit.com', 'mrbilit.ir', 'otaghak.com', 'paziresh24.com',
  'doctoreto.com', 'taaghche.com', 'fidibo.com', 'jabama.com', 'flytoday.ir', 'okala.com', '30book.com', 'arvanvod.ir'
];

export class SourceError extends Error {
  constructor(message: string, readonly status = 502) { super(message); }
}

export function safeUrl(raw: unknown, base?: string): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim(), base);
    if (u.protocol !== 'https:') return null;
    return LINK_ROOTS.some((r) => u.hostname === r || u.hostname.endsWith(`.${r}`)) ? u.toString() : null;
  } catch { return null; }
}

export const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(/[,،\s]/g, '')) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

const TTL = 10 * 60_000;
const cache = new Map<string, { at: number; value: unknown }>();
const lastHit = new Map<string, number>();
const GAP_MS = 250;

async function pace(host: string): Promise<void> {
  const now = Date.now(); const next = Math.max(now, (lastHit.get(host) ?? 0) + GAP_MS);
  lastHit.set(host, next);
  if (next > now) await new Promise((r) => setTimeout(r, next - now));
}

export interface ReqInit { method?: 'GET' | 'POST'; body?: unknown; headers?: Record<string, string>; timeoutMs?: number; text?: boolean; cacheKey?: string | false }

/** GET/POST a public endpoint on an allowlisted host; JSON by default, text with `text: true`. */
export async function request<T = unknown>(url: string, init: ReqInit = {}): Promise<T> {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !HOSTS.has(u.hostname)) throw new SourceError('میزبان مجاز نیست', 400);
  const body = init.body === undefined ? undefined : typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
  const key = init.cacheKey === false ? null : init.cacheKey ?? `${init.method ?? 'GET'} ${url} ${body ?? ''}`;
  const hit = key ? cache.get(key) : undefined;
  if (hit && Date.now() - hit.at < TTL) return hit.value as T;
  await pace(u.hostname);
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      body,
      redirect: 'follow',
      signal: AbortSignal.timeout(init.timeoutMs ?? 12_000),
      headers: { 'User-Agent': UA, Accept: init.text ? 'text/html' : 'application/json', 'Accept-Language': 'fa-IR,fa;q=0.9', ...(body && typeof init.body !== 'string' ? { 'Content-Type': 'application/json' } : {}), ...init.headers }
    });
  } catch (e) {
    throw new SourceError((e as Error).name === 'TimeoutError' ? 'پاسخ نداد (زمان تمام شد)' : 'در دسترس نیست');
  }
  if (res.url && !HOSTS.has(new URL(res.url).hostname)) throw new SourceError('به میزبان دیگری هدایت شد');
  if (res.status === 403 || res.status === 451) throw new SourceError('سرور خارج از ایران را نمی‌پذیرد', 403);
  if (res.status === 429) throw new SourceError('موقتاً درخواست‌ها را محدود کرده', 429);
  if (res.status === 204) return (init.text ? '' : {}) as T;
  const raw = await res.text();
  if (!res.ok && !(init.text && res.status === 418)) throw new SourceError(`پاسخ ناموفق (HTTP ${res.status})`);
  let value: unknown = raw;
  if (!init.text) { try { value = JSON.parse(raw); } catch { throw new SourceError('پاسخ قابل خواندن نیست'); } }
  if (key && res.ok) {
    if (cache.size > 300) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), value });
  }
  return value as T;
}

export const json = (url: string, init?: ReqInit) => request<unknown>(url, init).then(obj);

/** Strip tags and entities from a snippet of site HTML. */
export function plain(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d))).replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

export const mapLink = (lat: unknown, lon: unknown): string | null => {
  const a = num(lat); const b = num(lon);
  return a && b && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? `https://www.google.com/maps/dir/?api=1&destination=${a},${b}` : null;
};

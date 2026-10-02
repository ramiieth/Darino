/** ============================================================
 * هستهٔ احراز هویت سرور — نشست، کوکی، CSRF، مبدا مجاز
 *
 *  • userId فقط از نشست معتبر خوانده می‌شود (هدر x-user-id دیگر استفاده نمی‌شود).
 *  • کوکی نشست: HttpOnly · Secure (روی https) · SameSite=Strict · Path=/ ·
 *    روی https با پیشوند __Host- (بدون Domain).
 *  • درخواست تغییردهنده (POST/DELETE) باید Origin مجاز + هدر x-darino-csrf داشته باشد.
 *  • CORS باز نمی‌شود؛ هیچ هدر Access-Control-* ارسال نمی‌شود.
 *  • هیچ توکن/کوکی/کلید در لاگ یا پاسخ خطا نوشته نمی‌شود.
 * ============================================================ */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { db, isDbConfigured, json } from './_neon.js';
import { ensureSchema } from './_schema.js';
import { neonAuthStore, type AuthStore, type StoredSession } from './_authStore.js';

export const SESSION_TTL_MS = 30 * 24 * 3600_000;
export const SESSION_MAX_AGE_MS = 180 * 24 * 3600_000;
export const STEP_UP_WINDOW_MS = 10 * 60_000;
export const CHALLENGE_TTL_MS = 5 * 60_000;
export const PAIR_CODE_TTL_MS = 10 * 60_000;
const TOUCH_THROTTLE_MS = 15 * 60_000;

export interface AuthConfig {
  ownerId: string;
  rpName: string;
  origins: string[];
  setupToken: string | null;
}

const DEFAULT_ORIGINS = ['https://dariiino.vercel.app', 'http://localhost:5173', 'http://localhost:4173'];

export function getAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const origins = (env.DARINO_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter((s) => /^https:\/\/[a-z0-9.-]+$/i.test(s) || /^http:\/\/localhost(:\d+)?$/.test(s));
  const token = (env.DARINO_SETUP_TOKEN ?? '').trim();
  return {
    // داده‌های موجود با همین شناسه ذخیره شده‌اند — هیچ مهاجرتی لازم نیست
    ownerId: (env.DARINO_OWNER_ID ?? '').trim() || 'local-user',
    rpName: 'دارینو',
    origins: origins.length ? origins : DEFAULT_ORIGINS,
    // توکن کوتاه پذیرفته نمی‌شود (حدس‌پذیر)
    setupToken: token.length >= 24 ? token : null
  };
}

let storeOverride: AuthStore | null = null;
/** فقط تست */
export function __setAuthStoreForTests(s: AuthStore | null): void {
  storeOverride = s;
}

/** null = پایگاه داده در دسترس نیست (احراز هویت ممکن نیست) */
export async function getAuthStore(): Promise<AuthStore | null> {
  if (storeOverride) return storeOverride;
  if (!isDbConfigured()) return null;
  const sql = db();
  if (!(await ensureSchema(sql))) return null;
  return neonAuthStore(sql);
}

/* ---------------- رمزنگاری ---------------- */

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export function safeEqual(a: string, b: string): boolean {
  // مقایسهٔ زمان‌ثابت روی هش (طول متفاوت هم نشت نمی‌کند)
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

/** کد اتصال ۸ نویسه‌ای خوانا (بدون 0/O/1/I) */
const PAIR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newPairCode(): string {
  const b = randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += PAIR_ALPHABET[b[i] % PAIR_ALPHABET.length];
  return s;
}
export const normalizePairCode = (s: string) =>
  s
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

/* ---------------- درخواست ---------------- */

export function header(req: IncomingMessage, name: string): string {
  const v = req.headers?.[name.toLowerCase()];
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

export function clientIp(req: IncomingMessage): string {
  // Vercel: x-real-ip / x-forwarded-for (اولین مقدار)
  const ip = header(req, 'x-real-ip') || header(req, 'x-forwarded-for').split(',')[0] || '';
  return ip.trim().slice(0, 64);
}

export function userAgentOf(req: IncomingMessage): string {
  return header(req, 'user-agent').slice(0, 300);
}

/** برچسب خوانای دستگاه از User-Agent */
export function deviceLabel(ua: string, standalone = false): string {
  const os = /iPhone/.test(ua)
    ? 'آیفون'
    : /iPad/.test(ua)
      ? 'آیپد'
      : /Android/.test(ua)
        ? 'اندروید'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'مک'
          : /Windows/.test(ua)
            ? 'ویندوز'
            : /Linux/.test(ua)
              ? 'لینوکس'
              : 'دستگاه نامشخص';
  const br = /Edg\//.test(ua) ? 'اج' : /CriOS|Chrome\//.test(ua) ? 'کروم' : /FxiOS|Firefox\//.test(ua) ? 'فایرفاکس' : /Safari\//.test(ua) ? 'سافاری' : '';
  return `${os}${br ? ' · ' + br : ''}${standalone ? ' · اپ نصب‌شده' : ''}`;
}

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header(req, 'cookie').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** آیا درخواست روی https است؟ (Vercel → x-forwarded-proto) */
export function isHttps(req: IncomingMessage): boolean {
  const proto = header(req, 'x-forwarded-proto');
  if (proto) return proto.split(',')[0].trim() === 'https';
  return header(req, 'origin').startsWith('https://');
}

export const sessionCookieName = (secure: boolean) => (secure ? '__Host-darino_sid' : 'darino_sid');
export const challengeCookieName = (secure: boolean) => (secure ? '__Host-darino_chal' : 'darino_chal');

type CookieRes = { setHeader(k: string, v: string | string[]): void; getHeader?(k: string): unknown };

export function appendCookie(res: CookieRes, cookie: string): void {
  const prev = res.getHeader?.('Set-Cookie');
  const list = Array.isArray(prev) ? prev.map(String) : prev ? [String(prev)] : [];
  res.setHeader('Set-Cookie', [...list, cookie]);
}

export function buildCookie(name: string, value: string, maxAgeSec: number, secure: boolean): string {
  return [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`, secure ? 'Secure' : '']
    .filter(Boolean)
    .join('; ');
}

/** Origin مجاز درخواست (برای WebAuthn: expectedOrigin و rpID) */
export function allowedOrigin(req: IncomingMessage, cfg: AuthConfig): string | null {
  const o = header(req, 'origin').replace(/\/+$/, '');
  return o && cfg.origins.includes(o) ? o : null;
}

export const rpIdOf = (origin: string) => new URL(origin).hostname;

/** CSRF: درخواست تغییردهنده باید از مبدا مجاز و با هدر سفارشی باشد */
export function checkCsrf(req: IncomingMessage, cfg: AuthConfig): boolean {
  const m = (req.method ?? 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD') return true;
  return !!allowedOrigin(req, cfg) && header(req, 'x-darino-csrf') === '1';
}

export function noStore(res: { setHeader(k: string, v: string): void }): void {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Vary', 'Cookie');
}

/* ---------------- نشست ---------------- */

export interface ActiveSession {
  session: StoredSession;
  userId: string;
}

export async function readSession(req: IncomingMessage, store: AuthStore, now = Date.now()): Promise<ActiveSession | null> {
  const cookies = parseCookies(req);
  const token = cookies['__Host-darino_sid'] ?? cookies['darino_sid'];
  if (!token || token.length < 32 || token.length > 128) return null;
  const s = await store.getSessionByTokenHash(sha256(token));
  if (!s || s.revokedAt || s.expiresAt <= now || now - s.createdAt > SESSION_MAX_AGE_MS) return null;
  if (now - s.lastSeenAt > TOUCH_THROTTLE_MS) {
    // تمدید لغزان (حداکثر تا سقف مطلق)
    const exp = Math.min(now + SESSION_TTL_MS, s.createdAt + SESSION_MAX_AGE_MS);
    await store.touchSession(s.id, now, exp);
  }
  return { session: s, userId: s.userId };
}

export async function issueSession(
  req: IncomingMessage,
  res: CookieRes,
  store: AuthStore,
  p: { userId: string; credentialId: string | null; standalone: boolean },
  now = Date.now()
): Promise<StoredSession> {
  const token = randomToken(32);
  const ua = userAgentOf(req);
  const s: StoredSession = {
    id: randomToken(12),
    tokenHash: sha256(token),
    userId: p.userId,
    credentialId: p.credentialId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: now + SESSION_TTL_MS,
    revokedAt: null,
    stepUpAt: now,
    userAgent: ua,
    ip: clientIp(req),
    label: deviceLabel(ua, p.standalone)
  };
  await store.createSession(s);
  const secure = isHttps(req);
  appendCookie(res, buildCookie(sessionCookieName(secure), token, SESSION_TTL_MS / 1000, secure));
  return s;
}

export function clearSessionCookie(req: IncomingMessage, res: CookieRes): void {
  const secure = isHttps(req);
  appendCookie(res, buildCookie(sessionCookieName(secure), '', 0, secure));
}

/**
 * گارد همهٔ endpointهای داده‌ٔ شخصی.
 * برگشت null = پاسخ خطا (401/403/503) قبلاً ارسال شده است.
 */
export async function requireSession(req: IncomingMessage, res: ServerResponse): Promise<ActiveSession | null> {
  noStore(res);
  const cfg = getAuthConfig();
  if (!checkCsrf(req, cfg)) {
    json(res, 403, { ok: false, error: 'forbidden' });
    return null;
  }
  const store = await getAuthStore();
  if (!store) {
    json(res, 503, { ok: false, error: 'auth_unavailable' });
    return null;
  }
  const s = await readSession(req, store);
  if (!s) {
    json(res, 401, { ok: false, error: 'unauthenticated' });
    return null;
  }
  return s;
}

export async function logEvent(store: AuthStore, req: IncomingMessage, userId: string, kind: string, detail: Record<string, unknown> = {}): Promise<void> {
  try {
    await store.addEvent({ userId, at: Date.now(), kind, ip: clientIp(req), userAgent: userAgentOf(req), detail });
  } catch {
    /* ثبت رویداد نباید جریان ورود را بشکند */
  }
}

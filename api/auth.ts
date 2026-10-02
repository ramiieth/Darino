/** ============================================================
 * /api/auth — ورود با Passkey (Face ID / Touch ID) و مدیریت نشست‌ها
 *
 *  GET  ?op=status            وضعیت ورود این دستگاه
 *  POST ?op=register-options  شروع ثبت passkey  (mode: setup | add | pair)
 *  POST ?op=register-verify   پایان ثبت passkey
 *  POST ?op=login-options     شروع ورود / تأیید مجدد (stepUp)
 *  POST ?op=login-verify      پایان ورود / تأیید مجدد
 *  POST ?op=logout            خروج همین دستگاه
 *  GET  ?op=sessions          فهرست نشست‌های همهٔ دستگاه‌ها
 *  POST ?op=revoke-session    لغو یک نشست            (تأیید مجدد لازم، جز نشست خود)
 *  POST ?op=revoke-others     خروج همهٔ دستگاه‌های دیگر (تأیید مجدد لازم)
 *  GET  ?op=passkeys          فهرست passkeyها
 *  POST ?op=rename-passkey    تغییر نام
 *  POST ?op=delete-passkey    حذف passkey + لغو نشست‌های آن (تأیید مجدد لازم)
 *  POST ?op=pair-code         کد یک‌بارمصرف ۱۰ دقیقه‌ای برای دستگاه جدید (تأیید مجدد لازم)
 *  GET  ?op=events            رویدادهای امنیتی اخیر
 *
 * راه‌اندازی اول: passkey اول فقط با DARINO_SETUP_TOKEN (متغیر محیطی Vercel) ثبت می‌شود.
 * مرجع: SimpleWebAuthn v14 — userVerification: required (Face ID/Touch ID/رمز دستگاه).
 * ============================================================ */
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON
} from '@simplewebauthn/server';
import { json, readBody } from './_neon.js';
import {
  allowedOrigin,
  appendCookie,
  buildCookie,
  challengeCookieName,
  CHALLENGE_TTL_MS,
  checkCsrf,
  clearSessionCookie,
  deviceLabel,
  getAuthConfig,
  getAuthStore,
  isHttps,
  issueSession,
  logEvent,
  newPairCode,
  noStore,
  normalizePairCode,
  PAIR_CODE_TTL_MS,
  parseCookies,
  randomToken,
  readSession,
  rpIdOf,
  safeEqual,
  sha256,
  STEP_UP_WINDOW_MS,
  userAgentOf,
  clientIp,
  type ActiveSession
} from './_authCore.js';
import type { AuthStore, StoredSession } from './_authStore.js';

const FAIL_WINDOW_MS = 15 * 60_000;
const FAIL_LIMIT = 20;

type Res = ServerResponse;

function opOf(req: IncomingMessage): string {
  try {
    return new URL(req.url ?? '/', 'http://x').searchParams.get('op') ?? '';
  } catch {
    return '';
  }
}

const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64url');
const fromB64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));

function publicSession(s: StoredSession, currentId: string | null) {
  return {
    id: s.id,
    label: s.label,
    ip: s.ip,
    createdAt: s.createdAt,
    lastSeenAt: s.lastSeenAt,
    expiresAt: s.expiresAt,
    revokedAt: s.revokedAt,
    current: s.id === currentId
  };
}

function stepUpFresh(s: StoredSession, now = Date.now()): boolean {
  return now - s.stepUpAt <= STEP_UP_WINDOW_MS;
}

async function rateLimited(store: AuthStore, req: IncomingMessage): Promise<boolean> {
  const ip = clientIp(req);
  if (!ip) return false;
  return (await store.countRecentFailures(ip, Date.now() - FAIL_WINDOW_MS)) >= FAIL_LIMIT;
}

function setChallengeCookie(req: IncomingMessage, res: Res, id: string): void {
  const secure = isHttps(req);
  appendCookie(res, buildCookie(challengeCookieName(secure), id, CHALLENGE_TTL_MS / 1000, secure));
}
function clearChallengeCookie(req: IncomingMessage, res: Res): void {
  const secure = isHttps(req);
  appendCookie(res, buildCookie(challengeCookieName(secure), '', 0, secure));
}
function challengeIdOf(req: IncomingMessage): string | null {
  const c = parseCookies(req);
  return c['__Host-darino_chal'] ?? c['darino_chal'] ?? null;
}

export default async function handler(req: IncomingMessage, res: Res): Promise<void> {
  noStore(res);
  const cfg = getAuthConfig();
  const op = opOf(req);
  const method = (req.method ?? 'GET').toUpperCase();

  let store: AuthStore | null;
  try {
    store = await getAuthStore();
  } catch {
    store = null;
  }
  if (!store) {
    if (op === 'status') {
      json(res, 200, { available: false, authenticated: false, reason: 'database_unavailable' });
      return;
    }
    json(res, 503, { ok: false, error: 'auth_unavailable' });
    return;
  }

  if (method !== 'GET' && !checkCsrf(req, cfg)) {
    json(res, 403, { ok: false, error: 'forbidden' });
    return;
  }

  try {
    const active = await readSession(req, store);

    if (op === 'status' && method === 'GET') {
      const creds = await store.listCredentials(cfg.ownerId);
      json(res, 200, {
        available: true,
        authenticated: !!active,
        hasPasskeys: creds.length > 0,
        setupAvailable: !!cfg.setupToken,
        session: active ? { id: active.session.id, label: active.session.label, createdAt: active.session.createdAt, stepUpFresh: stepUpFresh(active.session) } : null
      });
      return;
    }

    if (method === 'POST' && op === 'register-options') return await registerOptions(req, res, store, active);
    if (method === 'POST' && op === 'register-verify') return await registerVerify(req, res, store, active);
    if (method === 'POST' && op === 'login-options') return await loginOptions(req, res, store, active);
    if (method === 'POST' && op === 'login-verify') return await loginVerify(req, res, store, active);

    if (method === 'POST' && op === 'logout') {
      if (active) {
        await store.revokeSession(active.userId, active.session.id, Date.now());
        await logEvent(store, req, active.userId, 'logout', { session: active.session.id });
      }
      clearSessionCookie(req, res);
      json(res, 200, { ok: true });
      return;
    }

    // ---------- از این‌جا به بعد نشست لازم است ----------
    if (!active) {
      json(res, 401, { ok: false, error: 'unauthenticated' });
      return;
    }
    const uid = active.userId;
    const needStepUp = () => {
      if (stepUpFresh(active.session)) return false;
      json(res, 403, { ok: false, error: 'step_up_required' });
      return true;
    };

    if (method === 'GET' && op === 'sessions') {
      const list = await store.listSessions(uid);
      const now = Date.now();
      json(res, 200, {
        sessions: list.filter((s) => !s.revokedAt && s.expiresAt > now).map((s) => publicSession(s, active.session.id)),
        recentlyEnded: list.filter((s) => s.revokedAt || s.expiresAt <= now).slice(0, 20).map((s) => publicSession(s, active.session.id))
      });
      return;
    }

    if (method === 'POST' && op === 'revoke-session') {
      const body = await readBody(req);
      const id = typeof body.id === 'string' ? body.id : '';
      const self = id === active.session.id;
      if (!self && needStepUp()) return;
      const ok = await store.revokeSession(uid, id, Date.now());
      if (ok) await logEvent(store, req, uid, 'session_revoked', { session: id, self });
      if (self) clearSessionCookie(req, res);
      json(res, ok ? 200 : 404, { ok });
      return;
    }

    if (method === 'POST' && op === 'revoke-others') {
      if (needStepUp()) return;
      const n = await store.revokeOtherSessions(uid, active.session.id, Date.now());
      await logEvent(store, req, uid, 'sessions_revoked_others', { count: n });
      json(res, 200, { ok: true, revoked: n });
      return;
    }

    if (method === 'GET' && op === 'passkeys') {
      const creds = await store.listCredentials(uid);
      json(res, 200, {
        passkeys: creds.map((c) => ({
          id: c.id,
          label: c.label,
          createdAt: c.createdAt,
          lastUsedAt: c.lastUsedAt,
          backedUp: c.backedUp,
          deviceType: c.deviceType,
          usedByThisSession: c.id === active.session.credentialId
        }))
      });
      return;
    }

    if (method === 'POST' && op === 'rename-passkey') {
      const body = await readBody(req);
      const label = typeof body.label === 'string' ? body.label.trim().slice(0, 60) : '';
      if (!label || typeof body.id !== 'string') {
        json(res, 400, { ok: false, error: 'invalid' });
        return;
      }
      const ok = await store.renameCredential(uid, body.id, label);
      json(res, ok ? 200 : 404, { ok });
      return;
    }

    if (method === 'POST' && op === 'delete-passkey') {
      if (needStepUp()) return;
      const body = await readBody(req);
      const id = typeof body.id === 'string' ? body.id : '';
      const creds = await store.listCredentials(uid);
      if (!creds.some((c) => c.id === id)) {
        json(res, 404, { ok: false, error: 'not_found' });
        return;
      }
      if (creds.length <= 1) {
        json(res, 409, { ok: false, error: 'last_passkey' });
        return;
      }
      await store.deleteCredential(uid, id);
      const n = await store.revokeSessionsByCredential(uid, id, Date.now());
      await logEvent(store, req, uid, 'passkey_deleted', { credential: id.slice(0, 12), sessionsRevoked: n });
      if (active.session.credentialId === id) clearSessionCookie(req, res);
      json(res, 200, { ok: true, sessionsRevoked: n });
      return;
    }

    if (method === 'POST' && op === 'pair-code') {
      if (needStepUp()) return;
      const code = newPairCode();
      const expiresAt = Date.now() + PAIR_CODE_TTL_MS;
      await store.putPairCode({ codeHash: sha256(code), userId: uid, expiresAt, createdBySession: active.session.id });
      await logEvent(store, req, uid, 'pair_code_created', {});
      json(res, 200, { ok: true, code, expiresAt });
      return;
    }

    if (method === 'GET' && op === 'events') {
      const events = await store.listEvents(uid, 50);
      json(res, 200, {
        events: events.map((e) => ({ at: e.at, kind: e.kind, ip: e.ip, device: deviceLabel(e.userAgent), detail: e.detail }))
      });
      return;
    }

    json(res, 404, { ok: false, error: 'unknown_op' });
  } catch {
    // جزئیات خطا (که ممکن است شامل داده باشد) برگردانده نمی‌شود
    json(res, 500, { ok: false, error: 'server_error' });
  }
}

/* ---------------- ثبت passkey ---------------- */

async function registerOptions(req: IncomingMessage, res: Res, store: AuthStore, active: ActiveSession | null): Promise<void> {
  const cfg = getAuthConfig();
  const origin = allowedOrigin(req, cfg);
  if (!origin) return json(res, 403, { ok: false, error: 'origin' });
  if (await rateLimited(store, req)) return json(res, 429, { ok: false, error: 'too_many_attempts' });
  const body = await readBody(req);
  const mode = body.mode === 'add' || body.mode === 'pair' ? body.mode : 'setup';

  if (mode === 'setup') {
    const token = typeof body.setupToken === 'string' ? body.setupToken : '';
    if (!cfg.setupToken || !safeEqual(token, cfg.setupToken)) {
      await logEvent(store, req, cfg.ownerId, 'setup_failed', {});
      return json(res, 403, { ok: false, error: cfg.setupToken ? 'bad_setup_token' : 'setup_disabled' });
    }
  } else if (mode === 'add') {
    if (!active) return json(res, 401, { ok: false, error: 'unauthenticated' });
    if (Date.now() - active.session.stepUpAt > STEP_UP_WINDOW_MS) return json(res, 403, { ok: false, error: 'step_up_required' });
  } else {
    const code = normalizePairCode(typeof body.pairCode === 'string' ? body.pairCode : '');
    const hit = code.length === 8 ? await store.takePairCode(sha256(code), Date.now()) : null;
    if (!hit) {
      await logEvent(store, req, cfg.ownerId, 'pair_failed', {});
      return json(res, 403, { ok: false, error: 'bad_pair_code' });
    }
  }

  const existing = await store.listCredentials(cfg.ownerId);
  const options = await generateRegistrationOptions({
    rpName: cfg.rpName,
    rpID: rpIdOf(origin),
    userName: 'darino-owner',
    userDisplayName: 'مالک دارینو',
    userID: new TextEncoder().encode(cfg.ownerId),
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' }
  });
  const id = randomToken(16);
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 60) : '';
  await store.putChallenge({
    id,
    challenge: options.challenge,
    purpose: mode,
    userId: cfg.ownerId,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
    meta: { origin, label, sessionId: active?.session.id ?? null }
  });
  setChallengeCookie(req, res, id);
  json(res, 200, { ok: true, options });
}

async function registerVerify(req: IncomingMessage, res: Res, store: AuthStore, active: ActiveSession | null): Promise<void> {
  const cfg = getAuthConfig();
  const origin = allowedOrigin(req, cfg);
  const chalId = challengeIdOf(req);
  clearChallengeCookie(req, res);
  if (!origin || !chalId) return json(res, 400, { ok: false, error: 'no_challenge' });
  const chal = await store.takeChallenge(chalId);
  if (!chal || chal.expiresAt < Date.now() || !['setup', 'add', 'pair'].includes(chal.purpose) || chal.meta.origin !== origin) {
    return json(res, 400, { ok: false, error: 'challenge_expired' });
  }
  if (chal.purpose === 'add' && (!active || active.session.id !== chal.meta.sessionId)) {
    return json(res, 401, { ok: false, error: 'unauthenticated' });
  }
  const body = await readBody(req);
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response as RegistrationResponseJSON,
      expectedChallenge: chal.challenge,
      expectedOrigin: origin,
      expectedRPID: rpIdOf(origin),
      requireUserVerification: true
    });
  } catch {
    verification = { verified: false as const };
  }
  if (!verification.verified) {
    await logEvent(store, req, cfg.ownerId, 'register_failed', { mode: chal.purpose });
    return json(res, 400, { ok: false, error: 'verification_failed' });
  }
  const info = verification.registrationInfo;
  const standalone = body.standalone === true;
  const label = (typeof chal.meta.label === 'string' && chal.meta.label) || `کلید عبور — ${deviceLabel(userAgentOf(req), standalone)}`;
  const now = Date.now();
  await store.addCredential({
    id: info.credential.id,
    userId: cfg.ownerId,
    publicKey: b64(info.credential.publicKey),
    counter: info.credential.counter,
    transports: info.credential.transports ?? [],
    deviceType: info.credentialDeviceType,
    backedUp: info.credentialBackedUp,
    label,
    createdAt: now,
    lastUsedAt: now
  });
  await logEvent(store, req, cfg.ownerId, 'passkey_added', { mode: chal.purpose, synced: info.credentialBackedUp });
  if (chal.purpose !== 'add') {
    await issueSession(req, res, store, { userId: cfg.ownerId, credentialId: info.credential.id, standalone });
    await logEvent(store, req, cfg.ownerId, 'login', { via: chal.purpose });
  }
  json(res, 200, { ok: true });
}

/* ---------------- ورود / تأیید مجدد ---------------- */

async function loginOptions(req: IncomingMessage, res: Res, store: AuthStore, active: ActiveSession | null): Promise<void> {
  const cfg = getAuthConfig();
  const origin = allowedOrigin(req, cfg);
  if (!origin) return json(res, 403, { ok: false, error: 'origin' });
  if (await rateLimited(store, req)) return json(res, 429, { ok: false, error: 'too_many_attempts' });
  const body = await readBody(req);
  const stepUp = body.stepUp === true;
  if (stepUp && !active) return json(res, 401, { ok: false, error: 'unauthenticated' });
  const creds = await store.listCredentials(cfg.ownerId);
  if (creds.length === 0) return json(res, 409, { ok: false, error: 'no_passkeys' });
  const options = await generateAuthenticationOptions({
    rpID: rpIdOf(origin),
    userVerification: 'required',
    // ورود: passkey قابل‌کشف (بدون نام کاربری) · تأیید مجدد: فقط passkeyهای همین کاربر
    allowCredentials: stepUp ? creds.map((c) => ({ id: c.id, transports: c.transports })) : []
  });
  const id = randomToken(16);
  await store.putChallenge({
    id,
    challenge: options.challenge,
    purpose: stepUp ? 'stepup' : 'login',
    userId: cfg.ownerId,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
    meta: { origin, sessionId: active?.session.id ?? null }
  });
  setChallengeCookie(req, res, id);
  json(res, 200, { ok: true, options });
}

async function loginVerify(req: IncomingMessage, res: Res, store: AuthStore, active: ActiveSession | null): Promise<void> {
  const cfg = getAuthConfig();
  const origin = allowedOrigin(req, cfg);
  const chalId = challengeIdOf(req);
  clearChallengeCookie(req, res);
  if (!origin || !chalId) return json(res, 400, { ok: false, error: 'no_challenge' });
  const chal = await store.takeChallenge(chalId);
  if (!chal || chal.expiresAt < Date.now() || (chal.purpose !== 'login' && chal.purpose !== 'stepup') || chal.meta.origin !== origin) {
    return json(res, 400, { ok: false, error: 'challenge_expired' });
  }
  const body = await readBody(req);
  const response = body.response as AuthenticationResponseJSON | undefined;
  const cred = response && typeof response.id === 'string' ? await store.getCredential(response.id) : null;
  if (!cred || cred.userId !== cfg.ownerId) {
    await logEvent(store, req, cfg.ownerId, 'login_failed', { reason: 'unknown_credential' });
    return json(res, 400, { ok: false, error: 'verification_failed' });
  }
  let verified = false;
  let newCounter = cred.counter;
  try {
    const v = await verifyAuthenticationResponse({
      response: response!,
      expectedChallenge: chal.challenge,
      expectedOrigin: origin,
      expectedRPID: rpIdOf(origin),
      credential: { id: cred.id, publicKey: fromB64(cred.publicKey), counter: cred.counter, transports: cred.transports },
      requireUserVerification: true
    });
    verified = v.verified;
    newCounter = v.authenticationInfo.newCounter;
  } catch {
    verified = false;
  }
  if (!verified) {
    await logEvent(store, req, cfg.ownerId, 'login_failed', { reason: 'signature' });
    return json(res, 400, { ok: false, error: 'verification_failed' });
  }
  const now = Date.now();
  await store.touchCredential(cred.id, newCounter, now);

  if (chal.purpose === 'stepup') {
    if (!active || active.session.id !== chal.meta.sessionId) return json(res, 401, { ok: false, error: 'unauthenticated' });
    await store.markStepUp(active.session.id, now);
    await logEvent(store, req, cfg.ownerId, 'step_up', {});
    return json(res, 200, { ok: true, stepUp: true });
  }

  await issueSession(req, res, store, { userId: cfg.ownerId, credentialId: cred.id, standalone: body.standalone === true });
  await logEvent(store, req, cfg.ownerId, 'login', { via: 'passkey' });
  json(res, 200, { ok: true });
}

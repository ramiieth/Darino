// @vitest-environment node
/**
 * /api/auth + گارد نشست — امضای WebAuthn شبیه‌سازی می‌شود (کتابخانه mock)،
 * بقیهٔ منطق (کوکی، CSRF، challenge یک‌بارمصرف، step-up، لغو، کد اتصال، محدودیت نرخ) واقعی است.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const wa = vi.hoisted(() => ({
  regOk: true,
  authOk: true,
  credId: 'cred-A',
  counter: 1
}));

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn(async () => ({ challenge: `reg-${Math.random()}` })),
  generateAuthenticationOptions: vi.fn(async () => ({ challenge: `auth-${Math.random()}` })),
  verifyRegistrationResponse: vi.fn(async () =>
    wa.regOk
      ? {
          verified: true,
          registrationInfo: {
            credential: { id: wa.credId, publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ['internal'] },
            credentialDeviceType: 'multiDevice',
            credentialBackedUp: true
          }
        }
      : { verified: false }
  ),
  verifyAuthenticationResponse: vi.fn(async () => ({ verified: wa.authOk, authenticationInfo: { newCounter: wa.counter++ } }))
}));

vi.mock('../../api/_neon.js', async (orig) => {
  const actual = await orig<typeof import('../../api/_neon.js')>();
  return { ...actual, isDbConfigured: () => true, db: () => { throw new Error('db must not be called in tests'); } };
});

import handler from '../../api/auth';
import accountingHandler from '../../api/accounting';
import custodyHandler, { __setCustodyStoreForTests, memoryCustodyStore } from '../../api/custody';
import { __setAuthStoreForTests } from '../../api/_authCore';
import { memoryAuthStore } from '../../api/_authStore';

const ORIGIN = 'https://dariiino.vercel.app';
const TOKEN = 'test-setup-token-0123456789abcdef';

interface Resp {
  status: number;
  body: Record<string, unknown>;
  cookies: string[];
  headers: Record<string, unknown>;
}

/** «مرورگر» ساده با cookie jar */
class Browser {
  jar = new Map<string, string>();
  constructor(public origin = ORIGIN, public ip = '203.0.113.7') {}
  call(h: typeof handler, method: string, url: string, body?: unknown, extra: Record<string, string> = {}): Promise<Resp> {
    const buf = body ? Buffer.from(JSON.stringify(body)) : Buffer.alloc(0);
    const headers: Record<string, string> = {
      origin: this.origin,
      'x-forwarded-proto': 'https',
      'x-real-ip': this.ip,
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1',
      'x-darino-csrf': '1',
      cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '),
      ...extra
    };
    return new Promise((resolve) => {
      const req = {
        method,
        url,
        headers,
        on(ev: string, cb: (b?: Buffer) => void) {
          if (ev === 'data') cb(buf);
          else if (ev === 'end') cb();
        }
      };
      const hdrs: Record<string, unknown> = {};
      const res = {
        statusCode: 0,
        setHeader(k: string, v: unknown) {
          hdrs[k.toLowerCase()] = v;
        },
        getHeader(k: string) {
          return hdrs[k.toLowerCase()];
        },
        end: (b: string) => {
          const raw = hdrs['set-cookie'];
          const cookies = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(String);
          for (const c of cookies) {
            const [kv] = c.split(';');
            const i = kv.indexOf('=');
            const k = kv.slice(0, i);
            const v = kv.slice(i + 1);
            if (/Max-Age=0/.test(c) || v === '') this.jar.delete(k);
            else this.jar.set(k, v);
          }
          resolve({ status: res.statusCode, body: JSON.parse(b), cookies, headers: hdrs });
        }
      };
      void h(req as never, res as never);
    });
  }
  auth(method: string, op: string, body?: unknown, extra?: Record<string, string>) {
    return this.call(handler, method, `/api/auth?op=${op}`, body, extra);
  }
}

let store: ReturnType<typeof memoryAuthStore>;

async function setup(b: Browser) {
  const o = await b.auth('POST', 'register-options', { mode: 'setup', setupToken: TOKEN });
  expect(o.status).toBe(200);
  return b.auth('POST', 'register-verify', { response: { id: wa.credId } });
}

async function login(b: Browser, credId = 'cred-A') {
  await b.auth('POST', 'login-options', {});
  return b.auth('POST', 'login-verify', { response: { id: credId } });
}

beforeEach(() => {
  store = memoryAuthStore();
  __setAuthStoreForTests(store);
  __setCustodyStoreForTests(memoryCustodyStore());
  process.env.DARINO_SETUP_TOKEN = TOKEN;
  delete process.env.DARINO_ORIGINS;
  wa.regOk = true;
  wa.authOk = true;
  wa.credId = 'cred-A';
});
afterEach(() => {
  __setAuthStoreForTests(null);
  __setCustodyStoreForTests(null);
  delete process.env.DARINO_SETUP_TOKEN;
});

describe('راه‌اندازی و نشست', () => {
  it('بدون نشست: احراز نشده؛ راه‌اندازی فقط با توکن درست', async () => {
    const b = new Browser();
    const st = await b.auth('GET', 'status');
    expect(st.body).toMatchObject({ available: true, authenticated: false, hasPasskeys: false, setupAvailable: true });
    const bad = await b.auth('POST', 'register-options', { mode: 'setup', setupToken: 'wrong-token-wrong-token-xx' });
    expect(bad.status).toBe(403);
    expect(bad.body.error).toBe('bad_setup_token');
  });

  it('توکن کوتاه‌تر از ۲۴ نویسه راه‌اندازی را غیرفعال می‌کند', async () => {
    process.env.DARINO_SETUP_TOKEN = 'short';
    const b = new Browser();
    expect((await b.auth('GET', 'status')).body.setupAvailable).toBe(false);
    expect((await b.auth('POST', 'register-options', { mode: 'setup', setupToken: 'short' })).body.error).toBe('setup_disabled');
  });

  it('ثبت موفق: کوکی HttpOnly · Secure · SameSite=Strict با پیشوند __Host- و فقط هش در سرور', async () => {
    const b = new Browser();
    const r = await setup(b);
    expect(r.status).toBe(200);
    const sid = r.cookies.find((c) => c.startsWith('__Host-darino_sid='))!;
    expect(sid).toMatch(/HttpOnly/);
    expect(sid).toMatch(/Secure/);
    expect(sid).toMatch(/SameSite=Strict/);
    expect(sid).toMatch(/Path=\//);
    expect(sid).not.toMatch(/Domain=/);
    const token = b.jar.get('__Host-darino_sid')!;
    const dump = store._dump() as { sessions: { tokenHash: string }[] };
    expect(JSON.stringify(dump)).not.toContain(token);
    expect((await b.auth('GET', 'status')).body.authenticated).toBe(true);
    expect(r.headers['cache-control']).toMatch(/no-store/);
  });

  it('challenge یک‌بارمصرف است', async () => {
    const b = new Browser();
    await b.auth('POST', 'register-options', { mode: 'setup', setupToken: TOKEN });
    const chal = b.jar.get('__Host-darino_chal')!;
    expect((await b.auth('POST', 'register-verify', { response: {} })).status).toBe(200);
    b.jar.set('__Host-darino_chal', chal);
    expect((await b.auth('POST', 'register-verify', { response: {} })).body.error).toBe('challenge_expired');
  });

  it('امضای نامعتبر نشست نمی‌سازد', async () => {
    const b = new Browser();
    await setup(b);
    const other = new Browser();
    wa.authOk = false;
    const r = await login(other);
    expect(r.status).toBe(400);
    expect(other.jar.has('__Host-darino_sid')).toBe(false);
  });

  it('credential ناشناخته رد می‌شود', async () => {
    await setup(new Browser());
    const r = await login(new Browser(), 'cred-UNKNOWN');
    expect(r.body.error).toBe('verification_failed');
  });
});

describe('CSRF و مبدا', () => {
  it('POST بدون هدر CSRF یا از مبدا دیگر رد می‌شود', async () => {
    const b = new Browser();
    await setup(b);
    expect((await b.auth('POST', 'logout', {}, { 'x-darino-csrf': '' })).status).toBe(403);
    const evil = new Browser('https://evil.example');
    evil.jar = new Map(b.jar);
    expect((await evil.auth('POST', 'revoke-others', {})).status).toBe(403);
  });

  it('WebAuthn از مبدا غیرمجاز شروع نمی‌شود', async () => {
    const evil = new Browser('https://evil.example');
    expect((await evil.auth('POST', 'login-options', {}, { 'x-darino-csrf': '1' })).status).toBe(403);
  });
});

describe('مدیریت نشست‌ها و Passkeyها', () => {
  it('فهرست نشست‌ها هش توکن را برنمی‌گرداند؛ لغو نشست دیگر پس از step-up', async () => {
    const phone = new Browser();
    await setup(phone);
    const desktop = new Browser('https://dariiino.vercel.app', '198.51.100.9');
    await login(desktop);
    const list = await phone.auth('GET', 'sessions');
    const sessions = list.body.sessions as { id: string; current: boolean }[];
    expect(sessions).toHaveLength(2);
    expect(JSON.stringify(list.body)).not.toMatch(/tokenHash/);
    const desktopId = sessions.find((s) => !s.current)!.id;

    // step-up کهنه → 403
    const dump = store._dump() as { sessions: { id: string; stepUpAt: number }[] };
    const phoneSession = dump.sessions.find((s) => s.id !== desktopId)!;
    await store.markStepUp(phoneSession.id, Date.now() - 11 * 60_000);
    expect((await phone.auth('POST', 'revoke-session', { id: desktopId })).body.error).toBe('step_up_required');

    await phone.auth('POST', 'login-options', { stepUp: true });
    expect((await phone.auth('POST', 'login-verify', { response: { id: 'cred-A' } })).body.stepUp).toBe(true);
    expect((await phone.auth('POST', 'revoke-session', { id: desktopId })).status).toBe(200);

    // نشست لغوشده دیگر کار نمی‌کند
    expect((await desktop.auth('GET', 'sessions')).status).toBe(401);
    expect((await desktop.auth('GET', 'status')).body.authenticated).toBe(false);
  });

  it('خروج از همهٔ دستگاه‌های دیگر، نشست فعلی را نگه می‌دارد', async () => {
    const a = new Browser();
    await setup(a);
    const b = new Browser();
    await login(b);
    const c = new Browser();
    await login(c);
    const r = await a.auth('POST', 'revoke-others', {});
    expect(r.body.revoked).toBe(2);
    expect((await a.auth('GET', 'status')).body.authenticated).toBe(true);
    expect((await b.auth('GET', 'status')).body.authenticated).toBe(false);
  });

  it('آخرین Passkey حذف نمی‌شود؛ حذف Passkey نشست‌های آن را لغو می‌کند', async () => {
    const a = new Browser();
    await setup(a);
    expect((await a.auth('POST', 'delete-passkey', { id: 'cred-A' })).status).toBe(409);

    wa.credId = 'cred-B';
    await a.auth('POST', 'register-options', { mode: 'add' });
    expect((await a.auth('POST', 'register-verify', { response: {} })).status).toBe(200);
    const b = new Browser();
    await login(b, 'cred-B');
    expect((await a.auth('POST', 'delete-passkey', { id: 'cred-B' })).body.sessionsRevoked).toBe(1);
    expect((await b.auth('GET', 'status')).body.authenticated).toBe(false);
  });

  it('خروج: نشست لغو و کوکی پاک می‌شود', async () => {
    const a = new Browser();
    await setup(a);
    const r = await a.auth('POST', 'logout', {});
    expect(r.cookies.some((c) => c.startsWith('__Host-darino_sid=;') && /Max-Age=0/.test(c))).toBe(true);
    expect((await a.auth('GET', 'status')).body.authenticated).toBe(false);
  });
});

describe('کد اتصال دستگاه جدید', () => {
  it('یک‌بارمصرف است و دستگاه جدید را وارد می‌کند', async () => {
    const a = new Browser();
    await setup(a);
    const { code } = (await a.auth('POST', 'pair-code', {})).body as { code: string };
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    const fresh = new Browser();
    wa.credId = 'cred-NEW';
    expect((await fresh.auth('POST', 'register-options', { mode: 'pair', pairCode: `${code.slice(0, 4)}-${code.slice(4)}` })).status).toBe(200);
    expect((await fresh.auth('POST', 'register-verify', { response: {} })).status).toBe(200);
    expect((await fresh.auth('GET', 'status')).body.authenticated).toBe(true);
    const again = new Browser();
    expect((await again.auth('POST', 'register-options', { mode: 'pair', pairCode: code })).body.error).toBe('bad_pair_code');
  });
});

describe('محدودیت تلاش', () => {
  it('پس از ۲۰ تلاش ناموفق از یک IP → 429', async () => {
    const b = new Browser('https://dariiino.vercel.app', '192.0.2.50');
    for (let i = 0; i < 20; i++) await b.auth('POST', 'register-options', { mode: 'setup', setupToken: 'x'.repeat(30) });
    expect((await b.auth('POST', 'register-options', { mode: 'setup', setupToken: TOKEN })).status).toBe(429);
    // IP دیگر تحت‌تأثیر نیست
    expect((await new Browser().auth('POST', 'register-options', { mode: 'setup', setupToken: TOKEN })).status).toBe(200);
  });
});

describe('محافظت از APIهای شخصی', () => {
  it('حسابداری بدون نشست 401 می‌دهد و به پایگاه داده نمی‌رسد؛ هدر x-user-id بی‌اثر است', async () => {
    const anon = new Browser();
    const r = await anon.call(accountingHandler, 'GET', '/api/accounting', undefined, { 'x-user-id': 'local-user' });
    expect(r.status).toBe(401);
  });

  it('custody: بدون نشست 401؛ با نشست، نسخهٔ جدیدتر برنده و رکورد نامعتبر رد می‌شود', async () => {
    expect((await new Browser().call(custodyHandler, 'GET', '/api/custody')).status).toBe(401);
    const a = new Browser();
    await setup(a);
    const rec = (revision: number, updatedAt: number, label: string) => ({ collection: 'holdings', id: 'h1', revision, updatedAt, payload: { id: 'h1', label } });
    const p1 = await a.call(custodyHandler, 'POST', '/api/custody', { records: [rec(1, 100, 'A'), { collection: 'evil', id: 'x', revision: 1, updatedAt: 1, payload: {} }] });
    expect(p1.body).toMatchObject({ applied: ['holdings|h1'], invalid: 1 });
    const p2 = await a.call(custodyHandler, 'POST', '/api/custody', { records: [rec(1, 50, 'OLD')] });
    expect(p2.body.stale).toEqual(['holdings|h1']);
    await a.call(custodyHandler, 'POST', '/api/custody', { records: [rec(1, 200, 'B')] });
    const g = await a.call(custodyHandler, 'GET', '/api/custody');
    expect((g.body.records as { payload: { label: string } }[])[0].payload.label).toBe('B');
  });

  it('custody: POST بدون هدر CSRF رد می‌شود', async () => {
    const a = new Browser();
    await setup(a);
    expect((await a.call(custodyHandler, 'POST', '/api/custody', { records: [] }, { 'x-darino-csrf': '' })).status).toBe(403);
  });
});

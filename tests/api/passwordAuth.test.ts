// @vitest-environment node
/**
 * ورود با رمز عبور + کد ۶ رقمی Google Authenticator — جریان کامل روی /api/auth با store حافظه.
 * کدها با همان الگوریتم RFC 6238 ساخته می‌شوند (بردار رسمی RFC هم بررسی می‌شود).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_neon.js', async (orig) => {
  const actual = await orig<typeof import('../../api/_neon.js')>();
  return { ...actual, isDbConfigured: () => true, db: () => { throw new Error('db must not be called in tests'); } };
});

import handler from '../../api/auth';
import accountingHandler from '../../api/accounting';
import { __setAuthStoreForTests } from '../../api/_authCore';
import { memoryAuthStore } from '../../api/_authStore';
import { base32Encode, hashPassword, lockDurationMs, normalizePassword, totpAt, totpStep, verifyPassword, verifyTotp } from '../../api/_password';

const ORIGIN = 'https://dariiino.vercel.app';
const TOKEN = 'test-setup-token-0123456789abcdef';
const PASS = 'رمز-خیلی-امن-۱۴۰۵';

interface Resp { status: number; body: Record<string, unknown> }

class Browser {
  jar = new Map<string, string>();
  constructor(public ip = '203.0.113.9') {}
  call(h: typeof handler, method: string, url: string, body?: unknown): Promise<Resp> {
    const buf = body ? Buffer.from(JSON.stringify(body)) : Buffer.alloc(0);
    const headers: Record<string, string> = {
      origin: ORIGIN,
      'x-forwarded-proto': 'https',
      'x-real-ip': this.ip,
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130 Safari/537.36',
      'x-darino-csrf': '1',
      cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ')
    };
    return new Promise((resolve) => {
      const req = { method, url, headers, on(ev: string, cb: (b?: Buffer) => void) { if (ev === 'data') cb(buf); else if (ev === 'end') cb(); } };
      const hdrs: Record<string, unknown> = {};
      const res = {
        statusCode: 0,
        setHeader(k: string, v: unknown) { hdrs[k.toLowerCase()] = v; },
        getHeader(k: string) { return hdrs[k.toLowerCase()]; },
        end: (b: string) => {
          const raw = hdrs['set-cookie'];
          for (const c of (Array.isArray(raw) ? raw : raw ? [raw] : []).map(String)) {
            const [kv] = c.split(';');
            const i = kv.indexOf('=');
            const k = kv.slice(0, i);
            const v = kv.slice(i + 1);
            if (/Max-Age=0/.test(c) || v === '') this.jar.delete(k);
            else this.jar.set(k, v);
          }
          resolve({ status: res.statusCode, body: JSON.parse(b) });
        }
      };
      void h(req as never, res as never);
    });
  }
  auth(method: string, op: string, body?: unknown) {
    return this.call(handler, method, `/api/auth?op=${op}`, body);
  }
}

let store: ReturnType<typeof memoryAuthStore>;
const codeFor = (secret: string, offset = 0) => totpAt(secret, totpStep() + offset);

async function setupPassword(b: Browser, password = PASS) {
  const begin = await b.auth('POST', 'password-setup-begin', { setupToken: TOKEN, password });
  expect(begin.status).toBe(200);
  const secret = String(begin.body.secret);
  const fin = await b.auth('POST', 'password-setup-finish', { code: codeFor(secret) });
  expect(fin.status).toBe(200);
  return secret;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-02T10:00:10Z'));
  store = memoryAuthStore();
  __setAuthStoreForTests(store);
  process.env.DARINO_SETUP_TOKEN = TOKEN;
  delete process.env.DARINO_ORIGINS;
});
afterEach(() => {
  vi.useRealTimers();
  __setAuthStoreForTests(null);
  delete process.env.DARINO_SETUP_TOKEN;
});

describe('اجزای رمز و کد', () => {
  it('بردار رسمی RFC 6238 (SHA-1)', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    // T = 59s → 94287082 (۸ رقم) → ۶ رقم آخر
    expect(totpAt(secret, Math.floor(59 / 30))).toBe('287082');
    expect(totpAt(secret, Math.floor(1111111109 / 30))).toBe('081804');
  });

  it('هش scrypt: رمز درست قبول، اشتباه رد؛ ارقام فارسی و لاتین یکسان', async () => {
    const h = await hashPassword('abc-DEF-۱۲۳۴۵۶');
    expect(h.startsWith('scrypt$32768$8$1$')).toBe(true);
    expect(h).not.toContain('abc');
    expect(await verifyPassword('abc-DEF-123456', h)).toBe(true);
    expect(await verifyPassword('abc-DEF-123457', h)).toBe(false);
    expect(normalizePassword('٠١۲')).toBe('012');
  });

  it('کد تکراری (همان گام) رد می‌شود؛ ±۱ بازه پذیرفته', () => {
    const secret = base32Encode(Buffer.from('abcdefghijabcdefghij'));
    const now = Date.now();
    const step = totpStep(now);
    expect(verifyTotp(secret, totpAt(secret, step - 1), 0, now)).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step), step, now)).toBeNull();
    expect(verifyTotp(secret, totpAt(secret, step + 3), 0, now)).toBeNull();
    expect(verifyTotp(secret, '۱۲۳', 0, now)).toBeNull();
  });

  it('قفل پیش‌رونده', () => {
    expect(lockDurationMs(4)).toBe(0);
    expect(lockDurationMs(5)).toBe(60_000);
    expect(lockDurationMs(7)).toBe(240_000);
    expect(lockDurationMs(30)).toBe(3_600_000);
  });
});

describe('راه‌اندازی رمز', () => {
  it('بدون کد راه‌اندازی درست یا با رمز کوتاه رد می‌شود', async () => {
    const b = new Browser();
    expect((await b.auth('POST', 'password-setup-begin', { setupToken: 'wrong-token-xxxxxxxxxxxxxxxx', password: PASS })).status).toBe(403);
    const short = await b.auth('POST', 'password-setup-begin', { setupToken: TOKEN, password: 'کوتاه-۱۲' });
    expect(short.status).toBe(400);
    expect(short.body.error).toBe('password_too_short');
    delete process.env.DARINO_SETUP_TOKEN;
    expect((await b.auth('POST', 'password-setup-begin', { setupToken: TOKEN, password: PASS })).body.error).toBe('setup_disabled');
  });

  it('تا تأیید اولین کد، هیچ رمزی فعال نمی‌شود؛ کد اشتباه → دوباره قابل تلاش', async () => {
    const b = new Browser();
    const begin = await b.auth('POST', 'password-setup-begin', { setupToken: TOKEN, password: PASS });
    expect(String(begin.body.uri)).toMatch(/^otpauth:\/\/totp\/Darino\?secret=[A-Z2-7]+&issuer=Darino/);
    expect((await b.auth('GET', 'status')).body.hasPassword).toBe(false);
    expect((await b.auth('POST', 'password-setup-finish', { code: '000000' })).body.error).toBe('bad_code');
    const ok = await b.auth('POST', 'password-setup-finish', { code: codeFor(String(begin.body.secret)) });
    expect(ok.status).toBe(200);
    const st = await b.auth('GET', 'status');
    expect(st.body).toMatchObject({ authenticated: true, hasPassword: true });
    const saved = (store._dump() as { passwords: Array<{ hash: string }> }).passwords[0];
    expect(saved.hash).not.toContain('خیلی');
  });

  it('مهلت ۱۰ دقیقه برای اسکن QR', async () => {
    const b = new Browser();
    const begin = await b.auth('POST', 'password-setup-begin', { setupToken: TOKEN, password: PASS });
    vi.setSystemTime(Date.now() + 11 * 60_000);
    expect((await b.auth('POST', 'password-setup-finish', { code: codeFor(String(begin.body.secret)) })).body.error).toBe('challenge_expired');
  });
});

describe('ورود با رمز + کد', () => {
  it('دستگاه دوم با رمز و کد وارد می‌شود و به داده دسترسی دارد', async () => {
    const secret = await setupPassword(new Browser());
    vi.setSystemTime(Date.now() + 60_000);
    const phone = new Browser('198.51.100.4');
    expect((await phone.call(accountingHandler, 'GET', '/api/accounting')).status).toBe(401);
    const r = await phone.auth('POST', 'password-login', { password: PASS, code: codeFor(secret) });
    expect(r.status).toBe(200);
    expect((await phone.auth('GET', 'status')).body.authenticated).toBe(true);
  });

  it('رمز درست بدون کد، یا کد درست با رمز اشتباه → پاسخ یکسان', async () => {
    const secret = await setupPassword(new Browser());
    vi.setSystemTime(Date.now() + 60_000);
    const b = new Browser('198.51.100.5');
    const noCode = await b.auth('POST', 'password-login', { password: PASS });
    const wrongPass = await b.auth('POST', 'password-login', { password: 'رمز-اشتباه-۱۲۳۴۵', code: codeFor(secret) });
    expect(noCode).toEqual(wrongPass);
    expect(noCode.body.error).toBe('bad_credentials');
    expect((await b.auth('GET', 'status')).body.authenticated).toBe(false);
  });

  it('یک کد فقط یک‌بار: استفادهٔ دوباره از همان کد رد می‌شود', async () => {
    const secret = await setupPassword(new Browser());
    vi.setSystemTime(Date.now() + 60_000);
    const code = codeFor(secret);
    expect((await new Browser('198.51.100.6').auth('POST', 'password-login', { password: PASS, code })).status).toBe(200);
    expect((await new Browser('198.51.100.7').auth('POST', 'password-login', { password: PASS, code })).status).toBe(401);
  });

  it('۵ خطای پیاپی → قفل؛ حتی رمز و کد درست تا پایان قفل رد می‌شود', async () => {
    const secret = await setupPassword(new Browser());
    for (let i = 0; i < 5; i++) {
      await new Browser(`192.0.2.${i}`).auth('POST', 'password-login', { password: 'حدس-اشتباه-۱۲۳۴۵', code: '123456' });
    }
    vi.setSystemTime(Date.now() + 30_000);
    const locked = await new Browser('192.0.2.50').auth('POST', 'password-login', { password: PASS, code: codeFor(secret) });
    expect(locked.status).toBe(429);
    expect(locked.body.error).toBe('locked');
    vi.setSystemTime(Date.now() + 60_000);
    expect((await new Browser('192.0.2.51').auth('POST', 'password-login', { password: PASS, code: codeFor(secret) })).status).toBe(200);
  });
});

describe('پس از ورود', () => {
  it('تغییر رمز تأیید مجدد می‌خواهد و نشست‌های دیگر را لغو می‌کند', async () => {
    const mac = new Browser();
    const secret = await setupPassword(mac);
    vi.setSystemTime(Date.now() + 60_000);
    const phone = new Browser('198.51.100.8');
    await phone.auth('POST', 'password-login', { password: PASS, code: codeFor(secret) });

    vi.setSystemTime(Date.now() + 11 * 60_000); // پنجرهٔ تأیید مجدد گذشته
    expect((await mac.auth('POST', 'password-change', { newPassword: 'رمز-جدید-و-امن-۱۴۰۶' })).body.error).toBe('step_up_required');
    expect((await mac.auth('POST', 'password-stepup', { password: PASS, code: codeFor(secret) })).body.stepUp).toBe(true);
    const ch = await mac.auth('POST', 'password-change', { newPassword: 'رمز-جدید-و-امن-۱۴۰۶' });
    expect(ch.body).toMatchObject({ ok: true, sessionsRevoked: 1 });
    expect((await phone.auth('GET', 'status')).body.authenticated).toBe(false);

    vi.setSystemTime(Date.now() + 60_000);
    expect((await new Browser('198.51.100.9').auth('POST', 'password-login', { password: PASS, code: codeFor(secret) })).status).toBe(401);
    vi.setSystemTime(Date.now() + 60_000);
    expect((await new Browser('198.51.100.10').auth('POST', 'password-login', { password: 'رمز-جدید-و-امن-۱۴۰۶', code: codeFor(secret) })).status).toBe(200);
  });

  it('انتقال کد به گوشی جدید: کلید قدیم تا تأیید کد جدید معتبر می‌ماند', async () => {
    const mac = new Browser();
    const oldSecret = await setupPassword(mac);
    const begin = await mac.auth('POST', 'totp-begin', {});
    expect(begin.status).toBe(200);
    expect((await mac.auth('POST', 'totp-finish', { code: '000000' })).body.error).toBe('bad_code');
    // challenge یک‌بارمصرف است → باید دوباره شروع شود
    const again = await mac.auth('POST', 'totp-begin', {});
    vi.setSystemTime(Date.now() + 30_000);
    expect((await mac.auth('POST', 'totp-finish', { code: codeFor(String(again.body.secret)) })).status).toBe(200);
    vi.setSystemTime(Date.now() + 60_000);
    expect((await new Browser('198.51.100.11').auth('POST', 'password-login', { password: PASS, code: codeFor(oldSecret) })).status).toBe(401);
    vi.setSystemTime(Date.now() + 60_000);
    expect((await new Browser('198.51.100.12').auth('POST', 'password-login', { password: PASS, code: codeFor(String(again.body.secret)) })).status).toBe(200);
  });

  it('بازیابی با کد راه‌اندازی همهٔ نشست‌های قبلی را لغو می‌کند', async () => {
    const attacker = new Browser('203.0.113.66');
    await setupPassword(attacker);
    vi.setSystemTime(Date.now() + 60_000);
    const owner = new Browser();
    await setupPassword(owner, 'رمز-تازهٔ-صاحب-اپ-۱۴۰۵');
    expect((await attacker.auth('GET', 'status')).body.authenticated).toBe(false);
    expect((await owner.auth('GET', 'status')).body.authenticated).toBe(true);
  });

  it('با داشتن رمز، آخرین کلید عبور هم قابل حذف است (منطق سرور)', async () => {
    const mac = new Browser();
    await setupPassword(mac);
    expect((await mac.auth('POST', 'delete-passkey', { id: 'none' })).status).toBe(404);
  });
});

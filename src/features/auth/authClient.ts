/** ============================================================
 * کلاینت احراز هویت (کلید عبور، یا رمز عبور + کد ۶ رقمی Google Authenticator) — مرورگر
 *  • کلید خصوصی passkey هرگز از دستگاه خارج نمی‌شود (تراشهٔ امن دستگاه / جاکلیدی آی‌کلود)؛
 *    فقط امضای challenge به سرور می‌رود.
 *  • نشست فقط در کوکی HttpOnly است؛ جاوااسکریپت به توکن دسترسی ندارد.
 * ============================================================ */
import { create } from 'zustand';
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { UNAUTHENTICATED_EVENT } from '@/repositories/remoteClient';
import { isTestMode } from '@/lib/database/constants';

export class AuthError extends Error {
  constructor(public code: string, public status: number, public data: Record<string, unknown> = {}) {
    super(code);
    this.name = 'AuthError';
  }
}

async function call<T>(op: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  const res = await fetch(`/api/auth?op=${encodeURIComponent(op)}`, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { accept: 'application/json', 'x-darino-csrf': '1', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const d = (data ?? {}) as Record<string, unknown>;
    throw new AuthError(typeof d.error === 'string' ? d.error : `http_${res.status}`, res.status, d);
  }
  return data as T;
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export const webAuthnSupported = () => typeof window !== 'undefined' && browserSupportsWebAuthn();

/* ---------------- وضعیت ---------------- */

export type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated' | 'unavailable' | 'offline';

interface StatusResponse {
  available: boolean;
  authenticated: boolean;
  hasPasskeys?: boolean;
  hasPassword?: boolean;
  setupAvailable?: boolean;
  session: { id: string; label: string; createdAt: number; stepUpFresh: boolean } | null;
}

interface AuthState {
  status: AuthStatus;
  hasPasskeys: boolean;
  hasPassword: boolean;
  setupAvailable: boolean;
  session: StatusResponse['session'];
  refresh: () => Promise<void>;
  setUnauthenticated: () => void;
}

/** فقط یک نشانهٔ غیرحساس برای دسترسی آفلاین به دادهٔ محلی (نه توکن) */
const LAST_AUTH_KEY = 'darino.lastAuthOk';
const readLastAuth = () => {
  try {
    return localStorage.getItem(LAST_AUTH_KEY) === '1';
  } catch {
    return false;
  }
};
const writeLastAuth = (v: boolean) => {
  try {
    if (v) localStorage.setItem(LAST_AUTH_KEY, '1');
    else localStorage.removeItem(LAST_AUTH_KEY);
  } catch {
    /* خاموش */
  }
};

export const useAuth = create<AuthState>((set) => ({
  status: 'unknown',
  hasPasskeys: false,
  hasPassword: false,
  setupAvailable: false,
  session: null,
  refresh: async () => {
    if (isTestMode()) return;
    try {
      const s = await call<StatusResponse>('status', 'GET');
      if (!s.available) {
        set({ status: 'unavailable', session: null });
        return;
      }
      writeLastAuth(s.authenticated);
      set({
        status: s.authenticated ? 'authenticated' : 'unauthenticated',
        hasPasskeys: !!s.hasPasskeys,
        hasPassword: !!s.hasPassword,
        setupAvailable: !!s.setupAvailable,
        session: s.session
      });
    } catch (e) {
      // سرور در دسترس نیست (آفلاین): اگر آخرین بار وارد بودید، دادهٔ محلی با برچسب «آفلاین» قابل مشاهده است
      if (e instanceof AuthError && e.status < 500) set({ status: 'unauthenticated', session: null });
      else set({ status: readLastAuth() ? 'offline' : 'unauthenticated', session: null });
    }
  },
  setUnauthenticated: () => {
    writeLastAuth(false);
    set({ status: 'unauthenticated', session: null });
  }
}));

if (typeof window !== 'undefined') {
  window.addEventListener(UNAUTHENTICATED_EVENT, () => {
    if (useAuth.getState().status === 'authenticated') useAuth.getState().setUnauthenticated();
  });
}

/* ---------------- جریان‌ها ---------------- */

export async function loginWithPasskey(): Promise<void> {
  const { options } = await call<{ options: Parameters<typeof startAuthentication>[0]['optionsJSON'] }>('login-options', 'POST', {});
  const response = await startAuthentication({ optionsJSON: options });
  await call('login-verify', 'POST', { response, standalone: isStandalone() });
  await useAuth.getState().refresh();
}

/** تأیید مجدد فیس آیدی برای عملیات حساس */
export async function stepUp(): Promise<void> {
  const { options } = await call<{ options: Parameters<typeof startAuthentication>[0]['optionsJSON'] }>('login-options', 'POST', { stepUp: true });
  const response = await startAuthentication({ optionsJSON: options });
  await call('login-verify', 'POST', { response, standalone: isStandalone() });
}

export async function registerPasskey(p: { mode: 'setup'; setupToken: string; label?: string } | { mode: 'pair'; pairCode: string; label?: string } | { mode: 'add'; label?: string }): Promise<void> {
  const { options } = await call<{ options: Parameters<typeof startRegistration>[0]['optionsJSON'] }>('register-options', 'POST', p);
  const response = await startRegistration({ optionsJSON: options });
  await call('register-verify', 'POST', { response, standalone: isStandalone() });
  await useAuth.getState().refresh();
}

/* ---------------- رمز عبور + کد ۶ رقمی ---------------- */

export interface TotpSetup {
  secret: string;
  /** otpauth:// برای Google Authenticator */
  uri: string;
}

/** گام ۱ راه‌اندازی/بازیابی: هنوز چیزی فعال نمی‌شود */
export const passwordSetupBegin = (setupToken: string, password: string) =>
  call<TotpSetup>('password-setup-begin', 'POST', { setupToken, password });

/** گام ۲: اولین کد Google Authenticator → ذخیره و ورود */
export async function passwordSetupFinish(code: string): Promise<void> {
  await call('password-setup-finish', 'POST', { code, standalone: isStandalone() });
  await useAuth.getState().refresh();
}

export async function loginWithPassword(password: string, code: string): Promise<void> {
  await call('password-login', 'POST', { password, code, standalone: isStandalone() });
  await useAuth.getState().refresh();
}

export const passwordStepUp = (password: string, code: string) => call('password-stepup', 'POST', { password, code });

/** پنجرهٔ تأیید مجدد با رمز (کامپوننت PasswordStepUpDialog آن را نمایش می‌دهد) */
interface StepUpPromptState {
  open: boolean;
  resolve: (() => void) | null;
  reject: ((e: unknown) => void) | null;
}
export const useStepUpPrompt = create<StepUpPromptState>(() => ({ open: false, resolve: null, reject: null }));

function askPasswordStepUp(): Promise<void> {
  return new Promise((resolve, reject) => useStepUpPrompt.setState({ open: true, resolve, reject }));
}

/**
 * اجرای عملیات حساس؛ اگر سرور تأیید مجدد بخواهد: اول کلید عبور (اگر هست)،
 * وگرنه یا در صورت شکست، رمز + کد ۶ رقمی؛ سپس یک‌بار دوباره تلاش می‌کند.
 */
export async function withStepUp<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!(e instanceof AuthError && e.code === 'step_up_required')) throw e;
    const { hasPasskeys, hasPassword } = useAuth.getState();
    if (hasPasskeys && webAuthnSupported()) {
      try {
        await stepUp();
        return fn();
      } catch (err) {
        if (!hasPassword) throw err;
      }
    }
    if (hasPassword) {
      await askPasswordStepUp();
      return fn();
    }
    throw e;
  }
}

export interface SessionInfo {
  id: string;
  label: string;
  ip: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  revokedAt: number | null;
  current: boolean;
}
export interface PasskeyInfo {
  id: string;
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
  backedUp: boolean;
  deviceType: string;
  usedByThisSession: boolean;
}
export interface SecurityEvent {
  at: number;
  kind: string;
  ip: string;
  device: string;
  detail: Record<string, unknown>;
}

export const authApi = {
  sessions: () => call<{ sessions: SessionInfo[]; recentlyEnded: SessionInfo[] }>('sessions', 'GET'),
  revokeSession: (id: string) => withStepUp(() => call<{ ok: boolean }>('revoke-session', 'POST', { id })),
  revokeOthers: () => withStepUp(() => call<{ ok: boolean; revoked: number }>('revoke-others', 'POST', {})),
  passkeys: () => call<{ passkeys: PasskeyInfo[] }>('passkeys', 'GET'),
  renamePasskey: (id: string, label: string) => call<{ ok: boolean }>('rename-passkey', 'POST', { id, label }),
  deletePasskey: (id: string) => withStepUp(() => call<{ ok: boolean; sessionsRevoked: number }>('delete-passkey', 'POST', { id })),
  pairCode: () => withStepUp(() => call<{ code: string; expiresAt: number }>('pair-code', 'POST', {})),
  changePassword: (newPassword: string) => withStepUp(() => call<{ ok: boolean; sessionsRevoked: number }>('password-change', 'POST', { newPassword })),
  totpBegin: () => withStepUp(() => call<TotpSetup>('totp-begin', 'POST', {})),
  totpFinish: (code: string) => call<{ ok: boolean }>('totp-finish', 'POST', { code }),
  addPasskeyHere: (label?: string) => withStepUp(() => registerPasskey({ mode: 'add', label })),
  events: () => call<{ events: SecurityEvent[] }>('events', 'GET'),
  logoutServer: () => call<{ ok: boolean }>('logout', 'POST', {})
};

export const AUTH_ERROR_TEXT: Record<string, string> = {
  bad_setup_token: 'کد راه‌اندازی درست نیست',
  setup_disabled: 'راه‌اندازی غیرفعال است (DARINO_SETUP_TOKEN در ورسل تنظیم نشده)',
  bad_pair_code: 'کد اتصال نامعتبر، منقضی یا قبلاً استفاده شده است',
  too_many_attempts: 'تلاش ناموفق زیاد — ۱۵ دقیقهٔ دیگر دوباره امتحان کنید',
  verification_failed: 'تأیید کلید عبور ناموفق بود',
  challenge_expired: 'زمان تأیید تمام شد؛ دوباره تلاش کنید',
  no_passkeys: 'هنوز هیچ کلید عبور ثبت نشده — ابتدا راه‌اندازی کنید',
  origin: 'این دامنه برای ورود مجاز نیست (DARINO_ORIGINS)',
  last_passkey: 'آخرین کلید عبور قابل حذف نیست؛ ابتدا کلید عبور دیگری اضافه کنید یا رمز عبور تعیین کنید',
  bad_credentials: 'رمز عبور یا کد ۶ رقمی درست نیست',
  locked: 'به‌دلیل چند تلاش ناموفق، ورود موقتاً قفل است',
  bad_code: 'کد ۶ رقمی درست نیست — کد فعلی Google Authenticator را وارد کنید',
  password_too_short: 'رمز عبور باید حداقل ۱۲ نویسه باشد',
  password_too_long: 'رمز عبور خیلی طولانی است',
  no_password: 'رمز عبور هنوز تعیین نشده است',
  step_up_cancelled: 'تأیید لغو شد',
  auth_unavailable: 'سرور احراز هویت در دسترس نیست',
  unauthenticated: 'نشست منقضی شده؛ دوباره وارد شوید',
  step_up_required: 'تأیید مجدد لازم است'
};

export function authErrorText(e: unknown): string {
  if (e instanceof AuthError) {
    const base = AUTH_ERROR_TEXT[e.code] ?? `خطا (${e.code})`;
    const retryAt = Number(e.data.retryAt);
    if (Number.isFinite(retryAt) && retryAt > Date.now()) {
      return `${base} — دوباره از ساعت ${new Date(retryAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    return base;
  }
  if (e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return 'تأیید لغو شد یا زمانش تمام شد';
  if (e instanceof Error && e.name === 'InvalidStateError') return 'این دستگاه قبلاً کلید عبور دارینو دارد';
  return 'خطای ناشناخته';
}

/** ============================================================
 * رمز عبور و کد ۶ رقمی (TOTP) — فقط سمت سرور
 *
 *  • رمز هرگز ذخیره نمی‌شود؛ فقط هش scrypt با نمک تصادفی (N=2^15, r=8, p=1, ۶۴ بایت).
 *  • رمز پیش از هش یکسان‌سازی می‌شود (NFKC + ارقام فارسی/عربی → لاتین) تا روی کیبورد فارسی
 *    آیفون و مک یک رمز واحد باشد.
 *  • قفل پیش‌رونده: از ۵ تلاش ناموفق پیاپی، ۱، ۲، ۴ … دقیقه (سقف ۶۰ دقیقه).
 *  • کد ۶ رقمی (اجباری) طبق RFC 6238 (SHA-1، ۳۰ ثانیه، ۶ رقم، ±۱ بازه) — سازگار با Google Authenticator؛
 *    هر کد فقط یک‌بار پذیرفته می‌شود (lastStep).
 * ============================================================ */
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 200;
const SCRYPT = { N: 32768, r: 8, p: 1, keyLen: 64 };

function scrypt(password: string, salt: Buffer, keyLen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, keyLen, opts, (err, key) => (err ? reject(err) : resolve(key)))
  );
}

export function normalizePassword(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/** null = قابل‌قبول؛ وگرنه کد خطا */
export function passwordProblem(raw: unknown): 'password_too_short' | 'password_too_long' | null {
  if (typeof raw !== 'string') return 'password_too_short';
  const p = normalizePassword(raw);
  if ([...p].length < PASSWORD_MIN) return 'password_too_short';
  if (p.length > PASSWORD_MAX) return 'password_too_long';
  return null;
}

export async function hashPassword(raw: string): Promise<string> {
  const salt = randomBytes(16);
  const { N, r, p, keyLen } = SCRYPT;
  const key = await scrypt(normalizePassword(raw), salt, keyLen, { N, r, p, maxmem: 128 * N * r * 2 });
  return ['scrypt', N, r, p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(raw: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4], 'base64url');
  const expected = Buffer.from(parts[5], 'base64url');
  if (!N || !r || !p || expected.length === 0) return false;
  const key = await scrypt(normalizePassword(raw), salt, expected.length, { N, r, p, maxmem: 128 * N * r * 2 });
  return timingSafeEqual(key, expected);
}

/* ---------------- قفل پیش‌رونده ---------------- */

export const LOCK_AFTER = 5;
const LOCK_MAX_MS = 60 * 60_000;

/** مدت قفل پس از failCount تلاش ناموفق پیاپی (۰ = بدون قفل) */
export function lockDurationMs(failCount: number): number {
  if (failCount < LOCK_AFTER) return 0;
  return Math.min(60_000 * 2 ** (failCount - LOCK_AFTER), LOCK_MAX_MS);
}

/* ---------------- TOTP ---------------- */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_PERIOD_S = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(randomBytes(20));

export function totpAt(secret: string, step: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const bin = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

export const totpStep = (now = Date.now()) => Math.floor(now / 1000 / TOTP_PERIOD_S);

/** گام پذیرفته‌شده یا null؛ کدی با گام ≤ lastStep (تکراری) رد می‌شود */
export function verifyTotp(secret: string, rawCode: unknown, lastStep: number, now = Date.now()): number | null {
  if (typeof rawCode !== 'string') return null;
  const code = normalizePassword(rawCode).replace(/\D/g, '');
  if (code.length !== 6) return null;
  const cur = totpStep(now);
  for (const step of [cur - 1, cur, cur + 1]) {
    if (step <= lastStep) continue;
    const a = Buffer.from(totpAt(secret, step));
    if (timingSafeEqual(a, Buffer.from(code))) return step;
  }
  return null;
}

export function totpUri(secret: string): string {
  return `otpauth://totp/Darino?secret=${secret}&issuer=Darino&algorithm=SHA1&digits=6&period=${TOTP_PERIOD_S}`;
}

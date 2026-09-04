/** ============================================================
 * Neon Client — اتصال مرکزی سرور-سمت (فقط در Vercel Functions)
 *
 * ⚠️ این فایل هرگز از کد Client (src/) import نمی‌شود.
 * بنابراین DATABASE_URL هرگز وارد Client Bundle نمی‌شود.
 *
 * کاربر: تک‌کاربره با userId = 'local-user' (از هدر x-user-id یا پیش‌فرض).
 * برای Auth آینده: فقط کافی است userId واقعی جایگزین شود.
 * ============================================================ */
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL ?? '';

/** آیا DATABASE_URL در محیط سرور تنظیم شده است؟ */
export function isDbConfigured(): boolean {
  return typeof DATABASE_URL === 'string' && DATABASE_URL.trim().length > 0;
}

let sql: NeonQueryFunction<false, false> | null = null;

/** دریافت کوئری‌کننده Neon (lazy — فقط وقتی DATABASE_URL هست) */
export function db(): NeonQueryFunction<false, false> {
  if (!isDbConfigured()) {
    throw new Error('DATABASE_URL is not configured');
  }
  if (!sql) {
    // Connection از env خوانده می‌شود — هیچ Secret در کد نیست
    sql = neon(DATABASE_URL);
  }
  return sql;
}

/** userId مؤثر از هدر درخواست (پیش‌فرض تک‌کاربره) */
export function userIdOf(req: { headers?: Record<string, string | string[] | undefined> }): string {
  const h = req.headers?.['x-user-id'];
  const v = Array.isArray(h) ? h[0] : h;
  return typeof v === 'string' && v.trim() ? v.trim() : 'local-user';
}

/** پاسخ JSON یکسان برای همه endpointها */
export function json(res: { statusCode?: number; setHeader(k: string, v: string): void; end(b: string): void }, status: number, body: unknown): void {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

/** خواندن body به‌صورت JSON */
export function readBody(req: import('node:http').IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 5_000_000) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try {
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

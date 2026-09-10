/** ============================================================
 * Property Market — کاتالوگ اهواز و نرمال‌سازی محله‌ها
 *
 * ⚠️ هیچ «انتساب محله جعلی» وجود ندارد (§۳۰ مأموریت):
 *    فقط تطبیق قطعی (نرمال‌سازی ویرایشی + نام‌های مستعار مشخص).
 *    نام ناشناخته → همان نام خام به‌عنوان کلید/برچسب نگه داشته می‌شود.
 * ============================================================ */
import type { PropertyCity } from '../domain/types.js';

/** شهرهای پشتیبانی‌شده */
export const PROPERTY_CITIES: { id: PropertyCity; name: string; divarSlugHints: string[] }[] = [
  { id: 'ahvaz', name: 'اهواز', divarSlugHints: ['ahvaz', 'اهواز'] }
];

/** محله‌های مرجع اهواز — کلید پایدار + نام نمایشی + نام‌های مستعار دیوار */
export interface AhvazNeighborhoodDef {
  key: string;
  name: string;
  aliases: string[];
}

/**
 * فهرست محله‌های اهواز (نسخه قبلی دارینو + نام‌های رایج دیوار).
 * کلیدها پایدارند تا تاریخچه بین منابع مختلف قابل مقایسه بماند.
 */
export const AHVAZ_NEIGHBORHOODS: AhvazNeighborhoodDef[] = [
  { key: 'kianpars', name: 'کیانپارس', aliases: ['کیان پارس', 'کیان‌پارس', 'کیانپارس شرقی', 'کیان پارس شرقی', 'کیانپارس غربی', 'کیان پارس غربی'] },
  { key: 'kianabad', name: 'کیان‌آباد', aliases: ['کیان آباد', 'کیان‌آباد شرقی', 'کیان آباد شرقی', 'کیان‌آباد غربی', 'کیان آباد غربی'] },
  { key: 'zeytoon-karmandi', name: 'زیتون کارمندی', aliases: ['زیتون', 'زیتون کارمندی'] },
  { key: 'padad', name: 'پاداد', aliases: ['پادادشهر', 'پاداد شهر'] },
  { key: 'golestan', name: 'گلستان', aliases: ['گلستان'] },
  { key: 'saadi', name: 'سعدی', aliases: ['سعدی'] },
  { key: 'farhangshahr', name: 'فرهنگ شهر', aliases: ['فرهنگ‌شهر', 'فرهنگشهر'] },
  { key: 'bagh-sheikh', name: 'باغ شیخ', aliases: ['باغ‌شیخ', 'باغشیخ'] },
  { key: 'amanieh', name: 'امانیه', aliases: ['امانیه'] },
  { key: 'kourosh', name: 'کوروش', aliases: ['کوروش', 'کورش'] },
  { key: 'kompolo-north', name: 'کمپلو شمالی', aliases: ['کمپلو', 'کمپلوی شمالی', 'کمپلو جنوبی'] },
  { key: 'shahrak-daneshgah', name: 'شهرک دانشگاه', aliases: ['شهرک دانشگاه'] },
  { key: 'aryashahr', name: 'آریا شهر', aliases: ['آریاشهر', 'آریا‌شهر'] },
  { key: 'mehrshahr', name: 'مهر شهر', aliases: ['مهرشهر', 'مهر‌شهر'] },
  { key: 'lashkarabad', name: 'لشکرآباد', aliases: ['لشکر آباد', 'لشکراباد'] },
  { key: 'sepidar', name: 'سپیدار', aliases: ['سپیدار'] },
  { key: 'farvardin', name: 'فروردین', aliases: ['فروردین'] },
  { key: 'naderi', name: 'نادری', aliases: ['نادری'] },
  { key: 'abdollahi', name: 'عبداللهی', aliases: ['عبداللهی'] },
  { key: 'zende-roud', name: 'زنده‌رود', aliases: ['زنده رود', 'زندرود'] }
];

/** نرمال‌سازی متن فارسی برای مقایسه: ارقام/حروف عربی→فارسی، حذف فاصله‌ها و نیم‌فاصله‌ها */
export function normalizeFaText(input: string): string {
  return input
    .replace(/[يئ]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ة]/g, 'ه')
    .replace(/[\u200c\u200e\u200f\u202a-\u202e\u2060\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const norm = normalizeFaText;

/** نقشه معکوس: نام نرمال‌شده → کلید محله (ساخته‌شده از کاتالوگ) */
const ALIAS_INDEX: Map<string, AhvazNeighborhoodDef> = (() => {
  const map = new Map<string, AhvazNeighborhoodDef>();
  for (const def of AHVAZ_NEIGHBORHOODS) {
    map.set(norm(def.name), def);
    for (const a of def.aliases) map.set(norm(a), def);
  }
  return map;
})();

/** ساخت کلید پایدار از نام خام ناشناخته (بدون حدس — فقط مشتق‌سازی مکانیکی) */
export function keyFromUnknownName(raw: string): string {
  const n = norm(raw);
  return n ? `raw:${n}` : '';
}

/**
 * نگاشت نام محله دیوار → (کلید، نام نمایشی).
 * ناشناخته → کلید مکانیکی + همان نام خام (هرگز حدس زده نمی‌شود).
 */
export function resolveNeighborhood(
  rawName: string | null | undefined
): { key: string | null; displayName: string | null } {
  if (!rawName) return { key: null, displayName: null };
  const n = norm(rawName);
  if (!n) return { key: null, displayName: null };
  const hit = ALIAS_INDEX.get(n);
  if (hit) return { key: hit.key, displayName: hit.name };
  // پیشوند محله‌های ترکیبی (مثل «کیانپارس، بلوک ۳») — فقط اگر با کلمه کامل شروع شود
  for (const def of AHVAZ_NEIGHBORHOODS) {
    const base = norm(def.name);
    if (n.startsWith(base + '،') || n.startsWith(base + ',')) {
      return { key: def.key, displayName: def.name };
    }
  }
  const key = keyFromUnknownName(rawName);
  return { key: key || null, displayName: key ? rawName.trim() : null };
}

/** نام نمایشی برای کلید (کلیدهای خام → خود نام) */
export function neighborhoodDisplayName(key: string | null): string {
  if (!key) return 'نامشخص';
  if (key.startsWith('raw:')) return key.slice(4);
  const def = AHVAZ_NEIGHBORHOODS.find((d) => d.key === key);
  return def ? def.name : key;
}

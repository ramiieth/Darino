/** ============================================================
 * Property Market — کاتالوگ اهواز و نرمال‌سازی محله‌ها
 *
 * ⚠️ هیچ «انتساب محله جعلی» وجود ندارد (§۳۰ مأموریت):
 *    فقط تطبیق قطعی (نرمال‌سازی ویرایشی + نام‌های مستعار مشخص).
 *    نام ناشناخته → همان نام خام به‌عنوان کلید/برچسب نگه داشته می‌شود.
 * ============================================================ */
import type { PropertyCity } from '../domain/types.js';

/** شهرهای پشتیبانی‌شده */
export const PROPERTY_CITIES: {
  id: PropertyCity;
  name: string;
  divarSlugHints: string[];
  /** اسلاگ شهر در شیپور (/s/{slug}/…) */
  sheypoorSlug: string;
}[] = [
  { id: 'ahvaz', name: 'اهواز', divarSlugHints: ['ahvaz', 'اهواز'], sheypoorSlug: 'ahvaz' }
];

/** محله‌های مرجع اهواز — کلید پایدار + نام نمایشی + نام‌های مستعار دیوار */
export interface AhvazNeighborhoodDef {
  key: string;
  name: string;
  aliases: string[];
}

/**
 * محله‌های اهواز — سطح «محله» = یک district رسمی دیوار (۱۴۵ مورد) و هرگز
 * دو district رسمی متفاوت با هم ادغام نمی‌شوند. کلیدهای قدیمیِ ادغامی
 * (kianpars / kianabad / padad) حالا کلید «منطقه» (گروه) هستند تا تاریخچه
 * قبلی قابل مقایسه بماند. محله‌هایی که اینجا نیستند با کلید مکانیکی raw: می‌آیند.
 */
export const AHVAZ_NEIGHBORHOODS: AhvazNeighborhoodDef[] = [
  // کیانپارس — دیوار شرقی/غربی را جدا نمی‌کند؛ از متن صریح عنوان تفکیک می‌شود
  { key: 'kianpars-east', name: 'کیانپارس شرقی', aliases: ['کیان پارس شرقی', 'کیان‌پارس شرقی'] },
  { key: 'kianpars-west', name: 'کیانپارس غربی', aliases: ['کیان پارس غربی', 'کیان‌پارس غربی'] },
  { key: 'kianpars-other', name: 'کیانپارس (شرق/غرب نامشخص)', aliases: ['کیانپارس', 'کیان پارس', 'کیان‌پارس'] },
  { key: 'kianabad-east', name: 'کیان‌آباد شرقی', aliases: ['کیان آباد شرقی', 'کیان اباد شرقی', 'کیاناباد شرقی'] },
  { key: 'kianabad-west', name: 'کیان‌آباد غربی', aliases: ['کیان آباد غربی', 'کیان اباد غربی', 'کیاناباد غربی'] },
  { key: 'kianabad-other', name: 'کیان‌آباد (شرق/غرب نامشخص)', aliases: ['کیان‌آباد', 'کیان آباد', 'کیان اباد', 'کیاناباد'] },
  { key: 'zeytoon-karmandi', name: 'زیتون کارمندی', aliases: ['زیتون کارمندی'] },
  { key: 'zeytoon-kargari', name: 'زیتون کارگری', aliases: ['زیتون کارگری'] },
  { key: 'padad-main', name: 'پادادشهر', aliases: ['پادادشهر', 'پاداد شهر', 'پاداد'] },
  { key: 'padad-f1', name: 'فاز ۱ پادادشهر', aliases: ['فاز ۱ پادادشهر', 'فاز یک پاداد', 'فاز ۱ پاداد', 'فاز یک پادادشهر'] },
  { key: 'padad-f2', name: 'فاز ۲ پادادشهر', aliases: ['فاز ۲ پادادشهر', 'فاز دو پاداد', 'فاز ۲ پاداد', 'فاز دو پادادشهر'] },
  { key: 'padad-f3', name: 'فاز ۳ پادادشهر', aliases: ['فاز ۳ پادادشهر', 'فاز سه پاداد', 'فاز ۳ پاداد'] },
  { key: 'padad-f5', name: 'فاز ۵ پاداد', aliases: ['فاز ۵ پاداد', 'فاز ۵ پادادشهر', 'فاز پنج پاداد'] },
  { key: 'kompolo-north', name: 'کمپلو شمالی', aliases: ['کمپلو شمالی', 'کمپلوی شمالی'] },
  { key: 'kompolo-south', name: 'کمپلو جنوبی', aliases: ['کمپلو جنوبی', 'کمپلوی جنوبی'] },
  { key: 'golestan', name: 'گلستان', aliases: ['گلستان'] },
  { key: 'saadi', name: 'سعدی', aliases: ['سعدی', 'کوی سعدی'] },
  { key: 'farhangshahr', name: 'فرهنگ شهر', aliases: ['فرهنگ‌شهر', 'فرهنگشهر'] },
  { key: 'bagh-sheikh', name: 'باغ شیخ', aliases: ['باغ‌شیخ', 'باغشیخ'] },
  { key: 'amanieh', name: 'امانیه', aliases: ['امانیه'] },
  { key: 'kourosh', name: 'کوروش', aliases: ['کوروش', 'کورش'] },
  { key: 'shahrak-daneshgah', name: 'شهرک دانشگاه', aliases: ['شهرک دانشگاه'] },
  { key: 'aryashahr', name: 'آریا شهر', aliases: ['آریاشهر', 'آریا‌شهر'] },
  { key: 'mehrshahr', name: 'مهر شهر', aliases: ['مهرشهر', 'مهر‌شهر'] },
  { key: 'lashkarabad', name: 'لشکرآباد', aliases: ['لشکر آباد', 'لشکراباد'] },
  { key: 'sepidar', name: 'سپیدار', aliases: ['سپیدار'] },
  { key: 'farvardin', name: 'فروردین', aliases: ['فروردین'] },
  { key: 'naderi', name: 'نادری', aliases: ['نادری'] },
  { key: 'abdollahi', name: 'عبداللهی', aliases: ['عبداللهی'] },
  { key: 'zende-roud', name: 'زنده‌رود', aliases: ['زنده رود', 'زندرود'] },
  { key: 'goldasht', name: 'گلدشت', aliases: ['گلدشت', 'کوی گلدشت'] }
];

/* ---------------- منطقه (گروه چند محله) ---------------- */

export interface AhvazAreaGroupDef {
  key: string;
  name: string;
  /** کلید محله‌های عضو */
  members: string[];
  /** محله‌های raw: که نامشان با این الگو می‌خواند (district رسمی هم‌نام) */
  rawPattern?: RegExp;
}

/**
 * منطقه = محله‌های رسمیِ هم‌نام (شرقی/غربی، فازها، کارمندی/کارگری…).
 * فقط بر اساس نام رسمی — بدون حدس جغرافیایی.
 */
export const AHVAZ_AREA_GROUPS: AhvazAreaGroupDef[] = [
  { key: 'kianpars', name: 'کیانپارس', members: ['kianpars-east', 'kianpars-west', 'kianpars-other'] },
  { key: 'kianabad', name: 'کیان‌آباد', members: ['kianabad-east', 'kianabad-west', 'kianabad-other'] },
  { key: 'padad', name: 'پادادشهر', members: ['padad-main', 'padad-f1', 'padad-f2', 'padad-f3', 'padad-f5'] },
  { key: 'zeytoon', name: 'زیتون', members: ['zeytoon-karmandi', 'zeytoon-kargari'] },
  { key: 'kompolo', name: 'کمپلو', members: ['kompolo-north', 'kompolo-south'] },
  { key: 'eslamabad', name: 'اسلام‌آباد', members: [], rawPattern: /^raw:اسلام ?آباد (شرقی|غربی)$/ },
  { key: 'pardis', name: 'پردیس', members: [], rawPattern: /^raw:پردیس( دو| ۲)?$/ },
  { key: 'chonaibeh', name: 'چنیبه', members: [], rawPattern: /^raw:چنیبه (علیا|پایین|سفلی)$/ },
  { key: 'farhangian', name: 'کوی فرهنگیان', members: [], rawPattern: /^raw:کوی فرهنگیان ?[۱۲12]?$/ },
  { key: 'serah-khorramshahr', name: 'سه‌راه خرمشهر', members: [], rawPattern: /^raw:.+\(سه ?راه خرمشهر\)$/ }
];

/** کلید «منطقه» یک محله (یا null اگر عضو هیچ منطقه‌ای نیست) */
export function areaGroupOf(neighborhoodKey: string | null): string | null {
  if (!neighborhoodKey) return null;
  for (const g of AHVAZ_AREA_GROUPS) {
    if (g.members.includes(neighborhoodKey)) return g.key;
    if (g.rawPattern && g.rawPattern.test(neighborhoodKey)) return g.key;
  }
  return null;
}

export function areaGroupName(groupKey: string): string {
  return AHVAZ_AREA_GROUPS.find((g) => g.key === groupKey)?.name ?? groupKey;
}

/** کلید محله‌هایی که شرقی/غربی را فقط از متن صریح عنوان می‌گیرند */
const EAST_WEST_FROM_TITLE: Record<string, { east: string; west: string }> = {
  'kianpars-other': { east: 'kianpars-east', west: 'kianpars-west' },
  'kianabad-other': { east: 'kianabad-east', west: 'kianabad-west' }
};

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
  rawName: string | null | undefined,
  /** عنوان آگهی — فقط برای تفکیک صریح شرقی/غربی کیانپارس/کیان‌آباد */
  title?: string | null
): { key: string | null; displayName: string | null } {
  const base = resolveNeighborhoodBase(rawName);
  const ew = base.key ? EAST_WEST_FROM_TITLE[base.key] : undefined;
  if (ew && title) {
    const t = norm(title);
    const east = t.includes('شرقی');
    const west = t.includes('غربی');
    // فقط اگر دقیقاً یکی از دو جهت صریحاً آمده باشد (هر دو/هیچ → نامشخص)
    if (east !== west) {
      const key = east ? ew.east : ew.west;
      return { key, displayName: neighborhoodDisplayName(key) };
    }
  }
  return base;
}

function resolveNeighborhoodBase(
  rawName: string | null | undefined
): { key: string | null; displayName: string | null } {
  if (!rawName) return { key: null, displayName: null };
  // شیپور گاهی نام شهر را به محله می‌چسباند («شهرک رزمندگان اهواز») — حذف مکانیکی
  const stripped = norm(rawName).replace(/\s+اهواز$/, '');
  const n = stripped;
  if (!n) return { key: null, displayName: null };
  const hit = ALIAS_INDEX.get(n);
  if (hit) return { key: hit.key, displayName: hit.name };
  // پیشوند محله‌های ترکیبی (مثل «کیانپارس، بلوک ۳») — فقط اگر با کلمه کامل شروع شود
  for (const def of AHVAZ_NEIGHBORHOODS) {
    for (const base of [def.name, ...def.aliases].map(norm)) {
      if (n.startsWith(base + '،') || n.startsWith(base + ',')) {
        return { key: def.key, displayName: def.name };
      }
    }
  }
  const key = keyFromUnknownName(n);
  return { key: key || null, displayName: key ? rawName.trim().replace(/\s+اهواز$/, '') : null };
}

/** نام نمایشی برای کلید (کلیدهای خام → خود نام) */
export function neighborhoodDisplayName(key: string | null): string {
  if (!key) return 'نامشخص';
  if (key.startsWith('raw:')) return key.slice(4);
  const def = AHVAZ_NEIGHBORHOODS.find((d) => d.key === key);
  if (def) return def.name;
  // کلید منطقه (گروه) — شامل کلیدهای ادغامی نسخه قبل (kianpars، kianabad، padad…)
  const g = AHVAZ_AREA_GROUPS.find((x) => x.key === key);
  return g ? g.name : key;
}

/**
 * نشانه‌های قطعی «ملک در شهر دیگر» — آژانس‌های تهران/کرج گاهی آگهی را در
 * دسته اهواز ثبت می‌کنند (مشاهده‌شده روی داده زنده شیپور: پونک، همیلا، جنت‌آباد).
 * فقط نام‌هایی که در اهواز محله‌ای هم‌نام ندارند (بدون حدس).
 */
const OTHER_CITY_MARKERS = [
  // ⚠️ «صادقیه»، «اندیشه»، «اکباتان»، «پردیس»، «رسالت» در اهواز هم محله رسمی دارند
  //    (فهرست ۱۴۵ district دیوار) → عمداً در فهرست نیستند
  'تهران', 'کرج', 'پونک', 'همیلا', 'جنت آباد', 'جنتآباد', 'سعادت آباد', 'سعادتآباد', 'شهرک غرب',
  'ونک', 'پاسداران', 'نیاوران', 'چیتگر', 'ستارخان',
  'شهریار', 'پرند', 'هشتگرد', 'گوهردشت', 'عظیمیه'
];

/** اولین نشانه شهر دیگر در متن (یا null) */
export function otherCityMarker(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = normalizeFaText(text);
  for (const m of OTHER_CITY_MARKERS) {
    if (t.includes(m)) return m;
  }
  return null;
}

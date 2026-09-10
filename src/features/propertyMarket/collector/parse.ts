/** ============================================================
 * Property Market — پارسر پاسخ‌های دیوار (دفاعی)
 *
 * مرجع فنی: `mobin-torabi/divar-house-scraper`
 *  - widgetهای فهرست: list_widgets[widget_type=POST_ROW].data.action.payload
 *  - widgetهای جزئیات: GROUP_INFO_ROW / UNEXPANDABLE_ROW /
 *    FEATURE_ROW / GROUP_FEATURE_ROW / BREADCRUMB
 *  - ارقام فارسی/عربی → لاتین؛ قیمت کل/هر متر از جدول مشخصات.
 * ⚠️ ساختار دیوار ممکن است تغییر کند — هیچ دسترسی عمیق بدون گارد نیست.
 * ============================================================ */
import type { PropertyKind } from '../domain/types.js';
import { DIVAR_POST_PAGE_URL } from './endpoints.js';

/* ---------------- ابزار اعداد/متن ---------------- */

const FA_DIGITS: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
};

/** تبدیل ارقام فارسی/عربی به لاتین */
export function faToEnDigits(s: unknown): string {
  if (typeof s !== 'string') return s === null || s === undefined ? '' : String(s);
  return s.replace(/[۰-۹٠-٩]/g, (d) => FA_DIGITS[d] ?? d);
}

/** استخراج عدد صحیح از متن (ارقام فارسی/کاما/واحد حذف می‌شوند) */
export function parseIntLoose(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const digits = faToEnDigits(String(v)).replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/** حذف کاراکترهای نامرئی/جهتی و فشرده‌سازی فاصله‌ها */
export function cleanText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v
    .replace(/[\u200c\u200e\u200f\u202a-\u202e\u2060\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > 0 ? s : null;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/* ---------------- نگاشت مشخصات (مطابق مرجع) ---------------- */

type SpecKind = 'int' | 'price' | 'rooms' | 'floor' | 'text';
const KNOWN_SPECS: Record<string, { header: string; kind: SpecKind }> = {
  'متراژ': { header: 'areaSqm', kind: 'int' },
  'ساخت': { header: 'yearBuilt', kind: 'int' },
  'اتاق': { header: 'rooms', kind: 'rooms' },
  'اتاق‌ها': { header: 'rooms', kind: 'rooms' },
  'قیمت کل': { header: 'totalPriceToman', kind: 'price' },
  'قیمت ملک': { header: 'totalPriceToman', kind: 'price' },
  'قیمت هر متر': { header: 'pricePerSqmToman', kind: 'price' },
  'طبقه': { header: 'floor', kind: 'floor' }
};

const FEATURE_ICONS: Record<string, 'parking' | 'elevator' | 'storage' | 'balcony'> = {
  PARKING: 'parking',
  ELEVATOR: 'elevator',
  CABINET: 'storage',
  BALCONY: 'balcony'
};

const NEG_SUFFIXES = ['ندارد', 'نیست'];
const CATEGORY_KIND: Record<string, PropertyKind> = {
  'apartment-sell': 'apartment',
  'house-villa-sell': 'villa-house'
};

function yesNoFromTitle(title: string): boolean {
  return !NEG_SUFFIXES.some((w) => title.endsWith(w));
}

/* ---------------- ساختار مشترک خروجی پارس ---------------- */

export interface ParsedListingSeed {
  token: string;
  title: string | null;
  neighborhood: string | null;
  propertyKind: PropertyKind;
  areaSqm: number | null;
  rooms: number | null;
  yearBuilt: number | null;
  floor: number | null;
  totalPriceToman: number | null;
  pricePerSqmToman: number | null;
  parking: boolean | null;
  elevator: boolean | null;
  storage: boolean | null;
  balcony: boolean | null;
  listedAt: number | null;
  url: string;
}

export function emptySeed(token: string): ParsedListingSeed {
  return {
    token,
    title: null,
    neighborhood: null,
    propertyKind: 'unknown',
    areaSqm: null,
    rooms: null,
    yearBuilt: null,
    floor: null,
    totalPriceToman: null,
    pricePerSqmToman: null,
    parking: null,
    elevator: null,
    storage: null,
    balcony: null,
    listedAt: null,
    url: DIVAR_POST_PAGE_URL(token)
  };
}

/** آیا فیلد هنوز مقدار نگرفته؟ */
function missing(v: unknown): boolean {
  return v === null || v === undefined;
}

/** اعمال یک جفت (عنوان مشخصه، مقدار) روی seed — فقط اگر فیلد خالی باشد */
export function applySpec(seed: ParsedListingSeed, faTitle: string, raw: unknown): void {
  const spec = KNOWN_SPECS[faTitle];
  if (!spec) return;
  switch (spec.header) {
    case 'areaSqm': {
      if (missing(seed.areaSqm)) seed.areaSqm = parseIntLoose(raw);
      return;
    }
    case 'yearBuilt': {
      if (missing(seed.yearBuilt)) seed.yearBuilt = parseIntLoose(raw);
      return;
    }
    case 'rooms': {
      if (missing(seed.rooms)) {
        const n = parseIntLoose(raw);
        seed.rooms = n ?? (typeof raw === 'string' && /بدون|استودیو/.test(raw) ? 0 : null);
      }
      return;
    }
    case 'totalPriceToman': {
      if (missing(seed.totalPriceToman)) seed.totalPriceToman = parseIntLoose(raw);
      return;
    }
    case 'pricePerSqmToman': {
      if (missing(seed.pricePerSqmToman)) seed.pricePerSqmToman = parseIntLoose(raw);
      return;
    }
    case 'floor': {
      if (missing(seed.floor)) {
        // «۳ از ۵» → طبقه ۳
        const nums = faToEnDigits(String(raw ?? '')).match(/\d+/g);
        seed.floor = nums && nums.length > 0 ? Number(nums[0]) : null;
      }
      return;
    }
  }
}

/* ---------------- پارس صفحه فهرست ---------------- */

/**
 * استخراج آگهی‌ها از پاسخ `postlist`.
 * برای هر POST_ROW: توکن + عنوان + محله از `web_info`؛ قیمت/متراژ اگر در
 * خود ردیف موجود باشد گرفته می‌شود (در غیر این صورت نیاز به جزئیات دارد).
 */
export function parseListPage(
  page: unknown,
  category: string = 'apartment-sell'
): { seeds: Map<string, ParsedListingSeed>; pagination: { hasNext: boolean; data: unknown } } {
  const seeds = new Map<string, ParsedListingSeed>();
  let hasNext = false;
  let cursor: unknown = null;

  if (!isObj(page)) return { seeds, pagination: { hasNext, data: cursor } };
  const widgets = Array.isArray(page.list_widgets) ? page.list_widgets : [];
  for (const w of widgets) {
    if (!isObj(w) || w.widget_type !== 'POST_ROW') continue;
    const data = isObj(w.data) ? w.data : {};
    const payload = isObj(data.action) && isObj(data.action.payload)
      ? (data.action.payload as Record<string, unknown>)
      : isObj(data.payload)
        ? (data.payload as Record<string, unknown>)
        : {};
    const token = str(payload.token);
    if (!token) continue;
    if (seeds.has(token)) continue; // تکراری در همان صفحه

    const wi = isObj(payload.web_info) ? payload.web_info : {};
    const seed = emptySeed(token);
    seed.title = cleanText(wi.title);
    seed.neighborhood = cleanText(wi.district_persian ?? wi.district);
    seed.propertyKind = CATEGORY_KIND[category] ?? 'unknown';

    // قیمت/متراژ فرصت‌طلبانه از خود ردیف (اگر دیوار ارائه دهد)
    const price = parseIntLoose((payload as Record<string, unknown>).price ?? (data as Record<string, unknown>).price);
    if (price !== null) seed.totalPriceToman = price;
    const size = parseIntLoose((wi as Record<string, unknown>).size ?? (payload as Record<string, unknown>).size);
    if (size !== null) seed.areaSqm = size;
    // برخی نسخه‌ها قیمت هر متر را مستقیم دارند
    const ppm = parseIntLoose(
      (payload as Record<string, unknown>).price_per_square ?? (data as Record<string, unknown>).price_per_square
    );
    if (ppm !== null) seed.pricePerSqmToman = ppm;

    seeds.set(token, seed);
  }

  if (isObj(page.pagination)) {
    hasNext = page.pagination.has_next_page === true;
    cursor = page.pagination.data ?? null;
  }
  return { seeds, pagination: { hasNext, data: cursor } };
}

/* ---------------- پارس جزئیات آگهی ---------------- */

/** پیدا کردن مودال «ویژگی‌ها و امکانات» (بازگشتی — مطابق مرجع) */
export function findFeatureModal(obj: unknown): unknown[] | null {
  if (isObj(obj)) {
    const mp = obj.modal_page;
    if (isObj(mp) && mp.title === 'ویژگی‌ها و امکانات' && Array.isArray(mp.widget_list)) {
      return mp.widget_list;
    }
    for (const v of Object.values(obj)) {
      const found = findFeatureModal(v);
      if (found) return found;
    }
  } else if (Array.isArray(obj)) {
    for (const v of obj) {
      const found = findFeatureModal(v);
      if (found) return found;
    }
  }
  return null;
}

/** جمع‌آوری همه widgetهای صفحه جزئیات + مودال ویژگی‌ها */
export function collectDetailWidgets(detail: Record<string, unknown>): Record<string, unknown>[] {
  const widgets: Record<string, unknown>[] = [];
  const sections = Array.isArray(detail.sections) ? detail.sections : [];
  for (const s of sections) {
    if (isObj(s) && Array.isArray(s.widgets)) {
      for (const w of s.widgets) if (isObj(w)) widgets.push(w);
    }
  }
  const modal = findFeatureModal(detail);
  if (modal) for (const w of modal) if (isObj(w)) widgets.push(w);
  return widgets;
}

/**
 * پارس صفحه جزئیات و تکمیل seed (فقط فیلدهای خالی پر می‌شوند —
 * داده فهرست مقدم است).
 */
export function parseIntoSeed(seed: ParsedListingSeed, detail: Record<string, unknown>): ParsedListingSeed {
  for (const w of collectDetailWidgets(detail)) {
    const wt = typeof w.widget_type === 'string' ? w.widget_type : '';
    const d = isObj(w.data) ? w.data : {};

    if (wt === 'GROUP_INFO_ROW') {
      const items = Array.isArray(d.items) ? d.items : [];
      for (const it of items) {
        if (!isObj(it)) continue;
        const t = cleanText(it.title);
        if (t) applySpec(seed, t, it.value);
      }
    } else if (wt === 'UNEXPANDABLE_ROW') {
      const t = cleanText(d.title);
      if (t) applySpec(seed, t, d.value);
    } else if (wt === 'FEATURE_ROW' || wt === 'GROUP_FEATURE_ROW') {
      const items = wt === 'GROUP_FEATURE_ROW'
        ? (Array.isArray(d.items) ? d.items : [])
        : [d];
      for (const it of items) {
        if (!isObj(it)) continue;
        const icon = isObj(it.icon) ? str(it.icon.icon_name) : null;
        const title = cleanText(it.title);
        if (!icon || !title) continue;
        const field = FEATURE_ICONS[icon];
        if (field && seed[field] === null) seed[field] = yesNoFromTitle(title);
      }
    } else if (wt === 'BREADCRUMB') {
      // تشخیص نوع ملک از آخرین آیتم مسیر (مطابق مرجع)
      const items = Array.isArray(d.parent_items) ? d.parent_items : [];
      if (items.length > 0 && seed.propertyKind === 'unknown') {
        const last = items[items.length - 1];
        if (isObj(last)) {
          const action = isObj(last.action) ? last.action : {};
          const payload = isObj(action.payload) ? action.payload : {};
          const sd = isObj(payload.search_data) ? payload.search_data : {};
          const fd = isObj(sd.form_data) ? sd.form_data : {};
          const dd = isObj(fd.data) ? fd.data : {};
          const cat = isObj(dd.category) && isObj(dd.category.str) ? str(dd.category.str.value) : null;
          if (cat && CATEGORY_KIND[cat]) seed.propertyKind = CATEGORY_KIND[cat];
        }
      }
    } else if (wt === 'DESCRIPTION_ROW' && seed.listedAt === null) {
      // زمان ثبت اگر دیوار در جزئیات ارائه کند (اختیاری)
      const ts = parseIntLoose(d.date ?? d.created_at);
      if (ts !== null) seed.listedAt = ts;
    }
  }

  // زمان ثبت در ریشه پاسخ (برخی نسخه‌ها)
  if (seed.listedAt === null) {
    const rootTs = parseIntLoose(detail.created_at ?? detail.listed_at);
    if (rootTs !== null) seed.listedAt = rootTs;
  }

  return seed;
}

/**
 * قیمت هر مترمربع — استخراج مستقیم، و در نبود آن محاسبه قیمت‌کل÷متراژ
 * (مطابق مرجع). بدون داده کافی → null (هرگز حدس).
 */
export function derivePricePerSqm(seed: ParsedListingSeed): number | null {
  if (seed.pricePerSqmToman !== null && seed.pricePerSqmToman > 0) return seed.pricePerSqmToman;
  if (
    seed.totalPriceToman !== null && seed.totalPriceToman > 0 &&
    seed.areaSqm !== null && seed.areaSqm > 0
  ) {
    return Math.round(seed.totalPriceToman / seed.areaSqm);
  }
  return null;
}

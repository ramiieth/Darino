/** ============================================================
 * خودروهای اروند — پارسر آگهی خودرو دیوار + تشخیص نوع پلاک از متن
 *
 *  فهرست:  POST /v8/postlist/w/search  (category=light + query)
 *  جزئیات: GET  /v8/posts-v2/web/{token}
 *  دیوار فیلد «نوع پلاک» ندارد → از عنوان + توضیحات خوانده می‌شود.
 *  جستجوی «اروند» دیوار دقیق نیست (حدود نیمی از نتایج واقعاً اروند نیستند)
 *  پس فقط آگهی‌هایی که متنشان نشانه دارد اروند حساب می‌شوند.
 * ⚠️ بدون alias «@/» — در فانکشن سرور هم import می‌شود.
 * ============================================================ */
import { toGregorian } from '../../../shared/utils/jalaliCore.js';
import type { ListRow, PlateKind } from '../domain/types.js';

export const DIVAR_CAR_CATEGORY = 'light';

/** شهرهای دیوار */
export const DIVAR_CITY_IDS = { ahvaz: '7', abadan: '24', khorramshahr: '799', tehran: '1' } as const;
export const KHUZ_CITIES = ['ahvaz', 'abadan', 'khorramshahr'] as const;
/** عبارت‌های جستجوی آگهی‌های اروند */
export const ARVAND_QUERIES = ['اروند', 'منطقه آزاد', 'پلاک آزاد'] as const;

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function toLatinDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

/** «۴,۳۵۰,۰۰۰,۰۰۰ تومان» → 4350000000 ؛ «توافقی» → null */
export function parseToman(s: string | null | undefined): number | null {
  if (!s) return null;
  const digits = toLatinDigits(s).replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseIntLoose(s: string | null | undefined): number | null {
  if (!s) return null;
  const digits = toLatinDigits(s).replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

/** «۱۴۰۱ - ۲۰۲۲» → 2022 ؛ «۲۰۱۵» → 2015 ؛ فقط شمسی → +۶۲۱ */
export function parseYear(s: string | null | undefined): number | null {
  if (!s) return null;
  const ys = (toLatinDigits(s).match(/\d{4}/g) ?? []).map(Number);
  const g = ys.find((y) => y > 1900 && y < 2100);
  if (g) return g;
  const j = ys.find((y) => y > 1300 && y < 1500);
  return j ? j + 621 : null;
}

const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

/** «۳۱ شهریور ۱۴۰۵، ۰۱:۳۳» (وقت تهران) → ms */
export function parseDivarDate(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = toLatinDigits(s);
  const m = t.match(/(\d{1,2})\s+(\S+)\s+(\d{4})(?:\D+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2]) + 1;
  if (month < 1) return null;
  const g = toGregorian(Number(m[3]), month, Number(m[1]));
  const hh = m[4] ? Number(m[4]) : 12;
  const mm = m[5] ? Number(m[5]) : 0;
  return Date.UTC(g.year, g.month - 1, g.day, hh, mm) - 3.5 * 3600_000;
}

/* ---------------- تشخیص نوع پلاک ---------------- */

const RE_TRANSIT = /گذر\s*موقت|پلاک\s*گذر/;
const RE_CUSTOMS = /کف\s*گمرک|ترخیص\s*نشده/;
const RE_ARVAND = /اروند|منطقه\s*‌?\s*آزاد|منطقه\s*ازاد|پلاک\s*آزاد|free\s*zone/i;
const RE_CONVERT = /قابل\s*تبدیل|تبدیل\s*به\s*(?:پلاک\s*)?ملی|ملی\s*(?:می\s*)?(?:شود|شه|میشه)/;
const RE_NATIONAL = /پلاک\s*ملی|ملی\s*پلاک|پلاک\s*تهران|سند\s*ملی/;
const RE_DEALER = /فروش\s*(?:ماشین|خودرو)\s*های|واردات\s*خودرو|نمایندگی|تحویل\s*فوری\s*با\s*قرارداد|انواع\s*خودرو/;
const RE_INSTALLMENT = /شرایطی|اقساط|قسطی|پیش\s*پرداخت|وام\s*(?:خودرو|دار)|لیزینگ/;

function snippet(text: string, re: RegExp): string | null {
  const m = re.exec(text);
  if (!m) return null;
  const s = Math.max(0, m.index - 40);
  return text.slice(s, m.index + m[0].length + 40).replace(/\s+/g, ' ').trim();
}

export function classifyPlate(text: string): { plate: PlateKind; evidence: string | null } {
  if (RE_TRANSIT.test(text)) return { plate: 'transit', evidence: snippet(text, RE_TRANSIT) };
  if (RE_CUSTOMS.test(text)) return { plate: 'customs', evidence: snippet(text, RE_CUSTOMS) };
  if (RE_ARVAND.test(text)) {
    return { plate: RE_CONVERT.test(text) ? 'arvand-convertible' : 'arvand', evidence: snippet(text, RE_ARVAND) };
  }
  if (RE_NATIONAL.test(text)) return { plate: 'national', evidence: snippet(text, RE_NATIONAL) };
  return { plate: 'unknown', evidence: null };
}

export function isDealerMulti(title: string, text: string): boolean {
  return RE_DEALER.test(title) || RE_DEALER.test(text.slice(0, 200));
}
export function isInstallment(text: string): boolean {
  return RE_INSTALLMENT.test(text);
}

/* ---------------- فهرست ---------------- */

export function buildCarSearchBody(cityIds: string[], query: string, paginationData?: unknown): Record<string, unknown> {
  const body: Record<string, unknown> = {
    city_ids: cityIds,
    search_data: { form_data: { data: { category: { str: { value: DIVAR_CAR_CATEGORY } }, query: { str: { value: query } } } } }
  };
  if (paginationData) body.pagination_data = paginationData;
  return body;
}

interface RawRow {
  widget_type?: string;
  data?: {
    title?: string;
    token?: string;
    image_url?: string;
    middle_description_text?: string;
    top_description_text?: string;
    bottom_description_text?: string;
    action?: { payload?: { token?: string; web_info?: { district_persian?: string; city_persian?: string } } };
  };
}

export function parseCarList(json: unknown): { rows: ListRow[]; next: unknown | null } {
  const j = json as { list_widgets?: RawRow[]; pagination?: { has_next_page?: boolean; data?: unknown } } | null;
  const rows: ListRow[] = [];
  for (const w of j?.list_widgets ?? []) {
    if (w.widget_type !== 'POST_ROW' || !w.data) continue;
    const d = w.data;
    const token = d.action?.payload?.token ?? d.token;
    if (!token) continue;
    const wi = d.action?.payload?.web_info;
    const where = [wi?.district_persian, wi?.city_persian].filter(Boolean).join('، ') || null;
    const img = typeof d.image_url === 'string' && /^https:\/\/[a-z0-9.-]*divarcdn\.com\//.test(d.image_url) ? d.image_url : null;
    rows.push({
      token,
      title: (d.title ?? '').trim(),
      priceText: d.middle_description_text ?? null,
      kmText: d.top_description_text ?? null,
      where,
      image: img
    });
  }
  const p = j?.pagination;
  return { rows, next: p?.has_next_page && p.data ? p.data : null };
}

/* ---------------- جزئیات ---------------- */

export interface ParsedDetail {
  title: string;
  description: string;
  fields: Record<string, string>;
  listedAt: number | null;
  updatedAt: number | null;
}

export function parseCarDetail(json: unknown): ParsedDetail {
  const out: ParsedDetail = { title: '', description: '', fields: {}, listedAt: null, updatedAt: null };
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) {
      for (const v of o) walk(v);
      return;
    }
    if (!o || typeof o !== 'object') return;
    const rec = o as { widget_type?: string; data?: Record<string, unknown> };
    const data = rec.data ?? {};
    switch (rec.widget_type) {
      case 'GROUP_INFO_ROW':
        for (const it of (data.items as { title?: string; value?: string }[] | undefined) ?? []) {
          if (it.title && typeof it.value === 'string') out.fields[it.title] = it.value;
        }
        break;
      case 'UNEXPANDABLE_ROW':
        if (typeof data.title === 'string' && typeof data.value === 'string') out.fields[data.title] = data.value;
        break;
      case 'LEGEND_TITLE_ROW':
        if (typeof data.title === 'string') out.title = data.title;
        break;
      case 'DESCRIPTION_ROW': {
        const text = typeof data.text === 'string' ? data.text : '';
        if (/^انتشار آگهی/.test(text)) {
          const pub = /انتشار آگهی:\s*([^\n]+)/.exec(text);
          const upd = /آخرین به‌?\s*‌?روز‌?\s*‌?رسانی:\s*([^\n]+)/.exec(text);
          out.listedAt = parseDivarDate(pub?.[1]);
          out.updatedAt = parseDivarDate(upd?.[1]) ?? out.listedAt;
        } else if (text) {
          out.description += (out.description ? '\n' : '') + text;
        }
        break;
      }
      default:
        break;
    }
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v);
  };
  walk(json);
  return out;
}

/** ============================================================
 * خودروهای اروند — ساخت/به‌روزرسانی/حذف آگهی‌ها (خالص، تست‌پذیر)
 *
 *  قواعد تازگی:
 *   - قیمت آگهی شناخته‌شده از ردیف جستجو به‌روز می‌شود (بدون باز کردن دوباره)
 *   - آگهی که در آخرین جستجوی کامل منطقه‌اش دیده نشد → حذف (فروخته/حذف شده)
 *   - آگهی که بیش از ۳۰ روز در دیوار به‌روز نشده → حذف؛ اگر دوباره به‌روز شود
 *     در جستجوی بعدی برمی‌گردد
 *   - فقط آگهی‌های «اروند / قابل تبدیل / کف گمرک» خوزستان و آگهی‌های مبنای
 *     تهران (هم‌مدل، پلاک ملی/نامشخص) نگه داشته می‌شوند
 * ⚠️ بدون alias «@/» — در فانکشن سرور هم import می‌شود.
 * ============================================================ */
import {
  classifyPlate,
  isDealerMulti,
  isInstallment,
  parseIntLoose,
  parseToman,
  parseYear,
  type ParsedDetail
} from '../collector/divarCar.js';
import type { ArvandCity, CarAd, ListRow, PlateKind, Region } from './types.js';

const DAY_MS = 86_400_000;
export const AD_MAX_AGE_MS = 30 * DAY_MS;
/** بازه معقول قیمت (تومان) */
export const MIN_PRICE = 100_000_000;
export const MAX_PRICE = 200_000_000_000;
const MAX_HISTORY = 60;

export const KHUZ_KINDS: readonly PlateKind[] = ['arvand', 'arvand-convertible', 'customs'];
export const ARVAND_KINDS: readonly PlateKind[] = ['arvand', 'arvand-convertible'];
export const NATIONAL_KINDS: readonly PlateKind[] = ['national', 'unknown'];

export function regionOf(city: ArvandCity): Region {
  return city === 'tehran' ? 'tehran' : 'khuz';
}

export function sanePrice(p: number | null): number | null {
  return p !== null && p >= MIN_PRICE && p <= MAX_PRICE ? p : null;
}

/** ساخت آگهی از ردیف فهرست + جزئیات */
export function buildAd(opts: {
  row: ListRow;
  detail: ParsedDetail;
  city: ArvandCity;
  now: number;
  prev?: CarAd | null;
  baselineFor?: string | null;
}): CarAd {
  const { row, detail, city, now, prev } = opts;
  const f = detail.fields;
  const title = detail.title || row.title;
  const text = `${title}\n${detail.description}`;
  const { plate, evidence } = classifyPlate(text);
  const price = sanePrice(parseToman(f['قیمت پایه'] ?? f['قیمت'] ?? row.priceText));
  const history = prev?.priceHistory ? [...prev.priceHistory] : [];
  if (price !== null && history[history.length - 1]?.price !== price) history.push({ ts: now, price });
  return {
    token: row.token,
    region: regionOf(city),
    city,
    where: row.where ?? prev?.where ?? null,
    title,
    model: f['برند و مدل']?.trim() || null,
    year: parseYear(f['مدل (سال تولید)']),
    yearRaw: f['مدل (سال تولید)'] ?? null,
    km: parseIntLoose(f['کارکرد'] ?? row.kmText),
    price,
    gearbox: f['گیربکس'] ?? null,
    fuel: f['نوع سوخت'] ?? null,
    color: f['رنگ'] ?? null,
    plate,
    evidence,
    dealerMulti: isDealerMulti(title, detail.description),
    installment: isInstallment(text),
    image: row.image ?? prev?.image ?? null,
    listedAt: detail.listedAt ?? prev?.listedAt ?? null,
    updatedAt: detail.updatedAt ?? prev?.updatedAt ?? null,
    firstSeenAt: prev?.firstSeenAt ?? now,
    lastSeenAt: now,
    detailAt: now,
    priceHistory: history.slice(-MAX_HISTORY),
    baselineFor: opts.baselineFor ?? prev?.baselineFor ?? null
  };
}

/** آگهی شناخته‌شده در جستجو دوباره دیده شد → قیمت/زمان دیده‌شدن */
export function touchFromRow(ad: CarAd, row: ListRow, now: number): CarAd {
  const price = sanePrice(parseToman(row.priceText));
  const history = [...ad.priceHistory];
  if (price !== null && history[history.length - 1]?.price !== price) history.push({ ts: now, price });
  return {
    ...ad,
    price: price ?? ad.price,
    where: row.where ?? ad.where,
    image: row.image ?? ad.image,
    lastSeenAt: now,
    priceHistory: history.slice(-MAX_HISTORY)
  };
}

/** آیا آگهی ارزش نگه‌داشتن دارد؟ */
export function isRelevant(ad: CarAd): boolean {
  if (ad.region === 'khuz') return KHUZ_KINDS.includes(ad.plate);
  return NATIONAL_KINDS.includes(ad.plate) && !!ad.model && ad.model === ad.baselineFor;
}

/** قابل استفاده در میانه قیمت */
export function isComparable(ad: CarAd): boolean {
  return ad.price !== null && !ad.dealerMulti && !ad.installment && ad.year !== null && !!ad.model && ad.model !== 'سایر';
}

/** آخرین فعالیت آگهی در دیوار */
export function activityTs(ad: CarAd): number {
  return ad.updatedAt ?? ad.listedAt ?? ad.firstSeenAt;
}

/**
 * حذف آگهی‌های قدیمی/ناموجود:
 *  - completed: مناطقی که جستجوی کاملشان در این اجرا تمام شد (runStartedAt)
 *  - آگهی دیده‌نشده در آن منطقه، یا بیش از ۳۰ روز بی‌فعالیت
 */
export function pruneAds(
  ads: CarAd[],
  opts: { now: number; runStartedAt: number | null; completed: Region[] }
): { kept: CarAd[]; removed: string[] } {
  const kept: CarAd[] = [];
  const removed: string[] = [];
  for (const ad of ads) {
    const unseen = opts.runStartedAt !== null && opts.completed.includes(ad.region) && ad.lastSeenAt < opts.runStartedAt;
    const old = opts.now - activityTs(ad) > AD_MAX_AGE_MS;
    if (unseen || old || !isRelevant(ad)) removed.push(ad.token);
    else kept.push(ad);
  }
  return { kept, removed };
}

/** ادغام دو مجموعه (مثلاً محلی + سرور) — lastSeenAt جدیدتر می‌ماند */
export function mergeAds(...lists: CarAd[][]): CarAd[] {
  const map = new Map<string, CarAd>();
  for (const list of lists) {
    for (const ad of list) {
      if (!ad || typeof ad.token !== 'string') continue;
      const prev = map.get(ad.token);
      if (!prev || ad.lastSeenAt > prev.lastSeenAt) map.set(ad.token, ad);
    }
  }
  return [...map.values()];
}

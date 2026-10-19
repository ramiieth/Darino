/** ============================================================
 * Property Market — دستیار قیمت آگهی (خالص)
 *
 *  هر آگهی فقط با آگهی‌های «مشابه» مقایسه می‌شود: همان منطقه + همان سال ساخت
 *  (اگر کمتر از ۴ آگهی مشابه بود: همان منطقه با یک سال اختلاف). معیار = میانهٔ قیمت هر متر
 *  آگهی‌های مشابه (خود آگهی حساب نمی‌شود).
 *
 *  ⚠️ قیمت آگهی «قیمت پیشنهادی فروشنده» است، نه قیمت معامله‌شده. طبقه، نما، کیفیت ساخت،
 *  خیابان و امکانات در قیمت هر متر دیده نمی‌شوند؛ نتیجه نقطهٔ شروع بررسی است، نه حکم.
 * ============================================================ */
import { areaKeyOf } from '../data/catalog.js';
import { buildingAgeYears } from './segments.js';
import { median, percentile } from './stats.js';

export type Verdict = 'below' | 'fair' | 'above' | 'suspect' | 'unknown' | 'exception';

/** ±۱۰٪ میانهٔ آگهی‌های مشابه = منصفانه */
export const FAIR_BAND = 0.1;
/** کمتر از ۶۰٪ میانهٔ مشابه‌ها = مشکوک (خطای قیمت/متراژ، پیش‌فروش، سهم‌الارث…) */
export const SUSPECT_RATIO = 0.6;
/** حداقل آگهی مشابه برای قضاوت */
export const MIN_PEERS = 4;

export interface ValuationInput {
  token: string;
  neighborhoodKey: string | null;
  yearBuilt: number | null;
  pricePerSqmToman: number | null;
}

export interface Valuation {
  verdict: Verdict;
  /** قیمت هر متر ÷ میانهٔ مشابه‌ها */
  ratio: number | null;
  peerMedian: number | null;
  /** بازهٔ رایج مشابه‌ها (۲۵٪ تا ۷۵٪) */
  peerRange: [number, number] | null;
  peerCount: number;
  /** همان سال ساخت، یا با یک سال اختلاف (نمونهٔ کم) */
  basis: 'same-year' | 'near-year' | null;
}

const ageClass = (age: number) => Math.min(age, 8); // ۸ سال و بیشتر = «قبل‌تر»

/** آگهی واقعی ولی استثنایی (splitExceptions): نمایش با برچسب، بدون مقایسه و بدون اثر روی میانگین */
export const EXCEPTION_VALUATION: Valuation = { verdict: 'exception', ratio: null, peerMedian: null, peerRange: null, peerCount: 0, basis: null };

export function verdictOf(ratio: number): Verdict {
  if (ratio < SUSPECT_RATIO) return 'suspect';
  if (ratio < 1 - FAIR_BAND) return 'below';
  if (ratio <= 1 + FAIR_BAND) return 'fair';
  return 'above';
}

/** ارزیابی همهٔ آگهی‌ها نسبت به آگهی‌های مشابه همان منطقه و سال ساخت */
export function valueListings(listings: readonly ValuationInput[], currentJalaliYear: number): Map<string, Valuation> {
  // گروه: منطقه → ردهٔ سنی → قیمت‌ها
  const groups = new Map<string, Map<number, { token: string; ppm: number }[]>>();
  const info = new Map<string, { area: string; age: number; ppm: number }>();
  for (const l of listings) {
    const area = areaKeyOf(l.neighborhoodKey);
    const age = buildingAgeYears(l.yearBuilt, currentJalaliYear);
    if (!area || age === null || !(l.pricePerSqmToman && l.pricePerSqmToman > 0)) continue;
    const a = ageClass(age);
    info.set(l.token, { area, age: a, ppm: l.pricePerSqmToman });
    const byAge = groups.get(area) ?? new Map();
    byAge.set(a, [...(byAge.get(a) ?? []), { token: l.token, ppm: l.pricePerSqmToman }]);
    groups.set(area, byAge);
  }

  const out = new Map<string, Valuation>();
  const none: Valuation = { verdict: 'unknown', ratio: null, peerMedian: null, peerRange: null, peerCount: 0, basis: null };
  for (const l of listings) {
    const me = info.get(l.token);
    if (!me) {
      out.set(l.token, none);
      continue;
    }
    const byAge = groups.get(me.area)!;
    const peersAt = (ages: number[]) => ages.flatMap((a) => byAge.get(a) ?? []).filter((p) => p.token !== l.token).map((p) => p.ppm);
    let peers = peersAt([me.age]);
    let basis: Valuation['basis'] = 'same-year';
    if (peers.length < MIN_PEERS) {
      peers = peersAt([me.age - 1, me.age, me.age + 1]);
      basis = 'near-year';
    }
    if (peers.length < MIN_PEERS) {
      out.set(l.token, { ...none, peerCount: peers.length });
      continue;
    }
    const m = median(peers)!;
    const lo = percentile(peers, 25);
    const hi = percentile(peers, 75);
    const ratio = me.ppm / m;
    out.set(l.token, {
      verdict: verdictOf(ratio),
      ratio,
      peerMedian: m,
      peerRange: lo !== null && hi !== null ? [lo, hi] : null,
      peerCount: peers.length,
      basis
    });
  }
  return out;
}

/**
 * پیشنهاد برتر یک سال ساخت (مثلاً نوساز = ۰، یک‌ساله = ۱): ارزان‌ترین آگهی‌ها نسبت به مشابه‌های
 * خودشان (نه ارزان‌ترین قیمت مطلق، چون منطقهٔ ارزان همیشه برنده می‌شد). آگهی «مشکوک» کنار می‌رود.
 */
export function topPicks<T extends ValuationInput>(
  listings: readonly T[],
  valuations: ReadonlyMap<string, Valuation>,
  ageYears: number,
  currentJalaliYear: number,
  limit = 5
): { listing: T; valuation: Valuation }[] {
  return listings
    .filter((l) => buildingAgeYears(l.yearBuilt, currentJalaliYear) === ageYears)
    .map((l) => ({ listing: l, valuation: valuations.get(l.token) }))
    .filter((x): x is { listing: T; valuation: Valuation } => !!x.valuation && (x.valuation.verdict === 'below' || x.valuation.verdict === 'fair'))
    .sort((a, b) => a.valuation.ratio! - b.valuation.ratio!)
    .slice(0, limit);
}

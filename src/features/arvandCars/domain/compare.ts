/** ============================================================
 * خودروهای اروند — مقایسه قیمت با پلاک ملی (خالص، تست‌پذیر)
 *
 *  گروه = «برند و مدل» دیوار + سال میلادی (دقیقاً هم‌مدل و هم‌سال)
 *  اروند: آگهی‌های اروند/قابل تبدیل خوزستان · ملی: آگهی‌های تهران
 *  میانه پس از حذف پرت‌ها (۰٫۴ تا ۲٫۵ برابر میانه گروه)
 *  اختلاف فقط وقتی هر دو طرف حداقل ۲ آگهی دارند؛ کمتر از ۳ = نمونه کم
 * ============================================================ */
import { ARVAND_KINDS, NATIONAL_KINDS, isComparable } from './ads.js';
import type { CarAd, GroupStat } from './types.js';

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** حذف قیمت‌های پرت نسبت به میانه گروه */
export function withoutOutliers(ads: CarAd[]): CarAd[] {
  if (ads.length < 3) return ads;
  const m = median(ads.map((a) => a.price as number))!;
  return ads.filter((a) => (a.price as number) >= 0.4 * m && (a.price as number) <= 2.5 * m);
}

export function normModel(m: string): string {
  return m.replace(/[‌\s]+/g, ' ').trim();
}

export function groupKey(model: string, year: number): string {
  return `${normModel(model)}|${year}`;
}

export interface SideStats {
  n: number;
  median: number | null;
  min: number | null;
  max: number | null;
  kmMedian: number | null;
  ads: CarAd[];
}

function side(ads: CarAd[]): SideStats {
  const clean = withoutOutliers(ads);
  const prices = clean.map((a) => a.price as number);
  const kms = clean.map((a) => a.km).filter((k): k is number => k !== null);
  return {
    n: clean.length,
    median: median(prices),
    min: prices.length ? Math.min(...prices) : null,
    max: prices.length ? Math.max(...prices) : null,
    kmMedian: median(kms),
    ads: clean
  };
}

export interface ModelGroup {
  key: string;
  model: string;
  year: number;
  arvand: SideStats;
  national: SideStats;
  /** (اروند ÷ ملی − ۱) × ۱۰۰ */
  gapPct: number | null;
  lowSample: boolean;
}

export const MIN_SIDE = 2;

export function buildGroups(ads: CarAd[]): ModelGroup[] {
  const map = new Map<string, { model: string; year: number; arv: CarAd[]; nat: CarAd[] }>();
  for (const ad of ads) {
    if (!isComparable(ad)) continue;
    const isArv = ad.region === 'khuz' && ARVAND_KINDS.includes(ad.plate);
    const isNat = ad.region === 'tehran' && NATIONAL_KINDS.includes(ad.plate);
    if (!isArv && !isNat) continue;
    const key = groupKey(ad.model!, ad.year!);
    let g = map.get(key);
    if (!g) {
      g = { model: normModel(ad.model!), year: ad.year!, arv: [], nat: [] };
      map.set(key, g);
    }
    (isArv ? g.arv : g.nat).push(ad);
  }
  const out: ModelGroup[] = [];
  for (const [key, g] of map) {
    if (g.arv.length === 0) continue;
    const arvand = side(g.arv);
    const national = side(g.nat);
    const ok = arvand.n >= MIN_SIDE && national.n >= MIN_SIDE && arvand.median && national.median;
    out.push({
      key,
      model: g.model,
      year: g.year,
      arvand,
      national,
      gapPct: ok ? (arvand.median! / national.median! - 1) * 100 : null,
      lowSample: !ok || arvand.n < 3 || national.n < 3
    });
  }
  return out;
}

export interface MarketIndex {
  /** میانه اختلاف گروه‌های قابل مقایسه (٪) */
  gapPct: number | null;
  comparable: number;
  arvandAds: number;
  nationalAds: number;
}

export function marketIndex(groups: ModelGroup[]): MarketIndex {
  const gaps = groups.map((g) => g.gapPct).filter((x): x is number => x !== null);
  return {
    gapPct: median(gaps),
    comparable: gaps.length,
    arvandAds: groups.reduce((a, g) => a + g.arvand.n, 0),
    nationalAds: groups.filter((g) => g.gapPct !== null).reduce((a, g) => a + g.national.n, 0)
  };
}

/** مدل‌هایی که مبنای تهران لازم دارند (حداقل ۲ آگهی اروند قابل مقایسه) */
export function baselineTargets(ads: CarAd[], max = 20): string[] {
  const count = new Map<string, number>();
  for (const ad of ads) {
    if (ad.region !== 'khuz' || !ARVAND_KINDS.includes(ad.plate) || !isComparable(ad)) continue;
    count.set(ad.model!, (count.get(ad.model!) ?? 0) + 1);
  }
  return [...count.entries()]
    .filter(([, n]) => n >= MIN_SIDE)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([m]) => m);
}

/** آمار فشرده برای Snapshot روزانه */
export function groupStats(groups: ModelGroup[]): GroupStat[] {
  return groups.map((g) => ({
    key: g.key,
    model: g.model,
    year: g.year,
    arvMedian: g.arvand.median,
    arvN: g.arvand.n,
    natMedian: g.national.median,
    natN: g.national.n
  }));
}

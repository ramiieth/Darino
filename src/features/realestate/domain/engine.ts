/** ============================================================
 * Real Estate — موتور محاسبات (خالص، تست‌پذیر)
 *
 *  - ساخت Snapshot Immutable (قیمت دلاری در لحظه ثبت)
 *  - بازدهی محله بین دو Snapshot (تومانی/دلاری جدا)
 *  - سود دارایی ملک (تومانی/دلاری/درصدی — اتوماتیک)
 *  - رتبه‌بندی محله‌ها · آمار · مقایسه با سایر دارایی‌ها
 *
 * ⚠️ هرگز از نرخ دلار فعلی برای تاریخچه استفاده نمی‌شود.
 * ⚠️ داده ناموجود → null (N/A) — هرگز ۰/حدس.
 * ============================================================ */
import type {
  NewNeighborhoodPriceInput,
  NewRealAssetInput,
  RealAsset,
  RealEstateSnapshot
} from './types';

/** قیمت دلاری در لحظه ثبت — Immutable */
export function toUsd(toman: number | null, usdRate: number): number | null {
  if (toman === null || !Number.isFinite(toman) || toman <= 0 || !(usdRate > 0)) return null;
  return toman / usdRate;
}

/** ساخت Snapshot از ورودی — هر رکورد قیمت دلاری همان لحظه دارد */
export function buildSnapshot(input: NewNeighborhoodPriceInput): RealEstateSnapshot {
  return {
    id: `snap-${input.dateTs}`,
    dateTs: input.dateTs,
    dateLabel: input.dateLabel,
    usdRate: input.usdRate,
    records: input.prices.map((p) => ({
      ...p,
      averagePricePerSqmUsd: toUsd(p.averagePricePerSqmToman, input.usdRate) ?? 0
    })),
    createdAt: Date.now()
  };
}

/** ساخت دارایی ملک — همه مقادیر دلاری/سود اتوماتیک و فریز */
export function buildRealAsset(input: NewRealAssetInput): RealAsset {
  const purchasePriceUsd = toUsd(input.purchasePriceToman, input.ownershipUsdRate);
  const currentValueUsd = toUsd(input.currentValueToman, input.valuationUsdRate);
  return {
    id: `re-${Date.now()}`,
    assetClass: 'real-estate',
    propertyType: input.propertyType,
    city: input.city,
    neighborhoodId: input.neighborhoodId,
    buildingCondition: input.buildingCondition,
    ownershipDateJalali: input.ownershipDateJalali,
    ownershipDateGregorian: input.ownershipDateGregorian,
    ownershipUsdRate: input.ownershipUsdRate,
    purchasePriceToman: input.purchasePriceToman,
    purchasePriceUsd: purchasePriceUsd ?? 0,
    valuationDateJalali: input.valuationDateJalali,
    valuationDateGregorian: input.valuationDateGregorian,
    valuationUsdRate: input.valuationUsdRate,
    currentValueToman: input.currentValueToman,
    currentValueUsd: currentValueUsd ?? 0,
    createdAt: Date.now()
  };
}

/* ---------------- سود دارایی ملک ---------------- */

export interface AssetProfit {
  asset: RealAsset;
  profitToman: number;
  profitUsd: number;
  profitPctToman: number;
  profitPctUsd: number;
}

/** سود = ارزش فعلی − قیمت خرید (تومانی و دلاری جدا — اتوماتیک) */
export function assetProfit(a: RealAsset): AssetProfit {
  const profitToman = a.currentValueToman - a.purchasePriceToman;
  const profitUsd = a.currentValueUsd - a.purchasePriceUsd;
  return {
    asset: a,
    profitToman,
    profitUsd,
    profitPctToman: a.purchasePriceToman > 0 ? (profitToman / a.purchasePriceToman) * 100 : 0,
    profitPctUsd: a.purchasePriceUsd > 0 ? (profitUsd / a.purchasePriceUsd) * 100 : 0
  };
}

/* ---------------- بازدهی محله بین دو Snapshot ---------------- */

export interface NeighborhoodReturn {
  neighborhoodId: string;
  propertyType: string;
  buildingCondition: string;
  /** قیمت هر متر شروع (تومان) */
  startToman: number | null;
  /** قیمت هر متر پایان (تومان) */
  endToman: number | null;
  tomanChange: number | null;
  tomanPct: number | null;
  /** قیمت هر متر شروع (دلار — ثبت‌شده) */
  startUsd: number | null;
  endUsd: number | null;
  usdChange: number | null;
  usdPct: number | null;
  startRate: number;
  endRate: number;
}

/** پیدا کردن رکورد یک (محله، نوع، وضعیت) در Snapshot */
export function recordAt(
  snap: RealEstateSnapshot,
  neighborhoodId: string,
  propertyType: string,
  buildingCondition: string
): { toman: number; usd: number } | null {
  const r = snap.records.find(
    (x) =>
      x.neighborhoodId === neighborhoodId &&
      x.propertyType === propertyType &&
      x.buildingCondition === buildingCondition
  );
  if (!r) return null;
  return { toman: r.averagePricePerSqmToman, usd: r.averagePricePerSqmUsd };
}

/** بازدهی محله بین دو Snapshot (تومانی و دلاری جدا) */
export function neighborhoodReturn(
  start: RealEstateSnapshot,
  end: RealEstateSnapshot,
  neighborhoodId: string,
  propertyType: string = 'apartment',
  buildingCondition: string = 'new'
): NeighborhoodReturn {
  const s = recordAt(start, neighborhoodId, propertyType, buildingCondition);
  const e = recordAt(end, neighborhoodId, propertyType, buildingCondition);
  return {
    neighborhoodId,
    propertyType,
    buildingCondition,
    startToman: s?.toman ?? null,
    endToman: e?.toman ?? null,
    tomanChange: s && e ? e.toman - s.toman : null,
    tomanPct: s && e && s.toman > 0 ? ((e.toman - s.toman) / s.toman) * 100 : null,
    startUsd: s?.usd ?? null,
    endUsd: e?.usd ?? null,
    usdChange: s && e ? e.usd - s.usd : null,
    usdPct: s && e && s.usd > 0 ? ((e.usd - s.usd) / s.usd) * 100 : null,
    startRate: start.usdRate,
    endRate: end.usdRate
  };
}

/* ---------------- رتبه‌بندی محله‌ها ---------------- */

export type NeighborhoodSortKey = 'toman-pct' | 'usd-pct' | 'toman-abs' | 'usd-abs' | 'worst';

export interface RankedNeighborhood {
  neighborhoodId: string;
  name: string;
  ret: NeighborhoodReturn;
  rank: number;
}

export function rankNeighborhoods(
  neighborhoods: { id: string; name: string }[],
  start: RealEstateSnapshot,
  end: RealEstateSnapshot,
  sortKey: NeighborhoodSortKey = 'toman-pct',
  propertyType: string = 'apartment',
  buildingCondition: string = 'new'
): RankedNeighborhood[] {
  const out: RankedNeighborhood[] = [];
  for (const n of neighborhoods) {
    const ret = neighborhoodReturn(start, end, n.id, propertyType, buildingCondition);
    if (ret.startToman === null || ret.endToman === null) continue;
    out.push({ neighborhoodId: n.id, name: n.name, ret, rank: 0 });
  }
  const val = (r: RankedNeighborhood): number => {
    switch (sortKey) {
      case 'usd-pct': return r.ret.usdPct ?? -Infinity;
      case 'toman-abs': return r.ret.tomanChange ?? -Infinity;
      case 'usd-abs': return r.ret.usdChange ?? -Infinity;
      case 'worst': return r.ret.tomanPct ?? -Infinity;
      default: return r.ret.tomanPct ?? -Infinity;
    }
  };
  out.sort((a, b) => (sortKey === 'worst' ? val(a) - val(b) : val(b) - val(a)));
  out.forEach((r, i) => (r.rank = i + 1));
  return out;
}

/* ---------------- آمار ---------------- */

export interface NeighborhoodStats {
  /** محله‌های دارای داده در هر دو Snapshot */
  comparableCount: number;
  avgTomanPct: number | null;
  avgUsdPct: number | null;
  gainers: number;
  losers: number;
}

export function neighborhoodStats(
  neighborhoods: { id: string }[],
  start: RealEstateSnapshot,
  end: RealEstateSnapshot,
  propertyType: string = 'apartment',
  buildingCondition: string = 'new'
): NeighborhoodStats {
  let n = 0, sumT = 0, sumU = 0, gain = 0, loss = 0;
  for (const nb of neighborhoods) {
    const r = neighborhoodReturn(start, end, nb.id, propertyType, buildingCondition);
    if (r.tomanPct === null || r.usdPct === null) continue;
    n++;
    sumT += r.tomanPct;
    sumU += r.usdPct;
    if (r.tomanPct > 0) gain++;
    else if (r.tomanPct < 0) loss++;
  }
  return {
    comparableCount: n,
    avgTomanPct: n > 0 ? sumT / n : null,
    avgUsdPct: n > 0 ? sumU / n : null,
    gainers: gain,
    losers: loss
  };
}

/* ---------------- مقایسه با سایر دارایی‌ها ---------------- */

export type BenchmarkAsset = 'ethereum' | 'bitcoin' | 'tether-gold' | 'tether' | 'usd' | 'vehicle';

export const BENCHMARK_FA: Record<BenchmarkAsset, string> = {
  ethereum: 'ETH',
  bitcoin: 'BTC',
  'tether-gold': 'طلا (XAUT)',
  tether: 'USDT',
  usd: 'دلار (USD)',
  vehicle: 'خودرو (میانگین)'
};

export interface BenchmarkComparison {
  asset: BenchmarkAsset;
  startPriceUsd: number | null;
  endPriceUsd: number | null;
  usdPct: number | null;
  startRate: number;
  endRate: number;
  tomanPct: number | null;
  endValueToman: number | null;
}

/** مقایسه «اگر به‌جای ملک، X می‌خریدم» — با نرخ دلار Snapshot‌ها */
export function benchmarkComparison(
  asset: BenchmarkAsset,
  startPriceUsd: number | null,
  endPriceUsd: number | null,
  startRate: number,
  endRate: number | null,
  capitalToman: number
): BenchmarkComparison {
  const usdPct =
    startPriceUsd !== null && endPriceUsd !== null && startPriceUsd > 0
      ? (endPriceUsd / startPriceUsd - 1) * 100
      : null;
  const rateEnd = endRate;
  const tomanPct =
    usdPct !== null && rateEnd !== null && rateEnd > 0
      ? (1 + usdPct / 100) * (rateEnd / startRate) * 100 - 100
      : null;
  const endValueToman = tomanPct !== null ? capitalToman * (1 + tomanPct / 100) : null;
  return {
    asset,
    startPriceUsd,
    endPriceUsd,
    usdPct,
    startRate,
    endRate: rateEnd ?? startRate,
    tomanPct,
    endValueToman
  };
}

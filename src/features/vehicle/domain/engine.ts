/** ============================================================
 * Vehicle Investment — موتور محاسبات (خالص، تست‌پذیر)
 *
 *  - ساخت Snapshot Immutable از ورودی (قیمت دلاری در لحظه ثبت)
 *  - بازدهی تومانی / درصدی / دلاری بین دو Snapshot
 *  - اختلاف قیمت نمایندگی و بازار
 *  - رتبه‌بندی خودروها بر اساس بازدهی
 *  - مقایسه با سایر دارایی‌ها (ETH/BTC/XAUT/USDT/دلار)
 *
 * ⚠️ هرگز از نرخ دلار فعلی برای محاسبه تاریخچه استفاده نمی‌شود.
 * ⚠️ داده ناموجود → null (N/A) — هرگز ۰ فرض نمی‌شود.
 * ============================================================ */
import type {
  NewSnapshotInput,
  Vehicle,
  VehiclePriceRecord,
  VehicleSnapshot
} from './types';

/** ساخت قیمت دلاری در لحظه ثبت — Immutable */
export function toUsd(toman: number | null, usdRate: number): number | null {
  if (toman === null || !Number.isFinite(toman) || toman <= 0 || !(usdRate > 0)) return null;
  return toman / usdRate;
}

/** ساخت Snapshot از ورودی — قیمت دلاری همان لحظه ذخیره می‌شود */
export function buildSnapshot(
  vehicles: Vehicle[],
  input: NewSnapshotInput
): VehicleSnapshot {
  const records: VehiclePriceRecord[] = vehicles.map((v) => {
    const market = input.marketPrices[v.id] ?? null;
    const dealer = input.dealerPrices?.[v.id] ?? null;
    return {
      vehicleId: v.id,
      dealerPriceToman: dealer,
      marketPriceToman: market,
      dealerPriceUsd: toUsd(dealer, input.usdRate),
      marketPriceUsd: toUsd(market, input.usdRate)
    };
  });
  return {
    id: `snap-${input.dateTs}`,
    dateTs: input.dateTs,
    dateLabel: input.dateLabel,
    usdRate: input.usdRate,
    priceSource: input.priceSource,
    records,
    createdAt: Date.now()
  };
}

/* ---------------- بازدهی بین دو Snapshot ---------------- */

export type PriceKind = 'market' | 'dealer';

/** قیمت ثبت‌شده (تومان) برای یک خودرو در Snapshot — null = N/A */
export function priceTomanAt(
  snap: VehicleSnapshot,
  vehicleId: string,
  kind: PriceKind
): number | null {
  const r = snap.records.find((x) => x.vehicleId === vehicleId);
  if (!r) return null;
  return kind === 'market' ? r.marketPriceToman : r.dealerPriceToman;
}

/** قیمت ثبت‌شده (دلار) برای یک خودرو در Snapshot — null = N/A */
export function priceUsdAt(
  snap: VehicleSnapshot,
  vehicleId: string,
  kind: PriceKind
): number | null {
  const r = snap.records.find((x) => x.vehicleId === vehicleId);
  if (!r) return null;
  return kind === 'market' ? r.marketPriceUsd : r.dealerPriceUsd;
}

export interface VehicleReturn {
  vehicleId: string;
  kind: PriceKind;
  /** قیمت شروع (تومان) */
  startToman: number | null;
  /** قیمت پایان (تومان) */
  endToman: number | null;
  /** رشد تومانی مطلق = end − start */
  tomanChange: number | null;
  /** رشد درصدی تومانی */
  tomanPct: number | null;
  /** قیمت شروع (دلار) — ثبت‌شده در لحظه */
  startUsd: number | null;
  /** قیمت پایان (دلار) */
  endUsd: number | null;
  /** رشد دلاری مطلق */
  usdChange: number | null;
  /** رشد درصدی دلاری */
  usdPct: number | null;
  /** نرخ دلار شروع (ثابت ثبت‌شده) */
  startRate: number;
  /** نرخ دلار پایان (ثابت ثبت‌شده) */
  endRate: number;
}

/** بازدهی یک خودرو بین دو Snapshot (تومانی و دلاری جدا) */
export function vehicleReturn(
  start: VehicleSnapshot,
  end: VehicleSnapshot,
  vehicleId: string,
  kind: PriceKind = 'market'
): VehicleReturn {
  const sT = priceTomanAt(start, vehicleId, kind);
  const eT = priceTomanAt(end, vehicleId, kind);
  const sU = priceUsdAt(start, vehicleId, kind);
  const eU = priceUsdAt(end, vehicleId, kind);

  return {
    vehicleId,
    kind,
    startToman: sT,
    endToman: eT,
    tomanChange: sT !== null && eT !== null ? eT - sT : null,
    tomanPct: sT !== null && eT !== null && sT > 0 ? ((eT - sT) / sT) * 100 : null,
    startUsd: sU,
    endUsd: eU,
    usdChange: sU !== null && eU !== null ? eU - sU : null,
    usdPct: sU !== null && eU !== null && sU > 0 ? ((eU - sU) / sU) * 100 : null,
    startRate: start.usdRate,
    endRate: end.usdRate
  };
}

/** بازدهی از ابتدایی‌ترین Snapshot تا یک Snapshot خاص (All Time تا تاریخ انتخابی) */
export function vehicleReturnRange(
  snapshots: VehicleSnapshot[],
  vehicleId: string,
  kind: PriceKind = 'market',
  endIndex?: number
): VehicleReturn | null {
  const sorted = [...snapshots].sort((a, b) => a.dateTs - b.dateTs);
  if (sorted.length < 2) return null;
  const endIdx = endIndex ?? sorted.length - 1;
  if (endIdx <= 0 || endIdx >= sorted.length) return null;
  return vehicleReturn(sorted[0], sorted[endIdx], vehicleId, kind);
}

/* ---------------- اختلاف نمایندگی / بازار ---------------- */

export interface DealerMarketGap {
  vehicleId: string;
  dealerToman: number | null;
  marketToman: number | null;
  /** اختلاف مطلق تومان = market − dealer */
  gapToman: number | null;
  /** درصد اختلاف نسبت به قیمت نمایندگی */
  gapPct: number | null;
}

export function dealerMarketGap(snap: VehicleSnapshot, vehicleId: string): DealerMarketGap {
  const r = snap.records.find((x) => x.vehicleId === vehicleId);
  const d = r?.dealerPriceToman ?? null;
  const m = r?.marketPriceToman ?? null;
  return {
    vehicleId,
    dealerToman: d,
    marketToman: m,
    gapToman: d !== null && m !== null ? m - d : null,
    gapPct: d !== null && m !== null && d > 0 ? ((m - d) / d) * 100 : null
  };
}

/* ---------------- رتبه‌بندی ---------------- */

export type VehicleSortKey = 'toman-pct' | 'usd-pct' | 'toman-abs' | 'usd-abs' | 'worst';

export interface RankedVehicle {
  vehicle: Vehicle;
  ret: VehicleReturn;
  gap: DealerMarketGap | null;
  rank: number;
}

/**
 * رتبه‌بندی خودروها بر اساس بازدهی بین دو Snapshot.
 *  - فقط خودروهایی که در هر دو Snapshot قیمت بازار دارند.
 *  - مرتب‌سازی: toman-pct / usd-pct / toman-abs / usd-abs / worst (بیشترین کاهش)
 */
export function rankVehicles(
  vehicles: Vehicle[],
  start: VehicleSnapshot,
  end: VehicleSnapshot,
  sortKey: VehicleSortKey = 'toman-pct'
): RankedVehicle[] {
  const out: RankedVehicle[] = [];
  for (const v of vehicles) {
    const ret = vehicleReturn(start, end, v.id, 'market');
    if (ret.startToman === null || ret.endToman === null) continue; // بدون داده کامل → حذف از رتبه
    out.push({ vehicle: v, ret, gap: dealerMarketGap(end, v.id), rank: 0 });
  }
  const val = (r: RankedVehicle): number => {
    switch (sortKey) {
      case 'usd-pct': return r.ret.usdPct ?? -Infinity;
      case 'toman-abs': return r.ret.tomanChange ?? -Infinity;
      case 'usd-abs': return r.ret.usdChange ?? -Infinity;
      case 'worst': return r.ret.tomanPct ?? -Infinity; // صعودی → بدترین اول
      default: return r.ret.tomanPct ?? -Infinity;
    }
  };
  out.sort((a, b) => (sortKey === 'worst' ? val(a) - val(b) : val(b) - val(a)));
  out.forEach((r, i) => (r.rank = i + 1));
  return out;
}

/* ---------------- مقایسه با سایر دارایی‌ها ---------------- */

export type BenchmarkAsset = 'ethereum' | 'bitcoin' | 'tether-gold' | 'tether' | 'usd';

export const BENCHMARK_FA: Record<BenchmarkAsset, string> = {
  ethereum: 'ETH',
  bitcoin: 'BTC',
  'tether-gold': 'طلا (XAUT)',
  tether: 'USDT',
  usd: 'دلار (USD)'
};

export interface BenchmarkComparison {
  asset: BenchmarkAsset;
  /** قیمت دارایی در تاریخ شروع (USD) — null = N/A (داده تاریخی در دسترس نیست) */
  startPriceUsd: number | null;
  /** قیمت دارایی در تاریخ پایان (USD) */
  endPriceUsd: number | null;
  /** بازدهی دلاری = end/start − 1 */
  usdPct: number | null;
  /** نرخ دلار شروع (از Snapshot خودرو) */
  startRate: number;
  /** نرخ دلار پایان (از Snapshot پایان یا نرخ فعلی) */
  endRate: number;
  /** بازدهی تومانی = (1+usdPct) × (endRate/startRate) − 1 */
  tomanPct: number | null;
  /** اگر سرمایه اولیه = capitalToman، ارزش امروز به تومان */
  endValueToman: number | null;
}

/**
 * مقایسه بازدهی: «اگر به‌جای این خودرو، X را می‌خریدم...»
 *  capitalToman = سرمایه اولیه (مثلاً قیمت بازار خودرو در تاریخ شروع)
 *  endRate = نرخ دلار پایان (از Snapshot پایان؛ برای «امروز» از نرخ فعلی اپ)
 */
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
  const endValueToman =
    tomanPct !== null ? capitalToman * (1 + tomanPct / 100) : null;
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

/* ---------------- تشخیص خودرو موجود (برای ثبت دستی) ---------------- */

/**
 * پیدا کردن خودروی موجود با برند+نام یکسان (موردی، بدون فاصله اضافه).
 * برای جلوگیری از ثبت خودروی تکراری به‌صورت دستی — null = خودرو جدید است.
 */
export function findExistingVehicle(
  vehicles: Vehicle[],
  brand: string,
  name: string
): Vehicle | null {
  const norm = (s: string) => s.trim().toLowerCase();
  const b = norm(brand);
  const n = norm(name);
  if (!b || !n) return null;
  return (
    vehicles.find((v) => norm(v.brand) === b && norm(v.name) === n) ?? null
  );
}

/* ---------------- آمار کلی ---------------- */

export interface VehicleStats {
  vehicleCount: number;
  /** خودروهایی که در هر دو Snapshot قیمت بازار دارند */
  comparableCount: number;
  /** میانگین بازدهی تومانی (٪) */
  avgTomanPct: number | null;
  /** میانگین بازدهی دلاری (٪) */
  avgUsdPct: number | null;
  /** تعداد خودروهای رشد‌کرده (تومانی) */
  gainersToman: number;
  /** تعداد خودروهای افت‌کرده (تومانی) */
  losersToman: number;
}

export function vehicleStats(
  vehicles: Vehicle[],
  start: VehicleSnapshot,
  end: VehicleSnapshot
): VehicleStats {
  let sumT = 0, sumU = 0, n = 0, gain = 0, loss = 0;
  for (const v of vehicles) {
    const ret = vehicleReturn(start, end, v.id, 'market');
    if (ret.tomanPct === null || ret.usdPct === null) continue;
    n++;
    sumT += ret.tomanPct;
    sumU += ret.usdPct;
    if (ret.tomanPct > 0) gain++;
    else if (ret.tomanPct < 0) loss++;
  }
  return {
    vehicleCount: vehicles.length,
    comparableCount: n,
    avgTomanPct: n > 0 ? sumT / n : null,
    avgUsdPct: n > 0 ? sumU / n : null,
    gainersToman: gain,
    losersToman: loss
  };
}

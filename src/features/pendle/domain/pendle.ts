/** ============================================================
 * Pendle — لایه دامنه (فقط مشاهده و تحلیل بازار)
 * منبع: Pendle Backend API (/core) — https://docs.pendle.finance/pendle-v2-dev/Backend/ApiOverview
 * ⚠️ فقط Data Provider؛ هیچ معامله/Swap/Deposit/امضا وجود ندارد.
 * ============================================================ */

/** بازار خام از /v2/markets/all */
export interface RawPendleMarket {
  name: string;
  protocol: string;
  icon?: string | null;
  address: string;
  chainId: number;
  expiry: string;
  pt: string;
  yt: string;
  sy: string;
  underlyingAsset: string;
  timestamp: string;
  isNew?: boolean;
  isPrime?: boolean;
  details: {
    liquidity: number;
    totalTvl: number;
    tradingVolume: number;
    underlyingApy: number;
    swapFeeApy: number;
    pendleApy: number;
    ytFloatingApy: number;
    impliedApy: number;
    feeRate: number;
    aggregatedApy: number;
    maxBoostedApy: number;
    ytRoi: number;
    ptRoi: number;
  };
  lpApyBreakdown: { categories: { label: string; apy: number; items: { apy: number; tags: string[] }[] }[] };
  ytApyBreakdown: { categories: { label: string; apy: number; items: { apy: number; tags: string[] }[] }[] };
  lpRewardApyBreakdown: { categories: { label: string; apy: number; items: { apy: number; tags: string[] }[] }[] };
  underlyingRewardApyBreakdown: { categories: { label: string; apy: number; items: { apy: number; tags: string[] }[] }[] };
  rewardTokens: string[];
  points: Record<string, unknown>;
  categoryIds: string[];
}

/** Asset از /v1/assets/all */
export interface PendleAsset {
  name: string;
  symbol: string;
  address: string;
  chainId: number;
  decimals: number;
  tags: string[];
  expiry?: string;
  proIcon?: string | null;
}

export type PendleMarketType = 'LP' | 'PT' | 'YT' | 'SY';

/** نمای محاسبه‌شده بازار (برای UI) */
export interface PendleMarketView extends RawPendleMarket {
  /** APY ثابت (implied) به درصد */
  fixedApyPct: number | null;
  /** APY دارایی پایه به درصد */
  underlyingApyPct: number | null;
  /** APY کل (aggregated) به درصد */
  totalApyPct: number | null;
  /** مجموع دسته‌های LP APY */
  lpApyPct: number | null;
  /** مجموع دسته‌های YT APY */
  ytApyPct: number | null;
  /** پاداش‌های LP (Reward APR) */
  rewardAprPct: number | null;
  /** APY سواپ */
  swapFeeApyPct: number | null;
  /** تخفیف/صرف PT به درصد (از قیمت‌ها) */
  ptDiscountPct: number | null;
  /** روز مانده تا سررسید */
  daysToExpiry: number | null;
  /** نوع بازار (داده‌محور) */
  marketType: PendleMarketType;
}

/** جمع APY دسته‌ها (Pure) */
export function sumApyCategories(categories: { apy: number }[] | undefined): number | null {
  if (!categories || categories.length === 0) return null;
  const sum = categories.reduce((a, c) => a + (c.apy ?? 0), 0);
  return sum;
}

/** تشخیص نوع بازار از روی فیلدها (داده‌محور) */
export function marketTypeOf(m: RawPendleMarket): PendleMarketType {
  const hasPt = !!m.pt && (m.details.impliedApy ?? 0) !== 0;
  const hasYt = !!m.yt && (m.details.ytFloatingApy ?? 0) !== 0 || sumApyCategories(m.ytApyBreakdown?.categories) !== null;
  const hasSy = !!m.sy && (m.details.underlyingApy ?? 0) !== 0;
  if (hasYt && !hasPt && !hasSy) return 'YT';
  if (hasPt && !hasYt && !hasSy) return 'PT';
  if (hasSy && !hasPt && !hasYt) return 'SY';
  return 'LP';
}

/** روز مانده تا سررسید */
export function daysUntil(expiryIso: string | null): number | null {
  if (!expiryIso) return null;
  const t = new Date(expiryIso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.ceil((t - Date.now()) / 86_400_000));
}

/** ساخت نمای محاسبه‌شده بازار */
export function toMarketView(
  m: RawPendleMarket,
  prices: Record<string, number>
): PendleMarketView {
  // فیلدهای pt/yt/sy/underlying خودشان با فرمت `chainId-address` هستند
  const ptPrice = prices[m.pt];
  const underlyingPrice = prices[m.underlyingAsset];
  let ptDiscount: number | null = null;
  if (typeof ptPrice === 'number' && typeof underlyingPrice === 'number' && underlyingPrice > 0 && ptPrice > 0) {
    ptDiscount = (1 - ptPrice / underlyingPrice) * 100;
  }

  const d = m.details;
  return {
    ...m,
    fixedApyPct: typeof d.impliedApy === 'number' ? d.impliedApy * 100 : null,
    underlyingApyPct: typeof d.underlyingApy === 'number' ? d.underlyingApy * 100 : null,
    totalApyPct: typeof d.aggregatedApy === 'number' ? d.aggregatedApy * 100 : null,
    lpApyPct: sumApyCategories(m.lpApyBreakdown?.categories),
    ytApyPct: sumApyCategories(m.ytApyBreakdown?.categories),
    rewardAprPct: sumApyCategories(m.lpRewardApyBreakdown?.categories),
    swapFeeApyPct: typeof d.swapFeeApy === 'number' ? d.swapFeeApy * 100 : null,
    ptDiscountPct: ptDiscount,
    daysToExpiry: daysUntil(m.expiry),
    marketType: marketTypeOf(m)
  };
}

/** کلید مرتب‌سازی فرصت‌ها */
export type PendleSortKey =
  | 'fixedApy'
  | 'lpApy'
  | 'ytApy'
  | 'totalYield'
  | 'rewardApr'
  | 'tvl'
  | 'volume'
  | 'maturity'
  | 'ptDiscount'
  | 'liquidity';

export function sortValue(m: PendleMarketView, key: PendleSortKey): number {
  switch (key) {
    case 'fixedApy': return m.fixedApyPct ?? -Infinity;
    case 'lpApy': return m.lpApyPct ?? -Infinity;
    case 'ytApy': return m.ytApyPct ?? -Infinity;
    case 'totalYield': return m.totalApyPct ?? -Infinity;
    case 'rewardApr': return m.rewardAprPct ?? -Infinity;
    case 'tvl': return m.details.totalTvl ?? -Infinity;
    case 'volume': return m.details.tradingVolume ?? -Infinity;
    case 'maturity': return m.daysToExpiry ?? Infinity; // نزدیک‌ترین اول
    case 'ptDiscount': return m.ptDiscountPct ?? -Infinity;
    case 'liquidity': return m.details.liquidity ?? -Infinity;
    default: return 0;
  }
}

export const PENDLE_SORT_LABELS: Record<PendleSortKey, string> = {
  fixedApy: 'بیشترین APY ثابت',
  lpApy: 'بیشترین LP APY',
  ytApy: 'بیشترین YT APY',
  totalYield: 'بیشترین بازده کل',
  rewardApr: 'بیشترین Reward APR',
  tvl: 'بیشترین TVL',
  volume: 'بیشترین حجم',
  maturity: 'نزدیک‌ترین سررسید',
  ptDiscount: 'بیشترین تخفیف PT',
  liquidity: 'بیشترین نقدشوندگی'
};

/** زنجیره‌های Pendle */
export const CHAIN_NAMES: Record<number, string> = {
  1: 'اتریوم',
  8453: 'بیس',
  42161: 'آربیتروم',
  10: 'اپتیمیزم',
  56: 'BSC',
  137: 'پالیگان',
  43114: 'آوالانچ',
  81457: 'بلاست',
  146: 'سونیک',
  130: 'یونی‌چین',
  324: 'zksync',
  59144: 'لاینا',
  100: 'گنوسیس',
  700: 'برلی' // گاهی اوقات 700 = Berachain
};

export function chainName(chainId: number): string {
  return CHAIN_NAMES[chainId] ?? `زنجیره ${chainId}`;
}

/** لینک رسمی بازار در Pendle */
export function pendleMarketLink(chainId: number, address: string): string {
  return `https://app.pendle.finance/trade/markets/${chainId}/${address}`;
}

/** تاریخ سررسید به‌صورت فارسی */
export function fmtExpiry(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(iso));
  } catch {
    return '—';
  }
}

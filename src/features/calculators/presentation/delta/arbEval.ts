/**
 * ارزیابی یک فرصت با ورودی‌های کاربر — مشترک بین «سود واقعی» و «اسکنر فاندینگ»
 * کارمزد: تیکر هر دو طرف (ورود هم‌زمان)؛ اسلیپیج: Long از asks، Short از bids دفتر سفارش زنده.
 */
import { realDeltaNet, slippagePct, type RealNetResult } from '@/features/calculators/domain';
import { DELTA_VENUE_LABELS, type DeltaVenue } from '@/features/calculators/data/deltaMarkets';
import type { Opportunity } from '@/features/calculators/data/fundingHistory';
import type { Stability } from '@/features/calculators/domain';
import type { Tone } from '@/shared/components/ui/Badge';

/** کارمزد تیکر محافظه‌کارانه وقتی API مقدار نمی‌دهد (٪) */
export const FALLBACK_TAKER_PCT = 0.05;
/** مارجین نگهداری محافظه‌کارانه وقتی API مقدار نمی‌دهد */
export const FALLBACK_MMF = 0.05;

export interface ArbInputs {
  capitalPerSide: number;
  leverage: number;
  holdDays: number;
  transferCostUsd: number;
}

export interface ArbEval extends RealNetResult {
  longFeePct: number;
  shortFeePct: number;
  longSlipPct: number | null;
  shortSlipPct: number | null;
  maxLeverage: number | null;
  /** اهرم انتخابی از سقف یکی از دو صرافی بیشتر است */
  overLeverage: boolean;
  /** کارمزد از API نیامد و مقدار محافظه‌کارانه فرض شد */
  feeAssumed: boolean;
  /** (وسط دفتر Short ÷ وسط دفتر Long − ۱) × ۱۰۰ — فقط گزارش؛ در سود خالص نیست */
  entryBasisPct: number | null;
}

/** spreadHourly = اسپرد مبنای پیش‌بینی؛ پیش‌فرض میانگین ۷ روز (یا نرخ لحظه‌ای با تاریخچهٔ ناکافی) */
export function evaluateArb(o: Opportunity, i: ArbInputs, spreadHourly = o.projectedHourly): ArbEval {
  const notional = Math.max(0, i.capitalPerSide) * Math.max(0, i.leverage);
  const longFeePct = o.long.takerFeePct ?? FALLBACK_TAKER_PCT;
  const shortFeePct = o.short.takerFeePct ?? FALLBACK_TAKER_PCT;
  const longSlipPct = o.longBook ? slippagePct(o.longBook.asks, notional, o.longBook.mid) : null;
  const shortSlipPct = o.shortBook ? slippagePct(o.shortBook.bids, notional, o.shortBook.mid) : null;
  const caps = [o.long.maxLeverage, o.short.maxLeverage].filter((v): v is number => v !== null && v > 0);
  const maxLeverage = caps.length ? Math.min(...caps) : null;
  return {
    ...realDeltaNet({
      capitalPerSide: i.capitalPerSide,
      leverage: i.leverage,
      holdDays: i.holdDays,
      transferCostUsd: i.transferCostUsd,
      spreadHourly,
      longFeePct,
      shortFeePct,
      longSlipPct,
      shortSlipPct,
      longMmf: o.long.maintenanceMarginFraction ?? FALLBACK_MMF,
      shortMmf: o.short.maintenanceMarginFraction ?? FALLBACK_MMF
    }),
    longFeePct,
    shortFeePct,
    longSlipPct,
    shortSlipPct,
    maxLeverage,
    overLeverage: maxLeverage !== null && i.leverage > maxLeverage,
    feeAssumed: o.long.takerFeePct === null || o.short.takerFeePct === null,
    entryBasisPct: o.longBook?.mid && o.shortBook?.mid ? (o.shortBook.mid / o.longBook.mid - 1) * 100 : null
  };
}

export type SpreadBasis = 'now' | 'd1' | 'd7' | 'd30';

export const SPREAD_BASIS_LABELS: Record<SpreadBasis, string> = {
  now: 'نرخ الان',
  d1: 'میانگین ۱ روز',
  d7: 'میانگین ۷ روز',
  d30: 'میانگین ۳۰ روز'
};

export interface ArbScenarioRow {
  basis: SpreadBasis;
  /** اختلاف فاندینگ سالانهٔ همین مبنا (٪)؛ null = تاریخچه ندارد */
  apr: number | null;
  /** سود خالص به ازای هر مدت holds؛ null = مبنا یا اسلیپیج نامعلوم */
  nets: (number | null)[];
}

/** سود خالص اگر اختلاف فاندینگ مثل الان / میانگین ۱، ۷ یا ۳۰ روز گذشته بماند — همه از دادهٔ واقعی همین جفت */
export function arbScenarios(o: Opportunity, i: ArbInputs, holds: readonly number[] = [1, 7, 30]): ArbScenarioRow[] {
  const aprs: Record<SpreadBasis, number | null> = {
    now: o.currentApr,
    d1: o.stats?.d1.avgApr ?? null,
    d7: o.stats?.d7.avgApr ?? null,
    d30: o.stats?.d30.avgApr ?? null
  };
  return (Object.keys(aprs) as SpreadBasis[]).map((basis) => {
    const apr = aprs[basis];
    return {
      basis,
      apr,
      nets: holds.map((holdDays) => (apr === null ? null : evaluateArb(o, { ...i, holdDays }, apr / 8760 / 100).net))
    };
  });
}

export const venueName = (v: DeltaVenue) => DELTA_VENUE_LABELS[v];

export const STABILITY: Record<Stability, { label: string; tone: Tone }> = {
  high: { label: 'پایدار', tone: 'gain' },
  medium: { label: 'نسبتاً پایدار', tone: 'warn' },
  low: { label: 'ناپایدار', tone: 'loss' },
  unknown: { label: 'تاریخچه ناکافی', tone: 'neutral' }
};

export const logoKindOf = (o: Opportunity) => (o.short.category === 'crypto' || o.short.category === 'other' ? 'crypto' : 'tradfi');

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
}

export function evaluateArb(o: Opportunity, i: ArbInputs): ArbEval {
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
      spreadHourly: o.projectedHourly,
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
    overLeverage: maxLeverage !== null && i.leverage > maxLeverage
  };
}

export const venueName = (v: DeltaVenue) => DELTA_VENUE_LABELS[v];

export const STABILITY: Record<Stability, { label: string; tone: Tone }> = {
  high: { label: 'پایدار', tone: 'gain' },
  medium: { label: 'نسبتاً پایدار', tone: 'warn' },
  low: { label: 'ناپایدار', tone: 'loss' },
  unknown: { label: 'تاریخچه ناکافی', tone: 'neutral' }
};

export const logoKindOf = (o: Opportunity) => (o.short.category === 'crypto' || o.short.category === 'other' ? 'crypto' : 'tradfi');

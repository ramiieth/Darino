/** جفت‌صرافی‌های دلتا نوترال و اجرا — مشترک بین «دلتا نوترال» و «اجرا و پایش دلتا» */
import type { DeltaVenue } from '@/features/calculators/data/deltaMarkets';

export type DeltaPair =
  | 'arcus-ondo'
  | 'arcus-lighter'
  | 'ondo-lighter'
  | 'arcus-lighterRh'
  | 'ondo-lighterRh'
  | 'arcus-hyperliquid'
  | 'lighterRh-hyperliquid'
  | 'lighterRh-lighter';

export const DELTA_PAIRS: { value: DeltaPair; label: string }[] = [
  { value: 'arcus-ondo', label: 'آرکوس ↔ اوندو پرپس' },
  { value: 'arcus-lighter', label: 'آرکوس ↔ لایتر' },
  { value: 'arcus-hyperliquid', label: 'آرکوس ↔ هایپرلیکوئید' },
  { value: 'ondo-lighter', label: 'اوندو پرپس ↔ لایتر' },
  { value: 'arcus-lighterRh', label: 'آرکوس ↔ لایتر رابین‌هود' },
  { value: 'ondo-lighterRh', label: 'اوندو پرپس ↔ لایتر رابین‌هود' },
  { value: 'lighterRh-hyperliquid', label: 'لایتر رابین‌هود ↔ هایپرلیکوئید' },
  { value: 'lighterRh-lighter', label: 'لایتر رابین‌هود ↔ لایتر' }
];

export const pairVenues = (p: DeltaPair) => p.split('-') as [DeltaVenue, DeltaVenue];

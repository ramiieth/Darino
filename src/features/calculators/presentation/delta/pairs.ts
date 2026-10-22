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
  | 'lighterRh-lighter'
  | 'qfex-ondo'
  | 'qfex-arcus'
  | 'qfex-hyperliquid'
  | 'txflow-arcus'
  | 'txflow-ondo'
  | 'txflow-lighter'
  | 'txflow-hyperliquid'
  | 'txflow-qfex';

export const DELTA_PAIRS: { value: DeltaPair; label: string }[] = [
  { value: 'arcus-ondo', label: 'آرکوس ↔ اوندو پرپس' },
  { value: 'arcus-lighter', label: 'آرکوس ↔ لایتر' },
  { value: 'arcus-hyperliquid', label: 'آرکوس ↔ هایپرلیکوئید' },
  { value: 'ondo-lighter', label: 'اوندو پرپس ↔ لایتر' },
  { value: 'arcus-lighterRh', label: 'آرکوس ↔ لایتر رابین‌هود' },
  { value: 'ondo-lighterRh', label: 'اوندو پرپس ↔ لایتر رابین‌هود' },
  { value: 'lighterRh-hyperliquid', label: 'لایتر رابین‌هود ↔ هایپرلیکوئید' },
  { value: 'lighterRh-lighter', label: 'لایتر رابین‌هود ↔ لایتر' },
  { value: 'qfex-ondo', label: 'کیوفکس ↔ اوندو پرپس' },
  { value: 'qfex-arcus', label: 'کیوفکس ↔ آرکوس' },
  { value: 'qfex-hyperliquid', label: 'کیوفکس ↔ هایپرلیکوئید' },
  { value: 'txflow-arcus', label: 'تی‌اکس‌فلو ↔ آرکوس' },
  { value: 'txflow-ondo', label: 'تی‌اکس‌فلو ↔ اوندو پرپس' },
  { value: 'txflow-lighter', label: 'تی‌اکس‌فلو ↔ لایتر' },
  { value: 'txflow-hyperliquid', label: 'تی‌اکس‌فلو ↔ هایپرلیکوئید' },
  { value: 'txflow-qfex', label: 'تی‌اکس‌فلو ↔ کیوفکس' }
];

export const pairVenues = (p: DeltaPair) => p.split('-') as [DeltaVenue, DeltaVenue];

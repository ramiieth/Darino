/**
 * ProvenanceBadge — where a number comes from (trust & transparency)
 * زنده · بوروس · محاسبه‌شده · شبیه‌سازی · تخمینی · نامشخص
 */
import { Badge, type Tone } from '@/shared/components/ui/Badge';

export type ProvenanceKind = 'live' | 'boros' | 'calculated' | 'simulated' | 'estimated' | 'na';

const TONE: Record<ProvenanceKind, Tone> = {
  live: 'gain',
  boros: 'brand',
  calculated: 'info',
  simulated: 'neutral',
  estimated: 'warn',
  na: 'neutral'
};

const DEFAULT_LABEL: Record<ProvenanceKind, string> = {
  live: 'زنده',
  boros: 'بوروس',
  calculated: 'محاسبه‌شده',
  simulated: 'شبیه‌سازی',
  estimated: 'تخمینی',
  na: 'نامشخص'
};

export function ProvenanceBadge({
  kind,
  label,
  className
}: {
  kind: ProvenanceKind;
  label?: string;
  className?: string;
}) {
  return (
    <Badge tone={TONE[kind]} className={className}>
      {label ?? DEFAULT_LABEL[kind]}
    </Badge>
  );
}

/**
 * ProvenanceBadge — where a number comes from (trust & transparency)
 * LIVE · BOROS · CALCULATED · SIMULATED · ESTIMATED · N/A
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
  live: 'LIVE',
  boros: 'BOROS',
  calculated: 'CALC',
  simulated: 'SIM',
  estimated: 'EST',
  na: 'N/A'
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
    <Badge tone={TONE[kind]} ltr className={className}>
      {label ?? DEFAULT_LABEL[kind]}
    </Badge>
  );
}

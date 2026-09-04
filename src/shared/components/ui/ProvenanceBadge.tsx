/**
 * ProvenanceBadge — نشان منبع داده (اعتماد و شفافیت)
 * LIVE · BOROS · CALCULATED · SIMULATED · ESTIMATED · N/A
 */
import { cn } from '@/shared/lib/cn';

export type ProvenanceKind =
  | 'live'
  | 'boros'
  | 'calculated'
  | 'simulated'
  | 'estimated'
  | 'na';

const STYLES: Record<ProvenanceKind, string> = {
  live: 'bg-emerald-400/10 text-emerald-600 ring-emerald-400/25 dark:text-emerald-300',
  boros: 'bg-accent/10 text-accent ring-accent/25',
  calculated: 'bg-info/10 text-info ring-info/25',
  simulated: 'bg-indigo-400/10 text-indigo-500 ring-indigo-400/25 dark:text-indigo-300',
  estimated: 'bg-warn/10 text-warn ring-warn/25',
  na: 'bg-line/5 text-muted ring-line/10'
};

const DEFAULT_LABEL: Record<ProvenanceKind, string> = {
  live: 'LIVE',
  boros: 'BOROS',
  calculated: 'CALCULATED',
  simulated: 'SIMULATED',
  estimated: 'ESTIMATED',
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
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[8px] font-black leading-4 ring-1',
        STYLES[kind],
        className
      )}
    >
      {label ?? DEFAULT_LABEL[kind]}
    </span>
  );
}

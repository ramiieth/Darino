import { cn } from '@/shared/lib/cn';
import type { PlateKind } from '../domain/types';

export const PLATE_FA: Record<PlateKind, string> = {
  arvand: 'پلاک اروند',
  'arvand-convertible': 'اروند · قابل تبدیل',
  customs: 'کف گمرک',
  transit: 'گذر موقت',
  national: 'پلاک ملی',
  unknown: 'نامشخص'
};

const STYLE: Record<PlateKind, string> = {
  arvand: 'bg-gold text-white',
  'arvand-convertible': 'bg-gold/90 text-white',
  customs: 'bg-card text-ink ring-1 ring-divider-strong',
  transit: 'bg-surface-2 text-muted',
  national: 'bg-accent text-on-accent',
  unknown: 'bg-surface-2 text-muted'
};

/** نشان نوع پلاک (طرح پلاک: لبه چپ رنگی) */
export function PlateBadge({ kind, className }: { kind: PlateKind; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-control px-2 py-0.5 text-2xs font-bold', STYLE[kind], className)}>
      <span aria-hidden className="h-2.5 w-1 rounded-sm bg-white/70" />
      {PLATE_FA[kind]}
    </span>
  );
}

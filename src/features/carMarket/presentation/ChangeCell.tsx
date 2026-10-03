import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { fmtCarPct } from './format';

/** درصد تغییر با رنگ و فلش؛ sub = خط دوم (مثلاً مبلغ) */
export function ChangeCell({
  pct,
  sub,
  strong = false,
  estimated = false
}: {
  pct: number | null | undefined;
  sub?: string;
  strong?: boolean;
  /** از درصد اعلامی منبع (نه دو Snapshot خودمان) */
  estimated?: boolean;
}) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return <span className="text-subtle">—</span>;
  const up = pct > 0.05;
  const down = pct < -0.05;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span
        className={cn('inline-flex items-center gap-1', strong && 'font-bold', up ? 'text-positive' : down ? 'text-negative' : 'text-muted')}
        title={estimated ? 'بر اساس درصد تغییر اعلامی car.ir' : undefined}
      >
        {up ? <TrendingUp aria-hidden className="h-3.5 w-3.5" /> : down ? <TrendingDown aria-hidden className="h-3.5 w-3.5" /> : null}
        {fmtCarPct(pct)}
        {estimated && <span className="text-2xs font-normal text-subtle">*</span>}
      </span>
      {sub && <span className="text-2xs text-muted">{sub}</span>}
    </span>
  );
}

/** ============================================================
 * Car Market — نمایش تغییر قیمت
 *  ChangeCell: متن رنگی + خط دوم (جدول‌ها)
 *  ChangePill: کپسول رنگی (کارت‌ها)
 * ============================================================ */
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { fmtCarPct } from './format';

const ok = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);

export function trendOf(v: number | null | undefined): 'up' | 'down' | 'flat' {
  if (!ok(v)) return 'flat';
  return v > 0.05 ? 'up' : v < -0.05 ? 'down' : 'flat';
}

const TEXT = { up: 'text-positive', down: 'text-negative', flat: 'text-muted' } as const;
const SOFT = { up: 'bg-gain/10 text-positive', down: 'bg-negative/10 text-negative', flat: 'bg-surface-2 text-muted' } as const;
const ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus } as const;

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
  if (!ok(pct)) return <span className="text-subtle">—</span>;
  const t = trendOf(pct);
  const Icon = ICON[t];
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className={cn('inline-flex items-center gap-0.5', strong && 'font-bold', TEXT[t])} title={estimated ? 'بر اساس درصد تغییر اعلامی car.ir' : undefined}>
        <Icon aria-hidden className="h-3.5 w-3.5" />
        <span className="num-ltr">{fmtCarPct(pct)}</span>
        {estimated && <span className="text-2xs font-normal text-subtle">*</span>}
      </span>
      {sub && <span className="text-2xs text-muted">{sub}</span>}
    </span>
  );
}

/** کپسول تغییر — label کوتاه کنار درصد (مثلاً «دلاری») */
export function ChangePill({
  pct,
  label,
  size = 'sm',
  estimated = false
}: {
  pct: number | null | undefined;
  label?: string;
  size?: 'sm' | 'md';
  estimated?: boolean;
}) {
  if (!ok(pct)) {
    return (
      <span className={cn('inline-flex items-center gap-1 rounded-full bg-surface-2 text-subtle', size === 'md' ? 'px-2.5 py-1 text-sm' : 'px-2 py-0.5 text-2xs')}>
        {label && <span>{label}</span>}—
      </span>
    );
  }
  const t = trendOf(pct);
  const Icon = ICON[t];
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full font-semibold', SOFT[t], size === 'md' ? 'px-2.5 py-1 text-sm' : 'px-2 py-0.5 text-2xs')}
      title={estimated ? 'بر اساس درصد تغییر اعلامی car.ir' : undefined}
    >
      {label && <span className="font-normal opacity-80">{label}</span>}
      <Icon aria-hidden className={size === 'md' ? 'h-4 w-4' : 'h-3 w-3'} />
      <span className="num-ltr">{fmtCarPct(pct)}</span>
      {estimated && <span className="font-normal opacity-70">*</span>}
    </span>
  );
}

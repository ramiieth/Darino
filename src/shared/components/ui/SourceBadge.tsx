import { cn } from '@/shared/lib/cn';
import type { PriceSource } from '@/shared/types';
import { t } from '@/shared/i18n/fa';

/** نشان منبع داده: زنده / اسنپ‌شات / N/A */
export function SourceBadge({ source, className }: { source: PriceSource; className?: string }) {
  if (source === 'live') {
    return (
      <span className={cn('badge bg-positive/10 text-positive', className)}>
        <span className="h-1.5 w-1.5 rounded-full bg-positive animate-pulse-soft" />
        {t('live')}
      </span>
    );
  }
  if (source === 'snapshot') {
    return (
      <span className={cn('badge bg-warn/10 text-warn', className)}>{t('snapshot')}</span>
    );
  }
  return <span className={cn('badge bg-muted/10 text-muted', className)}>N/A</span>;
}

/** نشان دسته دارایی */
export function KindDot({ kind }: { kind: 'crypto' | 'tokenized' | 'tradfi' }) {
  const color =
    kind === 'crypto'
      ? 'bg-violet-400'
      : kind === 'tokenized'
        ? 'bg-sky-400'
        : 'bg-emerald-400';
  return <span className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', color)} />;
}

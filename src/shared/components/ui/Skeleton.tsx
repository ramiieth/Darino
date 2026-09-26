import { cn } from '@/shared/lib/cn';
import { t } from '@/shared/i18n/fa';

/** Skeleton block — mirrors the shape of the content it stands in for */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton', className)} />;
}

/** Table skeleton */
export function TableSkeleton({ cols = 6, rows = 8 }: { cols?: number; rows?: number }) {
  return (
    <div className="divide-y divide-divider" aria-busy="true" aria-label={t('loading')}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-3">
          <Skeleton className="h-4 w-28 shrink-0" />
          {Array.from({ length: cols - 1 }).map((_, j) => (
            <Skeleton key={j} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Route-level loading: header + content rhythm (no brand splash between pages) */
export function PageSkeleton({ label }: { label?: string }) {
  return (
    <div className="space-y-8" aria-busy="true" aria-label={label ? `${label} — ${t('loading')}` : t('loading')}>
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-11 w-full max-w-md" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <TableSkeleton rows={6} cols={4} />
    </div>
  );
}

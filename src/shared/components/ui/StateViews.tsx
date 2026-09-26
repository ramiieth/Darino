/**
 * Unified state system — Loading · Empty · Error · Offline · Stale · Partial · N/A
 *
 *  Notice      inline, calm status line inside content (stale, partial, rate-limit, hint)
 *  EmptyState  nothing to show yet + what to do next
 *  ErrorState  recoverable failure — neutral surface, one retry action (no red screens)
 *  OfflineState no network and no cached data
 *  ListSkeleton / DeFiListSkeleton  loading placeholder with the real row rhythm
 */
import type { ReactNode } from 'react';
import { AlertTriangle, CircleCheck, Clock3, Inbox, Info, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { t } from '@/shared/i18n/fa';
import { cn } from '@/shared/lib/cn';

export type NoticeTone = 'info' | 'warn' | 'error' | 'success' | 'neutral' | 'stale';

const NOTICE_STYLE: Record<NoticeTone, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: 'bg-accent-soft/70', icon: 'text-accent', Icon: Info },
  warn: { box: 'bg-warn/8', icon: 'text-warn', Icon: AlertTriangle },
  error: { box: 'bg-negative/8', icon: 'text-negative', Icon: AlertTriangle },
  success: { box: 'bg-gain/8', icon: 'text-positive', Icon: CircleCheck },
  neutral: { box: 'bg-surface-2', icon: 'text-muted', Icon: Info },
  stale: { box: 'bg-warn/8', icon: 'text-warn', Icon: Clock3 }
};

export function Notice({
  tone = 'info',
  title,
  children,
  action,
  className,
  icon
}: {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  const s = NOTICE_STYLE[tone];
  const Icon = s.Icon;
  return (
    <div
      role={tone === 'error' || tone === 'warn' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-field px-3.5 py-3', s.box, className)}
    >
      <span className={cn('mt-0.5 shrink-0 [&_svg]:h-4 [&_svg]:w-4', s.icon)}>{icon ?? <Icon aria-hidden />}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="text-sm font-semibold text-ink">{title}</p>}
        {children && <div className={cn('text-xs leading-5 text-muted', title && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

function StateBlock({
  icon,
  title,
  hint,
  action,
  className,
  dashed
}: {
  icon: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
  dashed?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-card px-6 py-10 text-center',
        dashed ? 'border border-dashed border-divider-strong' : 'bg-surface-2/60',
        className
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-muted shadow-card [&_svg]:h-5 [&_svg]:w-5">
        {icon}
      </span>
      <p className="max-w-sm text-sm font-semibold text-ink">{title}</p>
      {hint && <p className="max-w-sm text-xs leading-5 text-muted">{hint}</p>}
      {action}
    </div>
  );
}

/** Recoverable error — calm, with retry. `subtle` renders an inline Notice. */
export function ErrorState({
  message,
  hint,
  onRetry,
  subtle = false,
  className
}: {
  message?: string;
  /** e.g. "آخرین به‌روزرسانی موفق: امروز ۰۲:۱۴" */
  hint?: string;
  onRetry?: () => void;
  subtle?: boolean;
  className?: string;
}) {
  const retry = onRetry && (
    <Button variant="outline" size="sm" onClick={onRetry} icon={<RefreshCw />}>
      {t('retry')}
    </Button>
  );
  if (subtle) {
    return (
      <Notice tone="warn" title={message ?? t('rateLimitNotice')} action={retry} className={className}>
        {hint}
      </Notice>
    );
  }
  return (
    <StateBlock
      icon={<AlertTriangle className="text-warn" />}
      title={message ?? t('errorGeneric')}
      hint={hint ?? 'داده‌های قبلی حفظ شده‌اند؛ اتصال دوباره به‌طور خودکار امتحان می‌شود.'}
      action={retry}
      className={className}
    />
  );
}

/** Empty — explains what is missing and what can be done */
export function EmptyState({
  message,
  hint,
  icon = 'empty',
  action,
  className
}: {
  message?: string;
  hint?: string;
  icon?: 'empty' | 'offline' | ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const node = icon === 'offline' ? <WifiOff /> : icon === 'empty' ? <Inbox /> : icon;
  return (
    <StateBlock
      dashed
      icon={node}
      title={message ?? t('noAssetsFound')}
      hint={hint}
      action={action}
      className={className}
    />
  );
}

/** Offline with no cached data */
export function OfflineState({ onRetry, className }: { onRetry?: () => void; className?: string }) {
  return (
    <StateBlock
      icon={<WifiOff />}
      title="اتصال اینترنت برقرار نیست"
      hint="هنوز داده‌ای برای نمایش آفلاین ذخیره نشده است. پس از اتصال، اطلاعات به‌طور خودکار بارگذاری می‌شود."
      action={
        onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} icon={<RefreshCw />}>
            {t('retry')}
          </Button>
        )
      }
      className={className}
    />
  );
}

/** Row skeleton with the real list rhythm (avatar · two lines · value) */
export function ListSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('divide-y divide-divider', className)} aria-busy="true" aria-label={t('loading')}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <div className="skeleton h-9 w-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-2/5" />
            <div className="skeleton h-3 w-1/4" />
          </div>
          <div className="skeleton h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

/** @deprecated use ListSkeleton */
export const DeFiListSkeleton = ListSkeleton;

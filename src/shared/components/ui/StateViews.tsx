import { AlertTriangle, Inbox, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { t } from '@/shared/i18n/fa';

/** حالت خطا با دکمه «تلاش مجدد» — زبان انسانی، حفظ بافت کاربر */
export function ErrorState({
  message,
  hint,
  onRetry,
  subtle = false
}: {
  message?: string;
  /** توضیح تکمیلی — مثلاً «آخرین به‌روزرسانی موفق: امروز ۰۲:۱۴» */
  hint?: string;
  onRetry?: () => void;
  /** حالت کم‌رنگ: فقط بنر هشدار بدون بلوک کامل */
  subtle?: boolean;
}) {
  if (subtle) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-warn/20 bg-warn/8 px-3.5 py-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warn" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold leading-5 text-ink">{message ?? t('rateLimitNotice')}</p>
          {hint && <p className="text-[10px] font-medium leading-5 text-muted">{hint}</p>}
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-line/10 bg-card px-2 py-1 text-[10px] font-bold text-accent transition-colors hover:bg-surface-2"
          >
            <RefreshCw className="h-3 w-3" />
            {t('retry')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-line/10 bg-card px-6 py-10 text-center shadow-card">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-negative/8">
        <AlertTriangle className="h-5 w-5 text-negative" />
      </div>
      <p className="max-w-xs text-[13px] font-bold leading-6 text-ink">
        {message ?? t('errorGeneric')}
      </p>
      {hint && <p className="max-w-xs text-[11px] font-medium leading-5 text-muted">{hint}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          {t('retry')}
        </Button>
      )}
    </div>
  );
}

/** حالت خالی — توضیح می‌دهد چه چیزی نیست و چه کاری می‌توان کرد */
export function EmptyState({
  message,
  hint,
  icon = 'empty'
}: {
  message?: string;
  hint?: string;
  icon?: 'empty' | 'offline';
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line/15 bg-surface-2/50 px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-card shadow-card">
        {icon === 'offline' ? (
          <WifiOff className="h-5 w-5 text-muted" />
        ) : (
          <Inbox className="h-5 w-5 text-muted" />
        )}
      </div>
      <p className="max-w-xs text-[13px] font-bold leading-6 text-ink">
        {message ?? t('noAssetsFound')}
      </p>
      {hint && <p className="max-w-xs text-[11px] font-medium leading-5 text-muted">{hint}</p>}
    </div>
  );
}

/** اسکلتون لیست — ردیف‌های آرام و ظریف */
export function DeFiListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-2xl border border-line/8 bg-card p-3.5 shadow-card"
        >
          <div className="skeleton h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-2/5 rounded" />
            <div className="skeleton h-3 w-3/5 rounded" />
          </div>
          <div className="skeleton h-5 w-20 rounded-md" />
        </div>
      ))}
    </div>
  );
}

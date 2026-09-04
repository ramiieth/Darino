/**
 * FreshnessBar — نوار وضعیت تازگی داده‌ها (زنده/کش/خطا) + آخرین همگام‌سازی + دکمه تازه‌سازی
 * در همه صفحات داده‌محور استفاده می‌شود تا کاربر بداند اطلاعات همیشه به‌روز است.
 */
import { RefreshCw, Wifi, Database, TriangleAlert, Loader2 } from 'lucide-react';
import { fmtTime, fmtRelativeAge } from '@/shared/utils/formatters';
import { useNow } from '@/shared/hooks/useNow';
import { cn } from '@/shared/lib/cn';

export interface FreshnessBarProps {
  /** زمان آخرین دریافت موفق داده */
  loadedAt?: number | null;
  /** داده از کش/اسنپ‌شات است (زنده نیست) */
  stale?: boolean;
  /** خطای ارتباط */
  error?: boolean;
  /** همگام‌سازی در جریان است */
  syncing?: boolean;
  /** برچسب منبع داده — مثلاً «CoinGecko» یا «Pendle API» */
  sourceLabel?: string;
  /** فاصله به‌روزرسانی خودکار برای نمایش — میلی‌ثانیه */
  autoMs?: number;
  onRefresh?: () => void;
  className?: string;
}

export function FreshnessBar({
  loadedAt,
  stale,
  error,
  syncing,
  sourceLabel,
  autoMs,
  onRefresh,
  className
}: FreshnessBarProps) {
  // ساعت زنده — سن نسبی داده («X ثانیه پیش») بدون re-render فریز نمی‌ماند
  const now = useNow(10_000);
  const status: 'live' | 'cache' | 'error' | 'syncing' = error
    ? 'error'
    : syncing
      ? 'syncing'
      : stale
        ? 'cache'
        : loadedAt
          ? 'live'
          : 'syncing';

  const dotClass =
    status === 'live'
      ? 'bg-emerald-400'
      : status === 'cache'
        ? 'bg-amber-400'
        : status === 'error'
          ? 'bg-rose-500'
          : 'bg-sky-400 animate-pulse';

  const statusText =
    status === 'live'
      ? 'داده زنده'
      : status === 'cache'
        ? 'داده کش‌شده'
        : status === 'error'
          ? 'خطای ارتباط'
          : 'در حال همگام‌سازی';

  const statusTextClass =
    status === 'live'
      ? 'text-emerald-400'
      : status === 'cache'
        ? 'text-amber-400'
        : status === 'error'
          ? 'text-rose-400'
          : 'text-sky-400';

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line/10 bg-card px-3.5 py-2 text-[10px] font-bold shadow-card',
        className
      )}
    >
      <span className={cn('flex items-center gap-1.5', statusTextClass)}>
        <span className="relative flex h-2 w-2">
          {status === 'live' && (
            <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-60', dotClass, 'animate-ping')} />
          )}
          <span className={cn('relative inline-flex h-2 w-2 rounded-full', dotClass)} />
        </span>
        {statusText}
      </span>

      {sourceLabel && <span className="text-muted/70">منبع: {sourceLabel}</span>}

      {loadedAt ? (
        <span className="text-muted" title={new Date(loadedAt).toLocaleString('fa-IR')}>
          آخرین همگام‌سازی: {fmtTime(loadedAt)} ({fmtRelativeAge(loadedAt, now)})
        </span>
      ) : (
        <span className="text-muted/60">هنوز داده‌ای دریافت نشده</span>
      )}

      {autoMs && status !== 'error' && (
        <span className="text-muted/70">به‌روزرسانی خودکار: هر {fmtAutoInterval(autoMs)}</span>
      )}

      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={syncing}
          className="ms-auto flex items-center gap-1 rounded-lg bg-ink/5 px-2 py-1 text-accent transition hover:bg-ink/10 disabled:opacity-50"
          aria-label="تازه‌سازی داده‌ها"
        >
          {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          تازه‌سازی
        </button>
      )}

      {status === 'cache' && <Database className="h-3 w-3 text-amber-400/70" />}
      {status === 'error' && <TriangleAlert className="h-3 w-3 text-rose-400/70" />}
      {status === 'live' && <Wifi className="h-3 w-3 text-emerald-400/70" />}
    </div>
  );
}

/** فاصله خودکار به فارسی — «۲ دقیقه»، «۵ دقیقه» */
function fmtAutoInterval(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${toFa(min)} دقیقه`;
  const hr = Math.round(min / 60);
  return `${toFa(hr)} ساعت`;
}

function toFa(input: number): string {
  return String(input).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

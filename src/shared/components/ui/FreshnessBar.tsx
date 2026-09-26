/**
 * FreshnessBar — data freshness line: live / cached / error / syncing,
 * last successful sync, auto-refresh cadence and a refresh action.
 * Quiet by design: a single line of caption text, status = dot + label.
 */
import { RefreshCw } from 'lucide-react';
import { fmtTime, fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { useNow } from '@/shared/hooks/useNow';
import { StatusDot, type Tone } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { cn } from '@/shared/lib/cn';

export interface FreshnessBarProps {
  /** Last successful fetch */
  loadedAt?: number | null;
  /** Data comes from cache/snapshot (not live) */
  stale?: boolean;
  /** Connection error */
  error?: boolean;
  /** Sync in progress */
  syncing?: boolean;
  /** Source label, e.g. "CoinGecko" */
  sourceLabel?: string;
  /** Auto-refresh interval (ms) */
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
  // live clock so the relative age never freezes
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

  const tone: Tone = status === 'live' ? 'gain' : status === 'cache' ? 'warn' : status === 'error' ? 'loss' : 'info';
  const label =
    status === 'live'
      ? 'داده زنده'
      : status === 'cache'
        ? 'داده ذخیره‌شده'
        : status === 'error'
          ? 'اتصال برقرار نیست'
          : 'در حال همگام‌سازی';

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted', className)}
    >
      <StatusDot tone={tone} label={label} pulse={status === 'syncing'} />
      {sourceLabel && <span>منبع: {sourceLabel}</span>}
      {loadedAt ? (
        <span title={new Date(loadedAt).toLocaleString('fa-IR')}>
          به‌روزرسانی {fmtRelativeAge(loadedAt, now)} <span className="text-subtle">({fmtTime(loadedAt)})</span>
        </span>
      ) : (
        <span className="text-subtle">هنوز داده‌ای دریافت نشده</span>
      )}
      {autoMs && status !== 'error' && (
        <span className="hidden text-subtle sm:inline">خودکار هر {fmtAutoInterval(autoMs)}</span>
      )}
      {onRefresh && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          loading={syncing}
          icon={<RefreshCw />}
          className="ms-auto -me-2 text-accent"
          aria-label="تازه‌سازی داده‌ها"
        >
          تازه‌سازی
        </Button>
      )}
    </div>
  );
}

/** «۲ دقیقه»، «۵ دقیقه» */
function fmtAutoInterval(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${toFaDigits(min)} دقیقه`;
  return `${toFaDigits(Math.round(min / 60))} ساعت`;
}

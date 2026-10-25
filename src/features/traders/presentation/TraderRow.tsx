/**
 * ردیف یک تریدر — همه از خلاصهٔ سرور (بدون درخواست جدا از مرورگر برای هر ردیف)
 */
import { Bell, Trash2 } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { IconButton } from '@/shared/components/ui/Button';
import { Metric, MetricGrid, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { cn } from '@/shared/lib/cn';
import { toFaDigits } from '@/shared/utils/formatters';
import type { Candidate } from '../domain/candidates';
import { MIN_SAMPLE } from '../domain/report';
import { isSteady, type TraderSummary } from '../domain/summary';
import { fmtHold, shortAddress } from './format';

/** حداقل معاملهٔ کامل برای نمایش نرخ برد در فهرست (کارنامه با کمتر از MIN_SAMPLE هشدار می‌دهد) */
export const LIST_MIN_TRADES = 10;

export function TraderRow({
  address,
  name,
  rank,
  leader,
  summary,
  loading,
  following,
  onOpen,
  onRemove,
  onToggleFollow
}: {
  address: string;
  name?: string | null;
  rank?: number;
  leader?: Candidate;
  summary?: TraderSummary;
  loading?: boolean;
  following?: boolean;
  onOpen: () => void;
  onRemove?: () => void;
  onToggleFollow?: () => void;
}) {
  const s = summary;
  const totalPnl = leader?.windows.allTime.pnl ?? s?.totalPnl ?? null;
  const pending = !s && loading;
  const wait = <Skeleton className="h-4 w-14" />;

  return (
    <Surface className="flex h-full items-start gap-1 p-4 transition-shadow hover:shadow-card">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-start">
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {rank !== undefined && <span className="text-xs font-bold text-subtle">#{toFaDigits(rank)}</span>}
          <span className="font-bold text-ink">{name ?? <bdi dir="ltr" className="font-latin text-sm">{shortAddress(address)}</bdi>}</span>
          {name && <bdi dir="ltr" className="font-latin text-xs text-muted">{shortAddress(address)}</bdi>}
          {isSteady(s) && <Badge tone="brand">ثابت‌قدم</Badge>}
          {s?.copyability === 'manual' && <Badge tone="gain">قابل کپی دستی</Badge>}
          {s?.copyability === 'fast' && <Badge tone="warn">پرتکرار</Badge>}
          {s?.makerLike && <Badge tone="info">احتمالاً مارکت‌میکر</Badge>}
        </div>
        <MetricGrid cols={4} className="[&_.persian-amount]:flex-nowrap [&_.persian-amount]:whitespace-nowrap">
          <Metric size="sm" label="سود کل حساب" value={totalPnl === null && pending ? wait : <MoneyValue value={totalPnl} compact signed tone="auto" />} />
          <Metric
            size="sm"
            label={leader ? 'سود ۳۰ روز' : 'ماه‌های سودده'}
            value={leader ? <MoneyValue value={leader.windows.month.pnl} compact signed tone="auto" /> : s ? `${toFaDigits(s.positiveMonths)} از ${toFaDigits(s.months)}` : pending ? wait : '—'}
            sub={leader ? <PercentValue value={leader.windows.month.roi * 100} digits={1} /> : undefined}
          />
          <Metric
            size="sm"
            label="افت ۱۲ ماه"
            value={s ? <PercentValue value={s.maxDrawdownPct === null ? null : -s.maxDrawdownPct} digits={0} tone="none" className={cn(s.maxDrawdownPct !== null && s.maxDrawdownPct > 50 && 'text-negative')} /> : pending ? wait : '—'}
            sub={leader && s ? `${toFaDigits(s.positiveMonths)} از ${toFaDigits(s.months)} ماه سودده` : undefined}
          />
          <Metric
            size="sm"
            label="نرخ برد"
            value={
              s ? (
                s.closedCount >= LIST_MIN_TRADES && s.winRate !== null ? (
                  <PercentValue value={s.winRate} signed={false} digits={0} tone="none" />
                ) : (
                  <span className="text-xs font-medium text-muted">داده کافی نیست</span>
                )
              ) : pending ? (
                <span className="text-xs font-medium text-subtle">در حال تحلیل…</span>
              ) : (
                '—'
              )
            }
            sub={s && s.closedCount >= LIST_MIN_TRADES ? `${toFaDigits(s.closedCount)} معامله${s.closedCount < MIN_SAMPLE ? ' (کم)' : ''} · نگهداری ${fmtHold(s.medianHoldHours)}` : undefined}
          />
        </MetricGrid>
      </button>
      <div className="flex shrink-0 flex-col gap-1">
        {onToggleFollow && (
          <IconButton aria-label={following ? 'لغو اعلان این تریدر' : 'اعلان پوزیشن‌های این تریدر'} size="sm" onClick={onToggleFollow} className={cn(following && 'text-accent hover:text-accent')}>
            <Bell className={cn(following && 'fill-current')} />
          </IconButton>
        )}
        {onRemove && (
          <IconButton aria-label="حذف از آدرس‌های من" size="sm" onClick={onRemove}>
            <Trash2 />
          </IconButton>
        )}
      </div>
    </Surface>
  );
}

/**
 * Audit trail — append-only event history (immutable)
 */
import { useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge, type Tone } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { useAccountingData } from './AccountingContext';
import { formatDualDate } from '@/shared/utils/jalali';
import { toFaDigits } from '@/shared/utils/formatters';

const KIND_FA: Record<string, string> = {
  opening: 'افتتاحیه',
  deposit: 'واریز',
  withdraw: 'برداشت',
  expense: 'هزینه',
  buy: 'خرید رمزارز',
  sell: 'فروش رمزارز',
  manual: 'سند دستی',
  reversal: 'ثبت معکوس'
};

const KIND_TONE: Record<string, Tone> = {
  opening: 'brand',
  deposit: 'gain',
  withdraw: 'warn',
  expense: 'loss',
  buy: 'gain',
  sell: 'info',
  manual: 'neutral',
  reversal: 'loss'
};

export function AuditPanel() {
  const { events, entries } = useAccountingData();
  const [limit, setLimit] = useState(60);
  const sorted = useMemo(() => [...events].sort((a, b) => b.id - a.id), [events]);

  return (
    <div className="space-y-4">
      <Notice tone="neutral" icon={<Lock />} title="تاریخچه غیرقابل تغییر">
        همه سندها و رویدادها فقط‌افزودنی‌اند؛ ویرایش یا حذفی وجود ندارد. هر اصلاح با «سند معکوس» ثبت می‌شود و ردپای کامل (سند
        اصلی + معکوس) باقی می‌ماند.
      </Notice>

      {sorted.length === 0 ? (
        <EmptyState message="رویدادی ثبت نشده است" />
      ) : (
        <Surface className="px-4 md:px-5">
          <ol className="divide-y divide-divider" aria-label="رویدادها">
            {sorted.slice(0, limit).map((ev) => {
              const entry = entries.find((e) => e.id === ev.refId);
              return (
                <li key={ev.id} className="flex items-start gap-3 py-3">
                  <Badge tone={KIND_TONE[ev.kind] ?? 'neutral'} className="mt-0.5 shrink-0">
                    {KIND_FA[ev.kind] ?? ev.kind}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-6 text-ink">{ev.detail}</p>
                    <p className="text-xs text-muted">
                      {formatDualDate(ev.at)}
                      {entry ? ` · سند #${entry.id}` : ''}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Surface>
      )}
      {sorted.length > limit && (
        <Button variant="ghost" size="sm" className="w-full text-accent" onClick={() => setLimit((l) => l + 60)}>
          رویدادهای قدیمی‌تر ({toFaDigits(sorted.length - limit)})
        </Button>
      )}
    </div>
  );
}

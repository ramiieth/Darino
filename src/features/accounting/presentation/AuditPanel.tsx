/**
 * ممیزی (Audit Trail) — تاریخچه رویدادها؛ فقط‌افزودنی و غیرقابل تغییر
 */
import { ShieldCheck, Lock } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { useAccounting } from '@/features/accounting/data/useAccounting';
import { fmtUSD } from '@/shared/utils/formatters';
import { formatDualDate } from '@/shared/utils/jalali';
import { cn } from '@/shared/lib/cn';

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

const KIND_TONE: Record<string, string> = {
  opening: 'bg-accent/10 text-accent ring-accent/20',
  deposit: 'bg-positive/10 text-positive ring-positive/20',
  withdraw: 'bg-warn/10 text-warn ring-warn/20',
  expense: 'bg-negative/10 text-negative ring-negative/20',
  buy: 'bg-positive/10 text-positive ring-positive/20',
  sell: 'bg-info/10 text-info ring-info/20',
  manual: 'bg-line/5 text-muted ring-line/10',
  reversal: 'bg-negative/10 text-negative ring-negative/20'
};

export function AuditPanel() {
  const { events, entries, cashBalance } = useAccounting();

  return (
    <div className="space-y-3">
      <GlassCard variant="soft" className="p-3.5">
        <div className="flex items-start gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <ShieldCheck className="h-4.5 w-4.5" />
          </span>
          <div>
            <h4 className="text-[12px] font-black text-ink">تاریخچه غیرقابل تغییر</h4>
            <p className="text-[10px] font-medium leading-5 text-muted">
              همه سندها و رویدادها فقط‌افزودنی هستند: هیچ ویرایش یا حذفی وجود ندارد. هر اصلاح با
              «سند معکوس» ثبت می‌شود و ردپای کامل (سند اصلی + معکوس) در ممیزی باقی می‌ماند.
            </p>
          </div>
        </div>
      </GlassCard>

      <GlassCard variant="soft" className="p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="flex items-center gap-1.5 text-[12px] font-black text-ink">
            <Lock className="h-3.5 w-3.5 text-muted" /> رویدادها ({events.length})
          </h4>
          <span className="num-ltr text-[10px] font-bold text-muted">نقد: {fmtUSD(cashBalance)}</span>
        </div>
        {events.length === 0 ? (
          <p className="text-[11px] font-medium text-muted">رویدادی ثبت نشده است</p>
        ) : (
          <div className="space-y-1.5">
            {[...events]
              .sort((a, b) => b.id - a.id)
              .slice(0, 60)
              .map((ev) => {
                const entry = entries.find((e) => e.id === ev.refId);
                return (
                  <div key={ev.id} className="flex items-center gap-2.5 rounded-xl bg-line/5 px-3 py-2">
                    <span
                      className={cn(
                        'badge shrink-0 ring-1',
                        KIND_TONE[ev.kind] ?? 'bg-line/5 text-muted ring-line/10'
                      )}
                    >
                      {KIND_FA[ev.kind] ?? ev.kind}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-bold text-ink">{ev.detail}</p>
                      <p className="text-[9px] font-medium text-muted">
                        {formatDualDate(ev.at)} {entry ? `· سند #${entry.id}` : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </GlassCard>
    </div>
  );
}

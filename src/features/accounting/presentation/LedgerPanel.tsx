/**
 * دفتر کل (General Ledger) — مانده هر حساب
 */
import { useMemo } from 'react';
import { BookOpenText } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { useAccounting } from '@/features/accounting/data/useAccounting';
import { fmtUSD } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

const TYPE_FA: Record<string, string> = {
  asset: 'دارایی',
  liability: 'بدهی',
  equity: 'سرمایه',
  income: 'درآمد',
  expense: 'هزینه'
};

export function LedgerPanel() {
  const { ledger } = useAccounting();

  const sorted = useMemo(
    () =>
      [...ledger].sort((a, b) => {
        const order: Record<string, number> = { asset: 0, equity: 1, income: 2, expense: 3, liability: 4 };
        const d = (order[a.account.type] ?? 9) - (order[b.account.type] ?? 9);
        if (d !== 0) return d;
        return a.account.key.localeCompare(b.account.key);
      }),
    [ledger]
  );

  const totalDebit = sorted.reduce((s, r) => s + r.debitTotal, 0);
  const totalCredit = sorted.reduce((s, r) => s + r.creditTotal, 0);

  return (
    <GlassCard variant="soft" className="p-3.5">
      <h4 className="mb-2.5 flex items-center gap-1.5 text-[12px] font-black text-ink">
        <BookOpenText className="h-4 w-4 text-accent" /> دفتر کل
      </h4>
      <div className="overflow-hidden rounded-xl border border-line/10 bg-card shadow-card">
        {sorted.map((r, i) => (
          <div
            key={r.account.key}
            className={cn(
              'flex items-center gap-2 px-3 py-2 transition-colors hover:bg-surface-2/50',
              i > 0 && 'border-t border-line/8'
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-extrabold text-ink">{r.account.nameFa}</p>
              <p className="tnum text-[9px] font-medium text-muted">
                {r.account.key} · {TYPE_FA[r.account.type] ?? r.account.type}
              </p>
            </div>
            <div className="hidden text-end sm:block">
              <p className="num-ltr text-[9px] font-medium text-muted">بدهکار {fmtUSD(r.debitTotal)}</p>
              <p className="num-ltr text-[9px] font-medium text-muted">بستانکار {fmtUSD(r.creditTotal)}</p>
            </div>
            <div className="text-end">
              <p className="text-[9px] font-medium text-muted">مانده</p>
              <p
                className={cn(
                  'num-ltr text-[12px] font-black',
                  Math.abs(r.balance) < 1e-6
                    ? 'text-muted'
                    : r.balance > 0
                      ? 'text-positive'
                      : 'text-negative'
                )}
              >
                {fmtUSD(r.balance)}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-line/10 bg-surface-2/50 p-2.5 text-[10px] font-bold">
        <div className="flex items-center justify-between gap-1 rounded-lg bg-card px-2.5 py-1.5 shadow-card">
          <span className="text-muted">جمع بدهکارها</span>
          <span className="num-ltr text-ink">{fmtUSD(totalDebit)}</span>
        </div>
        <div className="flex items-center justify-between gap-1 rounded-lg bg-card px-2.5 py-1.5 shadow-card">
          <span className="text-muted">جمع بستانکارها</span>
          <span className="num-ltr text-ink">{fmtUSD(totalCredit)}</span>
        </div>
      </div>
    </GlassCard>
  );
}

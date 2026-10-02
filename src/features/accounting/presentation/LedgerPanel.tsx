/**
 * خلاصهٔ حساب‌ها — موجودی هر حساب، گروه‌بندی‌شده بر اساس نوع.
 * کنترل توازن ورودی/خروجی‌ها فقط به‌صورت یک پیام ساده نمایش داده می‌شود.
 */
import { useMemo } from 'react';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { useAccountingData } from './AccountingContext';
import { accountNameFa } from '@/features/accounting/domain/types';
import { EPS } from '@/features/accounting/domain/engine';
import { cn } from '@/shared/lib/cn';

const TYPE_FA: Record<string, string> = {
  asset: 'دارایی‌ها',
  equity: 'سرمایهٔ واریزی',
  income: 'سود و زیان',
  expense: 'هزینه‌ها',
  liability: 'بدهی‌ها'
};
const TYPE_ORDER = ['asset', 'equity', 'income', 'expense', 'liability'];

export function LedgerPanel() {
  const { ledger, accounts } = useAccountingData();

  const groups = useMemo(() => {
    const sorted = [...ledger].sort((a, b) => a.account.key.localeCompare(b.account.key));
    return TYPE_ORDER.map((type) => ({ type, rows: sorted.filter((r) => r.account.type === type) })).filter(
      (g) => g.rows.length > 0
    );
  }, [ledger]);

  const totalDebit = ledger.reduce((s, r) => s + r.debitTotal, 0);
  const totalCredit = ledger.reduce((s, r) => s + r.creditTotal, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < Math.max(EPS, 1e-6);

  return (
    <div className="space-y-4">
      <div
        className={cn(
          'flex items-center gap-2 rounded-field px-3.5 py-3 text-sm',
          balanced ? 'bg-gain/8 text-ink' : 'bg-negative/8 text-ink'
        )}
        role="status"
      >
        {balanced ? (
          <CircleCheck aria-hidden className="h-4 w-4 shrink-0 text-positive" />
        ) : (
          <TriangleAlert aria-hidden className="h-4 w-4 shrink-0 text-negative" />
        )}
        <span className="font-semibold">
          {balanced ? 'حساب‌ها درست است و با هم جور است' : 'حساب‌ها با هم جور نیست — یک تراکنش ناقص وجود دارد'}
        </span>
      </div>

      <Surface className="overflow-hidden">
        <table className="data-table">
          <caption className="sr-only">خلاصهٔ حساب‌ها — موجودی هر حساب</caption>
          <thead>
            <tr>
              <th scope="col" className="!ps-4 md:!ps-5">حساب</th>
              <th scope="col" className="col-num !pe-4 md:!pe-5">موجودی</th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.type}>
              <tr className="!bg-transparent">
                <th
                  scope="rowgroup"
                  colSpan={2}
                  className="bg-surface-2/60 px-4 py-2 text-start text-xs font-semibold text-muted md:px-5"
                >
                  {TYPE_FA[g.type] ?? g.type}
                </th>
              </tr>
              {g.rows.map((r) => {
                const zero = Math.abs(r.balance) < 1e-6;
                return (
                  <tr key={r.account.key}>
                    <td className="!ps-4 md:!ps-5">
                      <p className="font-semibold text-ink">{accountNameFa(r.account.key, accounts)}</p>
                    </td>
                    <td className={cn('col-num !pe-4 font-semibold md:!pe-5', zero ? 'text-subtle' : 'text-ink')}>
                      <MoneyValue value={r.balance} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </Surface>
      <p className="text-xs text-muted">
        موجودی هر حساب جمع همهٔ تراکنش‌های آن است. برای رمزارزها، عدد نشان‌دهندهٔ هزینهٔ خرید است، نه ارزش روز.
      </p>
    </div>
  );
}

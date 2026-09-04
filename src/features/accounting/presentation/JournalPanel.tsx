/**
 * معاملات — دفتر روزنامه (Journal)
 *  - اقدامات سریع: واریز / برداشت / هزینه / سند دستی (تاریخ هوشمند شمسی-میلادی)
 *  - فهرست سندها: فقط‌افزودنی — اصلاح فقط با «ثبت معکوس»
 */
import { useMemo, useState } from 'react';
import { Plus, Undo2, HandCoins, ArrowUpFromLine, Receipt, PenLine } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { SmartDateField } from '@/shared/components/ui/SmartDateField';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { useAccounting } from '@/features/accounting/data/useAccounting';
import { accountNameFa, type JournalLine } from '@/features/accounting/domain/types';
import { formatDualDate, formatJalali } from '@/shared/utils/jalali';
import { fmtUSD } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

type Quick = 'deposit' | 'withdraw' | 'expense' | 'manual';

const QUICK_TABS = [
  { value: 'deposit' as const, label: 'واریز', icon: <HandCoins className="h-3.5 w-3.5" /> },
  { value: 'withdraw' as const, label: 'برداشت', icon: <ArrowUpFromLine className="h-3.5 w-3.5" /> },
  { value: 'expense' as const, label: 'هزینه', icon: <Receipt className="h-3.5 w-3.5" /> },
  { value: 'manual' as const, label: 'سند دستی', icon: <PenLine className="h-3.5 w-3.5" /> }
];

const SOURCE_FA: Record<string, string> = {
  opening: 'افتتاحیه',
  deposit: 'واریز',
  withdraw: 'برداشت',
  expense: 'هزینه',
  buy: 'خرید',
  sell: 'فروش',
  manual: 'دستی',
  reversal: 'معکوس'
};

export function JournalPanel() {
  const { entries, accounts, cashBalance, deposit, withdraw, expense, addManual, reverse } =
    useAccounting();

  const [quick, setQuick] = useState<Quick>('deposit');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState<number | null>(Date.now());

  /* سند دستی: دو خط بدهکار/بستانکار */
  const [debitAcc, setDebitAcc] = useState('expense:misc');
  const [creditAcc, setCreditAcc] = useState('cash:usd');
  const [manualAmount, setManualAmount] = useState('');

  const accountOptions = useMemo(
    () => accounts.filter((a) => a.type !== 'liability'),
    [accounts]
  );

  const submit = async () => {
    const usd = Number(amount || manualAmount);
    const d = date ?? Date.now();
    if (quick === 'manual') {
      const lines: JournalLine[] = [
        { account: debitAcc, debit: usd, credit: 0 },
        { account: creditAcc, debit: 0, credit: usd }
      ];
      if (await addManual(lines, d, memo.trim() || 'سند دستی')) {
        setAmount('');
        setManualAmount('');
        setMemo('');
      }
      return;
    }
    const ok =
      quick === 'deposit'
        ? await deposit(usd, d, memo.trim() || undefined)
        : quick === 'withdraw'
          ? await withdraw(usd, d, memo.trim() || undefined)
          : await expense(usd, d, 'expense:misc', memo.trim() || undefined);
    if (ok) {
      setAmount('');
      setMemo('');
    }
  };

  const sorted = useMemo(() => [...entries].sort((a, b) => b.id - a.id), [entries]);

  return (
    <div className="space-y-3">
      {/* فرم ثبت */}
      <GlassCard className="p-3.5">
        <SegmentedControl
          options={QUICK_TABS}
          value={quick}
          onChange={setQuick}
          className="mb-3"
        />
        <div className="space-y-2.5">
          {quick === 'manual' ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-muted">حساب بدهکار</label>
                  <select
                    value={debitAcc}
                    onChange={(e) => setDebitAcc(e.target.value)}
                    className="h-10 w-full rounded-xl border border-line/15 bg-card px-3 text-xs font-bold text-ink shadow-card outline-none hover:border-line/25"
                  >
                    {accountOptions.map((a) => (
                      <option key={a.key} value={a.key}>
                        {a.nameFa}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-muted">حساب بستانکار</label>
                  <select
                    value={creditAcc}
                    onChange={(e) => setCreditAcc(e.target.value)}
                    className="h-10 w-full rounded-xl border border-line/15 bg-card px-3 text-xs font-bold text-ink shadow-card outline-none hover:border-line/25"
                  >
                    {accountOptions.map((a) => (
                      <option key={a.key} value={a.key}>
                        {a.nameFa}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <Input
                dir="ltr"
                inputMode="decimal"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                placeholder="مبلغ ($)"
                className="h-10 text-xs text-start"
              />
            </>
          ) : (
            <Input
              dir="ltr"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="مبلغ ($)"
              className="h-10 text-xs text-start"
            />
          )}
          <SmartDateField value={date} onChange={setDate} label="تاریخ سند" />
          <Input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="شرح (اختیاری)"
            className="h-10 text-xs"
          />
          <div className="flex items-center justify-between rounded-xl border border-line/10 bg-surface-2/60 px-3 py-2">
            <span className="text-[10px] font-bold text-muted">موجودی نقد فعلی</span>
            <span className="num-ltr text-[12px] font-black text-ink">{fmtUSD(cashBalance)}</span>
          </div>
          <Button onClick={() => void submit()} className="w-full" size="sm">
            <Plus className="h-3.5 w-3.5" /> ثبت سند
          </Button>
        </div>
      </GlassCard>

      {/* فهرست سندها */}
      <GlassCard variant="soft" className="p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-[12px] font-black text-ink">دفتر روزنامه ({sorted.length})</h4>
          <span className="badge bg-surface-2 text-muted ring-1 ring-line/10">فقط‌افزودنی</span>
        </div>
        {sorted.length === 0 ? (
          <p className="text-[11px] font-medium text-muted">هنوز سندی ثبت نشده است</p>
        ) : (
          <div className="space-y-2">
            {sorted.slice(0, 40).map((e) => {
              const total = e.lines.reduce((s, l) => s + l.debit, 0);
              return (
                <div
                  key={e.id}
                  className="rounded-xl border border-line/10 bg-card p-3 shadow-card transition-colors hover:border-line/20"
                >
                  {/* سربرگ سند — شماره + منبع + تاریخ */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] font-extrabold text-ink">
                      <span className="num-ltr inline-flex min-w-[34px] items-center rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-black text-muted">
                        #{e.id}
                      </span>{' '}
                      {e.memo}
                    </p>
                    <span
                      className={cn(
                        'badge shrink-0',
                        e.source === 'reversal'
                          ? 'bg-negative/8 text-negative ring-1 ring-negative/20'
                          : 'bg-accent-soft text-accent ring-1 ring-accent/15 dark:bg-accent/15'
                      )}
                    >
                      {SOURCE_FA[e.source] ?? e.source}
                    </span>
                  </div>
                  <p className="num-ltr mt-1.5 text-[9px] font-medium text-muted">
                    {formatDualDate(e.date)}
                  </p>
                  {/* آرایش حساب‌ها — ستون‌بندی بدهکار/بستانکار */}
                  <div className="mt-2 divide-y divide-line/8 rounded-lg border border-line/8 bg-surface-2/40">
                    {e.lines.map((l, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[10px] font-medium">
                        <span className="truncate text-muted">{accountNameFa(l.account, accounts)}</span>
                        <span className="num-ltr shrink-0 font-bold text-ink">
                          {l.debit > 0 ? `بدهکار ${fmtUSD(l.debit)}` : `بستانکار ${fmtUSD(l.credit)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="num-ltr rounded-md bg-accent-soft/60 px-2 py-0.5 text-[10px] font-black text-accent dark:bg-accent/10">
                      مبلغ سند: {fmtUSD(total)}
                    </span>
                    {e.source !== 'reversal' && (
                      <button
                        onClick={() => void reverse(e)}
                        className="flex items-center gap-1 rounded-lg border border-negative/20 px-2 py-1 text-[9px] font-bold text-negative transition-colors hover:bg-negative/8"
                      >
                        <Undo2 className="h-3 w-3" /> ثبت معکوس
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-center text-[9px] font-medium text-muted/70">
          سندهای حسابداری غیرقابل ویرایش/حذف‌اند — اصلاح فقط با «ثبت معکوس» (تاریخ: {formatJalali(Date.now())})
        </p>
      </GlassCard>
    </div>
  );
}

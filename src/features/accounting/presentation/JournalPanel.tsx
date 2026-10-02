/**
 * تاریخچهٔ تراکنش‌ها
 *  - CashEntryForm: cash deposit / withdrawal / expense / manual two-line entry
 *    (smart Jalali–Gregorian date)
 *  - JournalPanel: append-only list of entries — corrections only via reversal
 */
import { useMemo, useState } from 'react';
import { Plus, Undo2, HandCoins, ArrowUpFromLine, Receipt, PenLine, Lock } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { SmartDateField } from '@/shared/components/ui/SmartDateField';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Badge } from '@/shared/components/ui/Badge';
import { Dialog } from '@/shared/components/ui/Sheet';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { EmptyState } from '@/shared/components/ui/StateViews';
import { useAccountingData } from './AccountingContext';
import { accountNameFa, type Account, type JournalEntry, type JournalLine } from '@/features/accounting/domain/types';
import { normalSide } from '@/features/accounting/domain/engine';
import { formatDualDate } from '@/shared/utils/jalali';
import { toFaDigits } from '@/shared/utils/formatters';

type Quick = 'deposit' | 'withdraw' | 'expense' | 'manual';

const QUICK_TABS = [
  { value: 'deposit' as const, label: 'واریز نقد', icon: <HandCoins /> },
  { value: 'withdraw' as const, label: 'برداشت نقد', icon: <ArrowUpFromLine /> },
  { value: 'expense' as const, label: 'هزینه', icon: <Receipt /> },
  { value: 'manual' as const, label: 'ثبت دستی', icon: <PenLine /> }
];

const SOURCE_FA: Record<string, string> = {
  opening: 'موجودی اولیه',
  deposit: 'واریز',
  withdraw: 'برداشت',
  expense: 'هزینه',
  buy: 'خرید',
  sell: 'فروش',
  manual: 'دستی',
  reversal: 'لغو',
  custody: 'دارایی چندشبکه‌ای'
};

/** اثر یک خط روی موجودی حساب خودش: + یعنی موجودی آن حساب زیاد شد، − یعنی کم شد */
function lineEffect(l: JournalLine, accounts: Account[]): number {
  const type = accounts.find((a) => a.key === l.account)?.type ?? 'asset';
  return normalSide(type) === 'debit' ? l.debit - l.credit : l.credit - l.debit;
}

export function CashEntryForm() {
  const { accounts, cashBalance, deposit, withdraw, expense, addManual } = useAccountingData();

  const [quick, setQuick] = useState<Quick>('deposit');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState<number | null>(Date.now());
  const [busy, setBusy] = useState(false);

  // manual entry: one debit line / one credit line
  const [debitAcc, setDebitAcc] = useState('expense:misc');
  const [creditAcc, setCreditAcc] = useState('cash:usd');

  const accountOptions = useMemo(() => accounts.filter((a) => a.type !== 'liability'), [accounts]);
  const usd = Number(amount);
  const valid = Number.isFinite(usd) && usd > 0 && (quick !== 'manual' || debitAcc !== creditAcc);

  const submit = async () => {
    const d = date ?? Date.now();
    setBusy(true);
    try {
      let ok = false;
      if (quick === 'manual') {
        const lines: JournalLine[] = [
          { account: debitAcc, debit: usd, credit: 0 },
          { account: creditAcc, debit: 0, credit: usd }
        ];
        ok = await addManual(lines, d, memo.trim() || 'ثبت دستی');
      } else {
        ok =
          quick === 'deposit'
            ? await deposit(usd, d, memo.trim() || undefined)
            : quick === 'withdraw'
              ? await withdraw(usd, d, memo.trim() || undefined)
              : await expense(usd, d, 'expense:misc', memo.trim() || undefined);
      }
      if (ok) {
        setAmount('');
        setMemo('');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <Surface className="space-y-5 p-4 md:p-6 lg:col-span-7">
        <SegmentedControl label="نوع ثبت" options={QUICK_TABS} value={quick} onChange={setQuick} fill />

        {quick === 'manual' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="به حساب">
              <Select value={debitAcc} onChange={(e) => setDebitAcc(e.target.value)}>
                {accountOptions.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.nameFa}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="از حساب"
              error={debitAcc === creditAcc ? 'حساب مبدأ و مقصد نباید یکسان باشند' : undefined}
            >
              <Select value={creditAcc} onChange={(e) => setCreditAcc(e.target.value)}>
                {accountOptions.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.nameFa}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        <Field
          label="مبلغ"
          hint={quick === 'withdraw' || quick === 'expense' ? 'از موجودی نقد کسر می‌شود' : undefined}
        >
          <Input
            dir="ltr"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            suffix="دلار"
            
          />
        </Field>
        <SmartDateField value={date} onChange={setDate} label="تاریخ" />
        <Field label="شرح" hint="اختیاری">
          <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="مثلاً: حقوق مهر" />
        </Field>

        <Button onClick={() => void submit()} disabled={!valid} loading={busy} className="w-full" icon={<Plus />}>
          ثبت
        </Button>
      </Surface>

      <aside className="lg:col-span-5">
        <div className="space-y-4 lg:sticky lg:top-8">
          <Surface variant="subtle" className="p-4 md:p-5">
            <p className="text-xs font-semibold text-muted">موجودی نقد فعلی</p>
            <p className="mt-1 text-2xl font-extrabold tracking-tight text-ink">
              <MoneyValue value={cashBalance} />
            </p>
            {valid && quick !== 'manual' && (
              <p className="mt-2 text-sm text-muted">
                پس از ثبت:{' '}
                <MoneyValue
                  value={quick === 'deposit' ? cashBalance + usd : cashBalance - usd}
                  className="font-semibold text-ink"
                />
              </p>
            )}
          </Surface>
          <p className="flex items-start gap-2 text-xs leading-5 text-muted">
            <Lock aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            تراکنش‌ها ویرایش یا پاک نمی‌شوند؛ برای اصلاح، در «تاریخچهٔ تراکنش‌ها» آن را لغو کنید.
          </p>
        </div>
      </aside>
    </div>
  );
}

export function JournalPanel() {
  const { entries, accounts, reverse } = useAccountingData();
  const [pending, setPending] = useState<JournalEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(40);

  // ترتیب زمانی (شناسه‌ها دیگر ترتیبی نیستند)؛ سندهای مشتق از عملیات هم در جای زمانی خود
  const sorted = useMemo(() => [...entries].sort((a, b) => b.date - a.date || b.createdAt - a.createdAt), [entries]);

  if (sorted.length === 0) {
    return <EmptyState message="هنوز تراکنشی ثبت نشده است" hint="تراکنش‌ها پس از ثبت اینجا نمایش داده می‌شوند." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{toFaDigits(sorted.length)} تراکنش · جدیدترین در بالا</p>
        <Badge tone="neutral" icon={<Lock />}>
          غیرقابل ویرایش
        </Badge>
      </div>

      <Surface className="divide-y divide-divider">
        {sorted.slice(0, limit).map((e) => {
          const total = e.lines.reduce((s, l) => s + l.debit, 0);
          return (
            <article key={e.id} className="p-4 md:px-5" aria-label={`تراکنش ${e.memo}`}>
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={e.source === 'reversal' ? 'loss' : e.derivedFrom ? 'info' : 'neutral'}>{SOURCE_FA[e.source] ?? e.source}</Badge>
                    {e.derivedFrom && <Badge tone="neutral">خودکار از عملیات</Badge>}
                  </div>
                  {/* memo is user data — wraps, never truncated */}
                  <p className="mt-1 text-sm font-semibold leading-6 text-ink">{e.memo}</p>
                  <p className="text-xs text-muted">{formatDualDate(e.date)}</p>
                </div>
                <div className="shrink-0 text-end">
                  <p className="text-xs text-muted">مبلغ</p>
                  <p className="text-base font-bold text-ink">
                    <MoneyValue value={total} />
                  </p>
                </div>
              </div>

              <table className="mt-3 w-full text-sm">
                <caption className="sr-only">اثر تراکنش روی حساب‌ها</caption>
                <thead>
                  <tr className="text-xs text-subtle">
                    <th scope="col" className="pb-1 text-start font-semibold">حساب</th>
                    <th scope="col" className="w-32 pb-1 text-end font-semibold">تغییر</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider border-t border-divider">
                  {e.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="py-1.5 pe-2 text-muted">{accountNameFa(l.account, accounts)}</td>
                      <td className="py-1.5 text-end">
                        <MoneyValue value={lineEffect(l, accounts)} signed />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {e.derivedFrom ? (
                <p className="mt-3 text-end text-xs text-muted">
                  این تراکنش از روی عملیات ساخته شده است؛ برای اصلاح، همان عملیات را در «دارایی شبکه‌ای» ویرایش یا باطل کنید.
                </p>
              ) : e.source !== 'reversal' && (
                <div className="mt-3 flex justify-end">
                  <Button variant="destructive" size="sm" icon={<Undo2 />} onClick={() => setPending(e)}>
                    لغو تراکنش
                  </Button>
                </div>
              )}
            </article>
          );
        })}
      </Surface>

      {sorted.length > limit && (
        <Button variant="ghost" size="sm" className="w-full text-accent" onClick={() => setLimit((l) => l + 40)}>
          نمایش تراکنش‌های قدیمی‌تر ({toFaDigits(sorted.length - limit)})
        </Button>
      )}

      {/* reversal is permanent → focused confirmation */}
      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title="لغو این تراکنش؟"
        description={pending ? pending.memo : undefined}
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setPending(null)}>
              انصراف
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              loading={busy}
              icon={<Undo2 />}
              onClick={async () => {
                if (!pending) return;
                setBusy(true);
                try {
                  await reverse(pending);
                  setPending(null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              لغو تراکنش
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-6 text-muted">
          یک تراکنش برعکس ثبت می‌شود و اثر تراکنش اصلی را خنثی می‌کند. هر دو در تاریخچه
          باقی می‌مانند.
        </p>
      </Dialog>
    </div>
  );
}

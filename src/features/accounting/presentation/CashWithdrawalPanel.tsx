/**
 * Cash withdrawal & expense funding
 *
 * ⚠️ Architecture rule — this is only a transfer of the cash balance:
 *  - ❌ no crypto sale / conversion / FIFO / cost basis / realized P&L here
 *  - ✅ cash balance ↓ → expense fund or bank account
 *  - ✅ booked through the standard transaction path (no parallel accounting)
 *
 * Flow: form → review (dialog) → final confirmation (booked only after confirm)
 */
import { useState } from 'react';
import { PiggyBank, Landmark, Eye, CheckCheck, Info } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input } from '@/shared/components/ui/Input';
import { SmartDateField } from '@/shared/components/ui/SmartDateField';
import { Dialog } from '@/shared/components/ui/Sheet';
import { KeyValueList, MoneyValue } from '@/shared/components/ui/FinancialValue';
import { useAccountingData } from './AccountingContext';
import {
  DESTINATION_ACCOUNT,
  DESTINATION_NAME_FA,
  CASH_STABLECOIN_SYMBOL,
  type CashDestination
} from '@/features/accounting/domain/types';
import { useFxStore } from '@/shared/store/fxStore';
import { fmtToman, fmtInt } from '@/shared/utils/formatters';
import { formatDualDate } from '@/shared/utils/jalali';
import { cn } from '@/shared/lib/cn';

const DESTINATIONS: { value: CashDestination; icon: React.ReactNode }[] = [
  { value: 'expense', icon: <PiggyBank className="h-5 w-5" /> },
  { value: 'bank', icon: <Landmark className="h-5 w-5" /> }
];

export function CashWithdrawalPanel() {
  const { cashBalance, withdrawCashTo } = useAccountingData();
  const fxRate = useFxStore((s) => s.rate);

  const [dest, setDest] = useState<CashDestination>('expense');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState<number | null>(Date.now());
  const [memo, setMemo] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);

  const amountNum = Number(amount) || 0;
  const overBalance = amountNum > cashBalance + 1e-6;
  const validAmount = amountNum > 0 && !overBalance;
  const balanceAfter = Math.max(0, cashBalance - amountNum);
  const destName = DESTINATION_NAME_FA[dest];

  /** final confirmation — the only place a transaction is booked */
  const confirm = async () => {
    setBusy(true);
    try {
      const ok = await withdrawCashTo(dest, amountNum, date ?? Date.now(), memo.trim() || undefined);
      if (ok) {
        setAmount('');
        setMemo('');
        setPreviewing(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <Surface className="space-y-5 p-4 md:p-6 lg:col-span-7">
        <fieldset>
          <legend className="mb-2 text-xs font-semibold text-muted">مقصد انتقال وجه</legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {DESTINATIONS.map(({ value, icon }) => {
              const active = dest === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setDest(value)}
                  className={cn(
                    'flex items-center gap-3 rounded-field border p-3 text-start transition-colors',
                    active ? 'border-accent bg-accent-soft' : 'border-divider-strong bg-card hover:bg-surface-2'
                  )}
                >
                  <span className={cn('shrink-0', active ? 'text-accent' : 'text-muted')}>{icon}</span>
                  <span className="min-w-0">
                    <span className={cn('block text-sm font-semibold', active ? 'text-accent' : 'text-ink')}>
                      {DESTINATION_NAME_FA[value]}
                    </span>
                    <span className="block truncate text-2xs text-muted"><bdi dir="ltr">
                      {DESTINATION_ACCOUNT[value]}
                    </bdi></span>
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <Field
          label={`مبلغ برداشت (${CASH_STABLECOIN_SYMBOL})`}
          error={overBalance ? 'مبلغ از موجودی نقد بیشتر است' : undefined}
          labelAside={
            <button type="button" onClick={() => setAmount(String(cashBalance))} className="text-xs font-semibold text-accent hover:underline">
              کل موجودی
            </button>
          }
        >
          <Input
            dir="ltr"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            suffix="$"
            
          />
        </Field>
        <SmartDateField value={date} onChange={setDate} label="تاریخ برداشت" />
        <Field label="شرح" hint="اختیاری">
          <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={`مثلاً: هزینه زندگی → ${destName}`} />
        </Field>
        <Button onClick={() => setPreviewing(true)} disabled={!validAmount} className="w-full" size="lg" icon={<Eye />}>
          بررسی و تأیید
        </Button>
      </Surface>

      <aside className="lg:col-span-5">
        <div className="space-y-4 lg:sticky lg:top-8">
          <Surface variant="subtle" className="p-4 md:p-5">
            <KeyValueList
              dense
              rows={[
                { label: 'موجودی نقد فعلی', value: <MoneyValue value={cashBalance} /> },
                { label: 'مبلغ برداشت', value: <MoneyValue value={amountNum > 0 ? amountNum : null} /> },
                { label: 'موجودی پس از برداشت', emphasis: true, value: <MoneyValue value={validAmount ? balanceAfter : null} /> }
              ]}
            />
          </Surface>
          <p className="flex items-start gap-2 text-xs leading-5 text-muted">
            <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            این عملیات فقط انتقال موجودی نقد است — هیچ دارایی فروخته نمی‌شود و FIFO یا سود/زیان تحقق‌یافته اجرا نمی‌شود. موجودی
            جدید مبنای عملکرد و شبیه‌سازی‌ها خواهد بود.
          </p>
        </div>
      </aside>

      <Dialog
        open={previewing && validAmount}
        onClose={() => setPreviewing(false)}
        title="تأیید برداشت"
        description="پس از تأیید، سند انتقال در دفتر کل ثبت می‌شود."
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setPreviewing(false)}>
              انصراف
            </Button>
            <Button className="flex-1" loading={busy} icon={<CheckCheck />} onClick={() => void confirm()}>
              تأیید نهایی
            </Button>
          </div>
        }
      >
        <KeyValueList
          rows={[
            { label: 'مبلغ برداشت', emphasis: true, value: <MoneyValue value={amountNum} /> },
            { label: 'مقصد', value: destName },
            { label: 'موجودی قبل', value: <MoneyValue value={cashBalance} /> },
            { label: 'موجودی بعد', value: <MoneyValue value={balanceAfter} /> },
            { label: 'تاریخ', value: formatDualDate(date ?? Date.now()) },
            { label: 'معادل تومانی', value: fmtToman(amountNum, fxRate) },
            { label: 'نرخ تبدیل', value: `${fmtInt(fxRate)} تومان / دلار` }
          ]}
        />
      </Dialog>
    </div>
  );
}

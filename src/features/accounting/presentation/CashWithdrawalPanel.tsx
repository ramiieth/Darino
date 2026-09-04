/**
 * برداشت نقدی و تخصیص بودجه مخارج (Cash Withdrawal & Expense Funding)
 *
 * ⚠️ اصل معماری — این بخش فقط «انتقال موجودی نقد» است:
 *  - ❌ هیچ فروش رمزارز / تبدیل دارایی / FIFO / Cost Basis / Realized P&L در این بخش وجود ندارد
 *  - ✅ فقط: کاهش Cash Balance → انتقال به Expense Fund یا Bank Account
 *  - ✅ ثبت از مسیر استاندارد تراکنش (سند انتقال در دفتر کل) — بدون مسیر حسابداری موازی
 *  - فروش دارایی فقط در «خرید/فروش داراییها (Asset Trading)» انجام میشود
 *
 * جریان: فرم ← «پیشنمایش» ← «تأیید نهایی» (ثبت فقط پس از تأیید)
 */
import { useMemo, useState } from 'react';
import {
  Wallet,
  PiggyBank,
  Landmark,
  Info,
  ArrowDownToLine,
  Eye,
  CheckCheck
} from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { SmartDateField } from '@/shared/components/ui/SmartDateField';
import { useAccounting } from '@/features/accounting/data/useAccounting';
import {
  DESTINATION_ACCOUNT,
  DESTINATION_NAME_FA,
  CASH_STABLECOIN_SYMBOL,
  type CashDestination
} from '@/features/accounting/domain/types';
import { useFxStore } from '@/shared/store/fxStore';
import { fmtUSD, fmtToman, fmtInt } from '@/shared/utils/formatters';
import { formatDualDate } from '@/shared/utils/jalali';
import { cn } from '@/shared/lib/cn';

const DESTINATIONS: { value: CashDestination; icon: React.ReactNode }[] = [
  { value: 'expense', icon: <PiggyBank className="h-4 w-4" /> },
  { value: 'bank', icon: <Landmark className="h-4 w-4" /> }
];

function Field({
  label,
  children,
  hint
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-bold text-muted">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[9px] font-medium text-muted/70">{hint}</p>}
    </div>
  );
}

function PreviewRow({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone?: 'up' | 'down' | 'plain';
}) {
  return (
    <div className="flex items-center justify-between text-[10px] font-bold">
      <span className="text-muted">{label}</span>
      <span
        className={cn(
          'num-ltr',
          tone === 'up'
            ? 'text-positive'
            : tone === 'down'
              ? 'text-negative'
              : 'text-ink'
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function CashWithdrawalPanel() {
  const { cashBalance, withdrawCashTo } = useAccounting();
  const fx = useFxStore();
  const fxRate = fx.hydrated ? fx.rate : fx.rate; // پس از hydrate نرخ واقعی است

  const [dest, setDest] = useState<CashDestination>('expense');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState<number | null>(Date.now());
  const [memo, setMemo] = useState('');
  const [previewing, setPreviewing] = useState(false);

  const amountNum = Number(amount) || 0;
  const validAmount = amountNum > 0 && amountNum <= cashBalance + 1e-6;
  const balanceAfter = Math.max(0, cashBalance - amountNum);

  /** پیشنمایش: فقط نمایش — بدون ثبت */
  const showPreview = () => {
    setPreviewing(true);
  };

  /** تأیید نهایی: ثبت واقعی تراکنش (فقط از اینجا) */
  const confirm = async () => {
    const ok = await withdrawCashTo(dest, amountNum, date ?? Date.now(), memo.trim() || undefined);
    if (ok) {
      setAmount('');
      setMemo('');
      setPreviewing(false);
    }
  };

  const destName = DESTINATION_NAME_FA[dest];

  return (
    <div className="space-y-3">
      {/* موجودی نقد */}
      <GlassCard variant="soft" className="flex items-center gap-3 p-3.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-400">
          <Wallet className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-muted">
            موجودی نقد ({CASH_STABLECOIN_SYMBOL} / USDC)
          </p>
          <p className="num-ltr text-lg font-black text-ink">{fmtUSD(cashBalance)}</p>
        </div>
        <span className="badge bg-amber-400/10 text-amber-400 ring-1 ring-amber-400/20">
          مبنای شبیهسازیها
        </span>
      </GlassCard>

      {/* انتخاب مقصد */}
      <GlassCard className="p-3.5">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-black text-ink">
          <ArrowDownToLine className="h-3.5 w-3.5 text-accent" /> مقصد انتقال وجه
        </p>
        <div className="grid grid-cols-2 gap-2">
          {DESTINATIONS.map(({ value, icon }) => (
            <button
              key={value}
              onClick={() => setDest(value)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-3 transition-all',
                dest === value
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-line/10 bg-line/5 text-muted hover:bg-line/10'
              )}
            >
              {icon}
              <span className="text-[11px] font-black">{DESTINATION_NAME_FA[value]}</span>
              <span className="tnum text-[8px] font-medium opacity-70">
                {DESTINATION_ACCOUNT[value]}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-[9px] font-medium leading-4 text-muted/70">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          این عملیات فقط «انتقال موجودی نقد» است — هیچ دارایی فروخته نمیشود، FIFO و سود/زیان
          تحققیافته اجرا نمیشود. فروش دارایی فقط در بخش «خرید/فروش داراییها» انجام میشود.
        </p>
      </GlassCard>

      {/* فرم برداشت */}
      <GlassCard className="p-3.5">
        <h4 className="mb-2.5 flex items-center gap-1.5 text-[12px] font-black text-ink">
          <ArrowDownToLine className="h-4 w-4 text-amber-400" /> برداشت از موجودی نقد
        </h4>
        <div className="space-y-2.5">
          <Field
            label={`مبلغ برداشت (${CASH_STABLECOIN_SYMBOL})`}
            hint={`موجودی نقد فعلی: ${fmtUSD(cashBalance)} ${CASH_STABLECOIN_SYMBOL} — برداشت حداکثر تا همین مقدار`}
          >
            <Input
              dir="ltr"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setPreviewing(false);
              }}
              placeholder="0.00"
              className="h-10 text-xs text-start"
            />
          </Field>
          <SmartDateField value={date} onChange={setDate} label="تاریخ برداشت" />
          <Input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder={`شرح (مثلاً: هزینه زندگی → ${destName})`}
            className="h-10 text-xs"
          />
          <Button
            onClick={showPreview}
            disabled={!validAmount}
            className="w-full"
            size="sm"
          >
            <Eye className="h-3.5 w-3.5" /> پیشنمایش برداشت
          </Button>
        </div>
      </GlassCard>

      {/* پیشنمایش کامل — قبل از ثبت نهایی */}
      {previewing && validAmount && (
        <GlassCard className="border-amber-400/30 p-3.5">
          <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-black text-ink">
            <Eye className="h-3.5 w-3.5 text-amber-400" /> پیشنمایش — بررسی و تأیید نهایی
          </p>
          <div className="space-y-1.5 rounded-2xl bg-line/5 p-3">
            <PreviewRow label="مبلغ برداشت" value={`${fmtUSD(amountNum)} ${CASH_STABLECOIN_SYMBOL}`} />
            <PreviewRow label="ارز برداشتشده" value={CASH_STABLECOIN_SYMBOL} />
            <PreviewRow label="موجودی قبل از برداشت" value={`${fmtUSD(cashBalance)} ${CASH_STABLECOIN_SYMBOL}`} />
            <PreviewRow label="موجودی بعد از برداشت" value={`${fmtUSD(balanceAfter)} ${CASH_STABLECOIN_SYMBOL}`} tone="down" />
            <PreviewRow label="مقصد انتقال" value={destName} />
            <PreviewRow label="تاریخ" value={formatDualDate(date ?? Date.now())} />
            <div className="my-1 border-t border-line/10" />
            <PreviewRow label="معادل دلار" value={fmtUSD(amountNum)} />
            <PreviewRow label="معادل تومان" value={fmtToman(amountNum, fxRate)} />
            <PreviewRow label="نرخ تبدیل استفادهشده" value={`${fmtInt(fxRate)} تومان / دلار`} />
          </div>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => setPreviewing(false)} variant="outline" size="sm" className="flex-1">
              انصراف
            </Button>
            <Button
              onClick={() => void confirm()}
              size="sm"
              className="flex-1"
            >
              <CheckCheck className="h-3.5 w-3.5" /> تأیید نهایی
            </Button>
          </div>
        </GlassCard>
      )}

      <p className="text-center text-[9px] font-medium text-muted/70">
        این عملیات یک انتقال نقدی است (نه فروش دارایی) — بدون FIFO و بدون سود/زیان تحققیافته؛
        سند آن از مسیر استاندارد در دفتر کل ثبت میشود و موجودی جدید، مبنای Performance و
        Simulation خواهد بود ({fmtUSD(cashBalance)})
      </p>
    </div>
  );
}

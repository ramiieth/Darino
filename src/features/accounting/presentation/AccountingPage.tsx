/**
 * حسابداری — Accounting Core
 * سند دوطرفه (Double-Entry) · دفتر روزنامه · دفتر کل · موتور تراکنش
 * FIFO Cost Basis · تاریخچه ممیزی · ثبت‌های غیرقابل تغییر
 */
import { useState } from 'react';
import { BookOpen, ScrollText, ArrowLeftRight, TrendingUp, ShieldCheck, Wallet, ArrowDownToLine } from 'lucide-react';
import { PageHeader } from '@/shared/components/layout/Page';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { useAccounting } from '@/features/accounting/data/useAccounting';
import { JournalPanel } from './JournalPanel';
import { TradePanel } from './TradePanel';
import { CashWithdrawalPanel } from './CashWithdrawalPanel';
import { AssetDepositPanel } from './AssetDepositPanel';
import { LedgerPanel } from './LedgerPanel';
import { PnlPanel } from './PnlPanel';
import { AuditPanel } from './AuditPanel';

type Tab = 'trade' | 'expense' | 'deposit' | 'journal' | 'ledger' | 'pnl' | 'audit';

const TABS = [
  { value: 'trade' as const, label: 'خرید/فروش', icon: <ArrowLeftRight className="h-3.5 w-3.5" /> },
  { value: 'expense' as const, label: 'برداشت نقدی مخارج', icon: <Wallet className="h-3.5 w-3.5" /> },
  { value: 'deposit' as const, label: 'واریز دارایی', icon: <ArrowDownToLine className="h-3.5 w-3.5" /> },
  { value: 'journal' as const, label: 'معاملات', icon: <ScrollText className="h-3.5 w-3.5" /> },
  { value: 'ledger' as const, label: 'دفتر کل', icon: <BookOpen className="h-3.5 w-3.5" /> },
  { value: 'pnl' as const, label: 'سود/زیان', icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { value: 'audit' as const, label: 'ممیزی', icon: <ShieldCheck className="h-3.5 w-3.5" /> }
];

export default function AccountingPage() {
  const [tab, setTab] = useState<Tab>('trade');
  const { loading } = useAccounting();

  return (
    <div className="space-y-4">
      <PageHeader
        title="حسابداری"
        subtitle="دفتر دوطرفه · دفتر کل · FIFO · تاریخچه غیرقابل تغییر — تاریخ شمسی/میلادی خودکار"
      />

      <SegmentedControl options={TABS} value={tab} onChange={setTab} />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {tab === 'journal' && <JournalPanel />}
          {tab === 'trade' && <TradePanel />}
          {tab === 'expense' && (
            <div className="space-y-3">
              <GlassCard className="p-4">
                <h3 className="text-[14px] font-black text-ink">
                  برداشت نقدی و تخصیص بودجه مخارج
                </h3>
                <p className="mt-1 text-[11px] font-bold text-muted">
                  Cash Withdrawal &amp; Expense Funding — فقط انتقال موجودی نقد برای هزینه‌های زندگی
                </p>
              </GlassCard>
              <CashWithdrawalPanel />
            </div>
          )}
          {tab === 'deposit' && (
            <div className="space-y-3">
              <GlassCard className="p-4">
                <h3 className="text-[14px] font-black text-ink">واریز دارایی</h3>
                <p className="mt-1 text-[11px] font-bold text-muted">
                  ثبت ورود هر نوع دارایی دیجیتال به سیستم — انتخاب از Explorer، پیش‌نمایش و ثبت استاندارد
                </p>
              </GlassCard>
              <AssetDepositPanel />
            </div>
          )}
          {tab === 'ledger' && <LedgerPanel />}
          {tab === 'pnl' && <PnlPanel />}
          {tab === 'audit' && <AuditPanel />}
        </>
      )}
    </div>
  );
}

/**
 * Accounting — overview first, then act, then records.
 *   summary:  cash · holdings value · realized P/L · open P/L
 *   tabs:     ثبت تراکنش (trade · deposit asset · cash withdrawal · cash & manual)
 *             دفتر روزنامه · دفتر کل · سود و زیان · ممیزی
 * Double-entry · FIFO cost basis · immutable history — engine unchanged.
 * Deep links: /accounting?tab=trade|deposit|expense|cash|journal|ledger|pnl|audit
 */
import { useSearchParams } from 'react-router-dom';
import { BookOpen, ScrollText, ShieldCheck, TrendingUp, PlusCircle } from 'lucide-react';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Tabs, SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Metric, MetricGrid, MoneyValue } from '@/shared/components/ui/FinancialValue';
import { PageSkeleton } from '@/shared/components/ui/Skeleton';
import { AccountingProvider, useAccountingData } from './AccountingContext';
import { usePortfolioOverview } from '@/features/eth-summary/presentation/usePortfolioOverview';
import { useFxStore } from '@/shared/store/fxStore';
import { fmtToman } from '@/shared/utils/formatters';
import { JournalPanel, CashEntryForm } from './JournalPanel';
import { TradePanel } from './TradePanel';
import { CashWithdrawalPanel } from './CashWithdrawalPanel';
import { AssetDepositPanel } from './AssetDepositPanel';
import { LedgerPanel } from './LedgerPanel';
import { PnlPanel } from './PnlPanel';
import { AuditPanel } from './AuditPanel';

type Section = 'record' | 'journal' | 'ledger' | 'pnl' | 'audit';
type RecordKind = 'trade' | 'deposit' | 'expense' | 'cash';

const SECTIONS = [
  { value: 'record' as const, label: 'ثبت تراکنش', icon: <PlusCircle /> },
  { value: 'journal' as const, label: 'دفتر روزنامه', icon: <ScrollText /> },
  { value: 'ledger' as const, label: 'دفتر کل', icon: <BookOpen /> },
  { value: 'pnl' as const, label: 'سود و زیان', icon: <TrendingUp /> },
  { value: 'audit' as const, label: 'ممیزی', icon: <ShieldCheck /> }
];

// short labels keep the four kinds on one line at 320px
const KINDS = [
  { value: 'trade' as const, label: 'خرید/فروش' },
  { value: 'deposit' as const, label: 'واریز دارایی' },
  { value: 'expense' as const, label: 'برداشت نقد' },
  { value: 'cash' as const, label: 'سند دستی' }
];

const RECORD_KINDS: RecordKind[] = ['trade', 'deposit', 'expense', 'cash'];

export default function AccountingPage() {
  return (
    <AccountingProvider>
      <AccountingScreen />
    </AccountingProvider>
  );
}

function AccountingScreen() {
  const [params, setParams] = useSearchParams();
  const acc = useAccountingData();
  const { loading } = acc;
  const o = usePortfolioOverview(acc);
  const fxRate = useFxStore((s) => s.rate);

  // ?tab= accepts a section or a record kind (legacy deep links)
  const raw = params.get('tab') ?? 'trade';
  const kind: RecordKind = (RECORD_KINDS as string[]).includes(raw) ? (raw as RecordKind) : 'trade';
  const section: Section = (RECORD_KINDS as string[]).includes(raw) ? 'record' : (SECTIONS.some((s) => s.value === raw) ? (raw as Section) : 'record');

  const go = (tab: string) => setParams({ tab }, { replace: true });

  return (
    <Page>
      <PageHeader
        title="حسابداری"
        subtitle="دفتر دوطرفه، بهای تمام‌شده FIFO و تاریخچه غیرقابل تغییر — تاریخ شمسی و میلادی"
      />

      {/* overview — what is on the books right now */}
      <Surface className="p-4 md:p-6">
        <MetricGrid cols={4}>
          <Metric
            size="lg"
            label="موجودی نقد"
            value={<MoneyValue value={o.cash} state={o.state === 'loading' ? 'loading' : 'ready'} />}
            sub={o.cash !== null ? fmtToman(o.cash, fxRate) : undefined}
          />
          <Metric
            size="lg"
            label="ارزش دارایی‌ها"
            value={<MoneyValue value={o.holdingsValue} state={o.state === 'loading' ? 'loading' : 'ready'} />}
            sub={o.unpriced.length > 0 ? 'بدون دارایی‌های فاقد قیمت' : 'به قیمت روز'}
          />
          <Metric
            size="md"
            label="سود/زیان تحقق‌یافته"
            value={<MoneyValue value={o.realizedPnl} signed tone="auto" state={o.state === 'loading' ? 'loading' : 'ready'} />}
          />
          <Metric
            size="md"
            label="سود/زیان باز"
            value={<MoneyValue value={o.unrealizedTotal} signed tone="auto" state={o.state === 'loading' ? 'loading' : 'ready'} />}
          />
        </MetricGrid>
      </Surface>

      <div className="space-y-6">
        <Tabs label="بخش‌های حسابداری" options={SECTIONS} value={section} onChange={(s) => go(s === 'record' ? kind : s)} />

        {loading ? (
          <PageSkeleton />
        ) : (
          <>
            {section === 'record' && (
              <div className="space-y-6">
                <SegmentedControl label="نوع تراکنش" options={KINDS} value={kind} onChange={(k) => go(k)} fill className="md:w-auto md:inline-flex" />
                {kind === 'trade' && <TradePanel />}
                {kind === 'deposit' && <AssetDepositPanel />}
                {kind === 'expense' && <CashWithdrawalPanel />}
                {kind === 'cash' && <CashEntryForm />}
              </div>
            )}
            {section === 'journal' && <JournalPanel />}
            {section === 'ledger' && <LedgerPanel />}
            {section === 'pnl' && <PnlPanel />}
            {section === 'audit' && <AuditPanel />}
          </>
        )}
      </div>
    </Page>
  );
}

/**
 * دارایی‌های چندشبکه‌ای — موجودی · عملیات · محل‌ها
 * Deep link: /holdings?tab=balances|operations|places
 * داده روی دستگاه (IndexedDB) و پس از ورود با Passkey روی سرور همگام می‌شود؛ ثبت عملیات تراکنش واقعی اجرا نمی‌کند.
 */
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/authClient';
import { syncCustodyNow, useCustodySync } from '../data/sync';
import { Badge } from '@/shared/components/ui/Badge';
import { Wallet, ArrowLeftRight, MapPin } from 'lucide-react';
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { Tabs } from '@/shared/components/ui/SegmentedControl';
import { PageSkeleton } from '@/shared/components/ui/Skeleton';
import { useCustody } from '../data/useCustody';
import { BalancesPanel } from './BalancesPanel';
import { OperationsPanel } from './OperationsPanel';
import { HoldingsManager } from './HoldingsManager';

type Tab = 'balances' | 'operations' | 'places';
const TABS = [
  { value: 'balances' as const, label: 'موجودی', icon: <Wallet /> },
  { value: 'operations' as const, label: 'عملیات', icon: <ArrowLeftRight /> },
  { value: 'places' as const, label: 'محل‌ها', icon: <MapPin /> }
];

export default function HoldingsPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = TABS.some((t) => t.value === raw) ? (raw as Tab) : 'balances';
  const d = useCustody();
  const authed = useAuth((s) => s.status === 'authenticated');
  const sync = useCustodySync();

  // ورود به صفحه = دریافت آخرین تغییرات دستگاه‌های دیگر
  useEffect(() => {
    if (authed) void syncCustodyNow();
  }, [authed]);

  return (
    <Page>
      <PageHeader
        title="دارایی‌های چندشبکه‌ای"
        subtitle="ثبت دستی دارایی‌ها و عملیات؛ مستقل از پرتفولیوی متصل"
        meta={
          authed ? (
            <Badge tone={sync.state === 'ok' ? 'gain' : sync.state === 'syncing' ? 'info' : sync.state === 'offline' ? 'warn' : 'neutral'}>
              {sync.state === 'ok' ? 'همگام با دستگاه‌های دیگر' : sync.state === 'syncing' ? 'در حال همگام‌سازی…' : sync.state === 'offline' ? 'آفلاین — بعداً همگام می‌شود' : 'همگام‌سازی'}
            </Badge>
          ) : undefined
        }
      />
      <div className="space-y-6">
        <Tabs label="بخش‌های دارایی چندشبکه‌ای" options={TABS} value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} />
        {!d.loaded ? (
          <PageSkeleton />
        ) : (
          <>
            {tab === 'balances' && <BalancesPanel d={d} />}
            {tab === 'operations' && <OperationsPanel d={d} />}
            {tab === 'places' && <HoldingsManager d={d} />}
          </>
        )}
      </div>
    </Page>
  );
}

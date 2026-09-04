/**
 * صفحه دیفای — ۴ تب با پنل‌های همیشه-mount (حفظ state بدون Re-render بی‌مورد)
 */
import { useEffect, useState } from 'react';
import { PageHeader } from '@/shared/components/layout/Page';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { OverviewPanel } from './OverviewPanel';
import { StablecoinsCG } from './StablecoinsCG';
import { TvlFlowDashboard } from './TvlFlowDashboard';
import { Link } from 'react-router-dom';
import { Repeat } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { useUiStore } from '@/shared/store/uiStore';
import { t } from '@/shared/i18n/fa';
import { cn } from '@/shared/lib/cn';
import type { YieldPool } from '@/features/defi/domain/logic';

type DeFiTab = 'flow' | 'loop' | 'overview' | 'stablecoins';

export function DeFiPage() {
  const [tab, setTab] = useState<DeFiTab>('flow');
  const [pendingPool, setPendingPool] = useState<YieldPool | null>(null);
  const pendingDefi = useUiStore((s) => s.pendingDefi);
  const clearDefi = useUiStore((s) => s.clearDefi);

  // پرش از داشبورد (کارت رادار) → تب بازدهی + باز کردن شیت استخر
  useEffect(() => {
    if (pendingDefi) {
      setTab(pendingDefi.tab as DeFiTab);
      if (pendingDefi.tab === 'yields') {
        setPendingPool(pendingDefi.pool as YieldPool);
      }
      clearDefi();
    }
  }, [pendingDefi, clearDefi]);

  return (
    <div className="space-y-4">
      <PageHeader title={t('defiTitle')} subtitle={t('defiSubtitle')} />

      <SegmentedControl<DeFiTab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'flow', label: 'جریان سرمایه' },
          { value: 'loop', label: 'Yield Loop' },
          { value: 'overview', label: t('defiOverview') },
          { value: 'stablecoins', label: t('defiStablecoins') }
        ]}
      />

      {/* همه پنل‌ها mount می‌مانند — فقط visibility عوض می‌شود */}
      <div className={cn(tab !== 'flow' && 'hidden')} aria-hidden={tab !== 'flow'} inert={tab !== 'flow' ? '' : undefined}>
        <TvlFlowDashboard />
      </div>
      {tab === 'loop' && (
        <Link to="/defi-loop" className="block">
          <GlassCard className="flex items-center gap-3 p-4 transition-all hover:bg-line/[0.04] active:scale-[0.99]">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/15 text-accent">
              <Repeat className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-extrabold text-ink">Yield Loop Analytics</p>
              <p className="truncate text-[10px] font-medium text-muted">
                DeFiLlama Yields → Loop — کشف فرصت‌های Leveraged Yield، محاسبه سود خالص و ریسک
              </p>
            </div>
          </GlassCard>
        </Link>
      )}
      <div className={cn(tab !== 'overview' && 'hidden')} aria-hidden={tab !== 'overview'} inert={tab !== 'overview' ? '' : undefined}>
        <OverviewPanel />
      </div>
      <div className={cn(tab !== 'stablecoins' && 'hidden')} aria-hidden={tab !== 'stablecoins'} inert={tab !== 'stablecoins' ? '' : undefined}>
        <StablecoinsCG />
      </div>
    </div>
  );
}

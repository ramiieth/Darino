/**
 * داشبورد — ارزش خالص دارایی (Hero) + کارت اتریوم + لیست پیگیری + ورود به بازه‌ها
 */
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { ArrowLeft, LineChart } from 'lucide-react';
import { PageHeader } from '@/shared/components/layout/Page';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { NetWorthHero } from './NetWorthHero';
import { PendleRealApyCard } from '@/features/pendle/presentation/PendleRealApyCard';
import { EthSummaryCard } from './EthSummaryCard';
import { WatchlistSection } from './WatchlistSection';
import { TopPerformersCard } from '@/features/cryptomarkets/presentation/TopPerformersCard';
import { SimulatedInvestmentCard } from '@/features/cryptomarkets/presentation/SimulatedInvestmentCard';
import type { PerfPeriod } from '@/features/cryptomarkets/data/useTopPerformers';
import { useTimeline } from '@/features/simulation/data/useTimeline';
import { fmtUSD } from '@/shared/utils/formatters';
import { t } from '@/shared/i18n/fa';
import { COVERAGE } from '@/features/simulation/domain/constants';
import { cn } from '@/shared/lib/cn';

export function DashboardPage() {
  const t1 = useTimeline(1);
  const t2 = useTimeline(2);
  // بازه مشترک کارت «عملکرد» و «شبیه‌سازی نمایشی» — همیشه هماهنگ
  const [perfPeriod, setPerfPeriod] = useState<PerfPeriod>('30d');

  const card = (result: typeof t1, title: string, desc: string, to: string, accent?: boolean) => {
    const baseLabel = result.timeline === 1 ? t('analyticsDateT1') : t('analyticsDateT2');
    return (
      <Link to={to} className="block">
        <GlassCard
          variant="soft"
          className="group flex items-center gap-3.5 p-4 transition-all hover:bg-line/[0.03] active:scale-[0.98]"
        >
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
              accent ? 'bg-accent/15 text-accent' : 'bg-info/15 text-info'
            )}
          >
            <LineChart className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-extrabold text-ink">{title}</p>
            <p className="truncate text-[11px] font-medium text-muted">{desc}</p>
            <p className="num-ltr mt-1.5 text-[11px] font-bold text-muted">
              {t('baseCapital')}: {fmtUSD(result.baseCapital)} · {baseLabel}
            </p>
          </div>
          <ArrowLeft className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:-translate-x-0.5" />
        </GlassCard>
      </Link>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t('appShortName')} subtitle={t('appTagline')} />

      {/* ارزش خالص دارایی — فقط دارایی‌های واقعی کاربر */}
      <NetWorthHero />

      {/* کارت اتریوم */}
      <EthSummaryCard />

      {/* APY واقعی Pendle — تحلیل */}
      <PendleRealApyCard />



      {/* لیست پیگیری */}
      <WatchlistSection />

      {/* عملکرد + شبیه‌سازی نمایشی (بازه مشترک) */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <TopPerformersCard period={perfPeriod} onPeriodChange={setPerfPeriod} />
        <SimulatedInvestmentCard period={perfPeriod} onPeriodChange={setPerfPeriod} />
      </div>

      {/* ورود به شبیه‌سازی‌ها */}
      <div className="space-y-2.5">
        {card(t1, t('timeline1'), t('timeline1Desc'), '/simulation')}
        {card(
          t2,
          t('timeline2'),
          t('timeline2DescTpl').replace('{n}', String(COVERAGE.tokenizedCount)),
          '/simulation',
          true
        )}
      </div>
    </div>
  );
}

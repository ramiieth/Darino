/**
 * Dashboard — first viewport answers:
 *   what do I own · what is it worth · what changed · what needs attention · what next
 *
 *   desktop (lg+, 12 cols)            phones
 *   ┌───────────── 8 ─────┬── 4 ──┐   hero
 *   │ hero                │ act.  │   actions
 *   │                     │ attn. │   attention
 *   ├─────────────────────┼───────┤   positions
 *   │ positions           │ watch │   watchlist
 *   ├─────────────────────┼───────┤   movers
 *   │ movers              │pendle │   pendle
 *   ├─────────────────────┴───────┤   what-if · scenario · tools
 *   │ what-if │ eth scenario      │
 *   └─────────────────────────────┘
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, LineChart } from 'lucide-react';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { NetWorthHero } from './NetWorthHero';
import { PositionsSection } from './PositionsSection';
import { AttentionPanel, QuickActions } from './DashboardAside';
import { usePortfolioOverview } from './usePortfolioOverview';
import { useAccounting } from '@/features/accounting/data/useAccounting';
import { PendleRealApyCard } from '@/features/pendle/presentation/PendleRealApyCard';
import { EthSummaryCard } from './EthSummaryCard';
import { WatchlistSection } from './WatchlistSection';
import { TopPerformersCard } from '@/features/cryptomarkets/presentation/TopPerformersCard';
import { SimulatedInvestmentCard } from '@/features/cryptomarkets/presentation/SimulatedInvestmentCard';
import type { PerfPeriod } from '@/features/cryptomarkets/data/useTopPerformers';
import { t } from '@/shared/i18n/fa';
import { COVERAGE } from '@/features/simulation/domain/constants';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'صبح بخیر' : h < 18 ? 'عصر بخیر' : 'شب بخیر';
}

export function DashboardPage() {
  const accounting = useAccounting();
  const overview = usePortfolioOverview(accounting);
  // shared period for «movers» and «what-if»
  const [perfPeriod, setPerfPeriod] = useState<PerfPeriod>('30d');

  return (
    <Page>
      <PageHeader eyebrow={greeting()} title="داشبورد" subtitle="نمای کلی دارایی‌ها و تغییرات امروز" />

      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="min-w-0 lg:col-span-8">
          <NetWorthHero o={overview} />
        </div>
        <div className="min-w-0 space-y-6 lg:col-span-4">
          <Section id="actions" title="اقدام سریع">
            <QuickActions className="lg:grid-cols-1 [&>*]:lg:col-span-1" />
          </Section>
          <AttentionPanel o={overview} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="min-w-0 lg:col-span-8">
          <PositionsSection o={overview} />
        </div>
        <div className="min-w-0 lg:col-span-4">
          <WatchlistSection />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="min-w-0 lg:col-span-8">
          <TopPerformersCard period={perfPeriod} onPeriodChange={setPerfPeriod} />
        </div>
        <div className="min-w-0 lg:col-span-4">
          <PendleRealApyCard />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="min-w-0 lg:col-span-8">
          <SimulatedInvestmentCard period={perfPeriod} onPeriodChange={setPerfPeriod} />
        </div>
        <div className="min-w-0 space-y-6 lg:col-span-4">
          <EthSummaryCard />
          <Section id="sim-links" title="شبیه‌سازی">
            <Surface className="divide-y divide-divider px-4">
              {[
                { title: t('timeline1'), desc: t('timeline1Desc') },
                { title: t('timeline2'), desc: t('timeline2DescTpl').replace('{n}', String(COVERAGE.tokenizedCount)) }
              ].map((l) => (
                <Link key={l.title} to="/simulation" className="flex items-center gap-3 py-3.5 hover:opacity-80">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
                    <LineChart aria-hidden className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{l.title}</span>
                    <span className="block truncate text-xs text-muted">{l.desc}</span>
                  </span>
                  <ArrowLeft aria-hidden className="h-4 w-4 shrink-0 text-subtle rtl:rotate-0 ltr:rotate-180" />
                </Link>
              ))}
            </Surface>
          </Section>
        </div>
      </div>
    </Page>
  );
}

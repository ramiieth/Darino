/** Dashboard: connected real portfolio, watchlist and separate manual scenarios. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, LineChart } from 'lucide-react';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { Section, Surface } from '@/shared/components/ui/GlassCard';


import { PortfolioSummary } from '@/features/connected/presentation/PortfolioSummary';
import { useConnectedPortfolio } from '@/features/connected/data/useConnectedPortfolio';
import { useCustodySync } from '@/features/custody/data/sync';

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
  useCustodySync();
  const portfolio = useConnectedPortfolio();
  // shared period for «movers» and «what-if»
  const [perfPeriod, setPerfPeriod] = useState<PerfPeriod>('30d');

  return (
    <Page>
      <PageHeader eyebrow={greeting()} title="داشبورد" />

      <PortfolioSummary portfolio={portfolio} />
      <WatchlistSection />

      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="min-w-0 lg:col-span-8">
          <TopPerformersCard period={perfPeriod} onPeriodChange={setPerfPeriod} />
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

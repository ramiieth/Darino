/**
 * DeFi — capital flow, market overview, stablecoins.
 * Panels stay mounted (state kept) and are hidden with `inert` when inactive.
 * Yield products (Pendle · Boros · Yield Loop) are cross-linked, not nested.
 */
import { useEffect, useState } from 'react';
import { Percent, Radar, Repeat } from 'lucide-react';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { Tabs } from '@/shared/components/ui/SegmentedControl';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { ListRow } from '@/shared/components/ui/ListRow';
import { OverviewPanel } from './OverviewPanel';
import { StablecoinsCG } from './StablecoinsCG';
import { TvlFlowDashboard } from './TvlFlowDashboard';
import { useUiStore } from '@/shared/store/uiStore';
import { cn } from '@/shared/lib/cn';

type DeFiTab = 'flow' | 'overview' | 'stablecoins';

const YIELD_LINKS = [
  { to: '/pendle', title: 'Pendle', desc: 'بازده ثابت توکن اصل، توکن بازده و نقدینگی', icon: Percent },
  { to: '/boros', title: 'Boros', desc: 'بازارهای نرخ تأمین مالی', icon: Radar },
  { to: '/defi-loop', title: 'حلقهٔ بازده', desc: 'استراتژی‌های اهرمی و ریسک آن‌ها', icon: Repeat }
];

export function DeFiPage() {
  const [tab, setTab] = useState<DeFiTab>('flow');
  const pendingDefi = useUiStore((s) => s.pendingDefi);
  const clearDefi = useUiStore((s) => s.clearDefi);

  // deep link from elsewhere (legacy «yields» → overview)
  useEffect(() => {
    if (pendingDefi) {
      const t = pendingDefi.tab;
      setTab(t === 'stablecoins' ? 'stablecoins' : t === 'overview' || t === 'yields' ? 'overview' : 'flow');
      clearDefi();
    }
  }, [pendingDefi, clearDefi]);

  const panel = (id: DeFiTab) => ({
    className: cn(tab !== id && 'hidden'),
    'aria-hidden': tab !== id,
    inert: tab !== id ? ('' as const) : undefined
  });

  return (
    <Page>
      <PageHeader title="دیفای" subtitle="جریان سرمایه بین زنجیره‌ها و پروتکل‌ها، نمای کلی بازار و استیبل‌کوین‌ها" />

      <div className="space-y-6">
        <Tabs<DeFiTab>
          label="بخش‌های دیفای"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'flow', label: 'جریان سرمایه' },
            { value: 'overview', label: 'نمای کلی بازار' },
            { value: 'stablecoins', label: 'استیبل‌کوین‌ها' }
          ]}
        />
        <div {...panel('flow')}>
          <TvlFlowDashboard />
        </div>
        <div {...panel('overview')}>
          <OverviewPanel />
        </div>
        <div {...panel('stablecoins')}>
          <StablecoinsCG />
        </div>
      </div>

      <Section id="yield-products" title="محصولات بازدهی" description="تحلیل تخصصی بازدهی در بخش‌های جداگانه">
        <Surface className="divide-y divide-divider px-4 md:grid md:grid-cols-3 md:divide-x md:divide-y-0 md:px-0 md:rtl:divide-x-reverse">
          {YIELD_LINKS.map((l) => (
            <div key={l.to} className="md:px-5">
              <ListRow
                to={l.to}
                leading={
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
                    <l.icon className="h-5 w-5" />
                  </span>
                }
                title={l.title}
                subtitle={l.desc}
              />
            </div>
          ))}
        </Surface>
      </Section>
    </Page>
  );
}

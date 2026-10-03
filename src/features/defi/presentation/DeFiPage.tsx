/**
 * DeFi — capital flow, market overview, stablecoins.
 * Only the selected panel mounts, avoiding hidden provider requests.
 * Boros is the active yield module.
 */
import { useEffect, useState } from 'react';
import { Radar } from 'lucide-react';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { Tabs } from '@/shared/components/ui/SegmentedControl';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { ListRow } from '@/shared/components/ui/ListRow';
import { OverviewPanel } from './OverviewPanel';
import { StablecoinsCG } from './StablecoinsCG';
import { TvlFlowDashboard } from './TvlFlowDashboard';
import { useUiStore } from '@/shared/store/uiStore';


type DeFiTab = 'flow' | 'overview' | 'stablecoins';

const YIELD_LINKS = [
  { to: '/boros', title: 'بوروس', desc: 'بازارهای نرخ تأمین مالی', icon: Radar },
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


  return (
    <Page>
      <PageHeader title="دیفای" subtitle="شبکه‌ها، پروتکل‌ها و استیبل‌کوین‌ها" />

      <div className="space-y-6">
        <Tabs<DeFiTab>
          label="بخش‌های دیفای"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'flow', label: 'شبکه‌ها و پروتکل‌ها' },
            { value: 'overview', label: 'نمای کلی بازار' },
            { value: 'stablecoins', label: 'استیبل‌کوین‌ها' }
          ]}
        />
        {tab==='flow'&&<TvlFlowDashboard />}
        {tab==='overview'&&<OverviewPanel />}
        {tab==='stablecoins'&&<StablecoinsCG />}
      </div>

      <Section id="yield-products" title="محصولات بازدهی">
        <Surface className="divide-y divide-divider px-4 md:grid md:grid-cols-1 md:divide-x md:divide-y-0 md:px-0 md:rtl:divide-x-reverse">
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

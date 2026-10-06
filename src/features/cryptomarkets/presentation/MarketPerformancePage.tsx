import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { TopPerformersCard } from './TopPerformersCard';
import { WatchlistSection } from '@/features/eth-summary/presentation/WatchlistSection';
import { buttonClass } from '@/shared/components/ui/Button';

export function MarketPerformancePage() {
  return <Page>
    <PageHeader title="عملکرد بازار" subtitle="مقایسهٔ بازده در ۱، ۷، ۳۰، ۶۰ و ۹۰ روز گذشته"
      actions={<Link to="/simulation" className={buttonClass('outline', 'sm')}>شبیه‌سازی با سرمایهٔ دلخواه<ArrowLeft className="h-4 w-4" /></Link>} />
    <TopPerformersCard />
    <WatchlistSection />
  </Page>;
}

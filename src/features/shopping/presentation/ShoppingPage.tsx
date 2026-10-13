/** ============================================================
 * دستیار و راهنمای خرید — سه زبانه:
 *  دستیار (درخواست فارسی → مقایسهٔ چندسایتی)، دیجی‌کالا (جستجو و مقایسهٔ قبلی)، سرویس‌ها
 * ============================================================ */
import { useSearchParams } from 'react-router-dom';
import { LayoutGrid, ShoppingBag, Sparkles } from 'lucide-react';
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { Tabs } from '@/shared/components/ui/SegmentedControl';
import DigikalaPage from '../digikala/presentation/DigikalaPage';
import { AssistantPanel } from './AssistantPanel';
import { ServicesDirectory } from './ServicesDirectory';

type Tab = 'assistant' | 'digikala' | 'services';
const TABS = [
  { value: 'assistant' as const, label: 'دستیار', icon: <Sparkles aria-hidden className="h-4 w-4" /> },
  { value: 'digikala' as const, label: 'دیجی‌کالا', icon: <ShoppingBag aria-hidden className="h-4 w-4" /> },
  { value: 'services' as const, label: 'سرویس‌ها', icon: <LayoutGrid aria-hidden className="h-4 w-4" /> }
];

export default function ShoppingPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = raw === 'digikala' || raw === 'services' ? raw : 'assistant';
  const select = (t: Tab) => setParams(t === 'assistant' ? {} : { tab: t }, { replace: true });

  return (
    <Page>
      <PageHeader title="دستیار و راهنمای خرید" />
      <Tabs options={TABS} value={tab} onChange={select} label="بخش‌های دستیار خرید" />
      {tab === 'assistant' && <AssistantPanel />}
      {tab === 'digikala' && <DigikalaPage embedded />}
      {tab === 'services' && <ServicesDirectory />}
    </Page>
  );
}

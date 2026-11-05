/**
 * «اگر خریده بودم» ← دلار بازده‌دار به‌جای تتر/یو اس دی سی
 *   قبلاً «درآمد استیبل» در دیفای بود (فقط استراتژی اهرمی با نرخ امروز)؛ حالا سؤال اصلی کاربر را جواب می‌دهد
 *   و ابزار اهرمی در قدم آخر (پیشرفته) همچنان هست.
 */
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { SectionTabs, SIMULATION_TABS } from '@/shared/components/layout/SectionTabs';
import { StableYieldWizard } from './StableYieldWizard';

export default function StableYieldPage() {
  return (
    <Page>
      <PageHeader title="اگر خریده بودم" subtitle="دلار بازده‌دار به‌جای تتر یا یو اس دی سی بی‌کار — در هر بازار چقدر سود می‌کردید" />
      <SectionTabs tabs={SIMULATION_TABS} label="بخش‌های شبیه‌سازی" />
      <StableYieldWizard />
    </Page>
  );
}

/**
 * «اگر خریده بودم» ← سرمایهٔ یکسان در چند دارایی — همان CompareCalculator که قبلاً در ماشین‌حساب بود
 * (کنار شبیه‌سازی با تاریخچهٔ بازار؛ هر دو به یک سؤال جواب می‌دهند).
 */
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { SectionTabs, SIMULATION_TABS } from '@/shared/components/layout/SectionTabs';
import { CompareCalculator } from '@/features/calculators/presentation/CompareCalculator';

export default function CompareSimulationPage() {
  return (
    <Page>
      <PageHeader title="اگر خریده بودم" subtitle="سرمایهٔ یکسان در چند دارایی و یک بازه — کدام بیشتر می‌داد" />
      <SectionTabs tabs={SIMULATION_TABS} label="بخش‌های شبیه‌سازی" />
      <CompareCalculator />
    </Page>
  );
}

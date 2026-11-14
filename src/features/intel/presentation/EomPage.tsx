/**
 * صفحه مستقل «ستاپ پایان ماه (EOM Setup)» در بخش درآمد فاندینگ و آزمایشگاه کری دارینو
 */
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { FUNDING_TABS, SectionTabs } from '@/shared/components/layout/SectionTabs';
import { EomSetupTab } from './EomSetupTab';

export default function EomPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="استراتژی تقویمی · Hartley & Schwarz (2019)"
        title="ستاپ پایان ماه (EOM Setup)"
        subtitle="پیشنهاد ورود و خروج در روزهای پایانی ماه، راستی‌آزمایی نرخ برد (Win Rate) و نسبت شارپ در DEXهای کم‌اسلیپیج و صرافی‌های پرپچوال"
      />
      <SectionTabs tabs={FUNDING_TABS} label="بخش‌های درآمد فاندینگ و کری" className="mb-5" />
      <EomSetupTab />
    </Page>
  );
}

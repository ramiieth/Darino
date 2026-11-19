/**
 * صفحهٔ «طلای ایران» (بازار ایران) — داشبورد قیمت روز، روند ۷/۳۰/۶۰ روزه، اسنپ‌شات،
 * محاسبه‌گر طلای آنلاین و زینتی، مقایسه و صندوق‌های طلای بورسی.
 */
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { GoldTab } from './GoldTab';

export function GoldPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="بازار ایران · طلای ۱۸ عیار · سکه · صندوق‌های طلا"
        title="طلای ایران"
      />
      <GoldTab />
    </Page>
  );
}

export default GoldPage;

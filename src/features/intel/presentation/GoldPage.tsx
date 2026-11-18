/**
 * صفحهٔ «طلای ایران» (بازار ایران) — داشبورد قیمت روز، روند ۷/۳۰/۶۰ روزه، اسنپ‌شات،
 * محاسبه‌گر طلای آنلاین و زینتی، مقایسه، صندوق‌های طلای بورسی و تحلیل دلار/تتر.
 */
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { GoldTab } from './GoldTab';

export default function GoldPage() {
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

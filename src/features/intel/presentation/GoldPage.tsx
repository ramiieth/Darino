/**
 * صفحهٔ «طلای ایران» (بازار ایران) — قیمت ۱۸ عیار در پلتفرم‌های آنلاین در برابر ارزش جهانی‌اش.
 * محتوا همان GoldTab است؛ دادهٔ /api/intel?op=gold.
 */
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { GoldTab } from './GoldTab';

export default function GoldPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="میلی · وال‌گلد · ملی‌گلد · دریک · tgju"
        title="طلای ایران"
        meta={<p className="max-w-3xl text-sm leading-7 text-muted">قیمت طلای ۱۸ عیار و سکه در برابر ارزش طلای خالصشان با انس و دلار آزاد: کجا ارزان‌تر بخرید، حباب امروز در برابر ۱۳ سال گذشته کجاست و رشد اخیر از انس آمده یا دلار.</p>}
      />
      <GoldTab />
    </Page>
  );
}

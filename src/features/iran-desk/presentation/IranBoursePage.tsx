/**
 * صفحه مستقل «بورس ایران و میز تحلیل هوشمند» در گروه «بازار ایران»
 * مسیرها: /iran-stocks · /bourse · /iran-desk
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bot, CandlestickChart } from 'lucide-react';
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { IranMarketTable } from '@/features/markets/presentation/IranMarketTable';
import { IranSmartDesk } from './IranSmartDesk';

type BourseView = 'board' | 'desk';

export function IranBoursePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialView: BourseView =
    searchParams.get('view') === 'desk' ? 'desk' : 'board';
  const [view, setView] = useState<BourseView>(initialView);

  const handleViewChange = (next: BourseView) => {
    setView(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'desk') params.set('view', 'desk');
    else params.delete('view');
    setSearchParams(params, { replace: true });
  };

  return (
    <Page>
      <PageHeader
        title="بورس ایران و میز تحلیل"
        subtitle="تابلوی سهام، فرابورس، بورس کالا و صندوق‌های آتیه + تیم ۶ نفره، ۱۲ فیلتر و ۶ اندیکاتور"
      />

      <SegmentedControl<BourseView>
        label="بخش‌های بورس ایران"
        value={view}
        onChange={handleViewChange}
        options={[
          { value: 'board', label: 'تابلوی بازار و صندوق‌ها', icon: <CandlestickChart /> },
          { value: 'desk', label: 'میز تحلیل هوشمند (۶ Agent · ۱۲ فیلتر)', icon: <Bot /> }
        ]}
      />

      {view === 'board' ? <IranMarketTable /> : <IranSmartDesk />}
    </Page>
  );
}

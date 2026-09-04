/**
 * صفحه ماشین‌حساب‌های مالی — ۵ ابزار (همه محاسبات در domain؛ UI فقط نمایش)
 */
import { useState } from 'react';
import { PageHeader } from '@/shared/components/layout/Page';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { PnlCalculator } from './PnlCalculator';
import { DcaCalculator } from './DcaCalculator';
import { CagrCalculator } from './CagrCalculator';
import { XirrCalculator } from './XirrCalculator';
import { CompareCalculator } from './CompareCalculator';

type CalcTab = 'pnl' | 'dca' | 'cagr' | 'xirr' | 'compare';

export function CalculatorsPage() {
  const [tab, setTab] = useState<CalcTab>('pnl');

  return (
    <div className="space-y-4">
      <PageHeader
        title="ماشین‌حساب سرمایه‌گذاری"
        subtitle=""
      />

      <SegmentedControl<CalcTab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'pnl', label: 'سود و زیان' },
          { value: 'dca', label: 'DCA' },
          { value: 'cagr', label: 'CAGR' },
          { value: 'xirr', label: 'XIRR' },
          { value: 'compare', label: 'مقایسه بازارها' }
        ]}
      />

      <div className={tab !== 'pnl' ? 'hidden' : ''} aria-hidden={tab !== 'pnl'} inert={tab !== 'pnl' ? '' : undefined}>
        <PnlCalculator />
      </div>
      <div className={tab !== 'dca' ? 'hidden' : ''} aria-hidden={tab !== 'dca'} inert={tab !== 'dca' ? '' : undefined}>
        <DcaCalculator />
      </div>
      <div className={tab !== 'cagr' ? 'hidden' : ''} aria-hidden={tab !== 'cagr'} inert={tab !== 'cagr' ? '' : undefined}>
        <CagrCalculator />
      </div>
      <div className={tab !== 'xirr' ? 'hidden' : ''} aria-hidden={tab !== 'xirr'} inert={tab !== 'xirr' ? '' : undefined}>
        <XirrCalculator />
      </div>
      <div className={tab !== 'compare' ? 'hidden' : ''} aria-hidden={tab !== 'compare'} inert={tab !== 'compare' ? '' : undefined}>
        <CompareCalculator />
      </div>
    </div>
  );
}

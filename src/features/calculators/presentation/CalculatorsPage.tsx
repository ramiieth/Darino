/**
 * Investment calculators — five tools, all math in domain; UI presents only.
 * Panels stay mounted (inputs survive tab switches) and are `inert` when hidden.
 */
import { useState } from 'react';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { Tabs } from '@/shared/components/ui/SegmentedControl';
import { cn } from '@/shared/lib/cn';
import { PnlCalculator } from './PnlCalculator';
import { DcaCalculator } from './DcaCalculator';
import { CagrCalculator } from './CagrCalculator';
import { XirrCalculator } from './XirrCalculator';
import { CompareCalculator } from './CompareCalculator';

type CalcTab = 'pnl' | 'dca' | 'cagr' | 'xirr' | 'compare';

const TABS: { value: CalcTab; label: string; description: string }[] = [
  { value: 'pnl', label: 'سود و زیان', description: 'ارزش امروز یک موقعیت در برابر هزینه خرید آن' },
  { value: 'dca', label: 'خرید دوره‌ای', description: 'نتیجه سرمایه‌گذاری منظم با مبلغ ثابت در یک بازه' },
  { value: 'cagr', label: 'رشد سالانه', description: 'نرخ رشد سالانه مرکب بین دو ارزش' },
  { value: 'xirr', label: 'بازده واقعی', description: 'بازده سالانه جریان‌های نقدی در تاریخ‌های مختلف' },
  { value: 'compare', label: 'مقایسه دارایی‌ها', description: 'سرمایه یکسان در چند دارایی و یک بازه' }
];

export function CalculatorsPage() {
  const [tab, setTab] = useState<CalcTab>('pnl');
  const current = TABS.find((t) => t.value === tab);
  const panel = (id: CalcTab) => ({
    className: cn(tab !== id && 'hidden'),
    'aria-hidden': tab !== id,
    inert: tab !== id ? ('' as const) : undefined
  });

  return (
    <Page>
      <PageHeader
        title="ماشین‌حساب سرمایه‌گذاری"
        subtitle="محاسبهٔ سود، رشد و بازده سرمایه‌گذاری"
      />
      <div className="space-y-6">
        <div>
          <Tabs<CalcTab> label="ماشین‌حساب‌ها" options={TABS} value={tab} onChange={setTab} />
          {current && <p className="mt-3 text-sm text-muted">{current.description}</p>}
        </div>
        <div {...panel('pnl')}>
          <PnlCalculator />
        </div>
        <div {...panel('dca')}>
          <DcaCalculator />
        </div>
        <div {...panel('cagr')}>
          <CagrCalculator />
        </div>
        <div {...panel('xirr')}>
          <XirrCalculator />
        </div>
        <div {...panel('compare')}>
          <CompareCalculator />
        </div>
      </div>
    </Page>
  );
}

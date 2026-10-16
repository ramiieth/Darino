/**
 * Investment calculators — eight tools, all math in domain; UI presents only.
 * Panels stay mounted (inputs survive tab switches) and are `inert` when hidden.
 */
import { useState, type ReactNode } from 'react';
import { Scale, ShieldHalf } from 'lucide-react';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { Tabs } from '@/shared/components/ui/SegmentedControl';
import { cn } from '@/shared/lib/cn';
import { PnlCalculator } from './PnlCalculator';
import { DcaCalculator } from './DcaCalculator';
import { CagrCalculator } from './CagrCalculator';
import { XirrCalculator } from './XirrCalculator';
import { CompareCalculator } from './CompareCalculator';
import { PerpCalculator } from './PerpCalculator';
import { HedgeCalculator } from './hedge/HedgeCalculator';
import { DeltaNeutralCalculator } from './delta/DeltaNeutralCalculator';

type CalcTab = 'pnl' | 'dca' | 'perp' | 'hedge' | 'delta' | 'cagr' | 'xirr' | 'compare';

const TABS: { value: CalcTab; label: string; description: string; icon?: ReactNode }[] = [
  { value: 'pnl', label: 'سود و زیان', description: 'ارزش امروز یک موقعیت در برابر هزینه خرید آن' },
  { value: 'dca', label: 'خرید دوره‌ای', description: 'خرید منظم (روزانه تا سالانه) با مبلغ ثابت یا متغیر و پیش‌بینی قیمت آینده' },
  { value: 'perp', label: 'پرپ (PERP)', description: 'لانگ و شورت روی بازارهای لایتر و آرکوس — قیمت لیکویید، فاندینگ و سود با مارجین و اهرم' },
  {
    value: 'hedge',
    label: 'ماشین‌حساب هج',
    description: 'هج با پوزیشن مخالف در فیوچرز (Hedge Mode) — اثر Short بدون اهرم روی دارایی اسپات در ریزش و رشد بازار',
    icon: <ShieldHalf aria-hidden />
  },
  {
    value: 'delta',
    label: 'دلتا نوترال',
    description: 'Long و Short هم‌اندازه در دو صرافی (آرکوس، اوندو پرپس، لایتر) — سود فاندینگ، هزینهٔ کارمزد و حجم، فاصله تا لیکویید',
    icon: <Scale aria-hidden />
  },
  { value: 'cagr', label: 'رشد سالانه', description: 'نرخ رشد سالانه مرکب بین دو ارزش، یا پیش‌بینی ارزش آینده با واریز دوره‌ای' },
  { value: 'xirr', label: 'بازده واقعی', description: 'بازده سالانه جریان‌های نقدی در تاریخ‌های مختلف' },
  { value: 'compare', label: 'مقایسه دارایی‌ها', description: 'سرمایه یکسان در چند دارایی و یک بازه' }
];

export function CalculatorsPage() {
  const [tab, setTab] = useState<CalcTab>('pnl');
  // PERP polls live market APIs — mount it only once it has been opened
  const [perpOpened, setPerpOpened] = useState(false);
  if (tab === 'perp' && !perpOpened) setPerpOpened(true);
  // Delta neutral polls three venues and opens a WebSocket — mount it only once it has been opened
  const [deltaOpened, setDeltaOpened] = useState(false);
  if (tab === 'delta' && !deltaOpened) setDeltaOpened(true);
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
        <div {...panel('perp')}>
          {perpOpened && <PerpCalculator />}
        </div>
        <div {...panel('hedge')}>
          <HedgeCalculator />
        </div>
        <div {...panel('delta')}>
          {deltaOpened && <DeltaNeutralCalculator />}
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

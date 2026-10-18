/**
 * Investment calculators — ten tools, all math in domain; UI presents only.
 * Panels stay mounted (inputs survive tab switches) and are `inert` when hidden.
 */
import { useState, type ReactNode } from 'react';
import { BadgeDollarSign, Radar, Scale, ShieldHalf } from 'lucide-react';
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
import { DeltaProfitCalculator } from './delta/DeltaProfitCalculator';
import { FundingScanner } from './delta/FundingScanner';
import { DeltaVenuesProvider } from '@/features/calculators/data/deltaMarkets';

type CalcTab = 'pnl' | 'dca' | 'perp' | 'hedge' | 'delta' | 'arb' | 'scanner' | 'cagr' | 'xirr' | 'compare';
const DELTA_TABS: CalcTab[] = ['delta', 'arb', 'scanner'];

const TABS: { value: CalcTab; label: string; description: string; icon?: ReactNode }[] = [
  { value: 'pnl', label: 'سود و زیان', description: 'ارزش امروز یک موقعیت در برابر هزینه خرید آن' },
  { value: 'dca', label: 'خرید دوره‌ای', description: 'خرید منظم (روزانه تا سالانه) با مبلغ ثابت یا متغیر و پیش‌بینی قیمت آینده' },
  { value: 'perp', label: 'پرپ (PERP)', description: 'لانگ و شورت روی بازارهای لایتر و آرکوس — قیمت لیکویید، فاندینگ و سود با مارجین و اهرم' },
  {
    value: 'hedge',
    label: 'ماشین‌حساب پوشش ریسک (هج)',
    description: 'اسپات + پوزیشن Short در فیوچرز — سرمایهٔ اولیه و نهایی، سود یا زیان خالص پس از هزینه‌ها و مقایسهٔ منصفانه با حالت بدون هج در ریزش و رشد بازار',
    icon: <ShieldHalf aria-hidden />
  },
  {
    value: 'delta',
    label: 'دلتا نوترال',
    description: 'Long و Short هم‌اندازه در دو صرافی (آرکوس، اوندو پرپس، لایتر) — مسیر سرمایه، سود خالص تخمینی در سناریوی خروج، کارمزد، اسلیپیج و فاصله تا لیکویید',
    icon: <Scale aria-hidden />
  },
  {
    value: 'arb',
    label: 'سود واقعی دلتا',
    description: 'سرمایهٔ هر طرف را بدهید؛ بهترین جفت صرافی، سود خالص تخمینی و سرمایهٔ نهایی بعد از کارمزد، اسلیپیج و هزینهٔ انتقال',
    icon: <BadgeDollarSign aria-hidden />
  },
  {
    value: 'scanner',
    label: 'اسکنر فاندینگ',
    description: 'اختلاف فاندینگ ۱، ۷ و ۳۰ روزه، تعداد چرخش، ساعت‌های سودده و هشدار وقتی اختلاف برعکس شود',
    icon: <Radar aria-hidden />
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
  // Delta tabs poll three venues and share one Ondo WebSocket — mount each only once it has been opened
  const [opened, setOpened] = useState<Partial<Record<CalcTab, true>>>({});
  if (DELTA_TABS.includes(tab) && !opened[tab]) setOpened((o) => ({ ...o, [tab]: true }));
  const venuesOpened = DELTA_TABS.some((t) => opened[t]);
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
        {venuesOpened && (
          <DeltaVenuesProvider>
            <div {...panel('delta')}>{opened.delta && <DeltaNeutralCalculator />}</div>
            <div {...panel('arb')}>{opened.arb && <DeltaProfitCalculator onOpenScanner={() => setTab('scanner')} />}</div>
            <div {...panel('scanner')}>{opened.scanner && <FundingScanner />}</div>
          </DeltaVenuesProvider>
        )}
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

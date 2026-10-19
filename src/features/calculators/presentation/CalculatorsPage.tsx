/**
 * Investment calculators — twelve tools, all math in domain; UI presents only.
 * Panels stay mounted (inputs survive tab switches) and are `inert` when hidden.
 */
import { useState, type ReactNode } from 'react';
import { BadgeDollarSign, Bot, ListChecks, Radar, Scale, ShieldHalf } from 'lucide-react';
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
import { DeltaExecutionTab } from './delta/execution/DeltaExecutionTab';
import { OptionsWizard } from './options/OptionsWizard';
import { PlanWizard } from './plan/PlanWizard';
import type { ExecutionHandoff } from './delta/execution/ExecutionPlanner';
import { DeltaVenuesProvider } from '@/features/calculators/data/deltaMarkets';

type CalcTab = 'pnl' | 'dca' | 'perp' | 'options' | 'hedge' | 'plan' | 'delta' | 'execution' | 'arb' | 'scanner' | 'cagr' | 'xirr' | 'compare';
const DELTA_TABS: CalcTab[] = ['plan', 'delta', 'execution', 'arb', 'scanner'];

const TABS: { value: CalcTab; label: string; description: string; icon?: ReactNode }[] = [
  { value: 'pnl', label: 'سود و زیان', description: 'ارزش امروز یک موقعیت در برابر هزینه خرید آن' },
  { value: 'dca', label: 'خرید دوره‌ای', description: 'خرید منظم (روزانه تا سالانه) با مبلغ ثابت یا متغیر و پیش‌بینی قیمت آینده' },
  { value: 'perp', label: 'پرپ (PERP)', description: 'لانگ و شورت روی بازارهای لایتر و آرکوس — قیمت لیکویید، فاندینگ و سود با مارجین و اهرم' },
  { value: 'options', label: 'آپشن (Derive)', description: 'قدم به قدم: با توجه به سرمایه و نظرتان دربارهٔ بازار، یک معاملهٔ آپشن در صرافی Derive پیشنهاد می‌شود؛ همراه با بیشترین سود و زیان، سود یا زیان در هر حرکت قیمت و زمان مناسب خروج' },
  {
    value: 'hedge',
    label: 'ماشین‌حساب پوشش ریسک (هج)',
    description: 'اگر دارایی‌ای دارید و از ریزش قیمت نگرانید: یک موقعیت فروش (Short) هم‌اندازه در بازار آتی باز می‌کنید تا زیان ریزش جبران شود. اینجا می‌بینید با و بدون پوشش، پس از هزینه‌ها چه نتیجه‌ای می‌گیرید',
    icon: <ShieldHalf aria-hidden />
  },
  {
    value: 'plan',
    label: 'برنامهٔ من',
    description: 'همراه قدم به قدم: یک رمزارز، تقسیم پول، دلتا نوترال برای پوینت بدون ریسک قیمت، خرید پله‌ای در ریزش با FIFO/LIFO/میانگین، و برنامهٔ نهایی',
    icon: <ListChecks aria-hidden />
  },
  {
    value: 'delta',
    label: 'دلتا نوترال',
    description: 'یک موقعیت خرید (Long) و یک موقعیت فروش (Short) هم‌اندازه در دو صرافی، تا تغییر قیمت تقریباً روی سود و زیان اثر نگذارد و درآمد از فاندینگ یا امتیاز بیاید. سود خالص تقریبی پس از کارمزد و فاصله تا انحلال اجباری (لیکویید) را می‌بینید',
    icon: <Scale aria-hidden />
  },
  {
    value: 'execution',
    label: 'اجرا و پایش دلتا',
    description: 'بعد از طراحی دلتا نوترال: پیش از اجرا می‌بینید اجرای تدریجی سفارش‌ها چه اثری دارد؛ در حین اجرا، موقعیت‌های واقعی حساب‌هایتان پایش می‌شود تا اگر دو طرف از تعادل خارج شدند، پوشش را دوباره تنظیم کنید',
    icon: <Bot aria-hidden />
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

/** ابزارهای مرتبط با آپشن و پوشش ریسک — به ترتیب استفاده */
const RISK_TOOLS: { tab: CalcTab; need: string }[] = [
  { tab: 'options', need: 'می‌خواهم با آپشن روی بالا یا پایین رفتن (یا ثابت ماندن) قیمت معامله کنم.' },
  { tab: 'hedge', need: 'دارایی دارم و می‌خواهم در برابر ریزش قیمت از آن محافظت کنم.' },
  { tab: 'delta', need: 'می‌خواهم موقعیتی بسازم که تقریباً به تغییر قیمت حساس نباشد و درآمدش از فاندینگ بیاید.' },
  { tab: 'execution', need: 'موقعیت دلتا نوترال را باز کرده‌ام و می‌خواهم ببینم هنوز متعادل است یا باید تنظیمش کنم.' }
];

/** راهنمای کوتاه: کدام ابزار برای کدام نیاز، و ارتباطشان */
function RiskToolsGuide({ tab, onOpen }: { tab: CalcTab; onOpen: (t: CalcTab) => void }) {
  return (
    <details className="mt-3 rounded-card border border-divider bg-surface-2/40 p-3 text-xs leading-6 text-muted">
      <summary className="cursor-pointer font-semibold text-ink">کدام ابزار برای شما مناسب است؟</summary>
      <ul className="mt-2 space-y-1.5">
        {RISK_TOOLS.map((r) => (
          <li key={r.tab}>
            {r.need}{' '}
            {r.tab === tab ? (
              <b className="text-accent">← همین تب</b>
            ) : (
              <button type="button" className="font-semibold text-accent underline" onClick={() => onOpen(r.tab)}>
                ← {TABS.find((t) => t.value === r.tab)?.label}
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-2xs text-subtle">
        ارتباط این ابزارها: «پوشش ریسک» از دارایی موجود محافظت می‌کند. «دلتا نوترال» همین ایده را کامل‌تر می‌کند تا حساسیت به قیمت تقریباً صفر شود. «اجرا و پایش دلتا» همان موقعیت دلتا نوترال را در عمل دنبال می‌کند. «آپشن» راه جداگانه‌ای برای سود از حرکت یا آرامش بازار با زیان سقف‌دار است.
      </p>
    </details>
  );
}

export function CalculatorsPage() {
  const [tab, setTab] = useState<CalcTab>('pnl');
  // PERP polls live market APIs — mount it only once it has been opened
  const [perpOpened, setPerpOpened] = useState(false);
  if (tab === 'perp' && !perpOpened) setPerpOpened(true);
  // آپشن هم دادهٔ زندهٔ Derive می‌خواند — فقط بعد از باز شدن
  const [optionsOpened, setOptionsOpened] = useState(false);
  if (tab === 'options' && !optionsOpened) setOptionsOpened(true);
  // Delta tabs poll three venues and share one Ondo WebSocket — mount each only once it has been opened
  const [opened, setOpened] = useState<Partial<Record<CalcTab, true>>>({});
  if (DELTA_TABS.includes(tab) && !opened[tab]) setOpened((o) => ({ ...o, [tab]: true }));
  const venuesOpened = DELTA_TABS.some((t) => opened[t]);
  // «مقایسه با اجرای ربات» در دلتا نوترال: همان انتخاب به تب اجرا می‌رود
  const [handoff, setHandoff] = useState<ExecutionHandoff | null>(null);
  const openExecution = (h: Omit<ExecutionHandoff, 'nonce'>) => {
    setHandoff({ ...h, nonce: Date.now() });
    setTab('execution');
  };
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
          {RISK_TOOLS.some((r) => r.tab === tab) && <RiskToolsGuide tab={tab} onOpen={setTab} />}
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
        <div {...panel('options')}>{optionsOpened && <OptionsWizard />}</div>
        <div {...panel('hedge')}>
          <HedgeCalculator />
        </div>
        {venuesOpened && (
          <DeltaVenuesProvider>
            <div {...panel('plan')}>{opened.plan && <PlanWizard onOpenExecution={openExecution} />}</div>
            <div {...panel('delta')}>{opened.delta && <DeltaNeutralCalculator onOpenExecution={openExecution} />}</div>
            <div {...panel('execution')}>{opened.execution && <DeltaExecutionTab handoff={handoff} />}</div>
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

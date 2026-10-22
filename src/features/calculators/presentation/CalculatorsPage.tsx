/**
 * Investment calculators — twelve tools, all math in domain; UI presents only.
 * Panels stay mounted (inputs survive tab switches) and are `inert` when hidden.
 */
import { useState, type ReactNode } from 'react';
import { BadgeDollarSign, Bot, ListChecks, Radar, Scale, ShieldHalf } from 'lucide-react';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { SegmentedControl, Tabs } from '@/shared/components/ui/SegmentedControl';
import { toFaDigits } from '@/shared/utils/formatters';
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

type CalcTab = 'pnl' | 'dca' | 'perp' | 'options' | 'hedge' | 'plan' | 'delta' | 'cagr' | 'xirr' | 'compare';
type Group = 'invest' | 'income' | 'risk';
/** قدم‌های تب «درآمد دلتا نوترال»: پیدا کن ← تصمیم بگیر ← اجرا و پایش */
type HubStep = 'find' | 'decide' | 'run';
type FindView = 'scanner' | 'arb';

const TABS: { value: CalcTab; label: string; description: string; icon?: ReactNode }[] = [
  { value: 'pnl', label: 'سود و زیان', description: 'ارزش امروز یک موقعیت در برابر هزینه خرید آن' },
  { value: 'dca', label: 'خرید دوره‌ای', description: 'خرید منظم (روزانه تا سالانه) با مبلغ ثابت یا متغیر و پیش‌بینی قیمت آینده' },
  { value: 'cagr', label: 'رشد سالانه', description: 'نرخ رشد سالانه مرکب بین دو ارزش، یا پیش‌بینی ارزش آینده با واریز دوره‌ای' },
  { value: 'xirr', label: 'بازده واقعی', description: 'بازده سالانه جریان‌های نقدی در تاریخ‌های مختلف' },
  { value: 'compare', label: 'مقایسه دارایی‌ها', description: 'سرمایه یکسان در چند دارایی و یک بازه' },
  {
    value: 'plan',
    label: 'برنامهٔ من',
    description: 'همراه قدم به قدم: تقسیم پول بین خرید پله‌ای و دلتا نوترال، و برنامهٔ نهایی',
    icon: <ListChecks aria-hidden />
  },
  {
    value: 'delta',
    label: 'درآمد دلتا نوترال',
    description: 'یک خرید و یک فروش هم‌اندازه در دو صرافی؛ قیمت هرچه شود، این دو هم را خنثی می‌کنند و درآمد از اختلاف فاندینگ می‌آید. سه قدم: پیدا کن، تصمیم بگیر، اجرا و پایش.',
    icon: <Scale aria-hidden />
  },
  {
    value: 'hedge',
    label: 'پوشش ریسک (هج)',
    description: 'اگر دارایی‌ای دارید و از ریزش قیمت نگرانید: یک موقعیت فروش (Short) هم‌اندازه در بازار آتی باز می‌کنید تا زیان ریزش جبران شود. اینجا می‌بینید با و بدون پوشش، پس از هزینه‌ها چه نتیجه‌ای می‌گیرید',
    icon: <ShieldHalf aria-hidden />
  },
  { value: 'options', label: 'آپشن (Derive)', description: 'قدم به قدم: با توجه به سرمایه و نظرتان دربارهٔ بازار، یک معاملهٔ آپشن در صرافی Derive پیشنهاد می‌شود؛ همراه با بیشترین سود و زیان، سود یا زیان در هر حرکت قیمت و زمان مناسب خروج' },
  { value: 'perp', label: 'پرپ (PERP)', description: 'لانگ و شورت روی بازارهای لایتر، آرکوس، کیوفکس و تی‌اکس‌فلو — قیمت لیکویید، فاندینگ و سود با مارجین و اهرم' }
];

/** سه گروه به‌جای سیزده تب کنار هم */
const GROUPS: { value: Group; label: string; tabs: CalcTab[] }[] = [
  { value: 'invest', label: 'سرمایه‌گذاری', tabs: ['pnl', 'dca', 'cagr', 'xirr', 'compare', 'plan'] },
  { value: 'income', label: 'درآمد دلتا نوترال', tabs: ['delta'] },
  { value: 'risk', label: 'پوشش ریسک و آپشن', tabs: ['hedge', 'options', 'perp'] }
];
const groupOf = (t: CalcTab): Group => GROUPS.find((g) => g.tabs.includes(t))!.value;

const HUB_STEPS: { value: HubStep; title: string; sub: string; icon: ReactNode }[] = [
  { value: 'find', title: 'پیدا کن', sub: 'کدام ارز و کدام دو صرافی', icon: <Radar aria-hidden className="h-4 w-4" /> },
  { value: 'decide', title: 'تصمیم بگیر', sub: 'وضعیت امروز و سود خالص', icon: <BadgeDollarSign aria-hidden className="h-4 w-4" /> },
  { value: 'run', title: 'اجرا و پایش', sub: 'موقعیت باز شما متعادل است؟', icon: <Bot aria-hidden className="h-4 w-4" /> }
];

export function CalculatorsPage() {
  const [tab, setTab] = useState<CalcTab>('pnl');
  const [step, setStep] = useState<HubStep>('decide');
  const [findView, setFindView] = useState<FindView>('scanner');
  // PERP polls live market APIs — mount it only once it has been opened
  const [perpOpened, setPerpOpened] = useState(false);
  if (tab === 'perp' && !perpOpened) setPerpOpened(true);
  // آپشن هم دادهٔ زندهٔ Derive می‌خواند — فقط بعد از باز شدن
  const [optionsOpened, setOptionsOpened] = useState(false);
  if (tab === 'options' && !optionsOpened) setOptionsOpened(true);
  // ابزارهای دلتا سه صرافی را می‌خوانند — هر کدام فقط بعد از اولین باز شدن mount می‌شود و بعد زنده می‌ماند
  const [opened, setOpened] = useState<Partial<Record<'plan' | HubStep | FindView, true>>>({});
  const visibleKeys: ('plan' | HubStep | FindView)[] = tab === 'plan' ? ['plan'] : tab === 'delta' ? (step === 'find' ? ['find', findView] : [step]) : [];
  if (visibleKeys.some((k) => !opened[k])) setOpened((o) => ({ ...o, ...Object.fromEntries(visibleKeys.map((k) => [k, true])) }));
  const venuesOpened = Object.keys(opened).length > 0;
  // انتقال انتخاب به «اجرا و پایش»
  const [handoff, setHandoff] = useState<ExecutionHandoff | null>(null);
  const openExecution = (h: Omit<ExecutionHandoff, 'nonce'>) => {
    setHandoff({ ...h, nonce: Date.now() });
    setTab('delta');
    setStep('run');
  };
  const group = groupOf(tab);
  const groupTabs = GROUPS.find((g) => g.value === group)!.tabs;
  const current = TABS.find((t) => t.value === tab);
  const hide = (visible: boolean) => ({
    className: cn(!visible && 'hidden'),
    'aria-hidden': !visible,
    inert: !visible ? ('' as const) : undefined
  });
  const panel = (id: CalcTab) => hide(tab === id);
  const hubPanel = (id: HubStep) => hide(tab === 'delta' && step === id);

  return (
    <Page>
      <PageHeader title="ماشین‌حساب سرمایه‌گذاری" subtitle="محاسبهٔ سود، رشد و بازده سرمایه‌گذاری" />
      <div className="space-y-6">
        <div className="space-y-3">
          <SegmentedControl<Group>
            label="گروه ماشین‌حساب‌ها"
            value={group}
            onChange={(g) => setTab(GROUPS.find((x) => x.value === g)!.tabs[0])}
            options={GROUPS.map((g) => ({ value: g.value, label: g.label }))}
          />
          {groupTabs.length > 1 && <Tabs<CalcTab> label="ماشین‌حساب‌ها" options={TABS.filter((t) => groupTabs.includes(t.value))} value={tab} onChange={setTab} />}
          {current && <p className="text-sm text-muted">{current.description}</p>}
          {tab === 'delta' && (
            <ol className="grid grid-cols-3 gap-2" aria-label="قدم‌های دلتا نوترال">
              {HUB_STEPS.map((h, i) => {
                const here = h.value === step;
                return (
                  <li key={h.value}>
                    <button
                      type="button"
                      onClick={() => setStep(h.value)}
                      aria-current={here ? 'step' : undefined}
                      className={cn('flex h-full w-full flex-col items-start gap-0.5 rounded-card border p-2.5 text-start transition-colors', here ? 'border-accent bg-accent-soft' : 'border-divider bg-card hover:border-divider-strong')}
                    >
                      <span className={cn('flex items-center gap-1.5 text-sm font-bold', here ? 'text-accent' : 'text-ink')}>
                        {h.icon}
                        {toFaDigits(i + 1)}. {h.title}
                      </span>
                      <span className="text-2xs leading-4 text-muted">{h.sub}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        <div {...panel('pnl')}>
          <PnlCalculator />
        </div>
        <div {...panel('dca')}>
          <DcaCalculator />
        </div>
        <div {...panel('perp')}>{perpOpened && <PerpCalculator />}</div>
        <div {...panel('options')}>{optionsOpened && <OptionsWizard />}</div>
        <div {...panel('hedge')}>
          <HedgeCalculator />
        </div>
        {venuesOpened && (
          <DeltaVenuesProvider>
            <div {...panel('plan')}>
              {opened.plan && (
                <PlanWizard
                  onOpenExecution={openExecution}
                  onOpenDecide={() => {
                    setTab('delta');
                    setStep('decide');
                  }}
                />
              )}
            </div>
            <div {...hubPanel('find')} >
              <div className="mb-4">
                <SegmentedControl<FindView>
                  size="sm"
                  label="روش پیدا کردن"
                  value={findView}
                  onChange={setFindView}
                  options={[
                    { value: 'scanner', label: 'اختلاف فاندینگ الان و ۷ و ۳۰ روز' },
                    { value: 'arb', label: 'سود واقعی با سرمایهٔ من' }
                  ]}
                />
              </div>
              <div {...hide(findView === 'scanner')}>{opened.scanner && <FundingScanner />}</div>
              <div {...hide(findView === 'arb')}>{opened.arb && <DeltaProfitCalculator onOpenScanner={() => setFindView('scanner')} />}</div>
            </div>
            <div {...hubPanel('decide')}>{opened.decide && <DeltaNeutralCalculator onOpenExecution={openExecution} />}</div>
            <div {...hubPanel('run')}>{opened.run && <DeltaExecutionTab handoff={handoff} />}</div>
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

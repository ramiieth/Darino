/**
 * Investment calculators — twelve tools, all math in domain; UI presents only.
 * Panels stay mounted (inputs survive tab switches) and are `inert` when hidden.
 */
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ListChecks, ShieldHalf, Store } from 'lucide-react';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { SegmentedControl, Tabs } from '@/shared/components/ui/SegmentedControl';
import { cn } from '@/shared/lib/cn';
import { PnlCalculator } from './PnlCalculator';
import { DcaCalculator } from './DcaCalculator';
import { CagrCalculator } from './CagrCalculator';
import { XirrCalculator } from './XirrCalculator';
import { PerpCalculator } from './PerpCalculator';
import { HedgeCalculator } from './hedge/HedgeCalculator';
import { OptionsWizard } from './options/OptionsWizard';
import { PlanWizard } from './plan/PlanWizard';
import { ShopBreakEvenCalculator } from './ShopBreakEvenCalculator';
import { DeltaVenuesProvider } from '@/features/calculators/data/deltaMarkets';

/**
 * دلتا نوترال و استراتژی‌های فاندینگ به «درآمد فاندینگ» (/funding) رفته‌اند و «مقایسه دارایی‌ها» به
 * «اگر خریده بودم» (/simulation/compare)؛ این صفحه فقط ماشین‌حساب‌های عمومی را نگه می‌دارد.
 */
type CalcTab = 'pnl' | 'dca' | 'perp' | 'options' | 'hedge' | 'plan' | 'cagr' | 'xirr' | 'shop';
type Group = 'invest' | 'risk' | 'business';

const TABS: { value: CalcTab; label: string; description: string; icon?: ReactNode }[] = [
  { value: 'pnl', label: 'سود و زیان', description: 'ارزش امروز یک موقعیت در برابر هزینه خرید آن' },
  { value: 'dca', label: 'خرید دوره‌ای', description: 'خرید منظم (روزانه تا سالانه) با مبلغ ثابت یا متغیر و پیش‌بینی قیمت آینده' },
  { value: 'cagr', label: 'رشد سالانه', description: 'نرخ رشد سالانه مرکب بین دو ارزش، یا پیش‌بینی ارزش آینده با واریز دوره‌ای' },
  { value: 'xirr', label: 'بازده واقعی', description: 'بازده سالانه جریان‌های نقدی در تاریخ‌های مختلف' },
  {
    value: 'plan',
    label: 'برنامهٔ من',
    description: 'همراه قدم به قدم: تقسیم پول بین خرید پله‌ای و دلتا نوترال، و برنامهٔ نهایی',
    icon: <ListChecks aria-hidden />
  },
  {
    value: 'hedge',
    label: 'پوشش ریسک (هج)',
    description: 'اگر دارایی‌ای دارید و از ریزش قیمت نگرانید: یک موقعیت فروش (Short) هم‌اندازه در بازار آتی باز می‌کنید تا زیان ریزش جبران شود. اینجا می‌بینید با و بدون پوشش، پس از هزینه‌ها چه نتیجه‌ای می‌گیرید',
    icon: <ShieldHalf aria-hidden />
  },
  { value: 'options', label: 'آپشن (Derive)', description: 'قدم به قدم: با توجه به سرمایه و نظرتان دربارهٔ بازار، یک معاملهٔ آپشن در صرافی Derive پیشنهاد می‌شود؛ همراه با بیشترین سود و زیان، سود یا زیان در هر حرکت قیمت و زمان مناسب خروج' },
  {
    value: 'shop',
    label: 'سربه‌سر دلاری مغازه',
    description: 'چقدر بفروشید تا با تورم دلار، هم قفسه پر بماند و هم ارزش دلاری پول پیش حفظ شود — با اثر خرید چکی و تست بحران فروش ضعیف',
    icon: <Store aria-hidden />
  },
  { value: 'perp', label: 'پرپ (PERP)', description: 'لانگ و شورت روی بازارهای لایتر، آرکوس، کیوفکس و تی‌اکس‌فلو — قیمت لیکویید، فاندینگ و سود با مارجین و اهرم' }
];

/** چهار گروه به‌جای چهارده تب کنار هم */
const GROUPS: { value: Group; label: string; tabs: CalcTab[] }[] = [
  { value: 'invest', label: 'سرمایه‌گذاری', tabs: ['pnl', 'dca', 'cagr', 'xirr', 'plan'] },
  { value: 'risk', label: 'ریسک و آپشن', tabs: ['hedge', 'options', 'perp'] },
  { value: 'business', label: 'کسب‌وکار', tabs: ['shop'] }
];
const groupOf = (t: CalcTab): Group => GROUPS.find((g) => g.tabs.includes(t))!.value;

export function CalculatorsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<CalcTab>('pnl');
  // PERP polls live market APIs — mount it only once it has been opened
  const [perpOpened, setPerpOpened] = useState(false);
  if (tab === 'perp' && !perpOpened) setPerpOpened(true);
  // آپشن هم دادهٔ زندهٔ Derive می‌خواند — فقط بعد از باز شدن
  const [optionsOpened, setOptionsOpened] = useState(false);
  if (tab === 'options' && !optionsOpened) setOptionsOpened(true);
  // «برنامهٔ من» سه صرافی را می‌خواند — فقط بعد از اولین باز شدن
  const [planOpened, setPlanOpened] = useState(false);
  if (tab === 'plan' && !planOpened) setPlanOpened(true);
  const group = groupOf(tab);
  const groupTabs = GROUPS.find((g) => g.value === group)!.tabs;
  const current = TABS.find((t) => t.value === tab);
  const hide = (visible: boolean) => ({
    className: cn(!visible && 'hidden'),
    'aria-hidden': !visible,
    inert: !visible ? ('' as const) : undefined
  });
  const panel = (id: CalcTab) => hide(tab === id);

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
          {group === 'invest' && (
            <p className="text-xs leading-6 text-muted">
              درآمد دلتا نوترال و اسکنر فاندینگ در <Link to="/funding" className="font-semibold text-accent underline">درآمد فاندینگ</Link> است؛ مقایسهٔ سرمایهٔ یکسان در چند دارایی در{' '}
              <Link to="/simulation/compare" className="font-semibold text-accent underline">اگر خریده بودم</Link>.
            </p>
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
        {planOpened && (
          <DeltaVenuesProvider>
            <div {...panel('plan')}>
              <PlanWizard
                onOpenExecution={(handoff) => navigate('/funding?tab=run', { state: { handoff } })}
                onOpenDecide={() => navigate('/funding?tab=decide')}
              />
            </div>
          </DeltaVenuesProvider>
        )}
        <div {...panel('cagr')}>
          <CagrCalculator />
        </div>
        <div {...panel('xirr')}>
          <XirrCalculator />
        </div>
        <div {...panel('shop')}>
          <ShopBreakEvenCalculator />
        </div>
      </div>
    </Page>
  );
}

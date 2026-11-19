/**
 * ماشین‌حساب سرمایه‌گذاری — ساختار یکپارچه و بدون هم‌پوشانی:
 *   ۱) خرید پله‌ای و دوره‌ای (DCA): سبد چندارزی + کمیته ایجنت‌ها | شبیه‌ساز خرید دوره‌ای تک‌ارز
 *   ۲) برنامهٔ من: تقسیم سرمایه + خرید پله‌ای با امکان ورود دستی قیمت + دلتا نوترال
 *   ۳) سود و بازده: سود و زیان | رشد مرکب (CAGR) | بازده واقعی (XIRR)
 */
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, ListChecks, ShieldHalf, Store } from 'lucide-react';
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
import { CashSecuredPutCalculator } from './CashSecuredPutCalculator';
import { PlanWizard } from './plan/PlanWizard';
import { ShopBreakEvenCalculator } from './ShopBreakEvenCalculator';
import { PortfolioBasketDcaCommitteePanel } from './PortfolioBasketDcaCommitteePanel';
import { Mt5RiskManagerCalculator } from './Mt5RiskManagerCalculator';
import { DeltaVenuesProvider } from '@/features/calculators/data/deltaMarkets';

type CalcTab = 'dca' | 'plan' | 'returns' | 'perp' | 'options' | 'csp' | 'hedge' | 'mt5-risk' | 'shop';
type Group = 'invest' | 'risk' | 'business';
type DcaMode = 'basket' | 'periodic';
type ReturnsMode = 'pnl' | 'cagr' | 'xirr';

const TABS: { value: CalcTab; label: string; icon?: ReactNode }[] = [
  { value: 'dca', label: 'خرید پله‌ای و دوره‌ای (DCA)', icon: <ListChecks aria-hidden /> },
  { value: 'plan', label: 'برنامهٔ من', icon: <ListChecks aria-hidden /> },
  { value: 'returns', label: 'سود و بازده', icon: <BarChart3 aria-hidden /> },
  { value: 'mt5-risk', label: 'مدیریت ریسک (MT5)', icon: <ShieldHalf aria-hidden /> },
  { value: 'hedge', label: 'پوشش ریسک (هج)', icon: <ShieldHalf aria-hidden /> },
  { value: 'options', label: 'آپشن (Derive)' },
  { value: 'csp', label: 'فروش اختیار (CSP)' },
  { value: 'perp', label: 'پرپ (PERP)' },
  { value: 'shop', label: 'سربه‌سر مغازه', icon: <Store aria-hidden /> }
];

const GROUPS: { value: Group; label: string; tabs: CalcTab[] }[] = [
  { value: 'invest', label: 'سرمایه‌گذاری و سبد', tabs: ['dca', 'plan', 'returns'] },
  { value: 'risk', label: 'ریسک و آپشن', tabs: ['mt5-risk', 'hedge', 'options', 'csp', 'perp'] },
  { value: 'business', label: 'کسب‌وکار', tabs: ['shop'] }
];
const groupOf = (t: CalcTab): Group => GROUPS.find((g) => g.tabs.includes(t))!.value;

export function CalculatorsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<CalcTab>('dca');
  const [dcaMode, setDcaMode] = useState<DcaMode>('basket');
  const [returnsMode, setReturnsMode] = useState<ReturnsMode>('pnl');
  const [perpOpened, setPerpOpened] = useState(false);
  if (tab === 'perp' && !perpOpened) setPerpOpened(true);
  const [optionsOpened, setOptionsOpened] = useState(false);
  if (tab === 'options' && !optionsOpened) setOptionsOpened(true);
  const [cspOpened, setCspOpened] = useState(false);
  if (tab === 'csp' && !cspOpened) setCspOpened(true);
  const [planOpened, setPlanOpened] = useState(false);
  if (tab === 'plan' && !planOpened) setPlanOpened(true);

  const group = groupOf(tab);
  const groupTabs = GROUPS.find((g) => g.value === group)!.tabs;
  const hide = (visible: boolean) => ({
    className: cn(!visible && 'hidden'),
    'aria-hidden': !visible,
    inert: !visible ? ('' as const) : undefined
  });
  const panel = (id: CalcTab) => hide(tab === id);

  return (
    <Page>
      <PageHeader title="ماشین‌حساب" subtitle="سبد DCA، برنامهٔ شخصی خرید و محاسبهٔ سود و ریسک" />
      <div className="space-y-5">
        <div className="space-y-3">
          <SegmentedControl<Group>
            label="گروه ماشین‌حساب‌ها"
            value={group}
            onChange={(g) => setTab(GROUPS.find((x) => x.value === g)!.tabs[0])}
            options={GROUPS.map((g) => ({ value: g.value, label: g.label }))}
          />
          {groupTabs.length > 1 && (
            <Tabs<CalcTab>
              label="ماشین‌حساب‌ها"
              options={TABS.filter((t) => groupTabs.includes(t.value))}
              value={tab}
              onChange={setTab}
            />
          )}
        </div>

        {/* تب یکپارچه DCA: سبد چندارزی + کمیته ایجنت‌ها | شبیه‌ساز خرید دوره‌ای تک‌ارز */}
        <div {...panel('dca')} className={cn(tab !== 'dca' && 'hidden', 'space-y-4')}>
          <SegmentedControl<DcaMode>
            label="حالت خرید پله‌ای و دوره‌ای"
            size="sm"
            value={dcaMode}
            onChange={setDcaMode}
            options={[
              { value: 'basket', label: 'سبد چندارزی + کمیته ایجنت‌ها' },
              { value: 'periodic', label: 'شبیه‌ساز خرید دوره‌ای (تک‌ارز)' }
            ]}
          />
          <div {...hide(dcaMode === 'basket')}>
            <PortfolioBasketDcaCommitteePanel />
          </div>
          <div {...hide(dcaMode === 'periodic')}>
            <DcaCalculator />
          </div>
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

        <div {...panel('returns')} className={cn(tab !== 'returns' && 'hidden', 'space-y-4')}>
          <SegmentedControl<ReturnsMode>
            label="نوع محاسبهٔ سود و بازده"
            size="sm"
            value={returnsMode}
            onChange={setReturnsMode}
            options={[
              { value: 'pnl', label: 'سود و زیان' },
              { value: 'cagr', label: 'رشد مرکب (CAGR)' },
              { value: 'xirr', label: 'بازده واقعی (XIRR)' }
            ]}
          />
          <div {...hide(returnsMode === 'pnl')}>
            <PnlCalculator />
          </div>
          <div {...hide(returnsMode === 'cagr')}>
            <CagrCalculator />
          </div>
          <div {...hide(returnsMode === 'xirr')}>
            <XirrCalculator />
          </div>
        </div>

        <div {...panel('perp')}>{perpOpened && <PerpCalculator />}</div>
        <div {...panel('options')}>{optionsOpened && <OptionsWizard />}</div>
        <div {...panel('csp')}>{cspOpened && <CashSecuredPutCalculator />}</div>
        <div {...panel('mt5-risk')}>
          <Mt5RiskManagerCalculator />
        </div>
        <div {...panel('hedge')}>
          <HedgeCalculator />
        </div>
        <div {...panel('shop')}>
          <ShopBreakEvenCalculator />
        </div>
      </div>
    </Page>
  );
}

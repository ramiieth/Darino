/**
 * ماشین‌حساب سرمایه‌گذاری — ساختار خلوت، بدون تداخل با «میز معامله» و بدون تکرار:
 *   گروه ۱ (سرمایه‌گذاری و سبد): خرید پله‌ای (DCA) · سود و بازده (PnL / CAGR / XIRR) · تقسیم سرمایه و برنامه
 *   گروه ۲ (ریسک، پرپ و آپشن): پرپ و لیکوییدیشن · مدیریت ریسک فارکس (MT5) · پوشش ریسک (هج) · آپشن و اختیار (Derive / CSP)
 *   گروه ۳ (کسب‌وکار): سربه‌سر کسب‌وکار
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  Briefcase,
  Compass,
  Flame,
  Layers,
  ListChecks,
  Scale,
  ShieldHalf,
  Store,
  Telescope
} from 'lucide-react';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Surface } from '@/shared/components/ui/GlassCard';
import { buttonClass } from '@/shared/components/ui/Button';
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

type CalcTab = 'dca' | 'returns' | 'plan' | 'perp' | 'mt5-risk' | 'hedge' | 'options' | 'shop';
type Group = 'invest' | 'risk' | 'business';
type DcaMode = 'basket' | 'periodic';
type ReturnsMode = 'pnl' | 'cagr' | 'xirr';
type OptionsMode = 'derive' | 'csp';

const TABS: { value: CalcTab; label: string; desc: string; icon: typeof ListChecks }[] = [
  { value: 'dca', label: 'خرید پله‌ای (DCA)', desc: 'سبد چندارزی و شبیه‌ساز خرید دوره‌ای', icon: Layers },
  { value: 'returns', label: 'سود و بازده', desc: 'سود و زیان، رشد مرکب و بازده واقعی', icon: BarChart3 },
  { value: 'plan', label: 'تقسیم سرمایه', desc: 'تخصیص بودجه و خرید پله‌ای دستی', icon: Compass },
  { value: 'perp', label: 'پرپ و لیکوییدیشن', desc: 'لیکویید، ROE و فاندینگ مارجین ایزوله', icon: Flame },
  { value: 'mt5-risk', label: 'ریسک فارکس (MT5)', desc: 'حجم لات، حد ضرر و قوانین پراپ', icon: ShieldHalf },
  { value: 'hedge', label: 'پوشش ریسک (هج)', desc: 'محافظت از افت ارزش دارایی با پرپ', icon: Scale },
  { value: 'options', label: 'آپشن و اختیار', desc: 'اختیار معامله Derive و فروش پوت (CSP)', icon: ListChecks },
  { value: 'shop', label: 'سربه‌سر کسب‌وکار', desc: 'فروش لازم برای پوشش هزینه‌های ثابت', icon: Store }
];

const GROUPS: { value: Group; label: string; icon: typeof Layers; tabs: CalcTab[] }[] = [
  { value: 'invest', label: 'سرمایه‌گذاری و سبد', icon: Layers, tabs: ['dca', 'returns', 'plan'] },
  { value: 'risk', label: 'ریسک، پرپ و آپشن', icon: ShieldHalf, tabs: ['perp', 'mt5-risk', 'hedge', 'options'] },
  { value: 'business', label: 'کسب‌وکار', icon: Briefcase, tabs: ['shop'] }
];

const groupOf = (t: CalcTab): Group => GROUPS.find((g) => g.tabs.includes(t))!.value;

export function CalculatorsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<CalcTab>('dca');
  const [dcaMode, setDcaMode] = useState<DcaMode>('basket');
  const [returnsMode, setReturnsMode] = useState<ReturnsMode>('pnl');
  const [optionsMode, setOptionsMode] = useState<OptionsMode>('derive');

  const [opened, setOpened] = useState<Partial<Record<CalcTab, true>>>({ dca: true });
  if (!opened[tab]) setOpened((o) => ({ ...o, [tab]: true }));

  const group = groupOf(tab);
  const groupTabs = GROUPS.find((g) => g.value === group)!.tabs;
  const visibleTabs = TABS.filter((t) => groupTabs.includes(t.value));

  const hide = (visible: boolean) => ({
    className: cn(!visible && 'hidden'),
    'aria-hidden': !visible,
    inert: !visible ? ('' as const) : undefined
  });
  const panel = (id: CalcTab) => hide(tab === id);

  return (
    <Page>
      <PageHeader
        eyebrow="ابزارهای محاسبه و شبیه‌سازی عددی"
        title="ماشین‌حساب"
        subtitle="شبیه‌سازی خرید پله‌ای، سود و بازده، لیکوییدیشن پرپ، آپشن و مدیریت ریسک — بدون تداخل با تصمیم‌گیری زنده"
        actions={
          <Link to="/desk" className={cn(buttonClass('outline', 'sm'), 'border-accent/30 bg-accent/10 text-accent hover:bg-accent/15')}>
            <Telescope className="h-3.5 w-3.5" aria-hidden />
            <span>تصمیم خرید در میز معامله</span>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          </Link>
        }
      />

      <div className="space-y-5">
        {/* نوار گروه‌ها و کارت-تب‌های تمیز */}
        <Surface className="relative space-y-3.5 overflow-hidden p-3.5 md:p-4">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[2.5px] bg-gradient-to-l from-accent via-gain/65 to-transparent"
          />
          <SegmentedControl<Group>
            label="گروه ماشین‌حساب‌ها"
            value={group}
            onChange={(g) => setTab(GROUPS.find((x) => x.value === g)!.tabs[0])}
            options={GROUPS.map(({ value, label, icon: Icon }) => ({
              value,
              label,
              icon: <Icon aria-hidden />
            }))}
          />

          {visibleTabs.length > 1 && (
            <div
              className={cn(
                'grid gap-2',
                visibleTabs.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4'
              )}
              role="tablist"
              aria-label="ماشین‌حساب‌ها"
            >
              {visibleTabs.map(({ value, label, desc, icon: Icon }) => {
                const active = tab === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(value)}
                    className={cn(
                      'flex items-start gap-2.5 rounded-xl border p-3 text-start transition-all duration-150',
                      active
                        ? 'border-accent/45 bg-accent/[0.06] shadow-sm'
                        : 'border-divider/70 bg-card hover:border-divider-strong hover:bg-surface-2/50'
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                        active ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className={cn('block text-xs font-bold', active ? 'text-accent' : 'text-ink')}>{label}</span>
                      <span className="mt-0.5 block line-clamp-1 text-[11px] text-muted">{desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Surface>

        {/* تب ۱: خرید پله‌ای (DCA) — بدون تکرار داخلی */}
        <div {...panel('dca')} className={cn(tab !== 'dca' && 'hidden', 'space-y-4')}>
          <SegmentedControl<DcaMode>
            label="حالت خرید پله‌ای و دوره‌ای"
            size="sm"
            value={dcaMode}
            onChange={setDcaMode}
            options={[
              { value: 'basket', label: 'سبد چندارزی و آزمون استرس بحران' },
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

        {/* تب ۲: سود و بازده */}
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

        {/* تب ۳: تقسیم سرمایه */}
        {opened.plan && (
          <DeltaVenuesProvider>
            <div {...panel('plan')}>
              <PlanWizard
                onOpenExecution={(handoff) => navigate('/funding?tab=run', { state: { handoff } })}
                onOpenDecide={() => navigate('/funding?tab=decide')}
              />
            </div>
          </DeltaVenuesProvider>
        )}

        {/* تب ۴: پرپ و لیکوییدیشن */}
        <div {...panel('perp')}>{opened.perp && <PerpCalculator />}</div>

        {/* تب ۵: مدیریت ریسک فارکس (MT5) */}
        <div {...panel('mt5-risk')}>{opened['mt5-risk'] && <Mt5RiskManagerCalculator />}</div>

        {/* تب ۶: پوشش ریسک (هج) */}
        <div {...panel('hedge')}>{opened.hedge && <HedgeCalculator />}</div>

        {/* تب ۷: آپشن و اختیار (ادغام تمیز Derive + CSP) */}
        <div {...panel('options')} className={cn(tab !== 'options' && 'hidden', 'space-y-4')}>
          {opened.options && (
            <>
              <SegmentedControl<OptionsMode>
                label="نوع ماشین‌حساب آپشن"
                size="sm"
                value={optionsMode}
                onChange={setOptionsMode}
                options={[
                  { value: 'derive', label: 'آپشن (Derive)' },
                  { value: 'csp', label: 'فروش اختیار خرید با وثیقه (CSP)' }
                ]}
              />
              <div {...hide(optionsMode === 'derive')}>
                <OptionsWizard />
              </div>
              <div {...hide(optionsMode === 'csp')}>
                <CashSecuredPutCalculator />
              </div>
            </>
          )}
        </div>

        {/* تب ۸: سربه‌سر کسب‌وکار */}
        <div {...panel('shop')}>{opened.shop && <ShopBreakEvenCalculator />}</div>
      </div>
    </Page>
  );
}

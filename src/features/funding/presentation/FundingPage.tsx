/**
 * درآمد فاندینگ (دلتا نوترال) — ساختار خلوت و هدف‌محور پس از لوپ نقد:
 *   ۱. فرصت و سود (/funding)
 *      - اسکنر زنده (اختلاف فاندینگ الان و ۷ و ۳۰ روز + فارم پوینت)
 *      - سود واقعی با سرمایه من (بر پایه میانگین ۷ روز و دفتر سفارش زنده)
 *      - سناریو و تصمیم (ماشین‌حساب کامل دلتا نوترال + دکمه اجرای سریع) — لینک قدیمی ?tab=decide همین‌جا باز می‌شود
 *      - استراتژی‌ها و بوروس (مقایسه راه‌ها برای یک نماد)
 *   ۲. اجرا و دفتر (/funding?tab=run)
 *      - راهنمای جفت (اندازه دقیق هر پا + لینک صرافی + یادآور تعادل)
 *      - برنامه اجرا و پایش زنده (Tread.fi، برگه سفارش و پایش)
 *      - دفتر جفت‌ها (تاریخچه، حجم، هزینه هر ۱ میلیون دلار و تعادل) — لینک قدیمی ?tab=ledger همین‌جا باز می‌شود
 *   ۳. نرخ ثابت (بوروس) (/boros)
 *   ۴. بک‌تست و بات (/carry-lab)
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpenCheck, Calculator, Compass, Layers, Radar, SlidersHorizontal, Zap } from 'lucide-react';
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { FUNDING_TABS, SectionTabs } from '@/shared/components/layout/SectionTabs';
import { Surface } from '@/shared/components/ui/GlassCard';
import { cn } from '@/shared/lib/cn';
import { DeltaVenuesProvider } from '@/features/calculators/data/deltaMarkets';
import { FundingScanner } from '@/features/calculators/presentation/delta/FundingScanner';
import { DeltaProfitCalculator } from '@/features/calculators/presentation/delta/DeltaProfitCalculator';
import { DeltaNeutralCalculator } from '@/features/calculators/presentation/delta/DeltaNeutralCalculator';
import { DeltaExecutionTab } from '@/features/calculators/presentation/delta/execution/DeltaExecutionTab';
import type { ExecutionHandoff } from '@/features/calculators/presentation/delta/execution/ExecutionPlanner';
import { FundingStrategiesCalculator } from '@/features/calculators/presentation/strategies/FundingStrategiesCalculator';
import { HedgeAssistant } from '@/features/journal/presentation/HedgeAssistant';
import { NeutralLedger } from '@/features/journal/presentation/NeutralLedger';
import { AuthGate } from '@/features/auth/AuthGate';

type Section = 'find' | 'run';
type FindView = 'scanner' | 'arb' | 'decide' | 'strategies';
type RunView = 'assistant' | 'execution' | 'ledger';

const FIND_VIEWS: { value: FindView; label: string; desc: string; icon: typeof Radar }[] = [
  { value: 'scanner', label: 'اسکنر فرصت‌ها', desc: 'اختلاف فاندینگ ۱، ۷ و ۳۰ روز + فارم پوینت', icon: Radar },
  { value: 'arb', label: 'سود واقعی من', desc: 'بهترین جفت با سرمایه و دفتر سفارش زنده', icon: Calculator },
  { value: 'decide', label: 'سناریو و تصمیم', desc: 'محاسبه دقیق جفت، لیکویید و دکمه اجرا', icon: SlidersHorizontal },
  { value: 'strategies', label: 'استراتژی‌ها (با بوروس)', desc: 'مقایسه همه راه‌ها برای یک نماد', icon: Layers }
];

const RUN_VIEWS: { value: RunView; label: string; desc: string; icon: typeof Zap }[] = [
  { value: 'assistant', label: 'راهنمای جفت', desc: 'اندازه دقیق هر پا، لینک صرافی و تعادل', icon: Compass },
  { value: 'execution', label: 'برنامه اجرا و پایش', desc: 'برگه سفارش، ربات اجرا و پایش زنده', icon: Zap },
  { value: 'ledger', label: 'دفتر جفت‌ها', desc: 'حجم، فاندینگ، کارمزد و تاریخچه جفت‌ها', icon: BookOpenCheck }
];

/** انتقال از «برنامهٔ من» در ماشین‌حساب: location.state.handoff */
export type FundingNavState = { handoff?: Omit<ExecutionHandoff, 'nonce'> } | null;

export default function FundingPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const rawTab = params.get('tab');
  const section: Section = rawTab === 'run' || rawTab === 'ledger' ? 'run' : 'find';

  const rawView = params.get('view');
  const findView: FindView =
    rawTab === 'decide' || rawView === 'decide'
      ? 'decide'
      : rawView === 'arb' || rawView === 'strategies'
        ? rawView
        : 'scanner';

  const rawSub = params.get('sub');
  const runView: RunView =
    rawTab === 'ledger' || rawSub === 'ledger'
      ? 'ledger'
      : rawSub === 'execution'
        ? 'execution'
        : 'assistant';

  const [handoff, setHandoff] = useState<ExecutionHandoff | null>(null);
  const incoming = (location.state as FundingNavState)?.handoff;
  useEffect(() => {
    if (incoming) setHandoff({ ...incoming, nonce: Date.now() });
  }, [incoming]);

  const [opened, setOpened] = useState<Partial<Record<FindView | RunView, true>>>({});
  const activeKey: FindView | RunView = section === 'find' ? findView : runView;
  if (!opened[activeKey]) {
    setOpened((o) => ({ ...o, [activeKey]: true }));
  }

  const go = (patch: Record<string, string | null>) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true }
    );

  const openExecution = (h: Omit<ExecutionHandoff, 'nonce'>) => {
    setHandoff({ ...h, nonce: Date.now() });
    navigate('/funding?tab=run&sub=execution');
  };

  const hide = (show: boolean) => ({
    className: cn(!show && 'hidden'),
    'aria-hidden': !show,
    inert: !show ? ('' as const) : undefined
  });

  const activeMeta =
    section === 'find'
      ? FIND_VIEWS.find((v) => v.value === findView)!
      : RUN_VIEWS.find((v) => v.value === runView)!;

  return (
    <Page>
      <PageHeader
        eyebrow="دلتا نوترال · بدون ریسک جهت قیمت"
        title="درآمد فاندینگ"
        meta={<p className="max-w-3xl text-sm leading-7 text-muted">{activeMeta.desc}</p>}
      />

      <SectionTabs tabs={FUNDING_TABS} label="بخش‌های درآمد فاندینگ" />

      {/* نوار زیربخش‌های هر تب — خلوت، آیکون‌دار و بدون لایه‌های تودرتو */}
      <Surface className="relative overflow-hidden p-3.5 md:p-4">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-l from-accent/80 via-gain/60 to-transparent"
        />
        {section === 'find' ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="tablist" aria-label="ابزارهای کشف فرصت و محاسبه سود">
            {FIND_VIEWS.map(({ value, label, desc, icon: Icon }) => {
              const active = findView === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => go({ tab: null, sub: null, view: value === 'scanner' ? null : value })}
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
        ) : (
          <div className="grid gap-2 sm:grid-cols-3" role="tablist" aria-label="بخش‌های اجرا و دفتر جفت‌ها">
            {RUN_VIEWS.map(({ value, label, desc, icon: Icon }) => {
              const active = runView === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() =>
                    go({
                      tab: value === 'ledger' ? 'ledger' : 'run',
                      view: null,
                      sub: value === 'execution' ? 'execution' : null
                    })
                  }
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

      <DeltaVenuesProvider>
        <div {...hide(section === 'find')}>
          <div {...hide(findView === 'scanner')}>{opened.scanner && <FundingScanner />}</div>
          <div {...hide(findView === 'arb')}>
            {opened.arb && <DeltaProfitCalculator onOpenScanner={() => go({ tab: null, view: null })} />}
          </div>
          <div {...hide(findView === 'decide')}>
            {opened.decide && <DeltaNeutralCalculator onOpenExecution={openExecution} />}
          </div>
          <div {...hide(findView === 'strategies')}>{opened.strategies && <FundingStrategiesCalculator />}</div>
        </div>

        <div {...hide(section === 'run')}>
          <div {...hide(runView === 'assistant')}>
            {opened.assistant && (
              <AuthGate>
                <HedgeAssistant />
              </AuthGate>
            )}
          </div>
          <div {...hide(runView === 'execution')}>
            {opened.execution && <DeltaExecutionTab handoff={handoff} />}
          </div>
          <div {...hide(runView === 'ledger')}>
            {opened.ledger && (
              <AuthGate>
                <NeutralLedger />
              </AuthGate>
            )}
          </div>
        </div>
      </DeltaVenuesProvider>
    </Page>
  );
}

/**
 * درآمد فاندینگ (دلتا نوترال) — یک مسیر برای کل کار، به ترتیب:
 *   فرصت‌ها        اسکنر اختلاف فاندینگ · سود واقعی با سرمایهٔ من · استراتژی‌های فاندینگ (با نرخ ثابت بوروس)
 *   سود خالص       ماشین‌حساب دلتا نوترال (انتخاب جفت و سود خالص بعد از هزینه)
 *   اجرا و پایش    راهنمای جفت (اندازهٔ دقیق هر پا + لینک صرافی، یادآور تعادل) · برنامهٔ اجرا، برگهٔ سفارش و پایش زنده
 *   دفتر جفت‌ها    دفتر دلتا نوترال و فارم پوینت (از ژورنال)
 *   + نرخ ثابت (بوروس) و بک‌تست و بات — صفحه‌های خودشان با همین نوار بخش
 *
 * قبلاً بین «ماشین‌حساب» و «ژورنال» تکه شده بود؛ کد و محاسبه‌ها همان‌اند، فقط این‌جا کنار هم نشسته‌اند.
 * حالت در URL (?tab= ، ?view= و پارامترهای راهنمای جفت pv/pb/pa/pl/plev) تا لینک‌ها و برگشت PWA کار کنند.
 * ابزارها فقط بعد از اولین باز شدن mount می‌شوند (حساب‌ها و بازارها بی‌دلیل خوانده نشوند) و بعد زنده می‌مانند.
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { FUNDING_TABS, SectionTabs } from '@/shared/components/layout/SectionTabs';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Section } from '@/shared/components/ui/GlassCard';
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

type Tab = 'find' | 'decide' | 'run' | 'ledger';
type FindView = 'scanner' | 'arb' | 'strategies';
const TABS: Tab[] = ['find', 'decide', 'run', 'ledger'];

const INTRO: Record<Tab, string> = {
  find: 'یک خرید و یک فروش هم‌اندازه روی دو صرافی؛ قیمت هرچه شود این دو هم را خنثی می‌کنند و درآمد از اختلاف فاندینگ می‌آید. اول: کدام ارز و کدام دو صرافی.',
  decide: 'وضعیت امروز جفت انتخابی و سود خالص بعد از کارمزد و لغزش، با سرمایه و اهرم شما.',
  run: 'اندازهٔ دقیق هر پا و لینک صفحهٔ معاملهٔ هر صرافی، ترتیب باز کردن، و بعد از باز شدن: آیا موقعیت شما متعادل است.',
  ledger: 'جفت‌هایی که تا حالا داشته‌اید: حجم، فاندینگ، کارمزد، هزینه به‌ازای هر ۱ میلیون دلار حجم و تعادل پوشش‌ها.'
};

/** انتقال از «برنامهٔ من» در ماشین‌حساب: location.state.handoff */
export type FundingNavState = { handoff?: Omit<ExecutionHandoff, 'nonce'> } | null;

export default function FundingPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'find';
  const rawView = params.get('view') as FindView | null;
  const findView: FindView = rawView === 'arb' || rawView === 'strategies' ? rawView : 'scanner';

  const [handoff, setHandoff] = useState<ExecutionHandoff | null>(null);
  const incoming = (location.state as FundingNavState)?.handoff;
  useEffect(() => {
    if (incoming) setHandoff({ ...incoming, nonce: Date.now() });
  }, [incoming]);

  const [opened, setOpened] = useState<Partial<Record<Tab | FindView, true>>>({});
  const visible: (Tab | FindView)[] = tab === 'find' ? ['find', findView] : [tab];
  if (visible.some((k) => !opened[k])) setOpened((o) => ({ ...o, ...Object.fromEntries(visible.map((k) => [k, true])) }));

  const go = (patch: Record<string, string | null>) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      for (const [k, v] of Object.entries(patch)) (v === null ? next.delete(k) : next.set(k, v));
      return next;
    });
  const openExecution = (h: Omit<ExecutionHandoff, 'nonce'>) => {
    setHandoff({ ...h, nonce: Date.now() });
    navigate('/funding?tab=run');
  };
  const hide = (show: boolean) => ({ className: cn(!show && 'hidden'), 'aria-hidden': !show, inert: !show ? ('' as const) : undefined });

  return (
    <Page>
      <PageHeader eyebrow="دلتا نوترال · بدون ریسک جهت قیمت" title="درآمد فاندینگ" meta={<p className="max-w-3xl text-sm leading-7 text-muted">{INTRO[tab]}</p>} />
      <SectionTabs tabs={FUNDING_TABS} label="بخش‌های درآمد فاندینگ" />

      <DeltaVenuesProvider>
        <div {...hide(tab === 'find')}>
          <SegmentedControl<FindView>
            size="sm"
            label="روش پیدا کردن"
            className="mb-4"
            value={findView}
            onChange={(v) => go({ tab: null, view: v === 'scanner' ? null : v })}
            options={[
              { value: 'scanner', label: 'اختلاف فاندینگ الان و ۷ و ۳۰ روز' },
              { value: 'arb', label: 'سود واقعی با سرمایهٔ من' },
              { value: 'strategies', label: 'همهٔ راه‌ها برای یک نماد (با بوروس)' }
            ]}
          />
          <div {...hide(findView === 'scanner')}>{opened.scanner && <FundingScanner />}</div>
          <div {...hide(findView === 'arb')}>{opened.arb && <DeltaProfitCalculator onOpenScanner={() => go({ tab: null, view: null })} />}</div>
          <div {...hide(findView === 'strategies')}>{opened.strategies && <FundingStrategiesCalculator />}</div>
        </div>
        <div {...hide(tab === 'decide')}>{opened.decide && <DeltaNeutralCalculator onOpenExecution={openExecution} />}</div>
        <div {...hide(tab === 'run')}>
          {opened.run && (
            <div className="space-y-8">
              <Section title="باز کردن جفت تازه یا اصلاح جفت باز">
                <AuthGate>
                  <HedgeAssistant />
                </AuthGate>
              </Section>
              <Section title="برنامهٔ اجرا، برگهٔ سفارش و پایش زنده">
                <DeltaExecutionTab handoff={handoff} />
              </Section>
            </div>
          )}
        </div>
      </DeltaVenuesProvider>
      <div {...hide(tab === 'ledger')}>
        {opened.ledger && (
          <AuthGate>
            <NeutralLedger />
          </AuthGate>
        )}
      </div>
    </Page>
  );
}

/**
 * ژورنال معاملاتی — حلقهٔ کامل: برنامه قبل از ورود → اجرا (از حساب‌های واقعی) → تگ «چرا» → حسابرسی خودکار → مرور هفتگی
 *
 *   دو دفتر جدا: «جهت‌دار» با معیارهای ارزیابی Prop، و «دلتا نوترال / فارم» با معیارهای حجم، فاندینگ و هزینه.
 *   همهٔ حالت‌ها در URL (?tab= ، ?range= ) تا لینک و برگشت PWA درست کار کند؛ ورود از چک قبل از ورود: ?tab=plan&m=&side=&lev=
 *   فقط‌خواندنی: هیچ سفارش، امضا یا کلید خصوصی‌ای در کار نیست.
 */
import { useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpenCheck, CalendarCheck, ClipboardList, ListChecks, Scale, Settings2 } from 'lucide-react';
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { ChipGroup, Tabs } from '@/shared/components/ui/SegmentedControl';
import { EmptyState, ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { Button } from '@/shared/components/ui/Button';
import { usePublishInsight } from '@/shared/assistant/insights';
import { usePlatformPerpVenues } from '@/features/perps/data/usePerpVenues';
import { DEFAULT_ROLE_BY_VENUE } from '../domain/classify';
import { RANGE_FA, useJournal, type RangeKey } from '../data/useJournal';
import { AuditTab } from './AuditTab';
import { TradesTab } from './TradesTab';
import { PlanTab } from './PlanTab';
import { ReviewTab } from './ReviewTab';
import { NeutralTab } from './NeutralTab';
import { SettingsTab } from './SettingsTab';
import { fa } from './parts';

type Tab = 'audit' | 'trades' | 'plan' | 'review' | 'neutral' | 'settings';
const TABS: Tab[] = ['audit', 'trades', 'plan', 'review', 'neutral', 'settings'];
const RANGES: RangeKey[] = ['30', '90', '180', 'all'];

const INTRO: Record<Tab, string> = {
  audit: 'حسابرسی خودکار معاملات جهت‌دار شما از حساب‌های واقعی، به سبک ارزیابی شرکت‌های Prop: کجا با یک حرفه‌ای فرق دارید، با عدد، و اول چه چیزی را درست کنید.',
  trades: 'معامله‌ها را با یک فایل استیتمنت متاتریدر یا با چند لمس اضافه کنید؛ برای هر معامله ۱۰ ثانیه: چرا وارد شدم، طبق قوانینم بود؟',
  plan: 'قبل از ورود: نماد و جهت را بزنید؛ قیمت، استاپ، هدف و حجم مجاز خودکار پیشنهاد می‌شوند. برنامه خودکار به معاملهٔ واقعی وصل می‌شود.',
  review: 'هر هفته: پایبندی، اشتباه‌ها، کار درست و حداکثر سه تعهد قابل‌سنجش که هفتهٔ بعد خودکار بررسی می‌شوند.',
  neutral: 'دفتر دلتا نوترال و فارم پوینت: حجم ساخته‌شده، فاندینگ، کارمزد، هزینه به‌ازای هر ۱ میلیون دلار حجم و تعادل پوشش‌ها.',
  settings: 'نقش هر حساب (جهت‌دار یا نوترال)، اندازهٔ حساب، سقف ریسک، تگ‌ها، چک‌لیست و سؤال‌های مرور.'
};

export default function JournalPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'audit';
  const range = (RANGES.includes(params.get('range') as RangeKey) ? params.get('range') : '90') as RangeKey;
  const update = useCallback((patch: Record<string, string | null>) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      for (const [k, v] of Object.entries(patch)) v === null ? next.delete(k) : next.set(k, v);
      return next;
    }, { replace: true }), [setParams]);

  // اندازهٔ حساب پیش‌فرض: موجودی فعلی حساب‌هایی که پلتفرمشان پیش‌فرض نوترال نیست (تقریبی؛ در تنظیمات قابل‌جایگزینی)
  const venues = usePlatformPerpVenues();
  const liveEquity = useMemo(() => {
    const vals = venues.filter((v) => DEFAULT_ROLE_BY_VENUE[v.venue as keyof typeof DEFAULT_ROLE_BY_VENUE] !== 'neutral').map((v) => v.equity).filter((x): x is number => x !== null && x > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  }, [venues]);

  const j = useJournal(range, liveEquity);
  const a = j.audit;
  const d = a?.directional;

  // فقط معیارهای مشتق‌شده به دستیار (نه معامله یا آدرس خام)
  usePublishInsight('journalAudit', 'حسابرسی دفتر جهت‌دار', d ? {
    trades: d.core.n, netPnl: d.core.netPnl, winRatePct: d.core.winRateDecisive, payoff: d.core.payoff, profitFactor: d.core.profitFactor === Infinity ? null : d.core.profitFactor,
    expectancy: d.core.expectancy, maxDrawdownUsd: d.core.maxDrawdown, maxDrawdownPct: d.core.maxDrawdownPct, feeDragPct: d.core.feeDragPct, tradesPerActiveDay: d.core.tradesPerActiveDay,
    avgR: d.core.avgR, riskPctAvg: d.core.riskPctAvg, openPositions: d.open.length, rangeDays: range === 'all' ? null : Number(range)
  } : null, 'api', 'ready', undefined, `journal:${range}`);
  usePublishInsight('journalLeaks', 'نشتی‌های رتبه‌بندی‌شده (هزینهٔ دلاری)', d ? Object.fromEntries(d.behavior.leaks.slice(0, 8).map((l, i) => [`leak${i + 1}Cost`, l.cost])) : null, 'api', 'ready');
  usePublishInsight('journalNeutral', 'دفتر دلتا نوترال و فارم', a ? { volumeUsd: a.neutral.totals.volume, fundingUsd: a.neutral.totals.funding, feesUsd: a.neutral.totals.fees, netUsd: a.neutral.totals.net, costPerMillion: a.neutral.totals.costPerMillion, hedges: a.neutral.hedges.length } : null, 'api', 'ready');

  const prefill = useMemo(() => {
    const m = params.get('m');
    if (tab !== 'plan' || !m) return null;
    return { symbol: m.toUpperCase().slice(0, 20), direction: params.get('side') === 'short' ? ('short' as const) : ('long' as const), leverage: Number(params.get('lev')) || null };
  }, [params, tab]);
  const clearPrefill = useCallback(() => update({ m: null, side: null, lev: null }), [update]);

  const directionalTrades = a ? a.all : [];
  const noAccounts = !j.accounts.length && !j.data.manual.length && !j.data.mt.length;
  const empty = (
    <EmptyState
      message={noAccounts ? 'هنوز حساب پرپچوالی متصل نیست' : 'هنوز معاملهٔ بسته‌شدهٔ جهت‌داری در این بازه نیست'}
      hint={noAccounts ? 'حساب هایپرلیکوئید، لایتر یا آرکوس را با آدرس عمومی اضافه کنید؛ یا در تب «معاملات» استیتمنت متاتریدر را وارد کنید یا معامله را دستی ثبت کنید.' : 'بازه را بزرگ‌تر کنید یا نقش حساب‌ها را در تنظیمات ببینید (لایتر رابین‌هود و آرکوس پیش‌فرض نوترال‌اند).'}
      action={noAccounts ? <Link to="/wallets"><Button>مدیریت کیف پول‌ها</Button></Link> : <Button variant="outline" onClick={() => update({ tab: 'settings' })}>تنظیمات حساب‌ها</Button>}
    />
  );

  return (
    <Page>
      <PageHeader eyebrow="معامله · فقط‌خواندنی" title="ژورنال معاملاتی" meta={<p className="max-w-3xl text-sm leading-7 text-muted">{INTRO[tab]}</p>} />
      <Tabs
        label="بخش‌های ژورنال"
        value={tab}
        onChange={(v) => update({ tab: v === 'audit' ? null : v })}
        options={[
          { value: 'audit', label: 'حسابرسی', icon: <Scale /> },
          { value: 'trades', label: 'معاملات', icon: <ListChecks />, badge: a ? a.all.filter((t) => t.book === 'directional' && !a.notes.get(t.id)?.whyTags.length).length || undefined : undefined },
          { value: 'plan', label: 'برنامهٔ معامله', icon: <ClipboardList /> },
          { value: 'review', label: 'مرور هفتگی', icon: <CalendarCheck /> },
          { value: 'neutral', label: 'دلتا نوترال', icon: <BookOpenCheck /> },
          { value: 'settings', label: 'تنظیمات', icon: <Settings2 /> }
        ]}
      />
      <div className="mt-4 space-y-4" role="tabpanel">
        {(tab === 'audit' || tab === 'neutral') && (
          <ChipGroup label="بازهٔ زمانی" value={range} onChange={(v) => update({ range: v === '90' ? null : v })} options={RANGES.map((r) => ({ value: r, label: RANGE_FA[r] }))} />
        )}
        {j.histories.some((h) => h.status === 'error') && tab !== 'settings' && (
          <Notice tone="warn" title="تاریخچهٔ بعضی حساب‌ها دریافت نشد">{j.histories.filter((h) => h.status === 'error').map((h) => h.account.label).join('، ')} — نتیجه بدون آن‌هاست. <button type="button" className="underline" onClick={j.refetch}>تلاش دوباره</button></Notice>
        )}
        {!a ? (
          <ListSkeleton rows={6} />
        ) : (
          <>
            {j.loading && tab !== 'settings' && <p className="text-xs text-muted">در حال دریافت تاریخچه از {fa(j.histories.filter((h) => h.status === 'loading').length)} حساب…</p>}
            {tab === 'audit' && d && <AuditTab a={d} empty={empty} tz={j.tz} />}
            {tab === 'trades' && <TradesTab trades={directionalTrades} notes={a.notes} links={a.links} settings={j.data.settings} manual={j.data.manual} mt={j.data.mt} />}
            {tab === 'plan' && <PlanTab plans={j.data.plans} trades={a.all} links={a.links} settings={j.data.settings} accounts={j.accounts} accountSize={j.accountSize} prefill={prefill} onPrefillUsed={clearPrefill} mt={j.data.mt} tz={j.tz} />}
            {tab === 'review' && <ReviewTab trades={a.all.filter((t) => t.book === 'directional' && !t.open && !t.truncated)} notes={a.notes} links={a.links} reviews={j.data.reviews} settings={j.data.settings} tz={j.tz} accountSize={j.accountSize} />}
            {tab === 'neutral' && <NeutralTab nb={a.neutral} fillDays={j.data.settings.neutralFillDays} accounts={j.accounts} settings={j.data.settings} />}
            {tab === 'settings' && <SettingsTab settings={j.data.settings} accounts={j.accounts} histories={j.histories} liveEquity={liveEquity} onRefetch={j.refetch} />}
          </>
        )}
      </div>
    </Page>
  );
}

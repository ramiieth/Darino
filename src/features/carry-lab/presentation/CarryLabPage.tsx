/**
 * آزمایشگاه کری فاندینگ — بک‌تست صادق دلتا نوترال روی دادهٔ واقعی هایپرلیکوئید
 *
 *   لانگ اسپات + شورت پرپ؛ درآمد = فاندینگ. هزینه‌ها (کارمزد، اسلیپیج، ریبالانس، لیکوئید) کسر می‌شوند،
 *   ۲۵ قانون جاروب می‌شوند، حکم فقط از برش‌های ندیده (آزمون پیش‌رونده)، شارپ تعدیل‌شده با تعداد آزمون‌ها
 *   و پایداری همسایه‌ها می‌آید. فقط‌خواندنی: هیچ کلید، سفارش یا امضایی در کار نیست.
 *
 *   حالت‌ها در URL (?coin= ، ?days= ، ?lev=) تا لینک و برگشت PWA درست کار کند.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { FUNDING_TABS, SectionTabs } from '@/shared/components/layout/SectionTabs';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { ChipGroup, SegmentedControl, Tabs } from '@/shared/components/ui/SegmentedControl';
import { AuthGate } from '@/features/auth/AuthGate';
import { PaperBotTab } from './PaperBotTab';
import { Field, Input } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { ErrorState, ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { toFaDigits, toEnDigits } from '@/shared/utils/formatters';
import { formatJalali } from '@/shared/utils/jalali';
import { gridConfigs, liquidationDistance, monthlyFunding, runStudy, type CostParams } from '../domain/engine';
import { COIN_RE, recordTrials, resetTrials, useCarryData } from '../data/history';
import { EquityChart, MonthlyBars } from './charts';
import { CostCard, StatsCard, SweepHeatmap, VerdictCard, WalkForwardTable, ruleLabel } from './sections';

const COINS = ['BTC', 'ETH', 'SOL', 'HYPE'] as const;
const DAYS = [
  { value: '180', label: '۶ ماه' },
  { value: '365', label: '۱ سال' },
  { value: '730', label: '۲ سال' }
] as const;
type DaysValue = (typeof DAYS)[number]['value'];
const LEVS = ['1', '2', '3', '5'] as const;
type LevValue = (typeof LEVS)[number];
const GRID_SIZE = gridConfigs().length;
const FALLBACK_MMR = 2;

interface CostInputs {
  perpFeePct: string;
  spotFeePct: string;
  slippagePct: string;
  hurdleApr: string;
  idleEarnsHurdle: boolean;
}
const DEFAULT_COSTS: CostInputs = { perpFeePct: '0.045', spotFeePct: '0.07', slippagePct: '0.03', hurdleApr: '4', idleEarnsHurdle: true };
const num = (s: string, fallback: number, max: number) => {
  const n = Number(toEnDigits(s).replace(/[,٫]/g, '.'));
  return Number.isFinite(n) && n >= 0 && n <= max ? n : fallback;
};

type Tab = 'lab' | 'bot';
const TABS: { value: Tab; label: string }[] = [
  { value: 'lab', label: 'آزمایشگاه (بک‌تست)' },
  { value: 'bot', label: 'بات کاغذی' }
];

export default function CarryLabPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'bot' ? 'bot' : 'lab';
  return (
    <Page>
      <PageHeader title="آزمایشگاه کری فاندینگ" subtitle="بک‌تست صادق دلتا نوترال (لانگ اسپات + شورت پرپ) و بات کاغذی روی دادهٔ زنده" />
      <SectionTabs tabs={FUNDING_TABS} label="بخش‌های درآمد فاندینگ" />
      <Tabs
        label="بخش‌های آزمایشگاه کری"
        options={TABS}
        value={tab}
        onChange={(t) =>
          setParams(
            (p) => {
              const next = new URLSearchParams(p);
              if (t === 'lab') next.delete('tab');
              else next.set('tab', t);
              return next;
            },
            { replace: true }
          )
        }
        className="mb-5"
      />
      {tab === 'bot' ? (
        <AuthGate>
          <PaperBotTab />
        </AuthGate>
      ) : (
        <LabView />
      )}
    </Page>
  );
}

function LabView() {
  const [params, setParams] = useSearchParams();
  const coinParam = (params.get('coin') ?? 'BTC').toUpperCase();
  const coin = COIN_RE.test(coinParam) ? coinParam : 'BTC';
  const days = (DAYS.some((d) => d.value === params.get('days')) ? params.get('days') : '365') as DaysValue;
  const lev = (LEVS.includes(params.get('lev') as LevValue) ? params.get('lev') : '2') as LevValue;
  const update = (patch: Record<string, string | null>) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        for (const [k, v] of Object.entries(patch)) (v === null ? next.delete(k) : next.set(k, v));
        return next;
      },
      { replace: true }
    );

  const [customCoin, setCustomCoin] = useState('');
  const [costIn, setCostIn] = useState<CostInputs>(DEFAULT_COSTS);
  const data = useCarryData(coin, Number(days));

  const mmrPct = data.data?.maxLeverage ? 100 / (2 * data.data.maxLeverage) : FALLBACK_MMR;
  const cost: CostParams = useMemo(
    () => ({
      leverage: Number(lev),
      mmrPct,
      perpFeePct: num(costIn.perpFeePct, 0.045, 1),
      spotFeePct: num(costIn.spotFeePct, 0.07, 1),
      slippagePct: num(costIn.slippagePct, 0.03, 2),
      hurdleApr: num(costIn.hurdleApr, 4, 50),
      idleEarnsHurdle: costIn.idleEarnsHurdle
    }),
    [lev, mmrPct, costIn]
  );

  // شمارش آزمون‌ها: هر ترکیب تازهٔ تنظیمات ۲۵ پیکربندی به حساب همین دارایی اضافه می‌کند
  const studyKey = data.data ? JSON.stringify({ coin, days, cost, from: data.data.funding[0]?.hour ?? 0 }) : null;
  const [trials, setTrials] = useState<{ key: string; prior: number; total: number } | null>(null);
  useEffect(() => {
    if (!studyKey) return;
    let live = true;
    void recordTrials(coin, studyKey, GRID_SIZE).then((t) => live && setTrials({ key: studyKey, ...t }));
    return () => {
      live = false;
    };
  }, [coin, studyKey]);
  const prior = trials?.key === studyKey ? trials.prior : 0;

  const study = useMemo(() => (data.data && data.data.funding.length ? runStudy(data.data.funding, data.data.prices, cost, prior) : null), [data.data, cost, prior]);
  const months = useMemo(() => (data.data ? monthlyFunding(data.data.funding) : []), [data.data]);

  const chart = useMemo(() => {
    if (!study) return null;
    const hd = 1 + cost.hurdleApr / 100 / 365;
    return {
      labels: study.always.sim.days.map((d) => formatJalali(d)),
      series: [
        { label: study.best.id === 'always' ? 'بهترین (همیشه باز)' : 'بهترین قانون', values: study.best.sim.equity, token: 'chart-1' as const },
        ...(study.best.id === 'always' ? [] : [{ label: 'همیشه باز', values: study.always.sim.equity, token: 'chart-2' as const }]),
        { label: `استیبل ${toFaDigits(cost.hurdleApr)}٪`, values: study.always.sim.days.map((_, i) => hd ** (i + 1)), token: 'chart-3' as const, dashed: true }
      ]
    };
  }, [study, cost.hurdleApr]);

  const pickCustom = () => {
    const c = customCoin.trim().toUpperCase();
    if (COIN_RE.test(c)) update({ coin: c });
  };
  const levTooHigh = data.data?.maxLeverage ? Number(lev) > data.data.maxLeverage : false;
  const liqPct = liquidationDistance(Number(lev), mmrPct) * 100;

  return (
    <>

      <Surface className="mb-5 space-y-4 p-4 md:p-5">
        <Field label="دارایی">
          <div className="flex flex-wrap items-center gap-2">
            <ChipGroup
              label="دارایی"
              scroll={false}
              options={[...COINS.map((c) => ({ value: c as string, label: c })), ...(COINS.includes(coin as (typeof COINS)[number]) ? [] : [{ value: coin, label: coin }])]}
              value={coin}
              onChange={(c) => update({ coin: c })}
            />
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                pickCustom();
              }}
            >
              <Input dir="ltr" value={customCoin} onChange={(e) => setCustomCoin(e.target.value)} placeholder="AVAX" aria-label="نماد دلخواه هایپرلیکوئید" className="w-24" />
              <Button type="submit" variant="outline" size="sm" disabled={!COIN_RE.test(customCoin.trim())}>
                آزمون
              </Button>
            </form>
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="بازه">
            <SegmentedControl label="بازه" options={DAYS.map((d) => ({ ...d }))} value={days} onChange={(d) => update({ days: d })} />
          </Field>
          <Field label="اهرم پای شورت">
            <SegmentedControl label="اهرم" options={LEVS.map((l) => ({ value: l, label: `${toFaDigits(l)}×` }))} value={lev} onChange={(l) => update({ lev: l })} />
          </Field>
        </div>
        <p className="text-xs leading-6 text-muted">
          با اهرم {toFaDigits(lev)}× حدود {toFaDigits(Math.round((Number(lev) / (Number(lev) + 1)) * 100))}٪ سرمایه در هر پا کار می‌کند و پای شورت با رشد حدود {toFaDigits(liqPct.toFixed(0))}٪ قیمت (از آخرین ریبالانس) لیکوئید
          می‌شود. ریبالانس در نیمهٔ این فاصله. مارجین نگهداری {toFaDigits(mmrPct.toFixed(2))}٪{data.data?.maxLeverage ? ` (حداکثر اهرم ${toFaDigits(data.data.maxLeverage)}×)` : ' (پیش‌فرض)'}.
        </p>
        {levTooHigh && <Notice tone="warn">این اهرم از حداکثر اهرم این بازار بیشتر است.</Notice>}
        <Disclosure summary="هزینه‌ها و معیار مقایسه">
          <div className="grid gap-3 sm:grid-cols-4">
            {(
              [
                ['perpFeePct', 'کارمزد پرپ (تیکر)', '٪'],
                ['spotFeePct', 'کارمزد اسپات (تیکر)', '٪'],
                ['slippagePct', 'اسلیپیج هر پا', '٪'],
                ['hurdleApr', 'بازده استیبل سالانه', '٪']
              ] as const
            ).map(([k, label, suffix]) => (
              <Field key={k} label={label}>
                <Input dir="ltr" inputMode="decimal" value={costIn[k]} suffix={suffix} onChange={(e) => setCostIn((c) => ({ ...c, [k]: e.target.value }))} />
              </Field>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={costIn.idleEarnsHurdle} onChange={(e) => setCostIn((c) => ({ ...c, idleEarnsHurdle: e.target.checked }))} className="h-4 w-4" />
            سرمایهٔ بیرون از بازار همان بازده استیبل را بگیرد
          </label>
          <p className="mt-2 text-xs leading-6 text-muted">
            پیش‌فرض‌ها سطح پایهٔ کارمزد هایپرلیکوئید‌اند. بازده استیبل معیار مقایسه است: کری فقط وقتی ارزش دارد که بعد از هزینه از قرار دادن همان دلار در وام‌دهی استیبل بیشتر بدهد.
          </p>
          <Button variant="ghost" size="sm" icon={<RotateCcw />} onClick={() => setCostIn(DEFAULT_COSTS)} className="mt-1">
            بازگشت به پیش‌فرض
          </Button>
        </Disclosure>
      </Surface>

      {data.isLoading ? (
        <Surface className="p-5">
          <p className="mb-3 text-sm text-muted">
            دریافت تاریخچهٔ فاندینگ {coin} از هایپرلیکوئید
            {data.progress ? ` — صفحهٔ ${toFaDigits(data.progress.pages)} از حدود ${toFaDigits(data.progress.estimate)}` : ''}. بار بعد فقط ساعت‌های تازه دریافت می‌شود.
          </p>
          <ListSkeleton rows={3} />
        </Surface>
      ) : data.isError ? (
        <ErrorState
          message={String(data.error).includes('no-market') ? `بازار ${coin} در هایپرلیکوئید پیدا نشد` : 'دریافت داده از هایپرلیکوئید ناموفق بود'}
          onRetry={() => void data.refetch()}
        />
      ) : study ? (
        <div className="space-y-6">
          <VerdictCard study={study} />
          <StatsCard study={study} />

          {chart && (
            <Section title="منحنی ارزش (کل دوره، درون نمونه)">
              <Surface className="p-4 md:p-5">
                <EquityChart labels={chart.labels} series={chart.series} />
                <p className="mt-2 text-xs leading-6 text-muted">این منحنی با قانونی رسم شده که روی همین داده بهترین بوده — خوش‌بینانه است. حکم بالا از برش‌های ندیده می‌آید.</p>
              </Surface>
            </Section>
          )}

          <Section title="آزمون پیش‌رونده — آیا قانونِ انتخاب‌شده روی آینده‌اش هم کار کرد؟">
            <WalkForwardTable study={study} />
          </Section>

          <Section title={`جاروب ${toFaDigits(GRID_SIZE)} قانون — فلات یا عدد خوش‌شانس؟`}>
            <SweepHeatmap study={study} />
          </Section>

          <Section title={`از کجا آمد و کجا رفت — ${ruleLabel(study.best.rule)}`}>
            <CostCard run={study.best} />
          </Section>

          <Section title="رژیم فاندینگ ماهانه">
            <Surface className="p-4 md:p-5">
              <MonthlyBars labels={months.map((m) => formatJalali(m.month).slice(0, 7))} values={months.map((m) => m.avgApr)} />
              <p className="mt-2 text-xs leading-6 text-muted">میانگین نرخ فاندینگ سالانه‌شدهٔ هر ماه. قرمز = ماهی که شورت فاندینگ پرداخت کرده است. کری در بازار خرسی و آرام معمولاً کوچک یا منفی می‌شود.</p>
            </Surface>
          </Section>

          <Surface variant="subtle" className="p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-ink">
                تا حالا {toFaDigits(trials?.total ?? GRID_SIZE)} پیکربندی روی {coin} آزموده‌اید. آزمون شانس با همین عدد سخت‌گیرتر می‌شود — عوض کردن تنظیمات تا وقتی «سبز» شود، خودش بیش‌برازش است.
              </p>
              <Button
                variant="ghost"
                size="sm"
                icon={<RotateCcw />}
                onClick={async () => {
                  await resetTrials(coin);
                  if (studyKey) setTrials({ key: studyKey, ...(await recordTrials(coin, studyKey, GRID_SIZE)) });
                }}
              >
                صفر کردن شمارنده
              </Button>
            </div>
          </Surface>

          <Disclosure summary="فرض‌ها و محدودیت‌ها (صادقانه)">
            <ul className="list-disc space-y-1.5 ps-5 text-xs leading-6 text-muted">
              <li>فاندینگ: تاریخچهٔ تسویه‌شدهٔ ساعتی هایپرلیکوئید ({toFaDigits(study.days)} روز، تا {formatJalali(data.data!.fetchedAt)}). گذشته آینده را تضمین نمی‌کند.</li>
              <li>قیمت اسپات برابر پرپ فرض شده (بیس صفر)؛ اختلاف قیمت ورود/خروج دو پا مدل نشده است.</li>
              <li>لیکوئید و ریبالانس با کندل ۴ ساعته سنجیده می‌شوند؛ جهش‌های کوتاه‌تر درون کندل فقط با «بیشترین قیمت» دیده می‌شوند. ریبالانس اندازهٔ هر دو پا را به هدفِ ارزش فعلی برمی‌گرداند.</li>
              <li>لیکوئید = از دست رفتن مارجین نگهداری + فروش اسپات؛ جریمهٔ واقعی ممکن است بیشتر باشد.</li>
              <li>اسلیپیج به اندازهٔ سفارش وابسته نیست؛ برای سرمایهٔ بزرگ یا آلت‌کوین کم‌حجم بیشتر است.</li>
              <li>در آزمون پیش‌رونده هزینهٔ جابه‌جایی بین قانون‌ها در مرز برش‌ها حساب نشده است.</li>
              <li>ریسک صرافی، دی‌پگ USDC، توقف برداشت و تغییر قوانین فاندینگ در هیچ بک‌تستی نیست.</li>
              <li>این صفحه فقط‌خواندنی است: هیچ کلید، کیف پول، سفارش یا امضایی ندارد.</li>
            </ul>
          </Disclosure>
        </div>
      ) : (
        <Notice tone="info">برای این دارایی در این بازه فاندینگی ثبت نشده است.</Notice>
      )}
    </>
  );
}

/**
 * ⑨ سود واقعی دلتا — «۱۰۰۰ دلار این‌جا، ۱۰۰۰ دلار آن‌جا؛ بعد از همهٔ هزینه‌ها چقدر می‌ماند؟»
 * INPUT (سرمایهٔ هر طرف · اهرم · مدت · هزینهٔ انتقال) → بهترین جفت (سود خالص تخمینی و سرمایهٔ نهایی)
 * → مسیر سرمایه → حساسیت (اسپرد الان/۱/۷/۳۰ روز × مدت) → چند پیشنهاد دیگر
 * مبنا: میانگین فاندینگ تسویه‌شدهٔ ۷ روز، کارمزد تیکر، اسلیپیج دفتر سفارش زنده؛ فقط تحلیل، بدون سفارش و بدون اتصال به حساب.
 */
import { useMemo, useState } from 'react';
import { Radar } from 'lucide-react';
import { Field, Input } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Surface } from '@/shared/components/ui/GlassCard';
import { KeyValueList, Metric, MetricGrid, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { usePublishInsight } from '@/shared/assistant/insights';
import { toFaDigits } from '@/shared/utils/formatters';
import { CalcShell, ResultHero, ResultPlaceholder } from '../StatCard';
import { parseNum } from '../parse';
import { useDeltaBooks } from '@/features/calculators/data/deltaMarkets';
import { useFundingOpportunities, type Opportunity } from '@/features/calculators/data/fundingHistory';
import { useReversalAlerts } from '@/features/calculators/data/spreadAlerts';
import { arbScenarios, evaluateArb, FALLBACK_TAKER_PCT, logoKindOf, SPREAD_BASIS_LABELS, STABILITY, venueName, type ArbEval, type ArbInputs } from './arbEval';
import { CapitalFlow, SourceTag, type FlowLine } from './CapitalFlow';
import { ScenarioTable } from './ScenarioTable';

type Days = '1' | '7' | '30';
const HOLDS = [1, 7, 30];

interface Ranked {
  o: Opportunity;
  r: ArbEval;
}

export function DeltaProfitCalculator({ onOpenScanner }: { onOpenScanner?: () => void }) {
  const books = useDeltaBooks();
  useReversalAlerts(books);
  const opportunities = useFundingOpportunities(books);
  const [capital, setCapital] = useState('1000');
  const [leverage, setLeverage] = useState('2');
  const [days, setDays] = useState<Days>('7');
  const [transfer, setTransfer] = useState('6');
  const [picked, setPicked] = useState<string | null>(null);

  const raw = { capital: parseNum(capital), leverage: parseNum(leverage), transfer: transfer.trim() === '' ? 0 : parseNum(transfer) };
  const errors = {
    capital: !(raw.capital > 0) ? 'سرمایهٔ هر طرف باید بیشتر از صفر باشد.' : null,
    leverage: !(raw.leverage > 0) ? 'اهرم باید بیشتر از صفر باشد.' : null,
    transfer: !(raw.transfer >= 0) ? 'هزینه نمی‌تواند منفی باشد.' : null
  };
  const valid = !errors.capital && !errors.leverage && !errors.transfer;
  const inputs: ArbInputs = { capitalPerSide: raw.capital, leverage: raw.leverage, holdDays: Number(days), transferCostUsd: raw.transfer };

  const ranked = useMemo<Ranked[]>(
    () =>
      valid
        ? opportunities
            .map((o) => ({ o, r: evaluateArb(o, inputs) }))
            .filter((x) => x.r.net !== null && !x.r.overLeverage && x.o.historyStatus !== 'loading')
            .sort((a, b) => (b.r.net ?? 0) - (a.r.net ?? 0))
        : [],
    [opportunities, valid, inputs.capitalPerSide, inputs.leverage, inputs.holdDays, inputs.transferCostUsd]
  );
  // بهترین = بیشترین سود خالص بین جفت‌های پایدار/نسبتاً پایدار؛ اگر نبود، بیشترین سود خالص
  const stable = ranked.filter((x) => x.o.stability === 'high' || x.o.stability === 'medium');
  const pickedRow = ranked.find((x) => x.o.key === picked) ?? null;
  const best = pickedRow ?? stable.find((x) => (x.r.net ?? 0) > 0) ?? ranked[0] ?? null;
  const others = ranked.filter((x) => x !== best).slice(0, 5);
  const checking = opportunities.filter((o) => o.historyStatus === 'loading' || o.bookStatus === 'loading').length;
  const venuesDown = (['arcus', 'ondo', 'lighter', 'hyperliquid'] as const).filter((v) => books[v].status === 'error');
  const scenarios = useMemo(() => (best ? arbScenarios(best.o, inputs, HOLDS) : []), [best, inputs.capitalPerSide, inputs.leverage, inputs.transferCostUsd]);

  usePublishInsight(
    'calculatorDeltaProfit',
    best ? `سود واقعی دلتا ${best.o.base}` : 'سود واقعی دلتا',
    best ? { net: best.r.net, apr: best.r.aprOnCapital, capital: best.r.capital, holdDays: inputs.holdDays } : null
  );

  const form = (
    <>
      <p className="-mt-2 text-xs leading-6 text-muted">
        یک طرف Long و یک طرف Short روی یک دارایی در دو صرافی. قیمت خنثی می‌شود؛ سود از اختلاف فاندینگ است و هزینه‌ها کم می‌شوند.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <Field label="سرمایهٔ هر طرف (مارجین)" error={errors.capital}>
          <Input dir="ltr" inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value)} suffix="دلار" />
        </Field>
        <Field label="اهرم" error={errors.leverage}>
          <Input dir="ltr" inputMode="decimal" value={leverage} onChange={(e) => setLeverage(e.target.value)} suffix="×" />
        </Field>
      </div>
      <p className="-mt-3 text-2xs leading-5 text-subtle">
        سرمایهٔ کل = ۲ × سرمایهٔ هر طرف (هر صرافی جدا). ارزش اسمی هر طرف = سرمایه × اهرم.
      </p>
      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted">مدت نگهداری</p>
        <SegmentedControl<Days>
          label="مدت نگهداری"
          fill
          value={days}
          onChange={setDays}
          options={[
            { value: '1', label: '۱ روز' },
            { value: '7', label: '۷ روز' },
            { value: '30', label: '۳۰ روز' }
          ]}
        />
      </div>
      <Field label="هزینهٔ انتقال و گس (کل)" error={errors.transfer}>
        <Input dir="ltr" inputMode="decimal" value={transfer} onChange={(e) => setTransfer(e.target.value)} suffix="دلار" />
      </Field>
      <p className="-mt-3 text-2xs leading-5 text-subtle">واریز، برداشت و پل برای هر دو صرافی، رفت و برگشت — تخمین خودتان.</p>
    </>
  );

  return (
    <CalcShell inputs={form}>
      {venuesDown.length > 0 && (
        <Notice tone="warn" title={`دادهٔ ${venuesDown.map(venueName).join(' و ')} در دسترس نیست`}>
          پیشنهادها فقط از صرافی‌های در دسترس ساخته شده‌اند.
        </Notice>
      )}

      {!valid ? (
        <ResultPlaceholder>ورودی‌های قرمزشده را اصلاح کنید تا پیشنهادها محاسبه شوند.</ResultPlaceholder>
      ) : !best ? (
        checking > 0 || opportunities.length === 0 ? (
          <Surface className="space-y-3 p-5">
            <p className="text-sm text-muted">در حال بررسی تاریخچهٔ فاندینگ و دفتر سفارش…</p>
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-16 w-full" />
          </Surface>
        ) : (
          <ResultPlaceholder>با این اهرم و سرمایه، جفتی با دادهٔ کامل پیدا نشد. اهرم را کم کنید یا کمی بعد دوباره ببینید.</ResultPlaceholder>
        )
      ) : (
        <>
          <ResultHero
            label={pickedRow ? 'جفت انتخابی · سود خالص تخمینی' : (best.r.net ?? 0) > 0 ? 'بهترین پیشنهاد الان · سود خالص تخمینی' : 'الان جفت سودده‌ای نیست · کم‌زیان‌ترین'}
            value={<MoneyValue value={best.r.net} signed tone="auto" digits={2} />}
            sub={
              <>
                در {toFaDigits(days)} روز · سرمایهٔ نهایی <MoneyValue value={best.r.finalEquity} digits={2} className="font-semibold text-ink" /> · بازده خالص{' '}
                <PercentValue value={best.r.returnPct} digits={2} className="font-semibold" /> روی <MoneyValue value={best.r.capital} className="font-semibold text-ink" />
                <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-2xs text-subtle">
                  <SourceTag kind="estimate" />
                  {best.o.projectedFrom === 'avg7d' ? 'اگر اختلاف فاندینگ مثل میانگین ۷ روز گذشته بماند' : 'از نرخ لحظه‌ای (تاریخچهٔ کافی نبود)'} — نه سود تحقق‌یافته
                </span>
              </>
            }
            aside={<PairBadge o={best.o} />}
          >
            <MetricGrid cols={3}>
              <Metric label="فاندینگ خالص" value={<MoneyValue value={best.r.funding} signed tone="auto" digits={2} />} />
              <Metric label="کل هزینه‌ها" value={<MoneyValue value={best.r.costs === null ? null : -best.r.costs} tone="loss" digits={2} />} />
              <Metric label="بازده سالانه" value={<PercentValue value={best.r.aprOnCapital} digits={1} />} sub="روی سرمایهٔ کل" />
              <Metric
                label="سربه‌سر هزینه‌ها"
                value={best.r.breakEvenDays === null ? <span className="text-negative">هرگز</span> : `${toFaDigits(best.r.breakEvenDays.toFixed(1))} روز`}
              />
              <Metric label="حداقل اسپرد لازم" value={<PercentValue value={best.r.breakEvenSpreadApr} digits={1} tone="none" />} sub={`سالانه، برای ${toFaDigits(days)} روز`} />
              <Metric
                label="فاصله تا لیکویید"
                value={best.r.liquidationPct === null ? '—' : `${toFaDigits(best.r.liquidationPct.toFixed(0))}٪ حرکت قیمت`}
              />
            </MetricGrid>
          </ResultHero>

          <Explain o={best.o} r={best.r} days={days} />

          <CapitalFlow base={best.r.capital} margin={best.r.capital} allocation={allocationLines(best)} pnl={pnlLines(best)} settlement={settlementLines(best)} footnote={FOOTNOTE} />

          <Surface as="section" aria-labelledby="arb-sensitivity" className="space-y-4 p-4 md:p-5">
            <div>
              <h3 id="arb-sensitivity" className="text-sm font-bold text-ink">
                حساسیت سود خالص · {best.o.base}
              </h3>
              <p className="mt-0.5 text-2xs leading-5 text-subtle">اگر اختلاف فاندینگ مثل الان یا میانگین ۱، ۷ یا ۳۰ روز گذشتهٔ همین جفت باشد؛ کارمزد، اسلیپیج و انتقال ثابت.</p>
            </div>
            <ScenarioTable
              caption="سود خالص بر اساس مبنای اسپرد و مدت نگهداری"
              cols={HOLDS.map((d) => `${toFaDigits(d)} روز`)}
              rows={scenarios.map((s) => ({
                head: (
                  <span>
                    {SPREAD_BASIS_LABELS[s.basis]}
                    <span className="block font-normal text-subtle">{s.apr === null ? 'بدون داده' : <PercentValue value={s.apr} digits={1} tone="none" />}</span>
                  </span>
                ),
                cells: s.nets.map((net, i) => ({ value: net, current: s.basis === (best.o.projectedFrom === 'avg7d' ? 'd7' : 'now') && HOLDS[i] === Number(days) }))
              }))}
            />
            <KeyValueList
              dense
              rows={[
                { label: 'هر ۰٫۰۱٪ کارمزد یا اسلیپیج بیشتر در هر معامله', value: <MoneyValue value={-best.r.costPerBp} tone="loss" digits={2} /> },
                { label: 'بیشترین قلم هزینه', value: biggestCost(best.r) }
              ]}
            />
          </Surface>

          {others.length > 0 && (
            <Surface as="section" aria-labelledby="arb-others" className="p-4 md:p-5">
              <h3 id="arb-others" className="mb-2 text-sm font-bold text-ink">
                پیشنهادهای دیگر
              </h3>
              <ul className="divide-y divide-divider">
                {others.map(({ o, r }) => (
                  <li key={o.key}>
                    <button
                      type="button"
                      onClick={() => setPicked(o.key)}
                      className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-field px-2 py-2.5 text-start transition-colors duration-fast hover:bg-surface-2/60"
                    >
                      <AssetLogo symbol={o.base} kind={logoKindOf(o)} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <bdi dir="ltr" className="font-latin text-sm font-bold text-ink">
                            {o.base}
                          </bdi>
                          <Badge tone={STABILITY[o.stability].tone}>{STABILITY[o.stability].label}</Badge>
                        </span>
                        <span className="block truncate text-xs text-muted">
                          Long {venueName(o.long.venue)} · Short {venueName(o.short.venue)}
                        </span>
                      </span>
                      <span className="shrink-0 text-end">
                        <MoneyValue value={r.net} signed tone="auto" digits={2} className="text-sm font-bold" />
                        <span className="block text-2xs text-subtle">
                          {r.aprOnCapital === null ? '—' : <PercentValue value={r.aprOnCapital} digits={1} tone="none" />} سالانه
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {pickedRow && (
                <Button variant="ghost" size="sm" className="mt-2 text-accent" onClick={() => setPicked(null)}>
                  برگشت به بهترین پیشنهاد
                </Button>
              )}
            </Surface>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <p className="text-2xs leading-5 text-subtle">
              مبنا: میانگین فاندینگ تسویه‌شدهٔ ۷ روز گذشته، کارمزد تیکر و دفتر سفارش زنده. آینده ممکن است فرق کند؛ سود تضمینی نیست.
              {checking > 0 && ` (${toFaDigits(checking)} جفت هنوز در حال بررسی)`}
            </p>
            {onOpenScanner && (
              <Button variant="ghost" size="sm" className="text-accent" icon={<Radar />} onClick={onOpenScanner}>
                جزئیات در اسکنر
              </Button>
            )}
          </div>
        </>
      )}
    </CalcShell>
  );
}

const FOOTNOTE =
  'سود تحقق‌یافته و تحقق‌نیافتهٔ پوزیشن‌های واقعی شما این‌جا نیست: ماشین‌حساب به حساب صرافی وصل نیست. سود قیمت صفر فرض شده (ارزش برابر، اختلاف قیمت دو صرافی ثابت) و فاندینگ روی ارزش ورود حساب می‌شود.';

function allocationLines({ o, r }: Ranked): FlowLine[] {
  const perSide = r.capital / 2;
  return [
    { label: 'سرمایهٔ کل (دو صرافی)', value: r.capital, as: 'money', source: 'input' },
    { label: `مارجین Long · ${venueName(o.long.venue)}`, value: perSide, as: 'money', sub: true },
    { label: `مارجین Short · ${venueName(o.short.venue)}`, value: perSide, as: 'money', sub: true },
    { label: 'سرمایهٔ آزاد', value: 0, as: 'money', hint: 'همهٔ سرمایه به‌عنوان مارجین در دو صرافی است' },
    { label: 'ارزش اسمی کل در معرض بازار', value: r.notional * 2, as: 'money', hint: 'سرمایه × اهرم × ۲ — پول پرداختی نیست' }
  ];
}

function pnlLines({ o, r }: Ranked): FlowLine[] {
  return [
    { label: 'سود/زیان قیمت (ناخالص)', value: 0, as: 'pnl', source: 'assumed', hint: 'ارزش برابر و اختلاف قیمت ثابت فرض شده' },
    {
      label: 'فاندینگ خالص',
      value: r.funding,
      as: 'pnl',
      source: o.projectedFrom === 'avg7d' ? 'history' : 'live',
      hint: o.projectedFrom === 'avg7d' ? 'میانگین تسویه‌شدهٔ ۷ روز' : 'نرخ لحظه‌ای'
    },
    { label: 'کارمزد ورود و خروج (تیکر)', value: r.fees, as: 'cost', source: r.feeAssumed ? 'assumed' : 'live', hint: r.feeAssumed ? `کارمزد از API نیامد؛ ${toFaDigits(FALLBACK_TAKER_PCT)}٪ فرض شد` : undefined },
    { label: 'اسلیپیج ورود و خروج', value: r.slippage, as: 'cost', source: 'live', hint: 'از دفتر سفارش زنده؛ خروج هم‌اندازهٔ ورود' },
    { label: 'انتقال و گس', value: r.transfer, as: 'cost', source: 'input' },
    { label: 'سود خالص تخمینی', value: r.net, as: 'pnl', total: true }
  ];
}

function settlementLines({ r }: Ranked): FlowLine[] {
  return [
    { label: 'مارجین آزادشدهٔ دو صرافی', value: r.capital, as: 'money', sub: true },
    { label: 'سود خالص', value: r.net, as: 'pnl', sub: true },
    { label: 'سرمایهٔ نهایی', value: r.finalEquity, as: 'money', total: true },
    { label: 'اختلاف با سرمایهٔ اولیه', value: r.net, as: 'pnl' }
  ];
}

function biggestCost(r: ArbEval): string {
  const items: [string, number][] = [
    ['کارمزد', r.fees],
    ['اسلیپیج', r.slippage ?? 0],
    ['انتقال و گس', r.transfer]
  ];
  const top = items.reduce((a, b) => (b[1] > a[1] ? b : a));
  return top[1] > 0 ? top[0] : '—';
}

function PairBadge({ o }: { o: Opportunity }) {
  return (
    <div className="flex items-center gap-2">
      <AssetLogo symbol={o.base} kind={logoKindOf(o)} size={36} />
      <div className="min-w-0">
        <span className="flex items-center gap-1.5">
          <bdi dir="ltr" className="font-latin text-sm font-bold text-ink">
            {o.base}
          </bdi>
          <Badge tone={STABILITY[o.stability].tone}>{STABILITY[o.stability].label}</Badge>
        </span>
        <span className="block text-xs text-muted">
          <span className="font-semibold text-positive">Long</span> {venueName(o.long.venue)} ·{' '}
          <span className="font-semibold text-negative">Short</span> {venueName(o.short.venue)}
        </span>
      </div>
    </div>
  );
}

/** یک جملهٔ ساده که چرا این عدد درآمده و به چه حساس است */
function Explain({ o, r, days }: { o: Opportunity; r: ArbEval; days: Days }) {
  const d7 = o.stats?.d7;
  return (
    <div className="space-y-1.5 rounded-field bg-surface-2/70 px-3.5 py-3 text-xs leading-6 text-muted">
      {o.projectedFrom === 'avg7d' && d7 ? (
        <p>
          در ۷ روز گذشته اختلاف فاندینگ به‌طور میانگین <PercentValue value={d7.avgApr} digits={1} tone="none" className="font-semibold text-ink" /> سالانه
          بوده و در {toFaDigits(Math.round((d7.profitableShare ?? 0) * 100))}٪ ساعت‌ها به نفع این جهت بوده است ({toFaDigits(d7.reversals)} بار تغییر جهت).
          الان: <PercentValue value={o.currentApr} digits={1} tone="none" className="font-semibold text-ink" />.
        </p>
      ) : (
        <p className="text-warn">تاریخچهٔ کافی نبود؛ این عدد از نرخ لحظه‌ای ساخته شده و بسیار ناپایدار است.</p>
      )}
      {r.breakEvenDays !== null && r.breakEvenDays > Number(days) && (
        <p>هزینه‌ها در {toFaDigits(days)} روز جبران نمی‌شوند؛ دست‌کم {toFaDigits(Math.ceil(r.breakEvenDays))} روز لازم است.</p>
      )}
      {r.longSlipPct !== null && r.shortSlipPct !== null && (
        <p>
          اسلیپیج تخمینی: Long <PercentValue value={r.longSlipPct} digits={3} signed={false} tone="none" /> · Short{' '}
          <PercentValue value={r.shortSlipPct} digits={3} signed={false} tone="none" /> (هر بار ورود یا خروج).
        </p>
      )}
      {r.entryBasisPct !== null && (
        <p>
          اختلاف قیمت دو صرافی الان <PercentValue value={r.entryBasisPct} digits={3} tone="none" className="font-semibold text-ink" />
          {r.entryBasisPct >= 0 ? ' (Short گران‌تر فروخته می‌شود)' : ' (Short ارزان‌تر فروخته می‌شود)'}؛ اگر تا خروج به صفر برسد حدود{' '}
          <MoneyValue value={Math.abs((r.entryBasisPct / 100) * r.notional)} digits={2} className="font-semibold text-ink" /> {r.entryBasisPct >= 0 ? 'سود' : 'زیان'} قیمت
          می‌سازد. این عدد در سود خالص بالا نیست، چون همگرایی تضمینی نیست.
        </p>
      )}
    </div>
  );
}

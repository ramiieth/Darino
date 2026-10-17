/**
 * ⑨ سود واقعی دلتا — «۱۰۰۰ دلار این‌جا، ۱۰۰۰ دلار آن‌جا؛ بعد از همهٔ هزینه‌ها چقدر می‌ماند؟»
 * INPUT (سرمایهٔ هر طرف · اهرم · مدت · هزینهٔ انتقال) → بهترین جفت → چند پیشنهاد دیگر
 * مبنا: میانگین فاندینگ تسویه‌شدهٔ ۷ روز، کارمزد تیکر، اسلیپیج دفتر سفارش زنده؛ فقط تحلیل، بدون سفارش.
 */
import { useMemo, useState } from 'react';
import { Radar } from 'lucide-react';
import { Field, Input } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Metric, MetricGrid, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
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
import { evaluateArb, logoKindOf, STABILITY, venueName, type ArbEval } from './arbEval';

type Days = '1' | '7' | '30';

const num = (s: string, fallback = 0) => {
  const n = parseNum(s);
  return Number.isFinite(n) ? n : fallback;
};

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

  const inputs = { capitalPerSide: num(capital), leverage: num(leverage), holdDays: Number(days), transferCostUsd: num(transfer) };
  const ranked = useMemo<Ranked[]>(
    () =>
      opportunities
        .map((o) => ({ o, r: evaluateArb(o, inputs) }))
        .filter((x) => x.r.net !== null && !x.r.overLeverage && x.o.historyStatus !== 'loading')
        .sort((a, b) => (b.r.net ?? 0) - (a.r.net ?? 0)),
    [opportunities, inputs.capitalPerSide, inputs.leverage, inputs.holdDays, inputs.transferCostUsd]
  );
  // بهترین = بیشترین سود خالص بین جفت‌های پایدار/نسبتاً پایدار؛ اگر نبود، بیشترین سود خالص
  const stable = ranked.filter((x) => x.o.stability === 'high' || x.o.stability === 'medium');
  const best = ranked.find((x) => x.o.key === picked) ?? stable.find((x) => (x.r.net ?? 0) > 0) ?? ranked[0] ?? null;
  const others = ranked.filter((x) => x !== best).slice(0, 5);
  const checking = opportunities.filter((o) => o.historyStatus === 'loading' || o.bookStatus === 'loading').length;
  const venuesDown = (['arcus', 'ondo', 'lighter'] as const).filter((v) => books[v].status === 'error');

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
        <Field label="سرمایهٔ هر طرف">
          <Input dir="ltr" inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value)} suffix="دلار" />
        </Field>
        <Field label="اهرم">
          <Input dir="ltr" inputMode="decimal" value={leverage} onChange={(e) => setLeverage(e.target.value)} suffix="×" />
        </Field>
      </div>
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
      <Field label="هزینهٔ انتقال و گس (کل)">
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

      {!best ? (
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
            label={(best.r.net ?? 0) > 0 ? 'بهترین پیشنهاد الان · سود خالص' : 'الان جفت سودده‌ای نیست · کم‌زیان‌ترین'}
            value={<MoneyValue value={best.r.net} signed tone="auto" />}
            sub={
              <>
                در {toFaDigits(days)} روز روی <MoneyValue value={best.r.capital} className="font-semibold text-ink" /> سرمایه
                {best.r.aprOnCapital !== null && (
                  <>
                    {' '}
                    · سالانه <PercentValue value={best.r.aprOnCapital} digits={1} className="font-semibold" />
                  </>
                )}
              </>
            }
            aside={<PairBadge o={best.o} />}
          >
            <MetricGrid cols={3}>
              <Metric label="فاندینگ دریافتی" value={<MoneyValue value={best.r.funding} signed tone="auto" />} />
              <Metric label="کارمزد" value={<MoneyValue value={-best.r.fees} tone={best.r.fees > 0 ? 'loss' : 'none'} />} />
              <Metric label="اسلیپیج" value={<MoneyValue value={best.r.slippage === null ? null : -best.r.slippage} tone="loss" digits={2} />} />
              <Metric label="انتقال و گس" value={<MoneyValue value={-best.r.transfer} tone={best.r.transfer > 0 ? 'loss' : 'none'} />} />
              <Metric
                label="سربه‌سر هزینه‌ها"
                value={best.r.breakEvenDays === null ? <span className="text-negative">هرگز</span> : `${toFaDigits(best.r.breakEvenDays.toFixed(1))} روز`}
              />
              <Metric
                label="فاصله تا لیکویید"
                value={best.r.liquidationPct === null ? '—' : `${toFaDigits(best.r.liquidationPct.toFixed(0))}٪ حرکت قیمت`}
              />
            </MetricGrid>
          </ResultHero>

          <Explain o={best.o} r={best.r} days={days} />

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
    </div>
  );
}

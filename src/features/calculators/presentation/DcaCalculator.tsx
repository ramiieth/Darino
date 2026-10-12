import { persianAssetName } from '@/shared/i18n/assetDisplayName';
import { usePublishInsight } from '@/shared/assistant/insights';
/**
 * ② DCA — periodic investing with price forecasts.
 * INPUT (asset · amount: fixed/growing · frequency · dates · fees · forecast price
 * points · extra manual buys) → RESULT (profit at the valuation price) → SECONDARY →
 * CHARTS → EDITABLE PURCHASE TABLE (per-row amount / price / skip) → EXPORT.
 *
 * Purchase price per row: manual override › history (past) › forecast (linear
 * between the user's points, today's price as the first point) › current price.
 * Calculations in domain (scheduleDates, priceFromAnchors, calcPlan).
 */
import { useEffect, useMemo, useState } from 'react';
import { Plus, RotateCcw, Trash2, TrendingUp } from 'lucide-react';
import { Field, Input } from '@/shared/components/ui/Input';
import { SmartDateField } from '@/shared/components/ui/SmartDateField';
import { SegmentedControl, ChipGroup } from '@/shared/components/ui/SegmentedControl';
import { Surface } from '@/shared/components/ui/GlassCard';
import { MetricGrid, Metric, MoneyValue, PercentValue, QuantityValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { Button, IconButton } from '@/shared/components/ui/Button';
import { Badge, type Tone } from '@/shared/components/ui/Badge';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { parseIsoToTs, formatGregorianIso } from '@/shared/utils/jalali';
import { AssetPicker } from './AssetPicker';
import { CalcShell, ResultHero, ResultPlaceholder } from './StatCard';
import { LineChartCard, fmtFaDate } from './CalcCharts';
import { ExportButtons } from './ExportButtons';
import { numOr, parseNum, priceInput } from './parse';
import { useCalculatorPrices } from '@/features/calculators/data/useCalculatorPrices';
import { getHistoricalSeries } from '@/features/calculators/data/historical';
import {
  calcPlan,
  priceFromAnchors,
  priceFromSeries,
  scheduleDates,
  scheduledAmount,
  SCHEDULE_FREQUENCY_LABELS,
  type PlanResult,
  type PlanRowInput,
  type PriceAnchor,
  type PriceSource,
  type ScheduleFrequency
} from '@/features/calculators/domain';
import type { CalculatorAsset } from '@/features/calculators/data/catalogs';
import { fmtUSD, fmtPct, toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

const DAY = 86_400_000;
const FREQS = (Object.keys(SCHEDULE_FREQUENCY_LABELS) as ScheduleFrequency[]).map((value) => ({ value, label: SCHEDULE_FREQUENCY_LABELS[value] }));

type AmountMode = 'fixed' | 'growth';
type EvalMode = 'end' | 'today' | 'manual';

interface AnchorRow {
  id: number;
  date: string;
  price: string;
}
interface ExtraRow {
  id: number;
  date: string;
  amount: string;
  price: string;
}
interface RowOverride {
  amount?: string;
  price?: string;
  off?: boolean;
}

const SOURCE_LABEL: Record<PriceSource, { label: string; tone: Tone }> = {
  history: { label: 'تاریخی', tone: 'neutral' },
  forecast: { label: 'پیش‌بینی', tone: 'info' },
  current: { label: 'قیمت فعلی', tone: 'warn' },
  manual: { label: 'دستی', tone: 'brand' }
};

const isoShift = (months: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
};
const isoTs = (iso: string) => (iso ? new Date(iso + 'T00:00:00').getTime() : NaN);

/** a schedule row keeps its identity across edits by its calendar day */
const dayKey = (ts: number) => formatGregorianIso(ts);

export function DcaCalculator() {
  const { prices } = useCalculatorPrices();
  const [asset, setAsset] = useState<CalculatorAsset | null>(null);
  const [amount, setAmount] = useState('1000');
  const [amountMode, setAmountMode] = useState<AmountMode>('fixed');
  const [growth, setGrowth] = useState('2');
  const [freq, setFreq] = useState<ScheduleFrequency>('monthly');
  const [start, setStart] = useState(() => isoShift(-12));
  const [end, setEnd] = useState(() => isoShift(12));
  const [feeFixed, setFeeFixed] = useState('0');
  const [feePct, setFeePct] = useState('0');
  const [anchors, setAnchors] = useState<AnchorRow[]>([]);
  const [extras, setExtras] = useState<ExtraRow[]>([]);
  const [overrides, setOverrides] = useState<Record<string, RowOverride>>({});
  const [evalMode, setEvalMode] = useState<EvalMode>('end');
  const [evalPrice, setEvalPrice] = useState('');
  const [annualGuess, setAnnualGuess] = useState('20');
  const [series, setSeries] = useState<{ t: number; price: number }[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  const now = useMemo(() => Date.now(), []);
  const currentPrice = asset ? (prices[asset.symbol] ?? null) : null;
  const startTs = isoTs(start);
  const endTs = isoTs(end);
  const badRange = !(endTs > startTs);
  const hasPast = startTs < now;
  const hasFuture = endTs > now;

  useEffect(() => {
    setSeries(null);
    setOverrides({});
  }, [asset]);

  // history only for the part of the range that is already in the past
  useEffect(() => {
    if (!asset || badRange || !hasPast) return;
    let cancelled = false;
    getHistoricalSeries(asset.kind, asset.symbol, startTs - 5 * DAY, Math.min(endTs, now)).then((s) => {
      if (!cancelled) setSeries(s && s.length > 1 ? s : null);
    });
    return () => {
      cancelled = true;
    };
  }, [asset, startTs, endTs, badRange, hasPast, now]);

  const userAnchors: PriceAnchor[] = useMemo(
    () => anchors.map((a) => ({ date: isoTs(a.date), price: parseNum(a.price) })).filter((a) => Number.isFinite(a.date) && a.price > 0),
    [anchors]
  );
  const forecastAnchors: PriceAnchor[] = useMemo(
    () => (currentPrice ? [{ date: now, price: currentPrice }, ...userAnchors.filter((a) => a.date > now)] : userAnchors),
    [currentPrice, userAnchors, now]
  );

  /** automatic price for a date (without row override) */
  const autoPrice = useMemo(
    () =>
      (t: number): { price: number | null; source: PriceSource } => {
        if (t <= now + DAY / 2) {
          const h = priceFromSeries(series, t);
          if (h !== null) return { price: h, source: 'history' };
          const past = priceFromAnchors(userAnchors.filter((a) => a.date <= now), t);
          if (past !== null && userAnchors.some((a) => a.date <= now)) return { price: past, source: 'forecast' };
          return { price: currentPrice, source: 'current' };
        }
        if (userAnchors.some((a) => a.date > now)) return { price: priceFromAnchors(forecastAnchors, t), source: 'forecast' };
        return { price: currentPrice, source: 'current' };
      },
    [series, userAnchors, forecastAnchors, currentPrice, now]
  );

  const scheduled = useMemo(() => (badRange ? [] : scheduleDates(startTs, endTs, freq)), [badRange, startTs, endTs, freq]);

  const rowInputs = useMemo(() => {
    const base = numOr(amount);
    const g = amountMode === 'growth' ? numOr(growth) : 0;
    const list: (PlanRowInput & { key: string; off: boolean; autoAmount: number; autoPriceVal: number | null })[] = scheduled.map((t, i) => {
      const key = dayKey(t);
      const o = overrides[key] ?? {};
      const autoAmount = scheduledAmount(base, g, i);
      const ap = autoPrice(t);
      const manualPrice = o.price !== undefined && o.price !== '' ? parseNum(o.price) : null;
      return {
        key,
        date: t,
        amount: o.amount !== undefined && o.amount !== '' ? parseNum(o.amount) : autoAmount,
        price: manualPrice ?? ap.price,
        priceSource: manualPrice !== null ? 'manual' : ap.source,
        off: !!o.off,
        autoAmount,
        autoPriceVal: ap.price
      };
    });
    for (const x of extras) {
      const t = isoTs(x.date);
      if (!Number.isFinite(t)) continue;
      const ap = autoPrice(t);
      const manual = x.price !== '' ? parseNum(x.price) : null;
      list.push({
        key: `x${x.id}`,
        date: t,
        amount: parseNum(x.amount),
        price: manual ?? ap.price,
        priceSource: manual !== null ? 'manual' : ap.source,
        extra: true,
        off: false,
        autoAmount: parseNum(x.amount),
        autoPriceVal: ap.price
      });
    }
    return list.sort((a, b) => a.date - b.date);
  }, [scheduled, overrides, extras, amount, amountMode, growth, autoPrice]);

  const finalDate = evalMode === 'today' ? now : endTs;
  const finalPrice =
    evalMode === 'manual' ? (parseNum(evalPrice) > 0 ? parseNum(evalPrice) : null) : evalMode === 'today' ? currentPrice : autoPrice(endTs).price;

  const result: PlanResult | null = useMemo(() => {
    if (!asset || badRange) return null;
    return calcPlan({
      rows: rowInputs.filter((r) => !r.off),
      feeFixed: numOr(feeFixed),
      feePct: numOr(feePct),
      finalPrice,
      finalDate
    });
  }, [asset, badRange, rowInputs, feeFixed, feePct, finalPrice, finalDate]);

  usePublishInsight(
    'calculatorDca',
    asset ? `خرید دوره‌ای ${persianAssetName(asset.symbol)}` : 'خرید دوره‌ای',
    result
      ? { purchaseCount: result.purchaseCount, totalInvested: result.totalInvested, totalUnits: result.totalUnits, averageCost: result.averageCost, currentValue: result.finalValue, finalPrice, profit: result.profit, returnPct: result.returnPct, xirrPct: result.xirrPct, startTs, endTs }
      : null,
    'simulation',
    series || !hasPast ? 'ready' : 'reference'
  );

  const setOverride = (key: string, patch: RowOverride) =>
    setOverrides((o) => {
      const next = { ...o, [key]: { ...o[key], ...patch } };
      const v = next[key];
      if ((v.amount ?? '') === '' && (v.price ?? '') === '' && !v.off) delete next[key];
      return next;
    });

  const addAnchor = () => {
    const last = [...userAnchors].sort((a, b) => a.date - b.date).pop();
    const baseTs = Math.max(last?.date ?? now, now);
    const d = new Date(baseTs);
    d.setMonth(d.getMonth() + 3);
    const lastPrice = last?.price ?? currentPrice;
    setAnchors((a) => [...a, { id: Date.now(), date: d.toISOString().slice(0, 10), price: priceInput(lastPrice) }]);
  };

  const buildFromAnnual = () => {
    if (!currentPrice || !hasFuture) return;
    const g = numOr(annualGuess) / 100;
    const pts: AnchorRow[] = [];
    // one point per quarter until the end date
    for (let i = 1; ; i++) {
      const d = new Date(now);
      d.setMonth(d.getMonth() + i * 3);
      const t = Math.min(d.getTime(), endTs);
      const yrs = (t - now) / (365.25 * DAY);
      pts.push({ id: Date.now() + i, date: new Date(t).toISOString().slice(0, 10), price: priceInput(currentPrice * Math.pow(1 + g, yrs)) });
      if (t >= endTs || i > 200) break;
    }
    setAnchors(pts);
  };

  const editedCount = Object.keys(overrides).length;
  const futureRows = rowInputs.filter((r) => r.date > now).length;
  const flatFuture = futureRows > 0 && !userAnchors.some((a) => a.date > now);

  const inputs = (
    <>
      <AssetPicker value={asset} onChange={setAsset} />
      {asset && (
        <p className="text-sm text-muted">
          قیمت فعلی: <MoneyValue value={currentPrice} className="font-semibold text-ink" />
        </p>
      )}

      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted">دوره خرید</p>
        <ChipGroup<ScheduleFrequency> label="دوره خرید" options={FREQS} value={freq} onChange={setFreq} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <SmartDateField label="تاریخ شروع" value={start ? parseIsoToTs(start) : null} onChange={(ts) => setStart(ts ? formatGregorianIso(ts) : '')} />
        <SmartDateField label="تاریخ پایان" value={end ? parseIsoToTs(end) : null} onChange={(ts) => setEnd(ts ? formatGregorianIso(ts) : '')} />
      </div>
      {badRange && <Notice tone="warn">تاریخ پایان باید بعد از تاریخ شروع باشد.</Notice>}

      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted">مبلغ هر خرید</p>
        <SegmentedControl<AmountMode>
          label="نوع مبلغ"
          fill
          size="sm"
          value={amountMode}
          onChange={setAmountMode}
          options={[
            { value: 'fixed', label: 'ثابت' },
            { value: 'growth', label: 'افزایشی' }
          ]}
        />
        <div className="mt-3 grid grid-cols-2 gap-4">
          <Field label={amountMode === 'fixed' ? 'مبلغ هر دوره' : 'مبلغ اولین خرید'}>
            <Input dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} suffix="دلار" />
          </Field>
          {amountMode === 'growth' && (
            <Field label="رشد در هر دوره">
              <Input dir="ltr" inputMode="decimal" value={growth} onChange={(e) => setGrowth(e.target.value)} suffix="٪" />
            </Field>
          )}
        </div>
        <p className="mt-2 text-2xs leading-5 text-subtle">مبلغ و قیمت هر خرید را می‌توانید در جدول خریدها جداگانه تغییر دهید.</p>
      </div>

      <section className="space-y-3 rounded-field border border-divider p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <TrendingUp aria-hidden className="h-4 w-4 text-accent" />
            پیش‌بینی قیمت
          </h3>
          {anchors.length > 0 && (
            <Button variant="ghost" size="sm" className="text-muted" onClick={() => setAnchors([])}>
              پاک کردن
            </Button>
          )}
        </div>
        <p className="text-2xs leading-5 text-muted">
          قیمت دارایی را برای چند تاریخ آینده وارد کنید. بین نقاط، قیمت به‌صورت خطی تغییر می‌کند و قیمت امروز نقطهٔ شروع است. بدون پیش‌بینی، خریدهای آینده با قیمت فعلی (ثابت) حساب می‌شوند.
        </p>
        {anchors.length > 0 && (
          <ol className="space-y-2">
            {anchors.map((a, i) => (
              <li key={a.id} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                <SmartDateField
                  compact
                  label={undefined}
                  value={a.date ? parseIsoToTs(a.date) : null}
                  onChange={(ts) => setAnchors((l) => l.map((x) => (x.id === a.id ? { ...x, date: ts ? formatGregorianIso(ts) : '' } : x)))}
                />
                <Input
                  dir="ltr"
                  inputMode="decimal"
                  aria-label={`قیمت پیش‌بینی ${i + 1}`}
                  value={a.price}
                  onChange={(e) => setAnchors((l) => l.map((x) => (x.id === a.id ? { ...x, price: e.target.value } : x)))}
                  suffix="$"
                />
                <IconButton size="sm" aria-label={`حذف نقطهٔ ${i + 1}`} onClick={() => setAnchors((l) => l.filter((x) => x.id !== a.id))}>
                  <Trash2 />
                </IconButton>
              </li>
            ))}
          </ol>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" icon={<Plus />} onClick={addAnchor} disabled={!asset}>
            افزودن قیمت در تاریخ
          </Button>
        </div>
        {hasFuture && currentPrice !== null && (
          <div className="flex items-end gap-2 border-t border-divider pt-3">
            <Field label="ساخت سریع با رشد سالانه" className="flex-1">
              <Input dir="ltr" inputMode="decimal" value={annualGuess} onChange={(e) => setAnnualGuess(e.target.value)} suffix="٪" />
            </Field>
            <Button variant="secondary" size="sm" className="mb-0.5" onClick={buildFromAnnual}>
              ساخت پیش‌بینی
            </Button>
          </div>
        )}
      </section>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted">ارزش‌گذاری پایان دوره با</p>
        <SegmentedControl<EvalMode>
          label="قیمت ارزش‌گذاری"
          fill
          size="sm"
          value={evalMode}
          onChange={setEvalMode}
          options={[
            { value: 'end', label: 'قیمت تاریخ پایان' },
            { value: 'today', label: 'قیمت امروز' },
            { value: 'manual', label: 'قیمت دستی' }
          ]}
        />
        {evalMode === 'manual' && (
          <Field label="قیمت فروش / ارزش‌گذاری" className="mt-3">
            <Input dir="ltr" inputMode="decimal" value={evalPrice} placeholder={priceInput(currentPrice)} onChange={(e) => setEvalPrice(e.target.value)} suffix="دلار" />
          </Field>
        )}
      </div>

      <Disclosure summary={`خریدهای دستی اضافه${extras.length ? ` (${toFaDigits(extras.length)})` : ''}`}>
        <div className="space-y-2">
          {extras.map((x, i) => (
            <div key={x.id} className="space-y-2 rounded-field border border-divider p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted">خرید اضافه {toFaDigits(i + 1)}</span>
                <IconButton size="sm" aria-label={`حذف خرید اضافه ${i + 1}`} onClick={() => setExtras((l) => l.filter((e) => e.id !== x.id))}>
                  <Trash2 />
                </IconButton>
              </div>
              <SmartDateField compact value={x.date ? parseIsoToTs(x.date) : null} onChange={(ts) => setExtras((l) => l.map((e) => (e.id === x.id ? { ...e, date: ts ? formatGregorianIso(ts) : '' } : e)))} />
              <div className="grid grid-cols-2 gap-2">
                <Input dir="ltr" inputMode="decimal" aria-label="مبلغ" value={x.amount} onChange={(e) => setExtras((l) => l.map((r) => (r.id === x.id ? { ...r, amount: e.target.value } : r)))} suffix="$" />
                <Input dir="ltr" inputMode="decimal" aria-label="قیمت (اختیاری)" placeholder="قیمت خودکار" value={x.price} onChange={(e) => setExtras((l) => l.map((r) => (r.id === x.id ? { ...r, price: e.target.value } : r)))} suffix="$" />
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            icon={<Plus />}
            onClick={() => setExtras((l) => [...l, { id: Date.now(), date: new Date().toISOString().slice(0, 10), amount: amount || '0', price: '' }])}
          >
            افزودن خرید در تاریخ دلخواه
          </Button>
        </div>
      </Disclosure>

      <Disclosure summary="کارمزد">
        <div className="grid grid-cols-2 gap-4">
          <Field label="کارمزد ثابت هر خرید">
            <Input dir="ltr" inputMode="decimal" value={feeFixed} onChange={(e) => setFeeFixed(e.target.value)} suffix="دلار" />
          </Field>
          <Field label="کارمزد درصدی">
            <Input dir="ltr" inputMode="decimal" value={feePct} onChange={(e) => setFeePct(e.target.value)} suffix="٪" />
          </Field>
        </div>
      </Disclosure>
    </>
  );

  const visibleRows = rowInputs.slice(0, showAll ? 1000 : 36);

  return (
    <CalcShell inputs={inputs}>
      {!asset || !result ? (
        <ResultPlaceholder>برای شبیه‌سازی خرید دوره‌ای، یک دارایی و بازه معتبر انتخاب کنید.</ResultPlaceholder>
      ) : (
        <>
          {hasPast && !series && (
            <Notice tone="warn" title="دادهٔ تاریخی در دسترس نیست">
              خریدهای گذشته با قیمت فعلی تقریب زده شده‌اند. می‌توانید قیمت هر خرید را در جدول دستی وارد کنید.
            </Notice>
          )}
          {flatFuture && (
            <Notice tone="info" title="قیمت آینده ثابت فرض شده است">
              {toFaDigits(futureRows)} خرید در آینده با قیمت فعلی حساب شده‌اند. برای نتیجهٔ واقعی‌تر، در «پیش‌بینی قیمت» قیمت مورد انتظار را برای چند تاریخ وارد کنید.
            </Notice>
          )}
          {result.skipped > 0 && <Notice tone="warn">{toFaDigits(result.skipped)} خرید به‌خاطر نداشتن قیمت یا مبلغ معتبر کنار گذاشته شد.</Notice>}

          <ResultHero
            label={evalMode === 'today' ? 'سود / زیان با قیمت امروز' : evalMode === 'manual' ? 'سود / زیان با قیمت دستی' : 'سود / زیان در تاریخ پایان'}
            value={<MoneyValue value={result.profit} signed tone="auto" />}
            sub={
              <>
                بازده <PercentValue value={result.returnPct} className="font-semibold" /> · بازده سالانه (XIRR){' '}
                <PercentValue value={result.xirrPct} className="font-semibold" />
              </>
            }
          >
            <MetricGrid cols={3}>
              <Metric label="ارزش نهایی" value={<MoneyValue value={result.finalValue} />} sub={<>قیمت <MoneyValue value={finalPrice} /></>} />
              <Metric label="کل سرمایه پرداخت‌شده" value={<MoneyValue value={result.totalInvested} />} sub={result.totalFees > 0 ? <>کارمزد <MoneyValue value={result.totalFees} /></> : undefined} />
              <Metric label="میانگین قیمت تمام‌شده" value={<MoneyValue value={result.averageCost} />} sub="نقطهٔ سربه‌سر" />
              <Metric label="تعداد خرید" value={<span className="num-ltr">{toFaDigits(result.purchaseCount)}</span>} sub={futureRows > 0 ? `${toFaDigits(futureRows)} خرید آینده` : undefined} />
              <Metric label="واحد خریداری‌شده" value={<QuantityValue value={result.totalUnits} unit={asset.symbol} digits={4} />} />
              <Metric label="میانگین سادهٔ قیمت‌ها" value={<MoneyValue value={result.simpleAvgPrice} />} sub="بدون وزن مبلغ" />
            </MetricGrid>
          </ResultHero>

          {result.rows.length > 1 && (
            <>
              <LineChartCard
                title="ارزش سبد در برابر سرمایه پرداخت‌شده"
                description="ارزش در هر تاریخ خرید با قیمت همان روز (تاریخی یا پیش‌بینی)"
                labels={result.rows.map((p) => fmtFaDate(p.date))}
                datasets={[
                  { label: 'ارزش سبد', data: result.rows.map((p) => p.valueAtDate ?? 0), color: 'chart-1', fill: true },
                  { label: 'سرمایه پرداخت‌شده', data: result.rows.map((p) => p.cumInvested), color: 'chart-4', dashed: true }
                ]}
              />
              <LineChartCard
                title="میانگین قیمت خرید در برابر قیمت بازار"
                labels={result.rows.map((p) => fmtFaDate(p.date))}
                datasets={[
                  { label: 'قیمت خرید', data: result.rows.map((p) => p.price ?? 0), color: 'chart-3' },
                  { label: 'میانگین قیمت تمام‌شده', data: result.rows.map((p) => p.avgCost ?? 0), color: 'chart-2' }
                ]}
              />
            </>
          )}

          <Surface className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 md:px-5">
              <div>
                <h3 className="text-sm font-bold text-ink">خریدها</h3>
                <p className="text-2xs text-muted">مبلغ یا قیمت هر ردیف را تغییر دهید؛ تیک را بردارید تا آن خرید حذف شود.</p>
              </div>
              {editedCount > 0 && (
                <Button variant="ghost" size="sm" className="text-accent" icon={<RotateCcw />} onClick={() => setOverrides({})}>
                  بازگردانی {toFaDigits(editedCount)} ویرایش
                </Button>
              )}
            </div>
            <div className="max-h-[32rem] overflow-auto">
              <table className="data-table is-compact mt-2">
                <caption className="sr-only">جدول خریدهای دوره‌ای قابل ویرایش</caption>
                <thead>
                  <tr>
                    <th scope="col" className="!ps-4 md:!ps-5"><span className="sr-only">فعال</span></th>
                    <th scope="col">تاریخ</th>
                    <th scope="col">مبلغ ($)</th>
                    <th scope="col">قیمت ($)</th>
                    <th scope="col" className="col-num !pe-4 md:!pe-5">واحد</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => {
                    const o = overrides[r.key] ?? {};
                    const extraId = r.extra ? Number(r.key.slice(1)) : null;
                    const units = !r.off && r.price && r.price > 0 && r.amount > 0 ? r.amount / r.price : null;
                    return (
                      <tr key={r.key} className={cn(r.off && 'opacity-45', r.date > now && 'bg-info/5')}>
                        <td className="!ps-4 md:!ps-5">
                          {r.extra ? (
                            <IconButton size="sm" aria-label="حذف خرید اضافه" onClick={() => setExtras((l) => l.filter((e) => e.id !== extraId))}>
                              <Trash2 />
                            </IconButton>
                          ) : (
                            <input
                              type="checkbox"
                              aria-label={`خرید ${fmtFaDate(r.date)} فعال باشد`}
                              checked={!r.off}
                              onChange={(e) => setOverride(r.key, { off: !e.target.checked })}
                              className="h-4 w-4 accent-[rgb(var(--c-brand-500))]"
                            />
                          )}
                        </td>
                        <td className="whitespace-nowrap text-xs text-muted">
                          {fmtFaDate(r.date)}
                          {r.extra && <span className="block text-2xs text-accent">اضافه</span>}
                        </td>
                        <td className="min-w-[6.5rem]">
                          {r.extra ? (
                            <span className="num-ltr text-xs">{fmtUSD(r.amount)}</span>
                          ) : (
                            <input
                              dir="ltr"
                              inputMode="decimal"
                              aria-label={`مبلغ خرید ${fmtFaDate(r.date)}`}
                              value={o.amount ?? ''}
                              placeholder={String(Number(r.autoAmount.toFixed(2)))}
                              onChange={(e) => setOverride(r.key, { amount: e.target.value })}
                              className={cn('h-8 w-24 rounded-control border bg-card px-2 text-xs', o.amount ? 'border-accent font-semibold' : 'border-divider')}
                            />
                          )}
                        </td>
                        <td className="min-w-[8rem]">
                          <div className="flex items-center gap-1.5">
                            {r.extra ? (
                              <span className="num-ltr text-xs">{r.price ? fmtUSD(r.price) : '—'}</span>
                            ) : (
                              <input
                                dir="ltr"
                                inputMode="decimal"
                                aria-label={`قیمت خرید ${fmtFaDate(r.date)}`}
                                value={o.price ?? ''}
                                placeholder={priceInput(r.autoPriceVal)}
                                onChange={(e) => setOverride(r.key, { price: e.target.value })}
                                className={cn('h-8 w-24 rounded-control border bg-card px-2 text-xs', o.price ? 'border-accent font-semibold' : 'border-divider')}
                              />
                            )}
                            <Badge tone={SOURCE_LABEL[r.priceSource].tone} className="shrink-0 text-2xs">
                              {SOURCE_LABEL[r.priceSource].label}
                            </Badge>
                          </div>
                        </td>
                        <td className="col-num !pe-4 md:!pe-5">
                          <QuantityValue value={units} digits={4} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rowInputs.length > 36 && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="w-full border-t border-divider py-2.5 text-sm font-semibold text-accent hover:bg-surface-2"
              >
                {showAll ? 'نمایش کمتر' : `نمایش همه (${toFaDigits(rowInputs.length)})`}
              </button>
            )}
          </Surface>

          <ExportButtons
            filename={`dca-${asset.symbol}.csv`}
            headers={['#', 'تاریخ', 'مبلغ', 'کارمزد', 'قیمت', 'منبع قیمت', 'واحد', 'میانگین قیمت', 'ارزش در همان روز']}
            rows={result.rows.map((p) => [p.index, new Date(p.date).toISOString().slice(0, 10), p.amount, p.fee, p.price ?? '', SOURCE_LABEL[p.priceSource].label, p.units, p.avgCost ?? '', p.valueAtDate ?? ''])}
            pdfTitle={`گزارش خرید دوره‌ای — ${asset.symbol}`}
            pdfSections={[
              {
                heading: `سرمایه‌گذاری دوره‌ای ${asset.nameFa}`,
                table: {
                  headers: ['موارد', 'مقدار'],
                  rows: [
                    ['کل سرمایه', fmtUSD(result.totalInvested)],
                    ['تعداد خرید', String(result.purchaseCount)],
                    ['تعداد واحد', String(result.totalUnits)],
                    ['میانگین قیمت تمام‌شده', fmtUSD(result.averageCost)],
                    ['قیمت ارزش‌گذاری', fmtUSD(finalPrice)],
                    ['ارزش نهایی', fmtUSD(result.finalValue)],
                    ['سود / زیان', fmtUSD(result.profit)],
                    ['بازده', fmtPct(result.returnPct)],
                    ['XIRR', fmtPct(result.xirrPct)]
                  ]
                },
                note: userAnchors.length ? 'قیمت‌های آینده بر اساس پیش‌بینی کاربر است و تضمینی نیست.' : undefined
              },
              {
                heading: 'جدول خریدها',
                table: {
                  headers: ['#', 'تاریخ', 'مبلغ', 'قیمت', 'منبع', 'واحد'],
                  rows: result.rows.map((p) => [p.index, new Date(p.date).toISOString().slice(0, 10), p.amount, p.price ?? '', SOURCE_LABEL[p.priceSource].label, p.units])
                }
              }
            ]}
          />
        </>
      )}
    </CalcShell>
  );
}

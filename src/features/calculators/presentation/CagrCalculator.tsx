import { usePublishInsight } from '@/shared/assistant/insights';
/**
 * ③ CAGR — compound annual growth rate.
 *   CAGR = (final ÷ initial)^(1 ÷ years) − 1   (domain: calcCagrFull)
 * Results appear only once both values are entered (an empty final value is
 * not "−100%").
 * Second mode — projection: initial + periodic contributions (fixed or growing,
 * any frequency) compounded at an expected annual return (domain: projectGrowth).
 */
import { useMemo, useState } from 'react';
import { Field, Input } from '@/shared/components/ui/Input';
import { SmartDateField } from '@/shared/components/ui/SmartDateField';
import { Surface } from '@/shared/components/ui/GlassCard';
import { KeyValueList, MetricGrid, Metric, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { parseIsoToTs, formatGregorianIso } from '@/shared/utils/jalali';
import { CalcShell, ResultHero, ResultPlaceholder } from './StatCard';
import { LineChartCard } from './CalcCharts';
import { ExportButtons } from './ExportButtons';
import { useCalculatorPrices } from '@/features/calculators/data/useCalculatorPrices';
import { calcCagrFull, projectGrowth, SCHEDULE_FREQUENCY_LABELS, type ScheduleFrequency } from '@/features/calculators/domain';
import { SegmentedControl, ChipGroup } from '@/shared/components/ui/SegmentedControl';
import { numOr } from './parse';
import type { ReactNode } from 'react';
import { fmtUSD, fmtPct, toFaDigits } from '@/shared/utils/formatters';

const REFERENCE = [
  { symbol: 'BTC', label: 'بیت‌کوین' },
  { symbol: 'ETH', label: 'اتریوم' },
  { symbol: 'GLD', label: 'طلا (GLD)' },
  { symbol: 'SPY', label: 'شاخص اس‌اندپی ۵۰۰' }
];

type CagrMode = 'rate' | 'project';

export function CagrCalculator() {
  const [mode, setMode] = useState<CagrMode>('rate');
  const modeSwitch = (
    <SegmentedControl<CagrMode>
      label="نوع محاسبه"
      fill
      value={mode}
      onChange={setMode}
      options={[
        { value: 'rate', label: 'محاسبهٔ نرخ رشد' },
        { value: 'project', label: 'پیش‌بینی ارزش آینده' }
      ]}
    />
  );
  return mode === 'rate' ? <CagrRate modeSwitch={modeSwitch} /> : <GrowthProjection modeSwitch={modeSwitch} />;
}

const PROJ_FREQS: ScheduleFrequency[] = ['weekly', 'monthly', 'quarterly', 'yearly'];

function GrowthProjection({ modeSwitch }: { modeSwitch: ReactNode }) {
  const [initial, setInitial] = useState('10000');
  const [contrib, setContrib] = useState('500');
  const [freq, setFreq] = useState<ScheduleFrequency>('monthly');
  const [contribGrowth, setContribGrowth] = useState('0');
  const [rate, setRate] = useState('15');
  const [years, setYears] = useState('10');

  const y = numOr(years);
  const ready = y > 0 && y <= 60 && numOr(initial) + numOr(contrib) > 0;
  const result = useMemo(
    () =>
      ready
        ? projectGrowth({
            initial: numOr(initial),
            contribution: numOr(contrib),
            frequency: freq,
            contributionGrowthPct: numOr(contribGrowth),
            annualReturnPct: numOr(rate),
            years: y
          })
        : null,
    [ready, initial, contrib, freq, contribGrowth, rate, y]
  );

  usePublishInsight('calculatorCagr', 'پیش‌بینی رشد', result ? { finalValue: result.finalValue, totalContributed: result.totalContributed, profit: result.profit, annualReturnPct: numOr(rate), years: y } : null);

  const inputs = (
    <>
      {modeSwitch}
      <div className="grid grid-cols-2 gap-4">
        <Field label="سرمایهٔ اولیه">
          <Input dir="ltr" inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} suffix="دلار" />
        </Field>
        <Field label="بازده سالانهٔ مورد انتظار">
          <Input dir="ltr" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} suffix="٪" />
        </Field>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted">واریز دوره‌ای</p>
        <ChipGroup<ScheduleFrequency> label="دوره واریز" value={freq} onChange={setFreq} options={PROJ_FREQS.map((f) => ({ value: f, label: SCHEDULE_FREQUENCY_LABELS[f] }))} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="مبلغ هر واریز">
          <Input dir="ltr" inputMode="decimal" value={contrib} onChange={(e) => setContrib(e.target.value)} suffix="دلار" />
        </Field>
        <Field label="افزایش سالانهٔ واریز">
          <Input dir="ltr" inputMode="decimal" value={contribGrowth} onChange={(e) => setContribGrowth(e.target.value)} suffix="٪" />
        </Field>
      </div>
      <Field label="مدت">
        <Input dir="ltr" inputMode="decimal" value={years} onChange={(e) => setYears(e.target.value)} suffix="سال" />
      </Field>
      <p className="text-xs leading-5 text-muted">واریز صفر یعنی فقط رشد سرمایهٔ اولیه. افزایش سالانه برای واریزی است که هر سال بیشتر می‌شود (مثلاً با رشد درآمد).</p>
    </>
  );

  return (
    <CalcShell inputs={inputs}>
      {!result ? (
        <ResultPlaceholder>سرمایهٔ اولیه یا واریز دوره‌ای و مدت (حداکثر ۶۰ سال) را وارد کنید.</ResultPlaceholder>
      ) : (
        <>
          <ResultHero label="ارزش پیش‌بینی‌شده" value={<MoneyValue value={result.finalValue} />} sub={`پس از ${toFaDigits(y)} سال با بازده سالانهٔ ${toFaDigits(numOr(rate))}٪`}>
            <MetricGrid cols={3}>
              <Metric label="کل واریزی" value={<MoneyValue value={result.totalContributed} />} />
              <Metric label="سود مرکب" value={<MoneyValue value={result.profit} signed tone="auto" />} />
              <Metric label="ضریب رشد" value={<span className="num-ltr">{result.multiple === null ? '—' : `${result.multiple.toFixed(2)}×`}</span>} />
            </MetricGrid>
          </ResultHero>
          <LineChartCard
            title="ارزش سبد در برابر کل واریزی"
            description="مسیر فرضی با بازده ثابت؛ بازار واقعی نوسان دارد"
            labels={result.points.map((p) => `${toFaDigits(p.t.toFixed(1))} سال`)}
            datasets={[
              { label: 'ارزش', data: result.points.map((p) => p.value), color: 'chart-1', fill: true },
              { label: 'کل واریزی', data: result.points.map((p) => p.contributed), color: 'chart-4', dashed: true }
            ]}
          />
          <Surface className="px-4 md:px-5">
            <h3 className="pt-4 text-sm font-bold text-ink">ارزش در پایان هر سال</h3>
            <KeyValueList
              dense
              rows={result.yearly.map((p) => ({
                  label: `سال ${toFaDigits(p.year)}`,
                  value: <MoneyValue value={p.value} />,
                  hint: <>واریزی <MoneyValue value={p.contributed} /></>
                }))}
            />
          </Surface>
          <ExportButtons
            filename="growth-projection.csv"
            headers={['سال', 'کل واریزی', 'ارزش']}
            rows={result.points.map((p) => [p.t.toFixed(2), p.contributed, p.value])}
            pdfTitle="گزارش پیش‌بینی رشد"
            pdfSections={[
              {
                heading: 'پیش‌بینی ارزش آینده',
                table: {
                  headers: ['موارد', 'مقدار'],
                  rows: [
                    ['سرمایه اولیه', fmtUSD(numOr(initial))],
                    ['واریز هر دوره', fmtUSD(numOr(contrib))],
                    ['بازده سالانه', fmtPct(numOr(rate))],
                    ['مدت (سال)', String(y)],
                    ['کل واریزی', fmtUSD(result.totalContributed)],
                    ['ارزش نهایی', fmtUSD(result.finalValue)],
                    ['سود', fmtUSD(result.profit)]
                  ]
                },
                note: 'پیش‌بینی با بازده ثابت فرضی است و تضمینی نیست.'
              }
            ]}
          />
        </>
      )}
    </CalcShell>
  );
}

function CagrRate({ modeSwitch }: { modeSwitch: ReactNode }) {
  const { prices } = useCalculatorPrices();
  const [initial, setInitial] = useState('10000');
  const [final, setFinal] = useState('');
  const [start, setStart] = useState('2023-01-01');
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));

  const startTs = useMemo(() => new Date(start + 'T00:00:00').getTime(), [start]);
  const endTs = useMemo(() => new Date(end + 'T00:00:00').getTime(), [end]);
  const years = Math.max((endTs - startTs) / (365.25 * 86_400_000), 0);
  const init = Number(initial) || 0;
  const fin = Number(final) || 0;
  const ready = init > 0 && fin > 0 && years > 0;

  const result = useMemo(
    () => calcCagrFull({ initialValue: init, finalValue: fin, startDate: startTs, endDate: endTs }),
    [init, fin, startTs, endTs]
  );

  usePublishInsight('calculatorCagr', 'رشد سالانه', ready ? { ...result, initialUsd: init, finalUsd: fin, startTs, endTs } : null);

  const growthCurve = useMemo(() => {
    if (!ready || result.cagr === null) return [];
    const points = 40;
    return Array.from({ length: points + 1 }, (_, i) => init * Math.pow(1 + (result.cagr as number), (i / points) * years));
  }, [ready, result.cagr, years, init]);

  const inputs = (
    <>
      {modeSwitch}
      <div className="grid grid-cols-2 gap-4">
        <Field label="ارزش اولیه">
          <Input dir="ltr" inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} suffix="دلار" />
        </Field>
        <Field label="ارزش نهایی">
          <Input dir="ltr" inputMode="decimal" value={final} onChange={(e) => setFinal(e.target.value)} placeholder="0.00" suffix="دلار" />
        </Field>
      </div>
      <SmartDateField label="تاریخ شروع" value={start ? parseIsoToTs(start) : null} onChange={(ts) => setStart(ts ? formatGregorianIso(ts) : '')} />
      <SmartDateField label="تاریخ پایان" value={end ? parseIsoToTs(end) : null} onChange={(ts) => setEnd(ts ? formatGregorianIso(ts) : '')} />
      <p className="text-xs leading-5 text-muted">
        مدت: <span className="num-ltr font-semibold text-ink">{years.toFixed(2)}</span> سال · فرمول: (نهایی ÷ اولیه)^(۱ ÷ سال) − ۱
      </p>
    </>
  );

  return (
    <CalcShell inputs={inputs}>
      {years <= 0 ? (
        <Notice tone="warn">تاریخ پایان باید بعد از تاریخ شروع باشد.</Notice>
      ) : !ready ? (
        <ResultPlaceholder>ارزش اولیه و نهایی را وارد کنید تا نرخ رشد سالانه محاسبه شود.</ResultPlaceholder>
      ) : (
        <>
          <ResultHero
            label="نرخ رشد سالانه مرکب"
            value={<PercentValue value={result.cagr === null ? null : result.cagr * 100} tone="auto" />}
            sub={`در ${toFaDigits(Math.round(result.days))} روز`}
          >
            <MetricGrid cols={2}>
              <Metric label="سود کل" value={<MoneyValue value={result.totalProfit} signed tone="auto" />} />
              <Metric label="رشد کل" value={<PercentValue value={result.totalGrowthPct} />} />
            </MetricGrid>
          </ResultHero>

          {growthCurve.length > 1 && (
            <LineChartCard
              title="منحنی رشد با نرخ ثابت رشد سالانهٔ مرکب"
              description="مسیر هموار فرضی؛ مسیر واقعی دارایی نوسان داشته است"
              labels={growthCurve.map((_, i) => `${Math.round((i / (growthCurve.length - 1)) * years * 12)} ماه`)}
              datasets={[{ label: 'ارزش', data: growthCurve, color: 'chart-1', fill: true }]}
            />
          )}

          <Surface className="px-4 md:px-5">
            <h3 className="pt-4 text-sm font-bold text-ink">قیمت فعلی دارایی‌های مرجع</h3>
            <KeyValueList
              dense
              rows={REFERENCE.map((r) => ({ label: r.label, value: <MoneyValue value={prices[r.symbol] ?? null} /> }))}
            />
          </Surface>

          <ExportButtons
            filename="cagr.csv"
            headers={['ارزش اولیه', 'ارزش نهایی', 'سال', 'CAGR', 'سود کل', 'رشد کل']}
            rows={[[initial, final, years.toFixed(2), result.cagr === null ? '—' : (result.cagr * 100).toFixed(2) + '%', result.totalProfit ?? 'N/A', result.totalGrowthPct ?? 'N/A']]}
            pdfTitle="گزارش رشد سالانهٔ مرکب"
            pdfSections={[
              {
                heading: 'نرخ رشد سالانه مرکب',
                table: {
                  headers: ['موارد', 'مقدار'],
                  rows: [
                    ['ارزش اولیه', fmtUSD(init)],
                    ['ارزش نهایی', fmtUSD(fin)],
                    ['مدت (سال)', years.toFixed(2)],
                    ['CAGR', fmtPct(result.cagr === null ? null : result.cagr * 100)],
                    ['سود کل', fmtUSD(result.totalProfit)],
                    ['رشد کل', fmtPct(result.totalGrowthPct)]
                  ]
                }
              }
            ]}
          />
        </>
      )}
    </CalcShell>
  );
}

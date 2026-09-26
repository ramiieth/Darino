/**
 * ③ CAGR — compound annual growth rate.
 *   CAGR = (final ÷ initial)^(1 ÷ years) − 1   (domain: calcCagrFull)
 * Results appear only once both values are entered (an empty final value is
 * not "−100%").
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
import { calcCagrFull } from '@/features/calculators/domain';
import { fmtUSD, fmtPct, toFaDigits } from '@/shared/utils/formatters';

const REFERENCE = [
  { symbol: 'BTC', label: 'بیت‌کوین' },
  { symbol: 'ETH', label: 'اتریوم' },
  { symbol: 'GLD', label: 'طلا (GLD)' },
  { symbol: 'SPY', label: 'S&P 500 (SPY)' }
];

export function CagrCalculator() {
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

  const growthCurve = useMemo(() => {
    if (!ready || result.cagr === null) return [];
    const points = 40;
    return Array.from({ length: points + 1 }, (_, i) => init * Math.pow(1 + (result.cagr as number), (i / points) * years));
  }, [ready, result.cagr, years, init]);

  const inputs = (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Field label="ارزش اولیه">
          <Input dir="ltr" inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} suffix="$" />
        </Field>
        <Field label="ارزش نهایی">
          <Input dir="ltr" inputMode="decimal" value={final} onChange={(e) => setFinal(e.target.value)} placeholder="0.00" suffix="$" />
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
            label="نرخ رشد سالانه مرکب (CAGR)"
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
              title="منحنی رشد با نرخ ثابت CAGR"
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
            rows={[[initial, final, years.toFixed(2), result.cagr === null ? 'N/A' : (result.cagr * 100).toFixed(2) + '%', result.totalProfit ?? 'N/A', result.totalGrowthPct ?? 'N/A']]}
            pdfTitle="گزارش CAGR"
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

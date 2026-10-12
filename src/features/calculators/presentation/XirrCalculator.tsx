import { usePublishInsight } from '@/shared/assistant/insights';
/**
 * ④ XIRR — annualised return of cash flows on irregular dates.
 * Newton-Raphson with bisection fallback (domain/xirr).
 * Sign rule: money in (investment) negative, money out / current value positive.
 */
import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, IconButton } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { SmartDateField } from '@/shared/components/ui/SmartDateField';
import { Surface } from '@/shared/components/ui/GlassCard';
import { MetricGrid, Metric, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { parseIsoToTs, formatGregorianIso } from '@/shared/utils/jalali';
import { CalcShell, ResultHero, ResultPlaceholder } from './StatCard';
import { BarChartCard, fmtFaDate } from './CalcCharts';
import { ExportButtons } from './ExportButtons';
import { calcXirr, scheduleDates, SCHEDULE_FREQUENCY_LABELS, type CashFlow, type ScheduleFrequency } from '@/features/calculators/domain';
import { Field } from '@/shared/components/ui/Input';
import { ChipGroup } from '@/shared/components/ui/SegmentedControl';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { parseNum } from './parse';
import { fmtUSD, fmtPct, toFaDigits } from '@/shared/utils/formatters';

interface FlowRow {
  id: number;
  date: string;
  amount: string;
}

export function XirrCalculator() {
  const [rows, setRows] = useState<FlowRow[]>([
    { id: 1, date: '2024-01-01', amount: '-10000' },
    { id: 2, date: '2024-07-01', amount: '-5000' },
    { id: 3, date: new Date().toISOString().slice(0, 10), amount: '18000' }
  ]);

  const [genAmount, setGenAmount] = useState('-500');
  const [genFreq, setGenFreq] = useState<ScheduleFrequency>('monthly');
  const [genStart, setGenStart] = useState('2024-02-01');
  const [genEnd, setGenEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const genDates = useMemo(
    () => scheduleDates(new Date(genStart + 'T00:00:00').getTime(), new Date(genEnd + 'T00:00:00').getTime(), genFreq),
    [genStart, genEnd, genFreq]
  );
  const addPeriodic = () => {
    const amt = parseNum(genAmount);
    if (!Number.isFinite(amt) || amt === 0 || genDates.length === 0) return;
    const base = Date.now();
    setRows((r) => [...r, ...genDates.slice(0, 600).map((t, i) => ({ id: base + i, date: formatGregorianIso(t), amount: String(amt) }))].sort((a, b) => a.date.localeCompare(b.date)));
  };

  const addRow = () => setRows((r) => [...r, { id: Date.now(), date: new Date().toISOString().slice(0, 10), amount: '0' }]);
  const removeRow = (id: number) => setRows((r) => (r.length > 2 ? r.filter((x) => x.id !== id) : r));
  const update = (id: number, patch: Partial<FlowRow>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const flows: CashFlow[] = useMemo(
    () =>
      rows
        .map((r) => ({ date: new Date(r.date + 'T00:00:00').getTime(), amount: Number(r.amount) || 0 }))
        .sort((a, b) => a.date - b.date),
    [rows]
  );
  const nonZero = useMemo(() => flows.filter((f) => f.amount !== 0), [flows]);

  // pure derivation — no state updates during render
  const result = useMemo(() => (nonZero.length < 2 ? null : calcXirr(nonZero)), [nonZero]);
  usePublishInsight('calculatorXirr', 'بازده جریان نقدی', result ? { ...result } : null);

  const diverged = result !== null && result.xirr === null;

  const inputs = (
    <>
      <p className="text-xs leading-5 text-muted">
        واریز (سرمایه‌گذاری) را منفی و برداشت یا ارزش فعلی را مثبت وارد کنید. حل عددی با Newton-Raphson و فالبک Bisection.
      </p>
      <ol className="space-y-3">
        {rows.map((r, i) => (
          <li key={r.id} className="rounded-field border border-divider p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted">جریان {toFaDigits(i + 1)}</span>
              <IconButton size="sm" aria-label={`حذف جریان ${i + 1}`} onClick={() => removeRow(r.id)} disabled={rows.length <= 2}>
                <Trash2 />
              </IconButton>
            </div>
            <SmartDateField
              value={r.date ? parseIsoToTs(r.date) : null}
              onChange={(ts) => update(r.id, { date: ts ? formatGregorianIso(ts) : '' })}
              compact
            />
            <div className="mt-2">
              <Input
                dir="ltr"
                inputMode="decimal"
                value={r.amount}
                onChange={(e) => update(r.id, { amount: e.target.value })}
                aria-label={`مبلغ جریان ${i + 1}`}
                suffix="دلار"
              />
            </div>
          </li>
        ))}
      </ol>
      <Button variant="outline" size="sm" icon={<Plus />} onClick={addRow}>
        افزودن جریان نقدی
      </Button>
      <Disclosure summary="افزودن جریان‌های دوره‌ای (مثلاً واریز ماهانه)">
        <div className="space-y-3">
          <ChipGroup<ScheduleFrequency>
            label="دوره"
            value={genFreq}
            onChange={setGenFreq}
            options={(['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] as ScheduleFrequency[]).map((f) => ({ value: f, label: SCHEDULE_FREQUENCY_LABELS[f] }))}
          />
          <Field label="مبلغ هر دوره (واریز منفی)">
            <Input dir="ltr" inputMode="decimal" value={genAmount} onChange={(e) => setGenAmount(e.target.value)} suffix="دلار" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <SmartDateField label="از" value={genStart ? parseIsoToTs(genStart) : null} onChange={(ts) => setGenStart(ts ? formatGregorianIso(ts) : '')} />
            <SmartDateField label="تا" value={genEnd ? parseIsoToTs(genEnd) : null} onChange={(ts) => setGenEnd(ts ? formatGregorianIso(ts) : '')} />
          </div>
          <Button variant="secondary" size="sm" icon={<Plus />} onClick={addPeriodic} disabled={genDates.length === 0 || !(Math.abs(parseNum(genAmount)) > 0)}>
            افزودن {toFaDigits(genDates.length)} جریان
          </Button>
        </div>
      </Disclosure>
    </>
  );

  return (
    <CalcShell inputs={inputs} inputTitle="جریان‌های نقدی">
      {!result ? (
        <ResultPlaceholder>حداقل دو جریان نقدی غیرصفر لازم است.</ResultPlaceholder>
      ) : (
        <>
          {diverged && (
            <Notice tone="warn" title="معادله همگرا نشد">
              جریان‌های نقدی را بررسی کنید — دست‌کم یک واریز (منفی) و یک برداشت (مثبت) لازم است.
            </Notice>
          )}
          <ResultHero
            label="بازده واقعی سالانه (XIRR)"
            value={<PercentValue value={result.xirr === null ? null : result.xirr * 100} tone="auto" />}
          >
            <MetricGrid cols={3}>
              <Metric label="سود کل" value={<MoneyValue value={result.totalProfit} signed tone="auto" />} />
              <Metric label="مجموع واریزها" value={<MoneyValue value={result.totalOutflows} />} />
              <Metric label="مجموع برداشت‌ها" value={<MoneyValue value={result.totalInflows} />} />
            </MetricGrid>
          </ResultHero>

          <BarChartCard
            title="جریان نقدی"
            description="منفی = واریز · مثبت = برداشت یا ارزش فعلی"
            labels={nonZero.map((f) => fmtFaDate(f.date))}
            values={nonZero.map((f) => f.amount)}
          />

          <Surface className="overflow-hidden">
            <table className="data-table is-compact">
              <caption className="sr-only">جدول جریان نقدی</caption>
              <thead>
                <tr>
                  <th scope="col" className="!ps-4 md:!ps-5">تاریخ</th>
                  <th scope="col" className="col-num !pe-4 md:!pe-5">مبلغ</th>
                </tr>
              </thead>
              <tbody>
                {nonZero.map((f, i) => (
                  <tr key={i}>
                    <td className="!ps-4 text-muted md:!ps-5">{fmtFaDate(f.date)}</td>
                    <td className="col-num !pe-4 md:!pe-5">
                      <MoneyValue value={f.amount} signed tone="auto" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>

          <ExportButtons
            filename="xirr.csv"
            headers={['تاریخ', 'مبلغ']}
            rows={nonZero.map((f) => [new Date(f.date).toISOString().slice(0, 10), f.amount])}
            pdfTitle="گزارش بازده واقعی سالانه"
            pdfSections={[
              {
                heading: 'نرخ بازده واقعی',
                table: {
                  headers: ['موارد', 'مقدار'],
                  rows: [
                    ['XIRR', fmtPct(result.xirr === null ? null : result.xirr * 100)],
                    ['سود کل', fmtUSD(result.totalProfit)],
                    ['مجموع واریزها', fmtUSD(result.totalOutflows)],
                    ['مجموع برداشت‌ها', fmtUSD(result.totalInflows)]
                  ]
                }
              },
              {
                heading: 'جدول جریان نقدی',
                table: { headers: ['تاریخ', 'مبلغ'], rows: nonZero.map((f) => [new Date(f.date).toISOString().slice(0, 10), f.amount]) }
              }
            ]}
          />
        </>
      )}
    </CalcShell>
  );
}

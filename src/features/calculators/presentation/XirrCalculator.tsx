/**
 * ۴) ماشین‌حساب XIRR — جریان‌های نقدی در تاریخ‌های مختلف
 * الگوریتم: Newton-Raphson + فالبک Bisection (در domain/xirr)
 */
import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { SmartDateField } from '@/shared/components/ui/SmartDateField';
import { parseIsoToTs, formatGregorianIso } from '@/shared/utils/jalali';
import { StatCard } from './StatCard';
import { BarChartCard } from './CalcCharts';
import { ExportButtons } from './ExportButtons';
import { calcXirr, type CashFlow } from '@/features/calculators/domain';
import { fmtUSD, fmtPct } from '@/shared/utils/formatters';
import { fmtFaDate } from './CalcCharts';

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
  const [note, setNote] = useState<string | null>(null);

  const addRow = () =>
    setRows((r) => [...r, { id: Date.now(), date: new Date().toISOString().slice(0, 10), amount: '0' }]);
  const removeRow = (id: number) => setRows((r) => (r.length > 2 ? r.filter((x) => x.id !== id) : r));
  const update = (id: number, patch: Partial<FlowRow>) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const flows: CashFlow[] = useMemo(() => {
    return rows
      .map((r) => ({
        date: new Date(r.date + 'T00:00:00').getTime(),
        amount: Number(r.amount) || 0
      }))
      .sort((a, b) => a.date - b.date);
  }, [rows]);

  const result = useMemo(() => {
    const nonZero = flows.filter((f) => f.amount !== 0);
    if (nonZero.length < 2) return null;
    const r = calcXirr(nonZero);
    if (r.xirr === null) {
      setNote('معادله همگرا نشد — جریان‌های نقدی را بررسی کنید (حداقل یک واریز و یک برداشت)');
    } else {
      setNote(null);
    }
    return r;
  }, [flows]);

  return (
    <div className="space-y-4">
      <GlassCard className="space-y-3 p-4">
        <p className="text-[10px] font-medium leading-5 text-muted">
          قاعده علامت: واریز (سرمایه‌گذاری) منفی، برداشت/ارزش فعلی مثبت.
          حل عددی با Newton-Raphson و فالبک Bisection — دقت ۱e-12.
        </p>
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="space-y-1.5 rounded-xl bg-line/5 p-2">
              <div className="flex items-center gap-2">
                <SmartDateField
                  value={r.date ? parseIsoToTs(r.date) : null}
                  onChange={(ts) => update(r.id, { date: ts ? formatGregorianIso(ts) : '' })}
                  compact
                  className="min-w-0 flex-1"
                />
                <button
                  onClick={() => removeRow(r.id)}
                  className="rounded-xl p-2 text-muted hover:bg-negative/10 hover:text-negative"
                  aria-label="حذف"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <Input
                dir="ltr"
                inputMode="decimal"
                value={r.amount}
                onChange={(e) => update(r.id, { amount: e.target.value })}
                placeholder="مبلغ (علامت: واریز منفی، برداشت مثبت)"
                className="h-10 w-full text-xs text-start"
              />
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="h-3.5 w-3.5" />
          افزودن جریان نقدی
        </Button>
      </GlassCard>

      {note && <p className="glass-soft rounded-2xl px-4 py-3 text-center text-[11px] font-bold text-warn">{note}</p>}

      {result && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <StatCard
              label="XIRR (بازده واقعی سالانه)"
              value={fmtPct(result.xirr === null ? null : result.xirr * 100)}
              tone={result.xirr === null ? 'neutral' : result.xirr >= 0 ? 'positive' : 'negative'}
            />
            <StatCard label="سود کل" value={fmtUSD(result.totalProfit)} tone={result.totalProfit !== null && result.totalProfit >= 0 ? 'positive' : 'negative'} />
            <StatCard label="مجموع واریزها" value={fmtUSD(-result.totalOutflows)} />
            <StatCard label="مجموع برداشت‌ها" value={fmtUSD(result.totalInflows)} />
          </div>

          <BarChartCard
            title="نمودار جریان نقدی"
            labels={flows.filter((f) => f.amount !== 0).map((f) => fmtFaDate(f.date))}
            values={flows.filter((f) => f.amount !== 0).map((f) => f.amount)}
          />

          <GlassCard className="overflow-hidden">
            <div className="max-h-56 overflow-auto">
              <table className="sim-table min-w-[380px] text-start">
                <thead>
                  <tr>
                    <th className="!text-start">تاریخ</th>
                    <th className="!text-start">مبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {flows
                    .filter((f) => f.amount !== 0)
                    .map((f, i) => (
                      <tr key={i}>
                        <td>{fmtFaDate(f.date)}</td>
                        <td className={f.amount >= 0 ? 'num-ltr text-positive' : 'num-ltr text-negative'}>
                          {fmtUSD(f.amount)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </GlassCard>

          <ExportButtons
            filename="xirr.csv"
            headers={['تاریخ', 'مبلغ']}
            rows={flows.filter((f) => f.amount !== 0).map((f) => [new Date(f.date).toISOString().slice(0, 10), f.amount])}
            pdfTitle="گزارش XIRR"
            pdfSections={[
              {
                heading: 'نرخ بازده واقعی (XIRR)',
                table: {
                  headers: ['موارد', 'مقدار'],
                  rows: [
                    ['XIRR', fmtPct(result.xirr === null ? null : result.xirr * 100)],
                    ['سود کل', fmtUSD(result.totalProfit)],
                    ['مجموع واریزها', fmtUSD(-result.totalOutflows)],
                    ['مجموع برداشت‌ها', fmtUSD(result.totalInflows)]
                  ]
                }
              },
              {
                heading: 'جدول جریان نقدی',
                table: {
                  headers: ['تاریخ', 'مبلغ'],
                  rows: flows.filter((f) => f.amount !== 0).map((f) => [new Date(f.date).toISOString().slice(0, 10), f.amount])
                }
              }
            ]}
          />
        </>
      )}
    </div>
  );
}

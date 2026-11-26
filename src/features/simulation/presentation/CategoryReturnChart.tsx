/**
 * Average return by category — horizontal bars + summary pills
 */
import { toFaDigits } from '@/shared/utils/formatters';
import { useMemo } from 'react';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { Surface } from '@/shared/components/ui/GlassCard';
import { PercentValue } from '@/shared/components/ui/FinancialValue';
import type { TimelineResult } from '@/shared/types';
import { t } from '@/shared/i18n/fa';
import { fmtPct } from '@/shared/utils/formatters';
import { baseChartOptions, cssColor } from '@/shared/design/chartTheme';
import { cn } from '@/shared/lib/cn';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip);

export function CategoryReturnChart({ result }: { result: TimelineResult }) {
  const data = useMemo(() => {
    const cats: { key: string; label: string; values: number[] }[] = [
      { key: 'crypto', label: t('categoryCrypto'), values: [] },
      { key: 'tokenized', label: t('categoryTokenized'), values: [] },
      { key: 'tradfi', label: t('categoryTradFi'), values: [] }
    ];
    for (const r of result.rows) {
      if (r.changePct === null) continue;
      cats.find((c) => c.key === r.kind)?.values.push(r.changePct);
    }
    return cats
      .filter((c) => c.values.length > 0)
      .map((c) => ({
        ...c,
        count: c.values.length,
        avg: c.values.reduce((a, b) => a + b, 0) / c.values.length
      }));
  }, [result.rows]);

  if (data.length === 0) return null;

  const base = baseChartOptions({ formatTooltip: (v) => `میانگین بازده ${fmtPct(v)}` }) as Record<string, unknown>;
  const scales = base.scales as { x: Record<string, unknown>; y: Record<string, unknown> };
  const options = {
    ...base,
    indexAxis: 'y' as const,
    plugins: {
      ...(base.plugins as object),
      tooltip: {
        ...((base.plugins as { tooltip: object }).tooltip),
        callbacks: { label: (ctx: { parsed: { x: number } }) => ` میانگین بازده ${fmtPct(ctx.parsed.x)}` }
      }
    },
    scales: {
      x: {
        ...scales.y,
        position: 'bottom',
        ticks: {
          ...(scales.y.ticks as object),
          callback: (v: number | string) => `${toFaDigits(Number(v).toFixed(0))}٪`
        }
      },
      y: { ...scales.x, position: 'right' }
    }
  };

  return (
    <Surface className="flex h-full flex-col justify-between gap-3 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold text-ink">میانگین بازده به تفکیک دسته</h3>
          <p className="mt-0.5 text-xs text-muted">میانگین سادهٔ بازده دارایی‌های دارای داده در این بازه</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {data.map((d) => (
            <span
              key={d.key}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-2xs font-semibold',
                d.avg >= 0
                  ? 'border-gain/25 bg-gain/10 text-positive'
                  : 'border-negative/25 bg-negative/10 text-negative'
              )}
            >
              <span className="text-ink/80">{d.label}</span>
              <PercentValue value={d.avg} digits={1} />
              <span className="text-subtle">({toFaDigits(d.count)})</span>
            </span>
          ))}
        </div>
      </div>

      <div className="h-36" dir="ltr">
        <Bar
          data={{
            labels: data.map((d) => d.label),
            datasets: [
              {
                data: data.map((d) => d.avg),
                backgroundColor: data.map((d) => (d.avg >= 0 ? cssColor('gain', 0.85) : cssColor('loss', 0.85))),
                borderRadius: 6,
                barThickness: 22
              }
            ]
          }}
          options={options as never}
        />
      </div>
    </Surface>
  );
}

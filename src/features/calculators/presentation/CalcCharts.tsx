/**
 * Calculator charts — Chart.js on the shared chart theme.
 * Colours are design tokens (chart-1…6 for series, gain/loss for signed bars).
 */
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { Surface } from '@/shared/components/ui/GlassCard';
import { fmtUSD, toFaDigits } from '@/shared/utils/formatters';
import { axisUsd, baseChartOptions, cssColor, SERIES, type ChartToken } from '@/shared/design/chartTheme';

ChartJS.register(LineElement, PointElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

const FA_TIME = new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric' });

export function fmtFaDate(ts: number): string {
  try {
    return FA_TIME.format(new Date(ts));
  } catch {
    return '';
  }
}

export function LineChartCard({
  title,
  description,
  labels,
  datasets,
  height = 220,
  prefix = '$',
  suffix = ''
}: {
  title: string;
  description?: string;
  labels: string[];
  /** `color` is a chart token; series without one take chart-1…6 in order */
  datasets: { label: string; data: number[]; color?: ChartToken; fill?: boolean; dashed?: boolean }[];
  height?: number;
  prefix?: '$' | '';
  suffix?: string;
}) {
  const fmt = (v: number) => (prefix === '$' ? fmtUSD(v) : `${toFaDigits(v.toLocaleString('en-US', { maximumFractionDigits: 2 }))}${suffix}`);
  const options = baseChartOptions({
    legend: datasets.length > 1,
    formatTooltip: (v) => fmt(v),
    formatY: prefix === '$' ? axisUsd : (v) => `${toFaDigits(v.toLocaleString('en-US', { maximumFractionDigits: 0 }))}${suffix}`
  });
  return (
    <Surface className="p-4 md:p-5">
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      <div className="mt-3" style={{ height }} dir="ltr">
        <Line
          data={{
            labels,
            datasets: datasets.map((d, i) => {
              const token = d.color ?? SERIES[i % SERIES.length];
              return {
                label: d.label,
                data: d.data,
                borderColor: cssColor(token),
                backgroundColor: cssColor(token, 0.08),
                borderWidth: 2,
                borderDash: d.dashed ? [4, 4] : undefined,
                pointRadius: 0,
                pointHoverRadius: 4,
                tension: 0.25,
                fill: d.fill ?? false
              };
            })
          }}
          options={options as never}
        />
      </div>
    </Surface>
  );
}

export function BarChartCard({
  title,
  description,
  labels,
  values,
  height = 200,
  unit = '$'
}: {
  title: string;
  description?: string;
  labels: string[];
  values: number[];
  height?: number;
  unit?: '$' | '%';
}) {
  const fmt = (v: number) => (unit === '$' ? fmtUSD(v) : `${v > 0 ? '+' : ''}${toFaDigits(v.toFixed(2))}٪`);
  const options = baseChartOptions({
    formatTooltip: (v) => fmt(v),
    formatY: unit === '$' ? axisUsd : (v) => `${toFaDigits(v.toFixed(0))}٪`,
    maxXTicks: 10
  });
  return (
    <Surface className="p-4 md:p-5">
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      <div className="mt-3" style={{ height }} dir="ltr">
        <Bar
          data={{
            labels,
            datasets: [
              {
                data: values,
                backgroundColor: values.map((v) => (v >= 0 ? cssColor('gain', 0.85) : cssColor('loss', 0.85))),
                borderRadius: 4,
                maxBarThickness: 32
              }
            ]
          }}
          options={options as never}
        />
      </div>
    </Surface>
  );
}

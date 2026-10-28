/**
 * نمودارهای ژورنال روی تم مشترک Chart.js — فقط خط و میله (بدون دونات چندتکه، دومحوره، رادار یا گیج)
 * محورها برچسب فارسی دارند؛ جزئیات هر نقطه در tooltip است، نه روی نمودار.
 */
import { BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { axisUsd, baseChartOptions, cssColor } from '@/shared/design/chartTheme';
import { usd } from './parts';

ChartJS.register(LineElement, PointElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

export function EquityChart({ labels, equity, drawdown, height = 220 }: { labels: string[]; equity: number[]; drawdown: number[]; height?: number }) {
  const options = baseChartOptions({ legend: true, formatTooltip: (v) => usd(v, true), formatY: axisUsd });
  return (
    <div style={{ height }} dir="ltr">
      <Line
        data={{
          labels,
          datasets: [
            { label: 'سود خالص تجمعی', data: equity, borderColor: cssColor('chart-1'), backgroundColor: cssColor('chart-1', 0.06), borderWidth: 2, pointRadius: 0, tension: 0.2, fill: false },
            { label: 'افت از قله', data: drawdown, borderColor: cssColor('loss', 0.7), backgroundColor: cssColor('loss', 0.18), borderWidth: 1, pointRadius: 0, tension: 0.2, fill: 'origin' }
          ]
        }}
        options={options as never}
      />
    </div>
  );
}

/** میله‌ها؛ رنگ هر میله از علامتش (سود/زیان) یا رنگ ثابت؛ ghost = میلهٔ کم‌رنگ هدف کنار هر میله */
export function Bars({ labels, values, height = 200, signed = true, ghost, unit = '$', colors }: { labels: string[]; values: number[]; height?: number; signed?: boolean; ghost?: (number | null)[]; unit?: '$' | 'n' | '%'; colors?: string[] }) {
  const fmt = (v: number) => (unit === '$' ? usd(v, signed) : unit === '%' ? `${v.toFixed(1)}٪` : v.toLocaleString('en-US'));
  const options = baseChartOptions({ legend: !!ghost, formatTooltip: (v) => fmt(v), formatY: unit === '$' ? axisUsd : (v) => v.toLocaleString('en-US'), maxXTicks: 12 });
  const bar = colors ?? values.map((v) => (!signed ? cssColor('chart-1', 0.85) : v >= 0 ? cssColor('gain', 0.85) : cssColor('loss', 0.85)));
  return (
    <div style={{ height }} dir="ltr">
      <Bar
        data={{
          labels,
          datasets: [
            { label: 'واقعی', data: values, backgroundColor: bar, borderRadius: 4, maxBarThickness: 36 },
            ...(ghost ? [{ label: 'لازم برای ۱٫۵ به ۱', data: ghost.map((g) => g ?? 0), backgroundColor: cssColor('ink-muted', 0.18), borderRadius: 4, maxBarThickness: 36 }] : [])
          ]
        }}
        options={options as never}
      />
    </div>
  );
}

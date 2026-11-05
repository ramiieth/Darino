/**
 * نمودارهای عملکرد سرمایه روی تم مشترک Chart.js
 *   HistoryChart  — تاریخچهٔ ارزش (دلار یا تومان)؛ جزئیات هر نقطه با لمس/نشانگر
 *   ReturnBars    — بازده بازارها در یک بازه (افقی؛ پرتفوی برجسته) — خوانا در موبایل
 */
import { BarElement, CategoryScale, Chart as ChartJS, Filler, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { axisUsd, baseChartOptions, cssColor } from '@/shared/design/chartTheme';
import { fmtCompactFa, toFaDigits } from '@/shared/utils/formatters';

ChartJS.register(LineElement, PointElement, BarElement, CategoryScale, LinearScale, Tooltip, Filler);

const usdTip = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;
const tomanTip = (v: number) => `${fmtCompactFa(v)} تومان`;

export function HistoryChart({ labels, values, unit, notes, height = 240 }: { labels: string[]; values: (number | null)[]; unit: 'usd' | 'toman'; notes?: string[]; height?: number }) {
  const options = baseChartOptions({ formatTooltip: unit === 'usd' ? usdTip : tomanTip, formatY: unit === 'usd' ? axisUsd : (v) => fmtCompactFa(v) });
  const o = options as unknown as { plugins: { tooltip: { callbacks: Record<string, unknown> } } };
  if (notes) o.plugins.tooltip.callbacks = { ...o.plugins.tooltip.callbacks, afterLabel: (c: { dataIndex: number }) => (notes[c.dataIndex] ? ` ${notes[c.dataIndex]}` : '') };
  return (
    <div style={{ height }} dir="ltr">
      <Line
        data={{
          labels,
          datasets: [
            {
              label: unit === 'usd' ? 'ارزش دلاری' : 'ارزش تومانی',
              data: values,
              borderColor: cssColor('chart-1'),
              backgroundColor: cssColor('chart-1', 0.08),
              borderWidth: 2,
              pointRadius: labels.length > 40 ? 0 : 3,
              pointHoverRadius: 5,
              tension: 0.25,
              fill: 'origin',
              spanGaps: true
            }
          ]
        }}
        options={options as never}
      />
    </div>
  );
}

/** میله‌های افقی بازده (٪)؛ highlight = اندیس پرتفوی */
export function ReturnBars({ labels, values, highlight }: { labels: string[]; values: number[]; highlight: number }) {
  const base = baseChartOptions() as unknown as Record<string, unknown> & { scales: Record<string, Record<string, unknown>>; plugins: { tooltip: Record<string, unknown> } };
  const pctText = (v: number) => `${v > 0 ? '+' : ''}${toFaDigits(v.toFixed(1))}٪`;
  const options = {
    ...base,
    plugins: { ...base.plugins, tooltip: { ...base.plugins.tooltip, callbacks: { label: (c: { parsed: { x: number } }) => ` بازده: ${pctText(c.parsed.x)}` } } },
    indexAxis: 'y',
    interaction: { mode: 'nearest', intersect: true, axis: 'y' },
    scales: {
      x: { ...base.scales.y, position: 'bottom', ticks: { ...(base.scales.y.ticks as object), callback: (v: number | string) => `${toFaDigits(Number(v).toFixed(0))}٪` } },
      y: { ...base.scales.x, position: 'right', ticks: { ...(base.scales.x.ticks as object), autoSkip: false, maxTicksLimit: 50 } }
    }
  };
  const colors = values.map((v, i) => (i === highlight ? cssColor('chart-1') : v >= 0 ? cssColor('gain', 0.75) : cssColor('loss', 0.75)));
  return (
    <div style={{ height: Math.max(160, labels.length * 30 + 40) }} dir="ltr">
      <Bar data={{ labels, datasets: [{ label: 'بازده', data: values, backgroundColor: colors, borderRadius: 4, maxBarThickness: 22 }] }} options={options as never} />
    </div>
  );
}

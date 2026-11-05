/**
 * نمودارهای آزمایشگاه کری روی تم مشترک Chart.js
 *   EquityChart   ارزش ۱ دلار: بهترین قانون، همیشه باز و بازده استیبل
 *   MonthlyBars   میانگین فاندینگ سالانه‌شدهٔ هر ماه (رژیم بازار)
 */
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { baseChartOptions, cssColor } from '@/shared/design/chartTheme';
import { toFaDigits } from '@/shared/utils/formatters';

ChartJS.register(LineElement, PointElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const pctText = (v: number, digits = 1) => `${v > 0 ? '+' : ''}${toFaDigits(v.toFixed(digits))}٪`;

export interface EquitySeries {
  label: string;
  values: number[];
  token: 'chart-1' | 'chart-2' | 'chart-3';
  dashed?: boolean;
}

export function EquityChart({ labels, series, height = 260 }: { labels: string[]; series: EquitySeries[]; height?: number }) {
  const options = baseChartOptions({ legend: true, formatY: (v) => pctText((v - 1) * 100, 0), formatTooltip: (v) => pctText((v - 1) * 100, 2) });
  return (
    <div style={{ height }} dir="ltr">
      <Line
        data={{
          labels,
          datasets: series.map((s) => ({
            label: s.label,
            data: s.values,
            borderColor: cssColor(s.token),
            backgroundColor: cssColor(s.token),
            borderWidth: s.dashed ? 1.5 : 2,
            borderDash: s.dashed ? [5, 4] : undefined,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.15
          }))
        }}
        options={options as never}
      />
    </div>
  );
}

export function MonthlyBars({ labels, values, height = 200 }: { labels: string[]; values: number[]; height?: number }) {
  const options = baseChartOptions({ formatY: (v) => `${toFaDigits(v.toFixed(0))}٪`, formatTooltip: (v) => `${pctText(v)} سالانه`, maxXTicks: 12 });
  return (
    <div style={{ height }} dir="ltr">
      <Bar
        data={{
          labels,
          datasets: [
            {
              label: 'میانگین فاندینگ',
              data: values,
              backgroundColor: values.map((v) => (v >= 0 ? cssColor('gain', 0.7) : cssColor('loss', 0.7))),
              borderRadius: 3,
              maxBarThickness: 18
            }
          ]
        }}
        options={options as never}
      />
    </div>
  );
}

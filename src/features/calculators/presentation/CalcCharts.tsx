/**
 * نمودارهای مشترک ماشین‌حساب‌ها (Chart.js — RTL)
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
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { fmtUSD } from '@/shared/utils/formatters';

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
  labels,
  datasets,
  height = 180,
  prefix = '$'
}: {
  title: string;
  labels: string[];
  datasets: { label: string; data: number[]; color: string; fill?: boolean }[];
  height?: number;
  prefix?: string;
}) {
  return (
    <GlassCard className="p-4">
      <h4 className="mb-3 text-[12px] font-extrabold text-ink">{title}</h4>
      <div style={{ height }}>
        <Line
          data={{
            labels,
            datasets: datasets.map((d) => ({
              label: d.label,
              data: d.data,
              borderColor: d.color,
              backgroundColor: d.color + '22',
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.3,
              fill: d.fill ?? false
            }))
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { labels: { font: { family: 'Vazirmatn' }, color: '#94a3b8', boxWidth: 10 } },
              tooltip: {
                rtl: true,
                textDirection: 'rtl',
                callbacks: {
                  label: (c) => ` ${c.dataset.label}: ${prefix === '$' ? fmtUSD(c.parsed.y) : c.parsed.y}`
                }
              }
            },
            scales: {
              x: { ticks: { maxTicksLimit: 6, font: { size: 9 } }, grid: { display: false } },
              y: { grid: { color: 'rgba(148,163,184,0.12)' }, ticks: { font: { size: 9 } } }
            }
          }}
        />
      </div>
    </GlassCard>
  );
}

export function BarChartCard({
  title,
  labels,
  values,
  height = 160
}: {
  title: string;
  labels: string[];
  values: number[];
  height?: number;
}) {
  return (
    <GlassCard className="p-4">
      <h4 className="mb-3 text-[12px] font-extrabold text-ink">{title}</h4>
      <div style={{ height }}>
        <Bar
          data={{
            labels,
            datasets: [
              {
                data: values,
                backgroundColor: values.map((v) => (v >= 0 ? 'rgba(4,120,87,0.75)' : 'rgba(225,29,72,0.75)')),
                borderRadius: 6
              }
            ]
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                rtl: true,
                textDirection: 'rtl',
                callbacks: { label: (c) => ` ${fmtUSD(c.parsed.y)}` }
              }
            },
            scales: {
              x: { ticks: { maxTicksLimit: 8, font: { size: 9 } }, grid: { display: false } },
              y: { grid: { color: 'rgba(148,163,184,0.12)' }, ticks: { font: { size: 9 } } }
            }
          }}
        />
      </div>
    </GlassCard>
  );
}

/**
 * نمودار بازده میانگین بر اساس دسته (Chart.js — ممیزی §۶)
 * میله‌ای افقی از میانگین بازده هر دسته در بازه فعال
 */
import { useMemo } from 'react';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, type ChartOptions } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import type { TimelineResult } from '@/shared/types';
import { t } from '@/shared/i18n/fa';
import { fmtPctEn } from '@/shared/utils/formatters';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip);

const COLORS: Record<string, string> = {
  crypto: '#8b5cf6',
  tokenized: '#0ea5e9',
  tradfi: '#10b981'
};

export function CategoryReturnChart({ result }: { result: TimelineResult }) {
  const data = useMemo(() => {
    const cats: { key: string; label: string; values: number[] }[] = [
      { key: 'crypto', label: t('categoryCrypto'), values: [] },
      { key: 'tokenized', label: t('categoryTokenized'), values: [] },
      { key: 'tradfi', label: t('categoryTradFi'), values: [] }
    ];
    for (const r of result.rows) {
      if (r.changePct === null) continue;
      const group = cats.find((c) => c.key === r.kind);
      group?.values.push(r.changePct);
    }
    return cats
      .filter((c) => c.values.length > 0)
      .map((c) => ({
        ...c,
        avg: c.values.reduce((a, b) => a + b, 0) / c.values.length
      }));
  }, [result.rows]);

  if (data.length === 0) return null;

  const chartData = {
    labels: data.map((d) => d.label),
    datasets: [
      {
        data: data.map((d) => d.avg),
        backgroundColor: data.map((d) => COLORS[d.key] ?? '#94a3b8'),
        borderRadius: 8,
        barThickness: 22
      }
    ]
  };

  const options: ChartOptions<'bar'> = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        rtl: true,
        textDirection: 'rtl',
        callbacks: {
          label: (ctx) => {
            const v = ctx.parsed as unknown as { x: number };
            return ` میانگین بازده: ${fmtPctEn(v.x)}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(148,163,184,0.12)' },
        ticks: { font: { family: 'Vazirmatn' }, color: '#94a3b8' }
      },
      y: { grid: { display: false }, ticks: { font: { family: 'Vazirmatn' }, color: '#94a3b8' } }
    }
  };

  return (
    <GlassCard animated className="p-5">
      <h3 className="mb-4 text-sm font-extrabold text-ink">میانگین بازده به تفکیک دسته</h3>
      <div className="h-36">
        <Bar data={chartData} options={options} />
      </div>
    </GlassCard>
  );
}

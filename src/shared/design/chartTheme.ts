/**
 * Chart language — one theme for every Chart.js chart in Darino.
 *
 *  • Colours come from CSS variables (light/dark aware) — never hex in features.
 *  • Vazirmatn everywhere, 11–12px ticks, quiet horizontal grid only.
 *  • Tooltips: ink surface, RTL text, values formatted by the caller.
 *  • Gain/loss colours only for signed data; categorical series use chart-1…6.
 */
import { Chart as ChartJS, type ChartOptions } from 'chart.js';
import { fmtCompactFa, toFaDigits } from '@/shared/utils/formatters';

export type ChartToken =
  | 'chart-1' | 'chart-2' | 'chart-3' | 'chart-4' | 'chart-5' | 'chart-6'
  | 'chart-grid' | 'chart-axis'
  | 'gain' | 'loss' | 'gold' | 'ink' | 'ink-muted' | 'card' | 'brand-500';

/** Resolve a design token to an rgb()/rgba() string (runtime, theme-aware) */
export function cssColor(token: ChartToken, alpha = 1): string {
  if (typeof window === 'undefined') return `rgba(0,0,0,${alpha})`;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--c-${token}`).trim();
  if (!raw) return `rgba(0,0,0,${alpha})`;
  const [r, g, b] = raw.split(/\s+/).map(Number);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const SERIES: ChartToken[] = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6'];

let defaultsApplied = false;
/** Apply global Chart.js defaults once (font family, sizes, animation) */
export function applyChartDefaults(): void {
  if (defaultsApplied) return;
  defaultsApplied = true;
  ChartJS.defaults.font.family = "'Vazirmatn FD', 'Vazirmatn', system-ui, sans-serif";
  ChartJS.defaults.font.size = 11;
  ChartJS.defaults.animation = { duration: 250 };
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) ChartJS.defaults.animation = false;
}

/** Base options for cartesian charts; merge feature specifics on top */
export function baseChartOptions(opts: {
  formatY?: (v: number) => string;
  formatTooltip?: (v: number, label?: string) => string;
  legend?: boolean;
  maxXTicks?: number;
} = {}): ChartOptions<'line' | 'bar'> {
  applyChartDefaults();
  const axis = cssColor('chart-axis');
  const grid = cssColor('chart-grid');
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: opts.legend
        ? { position: 'bottom', align: 'start', rtl: true, labels: { color: axis, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'rectRounded', font: { size: 12 } } }
        : { display: false },
      tooltip: {
        rtl: true,
        textDirection: 'rtl',
        backgroundColor: cssColor('ink'),
        titleColor: cssColor('card'),
        bodyColor: cssColor('card'),
        padding: 10,
        cornerRadius: 8,
        displayColors: !!opts.legend,
        titleFont: { size: 12, weight: 600 },
        bodyFont: { size: 12 },
        callbacks: opts.formatTooltip
          ? {
              label: (c) => ` ${c.dataset.label ? c.dataset.label + ': ' : ''}${opts.formatTooltip!(c.parsed.y as number, c.dataset.label)}`
            }
          : undefined
      }
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: grid },
        ticks: { color: axis, maxTicksLimit: opts.maxXTicks ?? 6, maxRotation: 0, font: { size: 11 } }
      },
      y: {
        position: 'right',
        grid: { color: grid },
        border: { display: false },
        ticks: {
          color: axis,
          maxTicksLimit: 5,
          font: { size: 11 },
          callback: opts.formatY ? (v) => opts.formatY!(Number(v)) : undefined
        }
      }
    }
  } as ChartOptions<'line' | 'bar'>;
}

/** Compact USD for axes: $1.2K · $3.4M */
export function axisUsd(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  // محور: عدد فارسی فشرده بدون «$» (واحد «دلار» در عنوان/راهنمای نمودار)
  return a >= 1e3 ? `${s}${fmtCompactFa(a)}` : `${s}${toFaDigits(a.toFixed(a < 10 ? 2 : 0))}`;
}

/** نمودارک روند قیمت (SVG درون‌خطی) — کمتر از دو نقطه → خط‌چین خنثی */
import { useId } from 'react';
import { trendOf } from './ChangeCell';

export function Sparkline({ values, width = 96, height = 32, className }: { values: number[]; width?: number; height?: number; className?: string }) {
  const id = useId();
  if (values.length < 2) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
        <line x1={2} y1={height / 2} x2={width - 2} y2={height / 2} stroke="rgb(var(--c-divider-strong))" strokeWidth={1.5} strokeDasharray="3 4" />
      </svg>
    );
  }
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || hi * 0.01 || 1;
  const pad = 3;
  const pts = values.map((v, i) => [pad + (i / (values.length - 1)) * (width - pad * 2), height - pad - ((v - lo) / span) * (height - pad * 2)]);
  const t = trendOf(((values[values.length - 1] - values[0]) / values[0]) * 100);
  const color = t === 'up' ? 'var(--c-gain-text)' : t === 'down' ? 'var(--c-loss)' : 'var(--c-ink-muted)';
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} style={{ direction: 'ltr' }} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={`rgb(${color})`} stopOpacity={0.22} />
          <stop offset="1" stopColor={`rgb(${color})`} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`${pad},${height} ${line} ${width - pad},${height}`} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={`rgb(${color})`} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

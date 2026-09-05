/**
 * نمودار مینیاتوری (Sparkline) — روند TVL با SVG خالص
 */
import { useId } from 'react';
import type { TvlPoint } from '@/features/defi/domain/tvlFlow';

export function Sparkline({
  points,
  width = 96,
  height = 28,
  positive
}: {
  points: TvlPoint[];
  width?: number;
  height?: number;
  positive: boolean;
}) {
  const gid = useId().replace(/[:]/g, '');
  if (!points || points.length < 2) {
    return <div style={{ width, height }} className="text-center text-[8px] text-muted">—</div>;
  }

  const vals = points.map((p) => p.tvl);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = i * stepX;
      const y = height - 3 - ((p.tvl - min) / range) * (height - 6);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const color = positive ? 'rgb(var(--c-positive))' : 'rgb(var(--c-negative))';
  const last = points[points.length - 1];
  const first = points[0];
  const up = last.tvl >= first.tvl;

  return (
    // Responsive: SVG به عرض کانتینر مقصد مقیاس می‌شود (بدون تغییر داده/منطق)
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block h-7 w-full">
      <defs>
        <linearGradient id={`sg-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${path} L${width},${height} L0,${height} Z`}
        fill={`url(#sg-${gid})`}
        stroke="none"
      />
      <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle
        cx={width}
        cy={height - 3 - ((last.tvl - min) / range) * (height - 6)}
        r="2"
        fill={up ? 'rgb(var(--c-positive))' : 'rgb(var(--c-negative))'}
      />
    </svg>
  );
}

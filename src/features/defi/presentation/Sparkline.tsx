/**
 * Sparkline — TVL trend, pure SVG. Line only (no gradient fill): the change
 * badge next to it carries the number; the line carries the shape.
 * Time runs left → right (charts stay LTR in the RTL layout).
 */
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
  if (!points || points.length < 2) {
    return (
      <div style={{ width, height }} className="flex items-center justify-center text-2xs text-subtle">
        —
      </div>
    );
  }

  const vals = points.map((p) => p.tvl);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const y = (v: number) => height - 3 - ((v - min) / range) * (height - 6);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(1)},${y(p.tvl).toFixed(1)}`).join(' ');
  const color = positive ? 'rgb(var(--c-gain))' : 'rgb(var(--c-loss))';
  const last = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block h-7 w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={width} cy={y(last.tvl)} r="2" fill={color} />
    </svg>
  );
}

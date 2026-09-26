/**
 * VehicleChart — نمودار خطی قیمت تاریخی (تومان + دلار) — SVG داخلی بدون وابستگی
 *  - دو سری جدا با مقیاس خودشان (قیمت‌ها واحد متفاوت دارند)
 *  - نقاط = Snapshotهای تاریخی (فقط داده ثبت‌شده)
 */
import { useId } from 'react';
import { fmtTomanAmount, fmtUsdAmount } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

export interface ChartPoint {
  label: string;
  toman: number | null;
  usd: number | null;
}

function Series({
  points,
  get,
  color,
  height = 110
}: {
  points: ChartPoint[];
  get: (p: ChartPoint) => number | null;
  color: string;
  height?: number;
}) {
  const gid = useId().replace(/[:]/g, '');
  const values = points.map((p) => get(p));
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length === 0) return null;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const span = max - min || 1;
  const w = 320;
  const coords = points.map((p, i) => {
    const v = get(p);
    if (v === null) return null;
    const x = points.length > 1 ? (i / (points.length - 1)) * w : w / 2;
    const y = height - 6 - ((v - min) / span) * (height - 14);
    return { x, y, v };
  });
  const line = coords.filter(Boolean) as { x: number; y: number; v: number }[];
  if (line.length === 0) return null;
  const path = line.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const area = `${path} L${line[line.length - 1].x.toFixed(1)},${height} L${line[0].x.toFixed(1)},${height} Z`;
  const gid2 = `${gid}-${color.replace(/[^a-z]/gi, '')}`;

  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="h-full w-full" preserveAspectRatio="none" aria-hidden direction="ltr">
      <defs>
        <linearGradient id={gid2} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.14" />
          <stop offset="1" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid2})`} opacity="0.5" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {line.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r="2.6" fill={color} stroke="rgb(var(--c-card))" strokeWidth="1" />
      ))}
    </svg>
  );
}

export function VehicleChart({ points }: { points: ChartPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="rounded-field bg-surface-2 py-6 text-center text-sm text-muted">داده تاریخی کافی برای نمودار نیست</p>
    );
  }
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex items-center justify-between text-2xs font-semibold">
          <span className="flex items-center gap-1.5 text-muted">
            <span className="h-2 w-2 rounded-sm bg-chart-1" /> قیمت بازار (تومان)
          </span>
          {points[points.length - 1].toman !== null && (
            <span className="num-ltr text-ink">{fmtTomanAmount(points[points.length - 1].toman!)}</span>
          )}
        </div>
        <div className="h-[120px] w-full rounded-field border border-divider p-1" dir="ltr">
          <Series points={points} get={(p) => p.toman} color="rgb(var(--c-chart-1))" />
        </div>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between text-2xs font-semibold">
          <span className="flex items-center gap-1.5 text-muted">
            <span className="h-2 w-2 rounded-sm bg-chart-2" /> معادل دلاری (ثبت‌شده در لحظه)
          </span>
          {points[points.length - 1].usd !== null && (
            <span className="num-ltr text-ink">{fmtUsdAmount(points[points.length - 1].usd!)}</span>
          )}
        </div>
        <div className="h-[120px] w-full rounded-field border border-divider p-1" dir="ltr">
          <Series points={points} get={(p) => p.usd} color="rgb(var(--c-chart-2))" />
        </div>
      </div>
      {/* برچسب تاریخ‌ها */}
      <div dir="ltr" className={cn('flex justify-between text-2xs text-muted')}>
        {points.map((p, i) => (
          <span key={i} className="truncate px-0.5">
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

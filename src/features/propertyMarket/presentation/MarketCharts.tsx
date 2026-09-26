/** ============================================================
 * Property market — charts (inline SVG/CSS, no extra dependency)
 *
 *  1: current price by area (Toman/m²)     2: current price (USD/m²)
 *  3: USD scenario — current vs future     4: position vs the Ahvaz median
 * ⚠️ values come from the service layer — drawing only.
 * Bars grow from the inline start (right in RTL), next to the area name.
 * ============================================================ */
import { fmtIntLatin } from '@/shared/utils/formatters';

export interface BarDatum {
  label: string;
  value: number | null;
  color?: string;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / exp) * exp;
}

const Empty = () => <p className="rounded-field bg-surface-2 py-6 text-center text-sm text-muted">داده‌ای برای نمایش نیست</p>;

/** horizontal bars — suits Persian area names */
export function HBarChart({
  data,
  format,
  color = 'rgb(var(--c-chart-1))'
}: {
  data: BarDatum[];
  format: (v: number) => string;
  color?: string;
  height?: number;
}) {
  const rows = data.filter((d) => d.value !== null);
  if (rows.length === 0) return <Empty />;
  const max = niceMax(Math.max(...rows.map((d) => d.value as number)));
  return (
    <ul className="space-y-2">
      {rows.map((d) => (
        <li key={d.label} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-xs text-muted">{d.label}</span>
          <div className="relative h-3 flex-1 overflow-hidden rounded-sm bg-surface-2">
            <div className="absolute inset-y-0 start-0 rounded-sm" style={{ width: `${Math.max(2, ((d.value as number) / max) * 100)}%`, background: d.color ?? color }} />
          </div>
          <span className="num-ltr w-20 shrink-0 text-end text-xs font-semibold text-ink">{format(d.value as number)}</span>
        </li>
      ))}
    </ul>
  );
}

/** paired bars (current vs scenario future) */
export function PairedBarChart({
  data,
  format
}: {
  data: { label: string; current: number | null; future: number | null }[];
  format: (v: number) => string;
}) {
  const rows = data.filter((d) => d.current !== null || d.future !== null);
  if (rows.length === 0) return <Empty />;
  const max = niceMax(Math.max(...rows.flatMap((d) => [d.current ?? 0, d.future ?? 0])));
  const series = [
    ['current', 'rgb(var(--c-chart-1))', 'فعلی'],
    ['future', 'rgb(var(--c-chart-3))', 'سناریوی آینده']
  ] as const;
  return (
    <div className="space-y-3">
      <ul className="flex items-center gap-4 text-xs text-muted" aria-label="راهنما">
        {series.map(([k, c, l]) => (
          <li key={k} className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} /> {l}
          </li>
        ))}
      </ul>
      {rows.map((d) => (
        <div key={d.label}>
          <p className="mb-1 truncate text-xs text-muted">{d.label}</p>
          <div className="space-y-1">
            {series.map(([k, c, l]) => {
              const v = d[k];
              if (v === null) return null;
              return (
                <div key={k} className="flex items-center gap-2" aria-label={`${l}: ${format(v)}`}>
                  <div className="relative h-2 flex-1 overflow-hidden rounded-sm bg-surface-2">
                    <div className="absolute inset-y-0 start-0 rounded-sm" style={{ width: `${Math.max(2, (v / max) * 100)}%`, background: c }} />
                  </div>
                  <span className="num-ltr w-16 shrink-0 text-end text-xs font-semibold text-ink">{format(v)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** position vs the city median (%) — diverging bars around a centre line */
export function PositionChart({ data, cityLabel }: { data: { label: string; pct: number | null }[]; cityLabel: string }) {
  const rows = data.filter((d) => d.pct !== null);
  if (rows.length === 0) return <Empty />;
  const maxAbs = Math.max(10, ...rows.map((d) => Math.abs(d.pct as number)));
  return (
    <div className="space-y-2">
      <p className="mb-2 text-xs text-muted">
        خط وسط = میانه {cityLabel} · به سمت راست: گران‌تر از میانه · به سمت چپ: ارزان‌تر
      </p>
      {rows.map((d) => {
        const pct = d.pct as number;
        const w = Math.min(Math.abs(pct) / maxAbs, 1) * 46;
        const above = pct >= 0;
        return (
          <div key={d.label} className="flex items-center gap-3">
            <span className="w-24 shrink-0 truncate text-xs text-muted">{d.label}</span>
            <div className="relative h-3 flex-1 overflow-hidden rounded-sm bg-surface-2" dir="ltr">
              <div className="absolute inset-y-0 left-1/2 w-px bg-divider-strong" />
              <div
                className="absolute inset-y-0 rounded-sm"
                style={{
                  width: `${w}%`,
                  left: above ? '50%' : `${50 - w}%`,
                  background: above ? 'rgb(var(--c-chart-2))' : 'rgb(var(--c-chart-3))'
                }}
              />
            </div>
            <span className="num-ltr w-14 shrink-0 text-end text-xs font-semibold text-ink">
              {pct > 0 ? '+' : ''}
              {fmtIntLatin(Math.round(pct))}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** trend of the city median across snapshots (inline SVG line) */
export function TrendChart({
  points,
  format
}: {
  points: { ts: number; label: string; value: number }[];
  format: (v: number) => string;
}) {
  if (points.length < 2) {
    return <p className="rounded-field bg-surface-2 py-6 text-center text-sm text-muted">برای روند حداقل دو Snapshot لازم است</p>;
  }
  const W = 600;
  const H = 160;
  const pad = 8;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || hi * 0.1 || 1;
  const t0 = points[0].ts;
  const tSpan = points[points.length - 1].ts - t0 || 1;
  const xy = points.map((p) => [
    pad + ((p.ts - t0) / tSpan) * (W - pad * 2),
    H - pad - ((p.value - lo) / span) * (H - pad * 2)
  ]);
  const first = points[0];
  const last = points[points.length - 1];
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" style={{ direction: 'ltr' }} role="img" aria-label={`روند میانه از ${format(first.value)} تا ${format(last.value)}`}>
        <polyline
          fill="none"
          stroke="rgb(var(--c-chart-1))"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points={xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
        />
        {xy.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={3.5} fill="rgb(var(--c-chart-1))">
            <title>{`${points[i].label}: ${format(points[i].value)}`}</title>
          </circle>
        ))}
      </svg>
      <figcaption dir="ltr" className="mt-2 flex justify-between text-xs text-muted">
        <span dir="rtl">{first.label} · <span className="font-semibold text-ink">{format(first.value)}</span></span>
        <span dir="rtl">{last.label} · <span className="font-semibold text-ink">{format(last.value)}</span></span>
      </figcaption>
    </figure>
  );
}

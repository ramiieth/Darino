/** ============================================================
 * Property market — trend chart (inline SVG, no extra dependency)
 * ⚠️ values come from the service layer — drawing only.
 * ============================================================ */

/** trend of one price across snapshots (inline SVG line) */
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
      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" style={{ direction: 'ltr' }} role="img" aria-label={`روند از ${format(first.value)} تا ${format(last.value)}`}>
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

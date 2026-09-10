/** ============================================================
 * Property Market — نمودارها (SVG داخلی — سبک، بدون وابستگی اضافی)
 *
 *  Chart 1: قیمت فعلی مناطق (تومان/متر)
 *  Chart 2: قیمت فعلی مناطق (دلار/متر)
 *  Chart 3: سناریوی دلار — فعلی در مقابل آینده
 *  Chart 4: موقعیت نسبی مناطق نسبت به میانه اهواز
 * ⚠️ همه مقادیر از لایه سرویس می‌آیند — اینجا فقط رسم است.
 * ============================================================ */
import { fmtIntLatin } from '@/shared/utils/formatters';

export interface BarDatum {
  label: string;
  value: number | null;
  /** رنگ اختیاری (برای نمودار موقعیت) */
  color?: string;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / exp) * exp;
}

/** نمودار میله‌ای افقی — مناسب نام محله فارسی (راست‌به‌چپ) */
export function HBarChart({
  data,
  format,
  color = 'rgb(var(--c-accent))',
  height = 22
}: {
  data: BarDatum[];
  format: (v: number) => string;
  color?: string;
  height?: number;
}) {
  const rows = data.filter((d) => d.value !== null);
  if (rows.length === 0) {
    return <p className="py-6 text-center text-[10px] font-bold text-muted">داده‌ای برای نمایش نیست</p>;
  }
  const max = niceMax(Math.max(...rows.map((d) => d.value as number)));
  return (
    <div className="space-y-1.5">
      {rows.map((d) => {
        const pct = Math.max(2, ((d.value as number) / max) * 100);
        return (
          <div key={d.label} className="flex items-center gap-2">
            <span className="w-24 shrink-0 truncate text-right text-[9px] font-bold text-muted">{d.label}</span>
            <div className="relative h-[14px] flex-1 overflow-hidden rounded-md bg-surface-2/60" style={{ height }}>
              <div
                className="absolute inset-y-0 right-0 rounded-md"
                style={{ width: `${pct}%`, background: d.color ?? color, opacity: 0.85 }}
              />
            </div>
            <span className="num-ltr w-20 shrink-0 text-left text-[9px] font-extrabold text-ink">
              {format(d.value as number)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** نمودار میله‌ای دوتایی (فعلی در مقابل آینده) — سناریوی دلار */
export function PairedBarChart({
  data,
  format
}: {
  data: { label: string; current: number | null; future: number | null }[];
  format: (v: number) => string;
}) {
  const rows = data.filter((d) => d.current !== null || d.future !== null);
  if (rows.length === 0) {
    return <p className="py-6 text-center text-[10px] font-bold text-muted">داده‌ای برای نمایش نیست</p>;
  }
  const max = niceMax(Math.max(...rows.flatMap((d) => [d.current ?? 0, d.future ?? 0])));
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-3 text-[8px] font-bold text-muted">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-accent" /> فعلی
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-indigo-400" /> سناریوی آینده
        </span>
      </div>
      {rows.map((d) => (
        <div key={d.label}>
          <p className="mb-0.5 truncate text-[9px] font-bold text-muted">{d.label}</p>
          <div className="space-y-1">
            {([
              ['current', 'rgb(var(--c-accent))'],
              ['future', 'rgb(129 140 248)']
            ] as const).map(([k, c]) => {
              const v = d[k];
              if (v === null) return null;
              return (
                <div key={k} className="flex items-center gap-2">
                  <div className="relative h-[9px] flex-1 overflow-hidden rounded bg-surface-2/60">
                    <div
                      className="absolute inset-y-0 right-0 rounded"
                      style={{ width: `${Math.max(2, (v / max) * 100)}%`, background: c, opacity: 0.9 }}
                    />
                  </div>
                  <span className="num-ltr w-16 shrink-0 text-left text-[8px] font-extrabold text-ink">
                    {format(v)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** نمودار موقعیت نسبی — انحراف از میانه اهواز (٪) با خط صفر */
export function PositionChart({
  data,
  cityLabel
}: {
  data: { label: string; pct: number | null }[];
  cityLabel: string;
}) {
  const rows = data.filter((d) => d.pct !== null);
  if (rows.length === 0) {
    return <p className="py-6 text-center text-[10px] font-bold text-muted">داده‌ای برای نمایش نیست</p>;
  }
  const maxAbs = Math.max(10, ...rows.map((d) => Math.abs(d.pct as number)));
  return (
    <div className="space-y-1.5">
      <p className="mb-2 text-[8px] font-bold text-muted">
        خط وسط = میانه {cityLabel} — میله راست‌تر یعنی گران‌تر از میانه
      </p>
      {rows.map((d) => {
        const pct = d.pct as number;
        const half = 50;
        const widthPct = Math.min(Math.abs(pct) / maxAbs, 1) * (half - 4);
        const positive = pct >= 0;
        return (
          <div key={d.label} className="flex items-center gap-2">
            <span className="w-24 shrink-0 truncate text-right text-[9px] font-bold text-muted">{d.label}</span>
            <div className="relative h-[13px] flex-1 overflow-hidden rounded-md bg-surface-2/60">
              <div className="absolute inset-y-0 left-1/2 w-px bg-line/40" />
              <div
                className="absolute inset-y-0 rounded-md"
                style={{
                  width: `${widthPct}%`,
                  right: positive ? 'auto' : undefined,
                  left: positive ? '50%' : `${half - widthPct}%`,
                  background: positive ? 'rgb(var(--c-accent))' : 'rgb(52 211 153)',
                  opacity: 0.85
                }}
              />
            </div>
            <span className={`num-ltr w-14 shrink-0 text-left text-[9px] font-extrabold ${pct >= 0 ? 'text-ink' : 'text-negative'}`}>
              {pct >= 0 ? '+' : ''}{fmtIntLatin(Math.round(pct))}٪
            </span>
          </div>
        );
      })}
    </div>
  );
}

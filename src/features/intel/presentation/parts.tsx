/**
 * اجزای بصری مشترک هاب اطلاعات — حکم امنیت، نوار لانگ/شورت، ستون‌های مثبت/منفی، نردبان لیکوئید
 * نمودارها در چیدمان RTL هم LTR می‌مانند (زمان و قیمت از چپ به راست).
 */
import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { Badge, type Tone } from '@/shared/components/ui/Badge';
import { cn } from '@/shared/lib/cn';
import { fmtCompactFa, toFaDigits } from '@/shared/utils/formatters';
import type { TokenSafety } from '../domain/tokenSafety';

export const VERDICT: Record<TokenSafety['verdict'], { label: string; short: string; tone: Tone }> = {
  danger: { label: 'خطر', short: 'خطر', tone: 'loss' },
  caution: { label: 'احتیاط', short: 'احتیاط', tone: 'warn' },
  clear: { label: 'خطر شناخته‌شده‌ای پیدا نشد', short: 'بدون خطر شناخته‌شده', tone: 'gain' },
  unknown: { label: 'نامشخص', short: 'نامشخص', tone: 'neutral' }
};

export function VerdictBadge({ verdict, short = true }: { verdict: TokenSafety['verdict']; short?: boolean }) {
  const v = VERDICT[verdict];
  return <Badge tone={v.tone}>{short ? v.short : v.label}</Badge>;
}

/** دلار فشرده یک‌خطی برای ستون‌های باریک: «+۱٫۲ هزار دلار» با «دلار» کوچک مثل UsdText — علامت و عدد LTR جدا می‌شوند تا جابه‌جا نشوند */
export function UsdShort({ value, signed = false, className }: { value: number | null | undefined; signed?: boolean; className?: string }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <span className={className}>—</span>;
  const [num, ...scale] = fmtCompactFa(Math.abs(value)).split(' ');
  const sign = value < 0 ? '−' : signed && value > 0 ? '+' : '';
  return (
    <span dir="rtl" className={cn('persian-amount inline-flex items-baseline gap-1 whitespace-nowrap', className)}>
      <bdi dir="ltr" className="num-ltr">{sign}{num}</bdi>
      {scale.length > 0 && <span>{scale.join(' ')}</span>}
      <span className="text-[0.62em] font-medium opacity-70">دلار</span>
    </span>
  );
}

export function fmtPrice(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const digits = v >= 1000 ? 0 : v >= 1 ? 2 : v >= 0.01 ? 4 : 8;
  return toFaDigits(v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0, ...(v < 0.01 ? { maximumSignificantDigits: 4 } : {}) }));
}

/** فاصلهٔ قیمت لیکوئید از قیمت فعلی برای متن: « (۱۲٪)» یا « (دور)» وقتی بیش از ۱۰۰٪ است */
export function liqDistance(liq: number | null, mark: number | null): string {
  if (!liq || !mark) return '';
  const d = Math.abs(((liq - mark) / mark) * 100);
  return d > 100 ? ' (دور)' : ` (${toFaDigits(Math.round(d))}٪)`;
}

export function fmtAge(ts: number | null, now = Date.now()): string {
  if (!ts) return '—';
  const h = (now - ts) / 3_600_000;
  if (h < 1) return `${toFaDigits(Math.max(1, Math.round(h * 60)))} دقیقه`;
  if (h < 48) return `${toFaDigits(Math.round(h))} ساعت`;
  const d = h / 24;
  return d < 60 ? `${toFaDigits(Math.round(d))} روز` : `${toFaDigits(Math.round(d / 30))} ماه`;
}

/** نوار سهم لانگ (سبز) در برابر شورت (قرمز) */
export function SplitBar({ long, short, className, labels = true }: { long: number; short: number; className?: string; labels?: boolean }) {
  const total = long + short;
  const pct = total > 0 ? (long / total) * 100 : 50;
  return (
    <div className={cn('min-w-0', className)}>
      <div dir="ltr" className="flex h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`لانگ ${Math.round(pct)}٪، شورت ${Math.round(100 - pct)}٪`}>
        <span className="h-full bg-gain" style={{ width: `${pct}%` }} />
        <span className="h-full bg-loss" style={{ width: `${100 - pct}%` }} />
      </div>
      {labels && (
        <div className="mt-1.5 flex justify-between text-2xs font-semibold">
          <span className="text-positive">لانگ {toFaDigits(Math.round(pct))}٪</span>
          <span className="text-negative">شورت {toFaDigits(Math.round(100 - pct))}٪</span>
        </div>
      )}
    </div>
  );
}

/** ستون‌های مثبت/منفی حول صفر (سود ماهانه، فاندینگ روزانه) */
export function SignedBars({ values, labels, height = 'h-24', className, ariaLabel }: { values: number[]; labels?: string[]; height?: string; className?: string; ariaLabel: string }) {
  if (!values.length) return null;
  // خط صفر به نسبت دامنهٔ مثبت و منفی جابه‌جا می‌شود (وقتی تقریباً همه مثبت‌اند، فضا هدر نمی‌رود)
  const up = Math.max(0, ...values);
  const down = Math.max(0, ...values.map((v) => -v));
  const span = up + down || 1e-12;
  const zero = 2 + (up / span) * 36;
  const w = 100 / values.length;
  return (
    <figure className={className} aria-label={ariaLabel}>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className={cn('block w-full', height)} aria-hidden>
        <line x1="0" x2="100" y1={zero} y2={zero} stroke="rgb(var(--c-divider))" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
        {values.map((v, i) => {
          const h = (Math.abs(v) / span) * 36;
          return <rect key={i} x={i * w + w * 0.15} width={w * 0.7} y={v >= 0 ? zero - h : zero} height={Math.max(h, 0.3)} rx="0.5" fill={v >= 0 ? 'rgb(var(--c-gain))' : 'rgb(var(--c-loss))'} />;
        })}
      </svg>
      {labels && (
        <div dir="ltr" className="mt-1 flex text-[10px] text-subtle">
          {labels.map((l, i) => (
            <span key={i} className="flex-1 whitespace-nowrap text-center">{l}</span>
          ))}
        </div>
      )}
    </figure>
  );
}

/**
 * نردبان لیکوئید: محور افقی ±range٪ حول قیمت فعلی؛ هر نقطه یک پوزیشن (اندازه ∝ دلار).
 * لیکوئید لانگ‌ها زیر قیمت (چپ)، شورت‌ها بالای قیمت (راست) — جایی که آبشار لیکوئید ممکن است شروع شود.
 */
export function LiqLadder({ levels, range = 25 }: { levels: { distancePct: number | null; usd: number; side: 'long' | 'short' }[]; range?: number }) {
  const shown = levels.filter((l) => l.distancePct !== null && Math.abs(l.distancePct) <= range);
  const max = Math.max(...shown.map((l) => l.usd), 1);
  return (
    <figure aria-label="فاصلهٔ قیمت لیکوئید پوزیشن‌ها از قیمت فعلی">
      <div dir="ltr" className="relative h-12 rounded-field bg-surface-2/70">
        <span className="absolute inset-y-1 left-1/2 w-px bg-ink/40" aria-hidden />
        {shown.map((l, i) => {
          const size = 6 + Math.sqrt(l.usd / max) * 14;
          return (
            <span
              key={i}
              className={cn('absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 ring-1 ring-card', l.side === 'long' ? 'bg-gain' : 'bg-loss')}
              style={{ left: `${50 + (l.distancePct! / range) * 48}%`, width: size, height: size }}
              title={`${l.side === 'long' ? 'لانگ' : 'شورت'} · ${Math.round(l.distancePct!)}٪`}
            />
          );
        })}
      </div>
      <div dir="ltr" className="mt-1 flex justify-between text-[10px] text-subtle">
        <span>{toFaDigits(-range)}٪</span>
        <span>قیمت فعلی</span>
        <span>+{toFaDigits(range)}٪</span>
      </div>
      {shown.length < levels.length && <figcaption className="mt-1 text-2xs text-subtle">{toFaDigits(levels.length - shown.length)} لیکوئید دیگر دورتر از ±{toFaDigits(range)}٪</figcaption>}
    </figure>
  );
}

export function LinkPill({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="inline-flex h-9 items-center gap-1.5 rounded-field border border-divider px-3 text-xs font-semibold text-ink transition-colors hover:bg-surface-2">
      <ExternalLink className="h-3.5 w-3.5 text-subtle" />
      {children}
    </a>
  );
}

/** ردیف «برچسب ··· مقدار» کوچک برای کارت‌ها */
export function Stat({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="truncate text-2xs font-semibold text-muted">{label}</p>
      <div className="mt-0.5 truncate text-sm font-bold text-ink">{children}</div>
    </div>
  );
}

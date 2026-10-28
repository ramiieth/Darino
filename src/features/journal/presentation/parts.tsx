/**
 * قطعه‌های مشترک ژورنال: اصطلاح آموزشی (زیرخط نقطه‌چین)، نشان حکم و کلاس، نوار گلوله‌ای معیار، ردیف کارنامه، انتخاب تگ
 * رنگ فقط معنا دارد: سبز در حد استاندارد/سود، کهربایی مرزی، قرمز زیر استاندارد/زیان، خاکستری ارزیابی‌نشده یا نامربوط.
 */
import { useState, type ReactNode } from 'react';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Badge, type Tone } from '@/shared/components/ui/Badge';
import { cn } from '@/shared/lib/cn';
import { toFaDigits } from '@/shared/utils/formatters';
import { GLOSSARY } from '../domain/glossary';
import { CLASS_FA, VERDICT_FA, type MetricClass, type ScoreRow, type Verdict } from '../domain/scorecard';

export function usd(v: number | null | undefined, signed = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const s = a.toLocaleString('en-US', { maximumFractionDigits: a >= 1000 ? 0 : 2, minimumFractionDigits: a >= 1000 ? 0 : a < 10 ? 2 : 0 });
  return `${v < 0 ? '−' : signed && v > 0 ? '+' : ''}$${s}`;
}
export const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${toFaDigits(v.toFixed(d))}٪`);
export const fa = (v: number | null | undefined, d = 0) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : toFaDigits(v.toLocaleString('en-US', { maximumFractionDigits: d })));
export const pnlTone = (v: number | null | undefined) => (v === null || v === undefined || v === 0 ? 'text-muted' : v > 0 ? 'text-positive' : 'text-negative');

export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  const m = ms / 60_000;
  if (m < 60) return `${fa(m)} دقیقه`;
  if (m < 48 * 60) return `${fa(m / 60, 1)} ساعت`;
  return `${fa(m / 1440, 1)} روز`;
}

export function faDateTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  try {
    return new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
  } catch {
    return '';
  }
}
export function faDate(ts: number | null | undefined): string {
  if (!ts) return '—';
  try {
    return new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(ts));
  } catch {
    return '';
  }
}

/**
 * اصطلاح آموزشی: لمس/کلیک → «چیست»، «عدد شما»، «چه کنید» (و «چرا مهم است» اگر ظریف است)
 */
export function Term({ id, yours, action, children }: { id: string; yours?: ReactNode; action?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const def = GLOSSARY[id];
  if (!def) return <>{children}</>;
  return (
    <span className="relative inline">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="cursor-help border-b border-dotted border-current text-inherit">
        {children ?? def.term}
      </button>
      {open && (
        <span role="note" className="mt-2 block rounded-control border border-divider bg-surface-2 p-3 text-xs font-normal leading-6 text-ink">
          <span className="block font-semibold">{def.term}</span>
          <span className="block text-muted">{def.what}</span>
          {yours && <span className="block">عدد شما: {yours}</span>}
          {action && <span className="block text-accent">{action}</span>}
          {def.why && <span className="block text-subtle">چرا مهم است: {def.why}</span>}
        </span>
      )}
    </span>
  );
}

const VERDICT_TONE: Record<Verdict, Tone> = { meets: 'gain', borderline: 'warn', fails: 'loss', na: 'neutral', notApplicable: 'neutral' };
const VERDICT_ICON: Record<Verdict, string> = { meets: '✓', borderline: '~', fails: '✕', na: '○', notApplicable: '–' };

export function VerdictBadge({ v }: { v: Verdict }) {
  return <Badge tone={VERDICT_TONE[v]}><span aria-hidden>{VERDICT_ICON[v]}</span> {VERDICT_FA[v]}</Badge>;
}

const CLASS_STYLE: Record<MetricClass, string> = {
  performance: 'border-accent/40 text-accent',
  behaviour: 'border-chart-3/50 text-chart-3',
  confidence: 'border-divider-strong text-muted',
  context: 'border-dashed border-divider-strong text-subtle'
};
export function ClassBadge({ c }: { c: MetricClass }) {
  return <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold', CLASS_STYLE[c])}>{CLASS_FA[c]}</span>;
}

/** نوار گلوله‌ای: محدودهٔ حرفه‌ای سایه‌دار + نشانگر جای شما */
export function BulletBar({ band, verdict }: { band: NonNullable<ScoreRow['band']>; verdict: Verdict }) {
  const span = band.max - band.min || 1;
  const x = (v: number) => `${Math.max(0, Math.min(100, ((v - band.min) / span) * 100))}%`;
  const mark = band.mark;
  const color = verdict === 'meets' ? 'bg-gain' : verdict === 'borderline' ? 'bg-warn' : verdict === 'fails' ? 'bg-negative' : 'bg-subtle';
  return (
    <div className="relative mt-2 h-2.5 w-full rounded-full bg-surface-2" dir="ltr" aria-hidden>
      <div className="absolute inset-y-0 rounded-full bg-gain/20" style={{ left: x(band.goodFrom), width: `calc(${x(band.goodTo)} - ${x(band.goodFrom)})` }} />
      {mark !== null && <div className={cn('absolute -top-1 w-1.5 -translate-x-1/2 rounded-full', color)} style={{ left: x(mark), height: 18 }} />}
    </div>
  );
}

/** ردیف کارنامه: عنوان ساده + نام فنی، عدد، معیار، حکم، کلاس، جملهٔ اقدام (همیشه پیدا)، جزئیات (یک لایه) */
export function ScoreRowView({ row }: { row: ScoreRow }) {
  return (
    <div className="border-b border-divider py-4 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{row.title}</p>
          <p className="text-xs text-subtle">{row.term}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <ClassBadge c={row.cls} />
          <VerdictBadge v={row.verdict} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="num-ltr text-lg font-bold text-ink">{row.display}</span>
        <span className="text-xs text-muted">معیار: {row.benchmark}</span>
        {row.impact !== null && row.impact > 0 && <span className="text-xs font-semibold text-negative">هزینه ≈ {usd(row.impact)}</span>}
      </div>
      {row.band && row.verdict !== 'na' && row.verdict !== 'notApplicable' && <BulletBar band={row.band} verdict={row.verdict} />}
      <p className="mt-2 text-xs leading-6 text-accent">{row.action}</p>
      {row.note && <p className="text-xs leading-6 text-muted">{row.note}</p>}
      <Disclosure summary="روش محاسبه و چرایی این معیار" className="mt-1">
        <p className="text-xs leading-6 text-muted">{row.formula}</p>
        {GLOSSARY[row.id]?.why && <p className="text-xs leading-6 text-subtle">{GLOSSARY[row.id]!.why}</p>}
      </Disclosure>
    </div>
  );
}

/** کارت نمودار با چهار جزء اجباری: عنوان ساده، نام فنی، نشان کلاس، کپشن عددی */
export function ChartBlock({ title, term, cls, caption, children, howTo }: { title: string; term: string; cls: MetricClass; caption: ReactNode; children: ReactNode; howTo?: string }) {
  return (
    <figure className="min-w-0 rounded-card border border-divider bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-ink">{title}</h3>
          <p className="text-xs text-subtle">{term}</p>
        </div>
        <ClassBadge c={cls} />
      </div>
      <div className="mt-3">{children}</div>
      <figcaption className="mt-3 text-xs leading-6 text-ink">{caption}</figcaption>
      {howTo && (
        <Disclosure summary="چطور این نمودار را بخوانم">
          <p className="text-xs leading-6 text-muted">{howTo}</p>
        </Disclosure>
      )}
    </figure>
  );
}

export function TagPicker({ tags, value, onChange, tone = 'neutral', label }: { tags: readonly string[]; value: readonly string[]; onChange: (v: string[]) => void; tone?: 'gain' | 'loss' | 'neutral'; label: string }) {
  const on = (t: string) => value.includes(t);
  const active = tone === 'gain' ? 'border-gain bg-gain/10 text-positive' : tone === 'loss' ? 'border-negative bg-negative/10 text-negative' : 'border-accent bg-accent-soft text-accent';
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={on(t)}
          onClick={() => onChange(on(t) ? value.filter((x) => x !== t) : [...value, t])}
          className={cn('rounded-full border px-2.5 py-1 text-xs transition-colors', on(t) ? active : 'border-divider text-muted hover:border-divider-strong')}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

/** ورودی عدد آزاد (رشته نگه داشته می‌شود تا تایپ نیمه‌کاره خراب نشود) */
export const parseNum = (s: string): number | null => {
  const n = Number(s.replace(/[٬,\s]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
  return s.trim() !== '' && Number.isFinite(n) ? n : null;
};

/**
 * مسیر سرمایه — مشترک بین «دلتا نوترال» و «سود واقعی دلتا»
 * ۱) تخصیص: سرمایهٔ مبنا → مارجین هر صرافی → سرمایهٔ آزاد (ارزش اسمی جدا، چون پول پرداختی نیست)
 * ۲) سود و زیان: ناخالص قیمت → فاندینگ → هزینه‌ها → سود خالص
 * ۳) پس از بستن: سرمایهٔ نهایی و اختلاف با سرمایهٔ اولیه
 * فقط نمایش؛ اعداد از domain (deltaLedger) می‌آیند و این‌جا دوباره جمع زده نمی‌شوند.
 */
import type { ReactNode } from 'react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { Badge, type Tone } from '@/shared/components/ui/Badge';
import { toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

export type SourceKind = 'live' | 'input' | 'estimate' | 'scenario' | 'assumed' | 'history';

const SOURCE: Record<SourceKind, { label: string; tone: Tone }> = {
  live: { label: 'زنده', tone: 'info' },
  history: { label: 'تاریخچه', tone: 'info' },
  input: { label: 'ورودی شما', tone: 'neutral' },
  estimate: { label: 'تخمینی', tone: 'neutral' },
  scenario: { label: 'سناریو', tone: 'warn' },
  assumed: { label: 'فرضی', tone: 'warn' }
};

/** برچسب کوچک منبع عدد — رنگ همیشه با متن همراه است */
export function SourceTag({ kind, className }: { kind: SourceKind; className?: string }) {
  return (
    <Badge tone={SOURCE[kind].tone} className={cn('text-2xs', className)}>
      {SOURCE[kind].label}
    </Badge>
  );
}

export interface FlowLine {
  label: ReactNode;
  /** دلار؛ null = نامعلوم (صفر فرض نمی‌شود) */
  value: number | null;
  /** money = خنثی · pnl = با علامت، سبز/قرمز · cost = مقدار مثبت که منفی نمایش داده می‌شود */
  as: 'money' | 'pnl' | 'cost';
  source?: SourceKind;
  hint?: ReactNode;
  /** سطر جمع — خط جداکننده و متن پررنگ */
  total?: boolean;
  /** سطر جزء — تورفته و کم‌رنگ */
  sub?: boolean;
}

function FlowValue({ line }: { line: FlowLine }) {
  if (line.as === 'cost') {
    return <MoneyValue value={line.value === null ? null : -line.value} tone={line.value ? 'loss' : 'none'} digits={2} />;
  }
  if (line.as === 'pnl') return <MoneyValue value={line.value} signed tone="auto" digits={2} />;
  return <MoneyValue value={line.value} digits={2} />;
}

function FlowStep({ step, title, lines }: { step: number; title: string; lines: FlowLine[] }) {
  return (
    <div>
      <h4 className="mb-1 flex items-center gap-2 text-xs font-bold text-muted">
        <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full bg-surface-2 text-2xs text-ink">
          {toFaDigits(step)}
        </span>
        {title}
      </h4>
      <dl className="divide-y divide-divider">
        {lines.map((l, i) => (
          <div key={i} className={cn('flex items-baseline justify-between gap-3 py-2', l.total && 'border-t border-divider-strong', l.sub && 'ps-4')}>
            <dt className={cn('min-w-0 text-sm', l.total ? 'font-bold text-ink' : l.sub ? 'text-xs text-muted' : 'text-muted')}>
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {l.label}
                {l.source && <SourceTag kind={l.source} />}
              </span>
              {l.hint && <span className="block text-2xs leading-5 text-subtle">{l.hint}</span>}
            </dt>
            <dd className={cn('shrink-0 text-end [overflow-wrap:anywhere]', l.total ? 'text-base font-bold text-ink' : l.sub ? 'text-xs font-semibold text-ink' : 'text-sm font-semibold text-ink')}>
              <FlowValue line={l} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** نوار سهم مارجین از سرمایهٔ مبنا (بدون مارجین = نوار نمایش داده نمی‌شود) */
function AllocationBar({ base, margin }: { base: number; margin: number }) {
  if (!(base > 0) || !(margin > 0)) return null;
  const used = Math.min(100, (margin / base) * 100);
  return (
    <div className="mt-2">
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${toFaDigits(used.toFixed(0))}٪ سرمایه به‌عنوان مارجین قفل است`}>
        <span className="h-full bg-accent" style={{ width: `${used}%` }} />
      </div>
      <p className="mt-1 flex justify-between text-2xs text-subtle">
        <span>مارجین {toFaDigits(used.toFixed(0))}٪</span>
        <span>آزاد {toFaDigits((100 - used).toFixed(0))}٪</span>
      </p>
    </div>
  );
}

export function CapitalFlow({
  allocation,
  pnl,
  settlement,
  base,
  margin,
  footnote
}: {
  allocation: FlowLine[];
  pnl: FlowLine[];
  settlement: FlowLine[];
  base: number;
  margin: number;
  footnote?: ReactNode;
}) {
  return (
    <Surface as="section" aria-labelledby="capital-flow" className="space-y-5 p-4 md:p-5">
      <div>
        <h3 id="capital-flow" className="text-sm font-bold text-ink">
          مسیر سرمایه
        </h3>
        <p className="mt-0.5 text-2xs leading-5 text-subtle">مارجین وثیقه است و پس از بستن برمی‌گردد؛ ارزش اسمی اندازهٔ در معرض بازار است، نه پول پرداختی.</p>
      </div>
      <div>
        <FlowStep step={1} title="تخصیص سرمایه" lines={allocation} />
        <AllocationBar base={base} margin={margin} />
      </div>
      <FlowStep step={2} title="سود و زیان تا بستن" lines={pnl} />
      <FlowStep step={3} title="پس از بستن هر دو طرف" lines={settlement} />
      {footnote && <p className="text-2xs leading-5 text-subtle">{footnote}</p>}
    </Surface>
  );
}

/** اجزای کوچک مشترک صفحهٔ عملکرد و مقایسه سرمایه */
import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { Badge } from '@/shared/components/ui/Badge';
import { cn } from '@/shared/lib/cn';
import { fmtCompactFa, fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { formatGregorianIso, formatJalali } from '@/shared/utils/jalali';

/** درصد از کسر (0.12 → +۱۲٪) */
export function Pct({ v, digits, tone = 'auto', className }: { v: number | null | undefined; digits?: number; tone?: 'auto' | 'none'; className?: string }) {
  return <PercentValue value={v === null || v === undefined ? null : v * 100} digits={digits} tone={tone} className={className} />;
}

export function Usd({ v, signed, compact, tone, className }: { v: number | null | undefined; signed?: boolean; compact?: boolean; tone?: 'auto' | 'none'; className?: string }) {
  return <MoneyValue value={v} signed={signed} compact={compact} tone={tone ?? (signed ? 'auto' : 'none')} digits={compact ? undefined : 0} className={className} />;
}

/** مبلغ تومانی فشرده: «۵٫۴ میلیارد تومان» */
export function Toman({ v, signed, className }: { v: number | null | undefined; signed?: boolean; className?: string }) {
  if (v === null || v === undefined || !Number.isFinite(v)) return <span className={cn('text-subtle', className)}>—</span>;
  const tone = signed ? (v > 0 ? 'text-positive' : v < 0 ? 'text-negative' : '') : '';
  return (
    <span className={cn(tone, className)}>
      {signed && v > 0 ? '+' : ''}
      {fmtCompactFa(v)} تومان
    </span>
  );
}

export const faInt = (v: number) => toFaDigits(Math.round(v).toLocaleString('en-US'));

export function DualDate({ ts, className }: { ts: number; className?: string }) {
  return (
    <span className={cn('inline-flex flex-col leading-5', className)}>
      <span className="font-semibold text-ink">{formatJalali(ts)}</span>
      <span className="num-ltr text-2xs text-subtle">{formatGregorianIso(ts)}</span>
    </span>
  );
}

export const shortDate = (ts: number) => `${formatJalali(ts)} (${formatGregorianIso(ts)})`;

export function SourceLine({ source, url, updatedAt, className }: { source?: string; url?: string; updatedAt?: number | null; className?: string }) {
  if (!source) return null;
  return (
    <p className={cn('flex flex-wrap items-center gap-x-1.5 text-2xs leading-5 text-subtle', className)}>
      <span>منبع: {source}</span>
      {url && (
        <a href={url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-accent hover:underline" aria-label={`باز کردن منبع ${source}`}>
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
      {updatedAt ? <span>· به‌روزرسانی {fmtRelativeAge(updatedAt)}</span> : null}
    </p>
  );
}

export function NoData({ children }: { children?: ReactNode }) {
  return <Badge tone="neutral">{children ?? 'داده کافی موجود نیست'}</Badge>;
}

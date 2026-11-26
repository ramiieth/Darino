/** اجزای کوچک مشترک صفحهٔ عملکرد و مقایسه سرمایه */
import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';
import { cn } from '@/shared/lib/cn';
import { fmtCompactFa, fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { formatGregorianIso, formatJalali } from '@/shared/utils/jalali';

/**
 * درصد از کسر (0.12 → +۱۲.۰۰٪ · -0.0355 → -۳.۵۵٪)
 * در جهت راست‌به‌چپ فارسی، علامت + / - دقیقاً پیش از عدد (سمت راست) و ٪ پس از عدد (سمت چپ) قرار می‌گیرد.
 */
export function Pct({
  v,
  digits = 2,
  tone = 'auto',
  className
}: {
  v: number | null | undefined;
  digits?: number;
  tone?: 'auto' | 'none';
  className?: string;
}) {
  if (v === null || v === undefined || !Number.isFinite(v)) {
    return <span className={cn('num-ltr text-subtle', className)}>—</span>;
  }
  const pct = v * 100;
  const abs = Math.abs(pct);
  const sign = pct > 0 ? '+' : pct < 0 ? '-' : '';
  const toneCls = tone === 'none' ? '' : pct > 0 ? 'text-positive' : pct < 0 ? 'text-negative' : '';
  const formatted = toFaDigits(
    abs.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  );
  return (
    <span dir="rtl" className={cn('inline-flex items-baseline whitespace-nowrap', toneCls, className)}>
      {sign && <span>{sign}</span>}
      <bdi dir="ltr" className="num-ltr">{formatted}</bdi>
      <span>٪</span>
    </span>
  );
}

/**
 * مبلغ دلاری با علامت پیش از عدد در جهت فارسی:
 *  -۱,۱۰۴ دلار / +۱,۱۰۴ دلار / -۱.۶ هزار دلار
 */
export function Usd({
  v,
  signed,
  compact,
  tone,
  className
}: {
  v: number | null | undefined;
  signed?: boolean;
  compact?: boolean;
  tone?: 'auto' | 'none';
  className?: string;
}) {
  if (v === null || v === undefined || !Number.isFinite(v)) {
    return <span className={cn('num-ltr text-subtle', className)}>—</span>;
  }
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : signed && v > 0 ? '+' : '';
  const effectiveTone = tone ?? (signed ? 'auto' : 'none');
  const toneCls = effectiveTone === 'none' ? '' : v > 0 ? 'text-positive' : v < 0 ? 'text-negative' : '';
  const body = compact ? fmtCompactFa(abs) : toFaDigits(Math.round(abs).toLocaleString('en-US'));
  const [number, ...scale] = body.split(' ');
  return (
    <span dir="rtl" className={cn('persian-amount inline-flex items-baseline gap-1 whitespace-nowrap', toneCls, className)}>
      <span className="inline-flex items-baseline">
        {sign && <span>{sign}</span>}
        <bdi dir="ltr" className="num-ltr">{number}</bdi>
      </span>
      {scale.length > 0 && <span className="text-[0.82em] font-medium">{scale.join(' ')}</span>}
      <span className="text-[0.65em] font-medium opacity-70">دلار</span>
    </span>
  );
}

/**
 * مبلغ تومانی فشرده با علامت پیش از عدد در جهت فارسی:
 *  -۴۱۸ میلیون تومان / +۵.۴ میلیارد تومان
 */
export function Toman({ v, signed, className }: { v: number | null | undefined; signed?: boolean; className?: string }) {
  if (v === null || v === undefined || !Number.isFinite(v)) {
    return <span className={cn('text-subtle', className)}>—</span>;
  }
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : signed && v > 0 ? '+' : '';
  const toneCls = signed ? (v > 0 ? 'text-positive' : v < 0 ? 'text-negative' : '') : '';
  const body = fmtCompactFa(abs);
  const [number, ...scale] = body.split(' ');
  return (
    <span dir="rtl" className={cn('persian-amount inline-flex items-baseline gap-1 whitespace-nowrap', toneCls, className)}>
      <span className="inline-flex items-baseline">
        {sign && <span>{sign}</span>}
        <bdi dir="ltr" className="num-ltr">{number}</bdi>
      </span>
      {scale.length > 0 && <span>{scale.join(' ')}</span>}
      <span>تومان</span>
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

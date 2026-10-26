/**
 * ردیف یک تریدر — جواب سه سؤال در یک نگاه:
 *   ارزش دنبال کردن دارد؟ (امتیاز ثبات) · چطور به آن رسیده؟ (بازده، ماه‌های سودده، افت) · الان چه دارد؟
 * همه از خلاصه و پوزیشن‌های کش‌شدهٔ سرور (بدون درخواست جدا از مرورگر برای هر ردیف)
 */
import type { ReactNode } from 'react';
import { Bell, Trash2 } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge, TONE_TEXT } from '@/shared/components/ui/Badge';
import { IconButton } from '@/shared/components/ui/Button';
import { MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { cn } from '@/shared/lib/cn';
import { toFaDigits } from '@/shared/utils/formatters';
import type { Candidate } from '../domain/candidates';
import { isSteady, type TraderSummary } from '../domain/summary';
import { qualityScore, scoreTone, type Book } from '../domain/quality';
import { UsdShort } from '@/features/intel/presentation/parts';
import { shortAddress } from './format';

const RING: Record<ReturnType<typeof scoreTone>, string> = {
  gain: 'border-gain/60',
  warn: 'border-warn/60',
  loss: 'border-negative/50',
  neutral: 'border-divider'
};

export function ScoreRing({ score, pending }: { score: number | null; pending?: boolean }) {
  const tone = scoreTone(score);
  return (
    <div className="flex w-14 shrink-0 flex-col items-center gap-1">
      <span className={cn('grid h-12 w-12 place-items-center rounded-full border-[3px] text-base font-extrabold', RING[tone], TONE_TEXT[tone])}>
        {score !== null ? toFaDigits(score) : pending ? <Skeleton className="h-4 w-6" /> : '—'}
      </span>
      <span className="text-[10px] font-semibold text-subtle">امتیاز ثبات</span>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-2xs text-muted">{label}</dt>
      <dd className="mt-0.5 whitespace-nowrap text-sm font-bold text-ink [&_.persian-amount]:flex-nowrap">{children}</dd>
    </div>
  );
}

/** «الان: لانگ BTC ۲ میلیون · شورت ETH · +۲» */
export function BookLine({ book }: { book: Book | undefined }) {
  if (!book || book.positions.length === 0) return <p className="text-xs text-subtle">الان پوزیشن بازی ندارد</p>;
  const top = book.positions.slice(0, 2);
  const rest = book.positions.length - top.length;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      <span className="font-semibold">الان:</span>
      {top.map((p) => (
        <span key={p.coin} className="inline-flex items-center gap-1">
          <span className={p.side === 'long' ? 'text-positive' : 'text-negative'}>{p.side === 'long' ? 'لانگ' : 'شورت'}</span>
          <bdi dir="ltr" className="font-semibold text-ink">{p.coin}</bdi>
          <UsdShort value={p.sizeUsd} />
        </span>
      ))}
      {rest > 0 && <span>+{toFaDigits(rest)} پوزیشن دیگر</span>}
    </p>
  );
}

export function TraderRow({
  address,
  name,
  rank,
  leader,
  summary,
  book,
  loading,
  following,
  onOpen,
  onRemove,
  onToggleFollow
}: {
  address: string;
  name?: string | null;
  rank?: number;
  leader?: Candidate;
  summary?: TraderSummary;
  /** undefined: پوزیشن‌های این آدرس پایش نمی‌شود (خارج از برترها) */
  book?: Book | null;
  loading?: boolean;
  following?: boolean;
  onOpen: () => void;
  onRemove?: () => void;
  onToggleFollow?: () => void;
}) {
  const s = summary;
  const pending = !s && loading;
  const score = qualityScore(s);
  const wait = <Skeleton className="h-4 w-12" />;
  const dd = s?.maxDrawdownPct ?? null;

  return (
    <Surface className="flex h-full items-start gap-3 p-4 transition-shadow hover:shadow-card">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-start gap-3 text-start">
        <ScoreRing score={score} pending={pending} />
        <div className="min-w-0 flex-1">
          <div className="mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {rank !== undefined && <span className="text-xs font-bold text-subtle">#{toFaDigits(rank)}</span>}
            <span className="truncate font-bold text-ink">{name ?? <bdi dir="ltr" className="font-latin text-sm">{shortAddress(address)}</bdi>}</span>
            {name && <bdi dir="ltr" className="font-latin text-2xs text-subtle">{shortAddress(address)}</bdi>}
            {isSteady(s) && <Badge tone="brand">ثابت‌قدم</Badge>}
            {s?.copyability === 'manual' && <Badge tone="gain">قابل کپی دستی</Badge>}
            {s?.copyability === 'fast' && <Badge tone="warn">پرتکرار</Badge>}
            {s?.makerLike && <Badge tone="info">مارکت‌میکر</Badge>}
          </div>
          <dl className="grid grid-cols-3 gap-3">
            {leader ? (
              <Fact label="بازده ۳۰ روز">
                <PercentValue value={leader.windows.month.roi * 100} digits={0} />
              </Fact>
            ) : (
              <Fact label="سود کل">{s ? <MoneyValue value={s.totalPnl} compact signed tone="auto" /> : pending ? wait : '—'}</Fact>
            )}
            <Fact label="ماه سودده">{s ? `${toFaDigits(s.positiveMonths)} از ${toFaDigits(s.months)}` : pending ? wait : '—'}</Fact>
            <Fact label="بدترین افت">
              {s ? <PercentValue value={dd === null ? null : -dd} digits={0} tone="none" className={cn(dd !== null && dd > 50 && 'text-negative')} /> : pending ? wait : '—'}
            </Fact>
          </dl>
          {book !== undefined && (
            <div className="mt-2.5 border-t border-divider pt-2.5">
              <BookLine book={book ?? undefined} />
            </div>
          )}
        </div>
      </button>
      <div className="flex shrink-0 flex-col gap-1">
        {onToggleFollow && (
          <IconButton aria-label={following ? 'لغو اعلان این تریدر' : 'اعلان پوزیشن‌های این تریدر'} size="sm" onClick={onToggleFollow} className={cn(following && 'text-accent hover:text-accent')}>
            <Bell className={cn(following && 'fill-current')} />
          </IconButton>
        )}
        {onRemove && (
          <IconButton aria-label="حذف از آدرس‌های من" size="sm" onClick={onRemove}>
            <Trash2 />
          </IconButton>
        )}
      </div>
    </Surface>
  );
}

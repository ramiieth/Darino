/** ============================================================
 * دیجی‌کالا — جستجو، مقایسه، بررسی نظرات و «بهترین خرید با بودجه»
 *
 *  منبع: API عمومی وب دیجی‌کالا از طریق سرور دارینو (فقط‌خواندنی،
 *  بدون کلید). رتبه‌بندی «بهترین گزینه» در domain/score.ts و شفاف است.
 * ============================================================ */
import { type FormEvent, useMemo, useRef, useState } from 'react';
import { Check, ExternalLink, GitCompareArrows, MessageSquareText, ShoppingBag, Sparkles, Trophy } from 'lucide-react';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { Button, buttonClass } from '@/shared/components/ui/Button';
import { Field, Input, SearchField } from '@/shared/components/ui/Input';
import { ChipGroup } from '@/shared/components/ui/SegmentedControl';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import { errorText, prefetchProduct, searchProducts } from '../data/api';
import { type RankedCard, rankBestValue } from '../domain/score';
import type { DkCard, DkSort } from '../domain/types';
import { fmtCount, fmtPrice, parseToman } from './format';
import { RatingLine } from './RatingLine';
import { ProductImage } from './ProductImage';
import { ProductSheet } from './ProductSheet';
import { CompareSheet } from './CompareSheet';

const SORTS: { value: DkSort; label: string }[] = [
  { value: 'relevant', label: 'مرتبط‌ترین' },
  { value: 'buyers', label: 'پیشنهاد خریداران' },
  { value: 'bestselling', label: 'پرفروش‌ترین' },
  { value: 'cheapest', label: 'ارزان‌ترین' },
  { value: 'expensive', label: 'گران‌ترین' },
  { value: 'newest', label: 'جدیدترین' }
];
const QUICK = ['هدفون بی‌سیم', 'گوشی موبایل', 'لپ‌تاپ', 'ساعت هوشمند', 'پاوربانک', 'جاروبرقی', 'قهوه‌ساز'];
const MAX_COMPARE = 4;

export default function DigikalaPage() {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<DkSort>('relevant');
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');
  const [items, setItems] = useState<DkCard[]>([]);
  const [meta, setMeta] = useState<{ q: string; page: number; totalPages: number; totalItems: number; at: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [compare, setCompare] = useState<DkCard[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const runId = useRef(0);

  const budget = parseToman(maxText);
  const minBudget = parseToman(minText);
  const best = useMemo(() => rankBestValue(items, { budget, minBudget, limit: 3 }), [items, budget, minBudget]);
  const visible = useMemo(
    () => items.filter((c) => (budget == null || (c.priceToman ?? 0) <= budget) && (minBudget == null || (c.priceToman ?? 0) >= minBudget)),
    [items, budget, minBudget]
  );

  async function run(q: string, s: DkSort, page: number) {
    if (q.trim().length < 2) { setError('حداقل دو حرف برای جستجو بنویسید'); return; }
    const id = ++runId.current;
    setLoading(true); setError(null);
    if (page === 1) setItems([]);
    try {
      const r = await searchProducts(q.trim(), s, page);
      if (id !== runId.current) return;
      setItems((old) => (page === 1 ? r.items : [...old, ...r.items.filter((c) => !old.some((o) => o.id === c.id))]));
      setMeta({ q: r.query, page: r.page, totalPages: r.totalPages, totalItems: r.totalItems, at: r.fetchedAt });
    } catch (e) {
      if (id === runId.current) setError(errorText(e));
    } finally {
      if (id === runId.current) setLoading(false);
    }
  }

  const submit = (e: FormEvent) => { e.preventDefault(); void run(query, sort, 1); };
  const quick = (q: string) => { setQuery(q); void run(q, sort, 1); };
  const changeSort = (s: DkSort) => { setSort(s); if (meta) void run(meta.q, s, 1); };
  const toggleCompare = (c: DkCard) =>
    setCompare((old) => (old.some((o) => o.id === c.id) ? old.filter((o) => o.id !== c.id) : old.length >= MAX_COMPARE ? old : [...old, c]));
  const firstLoad = loading && items.length === 0;

  return (
    <Page className={cn(compare.length > 0 && 'pb-28')}>
      <PageHeader
        eyebrow="ابزارها"
        title="دیجی‌کالا"
        meta={
          meta && !firstLoad && (
            <p className="text-xs text-muted">
              {fmtCount(meta.totalItems)} نتیجه برای «{meta.q}» · به‌روزرسانی {fmtRelativeAge(meta.at)}
            </p>
          )
        }
      />

      <Surface variant="focal" className="space-y-4 p-4 md:p-5">
        <form onSubmit={submit} className="flex gap-2">
          <SearchField value={query} onChange={setQuery} placeholder="چه چیزی می‌خواهید بخرید؟" label="جستجو در دیجی‌کالا" className="flex-1" />
          <Button type="submit" loading={firstLoad} icon={<ShoppingBag aria-hidden className="h-4 w-4" />}>جستجو</Button>
        </form>
        <div className="grid grid-cols-2 gap-3">
          <Field label="حداقل بودجه">
            <Input inputMode="numeric" value={minText} onChange={(e) => setMinText(e.target.value)} placeholder="اختیاری" suffix="تومان" />
          </Field>
          <Field label="حداکثر بودجه" error={maxText && budget == null ? 'مثلاً ۲۵ میلیون یا 25000000' : undefined}>
            <Input inputMode="numeric" value={maxText} onChange={(e) => setMaxText(e.target.value)} placeholder="مثلاً ۲۵ میلیون" suffix="تومان" />
          </Field>
        </div>
        {meta ? (
          <ChipGroup options={SORTS} value={sort} onChange={changeSort} label="مرتب‌سازی" />
        ) : (
          <div className="flex flex-wrap gap-1.5" aria-label="جستجوهای پیشنهادی">
            {QUICK.map((q) => (
              <button key={q} type="button" onClick={() => quick(q)} className="rounded-full border border-divider px-3 py-1 text-xs text-muted transition hover:border-accent hover:text-accent">
                {q}
              </button>
            ))}
          </div>
        )}
      </Surface>

      {error && <Notice tone="error" title="جستجو انجام نشد" action={meta && <Button size="sm" variant="outline" onClick={() => void run(meta.q, sort, 1)}>تلاش دوباره</Button>}>{error}</Notice>}

      {firstLoad && <LoadingShowcase />}

      {!loading && !error && !meta && (
        <EmptyState
          icon={<ShoppingBag />}
          message="کالای مورد نظرتان را جستجو کنید"
          hint="قیمت‌ها را مقایسه کنید، خلاصهٔ نظر خریداران را ببینید و بر اساس بودجه بهترین گزینه را پیدا کنید."
        />
      )}

      {!firstLoad && best.length > 0 && (
        <Section title={<span className="inline-flex items-center gap-2"><Trophy aria-hidden className="h-5 w-5 text-warn" />بهترین خرید{budget != null && ` تا ${fmtPrice(budget)}`}</span>}>
          <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
            <HeroPick pick={best[0]} onOpen={() => setOpenId(best[0].card.id)} />
            {best.length > 1 && (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                {best.slice(1).map((r, i) => (
                  <RunnerUp key={r.card.id} pick={r} rank={i + 2} onOpen={() => setOpenId(r.card.id)} />
                ))}
              </div>
            )}
          </div>
          <p className="mt-2 text-[11px] leading-5 text-subtle">
            امتیاز ارزش = رضایت خریداران (با وزن تعداد رأی) + قیمت نسبت به سایر نتایج + تخفیف + اعتبار فروشنده؛ فقط کالاهای موجود
            {budget != null || minBudget != null ? ' و داخل بودجه' : ''}. پیش از خرید، قیمت نهایی را در دیجی‌کالا ببینید.
          </p>
        </Section>
      )}

      {meta && !firstLoad && best.length === 0 && items.length > 0 && (
        <Notice tone="warn" title="کالای موجودی در این بودجه پیدا نشد">بودجه را تغییر دهید یا «نتایج بیشتر» را بزنید.</Notice>
      )}

      {meta && !firstLoad && (
        <Section title="همهٔ نتایج" action={<span className="text-xs text-muted">{toFaDigits(visible.length)} کالا</span>}>
          {visible.length === 0 ? (
            <EmptyState message="نتیجه‌ای نمایش داده نمی‌شود" hint="عبارت دیگری را امتحان کنید یا بودجه را تغییر دهید." />
          ) : (
            <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-4">
              {visible.map((c) => (
                <li key={c.id} className="min-w-0">
                  <ProductTile card={c} selected={compare.some((o) => o.id === c.id)} compareFull={compare.length >= MAX_COMPARE} onOpen={() => setOpenId(c.id)} onToggleCompare={() => toggleCompare(c)} />
                </li>
              ))}
            </ul>
          )}
          {meta.page < meta.totalPages && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" loading={loading} onClick={() => void run(meta.q, sort, meta.page + 1)}>نتایج بیشتر</Button>
            </div>
          )}
        </Section>
      )}

      {compare.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-30 px-gutter md:bottom-6">
          <Surface variant="focal" className="mx-auto flex max-w-2xl items-center gap-3 p-2.5">
            <div className="flex -space-x-3 space-x-reverse">
              {compare.map((c) => <ProductImage key={c.id} src={c.image} className="h-10 w-10 border-2 border-card" />)}
            </div>
            <p className="min-w-0 flex-1 truncate text-xs text-muted">
              {compare.length < 2 ? 'یک کالای دیگر انتخاب کنید' : `${toFaDigits(compare.length)} کالا آمادهٔ مقایسه`}
            </p>
            <Button size="sm" variant="ghost" onClick={() => setCompare([])}>پاک کردن</Button>
            <Button size="sm" disabled={compare.length < 2} icon={<GitCompareArrows aria-hidden className="h-4 w-4" />} onClick={() => setCompareOpen(true)}>مقایسه</Button>
          </Surface>
        </div>
      )}

      <ProductSheet id={openId} onClose={() => setOpenId(null)} />
      <CompareSheet open={compareOpen} cards={compare} onClose={() => setCompareOpen(false)} onOpenProduct={(id) => { setCompareOpen(false); setOpenId(id); }} />
    </Page>
  );
}

/* ---------------- Best picks ---------------- */

function DkLink({ url, className, label = 'مشاهده در دیجی‌کالا', size = 'md' }: { url: string; className?: string; label?: string; size?: 'sm' | 'md' }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={cn(buttonClass('primary', size), 'gap-1.5', className)}>
      {label} <ExternalLink aria-hidden className="h-3.5 w-3.5" />
    </a>
  );
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2" aria-label={`امتیاز ارزش ${Math.round(score)} از ۱۰۰`}>
      <span className="shrink-0 text-[11px] text-muted">ارزش خرید</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-gradient-to-l from-accent to-positive" style={{ width: `${Math.min(100, score)}%` }} />
      </div>
      <span className="text-xs font-bold tabular-nums text-ink">{toFaDigits(Math.round(score))}</span>
    </div>
  );
}

function Price({ card, large }: { card: DkCard; large?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className={cn('font-extrabold text-ink', large ? 'text-xl' : 'text-sm')}>{fmtPrice(card.priceToman)}</span>
      {card.priceBeforeToman && <span className="text-xs text-subtle line-through">{fmtPrice(card.priceBeforeToman)}</span>}
    </div>
  );
}

function HeroPick({ pick, onOpen }: { pick: RankedCard; onOpen: () => void }) {
  const c = pick.card;
  return (
    <Surface variant="focal" className="relative overflow-hidden p-4 md:p-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-accent-soft to-transparent" />
      <div className="relative flex flex-col gap-4 sm:flex-row">
        <button type="button" onClick={onOpen} className="relative shrink-0 self-center" aria-label={`جزئیات ${c.title}`}>
          <ProductImage src={c.image} priority className="h-44 w-44 shadow-card md:h-52 md:w-52" />
          <span className="absolute -top-2 start-2 inline-flex items-center gap-1 rounded-full bg-warn px-2.5 py-1 text-[11px] font-extrabold text-white shadow-card">
            <Trophy aria-hidden className="h-3.5 w-3.5" /> پیشنهاد اول
          </span>
          {c.discountPercent > 0 && <DiscountBadge pct={c.discountPercent} className="absolute bottom-2 end-2" />}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <button type="button" onClick={onOpen} className="line-clamp-3 text-start text-base font-bold leading-7 text-ink hover:text-accent">{c.title}</button>
          <RatingLine card={c} />
          <Price card={c} large />
          <ScoreBar score={pick.score} />
          {pick.reasons.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {pick.reasons.map((r) => (
                <li key={r} className="inline-flex items-center gap-1 rounded-full bg-positive/10 px-2 py-0.5 text-[11px] font-semibold text-positive">
                  <Check aria-hidden className="h-3 w-3" />{r}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            <DkLink url={c.url} className="flex-1" />
            <Button variant="outline" onClick={onOpen} icon={<MessageSquareText aria-hidden className="h-4 w-4" />}>نظرات و مشخصات</Button>
          </div>
        </div>
      </div>
    </Surface>
  );
}

function RunnerUp({ pick, rank, onOpen }: { pick: RankedCard; rank: number; onOpen: () => void }) {
  const c = pick.card;
  return (
    <Surface className="flex h-full flex-col gap-2.5 p-3 lg:flex-row lg:items-center">
      <button type="button" onClick={onOpen} className="relative shrink-0 self-center" aria-label={`جزئیات ${c.title}`}>
        <ProductImage src={c.image} className="h-28 w-28 lg:h-24 lg:w-24" />
        <span className="absolute -top-1.5 start-1 rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold text-card">رتبهٔ {toFaDigits(rank)}</span>
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <button type="button" onClick={onOpen} className="line-clamp-2 text-start text-xs font-semibold leading-5 text-ink hover:text-accent">{c.title}</button>
        <RatingLine card={c} />
        <Price card={c} />
        <ScoreBar score={pick.score} />
        <DkLink url={c.url} size="sm" label="دیجی‌کالا" className="mt-auto" />
      </div>
    </Surface>
  );
}

/* ---------------- Results grid ---------------- */

function DiscountBadge({ pct, className }: { pct: number; className?: string }) {
  return <span className={cn('rounded-full bg-negative px-2 py-0.5 text-[11px] font-extrabold text-white', className)}>{toFaDigits(pct)}٪</span>;
}

function ProductTile({ card, selected, compareFull, onOpen, onToggleCompare }: {
  card: DkCard;
  selected: boolean;
  compareFull: boolean;
  onOpen: () => void;
  onToggleCompare: () => void;
}) {
  const hover = useRef<number>();
  return (
    <Surface
      className={cn('group flex h-full flex-col overflow-hidden p-2.5 transition-shadow hover:shadow-card', selected && 'ring-2 ring-accent')}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') hover.current = window.setTimeout(() => prefetchProduct(card.id), 400); }}
      onPointerLeave={() => window.clearTimeout(hover.current)}
    >
      <button type="button" onClick={onOpen} className="relative block" aria-label={`جزئیات ${card.title}`}>
        <ProductImage src={card.image} className={cn('aspect-square w-full transition-transform group-hover:scale-[1.02]', !card.inStock && 'opacity-50 grayscale')} />
        {card.discountPercent > 0 && card.inStock && <DiscountBadge pct={card.discountPercent} className="absolute bottom-1.5 end-1.5" />}
        {card.incredible && (
          <span className="absolute start-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-negative/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
            <Sparkles aria-hidden className="h-3 w-3" /> شگفت‌انگیز
          </span>
        )}
      </button>
      <div className="mt-2 flex min-w-0 flex-1 flex-col gap-1">
        <button type="button" onClick={onOpen} className="line-clamp-2 min-h-[2.5rem] text-start text-xs font-semibold leading-5 text-ink hover:text-accent">{card.title}</button>
        <RatingLine card={card} />
        <div className="mt-auto pt-1">{card.inStock ? <Price card={card} /> : <span className="text-sm font-bold text-subtle">ناموجود</span>}</div>
        <div className="mt-1.5 flex items-center justify-between gap-1 border-t border-divider pt-2">
          <label className={cn('inline-flex cursor-pointer items-center gap-1 text-[11px]', !selected && compareFull ? 'text-subtle' : 'text-muted')}>
            <input type="checkbox" checked={selected} disabled={!selected && compareFull} onChange={onToggleCompare} className="h-3.5 w-3.5" />
            مقایسه
          </label>
          <a href={card.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent hover:text-on-accent">
            دیجی‌کالا <ExternalLink aria-hidden className="h-3 w-3" />
          </a>
        </div>
      </div>
    </Surface>
  );
}

function LoadingShowcase() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="در حال جستجو">
      <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
        <Skeleton className="h-60 rounded-card" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <Skeleton className="h-28 rounded-card" />
          <Skeleton className="h-28 rounded-card" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="aspect-[3/4] rounded-card" />)}
      </div>
    </div>
  );
}

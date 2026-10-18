/**
 * ⑫ برنامهٔ من — همراه قدم به قدم: ارز → تقسیم پول → دلتا نوترال (برای پوینت) → خرید پله‌ای → برنامهٔ نهایی
 *
 * تنها تایپ: ذخیرهٔ زندگی، سرمایهٔ سرمایه‌گذاری، سرمایهٔ دلتا نوترال. بقیه انتخابی است.
 * دادهٔ زنده: قیمت، فاندینگ و کارمزد از صرافی‌ها (DeltaVenuesProvider)؛ خریدهای قبلی از دفتر «بهای تمام‌شده».
 * محاسبات در domain (planner، deltaNeutral). هیچ سفارشی ثبت نمی‌شود؛ برنامه فقط در همین مرورگر ذخیره می‌شود.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Bot, CircleCheck, ExternalLink } from 'lucide-react';
import { Field, Input } from '@/shared/components/ui/Input';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { KeyValueList, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { jsonGet, jsonSet } from '@/shared/lib/storage';
import { toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import { HEDGE_COINS } from '@/features/calculators/data/hedgeCoins';
import { useDeltaBooks, DELTA_VENUE_LABELS, type DeltaVenue, type VenueQuote } from '@/features/calculators/data/deltaMarkets';
import { usePlannerLots } from '@/features/calculators/data/plannerLots';
import {
  allocatePlan,
  holdingOf,
  LADDER_STYLES,
  ladderLots,
  ladderPlan,
  rankDeltaOptions,
  sellAs,
  type CostMethod,
  type DeltaOption,
  type LadderStyle,
  type Lot
} from '@/features/calculators/domain';
import { parseNum } from '../parse';
import { CoinLogo, CoinPicker } from '../hedge/CoinPicker';
import { FALLBACK_MMF, FALLBACK_TAKER_PCT } from '../delta/arbEval';
import { SourceTag } from '../delta/CapitalFlow';
import { DELTA_PAIRS, pairVenues, type DeltaPair } from '../delta/pairs';
import type { ExecutionHandoff } from '../delta/execution/ExecutionPlanner';
import type { Coin } from '@/features/calculators/domain';

const STEPS = ['ارز', 'تقسیم پول', 'دلتا نوترال', 'خرید پله‌ای', 'برنامهٔ شما'] as const;
const VENUE_ORDER: DeltaVenue[] = ['arcus', 'lighter', 'lighterRh', 'ondo'];
/** استیبل‌کوین‌ها: دلتا نوترال و خرید در ریزش برایشان معنا ندارد */
const STABLES = new Set(['USDC', 'USDT', 'DAI', 'USDE', 'FDUSD', 'PYUSD', 'USDG', 'TUSD', 'USDS', 'USD1', 'USDT0', 'RLUSD']);
const TRADFI = new Set(['equity', 'commodity', 'index']);
type AssetFilter = 'all' | 'crypto' | 'other';
const STYLE_LABEL: Record<LadderStyle, { title: string; sub: string }> = {
  careful: { title: 'محتاط', sub: 'ریزش‌های کوچک‌تر — احتمال پر شدن بیشتر' },
  balanced: { title: 'متعادل', sub: 'بین احتمال پر شدن و قیمت ارزان‌تر' },
  deep: { title: 'عمیق', sub: 'فقط در ریزش‌های بزرگ — ارزان‌تر ولی کمتر پر می‌شود' }
};
const METHOD_LABEL: Record<CostMethod, { title: string; sub: string }> = {
  fifo: { title: 'FIFO', sub: 'اول قدیمی‌ترین خریدها فروخته می‌شوند' },
  lifo: { title: 'LIFO', sub: 'اول جدیدترین خریدها فروخته می‌شوند' },
  average: { title: 'میانگین', sub: 'بهای هر واحد = میانگین همهٔ خریدها' }
};

type SellAt = 'now' | 'up20' | 'oldAvg';
interface Saved {
  step: number;
  coin: string;
  reserve: string;
  invest: string;
  delta: string;
  lev: 1 | 2;
  holdDays: 7 | 14 | 30;
  pair: DeltaPair | 'none' | null;
  style: LadderStyle;
  share: 50 | 75 | 100;
  fills: 0 | 1 | 2 | 3;
  sellFrac: 25 | 50 | 100;
  sellAt: SellAt;
}
const STORE_KEY = 'calc:planner:v1';
const DEFAULTS: Saved = { step: 0, coin: 'ETH', reserve: '', invest: '', delta: '', lev: 2, holdDays: 30, pair: null, style: 'balanced', share: 75, fills: 3, sellFrac: 50, sellAt: 'now' };

/** تا سنت؛ خطای ممیز شناور («بیشتر از −۱» به‌جای صفر) نمایش داده نشود */
const cents = (v: number) => Math.round(v * 100) / 100;
const fmtPct = (v: number) => `${toFaDigits(Number(v.toFixed(1)))}٪`;
const fmtQty = (v: number) => toFaDigits(v.toLocaleString('en-US', { maximumFractionDigits: v < 1 ? 6 : 4 }));
const makerFee = (q: VenueQuote) => {
  const v = q.makerFeePct ?? q.takerFeePct;
  return v === null ? FALLBACK_TAKER_PCT : Math.max(0, v);
};

/* ---------------- اجزای مشترک ---------------- */

export function Chips<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-muted">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
            className={cn(
              'min-h-[2.25rem] rounded-full border px-3.5 text-xs font-semibold transition-colors duration-fast',
              o.value === value ? 'border-accent bg-accent-soft text-accent' : 'border-divider bg-card text-muted hover:border-divider-strong hover:text-ink'
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function StepCard({ n, title, sub, children }: { n: number; title: string; sub: ReactNode; children: ReactNode }) {
  return (
    <Surface as="section" aria-labelledby={`plan-step-${n}`} className="space-y-5 p-4 md:p-6">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-white">
          {toFaDigits(n)}
        </span>
        <div className="min-w-0">
          <h2 id={`plan-step-${n}`} className="text-base font-bold text-ink md:text-lg">
            {title}
          </h2>
          <p className="mt-1 text-xs leading-6 text-muted md:text-sm md:leading-7">{sub}</p>
        </div>
      </div>
      {children}
    </Surface>
  );
}

export function Bar({ value, max, textured }: { value: number; max: number; textured?: boolean }) {
  const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
      <div
        className="h-full rounded-full bg-chart-1 text-chart-1"
        style={{ width: `${w}%`, ...(textured ? { backgroundColor: 'transparent', backgroundImage: 'repeating-linear-gradient(135deg, currentColor 0 3px, transparent 3px 6px)' } : {}) }}
      />
    </div>
  );
}

export function Check({ ok, title, children }: { ok: boolean; title: string; children?: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      {ok ? <CircleCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-positive" /> : <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warn" />}
      <div className="min-w-0 text-xs leading-6">
        <p className="font-semibold text-ink">
          <span className="sr-only">{ok ? 'درست: ' : 'هشدار: '}</span>
          {title}
        </p>
        {children && <div className="text-muted">{children}</div>}
      </div>
    </li>
  );
}

/* ---------------- برنامه‌ریز ---------------- */

export function PlanWizard({ onOpenExecution }: { onOpenExecution?: (h: Omit<ExecutionHandoff, 'nonce'>) => void }) {
  const books = useDeltaBooks();
  const topRef = useRef<HTMLDivElement>(null);
  const [s, setS] = useState<Saved>(() => ({ ...DEFAULTS, ...jsonGet<Partial<Saved>>(STORE_KEY, {}) }));
  const set = <K extends keyof Saved>(k: K, v: Saved[K]) => setS((p) => ({ ...p, [k]: v }));
  useEffect(() => jsonSet(STORE_KEY, s), [s]);

  // هر دارایی که دست‌کم روی یک صرافی پرپ بازار دارد: رمزارزهای فهرست اپ (با لوگو) اول، بعد سهام توکنی و سایر
  const quotesOf = (sym: string) => VENUE_ORDER.flatMap((v) => books[v].quotes.filter((q) => q.base.toUpperCase() === sym.toUpperCase()));
  const allCoins = useMemo(() => {
    const bases = new Map<string, VenueQuote[]>();
    for (const v of VENUE_ORDER)
      for (const q of books[v].quotes) {
        const key = q.base.toUpperCase();
        if (!key || STABLES.has(key) || q.markPrice === null || !(q.markPrice > 0)) continue;
        bases.set(key, [...(bases.get(key) ?? []), q]);
      }
    const venuesOf = (qs: VenueQuote[]) => new Set(qs.map((q) => q.venue)).size;
    const known = HEDGE_COINS.filter((c) => bases.has(c.symbol.toUpperCase())).map((c): Coin => ({ ...c, kind: 'crypto' }));
    const knownSet = new Set(known.map((c) => c.symbol.toUpperCase()));
    const others = [...bases]
      .filter(([b]) => !knownSet.has(b))
      .sort((a, b) => venuesOf(b[1]) - venuesOf(a[1]) || (b[1][0].volume24hUsd ?? 0) - (a[1][0].volume24hUsd ?? 0))
      .map(([b, qs]): Coin => {
        const named = qs.find((q) => q.nameFa && q.nameFa !== b) ?? qs[0];
        return { symbol: b, name: named.nameFa || b, color: '#8A92AB', logo: '', kind: qs.some((q) => TRADFI.has(q.category)) ? 'tradfi' : 'crypto' };
      });
    return { known, others, venues: new Map([...bases].map(([b, qs]) => [b, venuesOf(qs)])) };
  }, [books]);
  const [filter, setFilter] = useState<AssetFilter>('all');
  const coins = filter === 'crypto' ? allCoins.known : filter === 'other' ? allCoins.others : [...allCoins.known, ...allCoins.others];
  const loadingCoins = !allCoins.known.length && !allCoins.others.length && VENUE_ORDER.some((v) => books[v].status === 'loading');
  const coin = [...allCoins.known, ...allCoins.others].find((c) => c.symbol === s.coin) ?? coins[0] ?? null;
  const venueCount = coin ? (allCoins.venues.get(coin.symbol.toUpperCase()) ?? 0) : 0;
  const nonCrypto = coin !== null && !allCoins.known.some((c) => c.symbol === coin.symbol);
  const price = coin ? (quotesOf(coin.symbol).find((q) => q.markPrice !== null && q.markPrice > 0)?.markPrice ?? null) : null;
  const priceVenue = coin ? quotesOf(coin.symbol).find((q) => q.markPrice !== null && q.markPrice > 0)?.venue : undefined;

  const v = { reserve: s.reserve.trim() === '' ? 0 : parseNum(s.reserve), invest: s.invest.trim() === '' ? 0 : parseNum(s.invest), delta: s.delta.trim() === '' ? 0 : parseNum(s.delta) };
  const moneyErrors = {
    reserve: !(v.reserve >= 0) ? 'عدد مثبت وارد کنید.' : null,
    invest: !(v.invest >= 0) ? 'عدد مثبت وارد کنید.' : null,
    delta: !(v.delta >= 0) ? 'عدد مثبت وارد کنید.' : null
  };
  const moneyOk = Object.values(moneyErrors).every((e) => e === null) && v.invest + v.delta > 0;
  const alloc = allocatePlan(v.reserve || 0, v.invest || 0, v.delta || 0, s.share);

  // گزینه‌های دلتا نوترال برای همین ارز: هر جفت صرافی که هر دو بازار را دارند؛ Short روی فاندینگ بالاتر
  const options = useMemo(() => {
    if (!coin) return [] as (DeltaOption<DeltaPair> & { longQ: VenueQuote; shortQ: VenueQuote })[];
    const input = DELTA_PAIRS.flatMap((p) => {
      const [va, vb] = pairVenues(p.value);
      const qa = books[va].quotes.find((q) => q.base.toUpperCase() === coin.symbol);
      const qb = books[vb].quotes.find((q) => q.base.toUpperCase() === coin.symbol);
      if (!qa || !qb || qa.fundingHourly === null || qb.fundingHourly === null) return [];
      const [shortQ, longQ] = qa.fundingHourly >= qb.fundingHourly ? [qa, qb] : [qb, qa];
      const leg = (q: VenueQuote) => ({ feePct: makerFee(q), fundingHourly: q.fundingHourly ?? 0, maintenanceMarginFraction: q.maintenanceMarginFraction ?? FALLBACK_MMF, markPrice: q.markPrice });
      return [{ key: p.value, long: leg(longQ), short: leg(shortQ), longQ, shortQ }];
    });
    const ranked = rankDeltaOptions(input, alloc.delta, s.lev, s.holdDays * 24);
    return ranked.map((r) => ({ ...r, longQ: input.find((i) => i.key === r.key)!.longQ, shortQ: input.find((i) => i.key === r.key)!.shortQ }));
  }, [coin?.symbol, books, alloc.delta, s.lev, s.holdDays]);
  const recommended = options.find((o) => o.result.net >= 0) ?? null;
  const chosenKey = alloc.delta <= 0 ? 'none' : s.pair === null ? (recommended?.key ?? 'none') : s.pair;
  const chosen = chosenKey === 'none' ? null : (options.find((o) => o.key === chosenKey) ?? null);

  const plan = useMemo(() => ladderPlan(price ?? 0, alloc.ladder, LADDER_STYLES[s.style]), [price, alloc.ladder, s.style]);
  const prior = usePlannerLots(coin?.symbol ?? '');
  const priorHolding = holdingOf(prior.lots);
  const lastAt = prior.lots.reduce((m, l) => Math.max(m, l.at), 0);
  const lotsWith = (k: number): Lot[] => [...prior.lots, ...ladderLots(plan, k, lastAt)];

  const canNext = [!!coin, moneyOk, true, true, true][s.step];
  const go = (d: number) => {
    set('step', Math.max(0, Math.min(STEPS.length - 1, s.step + d)));
    topRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div ref={topRef} className="mx-auto w-full max-w-3xl scroll-mt-4 space-y-5">
      <Surface className="p-3.5 md:p-4">
        <p className="mb-2.5 text-2xs text-subtle">فقط سه عدد تایپ می‌کنید؛ بقیه انتخابی است. هیچ سفارشی ثبت نمی‌شود.</p>
        <ol className="grid grid-cols-5 gap-1.5" aria-label="قدم‌ها">
          {STEPS.map((t, i) => {
            const done = i < s.step;
            const here = i === s.step;
            return (
              <li key={t}>
                <button
                  type="button"
                  onClick={() => (i <= s.step || (i > s.step && moneyOk && !!coin) ? set('step', i) : undefined)}
                  aria-current={here ? 'step' : undefined}
                  className="group flex w-full flex-col items-center gap-1.5"
                >
                  <span className={cn('h-1.5 w-full rounded-full transition-colors', here ? 'bg-accent' : done ? 'bg-accent/50' : 'bg-surface-2')} />
                  <span className={cn('max-w-full truncate text-2xs font-semibold', here ? 'text-accent' : done ? 'text-ink' : 'text-subtle')}>
                    {toFaDigits(i + 1)}
                    <span className={cn(!here && 'hidden sm:inline')}>. {t}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </Surface>

      {s.step === 0 && (
        <StepCard n={1} title="برای کدام دارایی برنامه می‌ریزید؟" sub="هر رمزارز یا سهام توکنی که دست‌کم روی یک صرافی پرپ (آرکوس، لایتر، لایتر رابین‌هود، اوندو) بازار دارد. برای دلتا نوترال دو صرافی لازم است.">
          {loadingCoins ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : !allCoins.known.length && !allCoins.others.length ? (
            <p className="text-sm text-warn">دادهٔ صرافی‌ها نرسید؛ کمی بعد دوباره امتحان کنید.</p>
          ) : (
            <>
              <Chips
                label="نوع دارایی"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all' as AssetFilter, label: `همه (${toFaDigits(allCoins.known.length + allCoins.others.length)})` },
                  { value: 'crypto' as AssetFilter, label: `رمزارز (${toFaDigits(allCoins.known.length)})` },
                  { value: 'other' as AssetFilter, label: `سهام توکنی و سایر (${toFaDigits(allCoins.others.length)})` }
                ]}
              />
              {coins.length ? (
                <CoinPicker coins={coins} value={coin ?? coins[0]} onChange={(c) => setS((p) => ({ ...p, coin: c.symbol, pair: null }))} />
              ) : (
                <p className="text-sm text-muted">در این دسته دارایی‌ای نیست.</p>
              )}
              {coin && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-divider bg-surface-2/50 p-3.5">
                  <span className="flex items-center gap-2.5">
                    <CoinLogo coin={coin} size={36} />
                    <span>
                      <span className="block text-sm font-bold text-ink">{coin.name}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted">
                        قیمت <MoneyValue value={price} /> <SourceTag kind="live" />
                        {priceVenue && <span className="text-subtle">· {DELTA_VENUE_LABELS[priceVenue]}</span>}
                      </span>
                    </span>
                  </span>
                  <PriorSummary prior={prior} holding={priorHolding} symbol={coin.symbol} price={price} />
                  <p className="w-full text-2xs text-subtle">
                    روی {toFaDigits(venueCount)} صرافی پرپ بازار دارد
                    {venueCount < 2 ? ' — دلتا نوترال برایش ممکن نیست؛ خرید پله‌ای کار می‌کند.' : '.'}
                    {nonCrypto && ' بیرون از فهرست رمزارزهای اپ (مثلاً سهام توکنی): خارج از ساعت بورس سقف قیمت و مارجین متفاوت است.'}
                  </p>
                </div>
              )}
            </>
          )}
        </StepCard>
      )}

      {s.step === 1 && (
        <StepCard n={2} title="پولتان را چطور تقسیم می‌کنید؟" sub="سه عدد، به دلار. ذخیرهٔ زندگی هرگز وارد برنامه نمی‌شود؛ فقط برای این است که کل تصویر را ببینید.">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="ذخیرهٔ زندگی، بدهی و هزینه‌ها" error={moneyErrors.reserve}>
              <Input dir="ltr" inputMode="decimal" autoComplete="off" value={s.reserve} onChange={(e) => set('reserve', e.target.value)} suffix="دلار" placeholder="0" />
            </Field>
            <Field label="سرمایهٔ سرمایه‌گذاری (خرید ارز)" error={moneyErrors.invest}>
              <Input dir="ltr" inputMode="decimal" autoComplete="off" value={s.invest} onChange={(e) => set('invest', e.target.value)} suffix="دلار" placeholder="0" />
            </Field>
            <Field label="سرمایهٔ دلتا نوترال (پوینت)" error={moneyErrors.delta}>
              <Input dir="ltr" inputMode="decimal" autoComplete="off" value={s.delta} onChange={(e) => set('delta', e.target.value)} suffix="دلار" placeholder="0" />
            </Field>
          </div>
          {alloc.total > 0 && (
            <div className="space-y-2.5">
              {(
                [
                  ['ذخیرهٔ زندگی — دست‌نخورده', alloc.reserve],
                  ['سرمایه‌گذاری', alloc.ladder + alloc.opportunity],
                  ['دلتا نوترال', alloc.delta]
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-muted">{label}</span>
                    <span className="flex items-baseline gap-1.5 font-semibold text-ink">
                      <MoneyValue value={value} digits={0} />
                      <span className="text-2xs font-normal text-subtle">{fmtPct((value / alloc.total) * 100)}</span>
                    </span>
                  </div>
                  <Bar value={value} max={alloc.total} />
                </div>
              ))}
              <p className="text-2xs text-subtle">
                جمع <MoneyValue value={alloc.total} digits={0} className="font-semibold text-ink" />
              </p>
            </div>
          )}
          {!moneyOk && moneyErrors.reserve === null && moneyErrors.invest === null && moneyErrors.delta === null && (
            <p className="text-xs text-muted">دست‌کم یکی از «سرمایه‌گذاری» یا «دلتا نوترال» را وارد کنید.</p>
          )}
        </StepCard>
      )}

      {s.step === 2 && (
        <StepCard
          n={3}
          title="دلتا نوترال را روی کدام دو صرافی اجرا کنید؟"
          sub={
            <>
              یک Long و یک Short هم‌اندازه روی {coin?.name}، در دو صرافی؛ قیمت هرچه شود، این دو هم را خنثی می‌کنند. سود از اختلاف فاندینگ است و پوینت از حجم و وثیقه. نیمی از سرمایه
              به هر صرافی می‌رود.
            </>
          }
        >
          {alloc.delta <= 0 ? (
            <p className="text-sm text-muted">سرمایهٔ دلتا نوترال صفر است؛ این قدم رد می‌شود.</p>
          ) : venueCount < 2 ? (
            <p className="text-sm leading-7 text-muted">
              {coin?.name} فقط روی یک صرافی پرپ بازار دارد؛ دلتا نوترال دو صرافی لازم دارد و این قدم رد می‌شود. سرمایهٔ دلتا نوترال در برنامه نقد می‌ماند، یا در قدم ۱ دارایی دیگری انتخاب کنید.
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Chips
                  label="اهرم (برای امنیت حداکثر ۲)"
                  value={s.lev}
                  onChange={(x) => set('lev', x)}
                  options={[
                    { value: 1, label: '۱× — امن‌ترین' },
                    { value: 2, label: '۲× — پوینت بیشتر' }
                  ]}
                />
                <Chips
                  label="مدت نگهداری"
                  value={s.holdDays}
                  onChange={(x) => set('holdDays', x)}
                  options={[
                    { value: 7, label: '۷ روز' },
                    { value: 14, label: '۱۴ روز' },
                    { value: 30, label: '۳۰ روز' }
                  ]}
                />
              </div>
              {!options.length ? (
                <p className="text-sm text-warn">برای این ارز هنوز جفت صرافی با فاندینگ معلوم پیدا نشد.</p>
              ) : (
                <div role="radiogroup" aria-label="جفت صرافی" className="space-y-2.5">
                  {options.map((o) => (
                    <DeltaOptionCard key={o.key} o={o} selected={chosenKey === o.key} recommended={recommended?.key === o.key} onPick={() => set('pair', o.key)} holdDays={s.holdDays} />
                  ))}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={chosenKey === 'none'}
                    onClick={() => set('pair', 'none')}
                    className={cn('w-full rounded-card border p-3.5 text-start text-sm transition-colors', chosenKey === 'none' ? 'border-accent bg-accent-soft' : 'border-divider hover:border-divider-strong')}
                  >
                    <span className="font-semibold text-ink">فعلاً دلتا نوترال نه</span>
                    <span className="block text-2xs text-muted">سرمایهٔ آن بیرون از برنامه نقد می‌ماند.</span>
                  </button>
                </div>
              )}
              <p className="text-2xs leading-5 text-subtle">
                «پیشنهادی» = بیشترین سود خالص بین گزینه‌هایی که بعد از کارمزد منفی نیستند. فاندینگ لحظه‌ای است و ممکن است برعکس شود؛ ارزش پوینت تضمینی نیست و حدس زده نمی‌شود.
              </p>
            </>
          )}
        </StepCard>
      )}

      {s.step === 3 && (
        <StepCard n={4} title="اگر قیمت ریخت، چطور بخرید؟" sub="سفارش‌های خرید از پیش در چند قیمت پایین‌تر؛ اگر قیمت نیاید پایین، پولتان دست‌نخورده می‌ماند.">
          {alloc.ladder + alloc.opportunity <= 0 || price === null ? (
            <p className="text-sm text-muted">سرمایهٔ سرمایه‌گذاری صفر است یا قیمت معلوم نیست؛ این قدم رد می‌شود.</p>
          ) : (
            <>
              <div role="radiogroup" aria-label="سبک خرید" className="grid gap-2.5 sm:grid-cols-3">
                {(Object.keys(LADDER_STYLES) as LadderStyle[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    role="radio"
                    aria-checked={s.style === st}
                    onClick={() => set('style', st)}
                    className={cn('rounded-card border p-3.5 text-start transition-colors', s.style === st ? 'border-accent bg-accent-soft' : 'border-divider bg-card hover:border-divider-strong')}
                  >
                    <span className="block text-sm font-bold text-ink">{STYLE_LABEL[st].title}</span>
                    <span className="mt-0.5 block text-2xs leading-5 text-muted">{STYLE_LABEL[st].sub}</span>
                    <span className="mt-2 flex flex-wrap gap-1">
                      {LADDER_STYLES[st].map((d) => (
                        <Badge key={d} tone="neutral" className="text-2xs">
                          −{toFaDigits(d)}٪
                        </Badge>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
              <Chips
                label="چه سهمی از سرمایهٔ سرمایه‌گذاری در این پله‌ها؟"
                value={s.share}
                onChange={(x) => set('share', x)}
                options={[
                  { value: 50, label: '۵۰٪' },
                  { value: 75, label: '۷۵٪' },
                  { value: 100, label: '۱۰۰٪' }
                ]}
              />
              <LadderTable plan={plan} symbol={coin!.symbol} />
              <FillScenarios prior={prior.lots} plan={plan} price={price} lotsWith={lotsWith} symbol={coin!.symbol} />
              <SaleScenario s={s} set={set} price={price} priorAvg={priorHolding.avgCost} lotsWith={lotsWith} symbol={coin!.symbol} hasPrior={prior.lots.length > 0} />
            </>
          )}
        </StepCard>
      )}

      {s.step === 4 && coin && (
        <Summary
          coin={coin.name}
          symbol={coin.symbol}
          alloc={alloc}
          chosen={chosen}
          plan={plan}
          price={price}
          prior={priorHolding}
          lotsAll={lotsWith(plan.steps.length)}
          holdDays={s.holdDays}
          onOpenExecution={
            onOpenExecution && chosen
              ? () =>
                  onOpenExecution({
                    pair: chosen.key,
                    base: coin.symbol,
                    flipped: false,
                    notionalPerSide: chosen.result.notional,
                    leverage: s.lev,
                    holdHours: Math.min(24, s.holdDays * 24)
                  })
              : undefined
          }
        />
      )}

      <div className="sticky bottom-[calc(var(--bottomnav-h)+0.75rem)] z-10 md:bottom-4">
        <div className="flex items-center justify-between gap-3 rounded-card border border-divider bg-card/95 p-2.5 shadow-lg backdrop-blur-md">
          <Button variant="ghost" size="sm" icon={<ArrowRight />} onClick={() => go(-1)} disabled={s.step === 0}>
            قبلی
          </Button>
          <span className="text-2xs text-subtle">
            قدم {toFaDigits(s.step + 1)} از {toFaDigits(STEPS.length)}
          </span>
          {s.step < STEPS.length - 1 ? (
            <Button size="sm" onClick={() => go(1)} disabled={!canNext}>
              <span className="inline-flex items-center gap-1.5">
                بعدی <ArrowLeft aria-hidden className="h-4 w-4" />
              </span>
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => set('step', 0)}>
              از اول
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- قدم ۱: دارایی قبلی ---------------- */

function PriorSummary({ prior, holding, symbol, price }: { prior: ReturnType<typeof usePlannerLots>; holding: ReturnType<typeof holdingOf>; symbol: string; price: number | null }) {
  if (prior.source === 'none') {
    return (
      <a href="#/accounting" className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
        خرید قبلی ثبت نشده — ثبت در «بهای تمام‌شده» <ExternalLink aria-hidden className="h-3.5 w-3.5" />
      </a>
    );
  }
  const pnl = price !== null && holding.avgCost !== null ? cents(holding.qty * (price - holding.avgCost)) : null;
  return (
    <div className="text-end text-xs">
      <p className="text-muted">
        دارایی قبلی <b className="text-ink">{fmtQty(holding.qty)}</b> <bdi dir="ltr">{symbol}</bdi>
      </p>
      <p className="text-muted">
        میانگین خرید <MoneyValue value={holding.avgCost} className="font-semibold text-ink" />
        {pnl !== null && (
          <>
            {' '}
            · <MoneyValue value={pnl} signed tone="auto" digits={0} />
          </>
        )}
      </p>
      <p className="text-2xs text-subtle">
        از «بهای تمام‌شده» · {prior.source === 'lots' ? `${toFaDigits(prior.lots.length)} خرید` : 'فقط موجودی و میانگین'}
        {prior.unreconciled && ' · فروش‌ها کم نشده'}
      </p>
    </div>
  );
}

/* ---------------- قدم ۳: گزینهٔ دلتا ---------------- */

function DeltaOptionCard({
  o,
  selected,
  recommended,
  onPick,
  holdDays
}: {
  o: DeltaOption<DeltaPair> & { longQ: VenueQuote; shortQ: VenueQuote };
  selected: boolean;
  recommended: boolean;
  onPick: () => void;
  holdDays: number;
}) {
  const r = o.result;
  const negative = r.net < 0;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      className={cn(
        'w-full rounded-card border p-3.5 text-start transition-colors',
        selected ? 'border-accent bg-accent-soft' : 'border-divider bg-card hover:border-divider-strong',
        negative && !selected && 'opacity-80'
      )}
    >
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-bold text-ink">
          {DELTA_VENUE_LABELS[o.longQ.venue]} ↔ {DELTA_VENUE_LABELS[o.shortQ.venue]}
        </span>
        <span className="flex gap-1.5">
          {recommended && <Badge tone="gain">پیشنهادی</Badge>}
          {negative && <Badge tone="loss">بعد از کارمزد منفی</Badge>}
        </span>
      </span>
      <span className="mt-1 block text-2xs text-muted">
        <span className="font-semibold text-positive">Long</span> {DELTA_VENUE_LABELS[o.longQ.venue]} · <span className="font-semibold text-negative">Short</span>{' '}
        {DELTA_VENUE_LABELS[o.shortQ.venue]} · هر طرف <MoneyValue value={r.notional} digits={0} />
      </span>
      <span className="mt-2.5 grid grid-cols-3 gap-2 text-center">
        <span>
          <span className="block text-2xs text-subtle">سود خالص {toFaDigits(holdDays)} روز</span>
          <MoneyValue value={r.net} signed tone="auto" digits={2} className="text-sm font-bold" />
        </span>
        <span>
          <span className="block text-2xs text-subtle">اختلاف فاندینگ</span>
          <PercentValue value={r.spreadApr} digits={1} className="text-sm font-semibold" />
        </span>
        <span>
          <span className="block text-2xs text-subtle">امن تا حرکت</span>
          <span className="text-sm font-semibold text-ink">{r.nearestLiquidationPct === null ? '—' : fmtPct(r.nearestLiquidationPct)}</span>
        </span>
      </span>
      {negative && <span className="mt-2 block text-2xs text-muted">برای سربه‌سر، پوینت این حجم باید دست‌کم <MoneyValue value={r.breakEvenPoints} digits={2} /> بیرزد.</span>}
    </button>
  );
}

/* ---------------- قدم ۴: پله‌ها و سناریوها ---------------- */

function LadderTable({ plan, symbol }: { plan: ReturnType<typeof ladderPlan>; symbol: string }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full table-fixed border-separate border-spacing-0 text-xs sm:text-sm">
        <caption className="sr-only">سفارش‌های خرید پله‌ای</caption>
        <thead>
          <tr className="text-2xs text-subtle">
            <th scope="col" className="pb-2 text-start font-semibold">
              پله
            </th>
            <th scope="col" className="pb-2 text-end font-semibold">
              قیمت خرید
            </th>
            <th scope="col" className="pb-2 text-end font-semibold">
              مبلغ
            </th>
            <th scope="col" className="pb-2 text-end font-semibold">
              مقدار
            </th>
          </tr>
        </thead>
        <tbody>
          {plan.steps.map((st, i) => (
            <tr key={st.dropPct}>
              <th scope="row" className="border-t border-divider py-2 text-start font-normal text-muted">
                {toFaDigits(i + 1)} · <span className="text-negative">−{toFaDigits(st.dropPct)}٪</span>
              </th>
              <td className="border-t border-divider py-2 text-end font-semibold text-ink">
                <MoneyValue value={st.price} />
              </td>
              <td className="border-t border-divider py-2 text-end font-semibold text-ink">
                <MoneyValue value={st.usd} digits={0} />
              </td>
              <td className="border-t border-divider py-2 text-end font-semibold text-ink">
                {fmtQty(st.qty)} <bdi dir="ltr" className="text-2xs text-subtle">{symbol}</bdi>
              </td>
            </tr>
          ))}
          <tr className="bg-surface-2/60">
            <th scope="row" className="border-t border-divider py-2 ps-1 text-start font-bold text-ink">
              اگر همه پر شوند
            </th>
            <td className="border-t border-divider py-2 text-end font-bold text-ink">
              میانگین <MoneyValue value={plan.avgPrice} />
            </td>
            <td className="border-t border-divider py-2 text-end font-bold text-ink">
              <MoneyValue value={plan.totalUsd} digits={0} />
            </td>
            <td className="border-t border-divider py-2 pe-1 text-end font-bold text-ink">{fmtQty(plan.totalQty)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function FillScenarios({ prior, plan, price, lotsWith, symbol }: { prior: Lot[]; plan: ReturnType<typeof ladderPlan>; price: number; lotsWith: (k: number) => Lot[]; symbol: string }) {
  const rows = Array.from({ length: plan.steps.length + 1 }, (_, k) => {
    const h = holdingOf(lotsWith(k));
    const at = k === 0 ? price : plan.steps[k - 1].price;
    return { k, h, at, value: h.qty * at, pnl: cents(h.qty * at - h.cost) };
  });
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-ink">اگر قیمت تا کجا بریزد، وضعیت شما چه می‌شود؟</h3>
      <p className="text-2xs leading-5 text-subtle">
        {prior.length ? 'با خریدهای قبلی شما از «بهای تمام‌شده».' : 'فقط همین پله‌ها؛ خرید قبلی ثبت نشده.'} «قیمت سربه‌سر» = میانگین بهای هر واحد؛ اگر قیمت به آن برگردد، کل دارایی بی‌سود و
        بی‌زیان است.
      </p>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full table-fixed border-separate border-spacing-0 text-xs">
          <caption className="sr-only">سناریوهای ریزش و پر شدن پله‌ها</caption>
          <thead>
            <tr className="text-2xs text-subtle">
              <th scope="col" className="w-[28%] pb-2 text-start font-semibold">
                ریزش تا
              </th>
              <th scope="col" className="pb-2 text-end font-semibold">
                مقدار کل
              </th>
              <th scope="col" className="pb-2 text-end font-semibold">
                قیمت سربه‌سر
              </th>
              <th scope="col" className="pb-2 text-end font-semibold">
                سود/زیان باز
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.k}>
                <th scope="row" className="border-t border-divider py-2 text-start font-normal text-muted">
                  {r.k === 0 ? 'قیمت فعلی' : <MoneyValue value={r.at} digits={0} />}
                  <span className="block text-2xs text-subtle">{r.k === 0 ? 'هیچ پله‌ای پر نشده' : `${toFaDigits(r.k)} پله پر شده`}</span>
                </th>
                <td className="border-t border-divider py-2 text-end font-semibold text-ink">
                  {fmtQty(r.h.qty)} <bdi dir="ltr" className="text-2xs text-subtle">{symbol}</bdi>
                </td>
                <td className="border-t border-divider py-2 text-end font-semibold text-ink">
                  <MoneyValue value={r.h.avgCost} digits={0} />
                </td>
                <td className="border-t border-divider py-2 text-end font-semibold">{r.h.qty > 0 ? <MoneyValue value={r.pnl} signed tone="auto" digits={0} /> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SaleScenario({
  s,
  set,
  price,
  priorAvg,
  lotsWith,
  symbol,
  hasPrior
}: {
  s: Saved;
  set: <K extends keyof Saved>(k: K, v: Saved[K]) => void;
  price: number;
  priorAvg: number | null;
  lotsWith: (k: number) => Lot[];
  symbol: string;
  hasPrior: boolean;
}) {
  const lots = lotsWith(s.fills);
  const h = holdingOf(lots);
  const sellPrice = s.sellAt === 'up20' ? price * 1.2 : s.sellAt === 'oldAvg' && priorAvg !== null ? priorAvg : price;
  const qty = (h.qty * s.sellFrac) / 100;
  const results = (['fifo', 'lifo', 'average'] as const).map((m) => ({ m, r: sellAs(lots, qty, sellPrice, m) }));
  return (
    <div className="space-y-3 rounded-card border border-divider bg-surface-2/40 p-3.5">
      <div>
        <h3 className="text-sm font-bold text-ink">اگر بعداً بخشی را بفروشد: سود یا زیان تحقق‌یافته</h3>
        <p className="mt-0.5 text-2xs leading-5 text-subtle">
          روش محاسبهٔ بهای تمام‌شده عدد سود/زیانِ همان فروش را عوض می‌کند، نه پولی که دریافت می‌کنید. با فروش همهٔ دارایی، هر سه روش یک عدد می‌دهند. روش رسمی را قوانین مالیاتی
          محل شما تعیین می‌کند.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Chips
          label="پله‌های پر شده"
          value={s.fills}
          onChange={(x) => set('fills', x)}
          options={[0, 1, 2, 3].map((k) => ({ value: k as Saved['fills'], label: toFaDigits(k) }))}
        />
        <Chips
          label="چه مقدار بفروشد"
          value={s.sellFrac}
          onChange={(x) => set('sellFrac', x)}
          options={[
            { value: 25, label: '۲۵٪' },
            { value: 50, label: '۵۰٪' },
            { value: 100, label: 'همه' }
          ]}
        />
        <Chips
          label="در چه قیمتی"
          value={s.sellAt}
          onChange={(x) => set('sellAt', x)}
          options={[
            { value: 'now' as SellAt, label: 'قیمت فعلی' },
            { value: 'up20' as SellAt, label: '+۲۰٪' },
            ...(hasPrior && priorAvg !== null ? [{ value: 'oldAvg' as SellAt, label: 'میانگین قبلی' }] : [])
          ]}
        />
      </div>
      {h.qty <= 0 ? (
        <p className="text-xs text-muted">دارایی‌ای برای فروش نیست؛ پله‌ای پر نشده و خرید قبلی ثبت نشده.</p>
      ) : (
        <>
          <p className="text-xs text-muted">
            فروش {fmtQty(qty)} <bdi dir="ltr">{symbol}</bdi> در <MoneyValue value={sellPrice} digits={0} /> = دریافتی <MoneyValue value={qty * sellPrice} digits={0} className="font-semibold text-ink" />
          </p>
          <div className="grid gap-2.5 sm:grid-cols-3">
            {results.map(({ m, r }) => (
              <div key={m} className="rounded-field border border-divider bg-card p-3">
                <p className="text-xs font-bold text-ink">{METHOD_LABEL[m].title}</p>
                <p className="text-2xs leading-5 text-subtle">{METHOD_LABEL[m].sub}</p>
                <p className="mt-1.5 text-lg font-extrabold">
                  <MoneyValue value={cents(r.realized)} signed tone="auto" digits={0} />
                </p>
                <p className="text-2xs text-subtle">
                  بهای فروخته‌شده <MoneyValue value={r.cost} digits={0} />
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- قدم ۵: برنامهٔ نهایی ---------------- */

function Summary({
  coin,
  symbol,
  alloc,
  chosen,
  plan,
  price,
  prior,
  lotsAll,
  holdDays,
  onOpenExecution
}: {
  coin: string;
  symbol: string;
  alloc: ReturnType<typeof allocatePlan>;
  chosen: (DeltaOption<DeltaPair> & { longQ: VenueQuote; shortQ: VenueQuote }) | null;
  plan: ReturnType<typeof ladderPlan>;
  price: number | null;
  prior: ReturnType<typeof holdingOf>;
  lotsAll: Lot[];
  holdDays: number;
  onOpenExecution?: () => void;
}) {
  const after = holdingOf(lotsAll);
  const liq = chosen?.result.nearestLiquidationPct ?? null;
  const deltaSafe = chosen === null || liq === null || liq > plan.deepestDropPct;
  return (
    <StepCard n={5} title={`برنامهٔ شما برای ${coin}`} sub="خلاصهٔ کارهایی که باید انجام شود، به ترتیب. اعداد زنده‌اند؛ پیش از اجرا یک بار دیگر نگاه کنید.">
      <ol className="space-y-3">
        <li className="rounded-card border border-divider p-3.5">
          <p className="text-xs font-bold text-ink">۱. ذخیرهٔ زندگی</p>
          <p className="mt-1 text-sm text-muted">
            <MoneyValue value={alloc.reserve} digits={0} className="font-semibold text-ink" /> کنار بماند و به هیچ‌کدام از کارهای زیر دست نزند.
          </p>
        </li>
        <li className="rounded-card border border-divider p-3.5">
          <p className="text-xs font-bold text-ink">۲. دلتا نوترال برای پوینت</p>
          {chosen ? (
            <div className="mt-1 space-y-2 text-sm text-muted">
              <p>
                <MoneyValue value={alloc.delta / 2} digits={0} className="font-semibold text-ink" /> به {DELTA_VENUE_LABELS[chosen.longQ.venue]} و همین مقدار به{' '}
                {DELTA_VENUE_LABELS[chosen.shortQ.venue]}. روی <bdi dir="ltr">{symbol}</bdi>: <span className="font-semibold text-positive">Long</span> در{' '}
                {DELTA_VENUE_LABELS[chosen.longQ.venue]} و <span className="font-semibold text-negative">Short</span> در {DELTA_VENUE_LABELS[chosen.shortQ.venue]}، هر کدام{' '}
                <MoneyValue value={chosen.result.notional} digits={0} className="font-semibold text-ink" />. یک بار باز کنید و {toFaDigits(holdDays)} روز نگه دارید؛ با سفارش محدود.
              </p>
              <p>
                سود خالص تخمینی <MoneyValue value={chosen.result.net} signed tone="auto" digits={2} className="font-semibold" />
                <SourceTag kind="estimate" className="ms-1.5" />
              </p>
              {onOpenExecution && (
                <Button variant="ghost" size="sm" className="text-accent" icon={<Bot />} onClick={onOpenExecution}>
                  دیدن جزئیات در «اجرا و پایش دلتا»
                </Button>
              )}
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted">{alloc.delta > 0 ? 'فعلاً اجرا نمی‌شود؛ سرمایهٔ آن نقد می‌ماند.' : 'در این برنامه نیست.'}</p>
          )}
        </li>
        <li className="rounded-card border border-divider p-3.5">
          <p className="text-xs font-bold text-ink">۳. سفارش‌های خرید پله‌ای</p>
          {plan.steps.length && price !== null ? (
            <div className="mt-1 space-y-1.5 text-sm text-muted">
              <ul className="space-y-1">
                {plan.steps.map((st) => (
                  <li key={st.dropPct} className="flex justify-between gap-2">
                    <span>
                      خرید <MoneyValue value={st.usd} digits={0} /> در <MoneyValue value={st.price} digits={0} className="font-semibold text-ink" />
                    </span>
                    <span className="text-2xs text-subtle">−{toFaDigits(st.dropPct)}٪</span>
                  </li>
                ))}
              </ul>
              <p>
                اگر همه پر شوند، قیمت سربه‌سر کل <bdi dir="ltr">{symbol}</bdi> شما{' '}
                {prior.avgCost !== null && (
                  <>
                    از <MoneyValue value={prior.avgCost} digits={0} /> به{' '}
                  </>
                )}
                <MoneyValue value={after.avgCost} digits={0} className="font-semibold text-ink" /> می‌رسد. ترجیحاً خرید اسپات (بدون اهرم و لیکویید)؛ اگر بازار اسپات ندارد، Long بدون اهرم (وثیقه = ارزش) — که فاندینگ هم دارد.
              </p>
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted">در این برنامه نیست.</p>
          )}
        </li>
        <li className="rounded-card border border-divider p-3.5">
          <p className="text-xs font-bold text-ink">۴. ذخیرهٔ فرصت</p>
          <p className="mt-1 text-sm text-muted">
            <MoneyValue value={alloc.opportunity} digits={0} className="font-semibold text-ink" /> از سرمایهٔ سرمایه‌گذاری بیرون از پله‌ها — برای ریزش‌های عمیق‌تر یا بازده کم‌ریسک.
          </p>
        </li>
      </ol>

      <div className="space-y-2">
        <h3 className="text-sm font-bold text-ink">بررسی‌ها</h3>
        <ul className="space-y-2.5">
          <Check ok title="ذخیرهٔ زندگی در برنامه نیست" />
          {chosen && (
            <Check ok={chosen.result.net >= 0} title={chosen.result.net >= 0 ? 'دلتا نوترال بعد از کارمزد منفی نیست' : 'دلتا نوترال بعد از کارمزد منفی است'}>
              {chosen.result.net < 0 && (
                <>
                  پوینت این حجم باید دست‌کم <MoneyValue value={chosen.result.breakEvenPoints} digits={2} /> بیرزد؛ یا صبر کنید تا اختلاف فاندینگ بهتر شود.
                </>
              )}
            </Check>
          )}
          {chosen && (
            <Check ok={deltaSafe} title={deltaSafe ? `دلتا نوترال در ریزش ${fmtPct(plan.deepestDropPct)} (عمیق‌ترین پله) لیکویید نمی‌شود` : 'دلتا نوترال پیش از عمیق‌ترین پله لیکویید می‌شود'}>
              {liq !== null && <>نزدیک‌ترین لیکویید با حرکت {fmtPct(liq)} قیمت است.{!deltaSafe && ' اهرم را ۱× کنید.'}</>}
            </Check>
          )}
          {chosen && (
            <Check ok title="پول بین دو صرافی تقسیم شده">
              هر صرافی <MoneyValue value={alloc.delta / 2} digits={0} />؛ اگر برای یکی اتفاقی بیفتد، همهٔ پول در خطر نیست.
            </Check>
          )}
          <Check ok={false} title="بی‌ریسکِ صددرصد نیست">
            ریسک خود صرافی‌ها، پل بین شبکه‌ها و جدا شدن استیبل‌کوین از دلار می‌ماند. پوینت و ایردراپ تضمینی نیست. خرید پله‌ای یعنی عمداً دارایی بیشتری داشتن.
          </Check>
        </ul>
      </div>

      <div className="rounded-card border border-divider bg-surface-2/40 p-3.5 text-xs leading-6 text-muted">
        <p className="font-bold text-ink">چه نکنید</p>
        <ul className="mt-1 list-disc space-y-0.5 ps-4">
          <li>باز و بسته کردن مکرر دلتا نوترال فقط برای حجم — کارمزد بالا، پوینت کمتر.</li>
          <li>Long و Short بین حساب‌های خودتان روی یک صرافی — ممکن است پوینت حذف شود.</li>
          <li>واریز، معامله و برداشت پشت‌سرهم.</li>
        </ul>
      </div>
      <p className="text-2xs text-subtle">این برنامه آموزشی است، نه توصیهٔ سرمایه‌گذاری. هیچ سفارشی ثبت نمی‌شود؛ برنامه فقط در همین مرورگر ذخیره می‌شود.</p>
    </StepCard>
  );
}

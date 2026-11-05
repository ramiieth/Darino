/**
 * «اگر به‌جای تتر/یو اس دی سی، دلار بازده‌دار خریده بودم» — دستیار چهارقدمی (هم‌ساختار دستیار آپشن Derive):
 *   ۱ پول شما         تتر یا یو اس دی سی، مبلغ (از موجودی کیف پول اگر معلوم است) و از چه زمانی
 *   ۲ ریسک‌پذیری      کدام نوع بازار قابل‌قبول است؛ پاداش توکنی، بازارهای نهادی، دورهٔ انتظار خروج
 *   ۳ اگر خریده بودم  سود هر بازار در همان بازه از APY روزانهٔ واقعی (DeFiLlama)، در برابر نگه داشتن بی‌کار
 *   ۴ از امروز به بعد  نرخ امروز در برابر میانگین گذشته، برآورد آینده، چک‌لیست خرید، توضیح دستیار و (پیشرفته) درآمد اهرمی
 * همهٔ اعداد در domain/stableYield حساب می‌شوند؛ دستیار فقط توضیح می‌دهد. هیچ تراکنشی انجام نمی‌شود.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react';
import { Field, Input } from '@/shared/components/ui/Input';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { KeyValueList, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { jsonGet, jsonSet } from '@/shared/lib/storage';
import { cn } from '@/shared/lib/cn';
import { toFaDigits } from '@/shared/utils/formatters';
import { useConnectedStore } from '@/features/connected/data/store';
import { useYieldPools } from '@/features/defi-loop/data/useYieldLoops';
import { fetchPoolChart } from '@/features/defi-loop/data/yieldsService';
import { StableCarryPanel } from '@/features/defi-loop/presentation/StableCarryPanel';
import { Check, Chips, StepCard } from '@/features/calculators/presentation/plan/PlanWizard';
import { AssistantExplain } from '@/features/calculators/presentation/options/AssistantExplain';
import { LineChartCard, fmtFaDate } from '@/features/calculators/presentation/CalcCharts';
import { parseNum } from '@/features/calculators/presentation/parse';
import { KIND_FA, PROJECT_FA, pickStableMarkets, simulateYield, stableBalance, type MarketKind, type StableMarket, type YieldSim } from '../domain/stableYield';

const STEPS = ['پول شما', 'ریسک‌پذیری', 'اگر خریده بودم', 'از امروز به بعد'] as const;
const STORE_KEY = 'sim:stable:v1';
const DAY = 86_400_000;

type Coin = 'USDT' | 'USDC';
type Period = '30' | '90' | '180' | '365';
type Risk = 'conservative' | 'moderate' | 'aggressive';

interface Saved {
  step: number;
  coin: Coin;
  amount: string;
  period: Period;
  risk: Risk;
  rewards: boolean;
  /** بازارهای فقط‌نهادی (KYC/حداقل سرمایهٔ بالا) هم نمایش داده شوند */
  restricted: boolean;
  /** فقط بازارهای بدون دورهٔ انتظار خروج */
  noLockup: boolean;
  pick: string | null;
}
const DEFAULTS: Saved = { step: 0, coin: 'USDT', amount: '', period: '180', risk: 'moderate', rewards: false, restricted: false, noLockup: false, pick: null };

const RISK_KINDS: Record<Risk, MarketKind[]> = {
  conservative: ['treasury', 'savings', 'lending'],
  moderate: ['treasury', 'savings', 'lending', 'vault', 'credit'],
  aggressive: ['treasury', 'savings', 'lending', 'vault', 'credit', 'synthetic', 'newer']
};
const RISK_HINT: Record<Risk, string> = {
  conservative: 'فقط اوراق خزانه، نرخ پس‌انداز پروتکل‌های بزرگ و وام‌دهی ساده.',
  moderate: 'به‌علاوهٔ خزانه‌های مدیریت‌شده (مورفو) و وام اعتباری نهادی (میپل).',
  aggressive: 'به‌علاوهٔ دلار مصنوعی (اتنا) و پروتکل‌های جدیدتر با بازده بالاتر.'
};
const PERIOD_FA: Record<Period, string> = { '30': '۱ ماه', '90': '۳ ماه', '180': '۶ ماه', '365': '۱ سال' };
const COIN_FA: Record<Coin, string> = { USDT: 'تتر', USDC: 'یو اس دی سی' };

const llamaUrl = (pool: string) => `https://defillama.com/yields/pool/${pool}`;
const nameOf = (m: StableMarket) => PROJECT_FA[m.project] ?? m.project;

interface Row {
  m: StableMarket;
  sim: YieldSim | null;
  loading: boolean;
}

export function StableYieldWizard() {
  const topRef = useRef<HTMLDivElement>(null);
  const [s, setS] = useState<Saved>(() => ({ ...DEFAULTS, ...jsonGet<Partial<Saved>>(STORE_KEY, {}) }));
  const set = <K extends keyof Saved>(k: K, v: Saved[K]) => setS((p) => ({ ...p, [k]: v }));
  useEffect(() => jsonSet(STORE_KEY, s), [s]);

  // موجودی واقعی از «دارایی من» (همان دادهٔ کیف پول‌ها؛ درخواست تازه‌ای زده نمی‌شود)
  const wallets = useConnectedStore((x) => x.wallets);
  const held = useMemo(() => stableBalance(Object.values(wallets).flatMap((w) => w.data?.positions ?? [])), [wallets]);
  const heldOfCoin = s.coin === 'USDT' ? held.usdt : held.usdc;
  const typed = parseNum(s.amount);
  // خالی = موجودی کیف پول (اگر معلوم است) وگرنه ۱۰٬۰۰۰ دلار نمونه — همان که در جای‌خالی نوشته شده
  const amount = Number.isFinite(typed) ? typed : s.amount.trim() === '' ? (heldOfCoin > 0 ? heldOfCoin : 10_000) : null;
  const amountOk = amount !== null && amount > 0;

  const yields = useYieldPools();
  const all = useMemo(() => pickStableMarkets(yields.pools), [yields.pools]);
  const allowed = useMemo(
    () => all.filter((m) => RISK_KINDS[s.risk].includes(m.kind) && (s.restricted || !m.restricted) && (!s.noLockup || !m.lockup)),
    [all, s.risk, s.restricted, s.noLockup]
  );

  const [now] = useState(() => Date.now());
  const days = Number(s.period);
  const from = now - days * DAY;
  // تاریخچهٔ APY فقط از قدم ۳ به بعد و فقط برای بازارهای مجاز (کش ۶ ساعت در IndexedDB)
  const charts = useQueries({
    queries: allowed.map((m) => ({
      queryKey: ['yield-chart', m.pool],
      queryFn: () => fetchPoolChart(m.pool),
      staleTime: 6 * 60 * 60_000,
      enabled: s.step >= 2
    }))
  });
  const chartStamp = charts.map((q) => q.dataUpdatedAt).join(',');
  const rows: Row[] = useMemo(
    () =>
      allowed
        .map((m, i) => {
          const q = charts[i];
          const data = q?.data;
          return { m, loading: !!q?.isLoading, sim: data && data.length ? simulateYield(data, from, now, s.rewards) : null };
        })
        .sort((a, b) => (b.sim?.growth ?? 0) - (a.sim?.growth ?? 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allowed, chartStamp, from, now, s.rewards]
  );
  // بازاری که در این بازه عملاً سود دلاری پایه نداد (مثلاً فقط پاداش توکنی، وقتی پاداش حساب نمی‌شود) کنار می‌رود
  const MIN_AVG_APY = 0.1;
  const visible = rows.filter((r) => r.loading || !r.sim || (r.sim.avgApy ?? 0) >= MIN_AVG_APY);
  const hiddenLow = rows.length - visible.length;
  const ready = visible.filter((r) => r.sim && r.sim.coveredDays > 0);
  const loadingCharts = rows.some((r) => r.loading);
  const best = ready[0] ?? null;
  const picked = rows.find((r) => r.m.pool === s.pick) ?? best;

  const profitOf = (r: Row | null) => (r?.sim && amount ? amount * (r.sim.growth - 1) : null);
  const canNext = [amountOk, allowed.length > 0, ready.length > 0, true][s.step];
  const go = (d: number) => {
    set('step', Math.max(0, Math.min(STEPS.length - 1, s.step + d)));
    topRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const top = ready.slice(0, 5);
  // نمودار فقط بعد از رسیدن همهٔ تاریخچه‌ها (تغییر پی‌درپی خط‌ها انیمیشن Chart.js را می‌شکست)؛ سود، نه کل ارزش، تا فاصله‌ها دیده شود
  const chart = useMemo(() => {
    if (loadingCharts || !top.length || !amount) return null;
    const base = top[0].sim!.daily;
    const step = Math.max(1, Math.floor(base.length / 60));
    const idx = base.map((_, i) => i).filter((i) => i % step === 0 || i === base.length - 1);
    return {
      labels: idx.map((i) => fmtFaDate(base[i].t)),
      datasets: [
        ...top.map((r) => ({ label: `${nameOf(r.m)} ${r.m.symbol}`, data: idx.map((i) => amount * ((r.sim!.daily[i]?.growth ?? r.sim!.growth) - 1)) })),
        { label: `${COIN_FA[s.coin]} بی‌کار`, data: idx.map(() => 0), dashed: true, color: 'chart-6' as const }
      ]
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingCharts, top.map((r) => r.m.pool).join(), chartStamp, amount, s.coin, s.rewards]);
  const chartKey = `${top.map((r) => r.m.pool).join()}|${s.period}|${s.rewards}`;

  return (
    <div ref={topRef} className="mx-auto w-full max-w-3xl scroll-mt-4 space-y-5">
      <Surface className="p-3.5 md:p-4">
        <p className="mb-1 text-xs leading-6 text-muted">
          تتر و یو اس دی سی بی‌کار هیچ سودی نمی‌دهند. «دلار بازده‌دار» توکن یا سپرده‌ای دلاری است که سود می‌گیرد: از اوراق خزانهٔ آمریکا، وام دادن یا فاندینگ.
          این ابزار در چهار قدم نشان می‌دهد اگر پولتان را در هر بازار گذاشته بودید، با نرخ‌هایی که واقعاً پرداخت شد، چقدر سود کرده بودید.
        </p>
        <p className="mb-2.5 text-2xs text-subtle">نرخ روزانهٔ هر بازار از DeFiLlama خوانده می‌شود. همهٔ اعداد در خود اپ حساب می‌شوند و هیچ تراکنشی انجام نمی‌شود.</p>
        <ol className="grid grid-cols-4 gap-1.5" aria-label="قدم‌ها">
          {STEPS.map((t, i) => {
            const here = i === s.step;
            return (
              <li key={t}>
                <button type="button" onClick={() => (i <= s.step || (amountOk && allowed.length) ? set('step', i) : undefined)} aria-current={here ? 'step' : undefined} className="flex w-full flex-col items-center gap-1.5">
                  <span className={cn('h-1.5 w-full rounded-full', here ? 'bg-accent' : i < s.step ? 'bg-accent/50' : 'bg-surface-2')} />
                  <span className={cn('max-w-full truncate text-2xs font-semibold', here ? 'text-accent' : i < s.step ? 'text-ink' : 'text-subtle')}>
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
        <StepCard n={1} title="چه دلاری دارید و چقدر؟" sub="مبلغی که الان به‌صورت تتر یا یو اس دی سی نگه داشته‌اید و می‌خواهید ببینید چقدر می‌توانست سود بدهد.">
          <Chips<Coin> label="دلار شما" value={s.coin} onChange={(v) => set('coin', v)} options={[{ value: 'USDT', label: 'تتر (USDT)' }, { value: 'USDC', label: 'یو اس دی سی (USDC)' }]} />
          <Field
            label="مبلغ"
            hint={heldOfCoin > 0 ? <>موجودی {COIN_FA[s.coin]} کیف پول‌های شما: <MoneyValue value={heldOfCoin} />. خالی بگذارید تا همین حساب شود.</> : 'خالی بگذارید تا با ۱۰,۰۰۰ دلار نمونه حساب شود. اگر کیف پولتان را در «دارایی من» وصل کرده باشید، موجودی خودکار پیشنهاد می‌شود.'}
            error={s.amount.trim() !== '' && !amountOk ? 'یک عدد بزرگ‌تر از صفر وارد کنید.' : null}
          >
            <Input dir="ltr" inputMode="decimal" value={s.amount} placeholder={heldOfCoin > 0 ? String(Math.round(heldOfCoin)) : '10000'} onChange={(e) => set('amount', e.target.value)} suffix="دلار" />
          </Field>
          {heldOfCoin > 0 && s.amount.trim() !== '' && (
            <button type="button" className="text-xs font-semibold text-accent underline" onClick={() => set('amount', '')}>
              همان موجودی کیف پول
            </button>
          )}
          <Chips<Period> label="از چه زمانی؟" value={s.period} onChange={(v) => set('period', v)} options={(Object.keys(PERIOD_FA) as Period[]).map((p) => ({ value: p, label: `${PERIOD_FA[p]} پیش` }))} />
        </StepCard>
      )}

      {s.step === 1 && (
        <StepCard n={2} title="چقدر ریسک قبول می‌کنید؟" sub="دلار بازده‌دار هم بی‌ریسک نیست. هرچه بازده بالاتر، ریسک پشتش بیشتر. فقط بازارهایی که با این انتخاب جورند در قدم بعد مقایسه می‌شوند.">
          <Chips<Risk> label="ریسک‌پذیری" value={s.risk} onChange={(v) => set('risk', v)} options={[{ value: 'conservative', label: 'محتاط' }, { value: 'moderate', label: 'متعادل' }, { value: 'aggressive', label: 'جسور' }]} />
          <p className="text-xs leading-6 text-muted">{RISK_HINT[s.risk]}</p>
          <div className="space-y-2.5">
            <Toggle checked={s.rewards} onChange={(v) => set('rewards', v)} title="پاداش توکنی هم حساب شود" sub="بعضی بازارها بخشی از سود را با توکن خودشان می‌دهند؛ قیمت آن توکن تضمین‌شده نیست. پیش‌فرض فقط سود دلاری پایه حساب می‌شود." />
            <Toggle checked={s.restricted} onChange={(v) => set('restricted', v)} title="بازارهای فقط‌نهادی هم نشان داده شوند" sub="مثل BUIDL بلک‌راک: احراز هویت و معمولاً حداقل سرمایهٔ بالا لازم است؛ کاربر عادی معمولاً نمی‌تواند مستقیم بخرد." />
            <Toggle checked={s.noLockup} onChange={(v) => set('noLockup', v)} title="فقط بازارهای بدون دورهٔ انتظار خروج" sub="مثلاً خروج از sUSDe اتنا ۷ روز طول می‌کشد. اگر ممکن است ناگهان پول لازم شوید، این را روشن کنید." />
          </div>
          {yields.loading && !all.length ? (
            <Skeleton className="h-16 w-full" />
          ) : !all.length ? (
            <Notice tone="warn" title="فهرست بازارها دریافت نشد">اتصال به DeFiLlama برقرار نشد. چند دقیقهٔ دیگر دوباره امتحان کنید.</Notice>
          ) : (
            <KindSummary all={all} allowed={allowed} />
          )}
        </StepCard>
      )}

      {s.step === 2 && (
        <StepCard
          n={3}
          title={`اگر ${PERIOD_FA[s.period]} پیش به‌جای ${COIN_FA[s.coin]} دلار بازده‌دار خریده بودید`}
          sub="هر بازار با همان نرخ روزانه‌ای که در این مدت واقعاً پرداخت کرد حساب شده، نه نرخ امروز. مبنا: همین پول به‌صورت تتر یا یو اس دی سی بی‌کار، یعنی صفر سود."
        >
          {loadingCharts && !ready.length ? (
            <Skeleton className="h-48 w-full" />
          ) : !ready.length ? (
            <Notice tone="warn" title="تاریخچهٔ بازارها دریافت نشد">تاریخچهٔ نرخ‌ها از DeFiLlama نرسید. کمی بعد دوباره امتحان کنید.</Notice>
          ) : (
            <>
              {best && amount && (
                <div className="rounded-card border border-accent/40 bg-accent-soft/40 p-4">
                  <p className="text-xs text-muted">بیشترین سود در این بازه</p>
                  <p className="mt-1 text-2xl font-extrabold text-positive md:text-3xl">
                    <MoneyValue value={profitOf(best)} signed />
                  </p>
                  <p className="mt-1 text-xs leading-6 text-muted">
                    با {nameOf(best.m)} <bdi dir="ltr" className="font-latin">{best.m.symbol}</bdi> روی {best.m.chain}: <MoneyValue value={amount} /> می‌شد <MoneyValue value={amount * best.sim!.growth} />.
                    همین پول به‌صورت {COIN_FA[s.coin]} بی‌کار هنوز <MoneyValue value={amount} /> است.
                  </p>
                </div>
              )}
              {loadingCharts && <p className="text-2xs text-subtle">بقیهٔ بازارها در حال دریافت‌اند…</p>}
              <ul className="space-y-2" aria-label="بازارها از بیشترین سود">
                {visible.map((r, i) => (
                  <li key={r.m.pool}>
                    <MarketRow r={r} rank={i + 1} amount={amount ?? 0} active={picked?.m.pool === r.m.pool} onPick={() => set('pick', r.m.pool)} />
                  </li>
                ))}
              </ul>
              {hiddenLow > 0 && <p className="text-2xs text-subtle">{toFaDigits(hiddenLow)} بازار که در این مدت سود دلاری پایه نداشتند (فقط پاداش توکنی یا تقریباً صفر) نمایش داده نمی‌شوند.</p>}
              {chart && <LineChartCard key={chartKey} title="سود انباشته در هر بازار" description="پنج بازار برتر؛ خط‌چین صفر = نگه داشتن بی‌کار" labels={chart.labels} datasets={chart.datasets} />}
              {picked?.sim && <MarketDetail r={picked} amount={amount ?? 0} days={days} />}
            </>
          )}
        </StepCard>
      )}

      {s.step === 3 && picked && (
        <StepCard n={4} title="از امروز به بعد چه؟" sub="گذشته تضمین آینده نیست. نرخ امروز، برآورد چند ماه آینده با همین نرخ، و چیزهایی که پیش از خرید باید بدانید.">
          <Forward r={picked} amount={amount ?? 0} coin={s.coin} />
          <AssistantExplain
            payload={() => ({
              question: 'کاربر تتر/یو اس دی سی بی‌کار دارد. نتیجهٔ «اگر دلار بازده‌دار خریده بودم» را توضیح بده و بگو کدام گزینه با ریسک‌پذیری او جور است.',
              coin: s.coin,
              amountUsd: amount,
              periodDays: days,
              risk: s.risk,
              rewardsIncluded: s.rewards,
              markets: ready.slice(0, 8).map((r) => ({
                name: nameOf(r.m),
                symbol: r.m.symbol,
                chain: r.m.chain,
                kind: KIND_FA[r.m.kind].label,
                risk: KIND_FA[r.m.kind].risk,
                profitUsd: profitOf(r),
                periodReturnPct: (r.sim!.growth - 1) * 100,
                avgApyPct: r.sim!.avgApy,
                apyNowPct: r.m.apyNow,
                rewardApyNowPct: r.m.rewardNow,
                tvlUsd: r.m.tvlUsd,
                lockup: r.m.lockup,
                institutionalOnly: r.m.restricted,
                partialHistory: r.sim!.partial
              })),
              selected: picked.m.symbol
            })}
            op="analyze-stable"
          />
          <Disclosure summary="پیشرفته: درآمد با اهرم روی دلار (نرخ امروز)">
            <div className="pt-3">
              <StableCarryPanel />
            </div>
          </Disclosure>
        </StepCard>
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

/* ---------------- اجزا ---------------- */

function Toggle({ checked, onChange, title, sub }: { checked: boolean; onChange: (v: boolean) => void; title: string; sub: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-control border border-divider p-3">
      <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--c-brand-500))]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-xs leading-6 text-muted">{sub}</span>
      </span>
    </label>
  );
}

function KindSummary({ all, allowed }: { all: readonly StableMarket[]; allowed: readonly StableMarket[] }) {
  const kinds = [...new Set(all.map((m) => m.kind))];
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-ink">
        {toFaDigits(allowed.length)} بازار از {toFaDigits(all.length)} بازار بزرگ دلاری با انتخاب شما مقایسه می‌شود.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {kinds.map((k) => {
          const n = allowed.filter((m) => m.kind === k).length;
          return (
            <li key={k} className={cn('rounded-control border p-2.5 text-xs leading-6', n ? 'border-divider' : 'border-divider opacity-50')}>
              <span className="font-semibold text-ink">{KIND_FA[k].label}</span> <span className="text-subtle">({toFaDigits(n)})</span>
              <span className="block text-muted">{KIND_FA[k].risk}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MarketRow({ r, rank, amount, active, onPick }: { r: Row; rank: number; amount: number; active: boolean; onPick: () => void }) {
  const { m, sim } = r;
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      className={cn('flex w-full items-center gap-3 rounded-card border p-3 text-start transition-colors', active ? 'border-accent bg-accent-soft' : 'border-divider bg-card hover:border-divider-strong')}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-bold text-ink">{toFaDigits(rank)}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-bold text-ink">{nameOf(m)}</span>
          <bdi dir="ltr" className="font-latin text-xs text-muted">{m.symbol}</bdi>
          <span className="text-2xs text-subtle">{m.chain}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1">
          <Badge tone="neutral" className="text-2xs">{KIND_FA[m.kind].label}</Badge>
          {m.direct && <Badge tone="info" className="text-2xs">مستقیم با {m.direct === 'USDT' ? 'تتر' : 'یو اس دی سی'}</Badge>}
          {m.lockup && <Badge tone="warn" className="text-2xs">خروج: {m.lockup}</Badge>}
          {m.restricted && <Badge tone="warn" className="text-2xs">فقط نهادی</Badge>}
          {sim?.partial && sim.firstDay && <Badge tone="warn" className="text-2xs">تاریخچه از {fmtFaDate(sim.firstDay)}</Badge>}
        </span>
      </span>
      <span className="shrink-0 text-end">
        {r.loading ? (
          <Skeleton className="h-5 w-20" />
        ) : sim ? (
          <>
            <span className="block text-sm font-extrabold text-positive"><MoneyValue value={amount * (sim.growth - 1)} signed /></span>
            <span className="block text-2xs text-muted">میانگین سالانه <PercentValue value={sim.avgApy} signed={false} /></span>
          </>
        ) : (
          <span className="text-2xs text-subtle">بدون تاریخچه</span>
        )}
      </span>
    </button>
  );
}

function MarketDetail({ r, amount, days }: { r: Row; amount: number; days: number }) {
  const { m, sim } = r;
  if (!sim) return null;
  return (
    <Surface variant="subtle" className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-ink">{nameOf(m)} <bdi dir="ltr" className="font-latin">{m.symbol}</bdi></h3>
        <a href={llamaUrl(m.pool)} target="_blank" rel="noreferrer" className="ms-auto inline-flex items-center gap-1 text-xs text-accent underline">
          DeFiLlama <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <KeyValueList
        rows={[
          { label: `سود ${toFaDigits(days)} روز`, value: <MoneyValue value={amount * (sim.growth - 1)} signed /> },
          { label: 'بازده همین بازه', value: <PercentValue value={(sim.growth - 1) * 100} /> },
          { label: 'میانگین نرخ سالانه در بازه', value: <PercentValue value={sim.avgApy} signed={false} /> },
          { label: 'نرخ سالانهٔ امروز', value: <PercentValue value={m.apyNow} signed={false} /> },
          { label: 'سپردهٔ کل بازار', value: <MoneyValue value={m.tvlUsd} compact /> },
          { label: 'روزهای دارای داده', value: `${toFaDigits(sim.coveredDays)} از ${toFaDigits(sim.totalDays)}` }
        ]}
      />
      <p className="text-xs leading-6 text-muted">
        <span className="font-semibold text-ink">{KIND_FA[m.kind].label}:</span> {KIND_FA[m.kind].risk}
      </p>
      <p className="text-2xs leading-5 text-subtle">
        محاسبه از نرخ روزانه است و نوسان قیمت خود توکن (مثلاً جدا شدن کوتاه از ۱ دلار) در آن نیست. سود نهایی هنگام خروج به قیمت فروش همان روز بستگی دارد.
      </p>
    </Surface>
  );
}

function Forward({ r, amount, coin }: { r: Row; amount: number; coin: Coin }) {
  const { m, sim } = r;
  const apy = m.apyNow ?? 0;
  const est = (d: number) => amount * (Math.pow(1 + apy / 100, d / 365) - 1);
  const lower = sim?.avgApy !== null && sim?.avgApy !== undefined && apy < sim.avgApy - 0.5;
  return (
    <div className="space-y-4">
      <div className="grid gap-2.5 sm:grid-cols-3">
        {[30, 90, 365].map((d) => (
          <div key={d} className="rounded-card border border-divider p-3">
            <p className="text-2xs text-muted">برآورد {d === 365 ? '۱ سال' : `${toFaDigits(d / 30)} ماه`} آینده</p>
            <p className="mt-1 text-lg font-extrabold text-positive"><MoneyValue value={est(d)} signed /></p>
          </div>
        ))}
      </div>
      <p className="text-2xs leading-5 text-subtle">برآورد با نرخ امروز ({toFaDigits(apy.toFixed(2))}٪ سالانه) و بدون تغییر آن است؛ نرخ این بازارها هر روز عوض می‌شود.</p>
      <ul className="space-y-2.5">
        <Check ok={!lower} title={lower ? 'نرخ امروز از میانگین این مدت کمتر است' : 'نرخ امروز نزدیک یا بالای میانگین این مدت است'}>
          میانگین سالانه در بازه {toFaDigits((sim?.avgApy ?? 0).toFixed(2))}٪، امروز {toFaDigits(apy.toFixed(2))}٪. سود گذشته را با نرخ امروز تکرار نکنید.
        </Check>
        <Check ok={!!m.direct} title={m.direct ? `مستقیم با ${m.direct === 'USDT' ? 'تتر' : 'یو اس دی سی'} سپرده می‌شود` : `برای خرید، ${coin === 'USDT' ? 'تتر' : 'یو اس دی سی'} را باید به ${m.symbol} تبدیل کنید`}>
          {m.direct ? 'بدون تبدیل و هزینهٔ سواپ.' : 'تبدیل کارمزد و لغزش قیمت دارد؛ برای مبلغ کم سود چندماهه را می‌خورد.'}
        </Check>
        <Check ok={!m.lockup} title={m.lockup ? `خروج زمان‌بر است (${m.lockup})` : 'خروج بدون دورهٔ انتظار اعلام‌شده'}>
          {m.lockup ? 'در این مدت پول در دسترس نیست؛ فروش زودتر در بازار ممکن است با تخفیف باشد.' : 'در شرایط عادی هر وقت بخواهید خارج می‌شوید؛ در استفادهٔ بالای بازار وام ممکن است صف باشد.'}
        </Check>
        <Check ok={!m.restricted} title={m.restricted ? 'فقط برای سرمایه‌گذار نهادی' : 'برای کاربر عادی در دسترس'}>
          {m.restricted ? 'احراز هویت و حداقل سرمایهٔ بالا لازم است؛ برای مقایسه نشان داده شده.' : 'از کیف پول خودتان و بدون احراز هویت (طبق قوانین هر پروتکل).'}
        </Check>
        <Check ok={m.rewardNow < (m.apyNow ?? 0) / 3} title={m.rewardNow > 0 ? 'بخشی از سود امروز پاداش توکنی است' : 'سود امروز دلاری است، نه پاداش توکنی'}>
          {m.rewardNow > 0 ? `${toFaDigits(m.rewardNow.toFixed(2))}٪ از نرخ امروز پاداش توکنی است و قیمتش تضمین‌شده نیست.` : 'پاداش توکنی ندارد.'}
        </Check>
        <Check ok={m.tvlUsd >= 200e6} title={m.tvlUsd >= 200e6 ? 'بازار بزرگ و پرسپرده' : 'بازار نسبتاً کوچک'}>
          سپردهٔ کل <MoneyValue value={m.tvlUsd} compact />. بازار بزرگ‌تر یعنی خروج راحت‌تر، نه بی‌ریسک بودن.
        </Check>
      </ul>
    </div>
  );
}

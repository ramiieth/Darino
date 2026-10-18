/**
 * ⑬ دستیار تحلیل آپشن (Derive) — چهار قدم:
 *   ۱ بازار Derive (+ افزودن دستی نام/لوگو، فقط بازارهای آپشن‌دار Derive)
 *   ۲ سرمایه، دیدگاه، تحمل ریسک و سررسید
 *   ۳ وضعیت بازار، استراتژی پیشنهادی (۱ اصلی + ۲ جایگزین)، نمودار سود و زیان، مراحل اجرا، اعداد کلیدی، توضیح دستیار
 *   ۴ سناریوها، اثر IV و Theta، برنامهٔ خروج، «سود در صعود و نزول»، هشدارها
 * همهٔ اعداد در domain (options، optionStrategies) از دادهٔ واقعی Derive حساب می‌شوند؛ دستیار Gemini فقط توضیح می‌دهد.
 * هیچ سفارشی ثبت نمی‌شود.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react';
import { Field, Input } from '@/shared/components/ui/Input';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { KeyValueList, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { jsonGet, jsonSet } from '@/shared/lib/storage';
import { toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import {
  buildStrategy,
  capitalTier,
  chooseStrategies,
  exitPlan,
  historicalVol,
  holdingOf,
  ivRegime,
  pickByDelta,
  PREMIUM_SELLER,
  RISK_PCT,
  scenarios,
  sensitivities,
  singleCombo,
  marketBreadth,
  replayScenarios,
  viewFromMarket,
  comboScenarios,
  monteCarlo,
  pnlZones,
  STRATEGY_FA,
  trendOf,
  type BuiltStrategy,
  type ChainOption,
  type IvRegime,
  type MarketInputs,
  type OptionLeg,
  type RiskProfile,
  type View
} from '@/features/calculators/domain';
import {
  loadCustomMarkets,
  removeCustomMarket,
  saveCustomMarket,
  useDeriveChain,
  useDeriveChains,
  useDeriveHistory,
  useDeriveMarkets,
  validateCustomMarket,
  type CustomMarket,
  type DeriveChain
} from '@/features/calculators/data/deriveOptions';
import { usePlannerLots } from '@/features/calculators/data/plannerLots';
import { useMarkets } from '@/features/markets/pipeline/useMarkets';
import type { MarketAsset } from '@/features/markets/pipeline/types';
import { parseNum } from '../parse';
import { Check, Chips, StepCard } from '../plan/PlanWizard';
import { SourceTag } from '../delta/CapitalFlow';
import { OptionsPayoffChart } from './OptionsPayoffChart';
import { AssistantExplain } from './AssistantExplain';
import { ComboPlanner } from './ComboPlanner';
import { DeepScenarios } from './DeepScenarios';
import { atmIvOf, cents, daysTo, DAY, expiryMs, faDate, fmtPct, fmtQty } from './helpers';

const STEPS = ['بازار', 'سرمایه و دیدگاه', 'استراتژی', 'سناریو و خروج'] as const;
const STORE_KEY = 'calc:options:v1';
/** قواعد ثابت و اعلام‌شدهٔ نقدینگی */
const WIDE_SPREAD_PCT = 10;
const LOW_OI = 10;
const LOW_MARKET_OI_USD = 100_000;

interface Saved {
  step: number;
  currency: string;
  capital: string;
  risk: RiskProfile;
  view: View;
  expiry: string | null;
  pick: number;
  /** قدم ۴: تحلیل همین استراتژی یا ترکیب چند بازار */
  mode: 'single' | 'combo';
}
const DEFAULTS: Saved = { step: 0, currency: 'ETH', capital: '', risk: 'moderate', view: 'unsure', expiry: null, pick: 0, mode: 'single' };

const REGIME_FA: Record<IvRegime, string> = { rich: 'گران', cheap: 'ارزان', fair: 'منصفانه' };
const VIEW_FA: Record<View, string> = { bull: 'صعودی', bear: 'نزولی', neutral: 'خنثی', unsure: 'نامطمئن' };
const RISK_FA: Record<RiskProfile, string> = { conservative: 'محتاط', moderate: 'متعادل', aggressive: 'جسور' };

/** بهترین سررسید برای تعادل Theta و ریسک: ۱۴ تا ۴۵ روز، نزدیک به ۳۰ */
export function pickExpiry(expiries: readonly string[], now: number): string | null {
  const inBand = expiries.filter((e) => daysTo(e, now) >= 14 && daysTo(e, now) <= 45);
  const pool = inBand.length ? inBand : expiries.filter((e) => daysTo(e, now) >= 7);
  if (!pool.length) return expiries[0] ?? null;
  return pool.reduce((a, b) => (Math.abs(daysTo(b, now) - 30) < Math.abs(daysTo(a, now) - 30) ? b : a));
}

/* ---------------- اجزا ---------------- */

function MarketLogo({ symbol, custom, image, size }: { symbol: string; custom?: CustomMarket; image?: string | null; size: number }) {
  const src = custom?.logo || image;
  if (src) return <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full bg-card object-contain" style={{ width: size, height: size }} />;
  return <AssetLogo symbol={symbol} kind="crypto" size={size} />;
}

function Metric2({ label, children, tag }: { label: string; children: ReactNode; tag?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-field border border-divider bg-card p-3">
      <p className="flex flex-wrap items-center gap-1.5 text-2xs font-semibold text-muted">
        {label}
        {tag}
      </p>
      <div className="mt-1 text-sm font-bold text-ink">{children}</div>
    </div>
  );
}

/* ---------------- دستیار ---------------- */

export function OptionsWizard() {
  const topRef = useRef<HTMLDivElement>(null);
  const [s, setS] = useState<Saved>(() => ({ ...DEFAULTS, ...jsonGet<Partial<Saved>>(STORE_KEY, {}) }));
  const set = <K extends keyof Saved>(k: K, v: Saved[K]) => setS((p) => ({ ...p, [k]: v }));
  useEffect(() => jsonSet(STORE_KEY, s), [s]);
  const [customs, setCustoms] = useState<CustomMarket[]>(() => loadCustomMarkets());
  const now = Date.now();

  const marketsQ = useDeriveMarkets();
  // قیمت زندهٔ همان نمادها از بخش «بازارها» (همان کش و Refresh مرکزی)
  const live = useMarkets('crypto_top_200');
  const liveOf = (sym: string): MarketAsset | null => live.assets.find((x) => x.symbol.toUpperCase() === sym) ?? null;
  const markets = useMemo(() => [...(marketsQ.data?.markets ?? [])].sort((a, b) => b.optionOi * (b.spot ?? 0) - a.optionOi * (a.spot ?? 0)), [marketsQ.data]);
  const market = markets.find((m) => m.currency === s.currency) ?? markets[0] ?? null;
  const currency = market?.currency ?? '';
  const custom = customs.find((c) => c.symbol === currency);

  const base = useDeriveChain(currency, null);
  const expiries = base.data?.expiries ?? [];
  const expiry = s.expiry && expiries.includes(s.expiry) ? s.expiry : pickExpiry(expiries, now);
  const chainQ = useDeriveChain(currency, expiry);
  const chain = chainQ.data ?? (base.data?.expiry === expiry ? base.data : undefined);
  // ساختار زمانی: نزدیک‌ترین، انتخاب‌شده، و نزدیک ۹۰ روز
  const far = expiries.length ? expiries.reduce((a, b) => (Math.abs(daysTo(b, now) - 90) < Math.abs(daysTo(a, now) - 90) ? b : a)) : null;
  const termExp = [...new Set([expiries.find((e) => daysTo(e, now) >= 2) ?? expiries[0], far].filter((e): e is string => !!e && e !== expiry))];
  const termQ = useDeriveChains(currency, termExp);
  const history = useDeriveHistory(currency);
  const prior = usePlannerLots(currency);
  const holdingsQty = holdingOf(prior.lots).qty;

  const capital = s.capital.trim() === '' ? NaN : parseNum(s.capital);
  const capitalOk = capital > 0;

  const analysis = useMemo(() => {
    if (!chain || !expiry) return null;
    const spot = chain.index ?? market?.spot ?? null;
    const forward = chain.forward ?? spot;
    if (!spot || !forward) return null;
    const T = Math.max(0, (expiryMs(expiry) - now) / (365 * DAY));
    const atmIv = atmIvOf(chain);
    const closes = (history.data?.candles ?? []).map((c) => c.close);
    const hv = historicalVol(closes.slice(-31));
    const regime = ivRegime(atmIv, hv);
    const p25 = pickByDelta(chain.options, 'P', 0.25);
    const c25 = pickByDelta(chain.options, 'C', 0.25);
    const skew = p25?.iv != null && c25?.iv != null ? p25.iv - c25.iv : null;
    const term = [{ expiry, iv: atmIv }, ...termExp.map((e, i) => ({ expiry: e, iv: atmIvOf(termQ[i]?.data) }))].sort((a, b) => a.expiry.localeCompare(b.expiry));
    const trend = trendOf(closes);
    const m: MarketInputs = {
      forward,
      spot,
      T,
      atmIv,
      minAmount: chain.minAmount ?? 0.1,
      amountStep: chain.amountStep ?? chain.minAmount ?? 0.01,
      takerFeeRate: chain.takerFeeRate,
      baseFee: chain.baseFee,
      feeCapRate: chain.feeCapRate
    };
    const cap = capitalOk ? capital : 0;
    const riskCap = (cap * RISK_PCT[s.risk]) / 100;
    const ids = chooseStrategies(s.view, regime, holdingsQty > 0, cap, s.risk);
    const built = ids.map((id) => buildStrategy(id, chain.options, m, riskCap, holdingsQty)).filter((b): b is BuiltStrategy => b !== null);
    const missing = [
      ...(atmIv === null ? ['IV در پول'] : []),
      ...(hv === null ? ['نوسان تاریخی (تاریخچهٔ قیمت ناکافی)'] : []),
      ...(chain.takerFeeRate === null ? ['کارمزد Derive'] : []),
      ...(chain.perp.fundingHourly === null ? ['فاندینگ Perp'] : [])
    ];
    return { spot, forward, T, days: T * 365, atmIv, hv, regime, skew, term, trend, m, riskCap, built, missing };
  }, [chain, expiry, market?.spot, history.data, termQ.map((q) => q.dataUpdatedAt).join(), capital, s.risk, s.view, holdingsQty]);

  const strategy = analysis?.built[Math.min(s.pick, Math.max(0, (analysis?.built.length ?? 1) - 1))] ?? null;
  const canNext = [!!market, capitalOk, true, true][s.step];
  const go = (d: number) => {
    set('step', Math.max(0, Math.min(STEPS.length - 1, s.step + d)));
    topRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div ref={topRef} className="mx-auto w-full max-w-3xl scroll-mt-4 space-y-5">
      <Surface className="p-3.5 md:p-4">
        <p className="mb-2.5 text-2xs text-subtle">داده از Derive (derive.xyz)؛ اعداد در اپ حساب می‌شوند و دستیار فقط توضیح می‌دهد. هیچ سفارشی ثبت نمی‌شود.</p>
        <ol className="grid grid-cols-4 gap-1.5" aria-label="قدم‌ها">
          {STEPS.map((t, i) => {
            const here = i === s.step;
            return (
              <li key={t}>
                <button type="button" onClick={() => (i <= s.step || (market && capitalOk) ? set('step', i) : undefined)} aria-current={here ? 'step' : undefined} className="flex w-full flex-col items-center gap-1.5">
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
        <StepCard n={1} title="کدام بازار آپشن Derive؟" sub="فقط دارایی‌هایی که در Derive آپشن دارند. می‌توانید برای هرکدام نام و لوگوی دلخواه هم بگذارید.">
          {marketsQ.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : marketsQ.isError || !markets.length ? (
            <Notice tone="warn" title="بازارهای Derive خوانده نشد">کمی بعد دوباره امتحان کنید.</Notice>
          ) : (
            <>
              <div role="radiogroup" aria-label="بازارهای Derive" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {markets.map((m) => {
                  const c = customs.find((x) => x.symbol === m.currency);
                  const oiUsd = m.spot ? m.optionOi * m.spot : null;
                  const active = m.currency === currency;
                  return (
                    <button
                      key={m.currency}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setS((p) => ({ ...p, currency: m.currency, expiry: null, pick: 0 }))}
                      className={cn('flex min-w-0 flex-col gap-1.5 rounded-card border p-3 text-start transition-colors', active ? 'border-accent bg-accent-soft' : 'border-divider bg-card hover:border-divider-strong')}
                    >
                      <span className="flex items-center gap-2">
                        <MarketLogo symbol={m.currency} custom={c} image={liveOf(m.currency)?.image} size={28} />
                        <span className="min-w-0">
                          <bdi dir="ltr" className="block font-latin text-sm font-bold text-ink">
                            {m.currency}
                          </bdi>
                          {c?.name && <span className="block truncate text-2xs text-muted">{c.name}</span>}
                        </span>
                      </span>
                      <span className="text-xs text-muted">
                        <MoneyValue value={m.spot} />
                      </span>
                      <span className="text-2xs text-subtle">
                        Open Interest {oiUsd === null ? '—' : <MoneyValue value={oiUsd} compact />}
                        {oiUsd !== null && oiUsd < LOW_MARKET_OI_USD && <Badge tone="warn" className="ms-1 text-2xs">کم‌نقد</Badge>}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-2xs text-subtle">«کم‌نقد» = Open Interest کمتر از ۱۰۰ هزار دلار (قاعدهٔ ثابت اپ).</p>
              <AddMarket markets={markets} customs={customs} onChange={setCustoms} />
            </>
          )}
        </StepCard>
      )}

      {s.step === 1 && (
        <StepCard n={2} title="سرمایه و دیدگاه شما" sub="فقط سرمایه را تایپ می‌کنید؛ بقیه انتخابی است. موجودی فعلی از «بهای تمام‌شده» خوانده می‌شود.">
          <Field label="سرمایهٔ این معاملات (دلار)" error={s.capital.trim() !== '' && !capitalOk ? 'عدد مثبت وارد کنید.' : null}>
            <Input dir="ltr" inputMode="decimal" autoComplete="off" value={s.capital} onChange={(e) => set('capital', e.target.value)} suffix="دلار" placeholder="0" />
          </Field>
          {capitalOk && (
            <p className="-mt-2 text-xs leading-6 text-muted">
              دستهٔ سرمایه:{' '}
              <b className="text-ink">{capitalTier(capital) === 'small' ? 'کمتر از ۱٬۰۰۰ دلار — فقط ریسک‌محدود' : capitalTier(capital) === 'medium' ? '۱٬۰۰۰ تا ۱۰٬۰۰۰ دلار — اسپردها، Covered Call و Cash-Secured Put' : 'بیش از ۱۰٬۰۰۰ دلار — ترکیب چند استراتژی و پوشش ریسک'}</b>
              . سقف ریسک هر معامله ({fmtPct(RISK_PCT[s.risk], 1)}): <MoneyValue value={(capital * RISK_PCT[s.risk]) / 100} digits={2} className="font-semibold text-ink" />
            </p>
          )}
          <p className="rounded-field bg-surface-2/60 px-3 py-2 text-xs text-muted">
            موجودی فعلی <bdi dir="ltr">{currency}</bdi>: {holdingsQty > 0 ? <b className="text-ink">{fmtQty(holdingsQty)}</b> : 'ثبت نشده'} <span className="text-subtle">· از «بهای تمام‌شده»</span>
          </p>
          <Chips label="دیدگاه شما" value={s.view} onChange={(x) => setS((p) => ({ ...p, view: x, pick: 0 }))} options={(Object.keys(VIEW_FA) as View[]).map((v) => ({ value: v, label: VIEW_FA[v] }))} />
          <Chips label="تحمل ریسک" value={s.risk} onChange={(x) => setS((p) => ({ ...p, risk: x, pick: 0 }))} options={(Object.keys(RISK_FA) as RiskProfile[]).map((r) => ({ value: r, label: `${RISK_FA[r]} (${fmtPct(RISK_PCT[r], 1)})` }))} />
          {expiries.length > 0 && (
            <Chips
              label="سررسید (پیشنهاد: ۱۴ تا ۴۵ روز)"
              value={expiry ?? ''}
              onChange={(x) => set('expiry', x)}
              options={expiries.filter((e) => daysTo(e, now) >= 1 && daysTo(e, now) <= 120).map((e) => ({ value: e, label: `${faDate(e)} · ${toFaDigits(Math.round(daysTo(e, now)))} روز` }))}
            />
          )}
        </StepCard>
      )}

      {s.step === 2 && (
        <StepCard n={3} title="استراتژی پیشنهادی" sub="بر اساس دیدگاه شما، IV در برابر نوسان تاریخی و اندازهٔ سرمایه؛ ۱ اصلی و حداکثر ۲ جایگزین.">
          {!analysis ? (
            <Skeleton className="h-60 w-full" />
          ) : (
            <>
              <MarketSummary a={analysis} currency={currency} funding={chain?.perp.fundingHourly ?? null} />
              {!analysis.built.length ? (
                <Notice tone="warn" title="استراتژی مناسبی ساخته نشد">در این سررسید Strike با قیمت معتبر برای Deltaهای لازم پیدا نشد؛ سررسید دیگری انتخاب کنید.</Notice>
              ) : (
                <>
                  <Chips
                    label="استراتژی"
                    value={Math.min(s.pick, analysis.built.length - 1)}
                    onChange={(x) => set('pick', x)}
                    options={analysis.built.map((b, i) => ({ value: i, label: `${i === 0 ? 'اصلی' : `جایگزین ${toFaDigits(i)}`}: ${STRATEGY_FA[b.id]}` }))}
                  />
                  {strategy && <StrategyView b={strategy} a={analysis} currency={currency} expiry={expiry!} chain={chain!} reason={reasonOf(s.view, analysis.regime, holdingsQty > 0)} />}
                  {strategy && (
                    <AssistantExplain
                      payload={() => assistantPayload(strategy, analysis, { live: liveOf(currency), liveAll: markets.map((m) => ({ symbol: m.currency, a: liveOf(m.currency), deriveIndex: m.spot })), liveQuotes: live.assets, liveSyncedAt: live.lastSyncAt ?? null, currency, name: custom?.name ?? currency, capital, holdingsQty, view: s.view, risk: s.risk, expiry: expiry!, chain: chain! })}
                    />
                  )}
                </>
              )}
            </>
          )}
        </StepCard>
      )}

      {s.step === 3 && (
        <StepCard n={4} title="سناریوها و برنامهٔ خروج" sub="کجا بفروشیم، در هر حرکت قیمت چه کنیم، و IV و زمان چه اثری دارند.">
          <Chips
            label="تحلیل"
            value={s.mode}
            onChange={(x) => set('mode', x)}
            options={[
              { value: 'single', label: `همین استراتژی (${currency})` },
              { value: 'combo', label: 'ترکیب پیشنهادی چند بازار' }
            ]}
          />
          {s.mode === 'combo' ? (
            <>
              <ComboPlanner markets={markets} capital={capitalOk ? capital : 0} risk={s.risk} />
              <Education />
            </>
          ) : !analysis || !strategy ? (
            <p className="text-sm text-muted">ابتدا در قدم ۳ استراتژی ساخته شود.</p>
          ) : (
            <>
              <ScenariosView b={strategy} a={analysis} />
              <ExitView b={strategy} days={analysis.days} />
              <Disclosure summary="تحلیل عمیق: بازه‌های سود و زیان، ۱۶ سناریو با علت، شبیه‌سازی">
                <DeepScenarios combo={singleCombo(strategy, { currency, spot: analysis.spot, days: analysis.days, expiry: expiry!, atmIv: analysis.atmIv, hv: analysis.hv, regime: analysis.regime, chain: chain!.options, m: analysis.m, beta: 1, corr: 1, oiUsd: null })} />
              </Disclosure>
              <Education />
              <Warnings b={strategy} a={analysis} />
            </>
          )}
          <p className="text-2xs leading-5 text-subtle">
            این تحلیل آموزشی است و توصیه مالی قطعی نیست؛ پیش از معامله ریسک خود را بسنجید و فقط با سرمایه‌ای معامله کنید که تحمل از دست دادنش را دارید.
          </p>
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

type Analysis = NonNullable<ReturnType<typeof useAnalysisType>>;
// فقط برای نوع: خروجی useMemo بالا
declare function useAnalysisType(): {
  spot: number;
  forward: number;
  T: number;
  days: number;
  atmIv: number | null;
  hv: number | null;
  regime: IvRegime | null;
  skew: number | null;
  term: { expiry: string; iv: number | null }[];
  trend: ReturnType<typeof trendOf>;
  m: MarketInputs;
  riskCap: number;
  built: BuiltStrategy[];
  missing: string[];
} | null;

function reasonOf(view: View, regime: IvRegime | null, holder: boolean): string {
  const iv = regime === 'rich' ? 'IV گران است، پس فروش پرمیوم (Theta مثبت) به‌صرفه‌تر است' : regime === 'cheap' ? 'IV ارزان است، پس خرید آپشن به‌صرفه‌تر است' : 'IV نزدیک نوسان تاریخی است';
  const v = view === 'bull' ? 'دیدگاه صعودی' : view === 'bear' ? 'دیدگاه نزولی' : view === 'neutral' ? 'دیدگاه خنثی' : 'جهت نامطمئن';
  return `${v}؛ ${iv}.${holder ? ' چون از این دارایی دارید، استراتژی‌های پوشش‌دار هم در نظر گرفته شد.' : ''} ریسک هر معامله به سقف ریسک شما محدود است.`;
}

/* ---------------- افزودن دستی ---------------- */

function AddMarket({ markets, customs, onChange }: { markets: { currency: string }[]; customs: CustomMarket[]; onChange: (c: CustomMarket[]) => void }) {
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [logo, setLogo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 150_000) return setError('تصویر لوگو بزرگ است (حداکثر حدود ۱۵۰ کیلوبایت).');
    const r = new FileReader();
    r.onload = () => setLogo(String(r.result ?? ''));
    r.readAsDataURL(f);
  };
  const add = () => {
    const m: CustomMarket = { symbol: symbol.trim().toUpperCase(), name: name.trim() || symbol.trim().toUpperCase(), logo: logo.trim() || null };
    const err = validateCustomMarket(m, markets as never);
    setError(err);
    if (err) return;
    onChange(saveCustomMarket(customs, m));
    setSymbol('');
    setName('');
    setLogo('');
  };
  return (
    <Disclosure summary="افزودن دستی بازار (نام و لوگوی دلخواه)">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="نماد (Symbol)" error={error}>
            <Input dir="ltr" autoComplete="off" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="ETH" />
          </Field>
          <Field label="نام">
            <Input autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} placeholder="اتریوم" />
          </Field>
        </div>
        <Field label="لوگو (آدرس https، اختیاری)">
          <Input dir="ltr" autoComplete="off" value={logo.startsWith('data:') ? '' : logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://…" />
        </Field>
        <label className="block text-xs text-muted">
          یا بارگذاری تصویر (حداکثر ۱۵۰ کیلوبایت):{' '}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="text-xs" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <Button size="sm" icon={<Plus />} onClick={add} disabled={!symbol.trim()}>
          افزودن
        </Button>
        {customs.length > 0 && (
          <ul className="divide-y divide-divider rounded-field border border-divider">
            {customs.map((c) => (
              <li key={c.symbol} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                <MarketLogo symbol={c.symbol} custom={c} size={22} />
                <bdi dir="ltr" className="font-latin font-bold text-ink">
                  {c.symbol}
                </bdi>
                <span className="min-w-0 flex-1 truncate text-xs text-muted">{c.name}</span>
                <button type="button" aria-label={`حذف ${c.symbol}`} className="text-muted hover:text-negative" onClick={() => onChange(removeCustomMarket(customs, c.symbol))}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-2xs text-subtle">فقط در همین مرورگر ذخیره می‌شود. دارایی‌ای که در Derive آپشن ندارد پذیرفته نمی‌شود.</p>
      </div>
    </Disclosure>
  );
}

/* ---------------- قدم ۳ ---------------- */

function MarketSummary({ a, currency, funding }: { a: Analysis; currency: string; funding: number | null }) {
  const ratio = a.atmIv !== null && a.hv ? a.atmIv / a.hv : null;
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric2 label="قیمت شاخص" tag={<SourceTag kind="live" />}>
          <MoneyValue value={a.spot} />
        </Metric2>
        <Metric2 label="روند ۷ / ۳۰ روز">
          {a.trend.change7d === null ? '—' : <PercentValue value={a.trend.change7d} digits={1} />} / {a.trend.change30d === null ? '—' : <PercentValue value={a.trend.change30d} digits={1} />}
        </Metric2>
        <Metric2 label="IV در پول / HV ۳۰ روز">
          {a.atmIv === null ? '—' : fmtPct(a.atmIv * 100)} / {a.hv === null ? '—' : fmtPct(a.hv * 100)}
        </Metric2>
        <Metric2 label="IV">
          {a.regime ? <Badge tone={a.regime === 'rich' ? 'warn' : a.regime === 'cheap' ? 'gain' : 'neutral'}>{REGIME_FA[a.regime]}</Badge> : '—'}
          {ratio !== null && <span className="ms-1 text-2xs font-normal text-subtle">{toFaDigits(ratio.toFixed(2))}× HV</span>}
        </Metric2>
      </div>
      <p className="text-xs leading-6 text-muted">
        <bdi dir="ltr">{currency}</bdi> {a.trend.aboveMa20 === null ? '' : a.trend.aboveMa20 ? 'بالای میانگین ۲۰ روزه است' : 'زیر میانگین ۲۰ روزه است'}.{' '}
        {a.skew !== null && <>Skew (Put با Delta ۰٫۲۵ منهای Call با Delta ۰٫۲۵): {fmtPct(a.skew * 100)} — {a.skew > 0 ? 'Putها گران‌ترند (بازار نگران ریزش است)' : 'Callها گران‌ترند'}. </>}
        ساختار زمانی IV: {a.term.map((t) => `${faDate(t.expiry)} ${t.iv === null ? '—' : fmtPct(t.iv * 100)}`).join(' · ')}.
        {funding !== null && <> فاندینگ Perp: {fmtPct(funding * 8760 * 100)} سالانه.</>}
      </p>
      <p className="text-2xs text-subtle">قاعده: IV بیش از ۱٫۱ برابر HV «گران»، کمتر از ۰٫۹ برابر «ارزان».</p>
      {a.missing.length > 0 && <p className="text-2xs text-warn">داده‌های ناقص: {a.missing.join('، ')}.</p>}
    </div>
  );
}

function StrategyView({ b, a, currency, expiry, chain, reason }: { b: BuiltStrategy; a: Analysis; currency: string; expiry: string; chain: DeriveChain; reason: string }) {
  const options = b.legs.filter((l): l is OptionLeg => l.kind === 'option');
  const spotLeg = b.legs.find((l) => l.kind === 'spot');
  const bookOf = (l: OptionLeg): ChainOption | undefined => chain.options.find((o) => o.name === l.name);
  const g = b.stats.greeks;
  return (
    <div className="space-y-4">
      <div className="rounded-card border border-accent/40 bg-accent-soft/40 p-3.5">
        <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink">
          {STRATEGY_FA[b.id]}
          {PREMIUM_SELLER.has(b.id) ? <Badge tone="info">دریافت پرمیوم (Theta مثبت)</Badge> : <Badge tone="neutral">پرداخت پرمیوم</Badge>}
          {b.unlimitedLoss && <Badge tone="loss">⚠️ ضرر نامحدود</Badge>}
        </p>
        <p className="mt-1 text-xs leading-6 text-muted">{reason}</p>
      </div>

      {b.unlimitedLoss && (
        <Notice tone="error" title="⚠️ ضرر نامحدود">این استراتژی پوشش ندارد و ضررش سقف ندارد. فقط برای سرمایهٔ بالا و کاربر باتجربه؛ برای مبتدی ممنوع است.</Notice>
      )}
      {b.belowMinimum && (
        <Notice tone="warn" title="سرمایه برای این اندازه کافی نیست">
          حتی حداقل اندازهٔ قرارداد Derive ({fmtQty(a.m.minAmount)} <bdi dir="ltr">{currency}</bdi>) ریسکی بیش از سقف ریسک شما (<MoneyValue value={a.riskCap} digits={2} />) دارد. اعداد زیر برای همین حداقل‌اند؛ اسپرد باریک‌تر یا سرمایهٔ بیشتر لازم است.
        </Notice>
      )}

      <div>
        <h3 className="mb-2 text-sm font-bold text-ink">مراحل اجرا</h3>
        <ol className="space-y-2">
          <li className="text-xs leading-6 text-muted">
            <b className="text-ink">سررسید:</b> {faDate(expiry)} ({toFaDigits(Math.round(a.days))} روز) — بین ۱۴ و ۴۵ روز، برای تعادل Theta و ریسک.
          </li>
          {spotLeg && (
            <li className="text-xs leading-6 text-muted">
              <b className="text-ink">دارایی پایه:</b> {fmtQty(spotLeg.qty)} <bdi dir="ltr">{currency}</bdi> که از قبل دارید (پوشش).
            </li>
          )}
          {options.map((l, i) => {
            const o = bookOf(l);
            return (
              <li key={l.name} className="rounded-field border border-divider p-3 text-xs leading-6">
                <p className="font-bold text-ink">
                  قدم {toFaDigits(i + 1)}: {l.side === 'buy' ? 'خرید' : 'فروش'} {fmtQty(l.qty)} {l.type === 'C' ? 'Call' : 'Put'} با Strike <MoneyValue value={l.strike} digits={0} />
                </p>
                <p className="text-muted">
                  سفارش Limit نزدیک Mid: <MoneyValue value={l.premium} digits={2} className="font-semibold text-ink" /> هر واحد · Bid <MoneyValue value={o?.bid ?? null} digits={2} /> / Ask <MoneyValue value={o?.ask ?? null} digits={2} /> · Delta{' '}
                  {o?.delta == null ? '—' : toFaDigits(o.delta.toFixed(2))} · IV {o?.iv == null ? '—' : fmtPct(o.iv * 100)} · OI {o?.oi == null ? '—' : toFaDigits(Math.round(o.oi).toLocaleString('en-US'))}
                </p>
                <p className="font-latin text-2xs text-subtle" dir="ltr">
                  {l.name}
                </p>
              </li>
            );
          })}
        </ol>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold text-ink">اعداد کلیدی</h3>
        <KeyValueList
          dense
          rows={[
            { label: b.stats.netPremium >= 0 ? 'پرمیوم دریافتی' : 'هزینهٔ پرمیوم', value: <MoneyValue value={Math.abs(b.stats.netPremium)} digits={2} /> },
            { label: 'حداکثر سود', value: b.stats.maxProfit === null ? 'نامحدود' : <MoneyValue value={b.stats.maxProfit} digits={2} className="text-positive" /> },
            { label: 'حداکثر ضرر', value: b.stats.maxLoss === null ? <span className="text-negative">⚠️ نامحدود</span> : <MoneyValue value={-b.stats.maxLoss} digits={2} tone="loss" /> },
            { label: 'سربه‌سر (Breakeven)', value: b.stats.breakevens.length ? b.stats.breakevens.map((x) => toFaDigits(Math.round(x).toLocaleString('en-US'))).join(' و ') : '—' },
            { label: 'احتمال تقریبی سود', hint: 'از توزیع ضمنی با IV در پول', value: b.stats.pop === null ? '—' : fmtPct(b.stats.pop * 100) },
            { label: 'وثیقه / مارجین تقریبی', hint: 'مدل مارجین Derive ممکن است عدد دیگری بدهد', value: <MoneyValue value={b.collateral} digits={2} /> },
            { label: 'کارمزد تقریبی باز کردن', value: <MoneyValue value={b.fees} digits={2} /> },
            {
              label: 'Greeks کل (Delta · Theta روزانه · Vega)',
              value: (
                <bdi dir="ltr">
                  {g.delta === null ? '—' : toFaDigits(g.delta.toFixed(3))} · {g.theta === null ? '—' : toFaDigits(g.theta.toFixed(2))} · {g.vega === null ? '—' : toFaDigits(g.vega.toFixed(2))}
                </bdi>
              )
            }
          ]}
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold text-ink">نمودار سود و زیان</h3>
        <OptionsPayoffChart legs={b.legs} spot={a.spot} T={a.T} breakevens={b.stats.breakevens} />
      </div>
    </div>
  );
}

/** همهٔ اعداد از پیش محاسبه‌شده برای دستیار */
function assistantPayload(
  b: BuiltStrategy,
  a: Analysis,
  ctx: {
    live: MarketAsset | null;
    liveAll: { symbol: string; a: MarketAsset | null; deriveIndex: number | null }[];
    liveQuotes: readonly MarketAsset[];
    liveSyncedAt: number | null;
    currency: string;
    name: string; capital: number; holdingsQty: number; view: View; risk: RiskProfile; expiry: string; chain: DeriveChain }
): Record<string, unknown> {
  const r2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
  const xp = exitPlan(b, a.days);
  const one = singleCombo(b, { currency: ctx.currency, spot: a.spot, days: a.days, expiry: ctx.expiry, atmIv: a.atmIv, hv: a.hv, regime: a.regime, chain: ctx.chain.options, m: a.m, beta: 1, corr: 1, oiUsd: null });
  const mc = (v: 'iv' | 'hv') => {
    const x = monteCarlo(one, v);
    return x && { probabilityOfProfit: x.pProfit, meanPnl: r2(x.expected), worst5pctMean: r2(x.worst5), best5pctMean: r2(x.best5) };
  };
  return {
    asset: { symbol: ctx.currency, name: ctx.name, source: 'Derive (derive.xyz)' },
    // قیمت زندهٔ بخش «بازارها»ی دارینو؛ محاسبات آپشن با شاخص Derive (spot) انجام شده تا با زنجیره سازگار باشد
    liveMarkets: {
      source: 'بخش بازارهای دارینو',
      syncedAt: ctx.liveSyncedAt ? new Date(ctx.liveSyncedAt).toISOString() : null,
      selected: ctx.live && { price: ctx.live.price, change24hPct: ctx.live.change24h, change7dPct: ctx.live.change7d, change30dPct: ctx.live.change30d, marketCap: ctx.live.marketCap, snapshot: ctx.live.snapshot === true },
      selectedVsDeriveIndexPct: ctx.live?.price && a.spot ? r2((ctx.live.price / a.spot - 1) * 100) : null,
      breadthTop200: marketBreadth(ctx.liveQuotes),
      suggestedViewFromTrend: viewFromMarket(ctx.live, marketBreadth(ctx.liveQuotes)),
      deriveMarkets: ctx.liveAll.map((x) => ({ symbol: x.symbol, price: x.a?.price ?? null, change24hPct: x.a?.change24h ?? null, change7dPct: x.a?.change7d ?? null, deriveIndex: x.deriveIndex, snapshot: x.a?.snapshot === true }))
    },
    capitalUsd: ctx.capital,
    capitalTier: capitalTier(ctx.capital),
    riskCapUsd: r2(a.riskCap),
    holdings: ctx.holdingsQty,
    spot: r2(a.spot),
    perp: ctx.chain.perp,
    userView: VIEW_FA[ctx.view],
    riskProfile: RISK_FA[ctx.risk],
    market: { atmIv: a.atmIv, historicalVol30d: a.hv, ivRegime: a.regime, skew25d: a.skew, termStructure: a.term, trend: a.trend },
    expiry: ctx.expiry,
    daysToExpiry: Math.round(a.days),
    minContract: a.m.minAmount,
    strategy: {
      name: STRATEGY_FA[b.id],
      legs: b.legs.map((l) => (l.kind === 'spot' ? { kind: 'spot', qty: l.qty, entry: r2(l.entry) } : { side: l.side, type: l.type, strike: l.strike, qty: l.qty, limitMid: r2(l.premium), instrument: l.name, delta: l.delta, iv: l.iv })),
      qty: b.qty,
      belowMinimum: b.belowMinimum,
      netPremium: r2(b.stats.netPremium),
      maxProfit: r2(b.stats.maxProfit),
      maxLoss: r2(b.stats.maxLoss),
      unlimitedLoss: b.unlimitedLoss,
      breakevens: b.stats.breakevens,
      probabilityOfProfit: b.stats.pop,
      collateral: r2(b.collateral),
      fees: r2(b.fees),
      greeks: b.stats.greeks,
      liquidity: { worstSpreadPct: b.worstSpreadPct, minOpenInterest: b.minOi },
      scenarios: scenarios(b, a.spot, a.T).map((s) => ({ movePct: s.movePct, price: r2(s.price), pnlAtExpiry: r2(s.atExpiry), pnlMidway: r2(s.midway) })),
      sensitivities: Object.fromEntries(Object.entries(sensitivities(b, a.spot, a.T)).map(([k, v]) => [k, r2(v)])),
      exitPlan: xp,
      profitZones: pnlZones(b.legs, a.forward, a.T, a.atmIv).map((z) => ({ from: r2(z.lo), to: r2(z.hi), profit: z.profit, probability: z.prob })),
      deepScenarios: comboScenarios(one).map((r) => ({ scenario: r.label, pnl: r2(r.total.total), priceEffect: r2(r.total.price), ivEffect: r2(r.total.vol), timeEffect: r2(r.total.time), why: r.perLeg[0]?.why })),
      replayScenarios: replayScenarios(one, ctx.liveQuotes).map((r) => ({ scenario: r.label, movePct: r2((r.perLeg[0]?.move ?? 0) * 100), pnl: r2(r.total.total), why: r.perLeg[0]?.why })),
      monteCarlo: { volEqualsIv: mc('iv'), volEqualsHv30: mc('hv') }
    },
    alternatives: a.built.filter((x) => x !== b).map((x) => STRATEGY_FA[x.id]),
    missingData: a.missing
  };
}

/* ---------------- قدم ۴ ---------------- */

function actionFor(pnl: number, tp: number | null, sl: number | null): string {
  if (tp !== null && pnl >= tp) return 'بستن و برداشت سود';
  if (sl !== null && pnl <= -sl) return 'بستن (حد ضرر)';
  if (pnl < 0) return 'پایش؛ نزدیک حد ضرر Roll یا بستن';
  return 'نگه‌داری تا هدف';
}

function ScenariosView({ b, a }: { b: BuiltStrategy; a: Analysis }) {
  const rows = scenarios(b, a.spot, a.T);
  const xp = exitPlan(b, a.days);
  const sens = sensitivities(b, a.spot, a.T);
  const label: Record<number, string> = { 20: 'صعود شدید', 5: 'صعود ملایم', 0: 'خنثی / بدون حرکت', [-5]: 'نزول ملایم', [-20]: 'نزول شدید' };
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-ink">سناریوها (سود/زیان در سررسید)</h3>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full table-fixed border-separate border-spacing-0 text-xs">
          <caption className="sr-only">سناریوهای قیمت</caption>
          <thead>
            <tr className="text-2xs text-subtle">
              <th scope="col" className="w-[28%] pb-2 text-start font-semibold">
                سناریو
              </th>
              <th scope="col" className="pb-2 text-end font-semibold">
                قیمت
              </th>
              <th scope="col" className="pb-2 text-end font-semibold">
                سود/زیان
              </th>
              <th scope="col" className="w-[30%] pb-2 text-end font-semibold">
                اقدام
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.movePct}>
                <th scope="row" className="border-t border-divider py-2 text-start font-normal text-muted">
                  {label[r.movePct] ?? ''}
                  <span className="block text-2xs text-subtle">
                    {r.movePct > 0 ? '+' : ''}
                    {toFaDigits(r.movePct)}٪
                  </span>
                </th>
                <td className="border-t border-divider py-2 text-end font-semibold text-ink">
                  <MoneyValue value={r.price} digits={0} />
                </td>
                <td className="border-t border-divider py-2 text-end font-bold">
                  <MoneyValue value={cents(r.atExpiry)} signed tone="auto" digits={2} />
                </td>
                <td className="border-t border-divider py-2 text-end text-2xs text-muted">{actionFor(r.atExpiry, xp.takeProfitUsd, xp.stopLossUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <KeyValueList
        dense
        rows={[
          { label: 'افزایش IV ده واحد (IV Spike)، قیمت ثابت', value: <MoneyValue value={cents(sens.ivUp)} signed tone="auto" digits={2} /> },
          { label: 'کاهش IV ده واحد (IV Crush)، قیمت ثابت', value: <MoneyValue value={cents(sens.ivDown)} signed tone="auto" digits={2} /> },
          { label: 'گذر ۷ روز (Theta)، قیمت و IV ثابت', value: <MoneyValue value={cents(sens.week)} signed tone="auto" digits={2} /> }
        ]}
      />
    </div>
  );
}

function ExitView({ b, days }: { b: BuiltStrategy; days: number }) {
  const xp = exitPlan(b, days);
  const seller = PREMIUM_SELLER.has(b.id);
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-ink">برنامهٔ خروج (کجا بفروشیم)</h3>
      <ul className="space-y-2 text-xs leading-6 text-muted">
        <li>
          <b className="text-ink">حد سود:</b>{' '}
          {xp.takeProfitUsd === null ? '—' : <MoneyValue value={xp.takeProfitUsd} digits={2} className="font-semibold text-positive" />}{' '}
          {seller ? '(۵۰٪ حداکثر سود؛ فروش پرمیوم را زودتر ببندید)' : '(۱۰۰٪ هزینهٔ پرداختی، یا رسیدن به قیمت هدف)'}
        </li>
        <li>
          <b className="text-ink">حد ضرر:</b> {xp.stopLossUsd === null ? '—' : <MoneyValue value={-xp.stopLossUsd} digits={2} tone="loss" />}{' '}
          {seller ? '(۲ برابر پرمیوم دریافتی، یا لمس Strike فروخته‌شده)' : '(نصف هزینهٔ پرداختی)'}
        </li>
        <li>
          <b className="text-ink">قانون زمانی:</b> {toFaDigits(xp.closeOrRollDaysLeft)} روز مانده به سررسید ببندید یا Roll کنید (رشد Gamma Risk).
        </li>
        <li>
          <b className="text-ink">Roll:</b> اگر قیمت به Strike فروخته‌شده رسید و دیدگاهتان عوض نشده، به سررسید بعدی و Strike دورتر منتقل کنید؛ فقط وقتی پرمیوم خالص دریافتی بماند.
        </li>
      </ul>
      {xp.priceLevels.length > 0 && (
        <KeyValueList dense rows={xp.priceLevels.map((l) => ({ label: l.label, value: <MoneyValue value={l.price} digits={0} /> }))} />
      )}
    </div>
  );
}

function Education() {
  return (
    <Disclosure summary="چطور در صعود و نزول هر دو سود کنیم؟ (آموزشی)">
      <ol className="list-decimal space-y-1.5 ps-4 text-xs leading-6 text-muted">
        <li>
          <b className="text-ink">استراتژی‌های دوطرفه:</b> Long Straddle/Strangle شرط روی حرکت شدید در هر جهت است؛ Iron Condor شرط روی آرامش بازار؛ Ratio Spread سود در یک بازهٔ مشخص.
        </li>
        <li>
          <b className="text-ink">سود از گذر زمان:</b> وقتی IV گران است Premium بفروشید (Theta مثبت) و در ۵۰٪ حداکثر سود زودتر ببندید.
        </li>
        <li>
          <b className="text-ink">سود از نوسان:</b> پیش از رویدادها (ETF، FOMC، آنلاک توکن) آپشن بخرید و بعد از ریزش IV بفروشید؛ IV Crush می‌تواند حتی با حرکت درست قیمت ضرر بدهد.
        </li>
        <li>
          <b className="text-ink">مدیریت Delta (Delta-Neutral):</b> Delta کل پوزیشن را با Perp یا Spot نزدیک صفر نگه دارید (مثلاً Delta مثبت ۰٫۳ = Short همان اندازه Perp) و روزانه یا بعد از حرکت بزرگ قیمت Rebalance کنید؛ هر Rebalance کارمزد و فاندینگ دارد.
        </li>
        <li>
          <b className="text-ink">ترکیب با دارایی:</b> در بازار خنثی Covered Call روی موجودی فعلی درآمد می‌سازد؛ در بازار نزولی Collar (Put محافظ + فروش Call) کف ضرر می‌گذارد.
        </li>
        <li>
          <b className="text-ink">مدیریت سرمایه:</b> مثلاً ۵۰٪ نقد، ۳۰٪ استراتژی اصلی، ۲۰٪ پوشش ریسک؛ سررسیدها را پخش کنید؛ هرگز بیش از ۵٪ سرمایه روی یک معامله.
        </li>
      </ol>
    </Disclosure>
  );
}

function Warnings({ b, a }: { b: BuiltStrategy; a: Analysis }) {
  const wide = b.worstSpreadPct !== null && b.worstSpreadPct > WIDE_SPREAD_PCT;
  const lowOi = b.minOi !== null && b.minOi < LOW_OI;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-ink">هشدارهای ریسک</h3>
      <ul className="space-y-2.5">
        <Check ok={!b.unlimitedLoss} title={b.unlimitedLoss ? '⚠️ ضرر نامحدود — فقط سرمایهٔ بالا و کاربر باتجربه' : 'ضرر این استراتژی سقف دارد'} />
        <Check ok={!b.belowMinimum} title={b.belowMinimum ? 'سرمایه برای حداقل قرارداد Derive با سقف ریسک کافی نیست' : 'اندازه در سقف ریسک شما'}>
          سقف ریسک هر معامله <MoneyValue value={a.riskCap} digits={2} />.
        </Check>
        <Check ok={!wide} title={wide ? `اسپرد Bid/Ask زیاد است (${fmtPct(b.worstSpreadPct!)})` : 'اسپرد Bid/Ask قابل قبول است'}>
          قاعده: بیش از {toFaDigits(WIDE_SPREAD_PCT)}٪ Mid = زیاد؛ با سفارش Limit نزدیک Mid وارد شوید و صبر کنید.
        </Check>
        <Check ok={!lowOi} title={lowOi ? 'Open Interest پایین است — خروج ممکن است سخت باشد' : 'Open Interest کافی است'}>
          قاعده: کمتر از {toFaDigits(LOW_OI)} قرارداد = پایین.
        </Check>
        <Check ok={false} title="سود تضمین‌شده یا بدون ریسک نیست">
          قیمت، IV و نقدینگی تغییر می‌کنند؛ وثیقه واقعی را مدل مارجین Derive تعیین می‌کند.
        </Check>
      </ul>
    </div>
  );
}

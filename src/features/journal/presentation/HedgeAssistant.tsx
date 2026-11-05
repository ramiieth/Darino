/**
 * راهنمای جفت دلتا نوترال — بدون تایپ و بدون ثبت سفارش: عدد دقیق هر پا + لینک صفحهٔ معاملهٔ همان صرافی
 *
 *   یادآور: جفت‌های باز (پوزیشن زندهٔ لایتر رابین‌هود، آرکوس، تی‌اکس‌فلو) → عدم تعادل با سفارش دقیق اصلاح، فاندینگ منفی
 *   جفت تازه: دو صرافی، بازار (بهترین فاندینگ اول)، مبلغ آماده → اندازهٔ یکسان هر دو پا، قیمت، کارمزد، درآمد روزانه، سربه‌سر
 *   همگام با ماشین‌حساب دلتا نوترال: انتخاب آن‌جا با لینک (?pv=&pb=&pa=&pl=) همین‌جا آماده می‌شود (domain/pairHandoff.ts)
 *   اجرای سریع: قیمت سقف/کف هر پا با تحمل لغزش، ترتیب باز کردن، و بعد از باز شدن یادآور خودکار تعادل
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, BellRing, Check, Copy, ExternalLink, Scale, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { executionOrder, guardPrice, readPairHandoff, worstSlippageUsd } from '../domain/pairHandoff';
import { hedgeBase, type HedgePlan } from '../domain/hedge';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Notice } from '@/shared/components/ui/StateViews';
import { cn } from '@/shared/lib/cn';
import { useHedge } from '../data/useHedge';
import { HEDGE_VENUE_FA, openPairs, pairMarkets, planHedge, type HedgeLeg, type HedgeVenue, type OpenPair } from '../domain/hedge';
import { Chip, PresetNum, usdShort } from './quickInputs';
import { fa, parseNum, pct, pnlTone, usd } from './parts';

const PAIRS: [HedgeVenue, HedgeVenue][] = [['lighterRh', 'arcus'], ['lighterRh', 'txflow'], ['arcus', 'txflow']];
const AMOUNTS = [500, 1000, 2500, 5000, 10_000];
const units = (n: number) => fa(n, n < 1 ? 6 : n < 100 ? 4 : 2);

export function HedgeAssistant() {
  const h = useHedge();
  const pairs = useMemo(() => openPairs(h.positions, h.quotes), [h.positions, h.quotes]);
  return (
    <div className="space-y-4">
      {pairs.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink"><BellRing className="h-4 w-4 text-accent" />یادآور جفت‌های باز</h3>
          <div className="grid gap-3 lg:grid-cols-2">{pairs.map((p) => <PairCard key={p.base} p={p} />)}</div>
        </section>
      )}
      <NewPair quotes={h.quotes} status={h.status} />
    </div>
  );
}

/* ---------------- جفت‌های باز ---------------- */

function PairCard({ p }: { p: OpenPair }) {
  const ok = !p.fix;
  const lossy = p.dailyUsd !== null && p.dailyUsd < 0;
  return (
    <Surface className={cn('space-y-3 p-4', (!ok || lossy) && 'border-warn/60')}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-ink" dir="ltr">{p.base}</span>
        {ok ? <Badge tone="gain"><Scale />متعادل</Badge> : <Badge tone="warn"><Scale />نامتعادل {pct(p.imbalancePct, 1)}</Badge>}
        <span className={cn('num-ltr ms-auto text-sm font-bold', pnlTone(p.dailyUsd))}>{p.dailyUsd === null ? '—' : `${usd(p.dailyUsd, true)}/روز`}</span>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-control border border-divider bg-divider text-center">
        <Side tone="long" label={p.longs.map((x) => HEDGE_VENUE_FA[x.venue]).join(' + ')} value={units(p.longUnits)} />
        <Side tone="short" label={p.shorts.map((x) => HEDGE_VENUE_FA[x.venue]).join(' + ')} value={units(p.shortUnits)} />
      </div>
      {p.fix && (
        <div className="flex flex-wrap items-center gap-2 rounded-control bg-warn/10 p-2.5 text-xs">
          <span className="text-ink">برای تعادل: <b className={p.fix.side === 'long' ? 'text-positive' : 'text-negative'}>{p.fix.side === 'long' ? 'لانگ' : 'شورت'}</b> <b className="num-ltr">{units(p.fix.units)}</b> {p.base} در {HEDGE_VENUE_FA[p.fix.venue]}</span>
          <CopyButton value={String(p.fix.units)} />
          <OpenLink url={p.fix.url} venue={p.fix.venue} />
        </div>
      )}
      {lossy && <p className="text-xs leading-6 text-negative">فاندینگ این جفت الان برعکس شده و روزانه هزینه دارد؛ اگر ادامه داشت، هر دو پا را با همان اندازه ببندید یا جای لانگ و شورت را عوض کنید.</p>}
    </Surface>
  );
}

function Side({ tone, label, value }: { tone: 'long' | 'short'; label: string; value: string }) {
  return (
    <div className="bg-card px-2 py-2">
      <p className={cn('text-[11px] font-semibold', tone === 'long' ? 'text-positive' : 'text-negative')}>{tone === 'long' ? 'لانگ' : 'شورت'} · {label}</p>
      <p className="num-ltr mt-0.5 text-sm font-bold text-ink">{value}</p>
    </div>
  );
}

/* ---------------- جفت تازه ---------------- */

function NewPair({ quotes, status }: { quotes: ReturnType<typeof useHedge>['quotes']; status: ReturnType<typeof useHedge>['status'] }) {
  const [params] = useSearchParams();
  const handoff = useMemo(() => readPairHandoff(params), [params]);
  const [pair, setPair] = useState(0);
  const [base, setBase] = useState<string | null>(null);
  const [amount, setAmount] = useState('1000');
  const [flip, setFlip] = useState(false);
  const [longPref, setLongPref] = useState<HedgeVenue | null>(null);
  const [all, setAll] = useState(false);
  // انتخاب ماشین‌حساب دلتا نوترال → همین فرم (هر بار که لینک تازه بیاید)
  const handoffKey = handoff ? `${handoff.venues.join(',')}|${handoff.base}|${handoff.notional}|${handoff.long}` : '';
  useEffect(() => {
    if (!handoff) return;
    const i = PAIRS.findIndex(([x, y]) => handoff.venues.includes(x) && handoff.venues.includes(y));
    if (i < 0) return;
    setPair(i);
    setBase(handoff.base);
    if (handoff.notional) setAmount(String(handoff.notional));
    setFlip(false);
    setLongPref(handoff.long);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoffKey]);
  const [va, vb] = PAIRS[pair];
  const markets = useMemo(() => pairMarkets(quotes.get(va) ?? [], quotes.get(vb) ?? []), [quotes, va, vb]);
  const chosen = markets.find((m) => m.base === base) ?? (base ? markets.find((m) => m.base === hedgeBase(base)) : undefined) ?? markets[0] ?? null;
  const notional = parseNum(amount) ?? 0;
  const auto = chosen ? planHedge(chosen.a, chosen.b, notional, longPref && [chosen.a.venue, chosen.b.venue].includes(longPref) ? longPref : 'auto') : null;
  const plan = chosen && auto && flip ? planHedge(chosen.a, chosen.b, notional, auto.legs[1].venue) : auto;
  const loading = status[va] === 'loading' || status[vb] === 'loading';
  const fromCalc = !!handoff && chosen?.base === hedgeBase(handoff.base);

  return (
    <Surface variant="focal" className="space-y-4 p-4 md:p-5">
      <div className="flex items-center gap-2">
        <ArrowLeftRight className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-bold text-ink">باز کردن جفت تازه</h3>
        {fromCalc && <Badge tone="info">از ماشین‌حساب دلتا نوترال</Badge>}
        <span className="ms-auto text-[11px] text-subtle">فقط راهنما؛ سفارش را خودتان در صرافی تأیید می‌کنید</span>
      </div>
      {handoff && !fromCalc && !loading && <Notice tone="warn">بازار {handoff.base} از ماشین‌حساب در فهرست مشترک این دو صرافی پیدا نشد؛ یکی را از فهرست انتخاب کنید.</Notice>}

      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1" role="radiogroup" aria-label="دو صرافی">
        {PAIRS.map(([x, y], i) => <Chip key={i} on={pair === i} onClick={() => { setPair(i); setBase(null); setFlip(false); setLongPref(null); }}>{HEDGE_VENUE_FA[x]} + {HEDGE_VENUE_FA[y]}</Chip>)}
      </div>

      {(status[va] === 'error' || status[vb] === 'error') && <Notice tone="warn">بازارهای {[va, vb].filter((v) => status[v] === 'error').map((v) => HEDGE_VENUE_FA[v]).join(' و ')} دریافت نشد.</Notice>}

      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted">بازار <span className="font-normal text-subtle">(بیشترین اختلاف فاندینگ اول)</span></p>
        {loading && !markets.length ? <p className="text-xs text-muted">در حال دریافت بازارها…</p> : !markets.length ? <p className="text-xs text-muted">بازار مشترکی بین این دو صرافی پیدا نشد.</p> : (
          <div className="flex flex-wrap gap-1.5">
            {(all ? markets : markets.slice(0, 8)).map((m) => (
              <Chip key={m.base} on={chosen?.base === m.base} onClick={() => { setBase(m.base); setFlip(false); setLongPref(null); }} className="h-auto py-1.5">
                <span dir="ltr" className="block leading-4">{m.base}</span>
                <span className="block text-[10px] font-normal opacity-70">{m.aprPct === null ? '—' : `${pct(m.aprPct, 1)} سالانه`}</span>
              </Chip>
            ))}
            {markets.length > 8 && <Chip on={all} onClick={() => setAll((x) => !x)}>{all ? 'کمتر' : `همه (${fa(markets.length)})`}</Chip>}
          </div>
        )}
      </div>

      <PresetNum label="ارزش هر پا" values={AMOUNTS} value={amount} onChange={setAmount} format={usdShort} suffix="دلار" />

      {plan && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {plan.legs.map((l) => <LegCard key={l.side} l={l} base={plan.base} />)}
          </div>
          <button type="button" onClick={() => setFlip((x) => !x)} className="flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline">
            <ArrowLeftRight className="h-3.5 w-3.5" />جابه‌جایی لانگ و شورت{!flip && ' (الان: پیشنهاد فاندینگ)'}
          </button>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-divider bg-divider sm:grid-cols-4">
            <Stat label="درآمد فاندینگ روزانه" value={plan.dailyUsd === null ? '—' : usd(plan.dailyUsd, true)} tone={pnlTone(plan.dailyUsd)} />
            <Stat label="سالانه" value={plan.aprPct === null ? '—' : pct(plan.aprPct, 1)} tone={pnlTone(plan.aprPct)} />
            <Stat label="کارمزد باز و بسته" value={usd(plan.roundTripFeesUsd)} />
            <Stat label="سربه‌سر کارمزد" value={plan.breakevenDays === null ? '—' : `${fa(plan.breakevenDays, 1)} روز`} />
          </div>
          {plan.warnings.map((w, i) => <Notice key={i} tone="warn">{w}</Notice>)}
          <FastExecution plan={plan} />
          <p className="text-[11px] leading-5 text-subtle">قیمت‌ها مارک لحظه‌ای‌اند و فاندینگ هر ساعت عوض می‌شود. هر دو پا را پشت سر هم باز کنید؛ اندازه‌ها دقیقاً یکی است تا جفت متعادل بماند.</p>
        </>
      )}
    </Surface>
  );
}

const TOLERANCES = [0.05, 0.1, 0.25, 0.5];

/** اجرای سریع با کمترین لغزش: هر دو صفحه از قبل باز، سفارش محدود با قیمت سقف/کف، پای دوم بلافاصله بعد از اولی */
function FastExecution({ plan }: { plan: HedgePlan }) {
  const [tol, setTol] = useState(0.1);
  const [first, second] = executionOrder(plan);
  const px = (v: number) => fa(v, v < 10 ? 5 : v < 1000 ? 3 : 2);
  const sideFa = (s: 'long' | 'short') => (s === 'long' ? 'لانگ (خرید)' : 'شورت (فروش)');
  const step = (n: number, l: typeof first, how: string) => (
    <li className="flex flex-wrap items-center gap-2 text-xs leading-6">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-bold text-accent">{fa(n)}</span>
      <span className="text-ink"><b className={l.side === 'long' ? 'text-positive' : 'text-negative'}>{sideFa(l.side)}</b> <b className="num-ltr">{units(l.units)}</b> {plan.base} در {HEDGE_VENUE_FA[l.venue]} — {how} <b className="num-ltr">{px(guardPrice(l, tol))}</b> {l.side === 'long' ? '(سقف)' : '(کف)'}</span>
      <CopyButton value={String(Number(guardPrice(l, tol).toPrecision(8)))} />
    </li>
  );
  return (
    <div className="space-y-3 rounded-card border border-accent/40 bg-accent-soft/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Zap className="h-4 w-4 text-accent" />
        <h4 className="text-sm font-bold text-ink">اجرای سریع با لغزش کنترل‌شده</h4>
        <div className="ms-auto flex gap-1" role="radiogroup" aria-label="تحمل لغزش">
          {TOLERANCES.map((t) => <Chip key={t} on={tol === t} onClick={() => setTol(t)}>{pct(t, 2)}</Chip>)}
        </div>
      </div>
      <ol className="space-y-1.5">
        <li className="flex flex-wrap items-center gap-2 text-xs leading-6">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-bold text-accent">{fa(1)}</span>
          <span className="text-ink">هر دو صفحه را از قبل باز و اندازه را وارد کنید (هنوز تأیید نکنید):</span>
          <OpenLink url={first.url} venue={first.venue} />
          <OpenLink url={second.url} venue={second.venue} />
        </li>
        {step(2, first, 'سفارش محدود با قیمت')}
        {step(3, second, 'بلافاصله بعد از پر شدن پای اول، سفارش محدود/بازار تا')}
      </ol>
      <p className="text-[11px] leading-5 text-muted">
        بدترین لغزش در این تحمل حدود <b className="num-ltr">{usd(worstSlippageUsd(plan, tol))}</b>
        {plan.dailyUsd !== null && plan.dailyUsd > 0 ? <> (معادل {fa(worstSlippageUsd(plan, tol) / plan.dailyUsd, 1)} روز درآمد فاندینگ)</> : null}.
        پای اول ({HEDGE_VENUE_FA[first.venue]}) کارمزد تیکر بیشتری دارد؛ سفارش محدود (میکر) هم کارمزد را کم می‌کند و هم از لغزش جلوگیری می‌کند.
        بعد از باز شدن، دو پا خودکار در «یادآور جفت‌های باز» بالا و در «برنامهٔ معامله» دیده می‌شوند و اگر نامتعادل شدند اندازهٔ دقیق اصلاح می‌آید.
      </p>
    </div>
  );
}

function LegCard({ l, base }: { l: HedgeLeg; base: string }) {
  const long = l.side === 'long';
  return (
    <div className={cn('space-y-2 rounded-card border p-3', long ? 'border-gain/40 bg-gain/5' : 'border-negative/40 bg-negative/5')}>
      <div className="flex items-center gap-1.5">
        {long ? <TrendingUp className="h-4 w-4 text-positive" /> : <TrendingDown className="h-4 w-4 text-negative" />}
        <span className={cn('text-sm font-bold', long ? 'text-positive' : 'text-negative')}>{long ? 'لانگ (خرید)' : 'شورت (فروش)'}</span>
        <span className="ms-auto text-xs font-semibold text-ink">{HEDGE_VENUE_FA[l.venue]}</span>
      </div>
      <div className="flex items-end gap-2">
        <p className="num-ltr text-2xl font-black text-ink" dir="ltr">{units(l.units)} <span className="text-sm font-semibold text-muted">{base}</span></p>
        <CopyButton value={String(l.units)} />
      </div>
      <p className="text-[11px] text-muted"><span dir="ltr">{l.display}</span> · قیمت حدود <span className="num-ltr">{fa(l.price, l.price < 10 ? 4 : 2)}</span> · ارزش {usd(l.notional)}{l.feeUsd !== null ? ` · کارمزد ${usd(l.feeUsd)}` : ''}</p>
      {l.belowMin && <p className="text-[11px] text-negative">کمتر از حداقل سفارش این صرافی</p>}
      <OpenLink url={l.url} venue={l.venue} full />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-card p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={cn('num-ltr mt-1 text-lg font-extrabold', tone ?? 'text-ink')}>{value}</p>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label="کپی اندازه"
      onClick={() => { try { void navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); } catch { /* کلیپ‌بورد در دسترس نیست */ } }}
      className="inline-flex h-7 items-center gap-1 rounded-control border border-divider bg-card px-2 text-[11px] font-semibold text-muted hover:text-ink"
    >
      {done ? <Check className="h-3.5 w-3.5 text-positive" /> : <Copy className="h-3.5 w-3.5" />}{done ? 'کپی شد' : 'کپی'}
    </button>
  );
}

function OpenLink({ url, venue, full }: { url: string; venue: HedgeVenue; full?: boolean }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={cn('inline-flex h-8 items-center justify-center gap-1.5 rounded-control bg-ink px-3 text-xs font-bold text-card hover:opacity-90', full && 'w-full')}>
      باز کردن {HEDGE_VENUE_FA[venue]}<ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

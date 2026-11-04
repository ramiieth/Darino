/**
 * گزارش «برنامهٔ خودکار» — بدون تایپ: هر معاملهٔ جهت‌دار با استاپ و هدفی که روی خود صرافی گذاشته شده،
 * ریسک واقعی، R، جابه‌جایی استاپ و چشم‌انداز بازار لحظهٔ ورود (از کندل روزانه).
 *
 *   بالا: خلاصه (نظم استاپ، ریسک میانگین، R میانگین، خلاف روند) و چند جملهٔ اقدام
 *   پایین: کارت هر معامله با نوار قیمت استاپ ← ورود ← هدف و جای خروج واقعی
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Compass, ShieldAlert, ShieldCheck, ShieldQuestion, TrendingDown, TrendingUp } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { ChipGroup } from '@/shared/components/ui/SegmentedControl';
import { Notice } from '@/shared/components/ui/StateViews';
import { cn } from '@/shared/lib/cn';
import type { Bias, ClassifiedTrade, JournalSettings, TradePlan } from '../domain/types';
import { VENUE_FA } from '../domain/types';
import { autoReport, type AutoReport } from '../domain/autoPlan';
import { useAutoOutlook } from '../data/useOutlook';
import { fa, faDateTime, pct, pnlTone, usd } from './parts';

type Filter = 'all' | 'nostop' | 'counter' | 'moved' | 'open';

const BIAS_FA: Record<Bias, string> = { bullish: 'صعودی', bearish: 'نزولی', neutral: 'خنثی' };

export function AutoPlanReport({ trades, auto, settings, accountSize }: { trades: ClassifiedTrade[]; auto: Map<string, TradePlan>; settings: JournalSettings; accountSize: number | null }) {
  // جهت‌دار با شروع معلوم + هر پوزیشن باز (حتی پای نوترال یا شروع خارج از تاریخچه) — پوزیشن زنده هیچ‌وقت جا نمی‌ماند
  const directional = useMemo(() => trades.filter((t) => auto.has(t.id) && (t.open || (t.book === 'directional' && !t.truncated))), [trades, auto]);
  const neutralClosed = useMemo(() => trades.filter((t) => t.book === 'neutral' && !t.open).length, [trades]);
  const { plans, loading } = useAutoOutlook(directional, auto);
  const rep = useMemo(() => autoReport(directional, plans, accountSize, settings.maxRiskPct), [directional, plans, accountSize, settings.maxRiskPct]);
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(20);

  const list = useMemo(() => {
    const sorted = [...directional].sort((a, b) => Number(b.open) - Number(a.open) || (b.closeTime ?? b.openTime) - (a.closeTime ?? a.openTime));
    return sorted.filter((t) => {
      const p = plans.get(t.id);
      if (!p) return false;
      if (filter === 'nostop') return p.auto?.stopSource === 'none';
      if (filter === 'counter') return p.outlook.proTrend === 'n';
      if (filter === 'moved') return p.auto?.stopMoved === 'wider' || p.auto?.stopMoved === 'tighter';
      if (filter === 'open') return t.open;
      return true;
    });
  }, [directional, plans, filter]);

  if (!directional.length) {
    return <Notice tone="info">پوزیشن باز یا معاملهٔ جهت‌داری از حساب‌های متصل نیامده. هر پوزیشنی که در هایپرلیکوئید، لایتر، تی‌اکس‌فلو یا آرکوس باز کنید، خودش این‌جا با استاپ و هدفش ثبت می‌شود.{neutralClosed > 0 && <> {fa(neutralClosed)} معاملهٔ بسته در دفتر «دلتا نوترال» است (نقش حساب در تنظیمات).</>}</Notice>;
  }

  return (
    <div className="space-y-4">
      <Hero rep={rep} maxRiskPct={settings.maxRiskPct} accountSize={accountSize} />
      <Insights rep={rep} maxRiskPct={settings.maxRiskPct} />
      <ChipGroup label="فیلتر" bleed value={filter} onChange={setFilter} options={[
        { value: 'all', label: 'همه', badge: directional.length },
        { value: 'open', label: 'باز', badge: directional.filter((t) => t.open).length || undefined },
        { value: 'nostop', label: 'بدون استاپ', badge: rep.trades - rep.withStop - (rep.trades - rep.readable) || undefined },
        { value: 'counter', label: 'خلاف روند', badge: [...plans.values()].filter((p) => p.outlook.proTrend === 'n').length || undefined },
        { value: 'moved', label: 'استاپ جابه‌جا', badge: rep.widened + rep.tightened || undefined }
      ]} />
      {loading && <p className="text-xs text-muted">در حال خواندن کندل روزانه برای چشم‌انداز بازار…</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {list.slice(0, limit).map((t) => <PlanCard key={t.id} t={t} p={plans.get(t.id)!} accountSize={accountSize} maxRiskPct={settings.maxRiskPct} />)}
      </div>
      {!list.length && <p className="text-sm text-muted">معامله‌ای در این فیلتر نیست.</p>}
      {list.length > limit && <Button variant="outline" onClick={() => setLimit((l) => l + 20)}>نمایش ۲۰ معاملهٔ بیشتر ({fa(list.length - limit)} باقی‌مانده)</Button>}
    </div>
  );
}

/* ---------------- خلاصه ---------------- */

function Hero({ rep, maxRiskPct, accountSize }: { rep: AutoReport; maxRiskPct: number; accountSize: number | null }) {
  const discipline = rep.readable ? (rep.withStop / rep.readable) * 100 : null;
  const tone = discipline === null ? 'text-muted' : discipline >= 90 ? 'text-positive' : discipline >= 60 ? 'text-warn' : 'text-negative';
  return (
    <Surface variant="focal" className="overflow-hidden">
      <div className="grid gap-0 md:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]">
        <div className="flex flex-col justify-between gap-4 border-b border-divider bg-surface-2/50 p-5 md:border-b-0 md:border-e">
          <div>
            <p className="text-xs font-semibold text-muted">نظم استاپ</p>
            <p className={cn('num-ltr mt-1 text-5xl font-black tracking-tight', tone)}>{discipline === null ? '—' : pct(discipline, 0)}</p>
            <p className="mt-2 text-xs leading-6 text-muted">
              {fa(rep.withStop)} از {fa(rep.readable)} معامله روی صرافی استاپ داشت.
              {rep.trades > rep.readable && <> {fa(rep.trades - rep.readable)} معامله (لایتر) قابل‌سنجش نیست.</>}
            </p>
          </div>
          <Meter value={discipline} />
        </div>
        <div className="grid grid-cols-2 divide-divider sm:grid-cols-4 sm:divide-x sm:divide-x-reverse">
          <Tile icon={<ShieldCheck />} label="ریسک میانگین هر معامله" value={rep.avgRiskPct === null ? '—' : pct(rep.avgRiskPct, 2)} sub={accountSize ? `سقف ${pct(maxRiskPct, 1)}` : 'اندازهٔ حساب نامعلوم'} tone={rep.avgRiskPct !== null && rep.avgRiskPct > maxRiskPct ? 'text-negative' : undefined} />
          <Tile icon={<TrendingUp />} label="R واقعی میانگین" value={rep.avgR === null ? '—' : `${fa(rep.avgR, 2)}R`} sub="سود خالص ÷ ریسک استاپ" tone={pnlTone(rep.avgR)} />
          <Tile icon={<ShieldAlert />} label="استاپ دورتر شد" value={fa(rep.widened)} sub={`${fa(rep.late)} استاپ دیر · ${fa(rep.stopBreaches)} عبور از استاپ`} tone={rep.widened ? 'text-negative' : undefined} />
          <Tile icon={<Compass />} label="خلاف روند روزانه" value={fa(rep.counterTrend.n)} sub={rep.counterTrend.n ? `نتیجه ${usd(rep.counterTrend.net, true)}` : 'معامله‌ای نبود'} tone={rep.counterTrend.net < 0 ? 'text-negative' : undefined} />
        </div>
      </div>
    </Surface>
  );
}

function Tile({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="min-w-0 border-b border-divider p-4 sm:border-b-0 [&:nth-child(odd)]:border-e sm:[&:nth-child(odd)]:border-e-0">
      <div className="flex items-center gap-1.5 text-muted [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}<p className="truncate text-[11px] font-semibold">{label}</p></div>
      <p className={cn('num-ltr mt-2 text-2xl font-extrabold', tone ?? 'text-ink')}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-subtle">{sub}</p>}
    </div>
  );
}

function Meter({ value }: { value: number | null }) {
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="space-y-1">
      <div className="relative h-2 overflow-hidden rounded-full bg-divider" dir="ltr">
        <div className={cn('h-full rounded-full transition-[width] duration-700', v >= 90 ? 'bg-gain' : v >= 60 ? 'bg-warn' : 'bg-negative')} style={{ width: `${v}%` }} />
        <span className="absolute inset-y-0 w-px bg-ink/40" style={{ left: '90%' }} aria-hidden />
      </div>
      <p className="text-[10px] text-subtle">هدف حرفه‌ای: ۹۰٪ به بالا</p>
    </div>
  );
}

function Insights({ rep, maxRiskPct }: { rep: AutoReport; maxRiskPct: number }) {
  const items: { tone: 'good' | 'bad' | 'info'; text: string }[] = [];
  const noStop = rep.readable - rep.withStop;
  if (noStop > 0) items.push({ tone: 'bad', text: `${fa(noStop)} معامله بدون استاپ روی صرافی باز شد${rep.noStopNet ? `؛ نتیجهٔ این‌ها ${usd(rep.noStopNet, true)}` : ''}. با همان سفارش ورود استاپ بگذارید.` });
  if (rep.widened > 0) items.push({ tone: 'bad', text: `در ${fa(rep.widened)} معامله استاپ را دورتر بردید؛ یعنی ریسک بیشتر از برنامهٔ خودتان.` });
  if (rep.overRisk > 0) items.push({ tone: 'bad', text: `${fa(rep.overRisk)} معامله بیش از سقف ریسک ${pct(maxRiskPct, 1)} حساب بود.` });
  if (rep.counterTrend.n >= 3 && rep.withTrend.n >= 3) {
    const c = rep.counterTrend.net / rep.counterTrend.n, w = rep.withTrend.net / rep.withTrend.n;
    items.push({ tone: c < w ? 'bad' : 'info', text: `میانگین هر معاملهٔ خلاف روند روزانه ${usd(c, true)} و هم‌جهت با روند ${usd(w, true)} بود.` });
  }
  if (rep.tightened > 0) items.push({ tone: 'good', text: `در ${fa(rep.tightened)} معامله استاپ را به سمت سود بردید (قفل سود یا سربه‌سر).` });
  if (rep.withStop && rep.withTarget < rep.withStop / 2) items.push({ tone: 'info', text: 'بیشتر معاملات هدف (TP) روی صرافی نداشتند؛ بدون هدف، R هدف و «رسیدن به هدف» سنجیده نمی‌شود.' });
  if (!items.length) items.push({ tone: 'good', text: 'همهٔ معاملات قابل‌سنجش استاپ داشتند و استاپی دورتر نشد. همین را ادامه دهید.' });
  return (
    <Surface className="divide-y divide-divider">
      {items.slice(0, 5).map((x, i) => (
        <div key={i} className="flex items-start gap-2.5 px-4 py-3 text-sm leading-7 [&_svg]:mt-1 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0">
          {x.tone === 'bad' ? <AlertTriangle className="text-negative" /> : x.tone === 'good' ? <CheckCircle2 className="text-positive" /> : <Compass className="text-accent" />}
          <p className="text-ink">{x.text}</p>
        </div>
      ))}
    </Surface>
  );
}

/* ---------------- کارت هر معامله ---------------- */

function PlanCard({ t, p, accountSize, maxRiskPct }: { t: ClassifiedTrade; p: TradePlan; accountSize: number | null; maxRiskPct: number }) {
  const a = p.auto;
  const long = t.direction === 'long';
  const riskUsd = p.stop !== null && p.entry !== null ? t.maxSize * Math.abs(p.entry - p.stop) : null;
  const riskPct = riskUsd !== null && accountSize ? (riskUsd / accountSize) * 100 : null;
  const rTarget = p.stop !== null && p.target !== null && p.entry !== null && p.entry !== p.stop ? Math.abs(p.target - p.entry) / Math.abs(p.entry - p.stop) : null;
  const R = !t.open && riskUsd ? t.netPnl / riskUsd : null;
  const o = p.outlook;
  return (
    <Surface className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-field [&_svg]:h-4 [&_svg]:w-4', long ? 'bg-gain/12 text-positive' : 'bg-negative/12 text-negative')}>{long ? <TrendingUp /> : <TrendingDown />}</span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink"><span dir="ltr">{t.symbol}</span> <span className={cn('text-xs font-semibold', long ? 'text-positive' : 'text-negative')}>{long ? 'لانگ' : 'شورت'}</span></p>
          <p className="text-[11px] text-muted">{VENUE_FA[t.venue]} · {t.fills === 0 ? 'از پوزیشن زندهٔ صرافی' : faDateTime(t.openTime)}{t.book === 'neutral' ? ' · پای دلتا نوترال' : ''}</p>
        </div>
        <div className="ms-auto text-end">
          <p className={cn('num-ltr text-base font-extrabold', t.open ? 'text-warn' : pnlTone(t.netPnl))}>{t.open ? 'باز' : usd(t.netPnl, true)}</p>
          {t.open && t.fills === 0 && t.netPnl !== 0 && <p className={cn('num-ltr text-[11px] font-semibold', pnlTone(t.netPnl))}>{usd(t.netPnl, true)}</p>}
          {R !== null && <p className={cn('num-ltr text-[11px] font-semibold', pnlTone(R))}>{fa(R, 2)}R</p>}
        </div>
      </div>

      <LevelBar long={long} stop={p.stop} entry={p.entry} target={p.target} exit={t.open ? null : t.exitPx} finalStop={a?.finalStop ?? null} />

      <div className="flex flex-wrap gap-1.5">
        {a?.stopSource === 'exchange' && <Badge tone="gain"><ShieldCheck />استاپ روی صرافی</Badge>}
        {a?.stopSource === 'none' && <Badge tone="loss"><ShieldAlert />بدون استاپ</Badge>}
        {a?.stopSource === 'unreadable' && <Badge tone="neutral"><ShieldQuestion />استاپ خوانده نمی‌شود</Badge>}
        {rTarget !== null && <Badge tone="info">هدف {fa(rTarget, 1)}R</Badge>}
        {riskPct !== null && <Badge tone={riskPct > maxRiskPct ? 'loss' : 'neutral'}>ریسک {pct(riskPct, 2)} حساب</Badge>}
        {riskUsd !== null && !accountSize && <Badge tone="neutral">ریسک {usd(riskUsd)}</Badge>}
        {a?.stopLateMin ? <Badge tone="warn">استاپ {fa(a.stopLateMin)} دقیقه بعد از ورود</Badge> : null}
        {a?.stopMoved === 'wider' && <Badge tone="loss">استاپ دورتر شد</Badge>}
        {a?.stopMoved === 'tighter' && <Badge tone="gain">استاپ به سمت سود رفت</Badge>}
      </div>

      {a?.outlookAuto ? (
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-control border border-divider bg-divider text-center">
          <Cell label="هفتگی" value={BIAS_FA[o.weeklyBias]} tone={biasTone(o.weeklyBias)} />
          <Cell label="روزانه" value={BIAS_FA[o.dailyBias]} tone={biasTone(o.dailyBias)} />
          <Cell label="بازار" value={o.env === 'trend' ? 'روند' : o.env === 'range' ? 'رنج' : 'نامشخص'} />
        </div>
      ) : (
        <p className="text-[11px] text-subtle">چشم‌انداز: کندل روزانهٔ این نماد در دسترس نیست.</p>
      )}
      {o.proTrend !== '-' && (
        <p className={cn('text-xs font-semibold', o.proTrend === 'y' ? 'text-positive' : 'text-negative')}>{o.proTrend === 'y' ? '✓ هم‌جهت با روند روزانه' : '✕ خلاف روند روزانه'}</p>
      )}
      {a?.stopSource === 'unreadable' && a.unreadableWhy && <p className="text-[11px] leading-5 text-subtle">{a.unreadableWhy}</p>}
    </Surface>
  );
}

const biasTone = (b: Bias) => (b === 'bullish' ? 'text-positive' : b === 'bearish' ? 'text-negative' : 'text-muted');

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-card px-2 py-1.5">
      <p className="text-[10px] text-subtle">{label}</p>
      <p className={cn('text-xs font-bold', tone ?? 'text-ink')}>{value}</p>
    </div>
  );
}

/**
 * نوار قیمت (چپ ارزان، راست گران): ناحیهٔ ریسک قرمز بین استاپ و ورود، ناحیهٔ سود سبز بین ورود و هدف،
 * نشانگر خروج واقعی و استاپ نهایی (اگر جابه‌جا شده).
 */
function LevelBar({ long, stop, entry, target, exit, finalStop }: { long: boolean; stop: number | null; entry: number | null; target: number | null; exit: number | null; finalStop: number | null }) {
  if (entry === null) return null;
  const pts = [stop, entry, target, exit, finalStop].filter((x): x is number => x !== null && Number.isFinite(x));
  let lo = Math.min(...pts), hi = Math.max(...pts);
  if (hi === lo) { lo = entry * 0.99; hi = entry * 1.01; }
  const pad = (hi - lo) * 0.08;
  lo -= pad; hi += pad;
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const zone = (a: number, b: number, cls: string) => <div className={cn('absolute inset-y-0', cls)} style={{ left: `${Math.min(x(a), x(b))}%`, width: `${Math.abs(x(a) - x(b))}%` }} />;
  const exitGood = exit !== null && (long ? exit > entry : exit < entry);
  return (
    <div className="space-y-1.5">
      <div className="relative h-2.5 rounded-full bg-surface-2" dir="ltr">
        {stop !== null && zone(stop, entry, 'rounded-full bg-negative/35')}
        {target !== null && zone(entry, target, 'rounded-full bg-gain/35')}
        <Mark at={x(entry)} cls="bg-ink" />
        {finalStop !== null && stop !== null && finalStop !== stop && <Mark at={x(finalStop)} cls="bg-warn" dashed />}
        {exit !== null && <span className={cn('absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card shadow-card', exitGood ? 'bg-gain' : 'bg-negative')} style={{ left: `${x(exit)}%` }} aria-label="خروج" />}
      </div>
      <div className="flex justify-between gap-2 text-[10px] text-subtle" dir="ltr">
        <span className="num-ltr">{fa(long ? stop : target, 5)}</span>
        <span className="num-ltr text-muted">ورود {fa(entry, 5)}{exit !== null ? ` → خروج ${fa(exit, 5)}` : ''}</span>
        <span className="num-ltr">{fa(long ? target : stop, 5)}</span>
      </div>
    </div>
  );
}

function Mark({ at, cls, dashed }: { at: number; cls: string; dashed?: boolean }) {
  return <span className={cn('absolute -top-1 h-[18px] w-0.5 -translate-x-1/2 rounded-full', cls, dashed && 'opacity-80')} style={{ left: `${at}%` }} aria-hidden />;
}

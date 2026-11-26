/**
 * گزارش «برنامهٔ خودکار» — بدون تایپ: هر معامله با حد ضرر و هدف روی صرافی،
 * میزان ریسک واقعی، جابه‌جایی حد ضرر و جهت روند بازار به‌صورت خودکار بررسی می‌شود.
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
import type { SpotAsset, SpotBook } from '../domain/spot';
import { VENUE_FA } from '../domain/types';
import { autoReport, type AutoReport } from '../domain/autoPlan';
import { useAutoOutlook } from '../data/useOutlook';
import { savePlan } from '../data/journalStore';
import { fa, faDateTime, pct, pnlTone, usd } from './parts';
import { AmountText } from '@/shared/components/ui/FinancialValue';

type Filter = 'all' | 'nostop' | 'counter' | 'moved' | 'open';

const BIAS_FA: Record<Bias, string> = { bullish: 'صعودی', bearish: 'نزولی', neutral: 'خنثی' };

export function AutoPlanReport({
  trades,
  auto,
  settings,
  accountSize,
  spotBook
}: {
  trades: ClassifiedTrade[];
  auto: Map<string, TradePlan>;
  settings: JournalSettings;
  accountSize: number | null;
  spotBook?: SpotBook | null;
}) {
  const primaryDirectional = useMemo(() => trades.filter((t) => auto.has(t.id) && (t.open || (t.book === 'directional' && !t.truncated))), [trades, auto]);
  const includeNeutralFallback = primaryDirectional.length === 0;
  const directional = useMemo(
    () => (includeNeutralFallback ? trades.filter((t) => auto.has(t.id) && (t.open || !t.truncated)) : primaryDirectional),
    [includeNeutralFallback, primaryDirectional, trades, auto]
  );
  const spotOpen = useMemo(() => (spotBook?.open ?? []).filter((a) => (a.avgCost ?? (a.value !== null && a.qty > 0 ? a.value / a.qty : 0)) > 0), [spotBook]);
  const { plans, loading } = useAutoOutlook(directional, auto);
  const rep = useMemo(() => autoReport(directional, plans, accountSize, settings.maxRiskPct, includeNeutralFallback), [directional, plans, accountSize, settings.maxRiskPct, includeNeutralFallback]);
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

  if (!directional.length && !spotOpen.length) {
    return (
      <Notice tone="info">
        فعلاً معاملهٔ بازی در حساب‌ها و کیف پول‌هایت پیدا نشد. به محض باز کردن معامله، حد ضرر و هدف پیشنهادی خودکار اینجا ساخته می‌شود.
      </Notice>
    );
  }

  return (
    <div className="space-y-5">
      {directional.length > 0 && (
        <div className="space-y-4">
          {includeNeutralFallback && (
            <Notice tone="info" title="برنامهٔ خودکار روی همهٔ معاملات پرپ (شامل دفتر نوترال) فعال شد">
              برنامهٔ خودکار (ورود، حد ضرر و هدف) برای همه معاملات صرافی ساخته شد.
            </Notice>
          )}
          <Hero rep={rep} maxRiskPct={settings.maxRiskPct} accountSize={accountSize} />
          <Insights rep={rep} maxRiskPct={settings.maxRiskPct} />
          <ChipGroup
            label="فیلتر"
            bleed
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'همه', badge: directional.length },
              { value: 'open', label: 'باز', badge: directional.filter((t) => t.open).length || undefined },
              { value: 'nostop', label: 'بدون حد ضرر', badge: rep.trades - rep.withStop - (rep.trades - rep.readable) || undefined },
              { value: 'counter', label: 'خلاف روند', badge: [...plans.values()].filter((p) => p.outlook.proTrend === 'n').length || undefined },
              { value: 'moved', label: 'حد ضرر جابه‌جا', badge: rep.widened + rep.tightened || undefined }
            ]}
          />
          {loading && <p className="text-xs text-muted">در حال بررسی روند روزانهٔ بازار…</p>}
          <div className="grid gap-3.5 lg:grid-cols-2">
            {list.slice(0, limit).map((t) => (
              <PlanCard key={t.id} t={t} p={plans.get(t.id)!} accountSize={accountSize} maxRiskPct={settings.maxRiskPct} />
            ))}
          </div>
          {!list.length && <p className="text-sm text-muted">معامله‌ای در این دسته نیست.</p>}
          {list.length > limit && (
            <Button variant="outline" onClick={() => setLimit((l) => l + 20)}>
              نمایش ۲۰ معاملهٔ بیشتر ({fa(list.length - limit)} باقی‌مانده)
            </Button>
          )}
        </div>
      )}
      {spotOpen.length > 0 && <SpotAutoPlans assets={spotOpen} maxRiskPct={settings.maxRiskPct} accountSize={accountSize} />}
    </div>
  );
}

/* ---------------- خلاصه ---------------- */

function Hero({ rep, maxRiskPct, accountSize }: { rep: AutoReport; maxRiskPct: number; accountSize: number | null }) {
  const discipline = rep.readable ? (rep.withStop / rep.readable) * 100 : null;
  const tone = discipline === null ? 'text-muted' : discipline >= 90 ? 'text-positive' : discipline >= 60 ? 'text-warn' : 'text-negative';
  return (
    <Surface variant="focal" className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-l from-gain/80 via-accent/60 to-transparent" />
      <div className="grid gap-0 md:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]">
        <div className="flex flex-col justify-between gap-4 border-b border-divider bg-surface-2/45 p-5 md:border-b-0 md:border-e">
          <div>
            <p className="text-xs font-semibold text-muted">نظم استاپ</p>
            <p className={cn('num-ltr mt-1 text-5xl font-black tracking-tight', tone)}>{discipline === null ? '—' : pct(discipline, 0)}</p>
            <p className="mt-2 text-xs leading-6 text-muted">
              {fa(rep.withStop)} از {fa(rep.readable)} معامله روی صرافی حد ضرر داشت.
              {rep.trades > rep.readable && <> ({fa(rep.trades - rep.readable)} معامله قابل‌بررسی نبود.)</>}
            </p>
          </div>
          <Meter value={discipline} />
        </div>
        <div className="grid grid-cols-2 divide-divider sm:grid-cols-4 sm:divide-x sm:divide-x-reverse">
          <Tile
            icon={<ShieldCheck />}
            label="ریسک میانگین"
            value={rep.avgRiskPct === null ? '—' : pct(rep.avgRiskPct, 2)}
            sub={accountSize ? `سقف ${pct(maxRiskPct, 1)}` : 'سرمایه تنظیم نشده'}
            tone={rep.avgRiskPct !== null && rep.avgRiskPct > maxRiskPct ? 'text-negative' : undefined}
          />
          <Tile
            icon={<TrendingUp />}
            label="سود به ریسک"
            value={rep.avgR === null ? '—' : `${fa(rep.avgR, 2)} برابر`}
            sub="میانگین نسبت سود به حد ضرر"
            tone={pnlTone(rep.avgR)}
          />
          <Tile
            icon={<ShieldAlert />}
            label="حد ضرر دورتر شد"
            value={fa(rep.widened)}
            sub={`${fa(rep.late)} دیر گذاشته شد`}
            tone={rep.widened ? 'text-negative' : undefined}
          />
          <Tile
            icon={<Compass />}
            label="خلاف روند بازار"
            value={fa(rep.counterTrend.n)}
            sub={rep.counterTrend.n ? `نتیجه ${usd(rep.counterTrend.net, true)}` : 'معامله‌ای نبود'}
            tone={rep.counterTrend.net < 0 ? 'text-negative' : undefined}
          />
        </div>
      </div>
    </Surface>
  );
}

function Tile({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="min-w-0 border-b border-divider p-4 sm:border-b-0 [&:nth-child(odd)]:border-e sm:[&:nth-child(odd)]:border-e-0">
      <div className="flex items-center gap-1.5 text-muted [&_svg]:h-3.5 [&_svg]:w-3.5">
        {icon}
        <p className="truncate text-[11px] font-semibold">{label}</p>
      </div>
      <p className={cn('num-ltr mt-2 text-2xl font-extrabold', tone ?? 'text-ink')}>
        <AmountText text={value} />
      </p>
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
      <p className="text-[10px] text-subtle">هدف خوب: بالای ۹۰٪</p>
    </div>
  );
}

function Insights({ rep, maxRiskPct }: { rep: AutoReport; maxRiskPct: number }) {
  const items: { tone: 'good' | 'bad' | 'info'; text: string }[] = [];
  const noStop = rep.readable - rep.withStop;
  if (noStop > 0)
    items.push({
      tone: 'bad',
      text: `${fa(noStop)} معامله بدون حد ضرر باز شد${rep.noStopNet ? ` (نتیجه: ${usd(rep.noStopNet, true)})` : ''}. هم‌زمان با ورود حد ضرر بگذار.`
    });
  if (rep.widened > 0) items.push({ tone: 'bad', text: `در ${fa(rep.widened)} معامله حد ضرر را دورتر بردی؛ یعنی ریسک بیشتر از برنامه شد.` });
  if (rep.overRisk > 0) items.push({ tone: 'bad', text: `${fa(rep.overRisk)} معامله ریسک بیشتری از سقف ${pct(maxRiskPct, 1)} حسابت داشت.` });
  if (rep.counterTrend.n >= 3 && rep.withTrend.n >= 3) {
    const c = rep.counterTrend.net / rep.counterTrend.n;
    const w = rep.withTrend.net / rep.withTrend.n;
    items.push({ tone: c < w ? 'bad' : 'info', text: `میانگین معاملات خلاف روند ${usd(c, true)} و هم‌جهت با روند ${usd(w, true)} بوده.` });
  }
  if (rep.tightened > 0) items.push({ tone: 'good', text: `در ${fa(rep.tightened)} معامله حد ضرر را به سمت سود آوردی (عالی!).` });
  if (!items.length) items.push({ tone: 'good', text: 'همه معاملاتت حد ضرر داشتند و هیچ حد ضرری دورتر نشد. عالی!' });
  return (
    <Surface className="divide-y divide-divider/70">
      {items.slice(0, 4).map((x, i) => (
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
  const [saved, setSaved] = useState(false);
  const a = p.auto;
  const sug = a?.suggested;
  const long = t.direction === 'long';
  const effectiveStop = p.stop ?? sug?.stop ?? null;
  const effectiveTarget = p.target ?? sug?.target ?? null;
  const riskUsd = p.stop !== null && p.entry !== null ? t.maxSize * Math.abs(p.entry - p.stop) : null;
  const riskPct = riskUsd !== null && accountSize ? (riskUsd / accountSize) * 100 : null;
  const rTarget = p.stop !== null && p.target !== null && p.entry !== null && p.entry !== p.stop ? Math.abs(p.target - p.entry) / Math.abs(p.entry - p.stop) : null;
  const R = !t.open && riskUsd ? t.netPnl / riskUsd : null;
  const o = p.outlook;
  const needsSuggestedLevels = (p.stop === null || p.target === null) && !!sug;
  const suggestedSizeUsd =
    accountSize && p.entry && sug && Math.abs(p.entry - sug.stop) > 0
      ? ((accountSize * maxRiskPct) / 100) / (Math.abs(p.entry - sug.stop) / p.entry)
      : null;

  async function adoptAutoPlan() {
    const now = Date.now();
    await savePlan({
      ...p,
      id: `p${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      stop: effectiveStop,
      target: effectiveTarget,
      setupTags: o.proTrend === 'y' ? ['هم‌جهت با روند'] : o.proTrend === 'n' ? ['خلاف روند'] : [],
      source: undefined,
      auto: undefined,
      status: 'taken',
      linkedTradeId: t.id,
      updatedAt: now
    });
    setSaved(true);
  }

  return (
    <Surface className="flex flex-col gap-3 p-4 transition-all duration-150 hover:border-accent/35 hover:shadow-sm">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl [&_svg]:h-4.5 [&_svg]:w-4.5', long ? 'bg-gain/12 text-positive' : 'bg-negative/12 text-negative')}>
          {long ? <TrendingUp /> : <TrendingDown />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">
            <span dir="ltr">{t.symbol}</span>{' '}
            <span className={cn('text-xs font-semibold', long ? 'text-positive' : 'text-negative')}>{long ? 'خرید (لانگ)' : 'فروش (شورت)'}</span>
          </p>
          <p className="text-[11px] text-muted">
            {VENUE_FA[t.venue]} · {t.fills === 0 ? 'پوزیشن باز صرافی' : faDateTime(t.openTime)}
          </p>
        </div>
        <div className="ms-auto text-end">
          <p className={cn('num-ltr text-base font-extrabold', t.open ? 'text-warn' : pnlTone(t.netPnl))}>
            <AmountText text={t.open ? 'باز' : usd(t.netPnl, true)} />
          </p>
          {t.open && t.fills === 0 && t.netPnl !== 0 && (
            <p className={cn('num-ltr text-[11px] font-semibold', pnlTone(t.netPnl))}>
              <AmountText text={usd(t.netPnl, true)} />
            </p>
          )}
          {R !== null && <p className={cn('num-ltr text-[11px] font-semibold', pnlTone(R))}>{fa(R, 2)} برابر ریسک</p>}
        </div>
      </div>

      <LevelBar long={long} stop={effectiveStop} entry={p.entry} target={effectiveTarget} exit={t.open ? null : t.exitPx} finalStop={a?.finalStop ?? null} />

      <div className="flex flex-wrap gap-1.5">
        {a?.stopSource === 'exchange' && (
          <Badge tone="gain">
            <ShieldCheck />
            حد ضرر فعال
          </Badge>
        )}
        {a?.stopSource === 'none' && (
          <Badge tone="loss">
            <ShieldAlert />
            بدون حد ضرر
          </Badge>
        )}
        {a?.stopSource === 'unreadable' && (
          <Badge tone="neutral">
            <ShieldQuestion />
            حد ضرر خوانده نشد
          </Badge>
        )}
        {rTarget !== null && <Badge tone="info">هدف {fa(rTarget, 1)} برابر ریسک</Badge>}
        {riskPct !== null && <Badge tone={riskPct > maxRiskPct ? 'loss' : 'neutral'}>ریسک {pct(riskPct, 2)}</Badge>}
        {a?.stopMoved === 'wider' && <Badge tone="loss">حد ضرر دورتر شد</Badge>}
        {a?.stopMoved === 'tighter' && <Badge tone="gain">حد ضرر به سود رفت</Badge>}
      </div>

      {needsSuggestedLevels && sug && (
        <div className="rounded-xl border border-accent/25 bg-accent/[0.04] p-3 text-xs leading-6">
          <p className="font-bold text-accent">پیشنهاد خودکار حد ضرر و هدف:</p>
          <p className="mt-0.5 text-ink">
            حد ضرر: <b className="num-ltr text-negative">{fa(sug.stop, 5)}</b> · حد سود: <b className="num-ltr text-positive">{fa(sug.target, 5)}</b>
            {suggestedSizeUsd !== null && <> · حجم مناسب: <b className="num-ltr">{usd(suggestedSizeUsd)}</b></>}
          </p>
          {t.open && (
            <div className="mt-2">
              {saved ? (
                <span className="font-semibold text-positive">✓ ثبت شد</span>
              ) : (
                <Button size="sm" variant="outline" onClick={() => void adoptAutoPlan()}>
                  تأیید خودکار این برنامه
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {a?.outlookAuto && (
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-divider/80 bg-divider text-center">
          <Cell label="روند هفتگی" value={BIAS_FA[o.weeklyBias]} tone={biasTone(o.weeklyBias)} />
          <Cell label="روند روزانه" value={BIAS_FA[o.dailyBias]} tone={biasTone(o.dailyBias)} />
          <Cell label="وضعیت بازار" value={o.env === 'trend' ? 'رونددار' : o.env === 'range' ? 'نوسانی' : 'نامشخص'} />
        </div>
      )}
      {o.proTrend !== '-' && (
        <p className={cn('text-xs font-semibold', o.proTrend === 'y' ? 'text-positive' : 'text-negative')}>
          {o.proTrend === 'y' ? '✓ هم‌جهت با روند روزانه' : '✕ خلاف روند روزانه'}
        </p>
      )}
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

function LevelBar({
  long,
  stop,
  entry,
  target,
  exit,
  finalStop
}: {
  long: boolean;
  stop: number | null;
  entry: number | null;
  target: number | null;
  exit: number | null;
  finalStop: number | null;
}) {
  if (entry === null) return null;
  const pts = [stop, entry, target, exit, finalStop].filter((x): x is number => x !== null && Number.isFinite(x));
  let lo = Math.min(...pts);
  let hi = Math.max(...pts);
  if (hi === lo) {
    lo = entry * 0.99;
    hi = entry * 1.01;
  }
  const pad = (hi - lo) * 0.08;
  lo -= pad;
  hi += pad;
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const zone = (a: number, b: number, cls: string) => (
    <div className={cn('absolute inset-y-0', cls)} style={{ left: `${Math.min(x(a), x(b))}%`, width: `${Math.abs(x(a) - x(b))}%` }} />
  );
  const exitGood = exit !== null && (long ? exit > entry : exit < entry);
  return (
    <div className="space-y-1.5">
      <div className="relative h-2.5 rounded-full bg-surface-2" dir="ltr">
        {stop !== null && zone(stop, entry, 'rounded-full bg-negative/35')}
        {target !== null && zone(entry, target, 'rounded-full bg-gain/35')}
        <Mark at={x(entry)} cls="bg-ink" />
        {finalStop !== null && stop !== null && finalStop !== stop && <Mark at={x(finalStop)} cls="bg-warn" dashed />}
        {exit !== null && (
          <span
            className={cn('absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card shadow-card', exitGood ? 'bg-gain' : 'bg-negative')}
            style={{ left: `${x(exit)}%` }}
            aria-label="خروج"
          />
        )}
      </div>
      <div className="flex justify-between gap-2 text-[10px] text-subtle" dir="ltr">
        <span className="num-ltr">{fa(long ? stop : target, 5)}</span>
        <span className="num-ltr text-muted">
          ورود {fa(entry, 5)}
          {exit !== null ? ` → خروج ${fa(exit, 5)}` : ''}
        </span>
        <span className="num-ltr">{fa(long ? target : stop, 5)}</span>
      </div>
    </div>
  );
}

function Mark({ at, cls, dashed }: { at: number; cls: string; dashed?: boolean }) {
  return <span className={cn('absolute -top-1 h-[18px] w-0.5 -translate-x-1/2 rounded-full', cls, dashed && 'opacity-80')} style={{ left: `${at}%` }} aria-hidden />;
}

/** برنامهٔ خودکار برای دارایی‌های باز اسپات (بدون تایپ) */
function SpotAutoPlans({ assets, maxRiskPct, accountSize }: { assets: SpotAsset[]; maxRiskPct: number; accountSize: number | null }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold text-ink">برنامهٔ خودکار پوزیشن‌های باز اسپات (کیف پول‌ها)</h3>
          <p className="text-xs text-muted">حد ضرر پیشنهادی ۸٪- و هدف سود ۱۶٪+ بر پایه میانگین خریدت</p>
        </div>
        <Badge tone="gain">خودکار · {fa(assets.length)} دارایی</Badge>
      </div>
      <div className="grid gap-3.5 lg:grid-cols-2">
        {assets.map((a) => {
          const livePx = a.value !== null && a.qty > 0 ? a.value / a.qty : null;
          const entry = a.avgCost ?? livePx ?? 0;
          const stop = entry * 0.92;
          const target = entry * 1.16;
          const riskUsd = a.qty > 0 ? a.qty * (entry - stop) : null;
          const riskPct = riskUsd !== null && accountSize ? (riskUsd / accountSize) * 100 : null;
          return (
            <Surface key={a.asset} className="flex flex-col gap-3 p-4 transition-all duration-150 hover:border-accent/35 hover:shadow-sm">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gain/12 text-positive [&_svg]:h-4.5 [&_svg]:w-4.5">
                  <TrendingUp />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink">
                    <span dir="ltr">{a.symbol}</span> <span className="text-xs font-semibold text-positive">اسپات</span>
                  </p>
                  <p className="text-[11px] text-muted">{a.avgCost !== null ? 'بر پایه میانگین خرید' : 'بر پایه قیمت روز'}</p>
                </div>
                <div className="ms-auto text-end">
                  <p className="num-ltr text-base font-extrabold text-ink">
                    <AmountText text={a.value !== null ? usd(a.value) : 'باز'} />
                  </p>
                  <p className="text-[10px] text-subtle">ارزش فعلی</p>
                </div>
              </div>
              <LevelBar long stop={stop} entry={entry} target={target} exit={livePx} finalStop={null} />
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="info">خودکار</Badge>
                <Badge tone="gain">هدف ۲ برابر ریسک</Badge>
                {riskUsd !== null && (
                  <Badge tone={riskPct !== null && riskPct > maxRiskPct ? 'loss' : 'neutral'}>
                    ریسک {usd(riskUsd)}
                    {riskPct !== null ? ` (${pct(riskPct, 1)})` : ''}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted">
                حد ضرر: <b className="num-ltr text-negative">{fa(stop, entry < 1 ? 6 : 2)}</b> · هدف سود:{' '}
                <b className="num-ltr text-positive">{fa(target, entry < 1 ? 6 : 2)}</b>
              </p>
            </Surface>
          );
        })}
      </div>
    </div>
  );
}

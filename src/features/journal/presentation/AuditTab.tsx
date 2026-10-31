/**
 * تب «حسابرسی» — حسابرسی خودکار دفتر جهت‌دار به سبک ارزیابی Prop (ترکیب دو پرامپت؛ هیچ معیاری حذف نشده)
 *
 *   لایهٔ ۰ اعتماد داده (خاکستری/آبی، بدون نمره) → ۱ حکم (بدون اسکرول) → ۲ کارنامه (عملکرد / اجرا، مرتب با هزینهٔ دلاری)
 *   → ۳ تحلیل (چهار سؤال، حداکثر ۸ نمودار پیش‌فرض) → «اول این را درست کن» + سه بعدی + سه قانون → ۴ پیوست
 *   افشای تدریجی: هر بخش یک لایه بازشو، نه تودرتو.
 */
import { useMemo, useState } from 'react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Badge } from '@/shared/components/ui/Badge';
import { Notice } from '@/shared/components/ui/StateViews';
import { Button } from '@/shared/components/ui/Button';
import { cn } from '@/shared/lib/cn';
import type { BookAudit } from '../domain/audit';
import { CONFIDENCE_FA, STATUS_FA, type ScoreRow } from '../domain/scorecard';
import { STYLE_FA } from '../domain/metrics';
import { VENUE_FA } from '../domain/types';
import { dayKey } from '../domain/time';
import { ChartBlock, ClassBadge, duration, fa, faDate, faDateTime, pct, pnlTone, ScoreRowView, Term, usd, VerdictBadge } from './parts';
import { Bars, EquityChart } from './charts';
import { ExcursionPanel } from './ExcursionPanel';

const BAND_STYLE = { pass: 'border-gain/50 bg-gain/5', conditions: 'border-warn/50 bg-warn/5', fail: 'border-negative/50 bg-negative/5', insufficient: 'border-divider bg-surface-2/60' } as const;

function DataConfidencePanel({ a }: { a: BookAudit }) {
  const d = a.data;
  return (
    <Surface variant="subtle" className="p-4 md:p-5">
      <h2 className="text-sm font-bold text-ink">این حسابرسی چه چیزی را می‌تواند بگوید و چه چیزی را نه</h2>
      <p className="mt-1 text-xs leading-6 text-muted">
        {fa(d.trades)} معاملهٔ بستهٔ کامل · {d.from ? `${faDate(d.from)} تا ${faDate(d.to)}` : 'بدون بازه'} · سبک: {d.style ? STYLE_FA[d.style] : '—'} · <span className="text-info">{CONFIDENCE_FA[d.confidence]}</span>
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {d.coverage.map((c) => (
          <div key={c.field} className="min-w-0">
            <div className="flex justify-between text-xs text-muted"><span>{c.label}</span><span className="num-ltr">{pct(c.pct, 0)}</span></div>
            <div className="mt-1 h-1.5 rounded-full bg-card" dir="ltr"><div className="h-full rounded-full bg-info/60" style={{ width: `${c.pct}%` }} /></div>
            {c.pct < 80 && c.field !== 'size' && <p className="mt-1 text-[11px] leading-5 text-subtle">ارزیابی‌نشده: {c.disables}. {c.enable}</p>}
          </div>
        ))}
      </div>
      {d.notes.length > 0 && <ul className="mt-3 space-y-1 text-[11px] leading-5 text-subtle">{d.notes.map((n, i) => <li key={i}>• {n}</li>)}</ul>}
    </Surface>
  );
}

function Hero({ label, value, sub, tone }: { label: React.ReactNode; value: string; sub: string; tone: 'gain' | 'warn' | 'loss' | 'neutral' }) {
  const dot = tone === 'gain' ? 'bg-gain' : tone === 'warn' ? 'bg-warn' : tone === 'loss' ? 'bg-negative' : 'bg-subtle';
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted"><span className={cn('h-2 w-2 rounded-full', dot)} aria-hidden />{label}</p>
      <p className="num-ltr mt-1 text-2xl font-extrabold text-ink">{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}

const toneOf = (r: ScoreRow | undefined) => (!r ? 'neutral' : r.verdict === 'meets' ? 'gain' : r.verdict === 'borderline' ? 'warn' : r.verdict === 'fails' ? 'loss' : 'neutral');

export function AuditTab({ a, empty, tz }: { a: BookAudit; empty: React.ReactNode; tz: string }) {
  const m = a.core;
  const b = a.behavior;
  const row = (id: string) => a.rows.find((r) => r.id === id);
  const [showAllTrades, setShowAllTrades] = useState(false);

  const eq = useMemo(() => ({ labels: m.equity.map((p) => faDate(p.t)), equity: m.equity.map((p) => p.equity), drawdown: m.equity.map((p) => p.drawdown) }), [m.equity]);
  const hist = useMemo(() => {
    const vals = a.trades.map((t) => t.netPnl);
    if (vals.length < 5) return null;
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const bins = 12, w = (hi - lo) / bins || 1;
    const counts = Array(bins).fill(0) as number[];
    for (const v of vals) counts[Math.min(bins - 1, Math.floor((v - lo) / w))]++;
    const centers = counts.map((_, i) => lo + w * (i + 0.5));
    const floor = m.scratchFloor;
    return { labels: centers.map((c) => usd(c)), counts, colors: centers.map((c) => (Math.abs(c) < Math.max(floor, w / 2) ? 'rgba(140,140,150,0.6)' : c > 0 ? 'rgba(22,163,74,0.8)' : 'rgba(220,38,38,0.8)')) };
  }, [a.trades, m.scratchFloor]);
  const freq = useMemo(() => {
    const days = new Map<string, number>();
    for (const t of a.trades) { const k = dayKey(t.openTime, tz); days.set(k, (days.get(k) ?? 0) + 1); }
    const keys = [...days.keys()].sort();
    return { labels: keys.map((k) => k.slice(5)), values: keys.map((k) => days.get(k)!) };
  }, [a.trades, tz]);
  const sizeQuartiles = useMemo(() => {
    const ts = [...a.trades].filter((t) => t.maxNotional > 0).sort((x, y) => x.maxNotional - y.maxNotional);
    if (ts.length < 8) return null;
    const q = Math.ceil(ts.length / 4);
    return [0, 1, 2, 3].map((i) => {
      const g = ts.slice(i * q, (i + 1) * q);
      return { label: `${usd(g[0]?.maxNotional)}–${usd(g.at(-1)?.maxNotional)}`, exp: g.reduce((s, t) => s + t.netPnl, 0) / Math.max(1, g.length), n: g.length };
    });
  }, [a.trades]);

  if (!m.n && !a.open.length && !a.truncated.length) return <>{empty}</>;

  const perf = a.rows.filter((r) => r.cls === 'performance');
  const exec = a.rows.filter((r) => r.cls === 'behaviour');
  const context = a.rows.filter((r) => r.cls === 'context');
  const breakEvenWin = m.payoff ? 100 / (1 + m.payoff) : null;
  const ghostWin = m.avgLoss ? m.avgLoss * 1.5 : null;
  const dayStyle = m.style === 'scalp' || m.style === 'day';
  const sortedTrades = [...a.trades].sort((x, y) => x.netPnl - y.netPnl);
  const worstIds = new Set(sortedTrades.slice(0, Math.max(1, Math.ceil(a.trades.length * 0.05))).map((t) => t.id));
  const allTrades = [...a.trades].sort((x, y) => (y.closeTime ?? 0) - (x.closeTime ?? 0));

  return (
    <div className="space-y-6">
      <DataConfidencePanel a={a} />

      {/* لایهٔ ۱ — حکم */}
      <Surface variant="focal" className={cn('border-2 p-5 md:p-6', BAND_STYLE[a.verdict.band])}>
        <p className="text-lg font-extrabold leading-8 text-ink md:text-xl">{a.verdict.headline}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={a.verdict.band === 'pass' ? 'gain' : a.verdict.band === 'conditions' ? 'warn' : a.verdict.band === 'fail' ? 'loss' : 'neutral'}>{STATUS_FA[a.verdict.band]}</Badge>
          <span className="text-xs text-muted">{a.verdict.reason}</span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <Hero label="سود خالص" value={usd(m.netPnl, true)} sub={`ناخالص ${usd(m.grossPnl, true)} · کارمزد ${usd(-m.fees)}`} tone={m.netPnl > 0 ? 'gain' : m.netPnl < 0 ? 'loss' : 'neutral'} />
          <Hero label={<Term id="winRate" yours={pct(m.winRateDecisive)} action={row('winRate')?.action}>نرخ برد</Term>} value={pct(m.winRateDecisive)} sub={`با سربه‌سرها ${pct(m.winRateAll)}`} tone={toneOf(row('winRate'))} />
          <Hero label={<Term id="profitFactor" yours={row('profitFactor')?.display} action={row('profitFactor')?.action}>ضریب سود</Term>} value={row('profitFactor')?.display ?? '—'} sub={m.profitFactor ? `هر ۱ دلار زیان → ${usd(m.profitFactor === Infinity ? null : m.profitFactor)}` : '—'} tone={toneOf(row('profitFactor'))} />
          <Hero label={<Term id="maxDrawdown" yours={row('maxDrawdown')?.display} action={row('maxDrawdown')?.action}>بیشترین افت</Term>} value={m.maxDrawdownPct !== null ? pct(m.maxDrawdownPct) : usd(-m.maxDrawdown)} sub={m.drawdownFrom ? `${faDate(m.drawdownFrom)} تا ${faDate(m.drawdownTo)}` : 'افتی ثبت نشد'} tone={toneOf(row('maxDrawdown'))} />
        </div>
        <Disclosure summary={`همهٔ ${fa(a.rows.length + 8)} معیار به‌صورت فشرده`} className="mt-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              ['امید ریاضی', usd(m.expectancy, true), row('expectancy')],
              ['نسبت سود به زیان', row('payoff')?.display, row('payoff')],
              ['ضریب بازیابی', row('recovery')?.display, row('recovery')],
              ['شارپ روزانه', m.sharpe === null ? '—' : fa(m.sharpe, 2), undefined],
              ['فشار کارمزد', pct(m.feeDragPct), row('feeDrag')],
              ['بلندترین رشتهٔ برد / باخت', `${fa(m.longestWinStreak)} / ${fa(m.longestLossStreak)}`, undefined],
              ['بزرگ‌ترین سود', `${usd(m.largestWin)} (${pct(m.largestWinPctNet)} سود خالص)`, undefined],
              ['بزرگ‌ترین زیان', `${usd(m.largestLoss)} (${pct(m.largestLossPctNet)})`, undefined],
              ['معامله در روز (فعال)', `${fa(m.tradesPerDay, 2)} (${fa(m.tradesPerActiveDay, 1)})`, row('tradesPerDay')],
              ['ناخالص / خالص', `${usd(m.grossPnl, true)} / ${usd(m.netPnl, true)}`, undefined],
              ['معاملهٔ سربه‌سر', `${fa(m.scratches)} (${pct(m.scratchPct)})`, undefined],
              ['فاندینگ', m.fundingKnown ? usd(m.funding, true) : `${usd(m.funding, true)} (ناقص)`, undefined],
              ['بدترین روز', usd(m.worstDay), row('dailyLoss')],
              ['ثبات (سهم بهترین روز)', pct(m.bestDayShare), row('consistency')],
              ['ماه‌های مثبت', `${fa(m.monthsPositive)} از ${fa(m.months)}`, undefined],
              ['میانهٔ نگه‌داری', duration(m.medianHoldMs), undefined]
            ].map(([label, value, r]) => (
              <div key={label as string} className="min-w-0 rounded-control border border-divider p-2.5">
                <p className="text-[11px] text-muted">{label as string}</p>
                <p className="num-ltr text-sm font-bold text-ink">{value as string}</p>
                {r && <div className="mt-1 flex flex-wrap gap-1"><ClassBadge c={(r as ScoreRow).cls} /><VerdictBadge v={(r as ScoreRow).verdict} /></div>}
                {r && <p className="mt-1 text-[11px] text-subtle">معیار: {(r as ScoreRow).benchmark}</p>}
              </div>
            ))}
          </div>
        </Disclosure>
      </Surface>

      {/* اول این را درست کن */}
      {a.first ? (
        <Surface variant="focal" className="border-2 border-accent p-5">
          <p className="text-xs font-semibold text-accent">اول این را درست کن</p>
          <p className="mt-1 text-base font-extrabold text-ink">{a.first.fix}</p>
          <p className="mt-1 text-sm leading-7 text-muted">{a.first.detail} هزینه: <span className="font-bold text-negative">{usd(-a.first.cost)}</span></p>
          {a.next.length > 0 && (
            <Disclosure summary="سه اولویت بعدی، به ترتیب هزینه" className="mt-2">
              <ol className="space-y-2 text-sm">
                {a.next.map((l) => <li key={l.id}><span className="font-semibold text-ink">{l.title}</span> — <span className="text-negative">{usd(-l.cost)}</span><br /><span className="text-xs text-muted">{l.detail} {l.fix}</span></li>)}
              </ol>
            </Disclosure>
          )}
          {a.rules.length > 0 && (
            <div className="mt-3 rounded-control bg-surface-2 p-3">
              <p className="text-xs font-semibold text-ink">سه قانون سخت از دادهٔ خود شما</p>
              <ol className="mt-1 list-decimal space-y-1 ps-5 text-xs leading-6 text-ink">{a.rules.map((r, i) => <li key={i}>{r}</li>)}</ol>
              <p className="mt-1 text-[11px] text-subtle">این‌ها را در «مرور هفتگی» به‌عنوان تعهد قابل‌سنجش اضافه کنید.</p>
            </div>
          )}
        </Surface>
      ) : m.n >= 10 ? (
        <Notice tone="success" title="نشتی قیمت‌گذاری‌شده‌ای پیدا نشد">یا انضباط است، یا دادهٔ کم. در هر دو حال تگ «چرا» را ادامه دهید.</Notice>
      ) : null}

      {/* لایهٔ ۲ — کارنامه */}
      <section>
        <h2 className="text-base font-bold text-ink md:text-lg">کارنامه در برابر معیار حرفه‌ای</h2>
        <p className="mt-1 text-xs leading-6 text-muted">معیارها مرجع شرکت‌های Prop هستند و برای نمونه‌های بزرگ؛ روی نمونهٔ کوچک جهت‌نما هستند نه حکم. ترتیب: بیشترین هزینهٔ دلاری اول.</p>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <Surface className="p-4 md:p-5">
            <h3 className="text-sm font-bold text-ink">آنچه معامله‌گری شما تولید کرد</h3>
            <p className="text-xs text-muted">نتیجه‌ها (عملکرد) — آنچه در حساب ماند.</p>
            {perf.map((r) => <ScoreRowView key={r.id} row={r} />)}
          </Surface>
          <Surface className="p-4 md:p-5">
            <h3 className="text-sm font-bold text-ink">چطور اجرا کردید</h3>
            <p className="text-xs text-muted">رفتار — جدا از نتیجه؛ یک معاملهٔ خوب می‌تواند ضرر بدهد.</p>
            {exec.map((r) => <ScoreRowView key={r.id} row={r} />)}
          </Surface>
        </div>
      </section>

      <ExcursionPanel trades={a.trades} />

      {/* لایهٔ ۳ — تحلیل */}
      {m.n > 0 && (
        <section className="space-y-4">
          <h2 className="text-base font-bold text-ink md:text-lg">واقعاً پول می‌سازید؟</h2>
          <ChartBlock
            title={m.maxDrawdown > Math.max(0, m.netPnl) ? 'یک دورهٔ بد از کل سودتان بزرگ‌تر بوده' : 'مسیر سود و افت‌ها'}
            term="منحنی سرمایه و افت (Equity curve, drawdown)"
            cls="performance"
            caption={`سود خالص ${usd(m.netPnl, true)} با بیشترین افت ${usd(-m.maxDrawdown)}${m.maxDrawdownPct !== null ? ` (${pct(m.maxDrawdownPct)} حساب)` : ''}. ${m.recoveryFactor !== null ? `ضریب بازیابی ${fa(m.recoveryFactor, 2)}؛ ${m.recoveryFactor < 1 ? 'یعنی بدترین افت از کل سود بزرگ‌تر است.' : 'یعنی سود از بدترین افت بزرگ‌تر است.'}` : ''}`}
            howTo="خط آبی سود خالص تجمعی بعد از هر معامله است. ناحیهٔ قرمز زیر صفر فاصلهٔ هر لحظه از بالاترین نقطهٔ قبلی است؛ هرچه عمیق‌تر، افت بزرگ‌تر."
          >
            <EquityChart labels={eq.labels} equity={eq.equity} drawdown={eq.drawdown} />
          </ChartBlock>
          <Disclosure summary="ثبات ماه‌به‌ماه، تمرکز سود در یک روز و آزمون «یک معاملهٔ بد»">
            <div className="grid gap-3 sm:grid-cols-3">
              <Surface variant="subtle" className="p-3 text-xs leading-6">بدون بدترین معامله: <b className={pnlTone(m.withoutWorst1)}>{usd(m.withoutWorst1, true)}</b><br />بدون بدترین ۳ معامله: <b className={pnlTone(m.withoutWorst3)}>{usd(m.withoutWorst3, true)}</b>{m.netPnl < 0 && (m.withoutWorst3 ?? -1) > 0 && <><br /><span className="text-negative">فقط سه معامله شما را از سود به ضرر برده است.</span></>}</Surface>
              <Surface variant="subtle" className="p-3 text-xs leading-6">ماه‌های مثبت: {fa(m.monthsPositive)} از {fa(m.months)}<br />سهم بهترین روز از سود: {pct(m.bestDayShare)} {m.bestDayKey && `(${m.bestDayKey})`}</Surface>
              <Surface variant="subtle" className="p-3 text-xs leading-6"><Term id="sharpe">شارپ روزانه</Term>: {m.sharpe === null ? `ارزیابی نشد (حداقل ۲۰ روز و ۱۰ روز فعال؛ الان ${fa(m.spanDays)} روز)` : fa(m.sharpe, 2)}</Surface>
            </div>
          </Disclosure>

          <h2 className="pt-2 text-base font-bold text-ink md:text-lg">پول از کجا می‌آید؟</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartBlock
              title={m.payoff !== null && m.payoff < 1 ? 'زیان‌هایتان از سودهایتان بزرگ‌ترند' : 'سود متوسط در برابر زیان متوسط'}
              term="نسبت سود به زیان (Payoff ratio)"
              cls="performance"
              caption={m.avgWin !== null && m.avgLoss !== null ? `زیان معمول شما ${usd(m.avgLoss)} و سود معمولتان ${usd(m.avgWin)} است. برای سربه‌سر شدن باید ${pct(breakEvenWin)} ببرید و ${pct(m.winRateDecisive)} می‌برید.${breakEvenWin !== null && (m.winRateDecisive ?? 0) < breakEvenWin ? ' تا این نسبت عوض نشود، انتخاب بهتر ورود هم حساب را سودده نمی‌کند.' : ''}` : 'برای این نمودار حداقل یک برد و یک باخت لازم است.'}
              howTo="میلهٔ کم‌رنگ کنار سود نشان می‌دهد سود متوسط برای نسبت ۱٫۵ به ۱ چقدر باید باشد."
            >
              <Bars labels={['سود متوسط', 'زیان متوسط']} values={[m.avgWin ?? 0, -(m.avgLoss ?? 0)]} ghost={[ghostWin, null]} />
            </ChartBlock>
            <ChartBlock
              title={m.top5Share !== null && m.top5Share > 80 ? 'بیشتر سود از چند معامله آمده' : 'سهم ۵ معاملهٔ برتر'}
              term="تمرکز سود (Profit concentration)"
              cls="performance"
              caption={m.top5Share !== null ? `۵ معاملهٔ برتر ${usd(m.top5Pnl)} سود دادند، یعنی ${pct(m.top5Share)} سود خالص. ${m.top5Share > 100 ? 'بقیهٔ معاملات در مجموع ضرر داده‌اند؛ لبه هنوز ثابت نشده.' : ''}` : 'وقتی سود خالص مثبت نیست، تمرکز سود معنا ندارد.'}
            >
              <Bars labels={['۵ معاملهٔ برتر', 'بقیهٔ معاملات']} values={[m.top5Pnl, m.netPnl - m.top5Pnl]} />
            </ChartBlock>
          </div>
          {b.bySymbol.length > 1 && (
            <ChartBlock title="سود هر نماد" term="امید ریاضی به تفکیک نماد" cls="performance" caption={(() => { const w = b.bySymbol.find((x) => x.verdict !== 'thin' && x.net < 0); return w ? `${w.label} با ${fa(w.n)} معامله ${usd(w.net, true)} داده است — ${w.verdict === 'delete' ? 'حذف' : 'اصلاح'}.` : 'هیچ نمادی با نمونهٔ کافی در مجموع ضرر نداده.'; })()}>
              <Bars labels={b.bySymbol.map((x) => x.label)} values={b.bySymbol.map((x) => x.net)} />
            </ChartBlock>
          )}
          <Disclosure summary="لانگ در برابر شورت، و سود هر نوع ورود (تگ «چرا»)">
            <BucketTable title="لانگ / شورت" rows={b.byDirection} />
            <BucketTable title="تگ «چرا» — فقط تگ‌های زده‌شده قبل از بستن معامله (بی‌طرف)" rows={b.byTagPreOnly} empty="هنوز تگی قبل از بستن معامله زده نشده." />
            <BucketTable title="تگ «چرا» — همهٔ تگ‌ها (شامل تگ بعد از دیدن نتیجه)" rows={b.byTag} empty="هنوز تگ «چرا» زده نشده." />
          </Disclosure>

          <h2 className="pt-2 text-base font-bold text-ink md:text-lg">چقدر ریسک می‌کنید؟</h2>
          {hist && (
            <ChartBlock
              title={(m.tailLossShare ?? 0) > 40 ? 'چند زیان بزرگ بیشتر ضرر را ساخته' : 'پراکندگی نتیجهٔ معاملات'}
              term="توزیع سود و زیان (PnL distribution)"
              cls="performance"
              caption={`بدترین ۵٪ معاملات ${pct(m.tailLossShare)} کل زیان را ساخته‌اند. ${(m.tailLossShare ?? 0) > 40 ? 'دم چپ چاق است: یک سقف زیان سخت بیشترین اثر را دارد.' : ''} باند خاکستری محدودهٔ سربه‌سر است.`}
              howTo="هر میله تعداد معاملاتی است که نتیجه‌شان در آن بازه بوده؛ چپ زیان، راست سود."
            >
              <Bars labels={hist.labels} values={hist.counts} unit="n" signed={false} colors={hist.colors} />
            </ChartBlock>
          )}
          {sizeQuartiles && (
            <ChartBlock title="روی ایده‌های بدتر حجم بزرگ‌تر می‌گیرید؟" term="اندازهٔ پوزیشن در برابر نتیجه" cls="behaviour" caption={`امید ریاضی در بزرگ‌ترین یک‌چهارم معاملات ${usd(sizeQuartiles[3].exp, true)} و در کوچک‌ترین یک‌چهارم ${usd(sizeQuartiles[0].exp, true)} است.${sizeQuartiles[3].exp < sizeQuartiles[0].exp ? ' معاملات بزرگ بدتر نتیجه می‌دهند — اندازه از حس می‌آید نه از قاعده.' : ''} ضریب تغییرات اندازه ${fa(m.sizeCv, 2)}.`}>
              <Bars labels={sizeQuartiles.map((q) => q.label)} values={sizeQuartiles.map((q) => q.exp)} />
            </ChartBlock>
          )}
          <Disclosure summary="رشته‌ها، ریسک هر معامله و پراکندگی R">
            <div className="grid gap-3 text-xs leading-6 sm:grid-cols-3">
              <Surface variant="subtle" className="p-3">بلندترین رشتهٔ باخت: {fa(m.longestLossStreak)} · برد: {fa(m.longestWinStreak)}</Surface>
              <Surface variant="subtle" className="p-3"><Term id="riskPerTrade">ریسک هر معامله</Term>: {m.riskPctAvg === null ? 'ارزیابی نشد — برنامه با استاپ و اندازهٔ حساب لازم است' : `${pct(m.riskPctAvg, 2)} (${fa(m.riskPctCount)} معامله)`}</Surface>
              <Surface variant="subtle" className="p-3"><Term id="rMultiple">R</Term>: {m.rCount ? `میانگین ${fa(m.avgR, 2)}R · بدترین ${fa(Math.min(...m.rValues), 2)}R · بهترین ${fa(Math.max(...m.rValues), 2)}R` : 'ارزیابی نشد'}</Surface>
            </div>
          </Disclosure>

          <h2 className="pt-2 text-base font-bold text-ink md:text-lg">عادت‌هایتان با شما چه می‌کنند؟</h2>
          {dayStyle && freq.labels.length > 2 && (
            <ChartBlock title={b.tilt?.days.length ? 'روزهای پرمعامله گران تمام شده‌اند' : 'تعداد معامله در هر روز'} term="بسامد معامله در برابر معیار" cls="behaviour" caption={`میانگین ${fa(m.tradesPerActiveDay, 1)} معامله در روز فعال؛ معیار مرجع حدود ۳٫۲. ${b.tilt?.days.length ? `${fa(b.tilt.days.length)} روز با ${fa(b.tilt.threshold)}+ معامله جمعاً ${usd(b.tilt.tiltNet, true)}.` : ''}`}>
              <Bars labels={freq.labels} values={freq.values} unit="n" signed={false} />
            </ChartBlock>
          )}
          {!dayStyle && context.length > 0 && <p className="text-xs text-muted">تعداد معامله در روز برای سبک {m.style ? STYLE_FA[m.style] : ''} معیار ندارد (زمینه): {fa(m.tradesPerActiveDay, 1)} در روز فعال.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <HabitCard title="بعد از ضرر" body={b.revenge ? `${fa(b.revenge.n)} معامله بعد از ضرر؛ ${pct(b.revenge.fasterShare, 0)} زودتر از فاصلهٔ معمول (${duration(b.revenge.medianGapMs)}). نرخ برد ${pct(b.revenge.winRate)} در برابر ${pct(b.revenge.baseWinRate)} معمول؛ اندازه ${fa(b.revenge.sizeRatio, 2)} برابر.` : 'دادهٔ کافی نیست (حداقل ۳ معامله بعد از ضرر).'} cost={b.revenge?.cost} />
            <HabitCard title="زمان نگه‌داری" body={b.holding ? `سودده‌ها به‌طور میانگین ${duration(b.holding.winMs)} و ضرردهی‌ها ${duration(b.holding.lossMs)} باز ماندند (${fa(b.holding.ratio, 1)} برابر).` : 'دادهٔ کافی نیست.'} cost={b.holding?.cost} />
            <HabitCard title="بعد از برد بزرگ" body={b.postWin ? `${fa(b.postWin.n)} معامله؛ نرخ برد ${pct(b.postWin.winRate)} در برابر ${pct(b.postWin.baseWinRate)}، اندازه ${fa(b.postWin.sizeRatio, 2)} برابر معمول.` : 'دادهٔ کافی نیست.'} />
            <HabitCard title="اندازه بعد از رشته" body={b.sizing ? `بعد از دو برد پیاپی ${fa(b.sizing.afterWins, 2)} برابر و بعد از دو باخت پیاپی ${fa(b.sizing.afterLosses, 2)} برابر اندازهٔ معمول.` : 'دادهٔ کافی نیست.'} />
          </div>
          <Disclosure summary="ساعت و روز هفته، روزهای پرمعامله، کارمزد و تناقض یادداشت‌ها">
            <BucketTable title="ساعت باز کردن (وقت محلی)" rows={b.byHour} />
            <BucketTable title="روز هفته" rows={b.byWeekday} />
            {b.overtrading && <BucketTable title={`پرمعاملگی — اگر فقط ${fa(b.overtrading.capN)} معاملهٔ اول هر روز: ${usd(b.overtrading.netIfCapped, true)} (${usd(b.overtrading.delta, true)})`} rows={b.overtrading.buckets} />}
            <p className="mt-2 text-xs text-muted"><Term id="feeDrag">فشار کارمزد</Term>: {pct(m.feeDragPct)} · کل کارمزد {usd(m.fees)} · <Term id="scratch">سربه‌سر</Term>: {fa(m.scratches)} معامله (آستانهٔ ثابت {usd(m.scratchFloor)})</p>
            {b.contradictions.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-ink">یادداشت‌های خودتان در برابر نتیجه</p>
                <ul className="mt-1 space-y-1 text-xs leading-6">{b.contradictions.map((c) => <li key={c.tradeId}>«{c.quote}» → <span className="text-negative">{usd(c.net)}</span></li>)}</ul>
              </div>
            )}
          </Disclosure>
        </section>
      )}

      {/* لایهٔ ۴ — پیوست */}
      <Disclosure summary="پیوست: همهٔ معاملات، روش محاسبه، آنچه ارزیابی نشد، پوزیشن‌های باز">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-card border border-divider">
            {(showAllTrades ? allTrades : allTrades.slice(0, 8)).map((t) => (
              <div key={t.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-divider px-3 py-2 text-xs last:border-0', worstIds.has(t.id) && 'bg-negative/5')}>
                <span className="font-semibold text-ink" dir="ltr">{t.symbol}</span>
                <span className={t.direction === 'long' ? 'text-positive' : 'text-negative'}>{t.direction === 'long' ? 'لانگ' : 'شورت'}</span>
                <span className="text-muted">{VENUE_FA[t.venue]}</span>
                <span className="text-muted">{faDateTime(t.openTime)} ← {duration((t.closeTime ?? 0) - t.openTime)}</span>
                <span className={cn('num-ltr ms-auto font-bold', pnlTone(t.netPnl))}>{usd(t.netPnl, true)}</span>
                {worstIds.has(t.id) && <Badge tone="loss">بدترین ۵٪</Badge>}
              </div>
            ))}
          </div>
          {allTrades.length > 8 && <Button size="sm" variant="outline" onClick={() => setShowAllTrades((v) => !v)}>{showAllTrades ? 'نمایش ۸ معاملهٔ اخیر' : `نمایش همهٔ ${fa(allTrades.length)} معامله`}</Button>}
          <div className="text-xs leading-6 text-muted">
            <p className="font-semibold text-ink">روش</p>
            <p>معامله = از صفر شدن پوزیشن یک (حساب، نماد) تا صفر شدن دوباره؛ چرخش جهت دو معامله حساب می‌شود و کارمزد به نسبت حجم تقسیم می‌شود. سود قیمتی از قیمت اجراها محاسبه می‌شود؛ فاندینگ به معاملهٔ باز همان زمان نسبت داده می‌شود. زمان‌ها به وقت محلی مرورگر. آستانهٔ سربه‌سر: بزرگ‌ترِ کارمزد همان معامله و {usd(m.scratchFloor)} (۲٪ میانگین سود، یک‌بار محاسبه). پوزیشن‌های باز و معاملات با شروع خارج از تاریخچه از آمار کنار گذاشته شده‌اند.</p>
            <p className="mt-2 font-semibold text-ink">ارزیابی‌نشده‌ها</p>
            <ul>{a.rows.filter((r) => r.verdict === 'na').map((r) => <li key={r.id}>• {r.term}: {r.note ?? 'دادهٔ لازم نیست'}</li>)}</ul>
          </div>
          {a.open.length > 0 && (
            <div className="text-xs">
              <p className="font-semibold text-ink">پوزیشن‌های باز (در آمار نیستند)</p>
              {a.open.map((t) => <p key={t.id} className="text-muted"><span dir="ltr">{t.symbol}</span> · {t.direction === 'long' ? 'لانگ' : 'شورت'} · {VENUE_FA[t.venue]} · از {faDateTime(t.openTime)} · ارزش {usd(t.maxNotional)}</p>)}
            </div>
          )}
          {a.truncated.length > 0 && <p className="text-xs text-subtle">{fa(a.truncated.length)} معامله با شروع خارج از تاریخچه (سود گزارش‌شدهٔ صرافی جمعاً {usd(a.truncated.reduce((s, t) => s + t.netPnl, 0), true)}) کنار گذاشته شد.</p>}
          {context.map((r) => <p key={r.id} className="text-xs text-muted">{r.term} (زمینه): {r.display} — {r.note}</p>)}
        </div>
      </Disclosure>
    </div>
  );
}

function HabitCard({ title, body, cost }: { title: string; body: string; cost?: number | null }) {
  return (
    <Surface className="p-4">
      <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-ink">{title}</p><ClassBadge c="behaviour" /></div>
      <p className="mt-1 text-xs leading-6 text-muted">{body}</p>
      {cost ? <p className="mt-1 text-xs font-semibold text-negative">هزینه ≈ {usd(-cost)}</p> : null}
    </Surface>
  );
}

const VERDICT_LABEL = { keep: 'نگه دار', fix: 'اصلاح', delete: 'حذف', thin: 'نمونه کم' } as const;
function BucketTable({ title, rows, empty }: { title: string; rows: BookAudit['behavior']['byHour']; empty?: string }) {
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-ink">{title}</p>
      {!rows.length ? (
        <p className="text-xs text-subtle">{empty ?? '—'}</p>
      ) : (
        <div className="mt-1 divide-y divide-divider rounded-control border border-divider">
          {rows.map((r) => (
            <div key={r.key} className="flex flex-wrap items-center gap-x-3 px-3 py-1.5 text-xs">
              <span className="min-w-20 text-ink">{r.label}</span>
              <span className="text-muted">{fa(r.n)} معامله</span>
              <span className="text-muted">برد {pct(r.winRate, 0)}</span>
              <span className={cn('num-ltr', pnlTone(r.expectancy))}>هر معامله {usd(r.expectancy, true)}</span>
              <span className={cn('num-ltr ms-auto font-semibold', pnlTone(r.net))}>{usd(r.net, true)}</span>
              <Badge tone={r.verdict === 'keep' ? 'gain' : r.verdict === 'delete' ? 'loss' : r.verdict === 'fix' ? 'warn' : 'neutral'}>{VERDICT_LABEL[r.verdict]}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


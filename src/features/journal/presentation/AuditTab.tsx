/**
 * تب «گزارش و کارنامه» (حسابرسی خودکار) — ساده، روان، بدون اصطلاحات سنگین و بدون نیاز به تایپ دستی:
 *   ۱. خلاصهٔ ساده: چه اتفاقی افتاد؟ (تعداد معاملات، نتیجهٔ خالص و ۴ عدد اصلی)
 *   ۲. اول این را درست کن + پیشنهاد خودکار بهبود (قابل افزودن با یک کلیک به مرور هفته)
 *   ۳. کارنامهٔ عملکرد و رفتار (آنچه تولید کردید / چطور اجرا کردید)
 *   ۴. نمودارها و جزئیات بیشتر (جمع‌شده در بخش‌های بازشونده تا صفحه خلوت بماند)
 */
import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Badge } from '@/shared/components/ui/Badge';
import { Notice } from '@/shared/components/ui/StateViews';
import { Button } from '@/shared/components/ui/Button';
import { cn } from '@/shared/lib/cn';
import type { BookAudit } from '../domain/audit';
import type { SpotBook } from '../domain/spot';
import { buildAutoCritiqueLoop } from '../domain/autoAnnotate';
import { CONFIDENCE_FA, STATUS_FA, type ScoreRow } from '../domain/scorecard';
import { STYLE_FA } from '../domain/metrics';
import { DEFAULT_SETTINGS } from '../domain/defaults';
import { emptyReview } from '../domain/review';
import { saveReview } from '../data/journalStore';
import { VENUE_FA, type JournalSettings, type WeeklyReview } from '../domain/types';
import { dayKey, isoWeekKey } from '../domain/time';
import { ChartBlock, ClassBadge, duration, fa, faDate, faDateTime, pct, pnlTone, ScoreRowView, Term, usd, VerdictBadge } from './parts';
import { Bars, EquityChart } from './charts';
import { ExcursionPanel } from './ExcursionPanel';
import { AmountText } from '@/shared/components/ui/FinancialValue';

const BAND_ACCENT = {
  pass: 'from-gain via-gain/60 to-accent/50',
  conditions: 'from-warn via-warn/60 to-accent/40',
  fail: 'from-negative via-negative/60 to-warn/40',
  insufficient: 'from-accent/70 via-divider to-transparent'
} as const;

const BAND_SURFACE = {
  pass: 'border-gain/35',
  conditions: 'border-warn/35',
  fail: 'border-negative/35',
  insufficient: 'border-divider'
} as const;

function DataConfidencePanel({ a }: { a: BookAudit }) {
  const d = a.data;
  return (
    <Disclosure summary="این حسابرسی چه چیزی را می‌تواند بگوید و چه چیزی را نه">
      <div className="space-y-3 pt-1">
        <p className="text-xs leading-6 text-muted">
          بر اساس {fa(d.trades)} معاملهٔ بسته · {d.from ? `${faDate(d.from)} تا ${faDate(d.to)}` : 'بدون بازه'} · سبک: {d.style ? STYLE_FA[d.style] : '—'} ·{' '}
          <span className="font-semibold text-info">{CONFIDENCE_FA[d.confidence]}</span>
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {d.coverage.map((c) => (
            <div key={c.field} className="min-w-0">
              <div className="flex justify-between text-xs text-muted">
                <span>{c.label}</span>
                <span className="num-ltr">{pct(c.pct, 0)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-surface-2" dir="ltr">
                <div className="h-full rounded-full bg-accent/70" style={{ width: `${c.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Disclosure>
  );
}

function HeroTile({
  label,
  value,
  sub,
  tone
}: {
  label: React.ReactNode;
  value: string;
  sub: string;
  tone: 'gain' | 'warn' | 'loss' | 'neutral';
}) {
  const dot = tone === 'gain' ? 'bg-gain' : tone === 'warn' ? 'bg-warn' : tone === 'loss' ? 'bg-negative' : 'bg-subtle';
  const bg =
    tone === 'gain'
      ? 'border-gain/25 bg-gain/[0.04]'
      : tone === 'warn'
        ? 'border-warn/25 bg-warn/[0.04]'
        : tone === 'loss'
          ? 'border-negative/25 bg-negative/[0.04]'
          : 'border-divider/80 bg-surface-2/50';
  return (
    <div className={cn('min-w-0 overflow-hidden rounded-xl border p-3 sm:p-3.5', bg)}>
      <p className="flex items-center gap-1.5 truncate text-[11px] font-semibold text-muted sm:text-xs">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} aria-hidden />
        <span className="truncate">{label}</span>
      </p>
      <p className="num-ltr mt-1.5 text-base font-extrabold leading-tight text-ink sm:text-xl md:text-2xl">
        <AmountText text={value} className="max-w-full flex-wrap" />
      </p>
      <p className="mt-0.5 truncate text-[11px] text-muted">{sub}</p>
    </div>
  );
}

const toneOf = (r: ScoreRow | undefined) =>
  !r ? 'neutral' : r.verdict === 'meets' ? 'gain' : r.verdict === 'borderline' ? 'warn' : r.verdict === 'fails' ? 'loss' : 'neutral';

export function AuditTab({
  a: primary,
  fallbackAudit,
  spotBook,
  outsideRangeCount = 0,
  onShowAllRange,
  empty,
  tz,
  settings = DEFAULT_SETTINGS,
  reviews
}: {
  a: BookAudit;
  fallbackAudit?: BookAudit;
  spotBook?: SpotBook | null;
  outsideRangeCount?: number;
  onShowAllRange?: () => void;
  empty: React.ReactNode;
  tz: string;
  settings?: JournalSettings;
  reviews?: ReadonlyMap<string, WeeklyReview>;
}) {
  const hasPrimary = !!(primary.core.n || primary.open.length || primary.truncated.length);
  const usingFallbackPerp = !hasPrimary && !!fallbackAudit && !!(fallbackAudit.core.n || fallbackAudit.open.length || fallbackAudit.truncated.length);
  const a = usingFallbackPerp ? fallbackAudit! : primary;
  const hasPerp = hasPrimary || usingFallbackPerp;
  const hasSpot = !!(spotBook && spotBook.totals.swaps > 0);

  const m = a.core;
  const b = a.behavior;
  const row = (id: string) => a.rows.find((r) => r.id === id);
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [loopApplied, setLoopApplied] = useState(false);
  const critique = useMemo(() => buildAutoCritiqueLoop(a, settings), [a, settings]);

  const eq = useMemo(
    () => ({
      labels: m.equity.map((p) => faDate(p.t)),
      equity: m.equity.map((p) => p.equity),
      drawdown: m.equity.map((p) => p.drawdown)
    }),
    [m.equity]
  );
  const hist = useMemo(() => {
    const vals = a.trades.map((t) => t.netPnl);
    if (vals.length < 5) return null;
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const bins = 12;
    const w = (hi - lo) / bins || 1;
    const counts = Array(bins).fill(0) as number[];
    for (const v of vals) counts[Math.min(bins - 1, Math.floor((v - lo) / w))]++;
    const centers = counts.map((_, i) => lo + w * (i + 0.5));
    const floor = m.scratchFloor;
    return {
      labels: centers.map((c) => usd(c)),
      counts,
      colors: centers.map((c) =>
        Math.abs(c) < Math.max(floor, w / 2) ? 'rgba(140,140,150,0.6)' : c > 0 ? 'rgba(15,157,107,0.82)' : 'rgba(200,41,63,0.82)'
      )
    };
  }, [a.trades, m.scratchFloor]);

  const freq = useMemo(() => {
    const days = new Map<string, number>();
    for (const t of a.trades) {
      const k = dayKey(t.openTime, tz);
      days.set(k, (days.get(k) ?? 0) + 1);
    }
    const keys = [...days.keys()].sort();
    return { labels: keys.map((k) => k.slice(5)), values: keys.map((k) => days.get(k)!) };
  }, [a.trades, tz]);

  const sizeQuartiles = useMemo(() => {
    const ts = [...a.trades].filter((t) => t.maxNotional > 0).sort((x, y) => x.maxNotional - y.maxNotional);
    if (ts.length < 8) return null;
    const q = Math.ceil(ts.length / 4);
    return [0, 1, 2, 3].map((i) => {
      const g = ts.slice(i * q, (i + 1) * q);
      return {
        label: `${usd(g[0]?.maxNotional)}–${usd(g.at(-1)?.maxNotional)}`,
        exp: g.reduce((s, t) => s + t.netPnl, 0) / Math.max(1, g.length),
        n: g.length
      };
    });
  }, [a.trades]);

  if (!hasPerp && !hasSpot) {
    if (outsideRangeCount > 0 && onShowAllRange) {
      return (
        <Notice tone="info" title="معاملاتت قدیمی‌تر از این بازه هستند">
          در این بازه معاملهٔ بسته‌ای نیست، اما {fa(outsideRangeCount)} معامله در تاریخچهٔ کاملت پیدا شد.{' '}
          <button type="button" className="font-bold text-accent underline" onClick={onShowAllRange}>
            نمایش همهٔ زمان‌ها
          </button>
        </Notice>
      );
    }
    return <>{empty}</>;
  }

  if (!hasPerp && hasSpot && spotBook) {
    return (
      <div className="space-y-5">
        {outsideRangeCount > 0 && onShowAllRange && (
          <Notice tone="info">
            {fa(outsideRangeCount)} معاملهٔ صرافی قدیمی‌تر از این بازه داری.{' '}
            <button type="button" className="font-bold text-accent underline" onClick={onShowAllRange}>
              نمایش همهٔ زمان‌ها
            </button>
          </Notice>
        )}
        <SpotAutoAuditPanel b={spotBook} tz={tz} reviews={reviews} />
      </div>
    );
  }

  const perf = a.rows.filter((r) => r.cls === 'performance');
  const exec = a.rows.filter((r) => r.cls === 'behaviour');
  const context = a.rows.filter((r) => r.cls === 'context');
  const breakEvenWin = m.payoff ? 100 / (1 + m.payoff) : null;
  const ghostWin = m.avgLoss ? m.avgLoss * 1.5 : null;
  const dayStyle = m.style === 'scalp' || m.style === 'day';
  const sortedTrades = [...a.trades].sort((x, y) => x.netPnl - y.netPnl);
  const worstIds = new Set(sortedTrades.slice(0, Math.max(1, Math.ceil(a.trades.length * 0.05))).map((t) => t.id));
  const allTrades = [...a.trades].sort((x, y) => (y.closeTime ?? 0) - (x.closeTime ?? 0));
  const winsCount = a.trades.filter((t) => t.netPnl > 0).length;
  const lossesCount = a.trades.filter((t) => t.netPnl < 0).length;

  // داستان ساده و انسانی: دقیقاً چه اتفاقی افتاده؟
  const plainStory =
    m.n === 0
      ? 'فعلاً معاملهٔ بسته‌ای ثبت نشده؛ به محض بسته شدن اولین معامله، تحلیل اینجا آماده می‌شود.'
      : `در این بازه ${fa(m.n)} معامله بستی (${fa(winsCount)} سود و ${fa(lossesCount)} ضرر). در کل ${
          m.netPnl >= 0 ? `${usd(m.netPnl)} سود کردی` : `${usd(Math.abs(m.netPnl))} ضرر کردی`
        }${m.fees > 0 ? ` و ${usd(m.fees)} کارمزد دادی` : ''}.${
          a.first ? ` مهم‌ترین نکته‌ای که الان باید اصلاح کنی: ${a.first.fix}` : ''
        }`;

  return (
    <div className="space-y-5">
      {usingFallbackPerp && (
        <Notice tone="info" title="حسابرسی خودکار روی کل معاملات پرپ (شامل دفتر دلتا نوترال)">
          در این بازه معاملهٔ جداگانه‌ای نبود؛ همه معاملات صرافی به‌صورت خودکار اینجا بررسی شدند.
        </Notice>
      )}
      {outsideRangeCount > 0 && !hasPrimary && onShowAllRange && (
        <Notice tone="info">
          {fa(outsideRangeCount)} معاملهٔ قدیمی‌تر از این بازه داری.{' '}
          <button type="button" className="font-bold text-accent underline" onClick={onShowAllRange}>
            نمایش همهٔ زمان‌ها
          </button>
        </Notice>
      )}

      {/* کارت ۱: خلاصهٔ ساده و روشن (چه اتفاقی افتاد؟) */}
      <Surface variant="focal" className={cn('relative overflow-hidden border p-5 md:p-6', BAND_SURFACE[a.verdict.band])}>
        <div aria-hidden className={cn('pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-l', BAND_ACCENT[a.verdict.band])} />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={a.verdict.band === 'pass' ? 'gain' : a.verdict.band === 'conditions' ? 'warn' : a.verdict.band === 'fail' ? 'loss' : 'neutral'}>
                {STATUS_FA[a.verdict.band]}
              </Badge>
              <span className="text-xs text-muted">{a.verdict.reason}</span>
            </div>
            <p className="mt-2 text-lg font-extrabold leading-8 text-ink md:text-xl">{a.verdict.headline}</p>
            <p className="mt-1.5 text-sm leading-7 text-muted">{plainStory}</p>
          </div>
          <span
            className={cn(
              'hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl sm:flex',
              m.netPnl >= 0 ? 'bg-gain/12 text-positive' : 'bg-negative/12 text-negative'
            )}
          >
            {m.netPnl >= 0 ? <TrendingUp className="h-6 w-6" aria-hidden /> : <TrendingDown className="h-6 w-6" aria-hidden />}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HeroTile
            label="سود و زیان خالص"
            value={usd(m.netPnl, true)}
            sub={`کارمزد ${usd(-m.fees)}`}
            tone={m.netPnl > 0 ? 'gain' : m.netPnl < 0 ? 'loss' : 'neutral'}
          />
          <HeroTile
            label={
              <Term id="winRate" yours={pct(m.winRateDecisive)} action={row('winRate')?.action}>
                نرخ برد
              </Term>
            }
            value={pct(m.winRateDecisive)}
            sub={`${fa(winsCount)} برد · ${fa(lossesCount)} باخت`}
            tone={toneOf(row('winRate'))}
          />
          <HeroTile
            label={
              <Term id="profitFactor" yours={row('profitFactor')?.display} action={row('profitFactor')?.action}>
                نسبت کل سود به ضرر
              </Term>
            }
            value={row('profitFactor')?.display ?? '—'}
            sub={m.profitFactor ? `به‌ازای هر ۱ دلار ضرر: ${usd(m.profitFactor === Infinity ? null : m.profitFactor)}` : '—'}
            tone={toneOf(row('profitFactor'))}
          />
          <HeroTile
            label={
              <Term id="maxDrawdown" yours={row('maxDrawdown')?.display} action={row('maxDrawdown')?.action}>
                بیشترین افت حساب
              </Term>
            }
            value={m.maxDrawdownPct !== null ? pct(m.maxDrawdownPct) : usd(-m.maxDrawdown)}
            sub={m.drawdownFrom ? `${faDate(m.drawdownFrom)} تا ${faDate(m.drawdownTo)}` : 'افتی ثبت نشد'}
            tone={toneOf(row('maxDrawdown'))}
          />
        </div>

        <div className="mt-4 space-y-2 border-t border-divider/70 pt-3">
          <DataConfidencePanel a={a} />
          <Disclosure summary={`نمایش همهٔ ${fa(a.rows.length + 8)} عدد خلاصه`}>
            <div className="grid grid-cols-2 gap-2.5 pt-1 sm:grid-cols-3 lg:grid-cols-4">
              {[
                ['میانگین سود هر معامله', usd(m.expectancy, true), row('expectancy')],
                ['سود معمول به ضرر معمول', row('payoff')?.display, row('payoff')],
                ['بزرگ‌ترین سود', usd(m.largestWin), undefined],
                ['بزرگ‌ترین ضرر', usd(m.largestLoss), undefined],
                ['سهم کارمزد از نتیجه', pct(m.feeDragPct), row('feeDrag')],
                ['بیشترین برد / باخت پیاپی', `${fa(m.longestWinStreak)} / ${fa(m.longestLossStreak)}`, undefined],
                ['میانگین معامله در روز فعال', fa(m.tradesPerActiveDay, 1), row('tradesPerDay')],
                ['بدترین روز', usd(m.worstDay), row('dailyLoss')],
                ['ماه‌های مثبت', `${fa(m.monthsPositive)} از ${fa(m.months)}`, undefined],
                ['مدت معمول هر معامله', duration(m.medianHoldMs), undefined],
                ['فاندینگ', usd(m.funding, true), undefined],
                ['معاملات تقریباً سربه‌سر', `${fa(m.scratches)} (${pct(m.scratchPct)})`, undefined]
              ].map(([label, value, r]) => (
                <div key={label as string} className="min-w-0 rounded-xl border border-divider/70 bg-surface-2/40 p-2.5">
                  <p className="text-[11px] text-muted">{label as string}</p>
                  <p className="num-ltr mt-0.5 text-sm font-bold text-ink">{value as string}</p>
                  {r && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      <VerdictBadge v={(r as ScoreRow).verdict} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Disclosure>
        </div>
      </Surface>

      {/* کارت ۲: مهم‌ترین اقدام الان (اول این را درست کن) */}
      {a.first ? (
        <Surface variant="focal" className="relative overflow-hidden border border-accent/40 bg-accent/[0.03] p-5">
          <div aria-hidden className="pointer-events-none absolute inset-y-0 start-0 w-1 bg-accent" />
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <AlertCircle className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-accent">اول این را درست کن</p>
              <p className="mt-1 text-base font-extrabold text-ink">{a.first.fix}</p>
              <p className="mt-1 text-sm leading-7 text-muted">
                {a.first.detail} · ضرر این اشتباه: <span className="font-bold text-negative">{usd(-a.first.cost)}</span>
              </p>
            </div>
          </div>

          {a.rules.length > 0 && (
            <div className="mt-4 rounded-xl border border-divider/70 bg-card p-3.5">
              <p className="text-xs font-bold text-ink">۳ قانون ساده از روی معاملات خودت</p>
              <ol className="mt-1.5 list-decimal space-y-1 ps-5 text-xs leading-6 text-ink">
                {a.rules.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            </div>
          )}

          {a.next.length > 0 && (
            <Disclosure summary="۳ نکتهٔ مهم بعدی (به ترتیب بیشترین ضرر)" className="mt-3">
              <ol className="space-y-2 pt-1 text-sm">
                {a.next.map((l) => (
                  <li key={l.id} className="rounded-xl bg-card p-3">
                    <span className="font-semibold text-ink">{l.title}</span> — <span className="font-bold text-negative">{usd(-l.cost)}</span>
                    <p className="mt-0.5 text-xs leading-6 text-muted">
                      {l.detail} {l.fix}
                    </p>
                  </li>
                ))}
              </ol>
            </Disclosure>
          )}
        </Surface>
      ) : m.n >= 10 ? (
        <Notice tone="success" title="اشتباه پرهزینه‌ای دیده نشد">
          روند معاملاتت منظم بوده؛ همین مسیر را ادامه بده.
        </Notice>
      ) : null}

      {/* کارت ۳: جمع‌بندی و پیشنهاد خودکار هوشمند (لوپ نقد خودکار) */}
      {critique.active && (
        <Surface className="space-y-3 border-divider/90 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Sparkles className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-bold text-ink">تحلیل خودکار و برنامهٔ هفتهٔ بعد</p>
                <p className="text-[11px] text-muted">کاملاً خودکار از معاملات واقعی استخراج شده</p>
              </div>
            </div>
            <Badge tone="info">{critique.confidenceLabel}</Badge>
          </div>
          <div className="grid gap-2.5 md:grid-cols-3">
            {critique.steps.map((st) => (
              <div key={st.stage} className="rounded-xl border border-divider/70 bg-surface-2/40 p-3.5">
                <p className="text-xs font-bold text-ink">{st.title}</p>
                <p className="mt-1 text-xs leading-6 text-muted">{st.body}</p>
              </div>
            ))}
          </div>
          {reviews && critique.proposedCommitments.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider/70 pt-3">
              <span className="text-xs text-muted">با یک کلیک این قوانین را به مرور این هفته اضافه کن تا خودکار پیگیری شوند:</span>
              {loopApplied ? (
                <Badge tone="gain">
                  <CheckCircle2 /> به مرور این هفته اضافه شد
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const wk = isoWeekKey(Date.now(), tz);
                    const base = reviews.get(wk) ?? emptyReview(wk);
                    const existingTexts = new Set(base.commitments.map((c) => c.text));
                    const merged = [...base.commitments, ...critique.proposedCommitments.filter((c) => !existingTexts.has(c.text))].slice(0, 3);
                    void saveReview({ ...base, commitments: merged }).then(() => setLoopApplied(true));
                  }}
                >
                  افزودن خودکار به مرور این هفته
                </Button>
              )}
            </div>
          )}
        </Surface>
      )}

      {/* کارت ۴: کارنامهٔ ساده (نتیجه و رفتار) */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-bold text-ink">کارنامهٔ خلاصه</h2>
          <p className="text-xs text-muted">مرتب‌شده از بیشترین اثر روی حسابت به کمترین.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Surface className="p-4 md:p-5">
            <h3 className="text-sm font-bold text-ink">آنچه معامله‌گری شما تولید کرد</h3>
            <p className="mb-2 text-xs text-muted">نتیجهٔ نهایی در حساب</p>
            {perf.map((r) => (
              <ScoreRowView key={r.id} row={r} />
            ))}
          </Surface>
          <Surface className="p-4 md:p-5">
            <h3 className="text-sm font-bold text-ink">چطور اجرا کردید</h3>
            <p className="mb-2 text-xs text-muted">نظم و عادت‌های معامله‌گری</p>
            {exec.map((r) => (
              <ScoreRowView key={r.id} row={r} />
            ))}
          </Surface>
        </div>
      </section>

      {/* نمودار مسیر سرمایه — مهم‌ترین نمودار، تمیز و واضح */}
      {m.n > 0 && (
        <ChartBlock
          title={m.maxDrawdown > Math.max(0, m.netPnl) ? 'یک دورهٔ بد از کل سودت بزرگ‌تر بوده' : 'مسیر سود و افت حساب در طول زمان'}
          term="روند سود و زیان"
          cls="performance"
          caption={`سود خالص ${usd(m.netPnl, true)} با بیشترین افت ${usd(-m.maxDrawdown)}${m.maxDrawdownPct !== null ? ` (${pct(m.maxDrawdownPct)} حساب)` : ''}.`}
          howTo="خط آبی سود کل تو بعد از هر معامله است و بخش قرمز زیر خط صفر، میزان افت از بالاترین قله را نشان می‌دهد."
        >
          <EquityChart labels={eq.labels} equity={eq.equity} drawdown={eq.drawdown} />
        </ChartBlock>
      )}

      {/* عادت‌های مهم به زبان ساده */}
      {m.n > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <HabitCard
            title="بعد از ضرر چطور معامله می‌کنی؟"
            body={
              b.revenge
                ? `${fa(b.revenge.n)} بار بعد از ضرر وارد شدی؛ ${pct(b.revenge.fasterShare, 0)} مواقع عجولانه‌تر از معمول. درصد بردت در این مواقع ${pct(b.revenge.winRate)} بوده (در حالت عادی ${pct(b.revenge.baseWinRate)}).`
                : 'فعلاً دادهٔ کافی نیست.'
            }
            cost={b.revenge?.cost}
          />
          <HabitCard
            title="سودها را نگه می‌داری یا ضررها را؟"
            body={
              b.holding
                ? `معاملات سودده به‌طور میانگین ${duration(b.holding.winMs)} و معاملات ضررده ${duration(b.holding.lossMs)} باز مانده‌اند (${fa(b.holding.ratio, 1)} برابر).`
                : 'فعلاً دادهٔ کافی نیست.'
            }
            cost={b.holding?.cost}
          />
        </div>
      )}

      {/* نمودارها و تحلیل‌های عمیق‌تر — جمع‌شده تا صفحه شلوغ نشود */}
      {m.n > 0 && (
        <Disclosure summary="نمودارها و جزئیات بیشتر (سود هر نماد، سود در برابر ضرر، ساعت‌های بهتر و پیوست)">
          <div className="space-y-4 pt-2">
            <ExcursionPanel trades={a.trades} />

            <div className="grid gap-4 lg:grid-cols-2">
              <ChartBlock
                title={m.payoff !== null && m.payoff < 1 ? 'ضررهایت از سودهایت بزرگ‌ترند' : 'میانگین سود در برابر میانگین ضرر'}
                term="مقایسه سود و ضرر"
                cls="performance"
                caption={
                  m.avgWin !== null && m.avgLoss !== null
                    ? `ضرر معمولت ${usd(m.avgLoss)} و سود معمولت ${usd(m.avgWin)} است. برای سربه‌سر شدن باید ${pct(breakEvenWin)} ببری و الان ${pct(m.winRateDecisive)} می‌بری.`
                    : 'حداقل یک برد و یک باخت لازم است.'
                }
              >
                <Bars labels={['سود معمول', 'ضرر معمول']} values={[m.avgWin ?? 0, -(m.avgLoss ?? 0)]} ghost={[ghostWin, null]} />
              </ChartBlock>

              <ChartBlock
                title="سهم ۵ معاملهٔ برتر از کل سود"
                term="تمرکز سود"
                cls="performance"
                caption={m.top5Share !== null ? `۵ معاملهٔ برترت ${usd(m.top5Pnl)} سود ساخته‌اند (${pct(m.top5Share)} کل سود).` : 'وقتی سود خالص مثبت نباشد، این مقایسه معنا ندارد.'}
              >
                <Bars labels={['۵ معاملهٔ برتر', 'بقیهٔ معاملات']} values={[m.top5Pnl, m.netPnl - m.top5Pnl]} />
              </ChartBlock>
            </div>

            {b.bySymbol.length > 1 && (
              <ChartBlock
                title="سود و ضرر به تفکیک هر ارز"
                term="عملکرد هر نماد"
                cls="performance"
                caption={(() => {
                  const w = b.bySymbol.find((x) => x.verdict !== 'thin' && x.net < 0);
                  return w ? `بیشترین ضرر روی ${w.label} بوده (${fa(w.n)} معامله · ${usd(w.net, true)}).` : 'هیچ ارزی با تعداد کافی در مجموع ضررده نبوده.';
                })()}
              >
                <Bars labels={b.bySymbol.map((x) => x.label)} values={b.bySymbol.map((x) => x.net)} />
              </ChartBlock>
            )}

            {hist && (
              <ChartBlock
                title="پراکندگی سود و ضرر معاملات"
                term="توزیع نتیجه"
                cls="performance"
                caption={`بدترین ۵٪ معاملاتت ${pct(m.tailLossShare)} از کل ضررت را ساخته‌اند.`}
              >
                <Bars labels={hist.labels} values={hist.counts} unit="n" signed={false} colors={hist.colors} />
              </ChartBlock>
            )}

            {sizeQuartiles && (
              <ChartBlock
                title="آیا معاملات بزرگ‌ترت نتیجهٔ بدتری می‌دهند؟"
                term="اندازه در برابر نتیجه"
                cls="behaviour"
                caption={`میانگین نتیجه در بزرگ‌ترین معاملات ${usd(sizeQuartiles[3].exp, true)} و در کوچک‌ترین‌ها ${usd(sizeQuartiles[0].exp, true)} بوده.`}
              >
                <Bars labels={sizeQuartiles.map((q) => q.label)} values={sizeQuartiles.map((q) => q.exp)} />
              </ChartBlock>
            )}

            {dayStyle && freq.labels.length > 2 && (
              <ChartBlock
                title="تعداد معامله در هر روز"
                term="تعداد معاملات روزانه"
                cls="behaviour"
                caption={`میانگین ${fa(m.tradesPerActiveDay, 1)} معامله در هر روز فعال.`}
              >
                <Bars labels={freq.labels} values={freq.values} unit="n" signed={false} />
              </ChartBlock>
            )}

            <BucketTable title="خرید (لانگ) در برابر فروش (شورت)" rows={b.byDirection} />
            <BucketTable title="ساعت‌های بهتر و بدتر" rows={b.byHour} />
            <BucketTable title="روزهای هفته" rows={b.byWeekday} />

            {/* لیست معاملات بسته */}
            <div className="space-y-2 pt-2">
              <p className="text-xs font-bold text-ink">فهرست معاملات بررسی‌شده ({fa(allTrades.length)})</p>
              <div className="overflow-hidden rounded-xl border border-divider">
                {(showAllTrades ? allTrades : allTrades.slice(0, 8)).map((t) => (
                  <div
                    key={t.id}
                    className={cn(
                      'flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-divider/70 px-3 py-2 text-xs last:border-0',
                      worstIds.has(t.id) && 'bg-negative/5'
                    )}
                  >
                    <span className="font-semibold text-ink" dir="ltr">
                      {t.symbol}
                    </span>
                    <span className={t.direction === 'long' ? 'text-positive' : 'text-negative'}>
                      {t.direction === 'long' ? 'خرید' : 'فروش'}
                    </span>
                    <span className="text-muted">{VENUE_FA[t.venue]}</span>
                    <span className="text-muted">
                      {faDateTime(t.openTime)} · {duration((t.closeTime ?? 0) - t.openTime)}
                    </span>
                    <span className={cn('num-ltr ms-auto font-bold', pnlTone(t.netPnl))}>
                      <AmountText text={usd(t.netPnl, true)} />
                    </span>
                    {worstIds.has(t.id) && <Badge tone="loss">بدترین ۵٪</Badge>}
                  </div>
                ))}
              </div>
              {allTrades.length > 8 && (
                <Button size="sm" variant="outline" onClick={() => setShowAllTrades((v) => !v)}>
                  {showAllTrades ? 'نمایش ۸ معاملهٔ اخیر' : `نمایش همهٔ ${fa(allTrades.length)} معامله`}
                </Button>
              )}
            </div>

            {a.open.length > 0 && (
              <div className="text-xs">
                <p className="font-semibold text-ink">معاملات باز (فعلاً در آمار حساب نشده‌اند)</p>
                {a.open.map((t) => (
                  <p key={t.id} className="text-muted">
                    <span dir="ltr">{t.symbol}</span> · {t.direction === 'long' ? 'خرید' : 'فروش'} · {VENUE_FA[t.venue]} · حجم {usd(t.maxNotional)}
                  </p>
                ))}
              </div>
            )}
            {context.map((r) => (
              <p key={r.id} className="text-xs text-muted">
                {r.term}: {r.display}
              </p>
            ))}
          </div>
        </Disclosure>
      )}

      {hasSpot && spotBook && <SpotAutoAuditPanel b={spotBook} tz={tz} reviews={reviews} />}
    </div>
  );
}

/** حسابرسی خودکار اسپات — ساده، روشن و بدون نیاز به تایپ */
function SpotAutoAuditPanel({ b, tz, reviews }: { b: SpotBook; tz: string; reviews?: ReadonlyMap<string, WeeklyReview> }) {
  const [applied, setApplied] = useState(false);
  const t = b.totals;
  const decided = t.wins + t.losses;
  const winRate = decided > 0 ? (t.wins / decided) * 100 : null;
  const feeDragPct = t.volume > 0 ? ((t.gas + t.swapCost) / t.volume) * 100 : 0;
  const openValueUsd = b.open.reduce((sum, a) => sum + (a.value ?? 0), 0);
  const avgSwapUsd = t.swaps > 0 ? t.volume / t.swaps : 0;

  const step1 =
    feeDragPct > 1
      ? `هزینهٔ کارمزد و گس (${pct(feeDragPct, 2)} حجم) نسبتاً بالاست.`
      : `${fa(t.swaps)} سواپ با حجم ${usd(t.volume)} و هزینهٔ کل ${usd(t.gas + t.swapCost)} ثبت شده است.`;
  const step2 =
    decided > 0
      ? `از فروش‌هایت ${pct(winRate, 0)} سودده بوده (${fa(t.wins)} سود · ${fa(t.losses)} ضرر) و سود قطعی ${usd(t.realized, true)}.`
      : `${fa(b.open.length)} دارایی فعال به ارزش ${usd(openValueUsd)} داری و هنوز فروش بسته‌ای ثبت نشده.`;
  const step3 =
    feeDragPct > 1
      ? 'تبدیل‌های کوچک را یکی کن تا گس کمتری بدهی.'
      : 'حد ضرر و هدف دارایی‌های باز را در تب «برنامه خودکار» چک کن.';

  return (
    <Surface variant="focal" className="relative space-y-4 overflow-hidden border border-accent/30 p-5">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2.5px] bg-gradient-to-l from-gain via-accent/60 to-transparent" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-ink">حسابرسی خودکار معاملات اسپات (کیف پول‌ها)</p>
          <p className="text-xs text-muted">
            {fa(t.swaps)} تبدیل · {fa(b.open.length)} دارایی فعال
          </p>
          <p className="mt-0.5 text-[11px] text-subtle">
            فقط دارایی‌های موجود در کیف‌پول (۳ دلار به بالا، بدون اسپم · استثنای YT، PT و ETH رابین‌هود و هایپرلیکویید)
          </p>
        </div>
        <Badge tone="gain" className="shrink-0">تحلیل خودکار فعال</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <HeroTile label="ارزش دارایی‌های باز" value={usd(openValueUsd)} sub={`${fa(b.open.length)} دارایی`} tone="neutral" />
        <HeroTile label="حجم تبدیل‌ها" value={usd(t.volume)} sub={`${fa(t.swaps)} تبدیل`} tone="neutral" />
        {decided > 0 ? (
          <HeroTile label="درصد فروش‌های سودده" value={pct(winRate, 0)} sub={`سود قطعی ${usd(t.realized, true)}`} tone={(winRate ?? 0) >= 50 ? 'gain' : 'warn'} />
        ) : (
          <HeroTile label="میانگین هر تبدیل" value={usd(avgSwapUsd)} sub={`${fa(t.chains.length || 1)} شبکه`} tone="neutral" />
        )}
        <HeroTile label="کارمزد و گس" value={usd(t.gas + t.swapCost)} sub={`${pct(feeDragPct, 2)} حجم`} tone={feeDragPct > 1 ? 'loss' : 'gain'} />
      </div>
      <div className="grid gap-2.5 md:grid-cols-3">
        <div className="rounded-xl border border-divider/70 bg-surface-2/40 p-3">
          <p className="text-xs font-bold text-ink">۱. چه اتفاقی افتاده؟</p>
          <p className="mt-1 text-xs leading-6 text-muted">{step1}</p>
        </div>
        <div className="rounded-xl border border-divider/70 bg-surface-2/40 p-3">
          <p className="text-xs font-bold text-ink">۲. نتیجه چطور بوده؟</p>
          <p className="mt-1 text-xs leading-6 text-muted">{step2}</p>
        </div>
        <div className="rounded-xl border border-divider/70 bg-surface-2/40 p-3">
          <p className="text-xs font-bold text-ink">۳. پیشنهاد بعدی</p>
          <p className="mt-1 text-xs leading-6 text-muted">{step3}</p>
        </div>
      </div>
      {reviews && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider/70 pt-2.5">
          <span className="text-xs text-muted">افزودن خودکار این پیشنهاد به مرور این هفته</span>
          {applied ? (
            <Badge tone="gain">✓ اضافه شد</Badge>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const wk = isoWeekKey(Date.now(), tz);
                const base = reviews.get(wk) ?? emptyReview(wk);
                if (!base.commitments.some((c) => c.text === step3)) {
                  const next = [
                    ...base.commitments,
                    { id: `spot-loop-${Date.now().toString(36)}`, text: step3, rule: { type: 'requirePlan' as const }, done: false }
                  ].slice(0, 3);
                  void saveReview({ ...base, commitments: next }).then(() => setApplied(true));
                } else {
                  setApplied(true);
                }
              }}
            >
              افزودن به مرور این هفته
            </Button>
          )}
        </div>
      )}
    </Surface>
  );
}

function HabitCard({ title, body, cost }: { title: string; body: string; cost?: number | null }) {
  return (
    <Surface className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-ink">{title}</p>
        <ClassBadge c="behaviour" />
      </div>
      <p className="mt-1.5 text-xs leading-6 text-muted">{body}</p>
      {cost ? <p className="mt-1.5 text-xs font-bold text-negative">ضرر این عادت ≈ {usd(-cost)}</p> : null}
    </Surface>
  );
}

const VERDICT_LABEL = { keep: 'خوب است', fix: 'نیاز به اصلاح', delete: 'تکرار نکن', thin: 'داده کم' } as const;
function BucketTable({ title, rows, empty }: { title: string; rows: BookAudit['behavior']['byHour']; empty?: string }) {
  return (
    <div className="mt-3">
      <p className="text-xs font-bold text-ink">{title}</p>
      {!rows.length ? (
        <p className="text-xs text-subtle">{empty ?? '—'}</p>
      ) : (
        <div className="mt-1.5 divide-y divide-divider/70 rounded-xl border border-divider">
          {rows.map((r) => (
            <div key={r.key} className="flex flex-wrap items-center gap-x-3 px-3 py-2 text-xs">
              <span className="min-w-20 font-medium text-ink">{r.label}</span>
              <span className="text-muted">{fa(r.n)} معامله</span>
              <span className="text-muted">برد {pct(r.winRate, 0)}</span>
              <span className={cn('num-ltr', pnlTone(r.expectancy))}>میانگین {usd(r.expectancy, true)}</span>
              <span className={cn('num-ltr ms-auto font-semibold', pnlTone(r.net))}>
                <AmountText text={usd(r.net, true)} />
              </span>
              <Badge tone={r.verdict === 'keep' ? 'gain' : r.verdict === 'delete' ? 'loss' : r.verdict === 'fix' ? 'warn' : 'neutral'}>
                {VERDICT_LABEL[r.verdict]}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

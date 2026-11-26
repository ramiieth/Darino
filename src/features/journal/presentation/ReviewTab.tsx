/**
 * تب «مرور هفتگی» — ۱۰۰٪ خودکار و بدون نیاز به تایپ دستی:
 *   • آمار هفته + جمع‌بندی خودکار به زبان ساده (هوش مصنوعی یا تحلیلگر داخلی روی اعداد واقعی)
 *   • کارت‌های خوانا برای «چه کارهایی خوب بود؟»، «چه چیزهایی بهت ضربه زد؟» و «هفتهٔ بعد چطور بهتر شوم؟»
 *   • هیچ کادر textarea بازی صفحه را شلوغ نمی‌کند؛ ویرایش دلخواه فقط داخل بخش بازشوندهٔ اختیاری است.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Plus, RefreshCw, Sparkles, Target, Trash2 } from 'lucide-react';
import { fetchJson } from '@/repositories/remoteClient';
import { buildLocalReviewSuggestion, mergeSuggestion, reviewPayload, spotWeek, type ReviewSuggestion } from '../domain/reviewAssist';
import { useSpot } from '../data/useSpot';
import { Link } from 'react-router-dom';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Input, Select } from '@/shared/components/ui/Input';
import { Notice } from '@/shared/components/ui/StateViews';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { cn } from '@/shared/lib/cn';
import type { ClassifiedTrade, Commitment, CommitmentRule, JournalSettings, TradeNote, TradePlan, WeeklyReview } from '../domain/types';
import { checkCommitment, crossWeekPatterns, emptyReview, RULE_FA, tradesByWeek, weekStats, type CommitmentStatus } from '../domain/review';
import { isoWeekKey, isoWeekStartUtc, shiftWeek } from '../domain/time';
import { plannedRisks } from '../domain/plan';
import { saveReview } from '../data/journalStore';
import { fa, faDate, faDateTime, pct, pnlTone, TagPicker, usd } from './parts';
import { Bars } from './charts';
import { AmountText } from '@/shared/components/ui/FinancialValue';

const STATUS_TONE: Record<CommitmentStatus, 'gain' | 'loss' | 'neutral' | 'warn' | 'info'> = {
  kept: 'gain',
  broken: 'loss',
  unknown: 'neutral',
  manual: 'info',
  pending: 'warn'
};
const STATUS_FA: Record<CommitmentStatus, string> = {
  kept: 'رعایت شد',
  broken: 'رعایت نشد',
  unknown: 'داده کافی نیست',
  manual: 'دستی',
  pending: 'در جریان'
};

function defaultRule(type: CommitmentRule['type']): CommitmentRule {
  switch (type) {
    case 'maxTradesPerDay':
      return { type, n: 2 };
    case 'cooldownAfterLoss':
      return { type, minutes: 60 };
    case 'maxRiskPct':
      return { type, pct: 1 };
    case 'maxLossUsd':
      return { type, usd: 100 };
    case 'allowedSetups':
      return { type, tags: [] };
    case 'noTradeHours':
      return { type, from: 0, to: 6 };
    default:
      return { type } as CommitmentRule;
  }
}

function RuleParams({ rule, onChange, whyTags }: { rule: CommitmentRule; onChange: (r: CommitmentRule) => void; whyTags: string[] }) {
  const n = (v: string) => Math.max(0, Number(v) || 0);
  switch (rule.type) {
    case 'maxTradesPerDay':
      return <Input className="w-24" inputMode="numeric" value={String(rule.n)} onChange={(e) => onChange({ ...rule, n: Math.max(1, n(e.target.value)) })} aria-label="تعداد" />;
    case 'cooldownAfterLoss':
      return <Input className="w-24" inputMode="numeric" value={String(rule.minutes)} onChange={(e) => onChange({ ...rule, minutes: n(e.target.value) })} aria-label="دقیقه" />;
    case 'maxRiskPct':
      return <Input className="w-24" inputMode="decimal" value={String(rule.pct)} onChange={(e) => onChange({ ...rule, pct: n(e.target.value) })} aria-label="درصد" />;
    case 'maxLossUsd':
      return <Input className="w-28" inputMode="decimal" value={String(rule.usd)} onChange={(e) => onChange({ ...rule, usd: n(e.target.value) })} aria-label="دلار" />;
    case 'noTradeHours':
      return (
        <span className="flex items-center gap-1 text-xs">
          از <Input className="w-16" inputMode="numeric" value={String(rule.from)} onChange={(e) => onChange({ ...rule, from: Math.min(23, n(e.target.value)) })} /> تا{' '}
          <Input className="w-16" inputMode="numeric" value={String(rule.to)} onChange={(e) => onChange({ ...rule, to: Math.min(24, n(e.target.value)) })} />
        </span>
      );
    case 'allowedSetups':
      return (
        <div className="w-full">
          <TagPicker label="ورودهای مجاز" tags={whyTags} value={rule.tags} onChange={(tags) => onChange({ ...rule, tags })} />
        </div>
      );
    default:
      return null;
  }
}

export function ReviewTab({
  trades,
  notes,
  links,
  auto,
  reviews,
  settings,
  tz,
  accountSize
}: {
  trades: ClassifiedTrade[];
  notes: Map<string, TradeNote>;
  links: Map<string, TradePlan>;
  auto?: ReadonlyMap<string, TradePlan>;
  reviews: Map<string, WeeklyReview>;
  settings: JournalSettings;
  tz: string;
  accountSize: number | null;
}) {
  const thisWeek = isoWeekKey(Date.now(), tz);
  const [week, setWeek] = useState(thisWeek);
  const [view, setView] = useState<'review' | 'compare'>('review');
  const byWeek = useMemo(() => tradesByWeek(trades, tz), [trades, tz]);
  const risks = useMemo(() => plannedRisks(links, trades), [links, trades]);
  const saved = reviews.get(week);
  const [draft, setDraft] = useState<WeeklyReview | null>(null);
  const r = draft && draft.week === week ? draft : saved ?? emptyReview(week);
  const edit = (patch: Partial<WeeklyReview>) => setDraft({ ...r, ...patch });
  const persist = (next: WeeklyReview = r) => void saveReview(next).then(() => setDraft(null));
  const dirty = !!draft && draft.week === week;

  const wTrades = byWeek.get(week) ?? [];
  const spot = useSpot(0);
  const weekStart = isoWeekStartUtc(week) ?? 0;
  const wSpot = useMemo(() => spotWeek(spot.book, weekStart, weekStart + 7 * 86_400_000), [spot.book, weekStart]);
  const spotSwaps = typeof wSpot?.swaps === 'number' ? wSpot.swaps : 0;
  const hasActivity = wTrades.length > 0 || spotSwaps > 0;
  const stats = weekStats(week, wTrades, notes, links);
  const prevWeek = shiftWeek(week, -1);
  const prevReview = reviews.get(prevWeek);
  const ctxFor = (w: string) => ({ tz, notes, links, risks, accountSize, weekEnded: w < thisWeek });
  const checks = (prevReview?.commitments ?? []).map((c) => ({ c, res: checkCommitment(c, wTrades, ctxFor(week)) }));

  const allStats = useMemo(() => {
    const keys = new Set([...byWeek.keys(), ...reviews.keys()]);
    return [...keys].sort().map((w) => weekStats(w, byWeek.get(w) ?? [], notes, links));
  }, [byWeek, reviews, notes, links]);

  const broken = useMemo(() => {
    const out: { week: string; text: string }[] = [];
    for (const [w, rev] of reviews) {
      const exec = shiftWeek(w, 1);
      for (const c of rev.commitments)
        if (checkCommitment(c, byWeek.get(exec) ?? [], ctxFor(exec)).status === 'broken')
          out.push({ week: exec, text: c.text || RULE_FA[c.rule.type] });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviews, byWeek, notes, links, risks]);

  const patterns = useMemo(() => crossWeekPatterns(allStats.filter((s) => s.n > 0), reviews, broken), [allStats, reviews, broken]);

  // ---------- تکمیل خودکار بدون نیاز به تایپ کاربر ----------
  const [ai, setAi] = useState<{ week: string; status: 'loading' } | null>(null);
  const latest = useRef(r);
  latest.current = r;
  const tried = useRef(new Set<string>());
  const allPlans = useMemo(() => new Map<string, TradePlan>([...(auto ?? new Map()), ...links]), [auto, links]);

  const runAi = useCallback(async () => {
    const w = week;
    setAi({ week: w, status: 'loading' });
    const body = reviewPayload({ week: w, stats, trades: wTrades, notes, plans: allPlans, checks, settings, accountSize, tz, spot: wSpot });
    try {
      const res = await fetchJson<{ review: ReviewSuggestion; model?: string; provider?: 'gemini' | 'fallback' }>('/api/integrations?op=analyze-review', {
        method: 'POST',
        body,
        timeoutMs: 120_000
      });
      if (latest.current.week !== w) {
        setAi(null);
        return;
      }
      await saveReview(mergeSuggestion(latest.current, res.review, Date.now(), { model: res.model, provider: res.provider }));
      setDraft(null);
      setAi(null);
    } catch {
      if (latest.current.week !== w) {
        setAi(null);
        return;
      }
      const local = buildLocalReviewSuggestion(body);
      await saveReview(mergeSuggestion(latest.current, local, Date.now(), { model: 'local-analytics', provider: 'fallback' }));
      setDraft(null);
      setAi(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week, wTrades, notes, allPlans, settings, accountSize, tz, wSpot]);

  useEffect(() => {
    if (view !== 'review' || spot.loading || !hasActivity || saved?.aiAt || tried.current.has(week)) return;
    tried.current.add(week);
    void runAi();
  }, [view, week, hasActivity, spot.loading, saved?.aiAt, runAi]);

  const aiBusy = ai?.week === week && ai.status === 'loading';
  const start = isoWeekStartUtc(week);
  const setCommit = (i: number, patch: Partial<Commitment>) =>
    edit({ commitments: r.commitments.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  const autoMistakeTags = [...new Set([...stats.mistakeTags.keys(), ...r.mistakeTags])];
  const autoGoodTags = r.goodTags;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          label="نما"
          options={[
            { value: 'review', label: 'مرور این هفته' },
            { value: 'compare', label: 'مقایسهٔ هفته‌ها' }
          ]}
          value={view}
          onChange={setView}
        />
        {view === 'review' && (
          <div className="ms-auto flex items-center gap-1 rounded-xl border border-divider/80 bg-card px-1.5 py-1">
            <Button size="icon-sm" variant="ghost" aria-label="هفتهٔ قبل" onClick={() => { setWeek(prevWeek); setDraft(null); }}>
              <ChevronRight />
            </Button>
            <span className="px-1 text-xs font-bold text-ink">
              {week.replace('-W', ' · هفتهٔ ')}
              {start ? ` (${faDate(start)})` : ''}
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="هفتهٔ بعد"
              disabled={week >= thisWeek}
              onClick={() => { setWeek(shiftWeek(week, 1)); setDraft(null); }}
            >
              <ChevronLeft />
            </Button>
          </div>
        )}
      </div>

      {view === 'compare' ? (
        allStats.filter((s) => s.n > 0).length < 2 ? (
          <Notice tone="info">برای مقایسه حداقل دو هفته با معامله لازم است.</Notice>
        ) : (
          <>
            <Surface className="overflow-x-auto p-4 md:p-5">
              <table className="data-table w-full min-w-[540px] text-xs">
                <thead>
                  <tr>
                    {['هفته', 'معامله', 'سود/زیان', 'درصد برد', 'با برنامه', 'طبق قانون', 'خلاف قانون', 'اشتباه‌های اصلی'].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allStats
                    .filter((s) => s.n > 0)
                    .map((s) => (
                      <tr key={s.week}>
                        <td className="font-semibold text-accent">{s.week.replace(/^\d{4}-W/, 'هفتهٔ ')}</td>
                        <td>{fa(s.n)}</td>
                        <td className={cn('num-ltr font-bold', pnlTone(s.net))}>{usd(s.net, true)}</td>
                        <td>{pct(s.winRate, 0)}</td>
                        <td>{pct(s.planCoverage, 0)}</td>
                        <td>{pct(s.ruleAdherence, 0)}</td>
                        <td className={s.offRules.length ? 'font-semibold text-negative' : 'text-subtle'}>
                          {s.offRules.length ? `${fa(s.offRules.length)} · ${usd(s.offRules.reduce((a, t) => a + t.netPnl, 0), true)}` : '—'}
                        </td>
                        <td className="text-muted">
                          {[
                            ...new Set([
                              ...[...s.mistakeTags.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k),
                              ...(reviews.get(s.week)?.mistakeTags ?? [])
                            ])
                          ]
                            .slice(0, 3)
                            .join(' · ') || '—'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <div className="mt-4">
                <Bars
                  labels={allStats.filter((s) => s.n > 0).map((s) => s.week.replace(/^\d{4}-W/, 'W'))}
                  values={allStats.filter((s) => s.n > 0).map((s) => s.net)}
                  height={160}
                />
              </div>
            </Surface>

            <Surface className="p-4 md:p-5">
              <h3 className="text-sm font-bold text-ink">الگوهای شناسایی‌شده</h3>
              {!patterns.length ? (
                <p className="mt-1.5 text-xs text-muted">فعلاً الگوی تکراری خاصی دیده نشده.</p>
              ) : (
                <ul className="mt-2.5 space-y-2">
                  {patterns.map((p, i) => (
                    <li
                      key={i}
                      className={cn(
                        'flex items-start gap-2 rounded-xl border px-3 py-2 text-sm leading-7',
                        p.tone === 'bad'
                          ? 'border-negative/25 bg-negative/[0.04]'
                          : p.tone === 'good'
                            ? 'border-gain/25 bg-gain/[0.04]'
                            : 'border-warn/25 bg-warn/[0.04]'
                      )}
                    >
                      <span className={cn('font-bold', p.tone === 'bad' ? 'text-negative' : p.tone === 'good' ? 'text-positive' : 'text-warn')}>
                        {p.tone === 'bad' ? '!' : p.tone === 'good' ? '✓' : '•'}
                      </span>
                      <span className="text-ink">{p.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Surface>

            <Surface variant="subtle" className="p-4 text-xs leading-6 text-muted">
              می‌خواهی دقیق‌تر بپرسی؟ آمار هفته‌ها در اختیار{' '}
              <Link to="/assistant" className="font-semibold text-accent underline">
                دستیار پرتفولیو
              </Link>{' '}
              است.
            </Surface>
          </>
        )
      ) : (
        <>
          {/* آمار هفته در ۵ تایل خوش‌رنگ */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatTile label="تعداد معامله" value={fa(stats.n)} />
            <StatTile
              label="سود و زیان هفته"
              value={usd(stats.net, true)}
              tone={stats.net > 0 ? 'gain' : stats.net < 0 ? 'loss' : 'neutral'}
            />
            <StatTile label="درصد برد" value={pct(stats.winRate, 0)} />
            <StatTile label="با برنامه" value={pct(stats.planCoverage, 0)} />
            <StatTile
              label="طبق قانون"
              value={pct(stats.ruleAdherence, 0)}
              tone={stats.ruleAdherence === null ? 'neutral' : stats.ruleAdherence >= 90 ? 'gain' : stats.ruleAdherence >= 75 ? 'warn' : 'loss'}
            />
          </div>

          {/* خلاصه هوشمند خودکار */}
          <Surface variant="focal" className="relative space-y-2.5 overflow-hidden border border-accent/35 p-5">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-l from-accent via-gain/60 to-transparent" />
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-accent/12 text-accent">
                <Sparkles className="h-4 w-4" aria-hidden />
              </span>
              <h3 className="text-sm font-bold text-ink">جمع‌بندی خودکار این هفته</h3>
              {r.aiProvider === 'gemini' && <Badge tone="info">تحلیل هوشمند</Badge>}
              {r.aiProvider === 'fallback' && <Badge tone="neutral">تحلیل خودکار از اعداد</Badge>}
              {r.aiAt && <span className="text-[11px] text-subtle">· {faDateTime(r.aiAt)}</span>}
              <Button
                size="sm"
                variant="outline"
                className="ms-auto"
                icon={<RefreshCw className="h-3.5 w-3.5" />}
                disabled={aiBusy || !hasActivity}
                onClick={() => void runAi()}
              >
                {r.aiAt ? 'به‌روزرسانی' : 'ساخت خلاصه'}
              </Button>
            </div>
            {aiBusy ? (
              <p className="text-sm text-muted">در حال خواندن معاملات این هفته و نوشتن خلاصهٔ ساده…</p>
            ) : r.aiSummary ? (
              <p className="whitespace-pre-line text-sm leading-7 text-ink">{r.aiSummary}</p>
            ) : (
              <p className="text-sm leading-7 text-muted">
                {hasActivity
                  ? `این هفته ${fa(stats.n)} معامله داشتی با نتیجهٔ ${usd(stats.net, true)}. خلاصهٔ کامل خودکار در حال آماده شدن است.`
                  : spot.loading
                    ? 'در حال خواندن تبدیل‌های اسپات…'
                    : 'این هفته معاملهٔ بسته‌ای ثبت نشده است.'}
              </p>
            )}
            {spotSwaps > 0 && <p className="text-xs text-subtle">شامل {fa(spotSwaps)} تبدیل اسپات این هفته.</p>}
          </Surface>

          {/* دو کارت خوانا و رنگی: کارهای خوب در برابر اشتباه‌ها (بدون textarea شلوغ!) */}
          <div className="grid gap-4 md:grid-cols-2">
            <Surface className="space-y-2.5 border-gain/30 bg-gain/[0.025] p-4 md:p-5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4.5 w-4.5 text-positive" aria-hidden />
                <h3 className="text-sm font-bold text-ink">چه کارهایی خوب پیش رفت؟</h3>
              </div>
              {autoGoodTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {autoGoodTags.map((t) => (
                    <Badge key={t} tone="gain">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-xs leading-6 text-muted">
                {r.goodNote ||
                  (stats.offRules.length === 0 && stats.n > 0
                    ? 'تمام معاملات این هفته منظم و بدون تخطی از قوانین ثبت شده‌اند.'
                    : 'به‌محض کامل شدن تحلیل خودکار، نکات مثبت این هفته اینجا نمایش داده می‌شود.')}
              </p>
            </Surface>

            <Surface className="space-y-2.5 border-negative/30 bg-negative/[0.025] p-4 md:p-5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4.5 w-4.5 text-negative" aria-hidden />
                <h3 className="text-sm font-bold text-ink">چه چیزهایی بهت ضربه زد؟</h3>
              </div>
              {autoMistakeTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {autoMistakeTags.map((t) => (
                    <Badge key={t} tone="loss">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-xs leading-6 text-muted">
                {r.mistakeNote ||
                  (stats.offRules.length > 0
                    ? `${fa(stats.offRules.length)} معامله خلاف قانون داشتی که باید هفتهٔ بعد تکرار نشود.`
                    : 'اشتباه خاصی در این هفته ثبت نشده است.')}
              </p>
              {stats.offRules.length > 0 && (
                <div className="space-y-1 border-t border-negative/15 pt-2">
                  {stats.offRules.map((t) => (
                    <p key={t.id} className="text-xs text-negative">
                      • <span dir="ltr">{t.symbol}</span> ({t.direction === 'long' ? 'خرید' : 'فروش'}) · {usd(t.netPnl, true)}
                    </p>
                  ))}
                </div>
              )}
            </Surface>
          </div>

          {/* تعهدهای هفته قبل (خودکار بررسی شده) */}
          {checks.length > 0 && (
            <Surface className="p-4 md:p-5">
              <h3 className="text-sm font-bold text-ink">قول‌های هفتهٔ قبل چطور پیش رفت؟</h3>
              <ul className="mt-2.5 space-y-2">
                {checks.map(({ c, res }) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2/50 px-3 py-2 text-xs">
                    <Badge tone={STATUS_TONE[res.status]}>{STATUS_FA[res.status]}</Badge>
                    <span className="font-semibold text-ink">{c.text || RULE_FA[c.rule.type]}</span>
                    <span className="text-muted">{res.detail}</span>
                  </li>
                ))}
              </ul>
            </Surface>
          )}

          {/* برنامه و تعهد هفتهٔ بعد — خوانا و تمیز */}
          <Surface className="space-y-3 border-accent/35 p-4 md:p-5">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-accent/12 text-accent">
                <Target className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <h3 className="text-sm font-bold text-ink">هفتهٔ بعد چطور بهتر شوم؟</h3>
                <p className="text-xs text-muted">این قوانین خودکار پیشنهاد می‌شوند و هفتهٔ بعد هم خودکار بررسی می‌شوند.</p>
              </div>
            </div>

            {r.commitments.length > 0 ? (
              <ul className="space-y-2">
                {r.commitments.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-divider/70 bg-surface-2/40 px-3.5 py-2.5 text-sm">
                    <span className="font-semibold text-ink">{c.text || RULE_FA[c.rule.type]}</span>
                    <Badge tone="info">{RULE_FA[c.rule.type]}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted">فعلاً قانونی برای هفتهٔ بعد ثبت نشده؛ با زدن «به‌روزرسانی» در بالا خودکار پیشنهاد می‌شود.</p>
            )}
          </Surface>

          {/* بخش ویرایش دستی اختیاری — کاملاً بسته تا صفحه شلوغ و تایپی نباشد */}
          <Disclosure summary="ویرایش دلخواه یا افزودن یادداشت و قانون دستی (اختیاری)">
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <p className="text-xs font-bold text-ink">ویرایش تگ‌ها و یادداشت اشتباه‌ها</p>
                <TagPicker label="اشتباه‌های هفته" tone="loss" tags={settings.mistakeTags} value={r.mistakeTags} onChange={(v) => persist({ ...r, mistakeTags: v })} />
                <textarea
                  className="min-h-16 w-full rounded-xl border border-divider bg-card p-2.5 text-sm"
                  placeholder="یادداشت دلخواه…"
                  value={r.mistakeNote}
                  onChange={(e) => edit({ mistakeNote: e.target.value.slice(0, 2000) })}
                  onBlur={() => dirty && persist()}
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold text-ink">ویرایش تگ‌ها و یادداشت نقاط قوت</p>
                <TagPicker label="نقاط قوت هفته" tone="gain" tags={settings.goodTags} value={r.goodTags} onChange={(v) => persist({ ...r, goodTags: v })} />
                <textarea
                  className="min-h-16 w-full rounded-xl border border-divider bg-card p-2.5 text-sm"
                  placeholder="یادداشت دلخواه…"
                  value={r.goodNote}
                  onChange={(e) => edit({ goodNote: e.target.value.slice(0, 2000) })}
                  onBlur={() => dirty && persist()}
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold text-ink">مدیریت قوانین هفتهٔ بعد</p>
                {r.commitments.map((c, i) => (
                  <div key={c.id} className="space-y-2 rounded-xl border border-divider p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Select className="w-auto" value={c.rule.type} onChange={(e) => setCommit(i, { rule: defaultRule(e.target.value as CommitmentRule['type']) })}>
                        {(Object.keys(RULE_FA) as CommitmentRule['type'][]).map((k) => (
                          <option key={k} value={k}>
                            {RULE_FA[k]}
                          </option>
                        ))}
                      </Select>
                      <RuleParams rule={c.rule} whyTags={settings.whyTags} onChange={(rule) => setCommit(i, { rule })} />
                      {c.rule.type === 'free' && (
                        <label className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={c.done}
                            onChange={(e) => persist({ ...r, commitments: r.commitments.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)) })}
                          />{' '}
                          انجام شد
                        </label>
                      )}
                      <Button size="icon-sm" variant="ghost" className="ms-auto" aria-label="حذف" onClick={() => persist({ ...r, commitments: r.commitments.filter((_, j) => j !== i) })}>
                        <Trash2 />
                      </Button>
                    </div>
                    <Input
                      placeholder="مثلاً حداکثر ۲ معامله در روز"
                      value={c.text}
                      onChange={(e) => setCommit(i, { text: e.target.value.slice(0, 200) })}
                      onBlur={() => dirty && persist()}
                    />
                  </div>
                ))}
                {r.commitments.length < 3 && (
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Plus />}
                    onClick={() => persist({ ...r, commitments: [...r.commitments, { id: `c${Date.now().toString(36)}`, text: '', rule: { type: 'maxTradesPerDay', n: 2 }, done: false }] })}
                  >
                    افزودن قانون
                  </Button>
                )}
                {dirty && (
                  <Button size="sm" onClick={() => persist()}>
                    ذخیره
                  </Button>
                )}
              </div>
            </div>
          </Disclosure>
        </>
      )}
    </div>
  );
}

function StatTile({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'gain' | 'loss' | 'warn' | 'neutral' }) {
  const bg =
    tone === 'gain'
      ? 'border-gain/25 bg-gain/[0.04]'
      : tone === 'loss'
        ? 'border-negative/25 bg-negative/[0.04]'
        : tone === 'warn'
          ? 'border-warn/25 bg-warn/[0.04]'
          : 'border-divider/80 bg-card';
  const text =
    tone === 'gain' ? 'text-positive' : tone === 'loss' ? 'text-negative' : tone === 'warn' ? 'text-warn' : 'text-ink';
  return (
    <div className={cn('rounded-xl border p-3.5', bg)}>
      <p className="text-[11px] font-medium text-muted">{label}</p>
      <p className={cn('num-ltr mt-1 text-xl font-extrabold', text)}>
        <AmountText text={value} />
      </p>
    </div>
  );
}

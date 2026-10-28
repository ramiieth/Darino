/**
 * تب «مرور هفتگی» — بازسازی کامل «Weekly Review» با رفع اشکال‌های نسخهٔ مستقل:
 *   • کلید هفته با سال (ISO)، ذخیرهٔ همگام بین دستگاه‌ها (نه localStorage)، بدون از دست رفتن فوکوس هنگام تایپ
 *   • لاگ معاملات خودکار از دفتر جهت‌دار (نه تایپ دستی)؛ «طبق قانون» و تگ‌ها از تب معاملات
 *   • تعهدها قابل‌سنجش: نوع قانون انتخاب می‌شود و روی هفتهٔ بعد خودکار بررسی می‌شود؛ تعهد آزاد تیک دستی دارد
 *   • مقایسهٔ هفته‌ها و الگوهای تکرارشونده محاسبه‌ای؛ «تحلیل منتور» به دستیار اپ سپرده می‌شود (سمت سرور)
 */
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Input, Select } from '@/shared/components/ui/Input';
import { Notice } from '@/shared/components/ui/StateViews';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { cn } from '@/shared/lib/cn';
import type { ClassifiedTrade, Commitment, CommitmentRule, JournalSettings, TradeNote, TradePlan, WeeklyReview } from '../domain/types';
import { checkCommitment, crossWeekPatterns, emptyReview, RULE_FA, tradesByWeek, weekStats, type CommitmentStatus } from '../domain/review';
import { isoWeekKey, isoWeekStartUtc, shiftWeek } from '../domain/time';
import { plannedRisks } from '../domain/plan';
import { saveReview } from '../data/journalStore';
import { fa, faDate, pct, pnlTone, TagPicker, usd } from './parts';
import { Bars } from './charts';

const STATUS_TONE: Record<CommitmentStatus, 'gain' | 'loss' | 'neutral' | 'warn' | 'info'> = { kept: 'gain', broken: 'loss', unknown: 'neutral', manual: 'info', pending: 'warn' };
const STATUS_FA: Record<CommitmentStatus, string> = { kept: 'رعایت شد', broken: 'شکسته شد', unknown: 'دادهٔ ناکافی', manual: 'دستی', pending: 'در جریان' };

function defaultRule(type: CommitmentRule['type']): CommitmentRule {
  switch (type) {
    case 'maxTradesPerDay': return { type, n: 2 };
    case 'cooldownAfterLoss': return { type, minutes: 60 };
    case 'maxRiskPct': return { type, pct: 1 };
    case 'maxLossUsd': return { type, usd: 100 };
    case 'allowedSetups': return { type, tags: [] };
    case 'noTradeHours': return { type, from: 0, to: 6 };
    default: return { type } as CommitmentRule;
  }
}

function RuleParams({ rule, onChange, whyTags }: { rule: CommitmentRule; onChange: (r: CommitmentRule) => void; whyTags: string[] }) {
  const n = (v: string) => Math.max(0, Number(v) || 0);
  switch (rule.type) {
    case 'maxTradesPerDay': return <Input className="w-24" inputMode="numeric" value={String(rule.n)} onChange={(e) => onChange({ ...rule, n: Math.max(1, n(e.target.value)) })} aria-label="تعداد" />;
    case 'cooldownAfterLoss': return <Input className="w-24" inputMode="numeric" value={String(rule.minutes)} onChange={(e) => onChange({ ...rule, minutes: n(e.target.value) })} aria-label="دقیقه" />;
    case 'maxRiskPct': return <Input className="w-24" inputMode="decimal" value={String(rule.pct)} onChange={(e) => onChange({ ...rule, pct: n(e.target.value) })} aria-label="درصد" />;
    case 'maxLossUsd': return <Input className="w-28" inputMode="decimal" value={String(rule.usd)} onChange={(e) => onChange({ ...rule, usd: n(e.target.value) })} aria-label="دلار" />;
    case 'noTradeHours': return (
      <span className="flex items-center gap-1 text-xs">از <Input className="w-16" inputMode="numeric" value={String(rule.from)} onChange={(e) => onChange({ ...rule, from: Math.min(23, n(e.target.value)) })} /> تا <Input className="w-16" inputMode="numeric" value={String(rule.to)} onChange={(e) => onChange({ ...rule, to: Math.min(24, n(e.target.value)) })} /></span>
    );
    case 'allowedSetups': return <div className="w-full"><TagPicker label="ورودهای مجاز" tags={whyTags} value={rule.tags} onChange={(tags) => onChange({ ...rule, tags })} /></div>;
    default: return null;
  }
}

export function ReviewTab({ trades, notes, links, reviews, settings, tz, accountSize }: { trades: ClassifiedTrade[]; notes: Map<string, TradeNote>; links: Map<string, TradePlan>; reviews: Map<string, WeeklyReview>; settings: JournalSettings; tz: string; accountSize: number | null }) {
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
      for (const c of rev.commitments) if (checkCommitment(c, byWeek.get(exec) ?? [], ctxFor(exec)).status === 'broken') out.push({ week: exec, text: c.text || RULE_FA[c.rule.type] });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviews, byWeek, notes, links, risks]);
  const patterns = useMemo(() => crossWeekPatterns(allStats.filter((s) => s.n > 0), reviews, broken), [allStats, reviews, broken]);

  const start = isoWeekStartUtc(week);
  const setCommit = (i: number, patch: Partial<Commitment>) => edit({ commitments: r.commitments.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl label="نما" options={[{ value: 'review', label: 'مرور هفته' }, { value: 'compare', label: 'مقایسهٔ هفته‌ها' }]} value={view} onChange={setView} />
        {view === 'review' && (
          <div className="ms-auto flex items-center gap-1">
            <Button size="icon-sm" variant="ghost" aria-label="هفتهٔ قبل" onClick={() => { setWeek(prevWeek); setDraft(null); }}><ChevronRight /></Button>
            <span className="text-sm font-semibold text-ink">{week.replace('-W', ' · هفتهٔ ')}{start ? ` (${faDate(start)})` : ''}</span>
            <Button size="icon-sm" variant="ghost" aria-label="هفتهٔ بعد" disabled={week >= thisWeek} onClick={() => { setWeek(shiftWeek(week, 1)); setDraft(null); }}><ChevronLeft /></Button>
          </div>
        )}
      </div>

      {view === 'compare' ? (
        allStats.filter((s) => s.n > 0).length < 2 ? <Notice tone="info">برای مقایسه حداقل دو هفته با معامله لازم است.</Notice> : (
          <>
            <Surface className="overflow-x-auto p-4">
              <table className="w-full min-w-[560px] text-xs">
                <thead><tr className="text-muted">{['هفته', 'معامله', 'سود خالص', 'نرخ برد', 'پوشش برنامه', 'پایبندی', 'خلاف قانون', 'اشتباه‌های اصلی'].map((h) => <th key={h} className="pb-2 text-start font-normal">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-divider">
                  {allStats.filter((s) => s.n > 0).map((s) => (
                    <tr key={s.week}>
                      <td className="py-2 text-accent">{s.week.replace(/^\d{4}-W/, 'هفتهٔ ')}</td>
                      <td>{fa(s.n)}</td>
                      <td className={cn('num-ltr', pnlTone(s.net))}>{usd(s.net, true)}</td>
                      <td>{pct(s.winRate, 0)}</td>
                      <td>{pct(s.planCoverage, 0)}</td>
                      <td>{pct(s.ruleAdherence, 0)}</td>
                      <td className={s.offRules.length ? 'text-negative' : 'text-subtle'}>{s.offRules.length ? `${fa(s.offRules.length)} · ${usd(s.offRules.reduce((a, t) => a + t.netPnl, 0), true)}` : '—'}</td>
                      <td className="text-muted">{[...new Set([...[...s.mistakeTags.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k), ...(reviews.get(s.week)?.mistakeTags ?? [])])].slice(0, 3).join(' · ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4"><Bars labels={allStats.filter((s) => s.n > 0).map((s) => s.week.replace(/^\d{4}-W/, 'W'))} values={allStats.filter((s) => s.n > 0).map((s) => s.net)} height={160} /></div>
            </Surface>
            <Surface className="p-4">
              <h3 className="text-sm font-bold text-ink">الگوهای شناسایی‌شده</h3>
              {!patterns.length ? <p className="mt-1 text-xs text-muted">چیز تکرارشونده‌ای پیدا نشد. یا انضباط است، یا دادهٔ کم.</p> : (
                <ul className="mt-2 space-y-2">{patterns.map((p, i) => <li key={i} className="flex gap-2 text-sm leading-7"><span className={p.tone === 'bad' ? 'text-negative' : p.tone === 'good' ? 'text-positive' : 'text-warn'}>{p.tone === 'bad' ? '!' : p.tone === 'good' ? '+' : '~'}</span><span className="text-ink">{p.text}</span></li>)}</ul>
              )}
            </Surface>
            <Surface variant="subtle" className="p-4 text-xs leading-6 text-muted">
              تحلیل منتور: آمار هفته‌ها در اختیار <Link to="/assistant" className="text-accent underline">دستیار پرتفولیو</Link> است. بپرسید: «الگوهای رفتاری من در ژورنال چیست و تعهدهای کدام هفته شکسته شد؟»
            </Surface>
          </>
        )
      ) : (
        <>
          <Surface className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-5">
            <div><p className="text-[11px] text-muted">معامله</p><p className="text-xl font-bold text-ink">{fa(stats.n)}</p></div>
            <div><p className="text-[11px] text-muted">سود خالص</p><p className={cn('num-ltr text-xl font-bold', pnlTone(stats.net))}>{usd(stats.net, true)}</p></div>
            <div><p className="text-[11px] text-muted">نرخ برد</p><p className="text-xl font-bold text-ink">{pct(stats.winRate, 0)}</p></div>
            <div><p className="text-[11px] text-muted">پوشش برنامه</p><p className="text-xl font-bold text-ink">{pct(stats.planCoverage, 0)}</p></div>
            <div><p className="text-[11px] text-muted">طبق قانون</p><p className={cn('text-xl font-bold', stats.ruleAdherence === null ? 'text-ink' : stats.ruleAdherence >= 90 ? 'text-positive' : stats.ruleAdherence >= 75 ? 'text-warn' : 'text-negative')}>{pct(stats.ruleAdherence, 0)}</p></div>
          </Surface>

          <Surface className="p-4">
            <h3 className="text-sm font-bold text-ink">فقط معاملات برنامه را گرفتم؟</h3>
            <p className="text-xs text-muted">از علامت «طبق قوانینم بود؟» در تب معاملات. عدد چانه نمی‌زند.</p>
            {stats.ruleAdherence === null ? <p className="mt-2 text-xs text-subtle">هنوز هیچ معامله‌ای در این هفته علامت نخورده.</p> : stats.offRules.length === 0 ? <p className="mt-2 text-sm font-bold text-positive">بله. همهٔ معاملات علامت‌خورده طبق قوانین بود.</p> : (
              <div className="mt-2 space-y-1">
                <p className="text-sm font-bold text-negative">خیر. {fa(stats.offRules.length)} معامله خلاف قانون.</p>
                {stats.offRules.map((t) => <p key={t.id} className="text-xs text-negative">← <span dir="ltr">{t.symbol}</span> · {t.direction === 'long' ? 'لانگ' : 'شورت'} · {usd(t.netPnl, true)} {notes.get(t.id)?.note && `· ${notes.get(t.id)!.note.slice(0, 80)}`}</p>)}
                <p className="text-xs text-muted">برای هرکدام: انگیزه چه بود و کدام قانون باید جلویش را می‌گرفت؟</p>
              </div>
            )}
          </Surface>

          {checks.length > 0 && (
            <Surface className="p-4">
              <h3 className="text-sm font-bold text-ink">تعهدهای هفتهٔ قبل — سنجش روی همین هفته</h3>
              <ul className="mt-2 space-y-2">
                {checks.map(({ c, res }) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone={STATUS_TONE[res.status]}>{STATUS_FA[res.status]}</Badge>
                    <span className="text-ink">{c.text || RULE_FA[c.rule.type]}</span>
                    <span className="text-xs text-muted">{res.detail}</span>
                  </li>
                ))}
              </ul>
            </Surface>
          )}

          <Surface className="space-y-3 p-4">
            <h3 className="text-sm font-bold text-ink">بزرگ‌ترین اشتباه‌هایم چه بود؟</h3>
            <p className="text-xs text-muted">الگوها را تگ بزنید، بعد گران‌ترینش را در یادداشت نام ببرید. تگ‌های معاملات این هفته: {[...stats.mistakeTags.entries()].map(([k, v]) => `${k} (${fa(v)})`).join('، ') || '—'}</p>
            <TagPicker label="اشتباه‌های هفته" tone="loss" tags={settings.mistakeTags} value={r.mistakeTags} onChange={(v) => persist({ ...r, mistakeTags: v })} />
            <textarea className="min-h-16 w-full rounded-control border border-divider bg-card p-2 text-sm" placeholder="یادداشت…" value={r.mistakeNote} onChange={(e) => edit({ mistakeNote: e.target.value.slice(0, 2000) })} onBlur={() => dirty && persist()} />
          </Surface>

          <Surface className="space-y-3 p-4">
            <h3 className="text-sm font-bold text-ink">چه کاری را درست انجام دادم؟</h3>
            <p className="text-xs text-muted">برد فرایندی حتی در هفتهٔ قرمز حساب است. مخصوصاً در هفتهٔ قرمز.</p>
            <TagPicker label="نقاط قوت هفته" tone="gain" tags={settings.goodTags} value={r.goodTags} onChange={(v) => persist({ ...r, goodTags: v })} />
            <textarea className="min-h-16 w-full rounded-control border border-divider bg-card p-2 text-sm" placeholder="یادداشت…" value={r.goodNote} onChange={(e) => edit({ goodNote: e.target.value.slice(0, 2000) })} onBlur={() => dirty && persist()} />
          </Surface>

          {settings.questions.map((q) => (
            <Surface key={q.id} className="space-y-2 p-4">
              <h3 className="text-sm font-bold text-ink">{q.title}</h3>
              {q.sub && <p className="text-xs text-muted">{q.sub}</p>}
              <textarea className="min-h-16 w-full rounded-control border border-divider bg-card p-2 text-sm" value={r.answers[q.id] ?? ''} onChange={(e) => edit({ answers: { ...r.answers, [q.id]: e.target.value.slice(0, 2000) } })} onBlur={() => dirty && persist()} />
            </Surface>
          ))}

          <Surface className="space-y-3 border-accent p-4">
            <h3 className="text-sm font-bold text-ink">هفتهٔ بعد چطور بهتر شوم؟</h3>
            <p className="text-xs text-muted">حداکثر سه تعهد. هرکدام قابل‌بررسی، نه حس. نوع قانون را انتخاب کنید تا هفتهٔ بعد خودکار سنجیده شود.</p>
            {r.commitments.map((c, i) => (
              <div key={c.id} className="space-y-2 rounded-control border border-divider p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Select className="w-auto" value={c.rule.type} onChange={(e) => setCommit(i, { rule: defaultRule(e.target.value as CommitmentRule['type']) })}>
                    {(Object.keys(RULE_FA) as CommitmentRule['type'][]).map((k) => <option key={k} value={k}>{RULE_FA[k]}</option>)}
                  </Select>
                  <RuleParams rule={c.rule} whyTags={settings.whyTags} onChange={(rule) => setCommit(i, { rule })} />
                  {c.rule.type === 'free' && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={c.done} onChange={(e) => persist({ ...r, commitments: r.commitments.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)) })} /> انجام شد</label>}
                  <Button size="icon-sm" variant="ghost" className="ms-auto" aria-label="حذف" onClick={() => persist({ ...r, commitments: r.commitments.filter((_, j) => j !== i) })}><Trash2 /></Button>
                </div>
                <Input placeholder={i === 0 ? 'مثلاً «صفر معامله خلاف EMA هفتگی ۱۲/۲۵»' : i === 1 ? 'مثلاً «همهٔ سؤال‌های چک‌لیست قبل از ورود»' : 'مثلاً «حداکثر ۲ معامله در روز»'} value={c.text} onChange={(e) => setCommit(i, { text: e.target.value.slice(0, 200) })} onBlur={() => dirty && persist()} />
              </div>
            ))}
            {r.commitments.length < 3 && <Button size="sm" variant="outline" icon={<Plus />} onClick={() => persist({ ...r, commitments: [...r.commitments, { id: `c${Date.now().toString(36)}`, text: '', rule: { type: 'maxTradesPerDay', n: 2 }, done: false }] })}>افزودن تعهد</Button>}
            {dirty && <Button size="sm" onClick={() => persist()}>ذخیره</Button>}
          </Surface>
        </>
      )}
    </div>
  );
}

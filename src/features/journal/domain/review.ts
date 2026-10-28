/**
 * مرور هفتگی — آمار هر هفتهٔ ISO (با سال)، بررسی خودکار تعهدها و الگوهای بین‌هفته‌ای
 *
 *   تعهدهای مرور هفتهٔ W روی معاملات هفتهٔ W+1 سنجیده می‌شوند (همان «پیگیری» که در نسخهٔ قبلی فقط به هوش مصنوعی سپرده شده بود).
 *   تعهد «آزاد» خودکار سنجیده نمی‌شود و فقط تیک دستی دارد.
 *   روند پایبندی با میانگین نیمهٔ اول در برابر نیمهٔ دوم هفته‌ها سنجیده می‌شود، نه فقط هفتهٔ اول و آخر.
 */
import type { ClassifiedTrade, Commitment, CommitmentRule, TradeNote, TradePlan, WeeklyReview } from './types';
import { dayKey, hourOf, isoWeekKey, mean, median } from './time';
import { isScratch, scratchFloorOf, type PlannedRisk } from './metrics';

export interface WeekStats {
  week: string;
  n: number;
  net: number;
  winRate: number | null;
  planCoverage: number | null;
  ruleAdherence: number | null;
  offRules: ClassifiedTrade[];
  mistakeTags: Map<string, number>;
  goodTags: Map<string, number>;
  whyTags: Map<string, { n: number; net: number }>;
}

export function tradesByWeek(trades: readonly ClassifiedTrade[], tz: string): Map<string, ClassifiedTrade[]> {
  const m = new Map<string, ClassifiedTrade[]>();
  for (const t of trades) {
    const k = isoWeekKey(t.closeTime ?? t.openTime, tz);
    (m.get(k) ?? m.set(k, []).get(k)!).push(t);
  }
  return m;
}

export function weekStats(week: string, trades: readonly ClassifiedTrade[], notes: ReadonlyMap<string, TradeNote>, links: ReadonlyMap<string, TradePlan>): WeekStats {
  const floor = scratchFloorOf(trades);
  const decisive = trades.filter((t) => !isScratch(t, floor));
  const marked = trades.filter((t) => notes.get(t.id)?.followedRules !== null && notes.get(t.id)?.followedRules !== undefined);
  const count = (pick: (n: TradeNote) => string[]) => {
    const m = new Map<string, number>();
    for (const t of trades) for (const tag of pick(notes.get(t.id) ?? EMPTY_NOTE)) m.set(tag, (m.get(tag) ?? 0) + 1);
    return m;
  };
  const why = new Map<string, { n: number; net: number }>();
  for (const t of trades) for (const tag of notes.get(t.id)?.whyTags ?? []) {
    const w = why.get(tag) ?? { n: 0, net: 0 };
    w.n++;
    w.net += t.netPnl;
    why.set(tag, w);
  }
  return {
    week,
    n: trades.length,
    net: trades.reduce((s, t) => s + t.netPnl, 0),
    winRate: decisive.length ? (decisive.filter((t) => t.netPnl > 0).length / decisive.length) * 100 : null,
    planCoverage: trades.length ? (trades.filter((t) => links.has(t.id)).length / trades.length) * 100 : null,
    ruleAdherence: marked.length ? (marked.filter((t) => notes.get(t.id)?.followedRules).length / marked.length) * 100 : null,
    offRules: trades.filter((t) => notes.get(t.id)?.followedRules === false),
    mistakeTags: count((n) => n.mistakeTags),
    goodTags: count((n) => n.goodTags),
    whyTags: why
  };
}

const EMPTY_NOTE: TradeNote = { tradeId: '', whyTags: [], whyTaggedBeforeClose: false, mistakeTags: [], goodTags: [], note: '', followedRules: null, updatedAt: 0 };

export type CommitmentStatus = 'kept' | 'broken' | 'unknown' | 'manual' | 'pending';

export interface CommitmentCheck {
  status: CommitmentStatus;
  violations: number;
  detail: string;
}

export const RULE_FA: Record<CommitmentRule['type'], string> = {
  free: 'آزاد (تیک دستی)',
  maxTradesPerDay: 'سقف معامله در روز',
  cooldownAfterLoss: 'وقفه بعد از ضرر',
  requirePlan: 'هیچ ورودی بدون برنامه',
  maxRiskPct: 'سقف ریسک هر معامله',
  maxLossUsd: 'سقف زیان هر معامله',
  allowedSetups: 'فقط ورودهای مجاز',
  noTradeHours: 'ساعت‌های ممنوع'
};

/** سنجش یک تعهد روی معاملات هفتهٔ اجرا */
export function checkCommitment(
  c: Commitment,
  trades: readonly ClassifiedTrade[],
  ctx: { tz: string; notes: ReadonlyMap<string, TradeNote>; links: ReadonlyMap<string, TradePlan>; risks: ReadonlyMap<string, PlannedRisk>; accountSize: number | null; weekEnded: boolean }
): CommitmentCheck {
  const r = c.rule;
  if (r.type === 'free') return { status: 'manual', violations: 0, detail: c.done ? 'تیک خورده' : 'خودکار سنجیده نمی‌شود' };
  if (!trades.length) return { status: ctx.weekEnded ? 'kept' : 'pending', violations: 0, detail: 'معامله‌ای در هفتهٔ اجرا نیست' };
  const sorted = [...trades].sort((a, b) => a.openTime - b.openTime);
  let bad: ClassifiedTrade[] = [];
  let unknown = 0;
  switch (r.type) {
    case 'maxTradesPerDay': {
      const days = new Map<string, ClassifiedTrade[]>();
      for (const t of sorted) (days.get(dayKey(t.openTime, ctx.tz)) ?? days.set(dayKey(t.openTime, ctx.tz), []).get(dayKey(t.openTime, ctx.tz))!).push(t);
      bad = [...days.values()].flatMap((g) => g.slice(r.n));
      break;
    }
    case 'cooldownAfterLoss': {
      const floor = scratchFloorOf(sorted);
      for (const t of sorted) {
        const prevLoss = sorted.some((p) => p !== t && p.closeTime !== null && p.closeTime <= t.openTime && t.openTime - p.closeTime < r.minutes * 60_000 && !isScratch(p, floor) && p.netPnl < 0);
        if (prevLoss) bad.push(t);
      }
      break;
    }
    case 'requirePlan':
      bad = sorted.filter((t) => !ctx.links.has(t.id));
      break;
    case 'maxRiskPct':
      for (const t of sorted) {
        const risk = ctx.risks.get(t.id);
        if (!risk || !ctx.accountSize) unknown++;
        else if ((risk.riskUsd / ctx.accountSize) * 100 > r.pct * 1.05) bad.push(t);
      }
      break;
    case 'maxLossUsd':
      bad = sorted.filter((t) => t.netPnl < -r.usd);
      break;
    case 'allowedSetups':
      for (const t of sorted) {
        const tags = ctx.notes.get(t.id)?.whyTags ?? [];
        if (!tags.length) unknown++;
        else if (!tags.some((x) => r.tags.includes(x))) bad.push(t);
      }
      break;
    case 'noTradeHours':
      bad = sorted.filter((t) => {
        const h = hourOf(t.openTime, ctx.tz);
        return r.from <= r.to ? h >= r.from && h < r.to : h >= r.from || h < r.to;
      });
      break;
  }
  if (bad.length) return { status: 'broken', violations: bad.length, detail: `${bad.length} معامله خلاف این تعهد` };
  if (unknown) return { status: 'unknown', violations: 0, detail: `${unknown} معامله دادهٔ کافی برای سنجش ندارد` };
  return { status: ctx.weekEnded ? 'kept' : 'pending', violations: 0, detail: ctx.weekEnded ? 'رعایت شد' : 'تا اینجا رعایت شده' };
}

export interface Pattern {
  tone: 'bad' | 'good' | 'neutral';
  text: string;
}

/** الگوهای بین‌هفته‌ای (حداقل دو هفته) */
export function crossWeekPatterns(
  stats: readonly WeekStats[],
  reviews: ReadonlyMap<string, WeeklyReview>,
  broken: { week: string; text: string }[]
): Pattern[] {
  const out: Pattern[] = [];
  if (stats.length < 2) return out;
  const weeks = [...stats].sort((a, b) => a.week.localeCompare(b.week));
  const label = (w: string) => w.replace(/^\d{4}-W/, 'هفتهٔ ');

  const tagWeeks = new Map<string, string[]>();
  for (const w of weeks) {
    const tags = new Set([...w.mistakeTags.keys(), ...(reviews.get(w.week)?.mistakeTags ?? [])]);
    for (const t of tags) tagWeeks.set(t, [...(tagWeeks.get(t) ?? []), w.week]);
  }
  for (const [tag, ws] of [...tagWeeks.entries()].filter(([, ws]) => ws.length >= 2).sort((a, b) => b[1].length - a[1].length)) {
    out.push({ tone: 'bad', text: `«${tag}» در ${ws.length} از ${weeks.length} هفته تکرار شده (${ws.map(label).join('، ')}). این یک الگوست، نه یک اتفاق.` });
  }

  const adh = weeks.filter((w) => w.ruleAdherence !== null);
  if (adh.length >= 2) {
    const half = Math.floor(adh.length / 2);
    const a = mean(adh.slice(0, half).map((w) => w.ruleAdherence!)) ?? 0;
    const b = mean(adh.slice(half).map((w) => w.ruleAdherence!)) ?? 0;
    if (b > a + 2) out.push({ tone: 'good', text: `پایبندی به قوانین رو به بهبود است: ${a.toFixed(0)}٪ ← ${b.toFixed(0)}٪.` });
    else if (b < a - 2) out.push({ tone: 'bad', text: `پایبندی به قوانین در حال افت است: ${a.toFixed(0)}٪ ← ${b.toFixed(0)}٪. انضباط نشت می‌کند.` });
  }

  const off = weeks.flatMap((w) => w.offRules);
  if (off.length) {
    const r = off.reduce((s, t) => s + t.netPnl, 0);
    out.push({
      tone: r < 0 ? 'bad' : 'neutral',
      text: `${off.length} معاملهٔ خلاف قانون در مجموع ${r >= 0 ? '+' : '−'}$${Math.abs(r).toFixed(0)}. ${r < 0 ? 'برای شکستن قوانین خودتان پول می‌دهید.' : 'نتیجهٔ مثبت معاملهٔ خلاف قانون را تأیید نمی‌کند؛ فقط درس را عقب می‌اندازد.'}`
    });
  }

  if (broken.length) out.push({ tone: 'bad', text: `${broken.length} تعهد شکسته شد: ${broken.slice(0, 3).map((b) => `«${b.text}» (${label(b.week)})`).join('، ')}.` });

  const tags = new Map<string, { n: number; net: number }>();
  for (const w of weeks) for (const [k, v] of w.whyTags) {
    const x = tags.get(k) ?? { n: 0, net: 0 };
    x.n += v.n;
    x.net += v.net;
    tags.set(k, x);
  }
  const enough = [...tags.entries()].filter(([, v]) => v.n >= 3);
  if (enough.length) {
    const best = enough.reduce((a, b) => (a[1].net >= b[1].net ? a : b));
    const worst = enough.reduce((a, b) => (a[1].net <= b[1].net ? a : b));
    out.push({ tone: 'neutral', text: `بهترین نوع ورود تا اینجا: «${best[0]}» (${best[1].net >= 0 ? '+' : '−'}$${Math.abs(best[1].net).toFixed(0)} در ${best[1].n} معامله).` });
    if (worst[0] !== best[0] && worst[1].net < 0) out.push({ tone: 'neutral', text: `ضعیف‌ترین: «${worst[0]}» (−$${Math.abs(worst[1].net).toFixed(0)} در ${worst[1].n} معامله). نمونه کوچک است؛ قبل از قضاوت ستاپ، کیفیت اجرا را ببینید.` });
  }

  const counts = weeks.map((w) => w.n);
  const med = median(counts.filter((c) => c > 0));
  const spike = weeks.reduce((a, b) => (b.n > a.n ? b : a));
  if (med && spike.n >= 6 && spike.n >= 2 * med) out.push({ tone: 'neutral', text: `تعداد معاملات در ${label(spike.week)} جهش کرد (${spike.n} معامله). ببینید حجم با کیفیت همراه بود یا با بی‌حوصلگی.` });

  return out;
}

export function emptyReview(week: string): WeeklyReview {
  return { week, mistakeTags: [], mistakeNote: '', goodTags: [], goodNote: '', commitments: [], answers: {}, updatedAt: 0 };
}

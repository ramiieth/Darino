/**
 * تکمیل خودکار مرور هفتگی با دستیار (Gemini، سمت سرور) — بخش خالص: ساخت ورودی و ادغام پاسخ
 *
 *   تگ، یادداشت و «چرا وارد شدم» اختیاری‌اند: بدون آن‌ها هم مرور از روی اعداد معاملات (پرپ و اسپات) کامل می‌شود.
 *   ورودی فقط آمار مشتق‌شده است: نماد، جهت، سود خالص، R، ریسک، مدت، ساعت ورود، تگ‌ها و منبع استاپ.
 *   هیچ آدرس، شناسهٔ حساب یا شناسهٔ معامله‌ای به مدل نمی‌رود.
 *   ادغام هرگز نوشتهٔ کاربر را پاک نمی‌کند: فقط فیلدهای خالی پر می‌شوند؛ جمع‌بندی منتور هر بار تازه می‌شود.
 */
import type { ClassifiedTrade, Commitment, CommitmentRule, JournalSettings, TradeNote, TradePlan, WeeklyReview } from './types';
import type { CommitmentCheck, WeekStats } from './review';
import { RULE_FA } from './review';
import { hourOf } from './time';
import type { SpotBook } from './spot';

export interface ReviewPayload {
  week: string;
  stats: Record<string, unknown>;
  trades: Record<string, unknown>[];
  previousCommitments: { text: string; rule: string; status: string; detail: string }[];
  mistakeTags: string[];
  goodTags: string[];
  whyTags: string[];
  questions: { id: string; title: string; sub: string }[];
  maxRiskPct: number | null;
  /** معاملات اسپات همان هفته (سواپ‌های کیف پول)؛ null = کیف پولی وصل نیست یا سواپی نبود */
  spot: Record<string, unknown> | null;
}

export interface ReviewSuggestion {
  summary: string;
  mistakeTags: string[];
  mistakeNote: string;
  goodTags: string[];
  goodNote: string;
  answers: { id: string; text: string }[];
  commitments: ({ type: string; text: string } & Record<string, unknown>)[];
}

const r2 = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);

/**
 * خلاصهٔ اسپات یک هفته از دفتر سواپ‌ها — بدون آدرس کیف پول یا هش تراکنش
 *   سود تحقق‌یافته فقط برای فروش‌هایی که بهای خریدشان معلوم است (pnl=null کنار گذاشته و شمرده می‌شود)
 */
export function spotWeek(book: SpotBook | null, start: number, end: number): Record<string, unknown> | null {
  if (!book) return null;
  const swaps = book.swaps.filter((s) => s.time >= start && s.time < end);
  if (!swaps.length) return null;
  const sales = book.sales.filter((x) => x.time >= start && x.time < end);
  const known = sales.filter((x) => x.pnl !== null);
  const sym = new Map(book.assets.map((a) => [a.asset, a.symbol]));
  const per = new Map<string, { symbol: string; buys: number; sells: number; boughtUsd: number; soldUsd: number; realizedUsd: number }>();
  const row = (asset: string, symbol: string) => per.get(asset) ?? per.set(asset, { symbol, buys: 0, sells: 0, boughtUsd: 0, soldUsd: 0, realizedUsd: 0 }).get(asset)!;
  for (const s of swaps) {
    for (const l of s.bought) if (!l.stable) { const a = row(l.asset, l.symbol); a.buys++; a.boughtUsd += l.usd ?? 0; }
    for (const l of s.sold) if (!l.stable) { const a = row(l.asset, l.symbol); a.sells++; a.soldUsd += l.usd ?? 0; }
  }
  for (const x of known) row(x.asset, sym.get(x.asset) ?? x.asset).realizedUsd += x.pnl ?? 0;
  const holding = new Map(book.open.map((a) => [a.asset, a]));
  return {
    swaps: swaps.length,
    volumeUsd: r2(swaps.reduce((a, s) => a + (s.usd ?? 0), 0)),
    gasUsd: r2(swaps.reduce((a, s) => a + (s.gas ?? 0), 0)),
    swapCostUsd: r2(swaps.reduce((a, s) => a + (s.cost ?? 0), 0)),
    sales: sales.length,
    salesWithUnknownCost: sales.length - known.length,
    realizedPnlUsd: r2(known.reduce((a, x) => a + (x.pnl ?? 0), 0)),
    winningSales: known.filter((x) => (x.pnl ?? 0) > 0).length,
    losingSales: known.filter((x) => (x.pnl ?? 0) < 0).length,
    chains: [...new Set(swaps.map((s) => s.chain))].slice(0, 10),
    assets: [...per.entries()].sort((a, b) => b[1].boughtUsd + b[1].soldUsd - (a[1].boughtUsd + a[1].soldUsd)).slice(0, 20).map(([k, a]) => {
      const h = holding.get(k);
      return { ...a, boughtUsd: r2(a.boughtUsd), soldUsd: r2(a.soldUsd), realizedUsd: r2(a.realizedUsd), stillHeld: !!h, unrealizedUsd: h ? r2(h.unrealized) : null };
    })
  };
}

export function reviewPayload(input: {
  week: string;
  stats: WeekStats;
  trades: readonly ClassifiedTrade[];
  notes: ReadonlyMap<string, TradeNote>;
  plans: ReadonlyMap<string, TradePlan>;
  checks: readonly { c: Commitment; res: CommitmentCheck }[];
  settings: JournalSettings;
  accountSize: number | null;
  tz: string;
  spot?: Record<string, unknown> | null;
}): ReviewPayload {
  const { stats: s, settings } = input;
  const top = (m: Map<string, number>) => Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));
  return {
    week: input.week,
    stats: {
      trades: s.n,
      netPnlUsd: r2(s.net),
      winRatePct: r2(s.winRate),
      planCoveragePct: r2(s.planCoverage),
      ruleAdherencePct: r2(s.ruleAdherence),
      offRulesCount: s.offRules.length,
      offRulesNetUsd: r2(s.offRules.reduce((a, t) => a + t.netPnl, 0)),
      mistakeTagCounts: top(s.mistakeTags),
      goodTagCounts: top(s.goodTags),
      whyTagResults: Object.fromEntries([...s.whyTags.entries()].map(([k, v]) => [k, { n: v.n, netUsd: r2(v.net) }])),
      accountSizeUsd: r2(input.accountSize)
    },
    trades: [...input.trades].sort((a, b) => a.openTime - b.openTime).slice(-150).map((t) => {
      const n = input.notes.get(t.id);
      const p = input.plans.get(t.id);
      const risk = p && p.stop !== null && p.entry !== null ? t.maxSize * Math.abs(p.entry - p.stop) : null;
      return {
        symbol: t.symbol,
        direction: t.direction,
        netPnlUsd: r2(t.netPnl),
        feesUsd: r2(t.fees),
        fundingUsd: r2(t.funding),
        notionalUsd: r2(t.maxNotional),
        riskUsd: r2(risk),
        riskPct: risk && input.accountSize ? r2((risk / input.accountSize) * 100) : null,
        R: risk ? r2(t.netPnl / risk) : null,
        holdMinutes: t.closeTime ? Math.round((t.closeTime - t.openTime) / 60_000) : null,
        entryHour: hourOf(t.openTime, input.tz),
        stop: p?.auto ? p.auto.stopSource : p ? 'written-plan' : 'unknown',
        stopMoved: p?.auto?.stopMoved ?? null,
        liquidated: t.liquidated,
        whyTags: n?.whyTags ?? [],
        mistakeTags: n?.mistakeTags ?? [],
        goodTags: n?.goodTags ?? [],
        followedRules: n?.followedRules ?? null,
        note: n?.note ? n.note.slice(0, 200) : ''
      };
    }),
    previousCommitments: input.checks.slice(0, 3).map(({ c, res }) => ({ text: (c.text || RULE_FA[c.rule.type]).slice(0, 200), rule: c.rule.type, status: res.status, detail: res.detail.slice(0, 200) })),
    // سرور هر تگ را تا ۶۰ نویسه می‌پذیرد؛ تگ بلندتر کل درخواست را رد می‌کرد
    mistakeTags: settings.mistakeTags.slice(0, 60).map((t) => t.slice(0, 60)),
    goodTags: settings.goodTags.slice(0, 60).map((t) => t.slice(0, 60)),
    whyTags: settings.whyTags.slice(0, 60).map((t) => t.slice(0, 60)),
    questions: settings.questions.slice(0, 12).map((q) => ({ id: q.id, title: q.title.slice(0, 200), sub: (q.sub ?? '').slice(0, 400) })),
    maxRiskPct: settings.maxRiskPct ?? null,
    spot: input.spot ?? null
  };
}

function toRule(c: ReviewSuggestion['commitments'][number]): CommitmentRule | null {
  const n = (k: string, d: number) => (typeof c[k] === 'number' && Number.isFinite(c[k]) ? (c[k] as number) : d);
  switch (c.type) {
    case 'free': return { type: 'free' };
    case 'requirePlan': return { type: 'requirePlan' };
    case 'maxTradesPerDay': return { type: 'maxTradesPerDay', n: n('n', 2) };
    case 'cooldownAfterLoss': return { type: 'cooldownAfterLoss', minutes: n('minutes', 60) };
    case 'maxRiskPct': return { type: 'maxRiskPct', pct: n('pct', 1) };
    case 'maxLossUsd': return { type: 'maxLossUsd', usd: n('usd', 100) };
    case 'noTradeHours': return { type: 'noTradeHours', from: n('from', 0), to: n('to', 6) };
    case 'allowedSetups': return { type: 'allowedSetups', tags: Array.isArray(c.tags) ? (c.tags as string[]) : [] };
    default: return null;
  }
}

/** پاسخ دستیار → مرور؛ فقط خالی‌ها پر می‌شوند (نوشتهٔ کاربر دست نمی‌خورد) */
export function mergeSuggestion(r: WeeklyReview, s: ReviewSuggestion, now = Date.now()): WeeklyReview {
  const answers = { ...r.answers };
  for (const a of s.answers) if (!answers[a.id]?.trim()) answers[a.id] = a.text;
  const commitments = r.commitments.length ? r.commitments : s.commitments.flatMap((c, i): Commitment[] => {
    const rule = toRule(c);
    return rule ? [{ id: `ai${now.toString(36)}${i}`, text: c.text, rule, done: false }] : [];
  }).slice(0, 3);
  return {
    ...r,
    mistakeTags: r.mistakeTags.length ? r.mistakeTags : s.mistakeTags,
    mistakeNote: r.mistakeNote.trim() ? r.mistakeNote : s.mistakeNote,
    goodTags: r.goodTags.length ? r.goodTags : s.goodTags,
    goodNote: r.goodNote.trim() ? r.goodNote : s.goodNote,
    answers,
    commitments,
    aiSummary: s.summary,
    aiAt: now
  };
}

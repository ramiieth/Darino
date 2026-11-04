/**
 * هماهنگ‌کنندهٔ ژورنال: از معاملات ساخته‌شده تا حسابرسی کامل هر دفتر
 *
 *   ورودی: معاملات (همهٔ حساب‌ها)، یادداشت‌ها، برنامه‌ها، تنظیمات، بازهٔ زمانی
 *   خروجی: دفتر جهت‌دار (معیارها، رفتار، کارنامه، حکم، اولویت‌ها، اعتماد داده) و دفتر نوترال
 *   «اعتماد داده» ویژگی داده است نه معامله‌گری: نمره و رنگ قرمز نمی‌گیرد و فقط می‌گوید چه چیزی ارزیابی‌پذیر نبود و چرا.
 */
import type { BookKind, ClassifiedTrade, Fill, FundingEvent, JournalAccount, JournalSettings, TradeNote, TradePlan, TriggerOrder } from './types';
import { VENUE_COVERAGE } from './types';
import { classifyTrades, roleOf } from './classify';
import { computeCore, type CoreMetrics } from './metrics';
import { analyzeBehavior, type Behavior, type Leak } from './behavior';
import { buildScorecard, confidenceOf, overallVerdict, priorities, rankRows, type Confidence, type ScoreRow, type StatusBand } from './scorecard';
import { linkPlans, plannedRisks } from './plan';
import { autoPlans, type OrderCoverage } from './autoPlan';
import { neutralBook, type DailyAccountPoint, type NeutralBook } from './neutral';
import type { Trade } from './types';

export interface Coverage {
  field: string;
  label: string;
  pct: number;
  /** چه چیزهایی به خاطر این کمبود ارزیابی نشد */
  disables: string;
  /** چطور فعالش کنم */
  enable: string;
}

export interface DataConfidence {
  trades: number;
  open: number;
  truncated: number;
  from: number | null;
  to: number | null;
  style: CoreMetrics['style'];
  confidence: Confidence;
  coverage: Coverage[];
  notes: string[];
}

export interface BookAudit {
  book: BookKind;
  trades: ClassifiedTrade[];
  open: ClassifiedTrade[];
  truncated: ClassifiedTrade[];
  core: CoreMetrics;
  behavior: Behavior;
  rows: ScoreRow[];
  verdict: { band: StatusBand; reason: string; headline: string };
  first: Leak | null;
  next: Leak[];
  rules: string[];
  data: DataConfidence;
}

export interface JournalAudit {
  all: ClassifiedTrade[];
  /** یادداشت‌ها + تگ نوع ورودِ برنامهٔ متصل (به‌عنوان تگ «قبل از نتیجه») */
  notes: Map<string, TradeNote>;
  /** برنامه‌های نوشته‌شده (دستی) */
  links: Map<string, TradePlan>;
  /** برنامهٔ خودکار هر معاملهٔ جهت‌دار بدون برنامهٔ نوشته‌شده (از سفارش‌های SL/TP صرافی) */
  auto: Map<string, TradePlan>;
  directional: BookAudit;
  neutral: NeutralBook;
  neutralTrades: ClassifiedTrade[];
}

const pctOf = (n: number, d: number) => (d ? (n / d) * 100 : 0);

function confidenceFor(closed: ClassifiedTrade[], open: number, truncated: number, core: CoreMetrics, links: ReadonlyMap<string, TradePlan>, notes: ReadonlyMap<string, TradeNote>, accountSize: number | null, sourceNotes: string[]): DataConfidence {
  const n = closed.length;
  const coverage: Coverage[] = [
    { field: 'size', label: 'اندازه و قیمت ورود/خروج', pct: n ? 100 : 0, disables: '—', enable: '—' },
    {
      field: 'fees', label: 'کارمزد', pct: pctOf(closed.filter((t) => t.fees !== null).length, n),
      disables: 'فشار کارمزد و سود خالص دقیق', enable: 'کارمزد این پلتفرم‌ها گزارش نمی‌شود.'
    },
    {
      field: 'funding', label: 'فاندینگ', pct: pctOf(closed.filter((t) => t.funding !== null).length, n),
      disables: 'سهم فاندینگ در سود خالص هر معامله', enable: 'فاندینگ حساب اصلی لایتر فقط با توکن احراز هویت خوانده می‌شود؛ در دفتر نوترال سری روزانهٔ لایتر جایگزین است.'
    },
    {
      field: 'stop', label: 'استاپ (روی صرافی یا برنامه)', pct: pctOf(closed.filter((t) => { const p = links.get(t.id); return p && p.stop !== null && p.entry !== null; }).length, n),
      disables: 'R، ریسک هر معامله، نظم استاپ', enable: 'موقع ورود روی خود صرافی استاپ (SL) بگذارید؛ ژورنال خودش می‌خواند. لایتر: توکن فقط‌خواندنی LIGHTER_READ_TOKEN در ورسل.'
    },
    {
      field: 'target', label: 'هدف (TP)', pct: pctOf(closed.filter((t) => links.get(t.id)?.target != null).length, n),
      disables: 'سنجش رسیدن به هدف', enable: 'روی صرافی هدف (TP) بگذارید.'
    },
    {
      field: 'why', label: 'تگ «چرا»', pct: pctOf(closed.filter((t) => (notes.get(t.id)?.whyTags.length ?? 0) > 0).length, n),
      disables: 'سود هر نوع ورود (کشف ستاپ)', enable: 'در «معاملات» برای هر معامله تگ «چرا وارد شدم» بزنید.'
    },
    {
      field: 'balance', label: 'اندازهٔ حساب', pct: accountSize ? 100 : 0,
      disables: 'افت به درصد، زیان روزانه به درصد، ریسک هر معامله', enable: 'اندازهٔ حساب را در تنظیمات وارد کنید یا حساب‌ها را متصل نگه دارید.'
    }
  ];
  const out: string[] = [...sourceNotes];
  if (truncated) out.push(`${truncated} معامله که شروعشان قبل از تاریخچهٔ در دسترس بود از آمار کنار گذاشته شد (قیمت ورودشان معلوم نیست).`);
  if (open) out.push(`${open} پوزیشن باز در آمار عملکرد نیامده و جدا فهرست شده است.`);
  return { trades: n, open, truncated, from: core.first, to: core.last, style: core.style, confidence: confidenceOf(n), coverage, notes: out };
}

export function auditBook(
  book: BookKind,
  all: readonly ClassifiedTrade[],
  ctx: { tz: string; accountSize: number | null; notes: ReadonlyMap<string, TradeNote>; links: ReadonlyMap<string, TradePlan>; auto?: ReadonlyMap<string, TradePlan>; from: number; sourceNotes: string[] }
): BookAudit {
  // برنامهٔ نوشته‌شده بر خودکار مقدم است
  const plans = new Map<string, TradePlan>([...(ctx.auto ?? new Map()), ...ctx.links]);
  const mine = all.filter((t) => t.book === book);
  const open = mine.filter((t) => t.open);
  const truncated = mine.filter((t) => !t.open && t.truncated && (t.closeTime ?? 0) >= ctx.from);
  const closed = mine.filter((t) => !t.open && !t.truncated && (t.closeTime ?? 0) >= ctx.from);
  const risks = plannedRisks(plans, closed);
  const core = computeCore(closed, { tz: ctx.tz, accountSize: ctx.accountSize, risks });
  const behavior = analyzeBehavior(closed, { tz: ctx.tz, notes: ctx.notes, risks });
  const marked = closed.filter((t) => typeof ctx.notes.get(t.id)?.followedRules === 'boolean');
  const rows = rankRows(buildScorecard({
    core,
    behavior,
    planCoverage: stopDiscipline(closed, ctx.links, ctx.auto),
    ruleAdherence: marked.length ? { pct: pctOf(marked.filter((t) => ctx.notes.get(t.id)?.followedRules).length, marked.length), n: marked.length } : null
  }));
  const verdict = overallVerdict(core, rows);
  const pr = priorities(behavior.leaks);
  return {
    book,
    trades: closed,
    open,
    truncated,
    core,
    behavior,
    rows,
    verdict,
    first: pr.first,
    next: pr.next,
    rules: pr.rules,
    data: confidenceFor(closed, open.length, truncated.length, core, plans, ctx.notes, ctx.accountSize, ctx.sourceNotes)
  };
}

export function runJournal(input: {
  trades: readonly Trade[];
  fills: readonly Fill[];
  funding: readonly FundingEvent[];
  accounts: readonly JournalAccount[];
  notes: ReadonlyMap<string, TradeNote>;
  plans: readonly TradePlan[];
  settings: JournalSettings;
  accountSize: number | null;
  platformDaily: ReadonlyMap<string, DailyAccountPoint[]>;
  from: number;
  tz: string;
  sourceNotes: string[];
  orders?: readonly TriggerOrder[];
  orderCoverage?: ReadonlyMap<string, OrderCoverage>;
  now?: number;
}): JournalAudit {
  const now = input.now ?? Date.now();
  const all = classifyTrades(input.trades, input.settings, input.notes, now);
  const links = linkPlans(input.plans, all);
  const auto = autoPlans(all, links, input.orders ?? [], input.orderCoverage ?? new Map(), now);
  const notes = withPlanTags(input.notes, links);
  const directional = auditBook('directional', all, { tz: input.tz, accountSize: input.accountSize, notes, links, auto, from: input.from, sourceNotes: input.sourceNotes });
  const neutralTrades = all.filter((t) => t.book === 'neutral');
  const neutralKeys = input.accounts.filter((a) => roleOf(a.key, a.venue, input.settings.roles) === 'neutral').map((a) => a.key);
  const neutral = neutralBook({ trades: neutralTrades, fills: input.fills, funding: input.funding, accounts: input.accounts, neutralKeys, platformDaily: input.platformDaily, from: input.from, tz: input.tz, now });
  return { all, notes, links, auto, directional, neutral, neutralTrades };
}

/**
 * نظم ورود: درصد معاملاتی که از اول ریسکشان معلوم بود — برنامهٔ نوشته‌شده، یا استاپ روی صرافی تا ۱۵ دقیقه بعد از ورود.
 * معاملهٔ پلتفرمی که سفارش‌هایش خوانده نمی‌شود (لایتر) در مخرج نمی‌آید؛ هیچ قابل‌سنجشی نباشد → null.
 */
export function stopDiscipline(closed: readonly ClassifiedTrade[], links: ReadonlyMap<string, TradePlan>, auto: ReadonlyMap<string, TradePlan> | undefined): number | null {
  let judged = 0, ok = 0;
  for (const t of closed) {
    if (links.has(t.id)) { judged++; ok++; continue; }
    const a = auto?.get(t.id)?.auto;
    if (!a || a.stopSource === 'unreadable') continue;
    judged++;
    if (a.stopSource === 'exchange' && !a.stopLateMin) ok++;
  }
  return judged ? pctOf(ok, judged) : null;
}

/** برنامهٔ متصل با نوع ورود → اگر کاربر خودش تگ «چرا» نزده، همان تگ‌ها «قبل از نتیجه» حساب می‌شوند */
export function withPlanTags(notes: ReadonlyMap<string, TradeNote>, links: ReadonlyMap<string, TradePlan>): Map<string, TradeNote> {
  const out = new Map(notes);
  for (const [tradeId, plan] of links) {
    if (!plan.setupTags.length) continue;
    const n = out.get(tradeId);
    if (n?.whyTags.length) continue;
    out.set(tradeId, { tradeId, whyTags: [...plan.setupTags], whyTaggedBeforeClose: true, mistakeTags: n?.mistakeTags ?? [], goodTags: n?.goodTags ?? [], note: n?.note ?? '', book: n?.book, followedRules: n?.followedRules ?? null, planId: plan.id, updatedAt: n?.updatedAt ?? plan.updatedAt });
  }
  return out;
}

/** حساب‌هایی که پلتفرمشان فاندینگ عمومی می‌دهد (برای فاندینگ «صفر» در برابر «نامعلوم») */
export function fundingAccounts(accounts: readonly JournalAccount[], fetched: ReadonlySet<string>): Set<string> {
  return new Set(accounts.filter((a) => VENUE_COVERAGE[a.venue].funding && fetched.has(a.key)).map((a) => a.key));
}

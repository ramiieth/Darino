/**
 * یادداشت‌گذاری خودکار معاملات + لوپ نقد کمّی حسابرسی (بدون نیاز به تایپ کاربر)
 *
 * ۱) inferAutoTradeNote: برای هر معامله‌ای که کاربر تگ «چرا وارد شدم؟»، وضعیت «طبق قوانینم بود؟»
 *    یا یادداشت ثبت نکرده، از روی داده‌های واقعی معامله، روند بازار لحظهٔ ورود، وضعیت استاپ صرافی
 *    و رفتار پس از ضرر، یک یادداشت و برچسب‌گذاری دقیق و شفاف تولید می‌کند.
 *    یادداشت‌های دستی کاربر همیشه اولویت کامل دارند و هرگز بازنویسی نمی‌شوند.
 *
 * ۲) buildAutoCritiqueLoop: لوپ نقد ۳ مرحله‌ای (کشف نشتی ← نقد متقابل آماری ← تعهد قابل‌سنجش)
 *    روی نتایج حسابرسی دفتر جهت‌دار تا کاربر هم بفهمد کجا نشتی دارد، هم از نتیجه‌گیری شتاب‌زده
 *    روی نمونهٔ کوچک یا چند معاملهٔ استثنایی جلوگیری شود، و هم قوانین مستقیم به «مرور هفتگی» بروند.
 */
import type {
  ClassifiedTrade,
  Commitment,
  CommitmentRule,
  JournalSettings,
  TradeNote,
  TradePlan
} from './types';
import type { BookAudit } from './audit';
import { VENUE_FA } from './types';

const HOUR_MS = 3_600_000;

const pickAllowed = (candidates: readonly string[], allowed: readonly string[], limit = 2): string[] => {
  const out: string[] = [];
  for (const c of candidates) {
    if (allowed.includes(c) && !out.includes(c)) {
      out.push(c);
      if (out.length >= limit) break;
    }
  }
  return out;
};

const fmtDurFa = (ms: number): string => {
  const mins = Math.max(1, Math.round(ms / 60_000));
  if (mins < 60) return `${mins} دقیقه`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m ? `${h} ساعت و ${m} دقیقه` : `${h} ساعت`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH ? `${d} روز و ${remH} ساعت` : `${d} روز`;
};

/**
 * استخراج خودکار تگ «چرا وارد شدم؟»، «طبق قوانینم بود؟»، اشتباه‌ها، کارهای درست و یادداشت متنی
 * از روی داده‌های واقعی معامله و برنامهٔ خودکار (سفارش‌های صرافی و روند روزانه).
 */
export function inferAutoTradeNote(input: {
  trade: ClassifiedTrade;
  prevTrade: ClassifiedTrade | null;
  plan: TradePlan | undefined;
  settings: JournalSettings;
  accountSize: number | null;
}): TradeNote {
  const { trade: t, prevTrade, plan, settings, accountSize } = input;
  const o = plan?.outlook;
  const a = plan?.auto;
  const long = t.direction === 'long';

  // ۱) تشخیص رفتار انتقامی (ورود سریع کمتر از ۶۰ دقیقه بعد از ضرر با حجم مساوی یا بزرگ‌تر)
  const gapAfterLossMs =
    prevTrade && !prevTrade.open && prevTrade.closeTime !== null && prevTrade.netPnl < 0
      ? t.openTime - prevTrade.closeTime
      : null;
  const isRevenge =
    gapAfterLossMs !== null &&
    gapAfterLossMs >= 0 &&
    gapAfterLossMs <= HOUR_MS &&
    prevTrade !== null &&
    prevTrade.maxNotional > 0 &&
    t.maxNotional >= prevTrade.maxNotional * 0.9;

  // ۲) تگ‌های «چرا وارد شدم؟» از روی روند/رنج بازار، فاندینگ، و رفتار
  const whyCandidates: string[] = [];
  if (o?.proTrend === 'y') whyCandidates.push('هم‌جهت با روند');
  if (o?.proTrend === 'n') whyCandidates.push('خلاف روند');
  if (o?.env === 'range') {
    whyCandidates.push(long ? 'برگشت از کف رنج' : 'برگشت از سقف رنج');
  } else if (o?.env === 'trend' && o.proTrend !== 'n') {
    whyCandidates.push(long ? 'پولبک به ناحیهٔ تقاضا' : 'پولبک به ناحیهٔ عرضه');
  }
  if (t.funding !== null && t.maxNotional > 0 && Math.abs(t.funding) / t.maxNotional >= 0.0005) {
    whyCandidates.push('فاندینگ افراطی');
  }
  if (isRevenge) {
    whyCandidates.push('از روی حس');
  }
  if (!whyCandidates.length) {
    // وقتی کندل روزانه در دسترس نیست، بر اساس ساختار زمانی معامله یک برچسب واقع‌بینانه می‌زنیم
    const holdMs = t.closeTime ? t.closeTime - t.openTime : 0;
    if (holdMs > 0 && holdMs <= 2 * HOUR_MS) {
      whyCandidates.push('برگشت به میانگین', long ? 'شکست سقف' : 'شکست کف');
    } else {
      whyCandidates.push(long ? 'پولبک به ناحیهٔ تقاضا' : 'پولبک به ناحیهٔ عرضه', 'هم‌جهت با روند');
    }
  }
  const whyTags = pickAllowed(whyCandidates, settings.whyTags, 2);
  if (!whyTags.length && settings.whyTags.length > 0) {
    whyTags.push(settings.whyTags[0]);
  }

  // ۳) ارزیابی ریسک و قوانین
  const riskUsd =
    plan && plan.entry !== null && plan.stop !== null && t.maxSize > 0
      ? t.maxSize * Math.abs(plan.entry - plan.stop)
      : null;
  const riskPct = riskUsd !== null && accountSize && accountSize > 0 ? (riskUsd / accountSize) * 100 : null;
  const overRisk = riskPct !== null && riskPct > settings.maxRiskPct * 1.05;
  const actualR = !t.open && riskUsd && riskUsd > 0 ? t.netPnl / riskUsd : null;

  const mistakeCandidates: string[] = [];
  const goodCandidates: string[] = [];

  if (a?.stopSource === 'none') mistakeCandidates.push('خارج از برنامه');
  if (a?.stopMoved === 'wider') mistakeCandidates.push('جابه‌جاکردن استاپ');
  if (overRisk || t.liquidated) mistakeCandidates.push('حجم زیاد');
  if (isRevenge) mistakeCandidates.push('معاملهٔ انتقامی');
  if (o?.proTrend === 'n' && !t.open && t.netPnl < 0) mistakeCandidates.push('خلاف روند');

  if (a?.stopSource === 'exchange' && a.stopMoved !== 'wider' && !a.stopLateMin) {
    goodCandidates.push('رعایت استاپ');
  }
  if (riskPct !== null && !overRisk) {
    goodCandidates.push('اندازهٔ درست');
  }
  if (actualR !== null && actualR >= 1.5) {
    goodCandidates.push('رها کردن سودده تا هدف');
  }

  const mistakeTags = pickAllowed(mistakeCandidates, settings.mistakeTags, 3);
  const goodTags = pickAllowed(goodCandidates, settings.goodTags, 3);

  let followedRules: boolean | null = null;
  if (t.liquidated || a?.stopSource === 'none' || a?.stopMoved === 'wider' || overRisk || isRevenge) {
    followedRules = false;
  } else if (a?.stopSource === 'exchange' && !overRisk) {
    followedRules = true;
  } else if (plan && plan.source !== 'auto' && !overRisk) {
    followedRules = true;
  }

  // ۴) تولید یادداشت خودکار شفاف و کوتاه فارسی
  const parts: string[] = [];
  const sideFa = long ? 'لانگ' : 'شورت';
  parts.push(`ورود خودکار ثبت‌شده: ${sideFa} روی ${t.symbol} در ${VENUE_FA[t.venue]}`);

  if (a?.outlookAuto && o) {
    const envFa = o.env === 'trend' ? 'محیط روند' : o.env === 'range' ? 'محیط رنج' : 'محیط خنثی';
    const trendFa = o.proTrend === 'y' ? 'هم‌جهت با روند روزانه' : o.proTrend === 'n' ? 'خلاف روند روزانه' : 'بدون جهت قطعی روزانه';
    parts.push(`${trendFa} (${envFa})`);
  }

  if (a?.stopSource === 'exchange') {
    const moveText =
      a.stopMoved === 'wider'
        ? 'و استاپ در میانهٔ راه دورتر شد'
        : a.stopMoved === 'tighter'
          ? 'و استاپ به سمت سود جابه‌جا شد'
          : 'با استاپ ثبت‌شده روی صرافی';
    parts.push(moveText);
  } else if (a?.stopSource === 'none') {
    parts.push('بدون استاپ روی صرافی');
  }

  if (isRevenge && gapAfterLossMs !== null) {
    parts.push(`ورود ${Math.max(1, Math.round(gapAfterLossMs / 60_000))} دقیقه بعد از معاملهٔ زیان‌ده قبلی`);
  }

  if (t.closeTime) {
    parts.push(`مدت نگه‌داری: ${fmtDurFa(t.closeTime - t.openTime)}`);
  }

  return {
    tradeId: t.id,
    whyTags,
    whyTaggedBeforeClose: t.open,
    mistakeTags,
    goodTags,
    note: parts.join(' · ') + '.',
    followedRules,
    planId: plan?.id ?? null,
    autoGenerated: true,
    updatedAt: t.closeTime ?? t.openTime
  };
}

/**
 * ادغام یادداشت‌های خودکار با یادداشت‌های دستی کاربر:
 * اگر کاربر برای معامله‌ای دستی تگ یا یادداشت ثبت کرده باشد، همان حفظ می‌شود و هرگز بازنویسی نمی‌شود؛
 * فقط فیلدهای خالی (مثل «چرا وارد شدم؟» یا یادداشت خالی) به‌صورت خودکار پر می‌شوند.
 */
export function buildEffectiveNotes(input: {
  trades: readonly ClassifiedTrade[];
  manualNotes: ReadonlyMap<string, TradeNote>;
  plans: ReadonlyMap<string, TradePlan>;
  settings: JournalSettings;
  accountSize: number | null;
}): Map<string, TradeNote> {
  const out = new Map<string, TradeNote>(input.manualNotes);
  const sorted = [...input.trades].sort((a, b) => a.openTime - b.openTime);

  let prevDirectional: ClassifiedTrade | null = null;
  for (const t of sorted) {
    if (t.book !== 'directional') continue;
    const existing = out.get(t.id);
    const inferred = inferAutoTradeNote({
      trade: t,
      prevTrade: prevDirectional,
      plan: input.plans.get(t.id),
      settings: input.settings,
      accountSize: input.accountSize
    });

    if (!existing) {
      out.set(t.id, inferred);
    } else {
      const needsWhy = existing.whyTags.length === 0;
      const needsNote = !existing.note.trim();
      const needsRules = existing.followedRules === null && inferred.followedRules !== null;
      const needsMistakes = existing.mistakeTags.length === 0 && inferred.mistakeTags.length > 0;
      const needsGood = existing.goodTags.length === 0 && inferred.goodTags.length > 0;
      if (needsWhy || needsNote || needsRules || needsMistakes || needsGood) {
        out.set(t.id, {
          ...existing,
          whyTags: needsWhy ? inferred.whyTags : existing.whyTags,
          note: needsNote ? inferred.note : existing.note,
          followedRules: needsRules ? inferred.followedRules : existing.followedRules,
          mistakeTags: needsMistakes ? inferred.mistakeTags : existing.mistakeTags,
          goodTags: needsGood ? inferred.goodTags : existing.goodTags,
          autoGenerated: existing.autoGenerated ?? (needsWhy && needsNote)
        });
      }
    }

    if (!t.open) prevDirectional = t;
  }

  return out;
}

/* ============================================================
   لوپ نقد کمّی ۳ مرحله‌ای حسابرسی (Auto Critique Loop)
   ============================================================ */

export interface CritiqueLoopStep {
  stage: 'detect' | 'critique' | 'action';
  title: string;
  body: string;
  tone: 'info' | 'warn' | 'gain' | 'loss';
}

export interface AutoCritiqueLoop {
  active: boolean;
  confidenceLabel: string;
  steps: CritiqueLoopStep[];
  proposedCommitments: Commitment[];
}

function commitmentFromLeak(
  leakId: string,
  title: string,
  settings: JournalSettings,
  now: number,
  idx: number
): Commitment {
  let rule: CommitmentRule = { type: 'requirePlan' };
  let text = title;
  if (/revenge|after-loss/i.test(leakId)) {
    rule = { type: 'cooldownAfterLoss', minutes: 60 };
    text = 'حداقل ۶۰ دقیقه فاصله بعد از هر معاملهٔ زیان‌ده';
  } else if (/overtrad|tilt|freq/i.test(leakId)) {
    rule = { type: 'maxTradesPerDay', n: 3 };
    text = 'حداکثر ۳ معاملهٔ جهت‌دار در روز';
  } else if (/risk|size|tail/i.test(leakId)) {
    rule = { type: 'maxRiskPct', pct: settings.maxRiskPct || 1 };
    text = `سقف ریسک هر معامله حداکثر ${settings.maxRiskPct || 1}٪ سرمایه با استاپ روی صرافی`;
  } else if (/hour/i.test(leakId)) {
    rule = { type: 'noTradeHours', from: 0, to: 6 };
    text = 'توقف معامله در ساعات کم‌بازده و خستگی';
  }
  return { id: `loop-${now.toString(36)}-${idx}`, text: text.slice(0, 200), rule, done: false };
}

/**
 * تولید لوپ نقد خودکار ۳ مرحله‌ای از روی نتیجهٔ حسابرسی دفتر جهت‌دار:
 * ۱. کشف خودکار (Detect): مهم‌ترین نشتی یا نقطهٔ ضعف عددی
 * ۲. نقد متقابل (Critique): اعتبارسنجی آماری تا از نتیجه‌گیری غلط روی نمونهٔ کوچک یا چند معاملهٔ استثنایی جلوگیری شود
 * ۳. تعهد اجرایی (Action Loop): تبدیل نقد به قانون قابل‌سنجش برای هفتهٔ بعد
 */
export function buildAutoCritiqueLoop(
  audit: BookAudit,
  settings: JournalSettings,
  now = Date.now()
): AutoCritiqueLoop {
  const m = audit.core;
  if (m.n === 0) {
    return {
      active: false,
      confidenceLabel: 'در انتظار اولین معاملهٔ بسته',
      steps: [],
      proposedCommitments: []
    };
  }

  const steps: CritiqueLoopStep[] = [];
  const proposedCommitments: Commitment[] = [];

  // گام ۱: کشف خودکار
  if (audit.first) {
    steps.push({
      stage: 'detect',
      title: '۱. تشخیص خودکار از معاملات واقعی',
      body: `پرهزینه‌ترین نشتی شناسایی‌شده: «${audit.first.title}» با اثر تخمینی ${Math.round(Math.abs(audit.first.cost)).toLocaleString('en-US')} دلار. ${audit.first.detail}`,
      tone: 'loss'
    });
  } else {
    steps.push({
      stage: 'detect',
      title: '۱. تشخیص خودکار از معاملات واقعی',
      body: `در میان ${m.n} معاملهٔ بسته، نشتی رفتاری پرهزینه و تکرارشونده‌ای ثبت نشد (سود خالص ${Math.round(m.netPnl).toLocaleString('en-US')} دلار).`,
      tone: 'gain'
    });
  }

  // گام ۲: نقد متقابل و اعتبارسنجی آماری
  const critiqueNotes: string[] = [];
  if (m.n < 20) {
    critiqueNotes.push(`حجم نمونه هنوز کوچک است (${m.n} معامله؛ برای نتیجهٔ آماری پایدار حداقل ۲۰ تا ۳۰ معامله لازم است)، پس به جای تغییر کامل استراتژی فقط کنترل ریسک را سخت‌تر کن.`);
  }
  if (m.netPnl < 0 && m.withoutWorst3 !== null && m.withoutWorst3 > 0) {
    critiqueNotes.push('نقد کلیدی: بدون فقط ۳ معاملهٔ بد، حساب شما مثبت بوده است! مشکل شما انتخاب جهت نیست، بلکه کنترل نکردن حد زیان در همان چند معامله بوده است.');
  } else if (m.payoff !== null && m.payoff < 1 && m.winRateDecisive !== null && m.winRateDecisive >= 50) {
    critiqueNotes.push('نقد کلیدی: نرخ برد شما قابل‌قبول است، اما میانگین زیان از میانگین سود بزرگ‌تر است؛ پس ورودتان مشکل اصلی نیست، بلکه بستن زودهنگام سودها یا باز نگه داشتن زیان‌هاست.');
  } else {
    critiqueNotes.push('اعتبارسنجی آماری: روند کلی با ساختار سود و زیان شما هم‌خوانی دارد؛ تمرکز روی اجرای منظم استاپ و سقف ریسک بیشترین بازده را می‌دهد.');
  }

  steps.push({
    stage: 'critique',
    title: '۲. نقد متقابل و اعتبارسنجی آماری',
    body: critiqueNotes.join(' '),
    tone: m.n < 20 ? 'warn' : 'info'
  });

  // گام ۳: تبدیل به تعهد قابل‌سنجش
  const leaks = [audit.first, ...audit.next].filter((x): x is NonNullable<typeof x> => !!x).slice(0, 3);
  if (leaks.length > 0) {
    leaks.forEach((l, i) => proposedCommitments.push(commitmentFromLeak(l.id, l.fix, settings, now, i)));
  } else {
    proposedCommitments.push({
      id: `loop-${now.toString(36)}-0`,
      text: `حفظ سقف ریسک حداکثر ${settings.maxRiskPct || 1}٪ در هر معامله و ثبت استاپ روی صرافی`,
      rule: { type: 'maxRiskPct', pct: settings.maxRiskPct || 1 },
      done: false
    });
  }

  steps.push({
    stage: 'action',
    title: '۳. قانون اجرایی برای هفتهٔ پیش رو',
    body: proposedCommitments.map((c, i) => `${i + 1}) ${c.text}`).join(' · '),
    tone: 'gain'
  });

  const confidenceLabel =
    m.n >= 50 ? 'اعتبار آماری بالا' : m.n >= 20 ? 'اعتبار آماری متوسط' : 'نمونهٔ اولیه (جهت‌نما)';

  return {
    active: true,
    confidenceLabel,
    steps,
    proposedCommitments
  };
}

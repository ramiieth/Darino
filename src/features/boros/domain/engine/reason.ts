/** ============================================================
 * Boros Reason Engine — «چرا این بازار انتخاب شد / رد شد؟» (Master §29)
 * برای هر Market توضیحات کمی تولید می‌کند:
 *  - Why Potential? (چرا فرصت بالقوه است)
 *  - Why Not Attractive? (چرا جذاب نیست — حتی با Spread بالا)
 * ============================================================ */
import type { MarketAnalysis } from './index';

export interface ReasonItem {
  ok: boolean;
  text: string;
}

export interface OpportunityExplanation {
  /** دلایل مثبت (Potential) */
  positive: ReasonItem[];
  /** دلایل رد (Not Attractive) */
  negative: ReasonItem[];
  /** خلاصه وضعیت */
  summary: string;
}

/** درصدهای خوانا */
const pct = (v: number | null | undefined, digits = 2): string =>
  v === null || v === undefined ? 'N/A' : `${(v * 100).toFixed(digits)}%`;

/**
 * تولید توضیحات کمی برای یک بازار:
 *  - نرخ زیرلایه بالاتر/پایین‌تر از نرخ ثابت
 *  - Settlement PnL بعد از هزینه‌ها
 *  - نقدشوندگی اجرا برای نotional
 *  - سناریو Base
 *  - تازگی داده
 *  - Anomaly
 */
export function explainOpportunity(a: MarketAnalysis): OpportunityExplanation {
  const positive: ReasonItem[] = [];
  const negative: ReasonItem[] = [];

  // ۱) Rate Edge
  const edge = a.longSpread;
  if (edge > 0.005) {
    positive.push({
      ok: true,
      text: `نرخ زیرلایه (${pct(a.underlyingApr)}) به‌طور معناداری بالاتر از نرخ ثابت (${pct(a.impliedApr)}) است. (Long Edge ${pct(edge)})`
    });
  } else if (edge < -0.005) {
    negative.push({
      ok: false,
      text: `نرخ زیرلایه (${pct(a.underlyingApr)}) پایین‌تر از نرخ ثابت (${pct(a.impliedApr)}) است — مزیت نرخ مثبتی وجود ندارد.`
    });
  }

  // ۲) Net PnL بعد از هزینه‌ها
  if (a.totalLongPnl > 0) {
    positive.push({
      ok: true,
      text: `Settlement PnL موردانتظار بعد از هزینه‌ها مثبت است ($${a.totalLongPnl.toFixed(2)}).`
    });
  } else {
    negative.push({
      ok: false,
      text: `Net PnL بعد از هزینه‌ها منفی است ($${a.totalLongPnl.toFixed(2)}) — هزینه‌ها ($${(a.fees?.total ?? 0).toFixed(2)}) مزیت نرخ را از بین برده‌اند.`
    });
  }

  // ۳) Economic Edge
  if (a.totalLongPnl - a.minEconomicEdge > 0) {
    positive.push({
      ok: true,
      text: `Economic Edge مثبت است (Net $${a.totalLongPnl.toFixed(2)} − Min Edge $${a.minEconomicEdge.toFixed(2)} = $${(a.totalLongPnl - a.minEconomicEdge).toFixed(2)}).`
    });
  } else {
    negative.push({
      ok: false,
      text: `Net PnL از حداقل لبه اقتصادی ($${a.minEconomicEdge.toFixed(2)}) پایین‌تر است — سود ناچیز برای رتبه‌بندی کافی نیست.`
    });
  }

  // ۴) نقدشوندگی اجرا
  if (a.liquidity.available) {
    if (a.liquidity.executable) {
      positive.push({
        ok: true,
        text: `نقدشوندگی اجرا برای نotional انتخاب‌شده کافی است (ظرفیت تخمینی $${a.liquidity.estimatedMaxExecutable.toFixed(0)}).`
      });
    } else {
      negative.push({
        ok: false,
        text: `نotional انتخابی ($${(a.marginRequired / (a.liquidity.estimatedMaxExecutable || 1)).toFixed(0)}× ظرفیت) از قابلیت اجرا بیشتر است — نقدشوندگی واقعی کافی نیست.`
      });
    }
  }

  // ۵) سناریو Base
  const baseNet = a.stress.baseNet;
  if (baseNet !== null && baseNet > 0) {
    positive.push({
      ok: true,
      text: `سناریوی Base (نرخ فعلی) مثبت است ($${baseNet.toFixed(2)}).`
    });
  } else if (baseNet !== null) {
    negative.push({
      ok: false,
      text: `سناریوی Base منفی است ($${baseNet.toFixed(2)}).`
    });
  }

  // ۶) تازگی داده
  if (a.freshness.stale) {
    negative.push({
      ok: false,
      text: `داده کهنه است (سن ${a.freshness.ageMs !== null ? Math.round(a.freshness.ageMs / 60000) : '?'} دقیقه) — اعتماد به داده پایین است.`
    });
  } else {
    positive.push({
      ok: true,
      text: 'تازگی داده مطلوب است.'
    });
  }

  // ۷) Anomaly
  if (a.anomaly.detected) {
    for (const r of a.anomaly.reasons) {
      negative.push({ ok: false, text: `ناهنجاری: ${r}` });
    }
  }

  // خلاصه
  let summary: string;
  switch (a.statusLong) {
    case 'potential':
      summary = 'Potential Opportunity — پس از هزینه‌ها، نقدشوندگی، سناریوها و کیفیت داده همچنان Edge اقتصادی معنادار دارد.';
      break;
    case 'conditional':
      summary = 'Conditional Opportunity — Base مثبت است ولی سناریوی Bear منفی است؛ فرصت مشروط به ادامه نرخ فعلی است.';
      break;
    case 'anomaly-detected':
      summary = 'Rate Anomaly — انحراف شدید نرخ تشخیص داده شد؛ Spread بزرگ به‌تنهایی فرصت نیست.';
      break;
    case 'not-attractive':
      summary = 'Not Attractive — بعد از هزینه‌ها یا لبه اقتصادی، جذابیت ندارد.';
      break;
    default:
      summary = 'Insufficient Data — داده کافی برای تحلیل معتبر در دسترس نیست.';
  }

  return { positive, negative, summary };
}

/** ============================================================
 * Boros Reason Engine — «چرا این بازار انتخاب شد / رد شد؟» (Master §29)
 * برای هر Market توضیحات کمی تولید می‌کند:
 *  - Why Potential? (چرا فرصت بالقوه است)
 *  - Why Not Attractive? (چرا جذاب نیست — حتی با Spread بالا)
 * ============================================================ */
import type { MarketAnalysis } from './index';
import { fmtUSD, toFaDigits } from '@/shared/utils/formatters';

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
  v === null || v === undefined ? '—' : `${toFaDigits((v * 100).toFixed(digits))}٪`;

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
      text: `نرخ زیرلایه (${pct(a.underlyingApr)}) به‌طور معناداری بالاتر از نرخ ثابت (${pct(a.impliedApr)}) است. (مزیت لانگ ${pct(edge)})`
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
      text: `سود/زیان تسویه موردانتظار بعد از هزینه‌ها مثبت است (${fmtUSD(a.totalLongPnl)}).`
    });
  } else {
    negative.push({
      ok: false,
      text: `سود/زیان خالص بعد از هزینه‌ها منفی است (${fmtUSD(a.totalLongPnl)}) — هزینه‌ها (${fmtUSD((a.fees?.total ?? 0))}) مزیت نرخ را از بین برده‌اند.`
    });
  }

  // ۳) Economic Edge
  if (a.totalLongPnl - a.minEconomicEdge > 0) {
    positive.push({
      ok: true,
      text: `مزیت اقتصادی مثبت است (خالص ${fmtUSD(a.totalLongPnl)} − حداقل مزیت ${fmtUSD(a.minEconomicEdge)} = ${fmtUSD((a.totalLongPnl - a.minEconomicEdge))}).`
    });
  } else {
    negative.push({
      ok: false,
      text: `سود/زیان خالص از حداقل لبه اقتصادی (${fmtUSD(a.minEconomicEdge)}) پایین‌تر است — سود ناچیز برای رتبه‌بندی کافی نیست.`
    });
  }

  // ۴) نقدشوندگی اجرا
  if (a.liquidity.available) {
    if (a.liquidity.executable) {
      positive.push({
        ok: true,
        text: `نقدشوندگی اجرا برای ارزش اسمی انتخاب‌شده کافی است (ظرفیت تخمینی ${fmtUSD(a.liquidity.estimatedMaxExecutable)}).`
      });
    } else {
      negative.push({
        ok: false,
        text: `ارزش اسمی انتخابی (${fmtUSD((a.marginRequired / (a.liquidity.estimatedMaxExecutable || 1)))}× ظرفیت) از قابلیت اجرا بیشتر است — نقدشوندگی واقعی کافی نیست.`
      });
    }
  }

  // ۵) سناریو Base
  const baseNet = a.stress.baseNet;
  if (baseNet !== null && baseNet > 0) {
    positive.push({
      ok: true,
      text: `سناریوی پایه (نرخ فعلی) مثبت است (${fmtUSD(baseNet)}).`
    });
  } else if (baseNet !== null) {
    negative.push({
      ok: false,
      text: `سناریوی پایه منفی است (${fmtUSD(baseNet)}).`
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
      summary = 'فرصت بالقوه — پس از هزینه‌ها، نقدشوندگی، سناریوها و کیفیت داده همچنان مزیت اقتصادی معنادار دارد.';
      break;
    case 'conditional':
      summary = 'فرصت مشروط — پایه مثبت است ولی سناریوی نزولی منفی است؛ فرصت مشروط به ادامه نرخ فعلی است.';
      break;
    case 'anomaly-detected':
      summary = 'ناهنجاری نرخ — انحراف شدید نرخ تشخیص داده شد؛ اختلاف نرخ بزرگ به‌تنهایی فرصت نیست.';
      break;
    case 'not-attractive':
      summary = 'غیرجذاب — بعد از هزینه‌ها یا لبه اقتصادی، جذابیت ندارد.';
      break;
    default:
      summary = 'دادهٔ ناکافی — داده کافی برای تحلیل معتبر در دسترس نیست.';
  }

  return { positive, negative, summary };
}

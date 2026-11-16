/**
 * موتور دامنه «سبد دارایی، میانگین خرید پله‌ای (DCA) و کمیته ایجنت‌ها» در ماشین‌حساب دارینو
 *
 * قابلیت‌های کلیدی:
 *   ۱) مدیریت سرمایه استیبل‌کوینی دوگانه (مثلاً ۱۷,۶۸۱ USDC + ۵,۰۰۰ USDT = ۲۲,۶۸۱ دلار) + ذخیره نقدینگی / دلتا نوترال
 *   ۲) مدیریت پویا (افزودن، ویرایش، حذف، تغییر وزن و تغییر پله‌های خرید DCA) برای هر رمزارز یا دارایی توکنایز
 *      (HYPE، ETH، SOL، XAUT، PAXG، BTC و سایر رمزارزها)
 *   ۳) محاسبه دقیق میانگین خرید پله‌ای (DCA Ladder) و ترکیب آن با موجودی قبلی کیف پول/داشبورد
 *      (مثلاً ترکیب ۳.۳۳ واحد ETH روی میانگین ۲,۸۲۰ دلار با پله‌های جدید DCA)
 *   ۴) اجرای کمیته ۴ مرحله‌ای ایجنت‌ها (TradingAgents: ۱۱ اندیکاتور تکنیکال، مناظره صعودی/نزولی، معامله‌گر ATR و مدیر پرتفولیو)
 *      روی تک‌تک دارایی‌های سبد و صدور ارزیابی کلان سبد (حذف موارد تکراری، مقایسه XAUT و PAXG، بررسی همبستگی بتا و نقش BTC).
 */

import { ETH_POSITION } from '@/features/simulation/domain/constants';
import { getAssetAthAndRangeInfo, type ComputedAthAndRangeInfo } from '@/features/markets/domain/athAndRangeAnalytics';
import {
  buildDeterministicCommitteeBaseline,
  buildDeterministicTradingAgentsReport,
  buildIndicatorDiagnostics,
  computeTechnicalSnapshot,
  synthesizeFallbackCandles,
  type CommitteeMarketInput,
  type IndicatorDiagnosticRow,
  type PortfolioRating,
  type SentimentBand,
  type TraderAction,
  type TradingAgentsReport
} from '@/features/intel/domain/tradingAgents';

export type StableSource = 'USDC' | 'USDT' | 'BOTH';

export interface BasketDcaStep {
  id: string;
  labelFa: string;
  /** درصد افت نسبت به قیمت فعلی (مثلاً 0 برای پله اول، -6 برای پله دوم، -12 برای پله سوم) یا قیمت دستی */
  dropPctFromCurrent: number;
  /** قیمت ورود این پله به دلار */
  targetPriceUsd: number;
  /** سهم این پله از کل بودجه تخصیص‌یافته به این دارایی (۰ تا ۱۰۰٪) */
  weightPct: number;
  /** آیا این پله در محاسبه میانگین فعال است؟ */
  enabled: boolean;
}

export interface BasketAssetItem {
  id: string;
  symbol: string;
  nameFa: string;
  category: 'layer1' | 'perp_dex' | 'gold' | 'defi' | 'custom';
  enabled: boolean;
  /** سهم از بودجه اختصاص‌یافته به خرید (درصد از کل بودجه فعال DCA) */
  allocationPct: number;
  /** منبع استیبل‌کوین پیشنهادی برای خرید (USDC یا USDT یا هر دو) */
  preferredStable: StableSource;
  /** قیمت فعلی بازار (دلار) */
  currentPriceUsd: number;
  /** تغییر ۲۴ ساعته (درصد) برای شبیه‌سازی کندل در صورت نبود داده زنده */
  change24hPct: number;
  /** موجودی قبلی کاربر در کیف پول/داشبورد (مثلاً 3.33 برای ETH) */
  existingQuantity: number;
  /** میانگین قیمت خرید قبلی کاربر (مثلاً 2820 برای ETH) */
  existingAvgCostUsd: number;
  /** قیمت هدف میان‌مدت کاربر برای محاسبه سود بالقوه (دلار) */
  targetExitPriceUsd: number;
  /** پله‌های خرید DCA برای این دارایی */
  dcaSteps: BasketDcaStep[];
  /** یادداشت بنیادی کوتاه درباره نقش دارایی در سبد */
  fundamentalNoteFa: string;
}

export interface ComputedBasketStepDetail {
  id: string;
  stepIndex: number;
  labelFa: string;
  targetPriceUsd: number;
  dropFromMarketPct: number;
  allocatedUsd: number;
  unitsBought: number;
  /** موجودی تجمعی با احتساب موجودی قبلی کیف پول + پله‌های پرشده تا این پله */
  cumulativeUnits: number;
  /** سرمایه کل تجمعی (بهای تمام‌شده قبلی + پله‌های پرشده تا این پله) */
  cumulativeCostUsd: number;
  /** میانگین قیمت تمام‌شده کل پس از پر شدن این پله */
  newCombinedAvgCostUsd: number;
  /** میانگین قیمت خرید فقط برای پله‌های جدید تا این پله */
  newBuysOnlyAvgCostUsd: number;
  /** درصد رشد لازم از قیمت این پله تا رسیدن به نقطه سربه‌سر کل */
  bounceToBreakEvenPct: number;
}

export interface AssetCommitteeEvaluation {
  symbol: string;
  rating: PortfolioRating;
  traderAction: TraderAction;
  sentimentBand: SentimentBand;
  sentimentScore: number;
  bullIndicatorsCount: number;
  bearIndicatorsCount: number;
  neutralIndicatorsCount: number;
  atr14: number | null;
  atrPct: number | null;
  atrStopLong: number | null;
  atrTargetLong: number | null;
  rsi14: number | null;
  sma50: number | null;
  sma200: number | null;
  support20: number | null;
  resistance20: number | null;
  report: TradingAgentsReport;
  indicators: IndicatorDiagnosticRow[];
  committeeInput: CommitteeMarketInput;
}

export interface ComputedBasketAssetRow {
  item: BasketAssetItem;
  normalizedWeightPct: number;
  allocatedBudgetUsd: number;
  usdcShareUsd: number;
  usdtShareUsd: number;
  existingBasisUsd: number;
  existingMarketValueUsd: number;
  existingUnrealizedPnlUsd: number;
  existingUnrealizedPnlPct: number;
  dcaAddedUnits: number;
  dcaAverageEntryUsd: number;
  totalQuantityAfterDca: number;
  totalInvestedAfterDcaUsd: number;
  combinedNewAvgCostUsd: number;
  avgCostReductionUsd: number;
  avgCostReductionPct: number;
  requiredBounceToBreakEvenBeforePct: number;
  requiredBounceToBreakEvenAfterPct: number;
  projectedValueAtTargetUsd: number;
  projectedProfitAtTargetUsd: number;
  projectedRoiAtTargetPct: number;
  profitIfReachesOldAvgUsd: number;
  stepDetails: ComputedBasketStepDetail[];
  athInfo: ComputedAthAndRangeInfo | null;
  committee: AssetCommitteeEvaluation;
}

export interface BasketAuditAdvisory {
  id: string;
  tone: 'gain' | 'warn' | 'info' | 'loss';
  titleFa: string;
  bodyFa: string;
  actionType?: 'remove_duplicate_gold' | 'add_btc_anchor' | 'keep_dry_powder' | 'prefer_xaut_for_usdt';
}

export interface PortfolioBasketSimulationSummary {
  usdcBalanceUsd: number;
  usdtBalanceUsd: number;
  totalStableBalanceUsd: number;
  reserveDryPowderUsd: number;
  reserveDryPowderPct: number;
  deployableDcaBudgetUsd: number;
  deployableUsdcUsd: number;
  deployableUsdtUsd: number;
  totalExistingBasisUsd: number;
  totalExistingMarketValueUsd: number;
  totalPortfolioAfterDcaCostUsd: number;
  totalProjectedValueAtTargetsUsd: number;
  totalProjectedProfitAtTargetsUsd: number;
  totalProjectedRoiPct: number;
  weightedCommitteeScore: number;
  overallVerdictFa: string;
  rows: ComputedBasketAssetRow[];
  advisories: BasketAuditAdvisory[];
}

export interface GoldTokenComparisonItem {
  symbol: 'XAUT' | 'PAXG';
  nameFa: string;
  issuerFa: string;
  regulatorFa: string;
  auditorFa: string;
  vaultLocationFa: string;
  mintRedeemFeePct: string;
  liquidityAdvantageFa: string;
  bestStablePair: 'USDT' | 'USDC';
  recommendedForUser: boolean;
  summaryFa: string;
}

/**
 * جدول مقایسه تخصصی طلای تتر (XAUT) در برابر پکس گلد (PAXG)
 * برای تصمیم‌گیری آگاهانه کاربر و حذف یکی از این دو از سبد.
 */
export const GOLD_TOKEN_COMPARISON: readonly GoldTokenComparisonItem[] = [
  {
    symbol: 'XAUT',
    nameFa: 'تتر گلد (Tether Gold)',
    issuerFa: 'TG Commodities (مجموعه Tether)',
    regulatorFa: 'چارچوب دارایی دیجیتال CNAD',
    auditorFa: 'BDO Italia (گزارش دوره‌ای شمش‌های سریال‌دار)',
    vaultLocationFa: 'خزانه‌های امن سوئیس (استاندارد LBMA)',
    mintRedeemFeePct: '۰.۲۵٪ در صدور/بازخرید مستقیم (۰٪ کارمزد نگهداری سالانه)',
    liquidityAdvantageFa: 'نقدشوندگی بالاتر در بازارهای جهانی و جفت‌ارز مستقیم و عمیق با ۵,۰۰۰ واحد تتر (USDT) شما',
    bestStablePair: 'USDT',
    recommendedForUser: true,
    summaryFa:
      'گزینه پیشنهادی برای سبد شما: نقدشوندگی بالاتر روی جفت XAUT/USDT، رتبه بازار بالاتر در CoinGecko (#۲۸ در برابر #۴۶) و هماهنگی کامل با ۵,۰۰۰ واحد تتر موجود در سبد.'
  },
  {
    symbol: 'PAXG',
    nameFa: 'پکس گلد (PAX Gold)',
    issuerFa: 'Paxos Trust Company',
    regulatorFa: 'نهاد نظارتی ایالت نیویورک (NYDFS)',
    auditorFa: 'KPMG (گواهی حسابرسی ماهانه)',
    vaultLocationFa: 'خزانه‌های Brink’s در لندن (LBMA)',
    mintRedeemFeePct: '۰.۰۲٪ تا ۱٪ پلکانی (۰٪ کارمزد نگهداری سالانه)',
    liquidityAdvantageFa: 'مناسب جفت‌ارزهای دلاری و USDC؛ نگه داشتن هم‌زمان آن در کنار XAUT تکراری است',
    bestStablePair: 'USDC',
    recommendedForUser: false,
    summaryFa:
      'از نظر گواهی حسابرسی ماهانه KPMG معتبر است، اما با توجه به وجود ۵,۰۰۰ واحد تتر در سبد شما، نگه‌داشتن هم‌زمان آن با XAUT تکراری است و تمرکز سهم طلا روی XAUT کارآمدتر است.'
  }
];

/**
 * کاتالوگ دارایی‌های آماده برای افزودن سریع به سبد ماشین‌حساب (شامل BTC، HYPE، ETH، SOL، XAUT، PAXG و...)
 */
export interface PresetBasketCandidate {
  symbol: string;
  nameFa: string;
  category: BasketAssetItem['category'];
  defaultPriceUsd: number;
  defaultTargetPriceUsd: number;
  defaultAllocationPct: number;
  preferredStable: StableSource;
  stepDropsPct: [number, number, number];
  fundamentalNoteFa: string;
}

export const PRESET_BASKET_CANDIDATES: readonly PresetBasketCandidate[] = [
  {
    symbol: 'HYPE',
    nameFa: 'هایپرلیکوئید (Hyperliquid)',
    category: 'perp_dex',
    defaultPriceUsd: 65.0,
    defaultTargetPriceUsd: 98.0,
    defaultAllocationPct: 21.18,
    preferredStable: 'USDC',
    stepDropsPct: [0, -7.7, -16.15],
    fundamentalNoteFa:
      'واگرایی مثبت بنیادی: حدود ۳۳٪ اصلاح از سقف ۹۷.۹۶ دلار تا ۶۵ دلار، در حالی که با ۶۹.۷۷ میلیون دلار درآمد ۳۰ روزه (سومین پروتکل درآمدساز بازار پس از تتر و سیرکل در DefiLlama) ۹۹٪ کارمزدها را صرف بازخرید توکن HYPE در صندوق Assistance Fund می‌کند.'
  },
  {
    symbol: 'ETH',
    nameFa: 'اتریوم (Ethereum)',
    category: 'layer1',
    defaultPriceUsd: 1825.0,
    defaultTargetPriceUsd: 2820.0,
    defaultAllocationPct: 21.18,
    preferredStable: 'USDC',
    stepDropsPct: [0, -5.26, -10.74],
    fundamentalNoteFa:
      'کاهش میانگین خرید پوزیشن فعلی داشبورد (۳.۳۳ واحد روی ۲,۸۲۰ دلار): خرید پله‌ای در محدوده ۱,۸۲۵ تا ۱,۶۲۹ دلار میانگین تمام‌شده شما را به ۲,۳۹۸.۵ دلار می‌آورد تا در اولین موج برگشتی به سود برسید.'
  },
  {
    symbol: 'XAUT',
    nameFa: 'طلای تتر (Tether Gold)',
    category: 'gold',
    defaultPriceUsd: 3822.0,
    defaultTargetPriceUsd: 4600.0,
    defaultAllocationPct: 29.41,
    preferredStable: 'USDT',
    stepDropsPct: [0, -2.67, -5.29],
    fundamentalNoteFa:
      'لنگر تدافعی و ضدتورمی سبد: هر توکن معادل ۱ انس تروا طلای فیزیکی در خزانه‌های سوئیس. بهترین مقصد برای تبدیل پله‌ای ۵,۰۰۰ واحد تتر (USDT) با نقدشوندگی بالا.'
  },
  {
    symbol: 'BTC',
    nameFa: 'بیت‌کوین (Bitcoin)',
    category: 'layer1',
    defaultPriceUsd: 65260.0,
    defaultTargetPriceUsd: 95000.0,
    defaultAllocationPct: 16.47,
    preferredStable: 'USDC',
    stepDropsPct: [0, -5.0, -10.36],
    fundamentalNoteFa:
      'ستون فقرات کلان بازار با دامیننس ۵۸٪ و حدود ۴۸٪ فاصله از سقف ۱۲۶,۰۸۰ دلار؛ افزودن BTC به سبد، نوسان و بتای بالای ترکیب (HYPE + SOL) را متعادل می‌کند.'
  },
  {
    symbol: 'SOL',
    nameFa: 'سولانا (Solana)',
    category: 'layer1',
    defaultPriceUsd: 72.0,
    defaultTargetPriceUsd: 145.0,
    defaultAllocationPct: 11.76,
    preferredStable: 'USDC',
    stepDropsPct: [0, -6.94, -13.89],
    fundamentalNoteFa:
      'اصلاح عمیق حدود ۷۵٪ از سقف ۲۹۳.۳۱ دلار به محدوده ۷۲ دلار با حفظ جایگاه سومین بلاک‌چین از نظر درآمد کارمزد بلاک‌اسپیس (۱۶.۲ میلیون دلار در ۳۰ روز). مناسب شکار کف پله‌ای با وزن کنترل‌شده.'
  },
  {
    symbol: 'PAXG',
    nameFa: 'پکس گلد (PAX Gold)',
    category: 'gold',
    defaultPriceUsd: 3840.0,
    defaultTargetPriceUsd: 4600.0,
    defaultAllocationPct: 20,
    preferredStable: 'USDC',
    stepDropsPct: [0, -2.6, -5.2],
    fundamentalNoteFa:
      'طلای توکنایز با گواهی حسابرسی ماهانه KPMG. نگه داشتن هم‌زمان آن با XAUT تکراری است؛ یکی از این دو (ترجیحاً XAUT برای تتر) کافی است.'
  },
  {
    symbol: 'SUI',
    nameFa: 'سویی (Sui)',
    category: 'layer1',
    defaultPriceUsd: 0.85,
    defaultTargetPriceUsd: 2.1,
    defaultAllocationPct: 10,
    preferredStable: 'USDC',
    stepDropsPct: [0, -8.0, -16.0],
    fundamentalNoteFa: 'بلاک‌چین لایه اول Move با بتای بالا در موج‌های صعودی؛ صرفاً مناسب سهم کوچک در سبدهای تهاجمی.'
  },
  {
    symbol: 'AAVE',
    nameFa: 'آوه (Aave)',
    category: 'defi',
    defaultPriceUsd: 107.0,
    defaultTargetPriceUsd: 195.0,
    defaultAllocationPct: 10,
    preferredStable: 'USDC',
    stepDropsPct: [0, -6.5, -13.0],
    fundamentalNoteFa: 'بزرگ‌ترین پروتکل وام‌دهی غیرمتمرکز دیفای با درآمد پایدار و نقدشوندگی بالا.'
  },
  {
    symbol: 'LINK',
    nameFa: 'چین‌لینک (Chainlink)',
    category: 'defi',
    defaultPriceUsd: 8.5,
    defaultTargetPriceUsd: 18.0,
    defaultAllocationPct: 10,
    preferredStable: 'USDC',
    stepDropsPct: [0, -6.5, -13.0],
    fundamentalNoteFa: 'زیرساخت اوراکل و استاندارد CCIP برای دارایی‌های توکنایزشده (RWA).'
  },
  {
    symbol: 'PENDLE',
    nameFa: 'پندل (Pendle)',
    category: 'defi',
    defaultPriceUsd: 1.45,
    defaultTargetPriceUsd: 3.2,
    defaultAllocationPct: 10,
    preferredStable: 'USDC',
    stepDropsPct: [0, -7.0, -14.0],
    fundamentalNoteFa: 'پروتکل توکنایز سود ثابت (PT/YT) برای استراتژی‌های درآمد ثابت دیفای.'
  }
];

function roundPriceSmart(px: number): number {
  if (!Number.isFinite(px) || px <= 0) return 0;
  if (px >= 1000) return Math.round(px);
  if (px >= 10) return Number(px.toFixed(2));
  if (px >= 1) return Number(px.toFixed(3));
  return Number(px.toPrecision(4));
}

/**
 * ساخت ۳ پله استاندارد DCA بر اساس قیمت فعلی و درصدهای افت
 */
export function buildDefaultDcaStepsForPrice(
  symbol: string,
  currentPriceUsd: number,
  dropsPct: [number, number, number] = [0, -6, -12]
): BasketDcaStep[] {
  const safePx = currentPriceUsd > 0 ? currentPriceUsd : 100;
  const up = symbol.toUpperCase();

  if (up === 'ETH' && safePx >= 1740 && safePx <= 1950) {
    return [
      {
        id: `${up}-step-1`,
        labelFa: 'پله ۱ (ورود اولیه / لیمیت اول)',
        dropPctFromCurrent: Number((((1825 - safePx) / safePx) * 100).toFixed(1)),
        targetPriceUsd: Math.min(roundPriceSmart(safePx), 1825),
        weightPct: 35,
        enabled: true
      },
      {
        id: `${up}-step-2`,
        labelFa: 'پله ۲ (حمایت میانی ۱,۷۲۹$)',
        dropPctFromCurrent: Number((((1729 - safePx) / safePx) * 100).toFixed(1)),
        targetPriceUsd: 1729,
        weightPct: 35,
        enabled: true
      },
      {
        id: `${up}-step-3`,
        labelFa: 'پله ۳ (شکار کف ۱,۶۲۹$)',
        dropPctFromCurrent: Number((((1629 - safePx) / safePx) * 100).toFixed(1)),
        targetPriceUsd: 1629,
        weightPct: 30,
        enabled: true
      }
    ];
  }

  if (up === 'HYPE' && safePx >= 58 && safePx <= 72) {
    return [
      {
        id: `${up}-step-1`,
        labelFa: 'پله ۱ (محدوده فعلی ۶۵$)',
        dropPctFromCurrent: 0,
        targetPriceUsd: roundPriceSmart(safePx),
        weightPct: 35,
        enabled: true
      },
      {
        id: `${up}-step-2`,
        labelFa: 'پله ۲ (حمایت روانی ۶۰$)',
        dropPctFromCurrent: Number((((60 - safePx) / safePx) * 100).toFixed(1)),
        targetPriceUsd: 60,
        weightPct: 35,
        enabled: true
      },
      {
        id: `${up}-step-3`,
        labelFa: 'پله ۳ (کف رنج ۵۴.۵$)',
        dropPctFromCurrent: Number((((54.5 - safePx) / safePx) * 100).toFixed(1)),
        targetPriceUsd: 54.5,
        weightPct: 30,
        enabled: true
      }
    ];
  }

  if (up === 'XAUT' && safePx >= 3650 && safePx <= 4050) {
    return [
      {
        id: `${up}-step-1`,
        labelFa: 'پله ۱ (محدوده فعلی ۳,۸۲۲$)',
        dropPctFromCurrent: 0,
        targetPriceUsd: roundPriceSmart(safePx),
        weightPct: 35,
        enabled: true
      },
      {
        id: `${up}-step-2`,
        labelFa: 'پله ۲ (کف رنج ۳,۷۲۰$)',
        dropPctFromCurrent: Number((((3720 - safePx) / safePx) * 100).toFixed(1)),
        targetPriceUsd: 3720,
        weightPct: 35,
        enabled: true
      },
      {
        id: `${up}-step-3`,
        labelFa: 'پله ۳ (حمایت ۳,۶۲۰$)',
        dropPctFromCurrent: Number((((3620 - safePx) / safePx) * 100).toFixed(1)),
        targetPriceUsd: 3620,
        weightPct: 30,
        enabled: true
      }
    ];
  }

  if (up === 'BTC' && safePx >= 60000 && safePx <= 70000) {
    return [
      {
        id: `${up}-step-1`,
        labelFa: 'پله ۱ (کف رنج ۶۵,۲۶۰$)',
        dropPctFromCurrent: 0,
        targetPriceUsd: roundPriceSmart(safePx),
        weightPct: 35,
        enabled: true
      },
      {
        id: `${up}-step-2`,
        labelFa: 'پله ۲ (حمایت ۶۲,۰۰۰$)',
        dropPctFromCurrent: Number((((62000 - safePx) / safePx) * 100).toFixed(1)),
        targetPriceUsd: 62000,
        weightPct: 35,
        enabled: true
      },
      {
        id: `${up}-step-3`,
        labelFa: 'پله ۳ (کف ۵۸,۵۰۰$)',
        dropPctFromCurrent: Number((((58500 - safePx) / safePx) * 100).toFixed(1)),
        targetPriceUsd: 58500,
        weightPct: 30,
        enabled: true
      }
    ];
  }

  if (up === 'SOL' && safePx >= 64 && safePx <= 82) {
    return [
      {
        id: `${up}-step-1`,
        labelFa: 'پله ۱ (محدوده فعلی ۷۲$)',
        dropPctFromCurrent: 0,
        targetPriceUsd: roundPriceSmart(safePx),
        weightPct: 35,
        enabled: true
      },
      {
        id: `${up}-step-2`,
        labelFa: 'پله ۲ (کف رنج ۶۷$)',
        dropPctFromCurrent: Number((((67 - safePx) / safePx) * 100).toFixed(1)),
        targetPriceUsd: 67,
        weightPct: 35,
        enabled: true
      },
      {
        id: `${up}-step-3`,
        labelFa: 'پله ۳ (شکار کف ۶۲$)',
        dropPctFromCurrent: Number((((62 - safePx) / safePx) * 100).toFixed(1)),
        targetPriceUsd: 62,
        weightPct: 30,
        enabled: true
      }
    ];
  }

  const weights: [number, number, number] = [35, 35, 30];
  const labels: [string, string, string] = [
    'پله ۱ (ورود اولیه)',
    'پله ۲ (حمایت اول)',
    'پله ۳ (حمایت عمیق‌تر)'
  ];

  return dropsPct.map((drop, idx) => {
    const targetPx = roundPriceSmart(safePx * (1 + drop / 100));
    return {
      id: `${up}-step-${idx + 1}`,
      labelFa: labels[idx],
      dropPctFromCurrent: drop,
      targetPriceUsd: targetPx,
      weightPct: weights[idx],
      enabled: true
    };
  });
}

/**
 * ایجاد یک آیتم دارایی جدید برای افزودن به سبد ماشین‌حساب
 */
export function createBasketAssetItem(
  symbol: string,
  livePrices: Record<string, number> = {},
  overrides?: Partial<BasketAssetItem>
): BasketAssetItem {
  const up = symbol.trim().toUpperCase();
  const preset = PRESET_BASKET_CANDIDATES.find((c) => c.symbol === up);
  const livePx = livePrices[up];
  const currentPriceUsd =
    overrides?.currentPriceUsd ??
    (typeof livePx === 'number' && Number.isFinite(livePx) && livePx > 0
      ? livePx
      : preset?.defaultPriceUsd ?? 100);

  const isEth = up === 'ETH';
  const defaultExistingQty = isEth ? ETH_POSITION.AMOUNT : 0;
  const defaultExistingAvg = isEth ? ETH_POSITION.BUY_PRICE : 0;

  const targetExitPriceUsd =
    overrides?.targetExitPriceUsd ??
    preset?.defaultTargetPriceUsd ??
    roundPriceSmart(currentPriceUsd * 1.45);

  return {
    id: overrides?.id ?? `basket-${up}-${Date.now()}`,
    symbol: up,
    nameFa: overrides?.nameFa ?? preset?.nameFa ?? up,
    category: overrides?.category ?? preset?.category ?? 'custom',
    enabled: overrides?.enabled ?? true,
    allocationPct: overrides?.allocationPct ?? preset?.defaultAllocationPct ?? 15,
    preferredStable: overrides?.preferredStable ?? preset?.preferredStable ?? 'USDC',
    currentPriceUsd,
    change24hPct: overrides?.change24hPct ?? 1.8,
    existingQuantity: overrides?.existingQuantity ?? defaultExistingQty,
    existingAvgCostUsd: overrides?.existingAvgCostUsd ?? defaultExistingAvg,
    targetExitPriceUsd,
    dcaSteps:
      overrides?.dcaSteps ??
      buildDefaultDcaStepsForPrice(up, currentPriceUsd, preset?.stepDropsPct ?? [0, -6, -12]),
    fundamentalNoteFa:
      overrides?.fundamentalNoteFa ??
      preset?.fundamentalNoteFa ??
      'دارایی اضافه‌شده توسط کاربر برای شبیه‌سازی پله‌های DCA و ارزیابی کمیته ایجنت‌ها.'
  };
}

/**
 * ساخت چیدمان پیش‌فرض سبد بر اساس درخواست و تایید کاربر:
 *   - موجودی استیبل‌کوین: ۱۷,۶۸۱ USDC و ۵,۰۰۰ USDT (جمعاً ۲۲,۶۸۱ دلار، با ۵,۶۸۱ دلار ذخیره و ۱۷,۰۰۰ دلار بودجه DCA)
 *   - چیدمان بهینه تاییدشده (includeBtcByDefault = true):
 *     * XAUT: ۵,۰۰۰ دلار (۲۹.۴۱٪ از ۱۷,۰۰۰ دلار بودجه خرید — از محل ۵,۰۰۰ USDT)
 *     * HYPE: ۳,۶۰۰ دلار (۲۱.۱۸٪ از ۱۷,۰۰۰ دلار — از محل USDC)
 *     * ETH: ۳,۶۰۰ دلار (۲۱.۱۸٪ از ۱۷,۰۰۰ دلار — از محل USDC + موجودی قبلی ۳.۳۳ واحد روی ۲,۸۲۰$)
 *     * BTC: ۲,۸۰۰ دلار (۱۶.۴۷٪ از ۱۷,۰۰۰ دلار — از محل USDC)
 *     * SOL: ۲,۰۰۰ دلار (۱۱.۷۶٪ از ۱۷,۰۰۰ دلار — از محل USDC)
 */
export function buildInitialUserBasket(
  livePrices: Record<string, number> = {},
  includeBtcByDefault = true
): BasketAssetItem[] {
  const hypePx = livePrices['HYPE'] && livePrices['HYPE'] > 0 ? livePrices['HYPE'] : 65.0;
  const ethPx = livePrices['ETH'] && livePrices['ETH'] > 0 ? livePrices['ETH'] : 1825.0;
  const solPx = livePrices['SOL'] && livePrices['SOL'] > 0 ? livePrices['SOL'] : 72.0;
  const xautPx = livePrices['XAUT'] && livePrices['XAUT'] > 0 ? livePrices['XAUT'] : 3822.0;
  const btcPx = livePrices['BTC'] && livePrices['BTC'] > 0 ? livePrices['BTC'] : 65260.0;

  if (includeBtcByDefault) {
    return [
      createBasketAssetItem('XAUT', livePrices, {
        id: 'basket-XAUT',
        currentPriceUsd: xautPx,
        allocationPct: 29.4118,
        preferredStable: 'USDT'
      }),
      createBasketAssetItem('HYPE', livePrices, {
        id: 'basket-HYPE',
        currentPriceUsd: hypePx,
        allocationPct: 21.1765,
        preferredStable: 'USDC'
      }),
      createBasketAssetItem('ETH', livePrices, {
        id: 'basket-ETH',
        currentPriceUsd: ethPx,
        allocationPct: 21.1765,
        preferredStable: 'USDC',
        existingQuantity: ETH_POSITION.AMOUNT,
        existingAvgCostUsd: ETH_POSITION.BUY_PRICE
      }),
      createBasketAssetItem('BTC', livePrices, {
        id: 'basket-BTC',
        currentPriceUsd: btcPx,
        allocationPct: 16.4706,
        preferredStable: 'USDC'
      }),
      createBasketAssetItem('SOL', livePrices, {
        id: 'basket-SOL',
        currentPriceUsd: solPx,
        allocationPct: 11.7647,
        preferredStable: 'USDC'
      })
    ];
  }

  return [
    createBasketAssetItem('XAUT', livePrices, {
      id: 'basket-XAUT',
      currentPriceUsd: xautPx,
      allocationPct: 29.4118,
      preferredStable: 'USDT'
    }),
    createBasketAssetItem('HYPE', livePrices, {
      id: 'basket-HYPE',
      currentPriceUsd: hypePx,
      allocationPct: 26.4706,
      preferredStable: 'USDC'
    }),
    createBasketAssetItem('ETH', livePrices, {
      id: 'basket-ETH',
      currentPriceUsd: ethPx,
      allocationPct: 26.4706,
      preferredStable: 'USDC',
      existingQuantity: ETH_POSITION.AMOUNT,
      existingAvgCostUsd: ETH_POSITION.BUY_PRICE
    }),
    createBasketAssetItem('SOL', livePrices, {
      id: 'basket-SOL',
      currentPriceUsd: solPx,
      allocationPct: 17.647,
      preferredStable: 'USDC'
    })
  ];
}

/**
 * اجرای کمیته ۴ مرحله‌ای ایجنت‌ها (TradingAgents) روی یک دارایی سبد
 */
export function evaluateAssetWithCommittee(params: {
  symbol: string;
  currentPriceUsd: number;
  change24hPct: number;
  allocatedBudgetUsd: number;
  existingValueUsd: number;
  analysisDateIso?: string;
}): AssetCommitteeEvaluation {
  const safePrice = Math.max(0.0001, params.currentPriceUsd);
  const candles = synthesizeFallbackCandles(safePrice, params.change24hPct, params.symbol, 210);
  const technical = computeTechnicalSnapshot(candles, 6)!;
  const indicators = buildIndicatorDiagnostics(technical);

  const bullIndicatorsCount = indicators.filter((r) => r.signal === 'bullish').length;
  const bearIndicatorsCount = indicators.filter((r) => r.signal === 'bearish').length;
  const neutralIndicatorsCount = indicators.filter((r) => r.signal === 'neutral').length;

  const isGold = params.symbol === 'XAUT' || params.symbol === 'PAXG';
  const isHype = params.symbol === 'HYPE';

  const committeeInput: CommitteeMarketInput = {
    coin: params.symbol,
    analysisDate: params.analysisDateIso ?? new Date().toISOString().slice(0, 10),
    researchDepth: 2,
    technical,
    derivatives: {
      fundingAprNow: isGold ? 2.5 : isHype ? 11.4 : 6.8,
      fundingAvg7dApr: isGold ? 2.1 : isHype ? 10.9 : 5.9,
      fundingPercentile30d: isGold ? 45 : 38,
      fundingRegime: 'normal',
      openInterestUsd: isHype ? 920_000_000 : isGold ? 85_000_000 : 1_450_000_000,
      volume24hUsd: isHype ? 1_475_000_000 : isGold ? 218_000_000 : 4_200_000_000,
      maxLeverage: isGold ? 10 : 20,
      worstCrash24hPct: isGold ? -4.8 : isHype ? -18.5 : -14.2,
      safeLeverage7d: 1
    },
    macroRegime: {
      state: 'on',
      btcAbove200: true,
      breadthPct: 54
    },
    portfolio: {
      cashUsd: Math.max(500, params.allocatedBudgetUsd),
      maxRiskPct: 1.5,
      currentHoldingUsd: params.existingValueUsd
    }
  };

  const baseline = buildDeterministicCommitteeBaseline(committeeInput);
  const report = buildDeterministicTradingAgentsReport(committeeInput);

  return {
    symbol: params.symbol,
    rating: report.riskDebate.portfolioDecision.rating,
    traderAction: report.traderProposal.action,
    sentimentBand: baseline.sentimentBand,
    sentimentScore: baseline.sentimentScore,
    bullIndicatorsCount,
    bearIndicatorsCount,
    neutralIndicatorsCount,
    atr14: technical.atr14,
    atrPct: technical.atrPct,
    atrStopLong: baseline.atrStopLong,
    atrTargetLong: baseline.atrTargetLong,
    rsi14: technical.rsi14,
    sma50: technical.close50Sma,
    sma200: technical.close200Sma,
    support20: technical.support20,
    resistance20: technical.resistance20,
    report,
    indicators,
    committeeInput
  };
}

/**
 * شبیه‌سازی کامل سبد دارایی، تخصیص USDC/USDT، پله‌های DCA میانگین خرید و ارزیابی کمیته ایجنت‌ها
 */
export function simulatePortfolioBasketDcaAndCommittee(params: {
  usdcBalanceUsd: number;
  usdtBalanceUsd: number;
  /** مبلغ ذخیره نقد (Dry Powder / دلتا نوترال) که وارد خرید اسپات نمی‌شود */
  reserveDryPowderUsd: number;
  items: readonly BasketAssetItem[];
  analysisDateIso?: string;
}): PortfolioBasketSimulationSummary {
  const safeUsdc = Math.max(0, params.usdcBalanceUsd);
  const safeUsdt = Math.max(0, params.usdtBalanceUsd);
  const totalStableBalanceUsd = Number((safeUsdc + safeUsdt).toFixed(2));
  const reserveDryPowderUsd = Math.min(totalStableBalanceUsd, Math.max(0, params.reserveDryPowderUsd));
  const reserveDryPowderPct =
    totalStableBalanceUsd > 0 ? Number(((reserveDryPowderUsd / totalStableBalanceUsd) * 100).toFixed(1)) : 0;

  const deployableDcaBudgetUsd = Number(Math.max(0, totalStableBalanceUsd - reserveDryPowderUsd).toFixed(2));

  const enabledItems = params.items.filter((i) => i.enabled);
  const rawWeightSum = enabledItems.reduce((acc, i) => acc + Math.max(0, i.allocationPct), 0);

  let remainingUsdt = Math.min(safeUsdt, deployableDcaBudgetUsd);
  let remainingUsdc = Math.max(0, deployableDcaBudgetUsd - remainingUsdt);

  const rows: ComputedBasketAssetRow[] = params.items.map((item) => {
    const normalizedWeightPct =
      item.enabled && rawWeightSum > 0
        ? Number(((Math.max(0, item.allocationPct) / rawWeightSum) * 100).toFixed(2))
        : 0;

    const allocatedBudgetUsd = item.enabled
      ? Number(Math.round((deployableDcaBudgetUsd * Math.max(0, item.allocationPct)) / (rawWeightSum || 1)).toFixed(2))
      : 0;

    let usdtShareUsd = 0;
    let usdcShareUsd = 0;
    if (allocatedBudgetUsd > 0) {
      if (item.preferredStable === 'USDT') {
        usdtShareUsd = Math.min(remainingUsdt, allocatedBudgetUsd);
        usdcShareUsd = Number((allocatedBudgetUsd - usdtShareUsd).toFixed(2));
        remainingUsdt = Math.max(0, remainingUsdt - usdtShareUsd);
        remainingUsdc = Math.max(0, remainingUsdc - usdcShareUsd);
      } else {
        usdcShareUsd = Math.min(remainingUsdc, allocatedBudgetUsd);
        usdtShareUsd = Number((allocatedBudgetUsd - usdcShareUsd).toFixed(2));
        remainingUsdc = Math.max(0, remainingUsdc - usdcShareUsd);
        remainingUsdt = Math.max(0, remainingUsdt - usdtShareUsd);
      }
    }

    const marketPx = Math.max(0.000001, item.currentPriceUsd);
    const existingQty = Math.max(0, item.existingQuantity);
    const existingAvg = Math.max(0, item.existingAvgCostUsd);
    const existingBasisUsd = Number((existingQty * existingAvg).toFixed(2));
    const existingMarketValueUsd = Number((existingQty * marketPx).toFixed(2));
    const existingUnrealizedPnlUsd = Number((existingMarketValueUsd - existingBasisUsd).toFixed(2));
    const existingUnrealizedPnlPct =
      existingBasisUsd > 0 ? Number(((existingUnrealizedPnlUsd / existingBasisUsd) * 100).toFixed(2)) : 0;

    const requiredBounceToBreakEvenBeforePct =
      existingQty > 0 && existingAvg > marketPx
        ? Number((((existingAvg - marketPx) / marketPx) * 100).toFixed(2))
        : 0;

    const activeSteps = item.dcaSteps.filter((s) => s.enabled && s.weightPct > 0);
    const stepWeightSum = activeSteps.reduce((acc, s) => acc + Math.max(0, s.weightPct), 0);

    let cumUnits = existingQty;
    let cumCostUsd = existingBasisUsd;
    let dcaAddedUnits = 0;
    let dcaAddedUsd = 0;

    const stepDetails: ComputedBasketStepDetail[] = activeSteps.map((step, idx) => {
      const stepShare = stepWeightSum > 0 ? Math.max(0, step.weightPct) / stepWeightSum : 0;
      const stepUsd = Number((allocatedBudgetUsd * stepShare).toFixed(2));
      const stepPx = Math.max(0.000001, step.targetPriceUsd > 0 ? step.targetPriceUsd : marketPx);
      const unitsBought = stepUsd / stepPx;

      dcaAddedUsd += stepUsd;
      dcaAddedUnits += unitsBought;
      cumUnits += unitsBought;
      cumCostUsd += stepUsd;

      const newCombinedAvgCostUsd = cumUnits > 0 ? cumCostUsd / cumUnits : stepPx;
      const newBuysOnlyAvgCostUsd = dcaAddedUnits > 0 ? dcaAddedUsd / dcaAddedUnits : stepPx;
      const dropFromMarketPct = ((stepPx - marketPx) / marketPx) * 100;
      const bounceToBreakEvenPct =
        newCombinedAvgCostUsd > stepPx ? ((newCombinedAvgCostUsd - stepPx) / stepPx) * 100 : 0;

      return {
        id: step.id,
        stepIndex: idx + 1,
        labelFa: step.labelFa,
        targetPriceUsd: Number(stepPx.toPrecision(6)),
        dropFromMarketPct: Number(dropFromMarketPct.toFixed(2)),
        allocatedUsd: stepUsd,
        unitsBought: Number(unitsBought.toFixed(6)),
        cumulativeUnits: Number(cumUnits.toFixed(6)),
        cumulativeCostUsd: Number(cumCostUsd.toFixed(2)),
        newCombinedAvgCostUsd: Number(newCombinedAvgCostUsd.toFixed(2)),
        newBuysOnlyAvgCostUsd: Number(newBuysOnlyAvgCostUsd.toFixed(2)),
        bounceToBreakEvenPct: Number(bounceToBreakEvenPct.toFixed(2))
      };
    });

    const dcaAverageEntryUsd =
      dcaAddedUnits > 0 ? Number((dcaAddedUsd / dcaAddedUnits).toFixed(2)) : marketPx;
    const totalQuantityAfterDca = Number(cumUnits.toFixed(6));
    const totalInvestedAfterDcaUsd = Number(cumCostUsd.toFixed(2));
    const combinedNewAvgCostUsd =
      totalQuantityAfterDca > 0
        ? Number((totalInvestedAfterDcaUsd / totalQuantityAfterDca).toFixed(2))
        : marketPx;

    const avgCostReductionUsd =
      existingQty > 0 && existingAvg > 0
        ? Number((existingAvg - combinedNewAvgCostUsd).toFixed(2))
        : Number((marketPx - combinedNewAvgCostUsd).toFixed(2));
    const avgCostReductionPct =
      existingQty > 0 && existingAvg > 0
        ? Number(((avgCostReductionUsd / existingAvg) * 100).toFixed(2))
        : Number((((marketPx - combinedNewAvgCostUsd) / marketPx) * 100).toFixed(2));

    const requiredBounceToBreakEvenAfterPct =
      combinedNewAvgCostUsd > marketPx
        ? Number((((combinedNewAvgCostUsd - marketPx) / marketPx) * 100).toFixed(2))
        : 0;

    const targetPx = item.targetExitPriceUsd > 0 ? item.targetExitPriceUsd : marketPx * 1.35;
    const projectedValueAtTargetUsd = Number((totalQuantityAfterDca * targetPx).toFixed(2));
    const projectedProfitAtTargetUsd = Number(
      (projectedValueAtTargetUsd - totalInvestedAfterDcaUsd).toFixed(2)
    );
    const projectedRoiAtTargetPct =
      totalInvestedAfterDcaUsd > 0
        ? Number(((projectedProfitAtTargetUsd / totalInvestedAfterDcaUsd) * 100).toFixed(2))
        : 0;

    const profitIfReachesOldAvgUsd =
      existingQty > 0 && existingAvg > 0
        ? Number((totalQuantityAfterDca * existingAvg - totalInvestedAfterDcaUsd).toFixed(2))
        : projectedProfitAtTargetUsd;

    const athInfo = getAssetAthAndRangeInfo({
      symbol: item.symbol,
      currentPrice: marketPx,
      source: 'crypto'
    });

    const committee = evaluateAssetWithCommittee({
      symbol: item.symbol,
      currentPriceUsd: marketPx,
      change24hPct: item.change24hPct,
      allocatedBudgetUsd: Math.max(500, allocatedBudgetUsd),
      existingValueUsd: existingMarketValueUsd,
      analysisDateIso: params.analysisDateIso
    });

    return {
      item,
      normalizedWeightPct,
      allocatedBudgetUsd,
      usdcShareUsd: Number(usdcShareUsd.toFixed(2)),
      usdtShareUsd: Number(usdtShareUsd.toFixed(2)),
      existingBasisUsd,
      existingMarketValueUsd,
      existingUnrealizedPnlUsd,
      existingUnrealizedPnlPct,
      dcaAddedUnits: Number(dcaAddedUnits.toFixed(6)),
      dcaAverageEntryUsd,
      totalQuantityAfterDca,
      totalInvestedAfterDcaUsd,
      combinedNewAvgCostUsd,
      avgCostReductionUsd,
      avgCostReductionPct,
      requiredBounceToBreakEvenBeforePct,
      requiredBounceToBreakEvenAfterPct,
      projectedValueAtTargetUsd,
      projectedProfitAtTargetUsd,
      projectedRoiAtTargetPct,
      profitIfReachesOldAvgUsd,
      stepDetails,
      athInfo,
      committee
    };
  });

  const activeRows = rows.filter((r) => r.item.enabled);
  const totalExistingBasisUsd = Number(
    activeRows.reduce((acc, r) => acc + r.existingBasisUsd, 0).toFixed(2)
  );
  const totalExistingMarketValueUsd = Number(
    activeRows.reduce((acc, r) => acc + r.existingMarketValueUsd, 0).toFixed(2)
  );
  const totalPortfolioAfterDcaCostUsd = Number(
    activeRows.reduce((acc, r) => acc + r.totalInvestedAfterDcaUsd, 0).toFixed(2)
  );
  const totalProjectedValueAtTargetsUsd = Number(
    activeRows.reduce((acc, r) => acc + r.projectedValueAtTargetUsd, 0).toFixed(2)
  );
  const totalProjectedProfitAtTargetsUsd = Number(
    (totalProjectedValueAtTargetsUsd - totalPortfolioAfterDcaCostUsd).toFixed(2)
  );
  const totalProjectedRoiPct =
    totalPortfolioAfterDcaCostUsd > 0
      ? Number(((totalProjectedProfitAtTargetsUsd / totalPortfolioAfterDcaCostUsd) * 100).toFixed(2))
      : 0;

  const weightedCommitteeScore =
    activeRows.length > 0
      ? Number(
          (
            activeRows.reduce(
              (acc, r) => acc + r.committee.sentimentScore * (r.normalizedWeightPct || 100 / activeRows.length),
              0
            ) / 100
          ).toFixed(1)
        )
      : 5.0;

  const advisories: BasketAuditAdvisory[] = [];
  const symbolsSet = new Set(activeRows.map((r) => r.item.symbol.toUpperCase()));

  if (symbolsSet.has('XAUT') && symbolsSet.has('PAXG')) {
    advisories.push({
      id: 'duplicate-gold',
      tone: 'warn',
      titleFa: 'حذف یکی از دو توکن طلا (نگه‌داشتن XAUT و حذف PAXG)',
      bodyFa:
        'در سبد فعلی هم XAUT و هم PAXG فعال هستند که هر دو قیمت ۱ انس طلا را دنبال می‌کنند. با توجه به داشتن ۵,۰۰۰ واحد تتر (USDT) و جفت‌ارز مستقیم XAUT/USDT، پیشنهاد کمیته حذف PAXG و متمرکز کردن سهم طلا روی XAUT است.',
      actionType: 'remove_duplicate_gold'
    });
  } else if (symbolsSet.has('PAXG') && !symbolsSet.has('XAUT') && safeUsdt >= 1000) {
    advisories.push({
      id: 'switch-paxg-to-xaut',
      tone: 'info',
      titleFa: 'پیشنهاد جایگزینی PAXG با XAUT برای ۵,۰۰۰ تتر شما',
      bodyFa:
        'از آنجا که ۵,۰۰۰ دلار از سرمایه شما به صورت USDT است، تبدیل پله‌ای تتر به XAUT کارمزد سواپ کمتری دارد و نقدشوندگی بالاتری در جفت XAUT/USDT فراهم می‌کند.',
      actionType: 'prefer_xaut_for_usdt'
    });
  }

  if (!symbolsSet.has('BTC') && (symbolsSet.has('HYPE') || symbolsSet.has('SOL'))) {
    advisories.push({
      id: 'missing-btc-anchor',
      tone: 'info',
      titleFa: 'تعدیل بتای سبد: افزودن بیت‌کوین (BTC) در کنار HYPE و SOL',
      bodyFa:
        'نگه‌داشتن هم‌زمان HYPE و SOL بدون بیت‌کوین، بخش کریپتویی سبد را صددرصد در معرض نوسان آلت‌کوین‌ها قرار می‌دهد. کاستن بخشی از وزن SOL و افزودن BTC در محدوده ۶۵,۰۰۰ دلار پایداری سبد را به شکل چشمگیری بالا می‌برد.',
      actionType: 'add_btc_anchor'
    });
  }

  if (reserveDryPowderPct < 15 && totalStableBalanceUsd >= 10000) {
    advisories.push({
      id: 'low-dry-powder',
      tone: 'warn',
      titleFa: 'حفظ حداقل ۲۵٪ ذخیره نقدینگی استیبل‌کوین (Dry Powder)',
      bodyFa:
        'ورود ۱۰۰٪ از ۲۲,۶۸۱ دلار استیبل‌کوین به پوزیشن‌های جهت‌دار اسپات ریسک نقدینگی را بالا می‌برد. پیشنهاد کمیته ریسک این است که ۵,۶۸۱ دلار USDC را به عنوان ذخیره نقد / دلتا نوترال نگه دارید و ۱۷,۰۰۰ دلار را در ۳ پله DCA وارد کنید.',
      actionType: 'keep_dry_powder'
    });
  } else {
    advisories.push({
      id: 'healthy-structure',
      tone: 'gain',
      titleFa: 'ساختار متوازن: ترکیب رشد نقدجریان (HYPE)، کاهش میانگین (ETH)، لنگر BTC و پوشش طلا (XAUT)',
      bodyFa:
        `حفظ ${reserveDryPowderUsd.toLocaleString('en-US')} دلار (${reserveDryPowderPct}٪) ذخیره نقدینگی در کنار خرید ۳ پله‌ای DCA، ریسک ریزش بیشتر بازار را مهار می‌کند و میانگین خرید اتریوم شما را از ۲,۸۲۰ دلار به محدوده بسیار نزدیک‌تر به قیمت روز می‌آورد.`
    });
  }

  const overallVerdictFa =
    weightedCommitteeScore >= 5.6
      ? 'تأیید کمیته: ورود پله‌ای (DCA ۳ مرحله‌ای) با حفظ ذخیره نقدینگی'
      : 'احتیاط کمیته: اولویت با پله‌های لیمیت پایین‌تر (پرهیز از خرید یکجای مارکت)';

  return {
    usdcBalanceUsd: safeUsdc,
    usdtBalanceUsd: safeUsdt,
    totalStableBalanceUsd,
    reserveDryPowderUsd,
    reserveDryPowderPct,
    deployableDcaBudgetUsd,
    deployableUsdcUsd: Number(Math.max(0, safeUsdc - reserveDryPowderUsd).toFixed(2)),
    deployableUsdtUsd: safeUsdt,
    totalExistingBasisUsd,
    totalExistingMarketValueUsd,
    totalPortfolioAfterDcaCostUsd,
    totalProjectedValueAtTargetsUsd,
    totalProjectedProfitAtTargetsUsd,
    totalProjectedRoiPct,
    weightedCommitteeScore,
    overallVerdictFa,
    rows,
    advisories
  };
}

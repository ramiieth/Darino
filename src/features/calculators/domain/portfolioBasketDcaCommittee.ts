/**
 * موتور دامنه «سبد دارایی، میانگین خرید پله‌ای (DCA)، آزمون استرس بدترین سناریوها و کمیته ایجنت‌ها»
 *
 * قابلیت‌های کلیدی:
 *   ۱) اتصال مستقیم به موجودی زندهٔ کیف پول و خریدهای جدید (USDC، USDT، سایر استیبل‌کوین‌ها و میانگین خرید فعلی هر ارز)
 *   ۲) قفل کردن خودکار «ذخیره هزینه‌های زندگی» (پیش‌فرض ۵,۰۰۰ تتر USDT — خارج از DCA و دست‌نخورده)
 *   ۳) طراحی پله‌های DCA باقی‌ماندهٔ استیبل‌کوین‌ها در ۳ رژیم:
 *      - ریزش شدید از همین نقطه (-۱۰٪ تا -۵۰٪ با وزن سنگین‌تر در کف‌ها)
 *      - ۲ سال بازار رنج و فرسایشی (تقسیم ۲۴ ماههٔ بودجه برای بقا در رکود طولانی)
 *      - پله‌ای متعادل (۳ پله استاندارد)
 *   ۴) آزمون استرس ۴ سناریو (ریزش -۴۵٪، ۲ سال رنج ۲۴ ماهه، زمستان عمیق -۶۵٪، و بازگشت تا اهداف)
 *   ۵) اجرای کمیته ۴ مرحله‌ای ایجنت‌ها (TradingAgents) روی تک‌تک دارایی‌های سبد
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
export type DcaStressRegime = 'severe_crash' | 'two_year_range' | 'standard';

export const DEFAULT_LIVING_RESERVE_USDT = 5000;

const STABLE_SET = new Set([
  'USD', 'USDC', 'USDT', 'DAI', 'USDE', 'FDUSD', 'TUSD', 'USDS', 'PYUSD', 'FRAX', 'BUSD', 'USDD', 'EURC', 'LUSD', 'GHO'
]);

const SYMBOL_MAP: Record<string, string> = {
  WETH: 'ETH',
  STETH: 'ETH',
  WSTETH: 'ETH',
  CBETH: 'ETH',
  RETH: 'ETH',
  WBTC: 'BTC',
  CBBTC: 'BTC',
  TBTC: 'BTC',
  WSOL: 'SOL',
  JITOSOL: 'SOL',
  MSOL: 'SOL'
};

const normalizeSym = (raw: string): string => {
  const up = raw.trim().toUpperCase().replace(/[-/_].*$/, '');
  return SYMBOL_MAP[up] ?? up;
};

export interface BasketDcaStep {
  id: string;
  labelFa: string;
  /** درصد افت نسبت به قیمت فعلی (مثلاً 0 برای پله اول، -10 برای پله دوم، -50 برای پله چهارم) */
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
  /** تغییر ۲۴ ساعته (درصد) */
  change24hPct: number;
  /** موجودی قبلی کاربر در کیف پول/داشبورد */
  existingQuantity: number;
  /** میانگین قیمت خرید قبلی کاربر */
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
  cumulativeUnits: number;
  cumulativeCostUsd: number;
  newCombinedAvgCostUsd: number;
  newBuysOnlyAvgCostUsd: number;
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

export interface StressScenarioOutcome {
  id: 'severe_crash' | 'two_year_range' | 'deep_winter' | 'recovery_target';
  titleFa: string;
  subtitleFa: string;
  tone: 'loss' | 'warn' | 'info' | 'gain';
  cryptoShockPct: number;
  goldShockPct: number;
  horizonMonths: number;
  deployedDcaUsd: number;
  monthlyDcaUsd: number | null;
  untouchedLivingReserveUsd: number;
  untouchedDryPowderUsd: number;
  totalInvestedUsd: number;
  portfolioValueAtEndUsd: number;
  netPnlUsd: number;
  netPnlPct: number;
  avgCostVsLumpSumBenefitPct: number;
  survivalVerdictFa: string;
}

export interface PortfolioBasketSimulationSummary {
  usdcBalanceUsd: number;
  usdtBalanceUsd: number;
  totalStableBalanceUsd: number;
  /** مبلغ قفل‌شده برای هزینه‌های زندگی (پیش‌فرض ۵,۰۰۰ تتر — هرگز وارد DCA نمی‌شود) */
  livingReserveUsd: number;
  /** کل استیبل‌کوین‌های باقی‌مانده پس از کسر ذخیره هزینه‌های زندگی */
  investableStableUsd: number;
  /** ذخیره نقدینگی اضطراری سرمایه‌گذاری (جدا از هزینه‌های زندگی) */
  reserveDryPowderUsd: number;
  reserveDryPowderPct: number;
  deployableDcaBudgetUsd: number;
  deployableUsdcUsd: number;
  deployableUsdtUsd: number;
  /** بودجه دقیق ماهانه در صورت اجرای برنامه ۲ ساله (۲۴ ماه رنج) */
  monthlyDca24mUsd: number;
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
  stressScenarios: StressScenarioOutcome[];
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

export const GOLD_TOKEN_COMPARISON: readonly GoldTokenComparisonItem[] = [
  {
    symbol: 'XAUT',
    nameFa: 'تتر گلد (Tether Gold)',
    issuerFa: 'TG Commodities (مجموعه Tether)',
    regulatorFa: 'چارچوب دارایی دیجیتال CNAD',
    auditorFa: 'BDO Italia (گزارش دوره‌ای شمش‌های سریال‌دار)',
    vaultLocationFa: 'خزانه‌های امن سوئیس (استاندارد LBMA)',
    mintRedeemFeePct: '۰.۲۵٪ در صدور/بازخرید مستقیم (۰٪ کارمزد نگهداری سالانه)',
    liquidityAdvantageFa: 'نقدشوندگی بالاتر در بازارهای جهانی و جفت‌ارز عمیق روی USDT و صرافی‌های دیفای',
    bestStablePair: 'USDT',
    recommendedForUser: true,
    summaryFa:
      'نقدشوندگی بالاتر و کارمزد نگهداری سالانه صفر؛ به عنوان لنگر تدافعی سبد در ریزش‌های سنگین و بازارهای رنج ۲ ساله.'
  },
  {
    symbol: 'PAXG',
    nameFa: 'پکس گلد (PAX Gold)',
    issuerFa: 'Paxos Trust Company',
    regulatorFa: 'نهاد نظارتی ایالت نیویورک (NYDFS)',
    auditorFa: 'KPMG (گواهی حسابرسی ماهانه)',
    vaultLocationFa: 'خزانه‌های Brink’s در لندن (LBMA)',
    mintRedeemFeePct: '۰.۰۲٪ تا ۱٪ پلکانی (۰٪ کارمزد نگهداری سالانه)',
    liquidityAdvantageFa: 'مناسب جفت‌ارزهای USDC (چون ۵,۰۰۰ USDT برای هزینه‌های زندگی کنار گذاشته شده است)',
    bestStablePair: 'USDC',
    recommendedForUser: false,
    summaryFa:
      'اگر بودجهٔ خرید شما عمدتاً USDC باشد و گواهی حسابرسی ماهانه KPMG برایتان اولویت دارد، PAXG گزینهٔ تمیزی است؛ فقط یکی از دو توکن طلا را در سبد نگه دارید.'
  }
];

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
      'درآمد واقعی بالا از کارمزد معاملات و بازخرید مستمر توکن؛ مناسب ورود پله‌ای روی اصلاح‌های عمیق.'
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
      'کاهش میانگین خرید پوزیشن فعلی کیف پول شما؛ در ریزش‌های سنگین، پله‌های پایین‌تر بیشترین اثر را روی پایین آوردن نقطه سربه‌سر دارند.'
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
      'لنگر تدافعی و ضدتورمی سبد در ریزش‌های شدید کریپتو و بازارهای رنج ۲ ساله.'
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
      'ستون فقرات کلان بازار؛ در سناریوی ریزش سنگین یا ۲ سال رنج، بیشترین مقاومت و سریع‌ترین بازیابی را بین رمزارزها دارد.'
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
      'بتای بالا و درآمد کارمزد قوی شبکه؛ مناسب شکار کف پله‌ای با وزن کنترل‌شده.'
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
      'طلای توکنایز با گواهی حسابرسی ماهانه KPMG؛ مناسب خرید مستقیم با USDC (در کنار XAUT تکراری است).'
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
    fundamentalNoteFa: 'بلاک‌چین لایه اول Move با بتای بالا؛ مناسب سهم کوچک.'
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
    fundamentalNoteFa: 'بزرگ‌ترین پروتکل وام‌دهی غیرمتمرکز دیفای با درآمد پایدار.'
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
    fundamentalNoteFa: 'زیرساخت اوراکل و استاندارد CCIP برای دارایی‌های توکنایزشده.'
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
    fundamentalNoteFa: 'پروتکل توکنایز سود ثابت (PT/YT) برای استراتژی‌های درآمد ثابت.'
  }
];

function roundPriceSmart(px: number): number {
  if (!Number.isFinite(px) || px <= 0) return 0;
  if (px >= 1000) return Math.round(px);
  if (px >= 10) return Number(px.toFixed(2));
  if (px >= 1) return Number(px.toFixed(3));
  return Number(px.toPrecision(4));
}

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
 * ساخت پله‌های DCA متناسب با رژیم انتخابی کاربر:
 *   - severe_crash: ۴ پلهٔ تدافعی تا -۵۰٪ (وزن سنگین‌تر در کف‌ها: ۱۵/۲۰/۳۰/۳۵٪) برای ریزش شدید بازار
 *   - two_year_range: ۴ پلهٔ مساوی داخل رنج ۲۴ ماهه (۰٪ تا -۳۰٪) برای انباشت فرسایشی ۲ ساله
 *   - standard: ۳ پلهٔ استاندارد متعادل
 */
export function buildStepsForStressRegime(
  symbol: string,
  currentPriceUsd: number,
  regime: DcaStressRegime
): BasketDcaStep[] {
  const safePx = currentPriceUsd > 0 ? currentPriceUsd : 100;
  const up = symbol.toUpperCase();
  const isGold = up === 'XAUT' || up === 'PAXG';

  if (regime === 'standard') {
    const preset = PRESET_BASKET_CANDIDATES.find((c) => c.symbol === up);
    return buildDefaultDcaStepsForPrice(up, safePx, preset?.stepDropsPct ?? [0, -6, -12]);
  }

  if (regime === 'severe_crash') {
    const drops = isGold ? [-4, -8, -13, -18] : [-10, -22, -35, -50];
    const weights = [15, 20, 30, 35];
    const labels = [
      'پله ۱ (اصلاح اول)',
      'پله ۲ (ریزش میانی)',
      'پله ۳ (ترس شدید بازار)',
      'پله ۴ (شکار کف بحران)'
    ];
    return drops.map((drop, idx) => ({
      id: `${up}-crash-${idx + 1}`,
      labelFa: labels[idx],
      dropPctFromCurrent: drop,
      targetPriceUsd: roundPriceSmart(safePx * (1 + drop / 100)),
      weightPct: weights[idx],
      enabled: true
    }));
  }

  // two_year_range: ۲۴ ماه بازار رنج و فرسایشی
  const drops = isGold ? [0, -4, -8, -12] : [0, -10, -20, -30];
  const weights = [25, 25, 25, 25];
  const labels = [
    'فصل ۱–۲ (میانهٔ رنج)',
    'فصل ۳–۴ (کف اول رنج)',
    'فصل ۵–۶ (کف میانی رنج)',
    'فصل ۷–۸ (کف فرسایشی)'
  ];
  return drops.map((drop, idx) => ({
    id: `${up}-range-${idx + 1}`,
    labelFa: labels[idx],
    dropPctFromCurrent: drop,
    targetPriceUsd: roundPriceSmart(safePx * (1 + drop / 100)),
    weightPct: weights[idx],
    enabled: true
  }));
}

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
      'دارایی اضافه‌شده برای شبیه‌سازی پله‌های DCA و ارزیابی کمیته ایجنت‌ها.'
  };
}

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

export interface WalletSyncInputRow {
  symbol: string;
  currentQuantity: number;
  avgCostUsd: number | null;
  currentPriceUsd: number | null;
  currentValueUsd: number;
  costBasisUsd?: number | null;
}

/**
 * همگام‌سازی خودکار سبد با موجودی واقعی کیف پول و خریدهای اخیر کاربر:
 *   • تفکیک دقیق USDC، USDT و سایر استیبل‌کوین‌ها
 *   • انتقال دقیق تعداد و میانگین خرید فعلی هر دارایی (مثل ETH، BTC، SOL، HYPE، XAUT/PAXG)
 *   • تنظیم پله‌های DCA بر اساس رژیم انتخابی (ریزش شدید / ۲ سال رنج / متعادل)
 */
export function buildWalletSyncedBasket(params: {
  rows: readonly WalletSyncInputRow[];
  livePrices: Record<string, number>;
  regime: DcaStressRegime;
}): {
  items: BasketAssetItem[];
  usdcBalanceUsd: number;
  usdtBalanceUsd: number;
  otherStableUsd: number;
  totalStableUsd: number;
  syncedHoldingsCount: number;
} {
  let usdcBalanceUsd = 0;
  let usdtBalanceUsd = 0;
  let otherStableUsd = 0;

  const heldMap = new Map<
    string,
    { qty: number; basisSum: number; hasBasis: boolean; valueUsd: number; priceUsd: number }
  >();

  for (const r of params.rows) {
    const sym = normalizeSym(r.symbol);
    if (STABLE_SET.has(sym)) {
      if (r.currentValueUsd > 0) {
        if (sym === 'USDC') usdcBalanceUsd += r.currentValueUsd;
        else if (sym === 'USDT') usdtBalanceUsd += r.currentValueUsd;
        else otherStableUsd += r.currentValueUsd;
      }
      continue;
    }
    if (r.currentQuantity <= 0 || r.currentValueUsd < 1) continue;
    const prev = heldMap.get(sym) ?? { qty: 0, basisSum: 0, hasBasis: false, valueUsd: 0, priceUsd: 0 };
    const basisAdd =
      r.costBasisUsd !== null && r.costBasisUsd !== undefined && r.costBasisUsd > 0
        ? r.costBasisUsd
        : r.avgCostUsd !== null && r.avgCostUsd > 0
          ? r.avgCostUsd * r.currentQuantity
          : 0;
    heldMap.set(sym, {
      qty: prev.qty + r.currentQuantity,
      basisSum: prev.basisSum + basisAdd,
      hasBasis: prev.hasBasis || basisAdd > 0,
      valueUsd: prev.valueUsd + r.currentValueUsd,
      priceUsd: r.currentPriceUsd && r.currentPriceUsd > 0 ? r.currentPriceUsd : prev.priceUsd
    });
  }

  const coreWeights: Record<string, number> = {
    BTC: 30,
    ETH: 25,
    XAUT: 20,
    HYPE: 15,
    SOL: 10
  };

  // اگر کاربر در کیف پولش PAXG دارد ولی XAUT ندارد، به جای XAUT از PAXG استفاده می‌کنیم تا تکراری نشود
  const symbolsOrder = ['BTC', 'ETH', heldMap.has('PAXG') && !heldMap.has('XAUT') ? 'PAXG' : 'XAUT', 'HYPE', 'SOL'];
  for (const sym of heldMap.keys()) {
    if (!symbolsOrder.includes(sym) && heldMap.get(sym)!.valueUsd >= 25) {
      symbolsOrder.push(sym);
    }
  }

  const items: BasketAssetItem[] = symbolsOrder.map((sym) => {
    const held = heldMap.get(sym);
    const livePx =
      (held?.priceUsd && held.priceUsd > 0 ? held.priceUsd : undefined) ??
      (params.livePrices[sym] && params.livePrices[sym] > 0 ? params.livePrices[sym] : undefined);
    const preset = PRESET_BASKET_CANDIDATES.find((c) => c.symbol === sym);
    const price = livePx ?? preset?.defaultPriceUsd ?? 100;
    const existingQty = held ? Number(held.qty.toFixed(6)) : 0;
    const existingAvg =
      held && held.hasBasis && held.qty > 0 ? Number((held.basisSum / held.qty).toFixed(2)) : 0;

    return createBasketAssetItem(sym, params.livePrices, {
      id: `basket-${sym}`,
      currentPriceUsd: price,
      allocationPct: coreWeights[sym] ?? (sym === 'PAXG' ? 20 : 10),
      // چون ۵,۰۰۰ تتر برای هزینه زندگی قفل است، اولویت خرید با USDC باقی‌مانده است
      preferredStable: 'USDC',
      existingQuantity: existingQty,
      existingAvgCostUsd: existingAvg,
      dcaSteps: buildStepsForStressRegime(sym, price, params.regime)
    });
  });

  const roundedUsdc = Math.round((usdcBalanceUsd + otherStableUsd) * 100) / 100;
  const roundedUsdt = Math.round(usdtBalanceUsd * 100) / 100;

  return {
    items,
    usdcBalanceUsd: roundedUsdc,
    usdtBalanceUsd: roundedUsdt,
    otherStableUsd: Math.round(otherStableUsd * 100) / 100,
    totalStableUsd: Math.round((roundedUsdc + roundedUsdt) * 100) / 100,
    syncedHoldingsCount: heldMap.size
  };
}

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
 * موتور آزمون استرس ۴ سناریو (ریزش شدید -۴۵٪، ۲ سال رنج فرسایشی، زمستان عمیق -۶۵٪، بازگشت تا هدف)
 * با تضمین ۱۰۰٪ دست‌نخورده ماندن ذخیره هزینه‌های زندگی (۵,۰۰۰ تتر).
 */
export function computeWorstCaseStressScenarios(params: {
  rows: readonly ComputedBasketAssetRow[];
  deployableDcaBudgetUsd: number;
  livingReserveUsd: number;
  reserveDryPowderUsd: number;
}): StressScenarioOutcome[] {
  const active = params.rows.filter((r) => r.item.enabled);
  const totalExistingBasis = active.reduce((s, r) => s + r.existingBasisUsd, 0);

  const simulateCrash = (
    id: 'severe_crash' | 'deep_winter',
    titleFa: string,
    subtitleFa: string,
    cryptoShockPct: number,
    goldShockPct: number,
    horizonMonths: number
  ): StressScenarioOutcome => {
    let deployed = 0;
    let endValue = 0;
    let lumpSumUnitsVal = 0;
    let dcaUnitsVal = 0;

    for (const r of active) {
      const isGold = r.item.category === 'gold' || r.item.symbol === 'XAUT' || r.item.symbol === 'PAXG';
      const shock = isGold ? goldShockPct : cryptoShockPct;
      const endPx = Math.max(0.0001, r.item.currentPriceUsd * (1 + shock / 100));

      // فقط پله‌هایی پر می‌شوند که قیمتشان بالاتر یا مساوی کف ریزش باشد
      let addedUnits = 0;
      let addedUsd = 0;
      for (const st of r.stepDetails) {
        if (st.targetPriceUsd >= endPx * 0.999) {
          addedUnits += st.unitsBought;
          addedUsd += st.allocatedUsd;
        }
      }
      deployed += addedUsd;
      endValue += (r.item.existingQuantity + addedUnits) * endPx;
      dcaUnitsVal += addedUnits * endPx;
      lumpSumUnitsVal += (addedUsd / Math.max(0.0001, r.item.currentPriceUsd)) * endPx;
    }

    const totalInvested = totalExistingBasis + deployed;
    const unspentFromDca = Math.max(0, params.deployableDcaBudgetUsd - deployed);
    const totalDryPowderLeft = params.reserveDryPowderUsd + unspentFromDca;
    const netPnlUsd = endValue - totalInvested;
    const netPnlPct = totalInvested > 0 ? (netPnlUsd / totalInvested) * 100 : 0;
    const benefitPct =
      lumpSumUnitsVal > 0 ? Math.max(0, ((dcaUnitsVal - lumpSumUnitsVal) / lumpSumUnitsVal) * 100) : 0;

    return {
      id,
      titleFa,
      subtitleFa,
      tone: id === 'deep_winter' ? 'loss' : 'warn',
      cryptoShockPct,
      goldShockPct,
      horizonMonths,
      deployedDcaUsd: Math.round(deployed),
      monthlyDcaUsd: null,
      untouchedLivingReserveUsd: Math.round(params.livingReserveUsd),
      untouchedDryPowderUsd: Math.round(totalDryPowderLeft),
      totalInvestedUsd: Math.round(totalInvested),
      portfolioValueAtEndUsd: Math.round(endValue),
      netPnlUsd: Math.round(netPnlUsd),
      netPnlPct: Number(netPnlPct.toFixed(1)),
      avgCostVsLumpSumBenefitPct: Number(benefitPct.toFixed(1)),
      survivalVerdictFa:
        params.livingReserveUsd > 0
          ? '۵,۰۰۰ تتر زندگی کاملاً امن و دست‌نخورده می‌ماند؛ نقدینگی پله‌های عمیق بدون فروش اجباری شما را زنده نگه می‌دارد.'
          : 'پله‌های عمیق، میانگین خرید شما را نسبت به خرید یکجا به شکل محسوسی پایین می‌آورد.'
    };
  };

  // سناریوی ۲ سال بازار رنج و فرسایشی (۲۴ ماه نوسان بدون روند صعودی: میانگین ورود در رنج حدود -۱۲٪ پایین‌تر از امروز، قیمت پایان ماه ۲۴ نزدیک -۵٪ امروز)
  const monthly24 = params.deployableDcaBudgetUsd / 24;
  let rangeEndVal = 0;
  let rangeLumpVal = 0;
  let rangeDcaVal = 0;
  for (const r of active) {
    const isGold = r.item.category === 'gold' || r.item.symbol === 'XAUT' || r.item.symbol === 'PAXG';
    const avgFillFactor = isGold ? 0.96 : 0.86; // میانگین پر شدن خریدهای ۲۴ ماهه داخل رنج
    const endPx = r.item.currentPriceUsd * (isGold ? 1.06 : 0.95);
    const dcaUnits = r.allocatedBudgetUsd / Math.max(0.0001, r.item.currentPriceUsd * avgFillFactor);
    rangeEndVal += (r.item.existingQuantity + dcaUnits) * endPx;
    rangeDcaVal += dcaUnits * endPx;
    rangeLumpVal += (r.allocatedBudgetUsd / Math.max(0.0001, r.item.currentPriceUsd)) * endPx;
  }
  const rangeInvested = totalExistingBasis + params.deployableDcaBudgetUsd;
  const rangePnl = rangeEndVal - rangeInvested;
  const rangeBenefit = rangeLumpVal > 0 ? Math.max(0, ((rangeDcaVal - rangeLumpVal) / rangeLumpVal) * 100) : 0;

  const twoYearRangeScenario: StressScenarioOutcome = {
    id: 'two_year_range',
    titleFa: '۲ سال بازار رنج و فرسایشی (۲۴ ماه)',
    subtitleFa: 'نوسان خسته کننده بین ۰٪ تا -۳۰٪ بدون روند صعودی برای ۲۴ ماه',
    tone: 'info',
    cryptoShockPct: -5,
    goldShockPct: 6,
    horizonMonths: 24,
    deployedDcaUsd: Math.round(params.deployableDcaBudgetUsd),
    monthlyDcaUsd: Math.round(monthly24),
    untouchedLivingReserveUsd: Math.round(params.livingReserveUsd),
    untouchedDryPowderUsd: Math.round(params.reserveDryPowderUsd),
    totalInvestedUsd: Math.round(rangeInvested),
    portfolioValueAtEndUsd: Math.round(rangeEndVal),
    netPnlUsd: Math.round(rangePnl),
    netPnlPct: rangeInvested > 0 ? Number(((rangePnl / rangeInvested) * 100).toFixed(1)) : 0,
    avgCostVsLumpSumBenefitPct: Number(rangeBenefit.toFixed(1)),
    survivalVerdictFa:
      monthly24 > 0
        ? `با خرید آرام ماهانه ${Math.round(monthly24).toLocaleString('en-US')} دلار طی ۲۴ ماه، بدون دست زدن به پول زندگی، کل رنج را با میانگین پایین جمع می‌کنید.`
        : 'بودجهٔ مازاد برای تقسیم ۲۴ ماهه صفر است؛ ابتدا موجودی استیبل‌کوین مازاد بر هزینهٔ زندگی را مشخص کنید.'
  };

  // سناریوی بازگشت به اهداف قیمتی
  const recoveryInvested = active.reduce((s, r) => s + r.totalInvestedAfterDcaUsd, 0);
  const recoveryEndVal = active.reduce((s, r) => s + r.projectedValueAtTargetUsd, 0);
  const recoveryPnl = recoveryEndVal - recoveryInvested;
  const recoveryScenario: StressScenarioOutcome = {
    id: 'recovery_target',
    titleFa: 'بازگشت بازار تا اهداف میان‌مدت',
    subtitleFa: 'پاداش صبر و خرید پله‌ای پس از پایان ریزش یا خروج از رنج ۲ ساله',
    tone: 'gain',
    cryptoShockPct: 45,
    goldShockPct: 20,
    horizonMonths: 18,
    deployedDcaUsd: Math.round(params.deployableDcaBudgetUsd),
    monthlyDcaUsd: null,
    untouchedLivingReserveUsd: Math.round(params.livingReserveUsd),
    untouchedDryPowderUsd: Math.round(params.reserveDryPowderUsd),
    totalInvestedUsd: Math.round(recoveryInvested),
    portfolioValueAtEndUsd: Math.round(recoveryEndVal),
    netPnlUsd: Math.round(recoveryPnl),
    netPnlPct: recoveryInvested > 0 ? Number(((recoveryPnl / recoveryInvested) * 100).toFixed(1)) : 0,
    avgCostVsLumpSumBenefitPct: 0,
    survivalVerdictFa: 'به دلیل کاهش میانگین خرید در پله‌های پایین، سبد شما خیلی زودتر از خرید یکجا به سود خالص می‌رسد.'
  };

  return [
    simulateCrash(
      'severe_crash',
      'ریزش شدید از همین‌جا (-۴۵٪)',
      'سقوط سنگین کریپتو (-۴۵٪) و اصلاح طلا (-۱۲٪) طی ۳ تا ۶ ماه',
      -45,
      -12,
      6
    ),
    twoYearRangeScenario,
    simulateCrash(
      'deep_winter',
      'زمستان عمیق / بدترین حالت (-۶۵٪)',
      'بحران نقدینگی شدید (-۶۵٪ کریپتو، -۱۸٪ طلا) طی ۱۲ ماه',
      -65,
      -18,
      12
    ),
    recoveryScenario
  ];
}

/**
 * شبیه‌سازی کامل سبد دارایی، قفل ذخیره هزینه‌های زندگی، پله‌های DCA، آزمون استرس و ارزیابی کمیته ایجنت‌ها
 */
export function simulatePortfolioBasketDcaAndCommittee(params: {
  usdcBalanceUsd: number;
  usdtBalanceUsd: number;
  /** مبلغ قفل‌شده برای هزینه‌های زندگی (خارج از DCA — پیش‌فرض ۰ در حالت سازگار با قبل، ۵,۰۰۰ در رابط جدید) */
  livingReserveUsd?: number;
  /** مبلغ ذخیره نقدینگی اضطراری سرمایه‌گذاری (Dry Powder جدا از هزینه زندگی) */
  reserveDryPowderUsd: number;
  items: readonly BasketAssetItem[];
  analysisDateIso?: string;
}): PortfolioBasketSimulationSummary {
  const safeUsdc = Math.max(0, params.usdcBalanceUsd);
  const safeUsdt = Math.max(0, params.usdtBalanceUsd);
  const totalStableBalanceUsd = Number((safeUsdc + safeUsdt).toFixed(2));

  // اولویت ۱: کنار گذاشتن ذخیره هزینه‌های زندگی (ابتدا از USDT، و اگر USDT کم بود از USDC)
  const livingReserveUsd = Math.min(totalStableBalanceUsd, Math.max(0, params.livingReserveUsd ?? 0));
  const livingFromUsdt = Math.min(safeUsdt, livingReserveUsd);
  const livingFromUsdc = Math.max(0, livingReserveUsd - livingFromUsdt);

  const freeUsdtAfterLiving = Math.max(0, safeUsdt - livingFromUsdt);
  const freeUsdcAfterLiving = Math.max(0, safeUsdc - livingFromUsdc);
  const investableStableUsd = Number((freeUsdcAfterLiving + freeUsdtAfterLiving).toFixed(2));

  // اولویت ۲: ذخیره اضطراری سرمایه‌گذاری (Dry Powder) از باقی‌ماندهٔ استیبل‌کوین‌ها
  const reserveDryPowderUsd = Math.min(investableStableUsd, Math.max(0, params.reserveDryPowderUsd));
  const reserveDryPowderPct =
    totalStableBalanceUsd > 0 ? Number(((reserveDryPowderUsd / totalStableBalanceUsd) * 100).toFixed(1)) : 0;

  const deployableDcaBudgetUsd = Number(Math.max(0, investableStableUsd - reserveDryPowderUsd).toFixed(2));
  const monthlyDca24mUsd = Number((deployableDcaBudgetUsd / 24).toFixed(2));

  const enabledItems = params.items.filter((i) => i.enabled);
  const rawWeightSum = enabledItems.reduce((acc, i) => acc + Math.max(0, i.allocationPct), 0);

  let remainingUsdt = Math.min(freeUsdtAfterLiving, deployableDcaBudgetUsd);
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

  if (livingReserveUsd > 0) {
    advisories.push({
      id: 'living-reserve-protected',
      tone: 'gain',
      titleFa: `ذخیره هزینه‌های زندگی (${livingReserveUsd.toLocaleString('en-US')} دلار) به‌طور کامل از DCA جدا شد`,
      bodyFa:
        `هیچ بخشی از این مبلغ وارد سفارش‌های خرید نمی‌شود. کل بودجهٔ باقی‌ماندهٔ قابل سرمایه‌گذاری شما ${investableStableUsd.toLocaleString('en-US')} دلار است که ${deployableDcaBudgetUsd.toLocaleString('en-US')} دلار آن در پله‌های DCA توزیع شده است.`
    });
  }

  if (symbolsSet.has('XAUT') && symbolsSet.has('PAXG')) {
    advisories.push({
      id: 'duplicate-gold',
      tone: 'warn',
      titleFa: 'حذف یکی از دو توکن طلا (نگه‌داشتن XAUT و حذف PAXG)',
      bodyFa:
        'هر دو XAUT و PAXG قیمت ۱ انس طلا را دنبال می‌کنند؛ نگه‌داشتن هم‌زمان هر دو تکراری است.',
      actionType: 'remove_duplicate_gold'
    });
  } else if (symbolsSet.has('PAXG') && !symbolsSet.has('XAUT') && freeUsdtAfterLiving >= 1000) {
    advisories.push({
      id: 'switch-paxg-to-xaut',
      tone: 'info',
      titleFa: 'پیشنهاد جایگزینی PAXG با XAUT برای تتر مازاد شما',
      bodyFa:
        'تبدیل پله‌ای تتر مازاد به XAUT نقدشوندگی بالاتری در جفت XAUT/USDT فراهم می‌کند.',
      actionType: 'prefer_xaut_for_usdt'
    });
  }

  if (!symbolsSet.has('BTC') && (symbolsSet.has('HYPE') || symbolsSet.has('SOL'))) {
    advisories.push({
      id: 'missing-btc-anchor',
      tone: 'info',
      titleFa: 'تعدیل ریسک ریزش: افزودن بیت‌کوین (BTC) در کنار آلت‌کوین‌ها',
      bodyFa:
        'در سناریوی ریزش سنگین (-۴۵٪ تا -۶۵٪) یا ۲ سال رنج، حضور BTC پایداری سبد را به‌شکل محسوسی بالا می‌برد.',
      actionType: 'add_btc_anchor'
    });
  }

  if (reserveDryPowderPct < 15 && investableStableUsd >= 5000) {
    advisories.push({
      id: 'low-dry-powder',
      tone: 'warn',
      titleFa: 'نگه‌داشتن ذخیره نقد اضطراری برای کف‌های غیرمنتظره',
      bodyFa:
        'علاوه بر پول هزینه‌های زندگی، نگه‌داشتن ۱۵٪ تا ۲۰٪ از بودجهٔ سرمایه‌گذاری به‌عنوان Dry Powder دست شما را در سقوط‌های شدید باز می‌گذارد.',
      actionType: 'keep_dry_powder'
    });
  }

  const overallVerdictFa =
    weightedCommitteeScore >= 5.6
      ? 'تأیید کمیته: ورود پله‌ای آرام با حفظ کامل ذخیره زندگی و نقد اضطراری'
      : 'احتیاط کمیته: اولویت با پله‌های عمیق‌تر (پرهیز از خرید یکجا)';

  const stressScenarios = computeWorstCaseStressScenarios({
    rows,
    deployableDcaBudgetUsd,
    livingReserveUsd,
    reserveDryPowderUsd
  });

  return {
    usdcBalanceUsd: safeUsdc,
    usdtBalanceUsd: safeUsdt,
    totalStableBalanceUsd,
    livingReserveUsd,
    investableStableUsd,
    reserveDryPowderUsd,
    reserveDryPowderPct,
    deployableDcaBudgetUsd,
    deployableUsdcUsd: Number(Math.max(0, freeUsdcAfterLiving - reserveDryPowderUsd).toFixed(2)),
    deployableUsdtUsd: freeUsdtAfterLiving,
    monthlyDca24mUsd,
    totalExistingBasisUsd,
    totalExistingMarketValueUsd,
    totalPortfolioAfterDcaCostUsd,
    totalProjectedValueAtTargetsUsd,
    totalProjectedProfitAtTargetsUsd,
    totalProjectedRoiPct,
    weightedCommitteeScore,
    overallVerdictFa,
    rows,
    advisories,
    stressScenarios
  };
}

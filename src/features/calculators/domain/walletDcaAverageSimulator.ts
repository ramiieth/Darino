/**
 * موتور محاسبه «میانگین خرید جدید و شبیه‌سازی خرید پله‌ای (DCA) متصل به بهای تمام‌شده داشبورد و کیف پول‌ها»
 *
 * هدف:
 *   ۱) استخراج دارایی‌های موجود کاربر از بخش «بهای خرید و سود و زیان» داشبورد (`useWalletAndCostBridge`)
 *      به همراه موقعیت مرجع اتریوم کاربر (`3.33 ETH` روی میانگین قیمت خرید `2,820$` و بهای تمام‌شده `9,390.60$`)
 *   ۲) محاسبه دقیق «میانگین خرید جدید (New Average Buy Price)» زمانی که کاربر می‌خواهد:
 *      - یک خرید جدید (تک‌پله‌ای) با مبلغ دلاری یا تعداد واحد مشخص در قیمت فعلی یا قیمت دلخواه انجام دهد
 *      - یا چند پله خرید DCA روی قیمت‌های پایین‌تر بچیند
 *   ۳) محاسبه «چقدر باید بخرم تا میانگین خریدم به قیمت هدف X برسد؟» (Target Average Cost Solver)
 *   ۴) ترکیب موجودی قبلی کیف پول با جدول خریدهای دوره‌ای در `DcaCalculator` برای نمایش میانگین کل جدید.
 */

import { ETH_POSITION } from '@/features/simulation/domain/constants';
import type { CurrentAssetCostRow } from '@/features/performance/data/useWalletAndCostBridge';

export interface WalletCostHoldingPreset {
  id: string;
  symbol: string;
  nameFa: string;
  sourceLabelFa: string;
  isLiveWallet: boolean;
  currentQuantity: number;
  avgCostUsd: number;
  totalBasisUsd: number;
  currentPriceUsd: number | null;
  unrealizedPnlUsd: number | null;
  unrealizedPnlPct: number | null;
}

export interface NewBuyStepInput {
  stepIndex: number;
  labelFa: string;
  /** مبلغ خرید جدید به دلار */
  buyAmountUsd: number;
  /** قیمت خرید این پله به دلار */
  buyPriceUsd: number;
  /** کارمزد خرید به دلار (اختیاری) */
  feeUsd?: number;
}

export interface CumulativeDcaStepResult {
  stepIndex: number;
  labelFa: string;
  stepAmountUsd: number;
  stepPriceUsd: number;
  stepUnitsAdded: number;
  /** کل موجودی تجمعی پس از این پله (موجودی قبلی کیف پول + پله‌های جدید تا اینجا) */
  cumulativeQuantity: number;
  /** کل سرمایه پرداخت‌شده تجمعی (بهای تمام‌شده قبلی + خریدهای جدید تا اینجا) */
  cumulativeInvestedUsd: number;
  /** میانگین قیمت خرید جدید پس از این پله */
  newAverageCostUsd: number;
  /** چقدر میانگین خرید نسبت به میانگین قبلی (مثلاً ۲,۸۲۰ دلار) کاهش یافته است (دلار و درصد) */
  avgCostDropUsd: number;
  avgCostDropPct: number;
  /** درصد رشد لازم از قیمت فعلی بازار برای رسیدن به نقطه سربه‌سر جدید */
  requiredBounceToBreakEvenPct: number;
  /** سود یا زیان باز کل پوزیشن در قیمت فعلی بازار پس از این خرید */
  unrealizedPnlAtCurrentPriceUsd: number;
}

export interface WalletAverageDownSimulationResult {
  symbol: string;
  nameFa: string;
  currentMarketPriceUsd: number;
  existing: {
    quantity: number;
    avgCostUsd: number;
    totalBasisUsd: number;
    currentValueUsd: number;
    unrealizedPnlUsd: number;
    unrealizedPnlPct: number;
    requiredBounceToBreakEvenPct: number;
  };
  afterNewBuys: {
    addedAmountUsd: number;
    addedUnits: number;
    addedAvgPriceUsd: number;
    totalQuantity: number;
    totalInvestedUsd: number;
    newAverageCostUsd: number;
    avgCostChangeUsd: number;
    avgCostChangePct: number;
    currentValueAtMarketUsd: number;
    unrealizedPnlAtMarketUsd: number;
    unrealizedPnlAtMarketPct: number;
    requiredBounceToBreakEvenPct: number;
    /** سود خالص کل پوزیشن در صورتی که قیمت فقط به همان میانگین خرید قبلی (مثلاً ۲,۸۲۰ دلار) برگردد */
    profitIfReachesOldAvgCostUsd: number;
    /** سود خالص کل پوزیشن در قیمت هدف کاربر */
    profitAtTargetPriceUsd: number | null;
  };
  stepByStep: readonly CumulativeDcaStepResult[];
}

/**
 * استخراج لیست دارایی‌های دارای بهای تمام‌شده از داشبورد (`useWalletAndCostBridge`)
 * + تضمین حضور موقعیت پایه اتریوم کاربر (`3.33 ETH` روی میانگین `2,820$`) در صورتی که کیف پول هنوز همگام نشده باشد
 */
export function buildWalletCostHoldingPresets(
  bridgeRows: readonly CurrentAssetCostRow[],
  livePrices: Record<string, number>
): WalletCostHoldingPreset[] {
  const presets: WalletCostHoldingPreset[] = [];
  const seenSymbols = new Set<string>();

  for (const r of bridgeRows) {
    // حذف استیبل‌کوین‌های خالص واحد حساب که نیاز به میانگین کم کردن ندارند
    if (['USDT', 'USDC', 'USDG', 'DAI'].includes(r.symbol.toUpperCase()) && r.provider !== 'wallet') {
      continue;
    }
    if (r.currentQuantity <= 0) continue;

    const livePx = r.currentPriceUsd ?? livePrices[r.symbol.toUpperCase()] ?? null;
    const avgCost =
      r.avgCostUsd && r.avgCostUsd > 0
        ? r.avgCostUsd
        : r.symbol.toUpperCase() === 'ETH'
        ? ETH_POSITION.BUY_PRICE
        : livePx ?? 100;
    const basis =
      r.costBasisUsd && r.costBasisUsd > 0
        ? r.costBasisUsd
        : Number((r.currentQuantity * avgCost).toFixed(2));
    const curVal = livePx ? Number((r.currentQuantity * livePx).toFixed(2)) : r.currentValueUsd;
    const pnlUsd = livePx ? Number((curVal - basis).toFixed(2)) : r.unrealizedPnlUsd;
    const pnlPct = basis > 0 && pnlUsd !== null ? Number(((pnlUsd / basis) * 100).toFixed(2)) : r.unrealizedPnlPct;

    presets.push({
      id: `${r.provider}:${r.symbol}:${presets.length}`,
      symbol: r.symbol.toUpperCase(),
      nameFa: r.nameFa,
      sourceLabelFa: r.avgCostUsd ? `${r.sourceLabel} (بهای داشبورد)` : `${r.sourceLabel} (موجودی کیف پول)`,
      isLiveWallet: true,
      currentQuantity: Number(r.currentQuantity.toFixed(6)),
      avgCostUsd: Number(avgCost.toFixed(4)),
      totalBasisUsd: Number(basis.toFixed(2)),
      currentPriceUsd: livePx,
      unrealizedPnlUsd: pnlUsd,
      unrealizedPnlPct: pnlPct
    });
    seenSymbols.add(r.symbol.toUpperCase());
  }

  // اگر اتریوم در لیست کیف پول‌های متصل نبود (یا کاربر در حالت آفلاین است)، موقعیت مستند اتریوم داشبورد (3.33 ETH @ $2,820) را اضافه می‌کنیم
  if (!seenSymbols.has('ETH')) {
    const ethLive = livePrices['ETH'] ?? ETH_POSITION.ETH_REF_JULY_2026;
    const curVal = Number((ETH_POSITION.AMOUNT * ethLive).toFixed(2));
    const pnlUsd = Number((curVal - ETH_POSITION.INITIAL_INVESTMENT).toFixed(2));
    const pnlPct = Number(((pnlUsd / ETH_POSITION.INITIAL_INVESTMENT) * 100).toFixed(2));
    presets.unshift({
      id: 'dashboard:ETH:base',
      symbol: 'ETH',
      nameFa: 'اتریوم (بهای خرید داشبورد)',
      sourceLabelFa: 'بهای ثبت‌شده داشبورد (۳.۳۳ واحد روی ۲,۸۲۰ دلار)',
      isLiveWallet: false,
      currentQuantity: ETH_POSITION.AMOUNT,
      avgCostUsd: ETH_POSITION.BUY_PRICE,
      totalBasisUsd: ETH_POSITION.INITIAL_INVESTMENT,
      currentPriceUsd: ethLive,
      unrealizedPnlUsd: pnlUsd,
      unrealizedPnlPct: pnlPct
    });
  }

  return presets;
}

/**
 * شبیه‌سازی دقیق میانگین خرید جدید پس از یک یا چند پله خرید جدید (DCA / Average Down)
 */
export function simulateWalletAverageDown(params: {
  symbol: string;
  nameFa: string;
  existingQuantity: number;
  existingAvgCostUsd: number;
  currentMarketPriceUsd: number;
  steps: readonly NewBuyStepInput[];
  targetExitPriceUsd?: number | null;
}): WalletAverageDownSimulationResult {
  const safeQty = Math.max(0, params.existingQuantity);
  const safeOldAvg = Math.max(0, params.existingAvgCostUsd);
  const marketPx = Math.max(0.000001, params.currentMarketPriceUsd);

  const oldBasisUsd = Number((safeQty * safeOldAvg).toFixed(2));
  const oldCurrentValUsd = Number((safeQty * marketPx).toFixed(2));
  const oldUnrealizedPnlUsd = Number((oldCurrentValUsd - oldBasisUsd).toFixed(2));
  const oldUnrealizedPnlPct =
    oldBasisUsd > 0 ? Number(((oldUnrealizedPnlUsd / oldBasisUsd) * 100).toFixed(2)) : 0;
  const oldRequiredBouncePct =
    safeOldAvg > marketPx ? Number((((safeOldAvg - marketPx) / marketPx) * 100).toFixed(2)) : 0;

  let cumQty = safeQty;
  let cumInvestedUsd = oldBasisUsd;
  let addedAmountUsd = 0;
  let addedUnits = 0;

  const stepByStep: CumulativeDcaStepResult[] = [];

  for (const step of params.steps) {
    const amt = Math.max(0, step.buyAmountUsd);
    const px = Math.max(0.000001, step.buyPriceUsd);
    const fee = Math.max(0, step.feeUsd ?? 0);
    if (amt <= 0) continue;

    const netAmtForUnits = Math.max(0, amt - fee);
    const units = netAmtForUnits / px;

    addedAmountUsd += amt;
    addedUnits += units;
    cumQty += units;
    cumInvestedUsd += amt;

    const newAvg = cumQty > 0 ? cumInvestedUsd / cumQty : px;
    const dropUsd = safeOldAvg > 0 ? safeOldAvg - newAvg : 0;
    const dropPct = safeOldAvg > 0 ? (dropUsd / safeOldAvg) * 100 : 0;
    const reqBounce = newAvg > px ? ((newAvg - px) / px) * 100 : 0;
    const valAtMarket = cumQty * marketPx;
    const pnlAtMarket = valAtMarket - cumInvestedUsd;

    stepByStep.push({
      stepIndex: step.stepIndex,
      labelFa: step.labelFa,
      stepAmountUsd: Number(amt.toFixed(2)),
      stepPriceUsd: Number(px.toPrecision(6)),
      stepUnitsAdded: Number(units.toFixed(6)),
      cumulativeQuantity: Number(cumQty.toFixed(6)),
      cumulativeInvestedUsd: Number(cumInvestedUsd.toFixed(2)),
      newAverageCostUsd: Number(newAvg.toFixed(2)),
      avgCostDropUsd: Number(dropUsd.toFixed(2)),
      avgCostDropPct: Number(dropPct.toFixed(2)),
      requiredBounceToBreakEvenPct: Number(reqBounce.toFixed(2)),
      unrealizedPnlAtCurrentPriceUsd: Number(pnlAtMarket.toFixed(2))
    });
  }

  const finalAvgCost = cumQty > 0 ? cumInvestedUsd / cumQty : safeOldAvg;
  const avgCostChangeUsd = safeOldAvg > 0 ? finalAvgCost - safeOldAvg : 0;
  const avgCostChangePct = safeOldAvg > 0 ? (avgCostChangeUsd / safeOldAvg) * 100 : 0;
  const finalMarketVal = cumQty * marketPx;
  const finalMarketPnl = finalMarketVal - cumInvestedUsd;
  const finalMarketPnlPct = cumInvestedUsd > 0 ? (finalMarketPnl / cumInvestedUsd) * 100 : 0;
  const finalReqBounce =
    finalAvgCost > marketPx ? ((finalAvgCost - marketPx) / marketPx) * 100 : 0;

  // اگر قیمت فقط به همان میانگین خرید قبلی (مثلاً ۲,۸۲۰ دلار) برگردد، چقدر در سود خواهیم بود؟
  const profitIfReachesOldAvgCostUsd =
    safeOldAvg > 0 ? Number((cumQty * safeOldAvg - cumInvestedUsd).toFixed(2)) : 0;

  const profitAtTargetPriceUsd =
    params.targetExitPriceUsd && params.targetExitPriceUsd > 0
      ? Number((cumQty * params.targetExitPriceUsd - cumInvestedUsd).toFixed(2))
      : null;

  return {
    symbol: params.symbol,
    nameFa: params.nameFa,
    currentMarketPriceUsd: marketPx,
    existing: {
      quantity: Number(safeQty.toFixed(6)),
      avgCostUsd: Number(safeOldAvg.toFixed(2)),
      totalBasisUsd: oldBasisUsd,
      currentValueUsd: oldCurrentValUsd,
      unrealizedPnlUsd: oldUnrealizedPnlUsd,
      unrealizedPnlPct: oldUnrealizedPnlPct,
      requiredBounceToBreakEvenPct: oldRequiredBouncePct
    },
    afterNewBuys: {
      addedAmountUsd: Number(addedAmountUsd.toFixed(2)),
      addedUnits: Number(addedUnits.toFixed(6)),
      addedAvgPriceUsd: addedUnits > 0 ? Number((addedAmountUsd / addedUnits).toFixed(2)) : marketPx,
      totalQuantity: Number(cumQty.toFixed(6)),
      totalInvestedUsd: Number(cumInvestedUsd.toFixed(2)),
      newAverageCostUsd: Number(finalAvgCost.toFixed(2)),
      avgCostChangeUsd: Number(avgCostChangeUsd.toFixed(2)),
      avgCostChangePct: Number(avgCostChangePct.toFixed(2)),
      currentValueAtMarketUsd: Number(finalMarketVal.toFixed(2)),
      unrealizedPnlAtMarketUsd: Number(finalMarketPnl.toFixed(2)),
      unrealizedPnlAtMarketPct: Number(finalMarketPnlPct.toFixed(2)),
      requiredBounceToBreakEvenPct: Number(finalReqBounce.toFixed(2)),
      profitIfReachesOldAvgCostUsd,
      profitAtTargetPriceUsd
    },
    stepByStep
  };
}

/**
 * حل‌کننده معکوس: «چقدر باید در قیمت P_buy خرید کنم تا میانگین خریدم از P_old به میانگین هدف P_target برسد؟»
 * فرمول:
 *   (Q_old * P_old + Q_new * P_buy) / (Q_old + Q_new) = P_target
 *   => Q_new = Q_old * (P_old - P_target) / (P_target - P_buy)
 *   => Required_USD = Q_new * P_buy
 */
export function solveRequiredBuyForTargetAverage(params: {
  existingQuantity: number;
  existingAvgCostUsd: number;
  buyPriceUsd: number;
  targetAvgCostUsd: number;
}): {
  possible: boolean;
  requiredBuyUsd: number | null;
  requiredBuyUnits: number | null;
  resultingTotalQuantity: number | null;
  resultingTotalInvestedUsd: number | null;
  reasonFa: string;
} {
  const { existingQuantity: qOld, existingAvgCostUsd: pOld, buyPriceUsd: pBuy, targetAvgCostUsd: pTarget } = params;
  if (qOld <= 0 || pOld <= 0 || pBuy <= 0 || pTarget <= 0) {
    return {
      possible: false,
      requiredBuyUsd: null,
      requiredBuyUnits: null,
      resultingTotalQuantity: null,
      resultingTotalInvestedUsd: null,
      reasonFa: 'مقادیر موجودی و قیمت را به درستی وارد کنید.'
    };
  }

  // اگر کاربر می‌خواهد میانگین را کم کند، قیمت هدف باید بین قیمت خرید جدید و میانگین قبلی باشد
  if (pBuy < pOld) {
    if (pTarget <= pBuy) {
      return {
        possible: false,
        requiredBuyUsd: null,
        requiredBuyUnits: null,
        resultingTotalQuantity: null,
        resultingTotalInvestedUsd: null,
        reasonFa: `میانگین هدف (${pTarget.toLocaleString('en-US')} دلار) نمی‌تواند مساوی یا پایین‌تر از قیمت خرید جدید (${pBuy.toLocaleString('en-US')} دلار) باشد.`
      };
    }
    if (pTarget >= pOld) {
      return {
        possible: false,
        requiredBuyUsd: 0,
        requiredBuyUnits: 0,
        resultingTotalQuantity: qOld,
        resultingTotalInvestedUsd: qOld * pOld,
        reasonFa: 'میانگین فعلی شما همین الان پایین‌تر یا مساوی این عدد است.'
      };
    }
  } else if (pBuy > pOld) {
    if (pTarget >= pBuy || pTarget <= pOld) {
      return {
        possible: false,
        requiredBuyUsd: null,
        requiredBuyUnits: null,
        resultingTotalQuantity: null,
        resultingTotalInvestedUsd: null,
        reasonFa: 'میانگین هدف باید بین میانگین قبلی و قیمت خرید جدید باشد.'
      };
    }
  } else {
    return {
      possible: false,
      requiredBuyUsd: 0,
      requiredBuyUnits: 0,
      resultingTotalQuantity: qOld,
      resultingTotalInvestedUsd: qOld * pOld,
      reasonFa: 'قیمت خرید جدید با میانگین قبلی برابر است.'
    };
  }

  const qNew = (qOld * (pOld - pTarget)) / (pTarget - pBuy);
  const reqUsd = qNew * pBuy;
  const totalQty = qOld + qNew;
  const totalInv = qOld * pOld + reqUsd;

  return {
    possible: true,
    requiredBuyUsd: Number(reqUsd.toFixed(2)),
    requiredBuyUnits: Number(qNew.toFixed(6)),
    resultingTotalQuantity: Number(totalQty.toFixed(6)),
    resultingTotalInvestedUsd: Number(totalInv.toFixed(2)),
    reasonFa: `با خرید ${Math.round(reqUsd).toLocaleString('en-US')} دلار (${qNew.toFixed(4)} واحد) در قیمت ${pBuy.toLocaleString('en-US')} دلار، میانگین خرید شما دقیقاً به ${pTarget.toLocaleString('en-US')} دلار می‌رسد.`
  };
}

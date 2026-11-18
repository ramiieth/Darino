/**
 * لایهٔ محاسباتی یکپارچه و خالص «طلای ایران» در دارینو
 *
 * شامل:
 * ۱. تحلیل تاریخی متحرک ۷، ۳۰ و ۶۰ روزه طلای ۱۸ عیار از روی داده‌های واقعی
 * ۲. مدیریت و مقایسه با قیمت مرجع ثابت کاربر (Snapshot)
 * ۳. محاسبه‌گر خرید، فروش، هزینه نگهداری و قیمت سربه‌سر طلای آنلاین (ملی‌گلد و سایر پلتفرم‌ها)
 * ۴. محاسبه‌گر خرید مصنوعات و طلای زینتی + محاسبه فروش مجدد (بازخرید)
 * ۵. مقایسه منصفانه طلای آنلاین با طلای زینتی + سناریوسازی چندگانه قیمت آینده طلا
 * ۶. داشبورد و ماشین‌حساب سرمایه‌گذاری در ۶ صندوق طلای بورسی (با Snapshot ثابت ۱۰ مرداد ۱۴۰۵)
 * ۷. تحلیل تاریخی دلار آزاد و تتر
 *
 * تمام محاسبات با Decimal.js انجام می‌شوند و گردکردن صرفاً در لایه نمایش اتفاق می‌افتد.
 */
import Decimal from 'decimal.js';
import type { DayClose, GoldPlatform, PlatformRow } from './gold';

const DAY_MS = 86_400_000;

/* ============================================================
   ۱. تحلیل تاریخی متحرک ۷، ۳۰ و ۶۰ روزه طلای ۱۸ عیار
   ============================================================ */

export type HistoryHorizonDays = 7 | 30 | 60;
export const HISTORY_HORIZONS: readonly HistoryHorizonDays[] = [7, 30, 60];

export interface MovingHorizonChange {
  days: HistoryHorizonDays;
  available: boolean;
  startPriceToman: number | null;
  currentPriceToman: number | null;
  changeToman: number | null;
  changePct: number | null;
  referenceTimestamp: number | null;
  series: DayClose[];
}

/**
 * محاسبه تغییر قیمت متحرک در بازه ۷، ۳۰ یا ۶۰ روزه از روی تاریخچه واقعی (بدون هیچ‌گونه تخمین جعلی).
 * تغییر قیمت روز، تاریخچهٔ گذشته را بازنویسی نمی‌کند.
 */
export function computeMovingHorizon(
  history: readonly DayClose[],
  currentPriceToman: number | null,
  days: HistoryHorizonDays,
  nowMs = Date.now()
): MovingHorizonChange {
  if (!currentPriceToman || !(currentPriceToman > 0) || history.length === 0) {
    return {
      days,
      available: false,
      startPriceToman: null,
      currentPriceToman: currentPriceToman && currentPriceToman > 0 ? currentPriceToman : null,
      changeToman: null,
      changePct: null,
      referenceTimestamp: null,
      series: []
    };
  }

  const sorted = [...history].filter((x) => x.close > 0 && Number.isFinite(x.t)).sort((a, b) => a.t - b.t);
  const targetTs = nowMs - days * DAY_MS;
  // نزدیک‌ترین رکورد معتبر در ابتدای بازه (حداکثر تا ۵ روز فاصله برای تعطیلات بازار)
  let ref: DayClose | null = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].t <= targetTs) {
      ref = sorted[i];
      break;
    }
  }
  if (!ref && sorted.length > 0 && Math.abs(sorted[0].t - targetTs) <= 5 * DAY_MS) {
    ref = sorted[0];
  }

  if (!ref || !(ref.close > 0) || targetTs - ref.t > 10 * DAY_MS) {
    return {
      days,
      available: false,
      startPriceToman: null,
      currentPriceToman,
      changeToman: null,
      changePct: null,
      referenceTimestamp: null,
      series: sorted.filter((x) => x.t >= targetTs)
    };
  }

  const cur = new Decimal(currentPriceToman);
  const start = new Decimal(ref.close);
  const diff = cur.minus(start);
  const pct = diff.div(start).times(100);
  const filtered = sorted.filter((x) => x.t >= ref!.t && x.t < nowMs);
  const series = [...filtered, { t: nowMs, close: currentPriceToman }];

  return {
    days,
    available: true,
    startPriceToman: start.toNumber(),
    currentPriceToman: cur.toNumber(),
    changeToman: diff.toNumber(),
    changePct: pct.toNumber(),
    referenceTimestamp: ref.t,
    series
  };
}

/* ============================================================
   ۲. قیمت مرجع (Snapshot) مستقل کاربر برای طلای ۱۸ عیار
   ============================================================ */

export interface GoldSnapshot {
  id: string;
  title: string;
  /** تاریخ ثبت به صورت Timestamp میلادی یا رشته تاریخ */
  createdAt: number;
  dateLabelFa: string;
  price18kToman: number;
  note?: string;
  /** اسنپ‌شات‌های پایه تا زمان ویرایش صریح کاربر ثابت می‌مانند */
  protectedPreset?: boolean;
}

export interface SnapshotComparison {
  snapshot: GoldSnapshot;
  currentPriceToman: number;
  diffToman: number;
  changePct: number;
  elapsedDays: number;
}

export function compareWithSnapshot(
  snapshot: GoldSnapshot,
  currentPriceToman: number | null,
  nowMs = Date.now()
): SnapshotComparison | null {
  if (!currentPriceToman || !(currentPriceToman > 0) || !(snapshot.price18kToman > 0)) return null;
  const cur = new Decimal(currentPriceToman);
  const ref = new Decimal(snapshot.price18kToman);
  const diff = cur.minus(ref);
  const pct = diff.div(ref).times(100);
  const elapsedDays = Math.max(0, Math.floor((nowMs - snapshot.createdAt) / DAY_MS));
  return {
    snapshot,
    currentPriceToman: cur.toNumber(),
    diffToman: diff.toNumber(),
    changePct: pct.toNumber(),
    elapsedDays
  };
}

/* ============================================================
   ۳. پروفایل و محاسبه‌گر خرید و فروش طلای آنلاین
   ============================================================ */

export type StorageFeeMode = 'none' | 'monthly_fixed' | 'per_gram_monthly' | 'annual_pct';

export interface OnlineGoldPlatformProfile {
  id: string;
  name: string;
  linkedPlatform?: GoldPlatform;
  /** در صورت اتصال به API زنده پلتفرم، نرخ‌ها از API پر می‌شوند؛ در غیر این صورت یا در حالت دستی، از مقادیر زیر یا اختلاف با بازار استفاده می‌شود */
  useLiveQuote: boolean;
  buyPricePerGramToman: number;
  sellPricePerGramToman: number;
  buyFeePct: number;
  sellFeePct: number;
  weightDeductionPct: number;
  storageFeeMode: StorageFeeMode;
  storageFeeValue: number;
  withdrawalFixedFeeToman: number;
  physicalDeliveryFeeToman: number;
  minWithdrawalGrams: number;
  otherBuyCostToman: number;
  otherSellCostToman: number;
}

export const DEFAULT_ONLINE_PLATFORMS: readonly OnlineGoldPlatformProfile[] = [
  {
    id: 'melligold',
    name: 'ملی‌گلد',
    linkedPlatform: 'melligold',
    useLiveQuote: true,
    buyPricePerGramToman: 0,
    sellPricePerGramToman: 0,
    buyFeePct: 0.5,
    sellFeePct: 0.5,
    weightDeductionPct: 0,
    storageFeeMode: 'none',
    storageFeeValue: 0,
    withdrawalFixedFeeToman: 0,
    physicalDeliveryFeeToman: 0,
    minWithdrawalGrams: 0.1,
    otherBuyCostToman: 0,
    otherSellCostToman: 0
  },
  {
    id: 'milli',
    name: 'میلی',
    linkedPlatform: 'milli',
    useLiveQuote: true,
    buyPricePerGramToman: 0,
    sellPricePerGramToman: 0,
    buyFeePct: 0.5,
    sellFeePct: 0.5,
    weightDeductionPct: 0,
    storageFeeMode: 'none',
    storageFeeValue: 0,
    withdrawalFixedFeeToman: 0,
    physicalDeliveryFeeToman: 0,
    minWithdrawalGrams: 0.1,
    otherBuyCostToman: 0,
    otherSellCostToman: 0
  },
  {
    id: 'wallgold',
    name: 'وال‌گلد',
    linkedPlatform: 'wallgold',
    useLiveQuote: true,
    buyPricePerGramToman: 0,
    sellPricePerGramToman: 0,
    buyFeePct: 0.5,
    sellFeePct: 0.5,
    weightDeductionPct: 0,
    storageFeeMode: 'none',
    storageFeeValue: 0,
    withdrawalFixedFeeToman: 0,
    physicalDeliveryFeeToman: 0,
    minWithdrawalGrams: 0.1,
    otherBuyCostToman: 0,
    otherSellCostToman: 0
  },
  {
    id: 'daric',
    name: 'دریک',
    linkedPlatform: 'daric',
    useLiveQuote: true,
    buyPricePerGramToman: 0,
    sellPricePerGramToman: 0,
    buyFeePct: 0.35,
    sellFeePct: 0.35,
    weightDeductionPct: 0,
    storageFeeMode: 'none',
    storageFeeValue: 0,
    withdrawalFixedFeeToman: 0,
    physicalDeliveryFeeToman: 0,
    minWithdrawalGrams: 0.1,
    otherBuyCostToman: 0,
    otherSellCostToman: 0
  }
];

export interface OnlineGoldInput {
  weightGrams: number;
  holdingMonths: number;
  includePhysicalDelivery: boolean;
  profile: OnlineGoldPlatformProfile;
  /** نرخ مرجع بازار برای حالتی که قیمت دستی وارد نشده */
  fallbackMarketPriceToman: number | null;
  liveRows?: readonly PlatformRow[];
  /** قیمت فروش فرضی (مثلاً در سناریوی آینده)؛ اگر داده نشود از قیمت فروش فعلی پلتفرم استفاده می‌شود */
  overrideSellPricePerGramToman?: number | null;
}

export interface OnlineGoldResult {
  valid: boolean;
  isEstimatedQuote: boolean;
  weightGrams: number;
  netReceivedWeightGrams: number;
  buyPricePerGramToman: number;
  sellPricePerGramToman: number;
  baseGoldValueToman: number;
  buyFeeToman: number;
  extraBuyCostsToman: number;
  totalBuyCostToman: number;
  storageCostToman: number;
  grossSellValueToman: number;
  sellFeeToman: number;
  extraSellCostsToman: number;
  netSellProceedsToman: number;
  netProfitToman: number;
  roiPct: number;
  breakEvenSellPricePerGramToman: number;
  belowMinWithdrawal: boolean;
}

export function resolveOnlinePlatformRates(
  profile: OnlineGoldPlatformProfile,
  fallbackMarketPriceToman: number | null,
  liveRows: readonly PlatformRow[] = []
): { buy: number; sell: number; isEstimated: boolean } {
  if (profile.useLiveQuote && profile.linkedPlatform) {
    const row = liveRows.find((r) => r.platform === profile.linkedPlatform);
    if (row && row.buy > 0 && row.sell > 0) {
      return { buy: row.buy, sell: row.sell, isEstimated: false };
    }
  }
  if (profile.buyPricePerGramToman > 0 && profile.sellPricePerGramToman > 0) {
    return {
      buy: profile.buyPricePerGramToman,
      sell: profile.sellPricePerGramToman,
      isEstimated: !profile.useLiveQuote
    };
  }
  const base = fallbackMarketPriceToman && fallbackMarketPriceToman > 0 ? fallbackMarketPriceToman : 0;
  return { buy: base, sell: base, isEstimated: true };
}

export function calculateOnlineGold(input: OnlineGoldInput): OnlineGoldResult {
  const w = input.weightGrams;
  const rates = resolveOnlinePlatformRates(input.profile, input.fallbackMarketPriceToman, input.liveRows);
  const buyRate = rates.buy;
  const sellRate =
    input.overrideSellPricePerGramToman && input.overrideSellPricePerGramToman > 0
      ? input.overrideSellPricePerGramToman
      : rates.sell;

  if (!(w > 0) || !(buyRate > 0) || !(sellRate > 0)) {
    return {
      valid: false,
      isEstimatedQuote: rates.isEstimated,
      weightGrams: 0,
      netReceivedWeightGrams: 0,
      buyPricePerGramToman: buyRate,
      sellPricePerGramToman: sellRate,
      baseGoldValueToman: 0,
      buyFeeToman: 0,
      extraBuyCostsToman: 0,
      totalBuyCostToman: 0,
      storageCostToman: 0,
      grossSellValueToman: 0,
      sellFeeToman: 0,
      extraSellCostsToman: 0,
      netSellProceedsToman: 0,
      netProfitToman: 0,
      roiPct: 0,
      breakEvenSellPricePerGramToman: 0,
      belowMinWithdrawal: false
    };
  }

  const weight = new Decimal(w);
  const buyPx = new Decimal(buyRate);
  const sellPx = new Decimal(sellRate);
  const p = input.profile;

  const baseValue = weight.times(buyPx);
  const buyFee = baseValue.times(Math.max(0, p.buyFeePct)).div(100);
  const extraBuy = new Decimal(Math.max(0, p.otherBuyCostToman));
  const totalBuy = baseValue.plus(buyFee).plus(extraBuy);

  const weightDedPct = Math.min(99, Math.max(0, p.weightDeductionPct));
  const netWeight = weight.times(new Decimal(100).minus(weightDedPct)).div(100);

  const months = new Decimal(Math.max(0, input.holdingMonths));
  let storageCost = new Decimal(0);
  if (months.gt(0) && p.storageFeeValue > 0) {
    if (p.storageFeeMode === 'monthly_fixed') {
      storageCost = months.times(p.storageFeeValue);
    } else if (p.storageFeeMode === 'per_gram_monthly') {
      storageCost = months.times(netWeight).times(p.storageFeeValue);
    } else if (p.storageFeeMode === 'annual_pct') {
      storageCost = baseValue.times(p.storageFeeValue).div(100).times(months.div(12));
    }
  }

  const grossSell = netWeight.times(sellPx);
  const sellFee = grossSell.times(Math.max(0, p.sellFeePct)).div(100);
  const extraSell = new Decimal(Math.max(0, p.otherSellCostToman))
    .plus(Math.max(0, p.withdrawalFixedFeeToman))
    .plus(input.includePhysicalDelivery ? Math.max(0, p.physicalDeliveryFeeToman) : 0);

  const netSellProceeds = Decimal.max(0, grossSell.minus(sellFee).minus(extraSell));
  const netProfit = netSellProceeds.minus(totalBuy).minus(storageCost);
  const totalOutlay = totalBuy.plus(storageCost);
  const roiPct = totalOutlay.gt(0) ? netProfit.div(totalOutlay).times(100).toNumber() : 0;

  // قیمت سربه‌سر فروش هر گرم: netWeight * P_be * (1 - sellFeePct/100) - extraSell = totalBuy + storageCost
  const netSellFactor = new Decimal(1).minus(new Decimal(Math.max(0, p.sellFeePct)).div(100));
  const breakEven =
    netWeight.gt(0) && netSellFactor.gt(0)
      ? totalBuy.plus(storageCost).plus(extraSell).div(netWeight.times(netSellFactor)).toNumber()
      : 0;

  return {
    valid: true,
    isEstimatedQuote: rates.isEstimated,
    weightGrams: weight.toNumber(),
    netReceivedWeightGrams: netWeight.toNumber(),
    buyPricePerGramToman: buyPx.toNumber(),
    sellPricePerGramToman: sellPx.toNumber(),
    baseGoldValueToman: baseValue.toNumber(),
    buyFeeToman: buyFee.toNumber(),
    extraBuyCostsToman: extraBuy.toNumber(),
    totalBuyCostToman: totalBuy.toNumber(),
    storageCostToman: storageCost.toNumber(),
    grossSellValueToman: grossSell.toNumber(),
    sellFeeToman: sellFee.toNumber(),
    extraSellCostsToman: extraSell.toNumber(),
    netSellProceedsToman: netSellProceeds.toNumber(),
    netProfitToman: netProfit.toNumber(),
    roiPct,
    breakEvenSellPricePerGramToman: breakEven,
    belowMinWithdrawal: netWeight.toNumber() < p.minWithdrawalGrams
  };
}

/* ============================================================
   ۴. محاسبه‌گر خرید و فروش مجدد طلای زینتی (مصنوعات طلا)
   ============================================================ */

export type MakingChargeMode = 'percent' | 'per_gram' | 'fixed_total';
export type SellerProfitBase = 'raw_plus_making' | 'raw_only';
export type JewelryTaxBase = 'making_plus_profit' | 'total_invoice';

export interface JewelryCalcInput {
  productName?: string;
  grossWeightGrams: number;
  /** وزن سنگ، نگین یا قطعات غیرطلا که هنگام فروش مجدد کسر می‌شود */
  stoneOrNonGoldWeightGrams: number;
  /** عیار طلا (پیش‌فرض ۷۵۰ معادل ۱۸ عیار) */
  karat: number;
  /** نرخ روز هر گرم طلای ۱۸ عیار (۷۵۰) از بخش اصلی بازار */
  market18kPriceToman: number;
  makingChargeMode: MakingChargeMode;
  makingChargeValue: number;
  sellerProfitPct: number;
  sellerProfitBase: SellerProfitBase;
  taxPct: number;
  taxBase: JewelryTaxBase;
  otherBuyCostToman: number;
  discountToman: number;
  /** نرخ خرید مجدد هر گرم طلای ۱۸ عیار؛ اگر null باشد از نرخ روز منهای کسورات بازخرید استفاده می‌شود */
  customResale18kPriceToman?: number | null;
  /** درصد کسورات بازخرید طلافروش نسبت به نرخ تابلو (مثلاً ۱.۵٪) */
  resaleDeductionPct: number;
  resaleFixedDeductionToman: number;
}

export interface JewelryCalcResult {
  valid: boolean;
  isEstimatedResaleRate: boolean;
  grossWeightGrams: number;
  netGoldWeightGrams: number;
  karat: number;
  karatFactorVs18k: number;
  effectiveGramPriceToman: number;
  rawGoldValueToman: number;
  makingChargeToman: number;
  sellerProfitToman: number;
  taxableAmountToman: number;
  taxToman: number;
  otherBuyCostToman: number;
  discountToman: number;
  totalBuyInvoiceToman: number;
  /** هزینه جانبی کل خرید (اجرت + سود + مالیات + سایر − تخفیف) */
  totalOverheadToman: number;
  overheadPctOfRaw: number;
  /* --- فروش مجدد (بازخرید) --- */
  resaleEffective18kRateToman: number;
  resaleGrossValueToman: number;
  resaleDeductionsToman: number;
  resaleNetProceedsToman: number;
  netProfitOrLossToman: number;
  roiPct: number;
  /** قیمت هر گرم ۱۸ عیار که در آن فروش مجدد دقیقاً کل فاکتور خرید را پوشش می‌دهد */
  breakEven18kPriceToman: number;
  requiredMarketGrowthPctToBreakEven: number;
}

export function calculateJewelryGold(input: JewelryCalcInput): JewelryCalcResult {
  if (!(input.grossWeightGrams > 0) || !(input.market18kPriceToman > 0) || !(input.karat > 0)) {
    return {
      valid: false,
      isEstimatedResaleRate: true,
      grossWeightGrams: 0,
      netGoldWeightGrams: 0,
      karat: input.karat || 750,
      karatFactorVs18k: 1,
      effectiveGramPriceToman: 0,
      rawGoldValueToman: 0,
      makingChargeToman: 0,
      sellerProfitToman: 0,
      taxableAmountToman: 0,
      taxToman: 0,
      otherBuyCostToman: 0,
      discountToman: 0,
      totalBuyInvoiceToman: 0,
      totalOverheadToman: 0,
      overheadPctOfRaw: 0,
      resaleEffective18kRateToman: 0,
      resaleGrossValueToman: 0,
      resaleDeductionsToman: 0,
      resaleNetProceedsToman: 0,
      netProfitOrLossToman: 0,
      roiPct: 0,
      breakEven18kPriceToman: 0,
      requiredMarketGrowthPctToBreakEven: 0
    };
  }

  // پشتیبانی هم از عیار ۱۸/۲۴ و هم عیار ۷۵۰/۹۹۹.۹
  const normalizedKarat = input.karat <= 24 ? (input.karat / 18) * 750 : input.karat;
  const karatFactor = new Decimal(normalizedKarat).div(750);
  const grossW = new Decimal(input.grossWeightGrams);
  const stoneW = Decimal.min(grossW, Decimal.max(0, input.stoneOrNonGoldWeightGrams || 0));
  const netW = Decimal.max(0, grossW.minus(stoneW));

  const market18k = new Decimal(input.market18kPriceToman);
  const effectiveGramPrice = market18k.times(karatFactor);
  // در خرید طلافروشی، وزن کل مصنوع مبنای فاکتور خرید است
  const rawGoldValue = grossW.times(effectiveGramPrice);

  let makingCharge = new Decimal(0);
  const mcVal = Math.max(0, input.makingChargeValue || 0);
  if (input.makingChargeMode === 'percent') {
    makingCharge = rawGoldValue.times(mcVal).div(100);
  } else if (input.makingChargeMode === 'per_gram') {
    makingCharge = grossW.times(mcVal);
  } else {
    makingCharge = new Decimal(mcVal);
  }

  const profitBase =
    input.sellerProfitBase === 'raw_only' ? rawGoldValue : rawGoldValue.plus(makingCharge);
  const sellerProfit = profitBase.times(Math.max(0, input.sellerProfitPct || 0)).div(100);

  // طبق قانون مالیات بر ارزش افزوده طلا در ایران، اصل طلا از مالیات معاف است و فقط (اجرت + سود فروشنده) مشمول مالیات است؛ اما در تنظیمات قابل تغییر است
  const taxableAmount =
    input.taxBase === 'total_invoice'
      ? rawGoldValue.plus(makingCharge).plus(sellerProfit)
      : makingCharge.plus(sellerProfit);
  const tax = taxableAmount.times(Math.max(0, input.taxPct || 0)).div(100);

  const otherBuy = new Decimal(Math.max(0, input.otherBuyCostToman || 0));
  const discount = new Decimal(Math.max(0, input.discountToman || 0));
  const totalBuyInvoice = Decimal.max(
    0,
    rawGoldValue.plus(makingCharge).plus(sellerProfit).plus(tax).plus(otherBuy).minus(discount)
  );
  const totalOverhead = totalBuyInvoice.minus(rawGoldValue);
  const overheadPctOfRaw = rawGoldValue.gt(0) ? totalOverhead.div(rawGoldValue).times(100).toNumber() : 0;

  // محاسبه فروش مجدد (فقط وزن خالص طلا بدون سنگ و بدون بازگشت اجرت/سود/مالیات)
  const hasCustomResale = !!(input.customResale18kPriceToman && input.customResale18kPriceToman > 0);
  const baseResale18k = hasCustomResale ? new Decimal(input.customResale18kPriceToman!) : market18k;
  const resaleGrossValue = netW.times(baseResale18k).times(karatFactor);

  const pctDed = resaleGrossValue.times(Math.max(0, input.resaleDeductionPct || 0)).div(100);
  const fixedDed = new Decimal(Math.max(0, input.resaleFixedDeductionToman || 0));
  const resaleDeductions = pctDed.plus(fixedDed);
  const resaleNetProceeds = Decimal.max(0, resaleGrossValue.minus(resaleDeductions));

  const netProfitOrLoss = resaleNetProceeds.minus(totalBuyInvoice);
  const roiPct = totalBuyInvoice.gt(0) ? netProfitOrLoss.div(totalBuyInvoice).times(100).toNumber() : 0;

  // قیمت سربه‌سر ۱۸ عیار: netW * karatFactor * P_be * (1 - resaleDeductionPct/100) - fixedDed = totalBuyInvoice
  const keepRatio = new Decimal(1).minus(new Decimal(Math.max(0, input.resaleDeductionPct || 0)).div(100));
  const denom = netW.times(karatFactor).times(keepRatio);
  const breakEven18k = denom.gt(0) ? totalBuyInvoice.plus(fixedDed).div(denom).toNumber() : 0;
  const reqGrowthPct =
    market18k.gt(0) && breakEven18k > 0
      ? new Decimal(breakEven18k).minus(market18k).div(market18k).times(100).toNumber()
      : 0;

  return {
    valid: true,
    isEstimatedResaleRate: !hasCustomResale,
    grossWeightGrams: grossW.toNumber(),
    netGoldWeightGrams: netW.toNumber(),
    karat: input.karat,
    karatFactorVs18k: karatFactor.toNumber(),
    effectiveGramPriceToman: effectiveGramPrice.toNumber(),
    rawGoldValueToman: rawGoldValue.toNumber(),
    makingChargeToman: makingCharge.toNumber(),
    sellerProfitToman: sellerProfit.toNumber(),
    taxableAmountToman: taxableAmount.toNumber(),
    taxToman: tax.toNumber(),
    otherBuyCostToman: otherBuy.toNumber(),
    discountToman: discount.toNumber(),
    totalBuyInvoiceToman: totalBuyInvoice.toNumber(),
    totalOverheadToman: totalOverhead.toNumber(),
    overheadPctOfRaw,
    resaleEffective18kRateToman: baseResale18k.times(keepRatio).toNumber(),
    resaleGrossValueToman: resaleGrossValue.toNumber(),
    resaleDeductionsToman: resaleDeductions.toNumber(),
    resaleNetProceedsToman: resaleNetProceeds.toNumber(),
    netProfitOrLossToman: netProfitOrLoss.toNumber(),
    roiPct,
    breakEven18kPriceToman: breakEven18k,
    requiredMarketGrowthPctToBreakEven: reqGrowthPct
  };
}

/* ============================================================
   ۵. مقایسه طلای آنلاین با طلای زینتی + سناریوی قیمت آینده طلا
   ============================================================ */

export interface OnlineVsJewelryComparison {
  weightGrams: number;
  reference18kPriceToman: number;
  online: OnlineGoldResult;
  jewelry: JewelryCalcResult;
  lowerInitialCostMethod: 'online' | 'jewelry' | 'equal';
  initialCostDiffToman: number;
  onlineOverheadToman: number;
  jewelryOverheadToman: number;
  higherNetResaleMethod: 'online' | 'jewelry' | 'equal';
  resaleDiffToman: number;
  betterRoiMethod: 'online' | 'jewelry' | 'equal';
  roiDiffPctPoints: number;
  onlineRequiredGrowthPctToBreakEven: number;
  jewelryRequiredGrowthPctToBreakEven: number;
}

export function compareOnlineAndJewelry(
  onlineInput: OnlineGoldInput,
  jewelryInput: JewelryCalcInput
): OnlineVsJewelryComparison {
  const unifiedWeight = onlineInput.weightGrams;
  const online = calculateOnlineGold(onlineInput);
  const jewelry = calculateJewelryGold({
    ...jewelryInput,
    grossWeightGrams: unifiedWeight
  });

  const onlineCost = online.totalBuyCostToman + online.storageCostToman;
  const jewelryCost = jewelry.totalBuyInvoiceToman;
  const initialCostDiffToman = Math.abs(jewelryCost - onlineCost);
  const lowerInitialCostMethod =
    Math.abs(jewelryCost - onlineCost) < 1
      ? 'equal'
      : onlineCost < jewelryCost
        ? 'online'
        : 'jewelry';

  const onlineOverhead = online.buyFeeToman + online.extraBuyCostsToman + online.storageCostToman + online.sellFeeToman + online.extraSellCostsToman;
  const jewelryOverhead = jewelry.totalOverheadToman + jewelry.resaleDeductionsToman;

  const higherNetResaleMethod =
    Math.abs(online.netSellProceedsToman - jewelry.resaleNetProceedsToman) < 1
      ? 'equal'
      : online.netSellProceedsToman > jewelry.resaleNetProceedsToman
        ? 'online'
        : 'jewelry';

  const betterRoiMethod =
    Math.abs(online.roiPct - jewelry.roiPct) < 0.01
      ? 'equal'
      : online.roiPct > jewelry.roiPct
        ? 'online'
        : 'jewelry';

  const refPx = jewelryInput.market18kPriceToman;
  const onlineReqGrowth =
    refPx > 0 && online.breakEvenSellPricePerGramToman > 0
      ? ((online.breakEvenSellPricePerGramToman - online.sellPricePerGramToman) / online.sellPricePerGramToman) * 100
      : 0;

  return {
    weightGrams: unifiedWeight,
    reference18kPriceToman: refPx,
    online,
    jewelry,
    lowerInitialCostMethod,
    initialCostDiffToman,
    onlineOverheadToman: onlineOverhead,
    jewelryOverheadToman: jewelryOverhead,
    higherNetResaleMethod,
    resaleDiffToman: Math.abs(online.netSellProceedsToman - jewelry.resaleNetProceedsToman),
    betterRoiMethod,
    roiDiffPctPoints: online.roiPct - jewelry.roiPct,
    onlineRequiredGrowthPctToBreakEven: onlineReqGrowth,
    jewelryRequiredGrowthPctToBreakEven: jewelry.requiredMarketGrowthPctToBreakEven
  };
}

export interface FutureGoldScenarioRow {
  future18kPriceToman: number;
  changeVsCurrentPct: number;
  onlineNetProceedsToman: number;
  onlineNetProfitToman: number;
  onlineRoiPct: number;
  jewelryNetProceedsToman: number;
  jewelryNetProfitToman: number;
  jewelryRoiPct: number;
}

export function evaluateFutureGoldScenarios(
  futurePricesToman: readonly number[],
  current18kPriceToman: number,
  onlineBaseInput: OnlineGoldInput,
  jewelryBaseInput: JewelryCalcInput
): FutureGoldScenarioRow[] {
  if (!(current18kPriceToman > 0)) return [];
  return futurePricesToman
    .filter((p) => p > 0)
    .map((futurePx) => {
      // خرید در قیمت امروز انجام شده، اما فروش در قیمت فرضی آینده انجام می‌شود
      const onlineAtBuy = calculateOnlineGold(onlineBaseInput);
      const onlineAtFuture = calculateOnlineGold({
        ...onlineBaseInput,
        overrideSellPricePerGramToman: futurePx
      });

      const jewelryAtBuy = calculateJewelryGold({
        ...jewelryBaseInput,
        grossWeightGrams: onlineBaseInput.weightGrams
      });
      const jewelryAtFuture = calculateJewelryGold({
        ...jewelryBaseInput,
        grossWeightGrams: onlineBaseInput.weightGrams,
        customResale18kPriceToman: futurePx
      });

      const onlineTotalCost = onlineAtBuy.totalBuyCostToman + onlineAtBuy.storageCostToman;
      const onlineProfit = onlineAtFuture.netSellProceedsToman - onlineTotalCost;
      const onlineRoi = onlineTotalCost > 0 ? (onlineProfit / onlineTotalCost) * 100 : 0;

      const jewelryTotalCost = jewelryAtBuy.totalBuyInvoiceToman;
      const jewelryProfit = jewelryAtFuture.resaleNetProceedsToman - jewelryTotalCost;
      const jewelryRoi = jewelryTotalCost > 0 ? (jewelryProfit / jewelryTotalCost) * 100 : 0;

      return {
        future18kPriceToman: futurePx,
        changeVsCurrentPct: ((futurePx - current18kPriceToman) / current18kPriceToman) * 100,
        onlineNetProceedsToman: onlineAtFuture.netSellProceedsToman,
        onlineNetProfitToman: onlineProfit,
        onlineRoiPct: onlineRoi,
        jewelryNetProceedsToman: jewelryAtFuture.resaleNetProceedsToman,
        jewelryNetProfitToman: jewelryProfit,
        jewelryRoiPct: jewelryRoi
      };
    });
}

/* ============================================================
   ۶. داشبورد و ماشین‌حساب صندوق‌های طلای بورسی (مرجع ثابت ۱۰ مرداد ۱۴۰۵)
   ============================================================ */

export const GOLD_ETF_SNAPSHOT_DATE_FA = '۱۰ مرداد ۱۴۰۵';

/** پارامترهای مرکزی کارمزد معاملات صندوق‌های طلای بورسی (قابل اصلاح در تنظیمات مرکزی) */
export const GOLD_ETF_FEE_CONFIG = {
  buyFeePct: 0.12,
  sellFeePct: 0.12,
  roundTripFeePct: 0.24,
  taxPct: 0
} as const;

export interface GoldEtfPreset {
  id: string;
  nameFa: string;
  tickerFa: string;
  /** قیمت مرجع ثابت در ۱۰ مرداد ۱۴۰۵ (تومان) */
  snapshotPriceToman: number;
}

export const GOLD_ETF_PRESETS: readonly GoldEtfPreset[] = [
  { id: 'ayar', nameFa: 'صندوق عیار', tickerFa: 'عیار', snapshotPriceToman: 52_105 },
  { id: 'mesghal', nameFa: 'صندوق طلای مثقال', tickerFa: 'مثقال', snapshotPriceToman: 15_093 },
  { id: 'tala', nameFa: 'صندوق طلای لوتوس', tickerFa: 'طلا', snapshotPriceToman: 133_045 },
  { id: 'kahroba', nameFa: 'صندوق کهربا', tickerFa: 'کهربا', snapshotPriceToman: 18_045 },
  { id: 'ghirat', nameFa: 'صندوق قیراط', tickerFa: 'قیراط', snapshotPriceToman: 3_463 },
  { id: 'gohar', nameFa: 'صندوق گوهر کیان', tickerFa: 'گوهر', snapshotPriceToman: 89_448 }
];

export interface GoldEtfCardComparison {
  etf: GoldEtfPreset;
  currentPriceToman: number | null;
  futurePriceToman: number | null;
  diffCurrentVsSnapshotToman: number | null;
  changeCurrentVsSnapshotPct: number | null;
  diffFutureVsSnapshotToman: number | null;
  changeFutureVsSnapshotPct: number | null;
}

export function evaluateGoldEtfCard(
  etf: GoldEtfPreset,
  currentPriceToman: number | null,
  futurePriceToman: number | null
): GoldEtfCardComparison {
  const snap = new Decimal(etf.snapshotPriceToman);
  const hasCur = !!(currentPriceToman && currentPriceToman > 0);
  const hasFut = !!(futurePriceToman && futurePriceToman > 0);

  const curDiff = hasCur ? new Decimal(currentPriceToman!).minus(snap) : null;
  const curPct = curDiff ? curDiff.div(snap).times(100).toNumber() : null;

  const futDiff = hasFut ? new Decimal(futurePriceToman!).minus(snap) : null;
  const futPct = futDiff ? futDiff.div(snap).times(100).toNumber() : null;

  return {
    etf,
    currentPriceToman: hasCur ? currentPriceToman! : null,
    futurePriceToman: hasFut ? futurePriceToman! : null,
    diffCurrentVsSnapshotToman: curDiff ? curDiff.toNumber() : null,
    changeCurrentVsSnapshotPct: curPct,
    diffFutureVsSnapshotToman: futDiff ? futDiff.toNumber() : null,
    changeFutureVsSnapshotPct: futPct
  };
}

export interface GoldEtfInvestmentInput {
  etfId: string;
  mode: 'by_amount' | 'by_units';
  /** مبلغ سرمایه‌گذاری اولیه به تومان (در حالت by_amount) */
  investmentAmountToman: number;
  /** تعداد واحد خریداری‌شده (در حالت by_units) */
  units: number;
  /** آیا فقط واحد صحیح (بدون اعشار) خریداری شود؟ (استاندارد بورس ایران) */
  integerUnitsOnly?: boolean;
  buyPricePerUnitToman: number;
  currentPricePerUnitToman?: number | null;
  futurePricePerUnitToman: number;
  buyFeePct?: number;
  sellFeePct?: number;
}

export interface GoldEtfInvestmentResult {
  valid: boolean;
  etf: GoldEtfPreset;
  unitsPurchased: number;
  leftoverCashToman: number;
  buyPricePerUnitToman: number;
  currentPricePerUnitToman: number | null;
  futurePricePerUnitToman: number;
  rawPurchaseValueToman: number;
  buyFeeToman: number;
  totalEntryCostToman: number;
  currentHoldingValueToman: number | null;
  grossFutureValueToman: number;
  sellFeeToman: number;
  totalTradingFeesToman: number;
  netFinalProceedsToman: number;
  netProfitOrLossToman: number;
  roiPct: number;
  breakEvenUnitPriceToman: number;
  futureDiffVsSnapshotToman: number;
  futureChangeVsSnapshotPct: number;
}

export function calculateGoldEtfInvestment(input: GoldEtfInvestmentInput): GoldEtfInvestmentResult {
  const etf = GOLD_ETF_PRESETS.find((e) => e.id === input.etfId) ?? GOLD_ETF_PRESETS[0];
  const buyFeePct = input.buyFeePct ?? GOLD_ETF_FEE_CONFIG.buyFeePct;
  const sellFeePct = input.sellFeePct ?? GOLD_ETF_FEE_CONFIG.sellFeePct;
  const integerOnly = input.integerUnitsOnly !== false;

  const buyPxNum = input.buyPricePerUnitToman;
  const futPxNum = input.futurePricePerUnitToman;
  if (!(buyPxNum > 0) || !(futPxNum > 0)) {
    return {
      valid: false,
      etf,
      unitsPurchased: 0,
      leftoverCashToman: 0,
      buyPricePerUnitToman: buyPxNum || 0,
      currentPricePerUnitToman: input.currentPricePerUnitToman ?? null,
      futurePricePerUnitToman: futPxNum || 0,
      rawPurchaseValueToman: 0,
      buyFeeToman: 0,
      totalEntryCostToman: 0,
      currentHoldingValueToman: null,
      grossFutureValueToman: 0,
      sellFeeToman: 0,
      totalTradingFeesToman: 0,
      netFinalProceedsToman: 0,
      netProfitOrLossToman: 0,
      roiPct: 0,
      breakEvenUnitPriceToman: 0,
      futureDiffVsSnapshotToman: 0,
      futureChangeVsSnapshotPct: 0
    };
  }

  const buyPx = new Decimal(buyPxNum);
  const futPx = new Decimal(futPxNum);
  const buyFeeRate = new Decimal(Math.max(0, buyFeePct)).div(100);
  const sellFeeRate = new Decimal(Math.max(0, sellFeePct)).div(100);
  const unitCostWithFee = buyPx.times(new Decimal(1).plus(buyFeeRate));

  let units = new Decimal(0);
  let leftoverCash = new Decimal(0);

  if (input.mode === 'by_amount') {
    if (!(input.investmentAmountToman > 0)) {
      return {
        valid: false,
        etf,
        unitsPurchased: 0,
        leftoverCashToman: 0,
        buyPricePerUnitToman: buyPxNum,
        currentPricePerUnitToman: input.currentPricePerUnitToman ?? null,
        futurePricePerUnitToman: futPxNum,
        rawPurchaseValueToman: 0,
        buyFeeToman: 0,
        totalEntryCostToman: 0,
        currentHoldingValueToman: null,
        grossFutureValueToman: 0,
        sellFeeToman: 0,
        totalTradingFeesToman: 0,
        netFinalProceedsToman: 0,
        netProfitOrLossToman: 0,
        roiPct: 0,
        breakEvenUnitPriceToman: 0,
        futureDiffVsSnapshotToman: 0,
        futureChangeVsSnapshotPct: 0
      };
    }
    const budget = new Decimal(input.investmentAmountToman);
    const exactUnits = budget.div(unitCostWithFee);
    units = integerOnly ? exactUnits.floor() : exactUnits;
    const spent = units.times(unitCostWithFee);
    leftoverCash = Decimal.max(0, budget.minus(spent));
  } else {
    if (!(input.units > 0)) {
      return {
        valid: false,
        etf,
        unitsPurchased: 0,
        leftoverCashToman: 0,
        buyPricePerUnitToman: buyPxNum,
        currentPricePerUnitToman: input.currentPricePerUnitToman ?? null,
        futurePricePerUnitToman: futPxNum,
        rawPurchaseValueToman: 0,
        buyFeeToman: 0,
        totalEntryCostToman: 0,
        currentHoldingValueToman: null,
        grossFutureValueToman: 0,
        sellFeeToman: 0,
        totalTradingFeesToman: 0,
        netFinalProceedsToman: 0,
        netProfitOrLossToman: 0,
        roiPct: 0,
        breakEvenUnitPriceToman: 0,
        futureDiffVsSnapshotToman: 0,
        futureChangeVsSnapshotPct: 0
      };
    }
    units = integerOnly ? new Decimal(input.units).floor() : new Decimal(input.units);
  }

  if (units.lte(0)) {
    return {
      valid: false,
      etf,
      unitsPurchased: 0,
      leftoverCashToman: leftoverCash.toNumber(),
      buyPricePerUnitToman: buyPxNum,
      currentPricePerUnitToman: input.currentPricePerUnitToman ?? null,
      futurePricePerUnitToman: futPxNum,
      rawPurchaseValueToman: 0,
      buyFeeToman: 0,
      totalEntryCostToman: 0,
      currentHoldingValueToman: null,
      grossFutureValueToman: 0,
      sellFeeToman: 0,
      totalTradingFeesToman: 0,
      netFinalProceedsToman: 0,
      netProfitOrLossToman: 0,
      roiPct: 0,
      breakEvenUnitPriceToman: 0,
      futureDiffVsSnapshotToman: 0,
      futureChangeVsSnapshotPct: 0
    };
  }

  const rawPurchase = units.times(buyPx);
  const buyFee = rawPurchase.times(buyFeeRate);
  const totalEntryCost = rawPurchase.plus(buyFee);

  const curPx =
    input.currentPricePerUnitToman && input.currentPricePerUnitToman > 0
      ? new Decimal(input.currentPricePerUnitToman)
      : null;
  const currentHoldingValue = curPx ? units.times(curPx).toNumber() : null;

  const grossFutureValue = units.times(futPx);
  const sellFee = grossFutureValue.times(sellFeeRate);
  const netFinalProceeds = Decimal.max(0, grossFutureValue.minus(sellFee));
  const totalTradingFees = buyFee.plus(sellFee);

  const netProfit = netFinalProceeds.minus(totalEntryCost);
  const roiPct = totalEntryCost.gt(0) ? netProfit.div(totalEntryCost).times(100).toNumber() : 0;

  // قیمت سربه‌سر هر واحد: units * P_be * (1 - sellFeeRate) = totalEntryCost
  const keepRatio = new Decimal(1).minus(sellFeeRate);
  const breakEvenPx = keepRatio.gt(0) ? totalEntryCost.div(units.times(keepRatio)).toNumber() : 0;

  const snapPx = new Decimal(etf.snapshotPriceToman);
  const futDiffSnap = futPx.minus(snapPx);
  const futPctSnap = futDiffSnap.div(snapPx).times(100);

  return {
    valid: true,
    etf,
    unitsPurchased: units.toNumber(),
    leftoverCashToman: leftoverCash.toNumber(),
    buyPricePerUnitToman: buyPx.toNumber(),
    currentPricePerUnitToman: curPx ? curPx.toNumber() : null,
    futurePricePerUnitToman: futPx.toNumber(),
    rawPurchaseValueToman: rawPurchase.toNumber(),
    buyFeeToman: buyFee.toNumber(),
    totalEntryCostToman: totalEntryCost.toNumber(),
    currentHoldingValueToman: currentHoldingValue,
    grossFutureValueToman: grossFutureValue.toNumber(),
    sellFeeToman: sellFee.toNumber(),
    totalTradingFeesToman: totalTradingFees.toNumber(),
    netFinalProceedsToman: netFinalProceeds.toNumber(),
    netProfitOrLossToman: netProfit.toNumber(),
    roiPct,
    breakEvenUnitPriceToman: breakEvenPx,
    futureDiffVsSnapshotToman: futDiffSnap.toNumber(),
    futureChangeVsSnapshotPct: futPctSnap.toNumber()
  };
}

/* ============================================================
   ۷. تحلیل تاریخی دلار آزاد و تتر (مقایسه با مرجع یا طلای ۱۸ عیار)
   ============================================================ */

export interface FxHistoricalInput {
  referenceDateLabelFa: string;
  referenceDollarToman: number;
  referenceUsdtToman: number;
  currentDollarToman: number;
  currentUsdtToman: number;
  goldGrowthPctInSamePeriod?: number | null;
}

export interface FxHistoricalResult {
  valid: boolean;
  dollarDiffToman: number;
  dollarChangePct: number;
  usdtDiffToman: number;
  usdtChangePct: number;
  referenceUsdtSpreadPct: number;
  currentUsdtSpreadPct: number;
  goldOutperformanceVsDollarPct: number | null;
}

export function evaluateFxHistorical(input: FxHistoricalInput): FxHistoricalResult {
  if (
    !(input.referenceDollarToman > 0) ||
    !(input.referenceUsdtToman > 0) ||
    !(input.currentDollarToman > 0) ||
    !(input.currentUsdtToman > 0)
  ) {
    return {
      valid: false,
      dollarDiffToman: 0,
      dollarChangePct: 0,
      usdtDiffToman: 0,
      usdtChangePct: 0,
      referenceUsdtSpreadPct: 0,
      currentUsdtSpreadPct: 0,
      goldOutperformanceVsDollarPct: null
    };
  }

  const d0 = new Decimal(input.referenceDollarToman);
  const d1 = new Decimal(input.currentDollarToman);
  const u0 = new Decimal(input.referenceUsdtToman);
  const u1 = new Decimal(input.currentUsdtToman);

  const dDiff = d1.minus(d0);
  const dPct = dDiff.div(d0).times(100);

  const uDiff = u1.minus(u0);
  const uPct = uDiff.div(u0).times(100);

  const refSpread = u0.minus(d0).div(d0).times(100);
  const curSpread = u1.minus(d1).div(d1).times(100);

  const goldOutperf =
    input.goldGrowthPctInSamePeriod != null && Number.isFinite(input.goldGrowthPctInSamePeriod)
      ? input.goldGrowthPctInSamePeriod - dPct.toNumber()
      : null;

  return {
    valid: true,
    dollarDiffToman: dDiff.toNumber(),
    dollarChangePct: dPct.toNumber(),
    usdtDiffToman: uDiff.toNumber(),
    usdtChangePct: uPct.toNumber(),
    referenceUsdtSpreadPct: refSpread.toNumber(),
    currentUsdtSpreadPct: curSpread.toNumber(),
    goldOutperformanceVsDollarPct: goldOutperf
  };
}

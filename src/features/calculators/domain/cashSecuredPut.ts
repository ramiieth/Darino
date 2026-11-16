/**
 * موتور محاسبات مالی فروش اختیار فروش با وثیقه نقدی (Cash-Secured Put — CSP)
 *
 * تمام محاسبات صرفاً بر پایه اصول واقعی اختیار معامله و زمان واقعی باقیمانده تا سررسید هستند.
 * هیچ نرخ APR، پریمیوم یا محدودیت معامله‌ای به‌صورت ثابت (Hardcode) در کد قرار ندارد.
 * معماری ماژول به‌گونه‌ای طراحی شده که در نسخه‌های بعدی امکان افزودن Covered Call،
 * مقایسه چند پروتکل و ذخیره فرصت‌ها روی همین ساختار میسر باشد.
 */

export type OptionStrategyKind = 'cash-secured-put' | 'covered-call';
export type Moneyness = 'OTM' | 'ATM' | 'ITM';
export type ProtocolId = 'rysk' | 'custom';

export interface CspNetworkPreset {
  id: string;
  labelFa: string;
  chainId: number;
  collaterals: readonly string[];
}

export interface CspAssetPreset {
  symbol: string;
  nameFa: string;
  defaultNetworkId: string;
}

/** شبکه‌ها و وثیقه‌های متداول (صرفاً برای راحتی انتخاب؛ کاربر می‌تواند هر مقدار دلخواه وارد کند) */
export const CSP_NETWORK_PRESETS: readonly CspNetworkPreset[] = [
  { id: 'hyperevm', labelFa: 'HyperEVM (هایپرلیکویید)', chainId: 999, collaterals: ['USDT0', 'USDC'] },
  { id: 'ethereum', labelFa: 'Ethereum Mainnet', chainId: 1, collaterals: ['USDC', 'USDT'] },
  { id: 'arbitrum', labelFa: 'Arbitrum', chainId: 42161, collaterals: ['USDC', 'USDT'] }
];

export const CSP_ASSET_PRESETS: readonly CspAssetPreset[] = [
  { symbol: 'WHYPE', nameFa: 'رپد هایپ (WHYPE)', defaultNetworkId: 'hyperevm' },
  { symbol: 'HYPE', nameFa: 'هایپ (HYPE)', defaultNetworkId: 'hyperevm' },
  { symbol: 'ETH', nameFa: 'اتریوم (ETH)', defaultNetworkId: 'ethereum' },
  { symbol: 'BTC', nameFa: 'بیت‌کوین (BTC)', defaultNetworkId: 'ethereum' },
  { symbol: 'SOL', nameFa: 'سولانا (SOL)', defaultNetworkId: 'hyperevm' }
];

export interface CspInput {
  asset: string;
  networkLabel: string;
  chainId: number;
  collateralToken: string;
  spotPrice: number;
  strikePrice: number;
  /** تعداد واحد دارایی مورد تعهد */
  quantity: number;
  /** کل پریمیوم دریافتی به دلار (پیش از کارمزد) */
  premiumUsd: number;
  /** کارمزد کل معامله به دلار (اختیاری، پیش‌فرض ۰) */
  feeUsd?: number;
  /** زمان سررسید به میلی‌ثانیه (UTC Timestamp) */
  expiryTimestampMs: number;
  /** زمان فعلی به میلی‌ثانیه (برای محاسبه دقیق زمان باقیمانده و تست‌پذیری) */
  nowMs?: number;
}

export interface CspCalculation {
  valid: boolean;
  errors: string[];
  requiredCollateralUsd: number;
  grossPremiumUsd: number;
  feeUsd: number;
  netPremiumUsd: number;
  premiumPctOfCollateral: number;
  netYieldPct: number;
  premiumPerUnit: number;
  netPremiumPerUnit: number;
  netEffectiveBuyPrice: number;
  breakEvenPrice: number;
  strikeVsSpotPct: number;
  discountFromSpotPct: number;
  remainingMs: number;
  remainingHours: number;
  remainingDays: number;
  expired: boolean;
  /** نرخ سالانه‌شده بر اساس پریمیوم خالص و زمان واقعی باقیمانده (نشانگر مرجع، نه سود تضمینی) */
  aprPct: number | null;
  grossAprPct: number | null;
  maxProfitUsd: number;
  maxLossUsd: number;
  currentMoneyness: Moneyness;
}

export interface CspScenarioRow {
  expiryPrice: number;
  moneyness: Moneyness;
  assigned: boolean;
  /** تعداد واحد دارایی دریافتی در سررسید (در صورت اعمال) */
  assetReceivedQty: number;
  /** ارزش دلاری دارایی دریافتی در قیمت سررسید */
  assetReceivedValueUsd: number;
  /** مانده استیبل‌کوین در پایان معامله (شامل پریمیوم خالص) */
  endingStablecoinUsd: number;
  /** ارزش کل موقعیت در سررسید (استیبل‌کوین + دارایی دریافتی) */
  totalEndingValueUsd: number;
  /** سود یا زیان اقتصادی خالص کل معامله به دلار */
  economicPnlUsd: number;
  /** بازده اقتصادی دوره نسبت به وثیقه (درصد) */
  economicReturnPct: number;
  /** مقدار افت قیمت از Strike که توسط پریمیوم خالص جبران شده (دلار کل) */
  premiumBufferUsd: number;
  /** چند درصد از افت قیمت زیر Strike توسط پریمیوم جبران شده (۰ تا ۱۰۰٪) */
  premiumBufferPctOfDrop: number | null;
}

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/** برآورد کارمزد اجرایی پروتکل Rysk V12 طبق مستندات: min(1% * spot, 12.5% * premiumPerUnit) * quantity */
export function estimateRyskFeeUsd(spotPrice: number, premiumPerUnit: number, quantity: number): number {
  if (!(spotPrice > 0) || !(premiumPerUnit >= 0) || !(quantity > 0)) return 0;
  const perOption = Math.min(0.01 * spotPrice, 0.125 * premiumPerUnit);
  return perOption * quantity;
}

/** تشخیص وضعیت اختیار فروش (Put) نسبت به قیمت اعمال: S < K → ITM، S > K → OTM */
export function putMoneyness(price: number, strikePrice: number): Moneyness {
  if (!(strikePrice > 0)) return 'OTM';
  const relDiff = Math.abs(price - strikePrice) / strikePrice;
  if (relDiff <= 0.001) return 'ATM';
  return price < strikePrice ? 'ITM' : 'OTM';
}

/** محاسبه کامل شاخص‌های مالی Cash-Secured Put */
export function calculateCsp(input: CspInput): CspCalculation {
  const errors: string[] = [];
  const nowMs = input.nowMs ?? Date.now();
  const feeUsd = Number.isFinite(input.feeUsd) && (input.feeUsd ?? 0) >= 0 ? input.feeUsd! : 0;

  if (!(input.spotPrice > 0)) errors.push('قیمت فعلی دارایی باید بزرگ‌تر از صفر باشد.');
  if (!(input.strikePrice > 0)) errors.push('قیمت اعمال (Strike) باید بزرگ‌تر از صفر باشد.');
  if (!(input.quantity > 0)) errors.push('تعداد واحد دارایی یا مبلغ وثیقه باید بزرگ‌تر از صفر باشد.');
  if (!(input.premiumUsd >= 0) || !Number.isFinite(input.premiumUsd)) errors.push('مبلغ پریمیوم نامعتبر است.');
  if (!Number.isFinite(input.expiryTimestampMs)) errors.push('تاریخ و ساعت سررسید نامعتبر است.');

  const remainingMs = Math.max(0, input.expiryTimestampMs - nowMs);
  const expired = remainingMs <= 0;
  if (expired) errors.push('تاریخ سررسید انتخاب‌شده در گذشته است؛ لطفاً زمان آینده را انتخاب کنید.');

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      requiredCollateralUsd: 0,
      grossPremiumUsd: 0,
      feeUsd: 0,
      netPremiumUsd: 0,
      premiumPctOfCollateral: 0,
      netYieldPct: 0,
      premiumPerUnit: 0,
      netPremiumPerUnit: 0,
      netEffectiveBuyPrice: 0,
      breakEvenPrice: 0,
      strikeVsSpotPct: 0,
      discountFromSpotPct: 0,
      remainingMs: 0,
      remainingHours: 0,
      remainingDays: 0,
      expired,
      aprPct: null,
      grossAprPct: null,
      maxProfitUsd: 0,
      maxLossUsd: 0,
      currentMoneyness: 'OTM'
    };
  }

  const requiredCollateralUsd = input.strikePrice * input.quantity;
  const grossPremiumUsd = input.premiumUsd;
  const netPremiumUsd = grossPremiumUsd - feeUsd;
  const premiumPctOfCollateral = (grossPremiumUsd / requiredCollateralUsd) * 100;
  const netYieldPct = (netPremiumUsd / requiredCollateralUsd) * 100;
  const premiumPerUnit = grossPremiumUsd / input.quantity;
  const netPremiumPerUnit = netPremiumUsd / input.quantity;

  // قیمت تمام‌شده خالص خرید در صورت اعمال: Strike - PremiumPerUnit (با لحاظ کارمزد)
  const netEffectiveBuyPrice = Math.max(0, input.strikePrice - netPremiumPerUnit);
  const breakEvenPrice = netEffectiveBuyPrice;

  const strikeVsSpotPct = ((input.strikePrice - input.spotPrice) / input.spotPrice) * 100;
  const discountFromSpotPct = ((input.spotPrice - netEffectiveBuyPrice) / input.spotPrice) * 100;

  const remainingHours = remainingMs / MS_PER_HOUR;
  const remainingDays = remainingMs / MS_PER_DAY;
  const aprPct = remainingDays > 0 ? (netYieldPct / remainingDays) * 365 : null;
  const grossAprPct = remainingDays > 0 ? (premiumPctOfCollateral / remainingDays) * 365 : null;

  const maxProfitUsd = netPremiumUsd;
  const maxLossUsd = Math.max(0, requiredCollateralUsd - netPremiumUsd);

  return {
    valid: true,
    errors: [],
    requiredCollateralUsd,
    grossPremiumUsd,
    feeUsd,
    netPremiumUsd,
    premiumPctOfCollateral,
    netYieldPct,
    premiumPerUnit,
    netPremiumPerUnit,
    netEffectiveBuyPrice,
    breakEvenPrice,
    strikeVsSpotPct,
    discountFromSpotPct,
    remainingMs,
    remainingHours,
    remainingDays,
    expired: false,
    aprPct,
    grossAprPct,
    maxProfitUsd,
    maxLossUsd,
    currentMoneyness: putMoneyness(input.spotPrice, input.strikePrice)
  };
}

/** ارزیابی دقیق سود و زیان اقتصادی موقعیت CSP در یک قیمت مشخص در سررسید */
export function evaluateCspScenario(
  input: Pick<CspInput, 'strikePrice' | 'quantity'>,
  calc: Pick<CspCalculation, 'requiredCollateralUsd' | 'netPremiumUsd' | 'netPremiumPerUnit'>,
  expiryPrice: number
): CspScenarioRow {
  const safePrice = Math.max(0, expiryPrice);
  const moneyness = putMoneyness(safePrice, input.strikePrice);
  // در اختیار فروش، اگر قیمت سررسید پایین‌تر از Strike باشد اختیار ITM است و اعمال می‌شود
  const assigned = safePrice < input.strikePrice;

  const assetReceivedQty = assigned ? input.quantity : 0;
  const assetReceivedValueUsd = assigned ? safePrice * input.quantity : 0;
  const endingStablecoinUsd = assigned
    ? calc.netPremiumUsd
    : calc.requiredCollateralUsd + calc.netPremiumUsd;
  const totalEndingValueUsd = endingStablecoinUsd + assetReceivedValueUsd;
  const economicPnlUsd = totalEndingValueUsd - calc.requiredCollateralUsd;
  const economicReturnPct =
    calc.requiredCollateralUsd > 0 ? (economicPnlUsd / calc.requiredCollateralUsd) * 100 : 0;

  const dropBelowStrike = Math.max(0, input.strikePrice - safePrice);
  const premiumBufferUsd = assigned
    ? Math.min(dropBelowStrike, Math.max(0, calc.netPremiumPerUnit)) * input.quantity
    : 0;
  const premiumBufferPctOfDrop =
    assigned && dropBelowStrike > 0
      ? Math.min(100, Math.max(0, (calc.netPremiumPerUnit / dropBelowStrike) * 100))
      : null;

  return {
    expiryPrice: safePrice,
    moneyness,
    assigned,
    assetReceivedQty,
    assetReceivedValueUsd,
    endingStablecoinUsd,
    totalEndingValueUsd,
    economicPnlUsd,
    economicReturnPct,
    premiumBufferUsd,
    premiumBufferPctOfDrop
  };
}

/** تولید قیمت‌های پیشنهادی معنادار برای جدول سناریوها بر اساس قیمت اعمال */
export function buildDefaultScenarioPrices(strikePrice: number, breakEvenPrice?: number): number[] {
  if (!(strikePrice > 0)) return [];
  const round = (v: number) => (v >= 100 ? Math.round(v) : Math.round(v * 100) / 100);
  const raw = [
    round(strikePrice * 1.2),
    round(strikePrice * 1.08),
    round(strikePrice),
    ...(breakEvenPrice && breakEvenPrice > 0 && Math.abs(breakEvenPrice - strikePrice) / strikePrice > 0.003
      ? [round(breakEvenPrice)]
      : [round(strikePrice * 0.975)]),
    round(strikePrice * 0.9),
    round(strikePrice * 0.75)
  ];
  return [...new Set(raw.filter((x) => x > 0))].sort((a, b) => b - a);
}

/** ساخت لینک مستقیم معامله در Rysk Finance بدون اجرای هیچ تراکنشی در دارینو */
export function buildRyskEarnUrl(params: {
  chainId: number;
  asset: string;
  collateralToken: string;
  expiryTimestampMs: number;
}): string {
  const u = new URL('https://app.rysk.finance/earn/');
  u.searchParams.set('chainId', String(params.chainId || 999));
  u.searchParams.set('asset', params.asset.trim().toUpperCase() || 'WHYPE');
  const col = params.collateralToken.trim().toUpperCase() || 'USDT0';
  u.searchParams.set('collateral', col);
  u.searchParams.set('strike', col);
  u.searchParams.set('type', 'put');
  if (Number.isFinite(params.expiryTimestampMs) && params.expiryTimestampMs > 0) {
    u.searchParams.set('expiry', String(Math.floor(params.expiryTimestampMs / 1000)));
  }
  return u.toString();
}

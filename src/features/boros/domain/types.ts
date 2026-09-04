/** ============================================================
 * Boros — تایپ‌های پایه (از پاسخ رسمی API)
 * ============================================================ */

export interface BorosMarket {
  marketId: number;
  name: string;
  symbol: string;
  venue: string; // Hyperliquid | Binance | OKX | Gate ...
  asset: string; // BTC | ETH | SOL ...
  fundingRateSymbol: string;
  maturity: number; // ثانیه
  marginFloor: number; // rateFloor
  /** YTMFloor — پارامتر پروتکل (API عمومی expose نمی‌کند؛ در نبودش engine از پیش‌فرض استفاده می‌کند) */
  ytmFloor?: number;
  tickStep: number;
  iTickThresh: number;
  maxLeverage: number;
  isUiWhitelisted: boolean;
  /* --- پارامترهای اقتصادی (مستقیم از API) --- */
  kIM: number; // Initial Margin Ratio
  kMM: number; // Maintenance Margin Ratio
  takerFee: number; // نسبت
  otcFee: number;
  settleFeeRate: number; // نسبت هر تسویه
  paymentPeriod: number; // ثانیه (۸ ساعت)
  hardOICap: number;
  softOICap: number;
  maxRateDeviationFactorBase1e4: number;
  liqBase: number;
  liqSlope: number;
  liqFeeRate: number;
  /* --- داده لحظه‌ای --- */
  markApr: number;
  lastTradedApr: number;
  midApr: number;
  floatingApr: number;
  longYieldApr: number;
  notionalOI: number;
  volume24h: number;
  nextSettlementTime: number;
  settlementsToMaturity: number;
  rateSensitivity: number;
  dailyVolatility: number | null;
  bestBid: number;
  bestAsk: number;
  assetMarkPrice: number;
  /* --- تاریخچه (OHLCV روزانه — c = APR) --- */
  ohlcv: { ts: number; c: number }[];
}

/** خروجی شبیه‌سازی سفارش از API */
export interface BorosSimResult {
  size: string;
  cost: string;
  rate: number;
  marginRequired: string;
  priceImpact: number;
  takerOtcFee: string;
  actualRate: number;
}

export type BorosDirection = 'long' | 'short';

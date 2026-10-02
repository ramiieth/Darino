/** ============================================================
 * Arcus — انواع پاسخ (برگرفته از openapi رسمی: docs.arcus.xyz/api-reference/public/*)
 * مقادیر مالی رشتهٔ اعشاری‌اند؛ زمان‌ها میکروثانیه‌اند و پس از
 * parseJsonPreservingBigInts ممکن است رشته باشند (۱۶ رقم) — همیشه با toUs بخوانید.
 * ============================================================ */

export type BigNum = number | string;

export interface ArcusPosition {
  address: string;
  accountIndex: number;
  marketId: number;
  marketDisplayName: string;
  side: 'LONG' | 'SHORT';
  /** «Signed position quantity» — مقیاس در مستندات صریح نیست؛ همان رشتهٔ API نمایش داده می‌شود */
  size: string;
  averageEntryPrice: string;
  cumulativeFunding?: { allTime: string; sinceOpen: string; sinceChange: string };
  leverage: string;
  marginMode: 'CROSS' | 'ISOLATED';
  borrowedCapital: string;
  marginUsed: string;
  positionValueNotional: string;
  /** طبق مستندات: «Unrealized margin delta» */
  unrealizedPnl: string;
  /** "0" یعنی mark در دسترس نبوده */
  markPx: string;
  sequenceNumber?: BigNum;
}

export interface ArcusAccount {
  accountIndex: number;
  address: string;
  netQuoteBalance: string;
  equity: string;
  freeCollateral: string;
  netDeposits: string;
  pendingDeposits: string;
  pendingWithdrawals: string;
  positions: Record<string, ArcusPosition>;
  sequenceNumber: BigNum;
}

export interface ArcusOrder {
  orderId: string;
  clientId?: string;
  marketId: number;
  marketDisplayName: string;
  side: 'BUY' | 'SELL';
  type?: 'LIMIT' | 'MARKET';
  status: string;
  price: string;
  originalSize: string;
  filledSize?: string;
  remainingSize: string;
  avgFillPrice?: string;
  timeInForce?: string;
  reduceOnly?: boolean;
  triggerPrice?: string;
  tpslType?: 'STOP_LOSS' | 'TAKE_PROFIT';
  isPositionTPSL?: boolean;
  parentOrderId?: string;
  rejectionReason?: string;
  createdAt?: BigNum;
  updatedAt: BigNum;
}

export interface ArcusFill {
  tradeId: string;
  orderId: string;
  marketId: number;
  marketDisplayName: string;
  side: 'BUY' | 'SELL';
  originalSize: string;
  size: string;
  price: string;
  fee: string;
  closedPnl?: string;
  role: 'MAKER' | 'TAKER';
  positionEffect?: string;
  createdAt: BigNum;
  liquidation?: { method: 'LIQUIDATION' | 'ADL'; liquidatedUser: string };
}

export interface ArcusFunding {
  marketId: number;
  marketDisplayName: string;
  fundingRate: string;
  size: string;
  payment: string;
  time: BigNum;
}

export interface ArcusTransfer {
  type: string;
  status: string;
  rejectReason?: string;
  id: string;
  amount: string;
  netQuoteBalance: string;
  globalSequenceId: BigNum;
  createdAt: BigNum;
  address: string;
  accountIndex: number;
  sourceAccountId?: string;
  destinationAccountId?: string;
}

export interface ArcusLeverage {
  marketId: number;
  marketDisplayName: string;
  leverage: number;
  isolated: boolean;
  marginMode: 'CROSS' | 'ISOLATED';
}

export interface ArcusMarket {
  marketDisplayName: string;
  fullAssetName?: string;
  marketId: number;
  status?: string;
  baseAsset?: string;
  quoteAsset?: string;
  oraclePrice?: string | null;
  markPrice?: string | null;
}

export type PortfolioPoint = [BigNum, string];
export interface PortfolioSeries {
  accountEquityHistory?: PortfolioPoint[];
  pnlHistory?: PortfolioPoint[];
  [k: string]: unknown;
}
export interface ArcusPortfolio {
  address: string;
  accountIndex: number;
  generatedAt: BigNum;
  lifetimeVolume: string;
  data: [string, PortfolioSeries][];
}

/** زمان میکروثانیه به رشتهٔ دقیق */
export function toUs(v: BigNum | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  return typeof v === 'string' ? v : Number.isSafeInteger(v) ? String(v) : null;
}

/** میکروثانیه (رشته) → میلی‌ثانیه برای نمایش تاریخ */
export function usToMsNumber(v: BigNum | undefined | null): number | null {
  const s = toUs(v);
  if (!s) return null;
  return Number(BigInt(s) / 1000n);
}

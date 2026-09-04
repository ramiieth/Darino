/** ============================================================
 * HyperliquidService — سرویس رسمی Hyperliquid (فقط Watch Only)
 * منبع: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint
 * Base: https://api.hyperliquid.xyz/info (POST)
 * ⚠️ فقط اندپوینت‌های Info عمومی؛ هیچ معامله/امضا/برداشت وجود ندارد.
 * همه درخواست‌ها: Timeout ۸s + Retry + مدیریت خطا + کش IndexedDB (۶۰ ثانیه).
 * ============================================================ */
import { fetchWithRetry } from '@/shared/lib/fetchWithRetry';
import { cacheBulkGetPrice, cachePutPrice } from '@/shared/lib/db';

const HL_URL = 'https://api.hyperliquid.xyz/info';
const CACHE_MS = 60_000;

export interface HlMarginSummary {
  accountValue: string;
  totalNtlPos: string;
  totalRawUsd: string;
  totalMarginUsed: string;
}

export interface HlPosition {
  coin: string;
  szi: string;
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  liquidationPx: string | null;
  marginUsed: string;
  leverage: { type: string; value: number };
  cumFunding: { allTime: string; sinceChange: string; sinceOpen: string } | null;
  openTime?: number | null;
}

export interface HlAssetPosition {
  position: HlPosition;
  type?: string;
}

export interface HlClearinghouseState {
  marginSummary: HlMarginSummary;
  crossMarginSummary: HlMarginSummary;
  withdrawable: string;
  assetPositions: HlAssetPosition[];
  time?: number;
}

export interface HlOpenOrder {
  coin: string;
  side: 'B' | 'A';
  limitPx: string;
  sz: string;
  origSz: string;
  oid: number;
  timestamp: number;
  isReduceOnly: boolean;
  triggerPx?: string | null;
  orderType?: string;
  children?: HlOpenOrder[];
}

export interface HlFill {
  coin: string;
  px: string;
  sz: string;
  side: 'B' | 'A';
  time: number;
  startPosition: string;
  dir: string;
  closedPnl: string;
  hash: string;
  oid?: number;
  crossed?: boolean;
  fee?: string;
  tid?: number;
}

export interface HlFundingPoint {
  coin: string;
  usdc: string;
  time: number;
  delta: string;
}

export interface HlMetaAsset {
  universe: { name: string; szDecimals: number; maxLeverage: number }[];
  tokens?: string[];
}

export interface HlAssetCtx {
  prevDayPx: string;
  dayNtlVlm: string;
  markPx: string;
  funding: string;
  openInterest: string;
  oraclePx: string;
  premium?: string;
  dayBaseVlm?: string;
}

async function info<T>(payload: Record<string, unknown>): Promise<T> {
  const res = await fetchWithRetry(HL_URL, {
    retries: 1,
    timeoutMs: 8_000,
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' }
  });
  if (!res.ok) throw new Error(`Hyperliquid HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** فراخوانی با کش کوتاه‌مدت (۶۰ ثانیه) — جلوگیری از مصرف بی‌مورد API */
async function infoCached<T>(key: string, body: Record<string, unknown>): Promise<T> {
  const ck = `hl:${key}`;
  try {
    const rec = await cacheBulkGetPrice([ck]);
    const r = rec.get(ck);
    if (r && Date.now() - r.fetchedAt < CACHE_MS) return r.price as unknown as T;
  } catch {
    /* ادامه */
  }
  const res = await info<T>(body);
  try {
    await cachePutPrice(ck, { price: res as unknown as number, source: 'live', fetchedAt: Date.now() });
  } catch {
    /* خاموش */
  }
  return res;
}

/** متادیتا + وضعیت همه بازارها (یک درخواست) */
export async function hlMetaAndCtxs(): Promise<[HlMetaAsset, HlAssetCtx[]]> {
  return infoCached<[HlMetaAsset, HlAssetCtx[]]>('meta', { type: 'metaAndAssetCtxs' });
}

/** وضعیت کامل حساب (فقط آدرس) */
export async function hlClearinghouseState(user: string): Promise<HlClearinghouseState> {
  return infoCached<HlClearinghouseState>(`state:${user}`, { type: 'clearinghouseState', user });
}

/** سفارش‌های باز */
export async function hlOpenOrders(user: string): Promise<HlOpenOrder[]> {
  return infoCached<HlOpenOrder[]>(`orders:${user}`, { type: 'openOrders', user });
}

/** تاریخچه معاملات (فیل‌ها) — حداکثر ۲۰۰۰+ */
export async function hlUserFills(user: string): Promise<HlFill[]> {
  return infoCached<HlFill[]>(`fills:${user}`, { type: 'userFills', user });
}

/** Funding پرداختی/دریافتی */
export async function hlUserFunding(user: string): Promise<HlFundingPoint[]> {
  return infoCached<HlFundingPoint[]>(`funding:${user}`, { type: 'userFunding', user });
}

/** سوابق غیرفاندینگ (برای PnL محقق‌شده) */
export async function hlNonFundingLedger(user: string): Promise<{ time: number; usdc: string; type: string }[]> {
  return info<{ time: number; usdc: string; type: string }[]>({ type: 'userNonFundingLedgerUpdates', user });
}

/** اعتبارسنجی آدرس کیف پول EVM/Hyperliquid */
export function isValidAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr.trim());
}

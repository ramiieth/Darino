/** ============================================================
 * Boros — Liquidation Implied APR (Position-Specific)
 *
 * ⚠️ اصل معماری: Liquidation Implied APR یک ویژگی «Market» نیست؛
 *    یک ویژگی «Position» است. بدون Position واقعی (Deposit/Collateral/
 *    Notional/Health Factor) هرگز محاسبه/حدس زده نمی‌شود → N/A.
 *
 * منابع مجاز مقدار:
 *  - boros_position_api       → داده رسمی Position از API بوروس
 *  - boros_position_data      → داده Position واقعی (تأییدشده)
 *  - simulation_official_api  → فقط اگر بوروس endpoint رسمی شبیه‌سازی
 *                               لیکوییدیشن مستند ارائه کند
 *  - na                       → بدون Position → N/A
 *
 * ممنوع: source = "calculated" مگر فرمول رسمی مستند بوروس موجود باشد.
 * ============================================================ */

export type LiquidationAPRSource =
  | 'boros_position_api'
  | 'boros_position_data'
  | 'boros_preview'
  | 'simulation_official_api'
  | 'na';

export type LiquidationAPRStatus = 'available' | 'position-required' | 'unavailable';

/** مدل صریح Liquidation APR — value فقط وقتی مجاز است که source معتبر و Position واقعی باشد */
export interface LiquidationAPRData {
  /** مقدار (درصد — مثل -0.24 یا -67.87 یا 78.23) — null = N/A */
  value: number | null;
  source: LiquidationAPRSource;
  status: LiquidationAPRStatus;
  /** همیشه true برای Liquidation APR — ویژگی ذاتاً Position-Specific است */
  isPositionSpecific: boolean;
  positionId?: string;
  collateral?: number;
  notional?: number;
  direction?: 'long' | 'short';
}

/** N/A استاندارد — بدون Position واقعی (Market Scanner / Simulator / بدون Deposit) */
export const NA_LIQUIDATION_APR: LiquidationAPRData = {
  value: null,
  source: 'na',
  status: 'position-required',
  isPositionSpecific: true
};

export interface PositionLiquidationInput {
  /** مقدار رسمی Liquidation Implied APR از بوروس (درصد — مثل -67.87) */
  value: number;
  source: Exclude<LiquidationAPRSource, 'na'>;
  positionId?: string;
  collateral?: number;
  notional?: number;
  direction?: 'long' | 'short';
}

/**
 * ساخت Liquidation APR از داده واقعی Position (فقط منبع رسمی).
 * اگر مقدار معتبر نباشد → N/A (هرگز حدس نمی‌زنیم).
 */
export function makePositionLiquidationAPR(
  input: PositionLiquidationInput | null | undefined
): LiquidationAPRData {
  if (!input) return NA_LIQUIDATION_APR;
  if (!Number.isFinite(input.value)) return NA_LIQUIDATION_APR;
  return {
    value: input.value,
    source: input.source,
    status: 'available',
    isPositionSpecific: true,
    positionId: input.positionId,
    collateral: input.collateral,
    notional: input.notional,
    direction: input.direction
  };
}

/**
 * Liquidation Buffer (فقط وقتی Liquidation APR موجود است):
 *   |Current Implied APR − Liquidation Implied APR| به درصد-point
 * اگر Liquidation APR = N/A → null (هرگز ۰ یا تخمینی).
 */
export function liquidationBufferPct(
  currentImpliedAprPct: number | null,
  liquidationAprPct: number | null
): number | null {
  if (currentImpliedAprPct === null || liquidationAprPct === null) return null;
  return Math.abs(currentImpliedAprPct - liquidationAprPct);
}

/** Buffer از روی مدل صریح — null اگر value موجود نباشد */
export function liquidationBufferFromData(
  currentImpliedAprPct: number | null,
  data: LiquidationAPRData
): number | null {
  return liquidationBufferPct(currentImpliedAprPct, data.value);
}

/** آیا این Liquidation APR قابل نمایش است؟ (فقط وقتی Position واقعی + منبع رسمی) */
export function isLiquidationAPRAvailable(d: LiquidationAPRData): boolean {
  return d.value !== null && d.status === 'available' && d.source !== 'na';
}

/* ---------------- برچسب‌های فارسی (UI) ---------------- */

export const LIQUIDATION_SOURCE_FA: Record<LiquidationAPRSource, string> = {
  boros_position_api: 'API رسمی Position بوروس',
  boros_position_data: 'داده Position واقعی بوروس',
  boros_preview: 'پیش‌نمایش رسمی سفارش بوروس',
  simulation_official_api: 'شبیه‌سازی رسمی بوروس',
  na: 'N/A'
};

export const LIQUIDATION_NA_REASON =
  'برای محاسبه Liquidation APR واقعی، Position و Collateral فعال در Boros لازم است — بدون Position واقعی این مقدار N/A است.';

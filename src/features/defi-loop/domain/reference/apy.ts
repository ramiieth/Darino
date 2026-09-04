/**
 * Reference Loop APY — فرمول مرجع DeFiLlama
 *
 *   Looped APY = Effective Supply APY × Leverage − Net Borrow APY × (Leverage − 1)
 *
 *   Effective Supply APY = Supply Base APY + Supply Reward APY
 *   Net Borrow APY       = Borrow Base APY − Borrow Reward APY (Incentive)
 *
 * ⚠️ این APY مرجع «خالص DeFiLlama» است — Gas/Slippage/Bridge کاربر داخل آن نیست.
 * ⚠️ Reward دوباره جمع نمی‌شود (اگر Supply APY کل داده شده، فقط از اجزا استفاده می‌کنیم).
 * ⚠️ گرد کردن فقط در نمایش — محاسبه داخلی با دقت بالا.
 */

/** Looped APY (Decimal) — null اگر هر ورودی ناشناخته باشد */
export function loopedApy(
  effectiveSupplyApy: number | null,
  netBorrowApy: number | null,
  leverage: number
): number | null {
  if (effectiveSupplyApy === null || netBorrowApy === null) return null;
  if (!Number.isFinite(leverage) || leverage <= 0) return null;
  return effectiveSupplyApy * leverage - netBorrowApy * (leverage - 1);
}

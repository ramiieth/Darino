/**
 * Reference Loop Engine — مدل مرجع DeFiLlama (Leveraged Lending)
 *
 * مدل: سرمایه اولیه C + ۵ گام بازگشتی Supply/Borrow با نرخ LTV
 *   Leverage = Σ LTV^i  برای i = 0..5  = 1 + L + L² + L³ + L⁴ + L⁵
 *   Total Supply  = C × Leverage
 *   Total Borrow  = C × (Leverage − 1)
 *
 * ⚠️ این موتور فقط Reference است — هیچ کاهش ریسکی/ضریب مخفی ندارد.
 * ⚠️ هرگز Hardcode نمی‌کند (نه 3.3x نه 4.2x) — همه‌چیز از LTV و تعداد Loop.
 */
export const REFERENCE_LOOPS = 5;

/**
 * Leverage مرجع برای LTV و تعداد حلقه مشخص:
 *   calculateLoopLeverage(0.75, 5) = 3.2880859375  (نمایش: 3.3x)
 *   calculateLoopLeverage(0.85, 5) = 4.1523365625  (نمایش: 4.2x)
 */
export function calculateLoopLeverage(ltv: number, loops = REFERENCE_LOOPS): number {
  if (!Number.isFinite(ltv) || ltv <= 0) return 1;
  const n = Math.max(0, Math.floor(loops));
  let leverage = 0;
  let term = 1; // L^0
  for (let i = 0; i <= n; i++) {
    leverage += term;
    term *= ltv;
  }
  return leverage;
}

export interface ReferenceLoopResult {
  /** تعداد گام‌های بازگشتی (پیش‌فرض ۵ — دقیقاً «سرمایه اولیه + ۵ گام» یعنی Σ تا L⁵) */
  loops: number;
  /** Leverage = Σ LTV^i (دقت بالا — گرد کردن فقط در نمایش) */
  leverage: number;
  totalSupply: number;
  totalBorrow: number;
}

/** کل مدل مرجع برای سرمایه و LTV معین */
export function referenceLoop(
  ltv: number,
  initialCapital: number,
  loops = REFERENCE_LOOPS
): ReferenceLoopResult {
  const n = Math.max(0, Math.floor(loops));
  const leverage = calculateLoopLeverage(ltv, n);
  const totalSupply = initialCapital * leverage;
  const totalBorrow = totalSupply - initialCapital;
  return { loops: n, leverage, totalSupply, totalBorrow };
}

/**
 * حداکثر تعداد Loop مرجع با احترام به محدودیت نقدینگی قابل‌قرض:
 *   بزرگ‌ترین n ≤ maxLoops که Total Borrow(n) ≤ liquidity
 */
export function referenceLoopsByLiquidity(
  ltv: number,
  initialCapital: number,
  maxLoops: number,
  availableBorrowLiquidity: number | null
): number {
  const n = Math.max(0, Math.floor(maxLoops));
  if (availableBorrowLiquidity === null) return n;
  for (let i = 1; i <= n; i++) {
    const borrowAtI = initialCapital * (calculateLoopLeverage(ltv, i) - 1);
    if (borrowAtI > availableBorrowLiquidity) return Math.max(0, i - 1);
  }
  return n;
}

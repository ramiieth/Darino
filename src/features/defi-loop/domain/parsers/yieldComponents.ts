/**
 * Parsers — نرمال‌سازی ورودی‌ها و اجزای APY
 *
 * ⚠️ قواعد:
 *  - همه فرمول‌ها با Decimal کار می‌کنند (0.0979) — هرگز درصد (9.79) نه.
 *  - Reward هرگز دوباره جمع نمی‌شود: اگر اجزا موجودند، از اجزا می‌سازیم؛
 *    اگر apyBase نال باشد، پایه = کل − Reward (≥ 0) — بدون double-count.
 *  - Borrow Incentive: netBorrow = base − reward.
 */

export interface YieldComponents {
  /** APY پایه Supply (Decimal) */
  supplyBaseAPY: number;
  /** APY پاداش Supply (Decimal) */
  supplyRewardAPY: number;
  /** APY پایه Borrow (Decimal) — null = ناشناخته */
  borrowBaseAPY: number | null;
  /** APY پاداش/Incentive Borrow (Decimal) — null = بدون پاداش */
  borrowRewardAPY: number | null;
}

export function effectiveSupplyAPY(c: YieldComponents): number {
  return c.supplyBaseAPY + c.supplyRewardAPY;
}

/** Borrow خالص = پایه − پاداش (پاداش هزینه را کاهش می‌دهد) — null اگر پایه ناشناخته باشد */
export function netBorrowAPY(c: YieldComponents): number | null {
  if (c.borrowBaseAPY === null) return null;
  return c.borrowBaseAPY - (c.borrowRewardAPY ?? 0);
}

/**
 * ساخت اجزای Supply از فیلدهای DeFiLlama (apy/apyBase/apyReward — درصد).
 * جلوگیری از double-count: اگر apyBase نال است → base = max(0, apy − reward).
 */
export function parseSupplyComponents(
  apyPct: number | null | undefined,
  apyBasePct: number | null | undefined,
  apyRewardPct: number | null | undefined
): { base: number; reward: number } {
  const reward = (apyRewardPct ?? 0) / 100;
  let base: number;
  if (apyBasePct !== null && apyBasePct !== undefined) {
    base = apyBasePct / 100;
  } else if (apyPct !== null && apyPct !== undefined) {
    // اجزا موجود نیست → پایه = کل − reward (هرگز reward را دوباره جمع نکن)
    base = Math.max(0, apyPct / 100 - reward);
  } else {
    base = 0;
  }
  return { base, reward };
}

/** نرمال‌سازی ورودی LTV: «75%» یا «0.75» یا «75» → 0.75 — نامعتبر → null */
export function parseLtvInput(input: string | number): number | null {
  const s = String(input).trim().replace(/٪/g, '%');
  if (!s) return null;
  const isPct = s.endsWith('%');
  const v = Number(s.replace(/%$/, '').trim());
  if (!Number.isFinite(v) || v <= 0) return null;
  if (isPct) return Math.min(v, 100) / 100;
  // بدون علامت: مقدار ≤ 1 = نسبت؛ مقدار > 1 = درصد
  if (v <= 1) return v;
  return Math.min(v, 100) / 100;
}

/** نرمال‌سازی ورودی درصدی (APY/Gas نیست — برای Borrow APY): «5%» یا «0.05» یا «5» → 0.05 — نامعتبر → null */
export function parsePercentInput(input: string | number): number | null {
  const s = String(input).trim().replace(/٪/g, '%');
  if (!s) return null;
  const isPct = s.endsWith('%');
  const v = Number(s.replace(/%$/, '').trim());
  if (!Number.isFinite(v)) return null;
  if (isPct) return v / 100;
  if (Math.abs(v) <= 1) return v; // قبلاً Decimal
  return v / 100; // عدد ساده = درصد
}

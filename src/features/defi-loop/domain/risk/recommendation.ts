/**
 * Risk Engine — Recommended Safe Loops
 *
 * شبیه‌سازی بازگشتی با همان مدل Reference (Borrow = LTV × Supply گام) اما
 * با توقف بر اساس HF ایمنی (hfMin از Safety Level کاربر).
 *
 * ⚠️ Leverage مرجع (۵ حلقه) هرگز تغییر نمی‌کند — فقط «توصیه» جدا محاسبه می‌شود.
 * ⚠️ هیچ borrowFactor/ضریب مخفی وجود ندارد.
 */

import { calculateLoopLeverage } from '@/features/defi-loop/domain/reference/leverage';
import { healthFactor } from '@/features/defi-loop/domain/risk/healthFactor';

export interface RecStep {
  loop: number;
  /** مقدار Supply‌شده در این گام (= Borrow گام قبل، یا سرمایه اولیه) */
  supply: number;
  borrow: number;
  totalSupply: number;
  totalBorrow: number;
  leverage: number;
  healthFactor: number | null;
  status: 'safe' | 'warning';
}

export interface SafeLoopSimulation {
  steps: RecStep[];
  /** تعداد Loopهای پیشنهادی (HF بالای حد ایمنی با فاصله) — حداقل ۱ (بدون اهرم) */
  recommendedLoops: number;
  /** همه گام‌های شبیه‌سازی‌شده (HF ≥ hfMin) */
  maxSafeLoops: number;
  recommendedLeverage: number;
  stops: string[];
}

export interface SimulateSafeLoopsInput {
  initialCapital: number;
  ltv: number;
  liquidationThreshold: number | null;
  hfMin: number;
  protocolMaxLoops: number | null;
  availableBorrowLiquidity: number | null;
  /** نرخ خالص سود هر گام برای بررسی اقتصادی بودن Loop (Decimal) */
  netSpreadRate: number;
  costPerLoopUsd: number;
  timeFraction: number; // days / 365
}

export function simulateSafeLoops(input: SimulateSafeLoopsInput): SafeLoopSimulation {
  const stops: string[] = [];
  const steps: RecStep[] = [];
  const maxLoops = input.protocolMaxLoops ?? 100;

  let totalSupply = input.initialCapital;
  let totalBorrow = 0;
  let stepSupply = input.initialCapital;
  let loop = 0;

  while (loop < maxLoops) {
    loop++;
    let borrow = input.ltv * stepSupply;

    if (borrow <= 1e-9) {
      stops.push(`LTV صفر است — Loop ${loop} امکان‌پذیر نیست`);
      break;
    }

    // محدودیت نقدینگی قابل‌قرض
    if (input.availableBorrowLiquidity !== null) {
      borrow = Math.min(borrow, Math.max(0, input.availableBorrowLiquidity - totalBorrow));
      if (borrow <= 1e-6) {
        stops.push('نقدینگی قابل‌قرض‌گیری تمام شد');
        break;
      }
    }

    // اقتصادی بودن گام (هزینه هر گام در برابر سود خالص احتمالی)
    const estNetGain = borrow * input.netSpreadRate * input.timeFraction;
    if (estNetGain < input.costPerLoopUsd * 2) {
      stops.push(
        `سود خالص احتمالی Loop ${loop} ($${estNetGain.toFixed(2)}) کمتر از ۲× هزینه آن ($${(input.costPerLoopUsd * 2).toFixed(2)}) است`
      );
      break;
    }

    const newSupply = totalSupply + borrow;
    const newBorrow = totalBorrow + borrow;
    const hf = healthFactor(newSupply, newBorrow, input.liquidationThreshold);

    // ایمنی: HF نباید زیر حد ایمنی برود (گام اضافه نمی‌شود)
    if (hf !== null && hf < input.hfMin) {
      stops.push(
        `بعد از Loop ${loop}، HF به ${hf.toFixed(2)} می‌رسد — کمتر از حد ایمنی ${input.hfMin.toFixed(2)}؛ Loop اضافه نمی‌شود`
      );
      break;
    }

    const status: RecStep['status'] = hf !== null && hf < input.hfMin + 0.15 ? 'warning' : 'safe';

    steps.push({
      loop,
      supply: stepSupply,
      borrow,
      totalSupply: newSupply,
      totalBorrow: newBorrow,
      leverage: newSupply / input.initialCapital,
      healthFactor: hf,
      status
    });

    stepSupply = borrow;
    totalSupply = newSupply;
    totalBorrow = newBorrow;
  }

  if (steps.length === 0) {
    stops.push('حتی یک گام Loop نیز با حد ایمنی فعلی سازگار نیست — بدون اهرم توصیه می‌شود');
  }

  const safeCount = steps.filter((s) => s.status === 'safe').length;
  // ۰ = حتی یک گام Borrow هم ایمن نیست → فقط Supply اولیه (بدون اهرم)
  const recommendedLoops = safeCount;
  const recommendedLeverage = safeCount === 0 ? 1 : calculateLoopLeverage(input.ltv, safeCount);

  return {
    steps,
    recommendedLoops,
    maxSafeLoops: steps.length,
    recommendedLeverage,
    stops
  };
}

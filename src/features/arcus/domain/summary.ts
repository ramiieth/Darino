/** ============================================================
 * Arcus — جمع‌بندی تاریخچه بدون دوباره‌شماری
 *
 * طبق تعریف رسمی fill.closedPnl و fill.fee (docs.arcus.xyz/api-reference/public/get-fills):
 *  • closedPnl = آزادسازی بهای تمام‌شده − fee همان fill  → کارمزد معاملاتی «داخل» closedPnl است.
 *    پس جمع کارمزدها فقط برای اطلاع است و دوباره کم نمی‌شود.
 *  • روی پایهٔ liquidation (liquidation.method == LIQUIDATION): fee شامل جریمهٔ لیکوئید است
 *    و این جریمه از closedPnl کم «نشده» → فقط همین جریمه جداگانه کم می‌شود.
 *    (چون سهم کارمزد معاملاتی و جریمه در fee این پایه از هم جدا منتشر نمی‌شود، کل fee این پایه
 *     به‌عنوان «جریمه + کارمزد» گزارش و با برچسب مشخص می‌شود.)
 *  • ADL: کارمزدی ندارد.
 *  • funding.payment: مثبت = دریافت، منفی = پرداخت؛ جدا از closedPnl.
 *  • بر حساب بدون پوزیشن: Σ closedPnl + Σ funding = netQuoteBalance − net deposits (مستند).
 * ============================================================ */
import { add, sub } from '@/features/custody/domain/decimal';
import type { ArcusFill, ArcusFunding } from '../api/types';

export interface HistoryTotals {
  /** Σ closedPnl (خالص کارمزد معاملاتی) */
  closedPnl: string;
  /** Σ fee همهٔ fillها — اطلاعاتی */
  feesInfo: string;
  /** Σ fee روی پایه‌های LIQUIDATION (شامل جریمه؛ از closedPnl کم نشده) */
  liquidationFees: string;
  liquidationCount: number;
  /** Σ funding */
  funding: string;
  /** closedPnl + funding − liquidationFees */
  realized: string;
  /** fillهای بدون closedPnl (قدیمی/ناموجود) — صفر فرض نشده */
  missingClosedPnl: number;
}

export function summarizeHistory(fills: ArcusFill[], funding: ArcusFunding[]): HistoryTotals {
  let closedPnl = '0';
  let fees = '0';
  let liq = '0';
  let liqCount = 0;
  let missing = 0;
  for (const f of fills) {
    if (f.closedPnl === undefined || f.closedPnl === null || f.closedPnl === '') missing++;
    else closedPnl = add(closedPnl, f.closedPnl);
    if (f.fee) fees = add(fees, f.fee);
    if (f.liquidation?.method === 'LIQUIDATION' && f.fee) {
      liq = add(liq, f.fee);
      liqCount++;
    }
  }
  let fund = '0';
  for (const p of funding) if (p.payment) fund = add(fund, p.payment);
  return {
    closedPnl,
    feesInfo: fees,
    liquidationFees: liq,
    liquidationCount: liqCount,
    funding: fund,
    realized: sub(add(closedPnl, fund), liq),
    missingClosedPnl: missing
  };
}

/** سود/زیان کل طبق تعریف API: equity − netDeposits */
export function allTimePnl(equity: string, netDeposits: string): string {
  return sub(equity, netDeposits);
}

/** مجموع margin used پوزیشن‌ها (جمع فیلد مستند؛ تخمین نیست) */
export function totalMarginUsed(positions: { marginUsed: string }[]): string {
  return positions.reduce((s, p) => add(s, p.marginUsed || '0'), '0');
}

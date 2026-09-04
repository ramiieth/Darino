/**
 * ۱) ماشین‌حساب سود و زیان — فرمول‌های رسمی:
 *   Current Value = Current Price × Quantity
 *   Total Cost     = (Buy Price × Quantity) − Buy Fee
 *   Net Value      = Current Value − Sell Fee
 *   Profit         = Net Value − Total Cost
 *   Return %       = (Profit ÷ Total Cost) × 100
 */
import { D, Decimal, round12, safeDiv } from './money';

export interface PnlInput {
  quantity: number;
  buyPrice: number;
  currentPrice: number | null;
  buyFee: number;
  sellFee: number;
}

export interface PnlResult {
  /** ارزش فعلی = Current Price × Quantity */
  currentValue: number | null;
  /** سرمایه اولیه = Buy Price × Quantity */
  initialInvestment: number;
  /** کل سرمایه پرداخت‌شده = (Buy Price × Quantity) − Buy Fee */
  totalCost: number;
  /** ارزش خالص فروش = Current Value − Sell Fee */
  netValue: number | null;
  /** سود = Net Value − Total Cost */
  profit: number | null;
  /** درصد بازده = (Profit ÷ Total Cost) × 100 */
  returnPct: number | null;
}

export function calcPnl(input: PnlInput): PnlResult {
  const qty = D(input.quantity);
  const buy = D(input.buyPrice);
  const cur = input.currentPrice !== null && input.currentPrice !== undefined ? D(input.currentPrice) : null;
  const buyFee = D(input.buyFee);
  const sellFee = D(input.sellFee);

  const initialInvestment = round12(qty.mul(buy));
  const totalCost = round12(qty.mul(buy).minus(buyFee));

  if (cur === null) {
    return {
      currentValue: null,
      initialInvestment,
      totalCost,
      netValue: null,
      profit: null,
      returnPct: null
    };
  }

  const currentValue = round12(cur.mul(qty));
  const netValue = round12(cur.mul(qty).minus(sellFee));
  const profit = round12(D(netValue).minus(D(totalCost)));
  const cost = new Decimal(totalCost);
  const returnPct = (() => {
    const div = safeDiv(D(profit), cost);
    return div === null ? null : round12(div.mul(100));
  })();

  return { currentValue, initialInvestment, totalCost, netValue, profit, returnPct };
}

/** سری سود تجمعی (برای نمودار): (price_i − Buy Price) × Quantity − Buy Fee */
export function cumulativeProfitSeries(
  buyPrice: number,
  quantity: number,
  buyFee: number,
  series: { t: number; price: number }[]
): { t: number; value: number }[] {
  const buy = D(buyPrice);
  const qty = D(quantity);
  const fee = D(buyFee);
  return series.map((p) => ({
    t: p.t,
    value: round12(D(p.price).minus(buy).mul(qty).minus(fee))
  }));
}

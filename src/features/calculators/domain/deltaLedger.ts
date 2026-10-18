/**
 * دفتر سود و زیان دلتا — یک فرمول برای «دلتا نوترال» و «سود واقعی دلتا»
 *
 *   سود خالص       = سود/زیان معاملاتی ناخالص + فاندینگ خالص − کارمزد − اسلیپیج − سایر هزینه‌ها
 *   سرمایهٔ نهایی   = سرمایهٔ مبنا + سود خالص
 *   بازده خالص      = سود خالص ÷ سرمایهٔ مبنا
 *
 * مارجین و ارزش اسمی هزینه نیستند: مارجین وثیقه است و پس از بستن آزاد می‌شود؛ ارزش اسمی فقط اندازهٔ در معرض بازار است.
 * هزینه‌ها مثبت وارد می‌شوند و فقط همین‌جا یک بار کم می‌شوند. اسلیپیج نسبت به قیمت وسط است، پس در سود قیمت (قیمت مارک) تکرار نمی‌شود.
 */
import { D, round12 } from './money';

export interface LedgerInput {
  /** مخرج بازده — سرمایه‌ای که کاربر واقعاً کنار گذاشته */
  baseCapital: number;
  /** سود/زیان قیمت هر دو طرف پیش از هزینه‌ها */
  grossTrading: number;
  /** مثبت = دریافتی */
  funding: number;
  fees: number;
  slippage: number;
  /** انتقال، پل، گس و … */
  otherCosts: number;
}

export interface Ledger extends LedgerInput {
  totalCosts: number;
  net: number;
  finalEquity: number;
  /** null وقتی سرمایهٔ مبنا صفر است */
  roiPct: number | null;
}

const fin = (v: number): number => (Number.isFinite(v) ? v : 0);
const cost = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);

export function deltaLedger(i: LedgerInput): Ledger {
  const baseCapital = cost(i.baseCapital);
  const grossTrading = fin(i.grossTrading);
  const funding = fin(i.funding);
  const fees = cost(i.fees);
  const slippage = cost(i.slippage);
  const otherCosts = cost(i.otherCosts);
  const totalCosts = round12(D(fees).plus(slippage).plus(otherCosts));
  const net = round12(D(grossTrading).plus(funding).minus(totalCosts));
  return {
    baseCapital,
    grossTrading,
    funding,
    fees,
    slippage,
    otherCosts,
    totalCosts,
    net,
    finalEquity: round12(D(baseCapital).plus(net)),
    roiPct: baseCapital > 0 ? round12(D(net).div(baseCapital).mul(100)) : null
  };
}

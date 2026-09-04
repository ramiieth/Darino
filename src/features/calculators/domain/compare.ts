/**
 * ۵) ماشین‌حساب مقایسه بازارها — برای هر دارایی:
 *   Return %       = (Current − Historical) ÷ Historical × 100
 *   Profit         = Investment × Return %
 *   Current Value  = Investment × (1 + Return %) = Investment + Profit
 */
import { D, Decimal, round12, safeDiv } from './money';

export interface CompareInput {
  symbol: string;
  nameFa: string;
  investment: number;
  historicalPrice: number | null;
  currentPrice: number | null;
}

export interface CompareResult {
  symbol: string;
  nameFa: string;
  investment: number;
  historicalPrice: number | null;
  currentPrice: number | null;
  /** درصد بازده */
  returnPct: number | null;
  /** سود = Investment × Return % */
  profit: number | null;
  /** ارزش فعلی = Investment + Profit */
  currentValue: number | null;
  /** CAGR (از تاریخ شروع تا اکنون) */
  cagr: number | null;
}

export function calcCompare(input: CompareInput, years: number): CompareResult {
  const inv = D(input.investment);

  if (input.historicalPrice === null || input.currentPrice === null) {
    return {
      symbol: input.symbol,
      nameFa: input.nameFa,
      investment: round12(inv),
      historicalPrice: null,
      currentPrice: null,
      returnPct: null,
      profit: null,
      currentValue: null,
      cagr: null
    };
  }

  const hist = D(input.historicalPrice);
  const cur = D(input.currentPrice);
  const ratio = safeDiv(cur.minus(hist), hist);
  const returnPct = ratio === null ? null : round12(ratio.mul(100));

  const profit = ratio === null ? null : round12(inv.mul(ratio));
  const currentValue = ratio === null ? null : round12(inv.plus(inv.mul(ratio)));

  // CAGR: رشد از تاریخی به امروز
  let cagr: number | null = null;
  if (currentValue !== null && years > 0 && inv.gt(0) && currentValue > 0) {
    const ratio2 = safeDiv(D(currentValue), inv);
    if (ratio2 !== null && ratio2.gt(0)) {
      cagr = round12(ratio2.pow(new Decimal(1).div(years)).minus(1));
    }
  }

  return {
    symbol: input.symbol,
    nameFa: input.nameFa,
    investment: round12(inv),
    historicalPrice: round12(hist),
    currentPrice: round12(cur),
    returnPct,
    profit,
    currentValue,
    cagr
  };
}


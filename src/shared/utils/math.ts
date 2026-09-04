/** توابع ریاضی پایه سبد — جدا از لایه نمایش */

/** Value ($) = (Base Capital / Buy Price) * Current Price */
export function computeValue(
  baseCapital: number,
  buyPrice: number | null,
  currentPrice: number | null
): number | null {
  if (
    buyPrice === null ||
    buyPrice === undefined ||
    currentPrice === null ||
    currentPrice === undefined ||
    buyPrice <= 0 ||
    !Number.isFinite(buyPrice) ||
    !Number.isFinite(currentPrice)
  ) {
    return null;
  }
  return (baseCapital / buyPrice) * currentPrice;
}

/** Profit/Loss = Value ($) - Base Capital */
export function computeProfitLoss(
  value: number | null,
  baseCapital: number
): number | null {
  return value === null ? null : value - baseCapital;
}

/** ارزش معیار اتریوم برای بازه: (Base Capital / ETH Ref Price) * ETH Live Price */
export function computeEthBenchmark(
  baseCapital: number,
  ethRefPrice: number,
  ethLivePrice: number | null
): number | null {
  if (
    ethLivePrice === null ||
    ethLivePrice === undefined ||
    !Number.isFinite(ethLivePrice) ||
    ethRefPrice <= 0
  ) {
    return null;
  }
  return (baseCapital / ethRefPrice) * ethLivePrice;
}

/** Vs ETH ($) = Value - Benchmark ETH */
export function computeVsEth(
  value: number | null,
  ethBenchmark: number | null
): number | null {
  if (value === null || ethBenchmark === null) return null;
  return value - ethBenchmark;
}

/** بازده درصدی نسبت به قیمت مرجع */
export function computeChangePct(
  buyPrice: number | null,
  currentPrice: number | null
): number | null {
  if (buyPrice === null || currentPrice === null || buyPrice <= 0) return null;
  return ((currentPrice - buyPrice) / buyPrice) * 100;
}

/** جمع امن: نال‌ها نادیده گرفته می‌شوند */
export function safeSum(values: (number | null)[]): number {
  let sum = 0;
  for (const v of values) {
    if (v !== null && Number.isFinite(v)) sum += v;
  }
  return sum;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Risk Engine — Stress Test
 *
 * برای هر سناریوی افت قیمت، Collateral با ضریب حساسیت asset اسکیل می‌شود:
 *   Supply_after = Supply × (1 − dd × sensitivity)
 *
 * sensitivity:
 *   1  = Collateral در واحد دیگری است (ETH/USDC) — افت مستقیم روی HF
 *   0  = Collateral و Debt هر دو یک stablecoin (همان واحد حساب) — افت قیمت روی HF بی‌اثر است
 *
 * ⚠️ مستقل از Reference Engine — فقط ریسک وضعیت را می‌سنجد.
 */

export interface StressPoint {
  /** افت قیمت ٪ (0 = فعلی) */
  dd: number;
  hf: number | null;
  risk: 'ok' | 'warning' | 'liquidation';
}

export function stressHealthFactors(
  initialSupply: number,
  initialBorrow: number,
  liqThreshold: number | null,
  drawdownsPct: number[],
  collateralSensitivity = 1
): StressPoint[] {
  return drawdownsPct.map((dd) => {
    const supplyAfter = initialSupply * Math.max(0, 1 - (dd / 100) * collateralSensitivity);
    const hf = (liqThreshold === null || initialBorrow <= 0 || supplyAfter <= 0)
      ? null
      : (supplyAfter * liqThreshold) / initialBorrow;
    const risk: StressPoint['risk'] =
      hf === null ? 'warning' : hf >= 1.75 ? 'ok' : hf >= 1.1 ? 'warning' : 'liquidation';
    return { dd, hf, risk };
  });
}

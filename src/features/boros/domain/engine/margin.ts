/** ============================================================
 * Boros Calculation Engine — MarginCalculator (Part A-2)
 * فرمول رسمی Boros: size × max(Rate, RateFloor) × max(YTM, YTMFloor) × IMRatio
 * ⚠️ RateFloor / YTMFloor / IMRatio هرگز Hardcode نمی‌شوند؛ از Market Parameters خوانده می‌شوند.
 * ============================================================ */
import type { BorosMarket } from '../types';
import { daysToMaturity, ytmOf } from './pnl';

/**
 * YTMFloor: پارامتر پروتکل. API عمومی Boros آن را expose نمی‌کند؛
 * به‌صورت پارامتر بازار (قابل‌جایگزینی وقتی API ارائه دهد) تعریف شده است.
 */
export const YTM_FLOOR_DEFAULT = 0.014; // مطابق مثال رسمی اسپک (≈ ۵ روز)

export interface MarginParams {
  size: number;
  rate: number;
  rateFloor: number; // از API (imData.marginFloor)
  ytm: number;
  ytmFloor: number; // از پارامتر بازار (پیش‌فرض سراسری در نبود API)
  imRatio: number; // از API (config.kIM)
}

export class MarginCalculator {
  /** فرمول خالص — برای تست با پارامترهای صریح */
  static calc(p: MarginParams): number {
    return (
      p.size *
      Math.max(p.rate, p.rateFloor) *
      Math.max(p.ytm, p.ytmFloor) *
      p.imRatio
    );
  }

  /** از روی بازار واقعی — همه پارامترها از Market Parameters */
  static calcMarket(
    m: BorosMarket,
    size: number,
    rate: number,
    nowSec = Math.floor(Date.now() / 1000)
  ): number {
    return MarginCalculator.calc({
      size,
      rate,
      rateFloor: m.marginFloor,
      ytm: ytmOf(m, nowSec),
      ytmFloor: m.ytmFloor ?? YTM_FLOOR_DEFAULT,
      imRatio: m.kIM
    });
  }

  /** نسبت مارجین به نotional (برای Margin Efficiency در رتبه‌بندی) */
  static marginRatio(m: BorosMarket, size: number, rate: number, nowSec?: number): number {
    const margin = MarginCalculator.calcMarket(m, size, rate, nowSec);
    return size > 0 ? margin / size : 0;
  }
}

export { daysToMaturity, ytmOf };

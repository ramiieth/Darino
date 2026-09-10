/** ============================================================
 * Property Market — موتور سناریوی دلار (خالص، تست‌پذیر)
 *
 *  فرمول پایه (§۱۲ مأموریت):
 *    Current USD/m² = Current Toman/m² ÷ Current USD Rate
 *    Future  USD/m² = Future  Toman/m² ÷ Future  USD Rate
 *    USD Change %   = (Future − Current) ÷ Current × 100
 *
 *  ⚠️ اگر قیمت آینده ملک داده نشود → سناریو «قیمت تومانی ثابت»
 *     (فقط به‌عنوان فرض صریح سناریو — هرگز پیش‌بینی نیست).
 *  ⚠️ هیچ داده جعلی تولید نمی‌شود؛ ورودی نامعتبر → خروجی نامعتبر (خطا).
 * ============================================================ */
import type { UsdScenarioInput, UsdScenarioResult } from './types.js';
import { changePercent } from './fx.js';

/**
 * محاسبه سناریوی دلاری یک قیمت ملک.
 * ورودی‌ها باید معتبر و مثبت باشند — در غیر این صورت خطا پرتاب می‌شود
 * (لایه سرویس قبل از صدا زدن، اعتبارسنجی و فیلتر می‌کند).
 */
export function calculateUsdScenario(input: UsdScenarioInput): UsdScenarioResult {
  const { currentPropertyPriceTomanPerM2, currentUsdRate, futureUsdRate } = input;

  if (!Number.isFinite(currentPropertyPriceTomanPerM2) || currentPropertyPriceTomanPerM2 <= 0) {
    throw new Error('currentPropertyPriceTomanPerM2 must be a positive number');
  }
  if (!Number.isFinite(currentUsdRate) || currentUsdRate <= 0) {
    throw new Error('currentUsdRate must be a positive number');
  }
  if (!Number.isFinite(futureUsdRate) || futureUsdRate <= 0) {
    throw new Error('futureUsdRate must be a positive number');
  }

  const hasExplicitFutureProperty =
    input.futurePropertyPriceTomanPerM2 !== null &&
    input.futurePropertyPriceTomanPerM2 !== undefined &&
    Number.isFinite(input.futurePropertyPriceTomanPerM2) &&
    input.futurePropertyPriceTomanPerM2 > 0;

  const effectiveFuturePropertyPrice = hasExplicitFutureProperty
    ? (input.futurePropertyPriceTomanPerM2 as number)
    : currentPropertyPriceTomanPerM2;

  const currentUsdPrice = currentPropertyPriceTomanPerM2 / currentUsdRate;
  const futureUsdPrice = effectiveFuturePropertyPrice / futureUsdRate;
  const usdChange = changePercent(currentUsdPrice, futureUsdPrice);
  const tomanChange = changePercent(currentPropertyPriceTomanPerM2, effectiveFuturePropertyPrice);

  return {
    currentUsdPrice,
    futureUsdPrice,
    usdChangePercent: usdChange ?? 0,
    effectiveFuturePropertyPriceTomanPerM2: effectiveFuturePropertyPrice,
    propertyTomanChangePercent: tomanChange ?? 0,
    scenarioBasis: hasExplicitFutureProperty ? 'explicit-property' : 'constant-property'
  };
}

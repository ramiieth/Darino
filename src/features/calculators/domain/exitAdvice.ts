/**
 * برنامهٔ خروج سناریومحور: در هر حرکت قیمت، «زود بستن» بهتر است یا «نگه داشتن تا سررسید»؟
 *
 *  برای هر سناریو سه عدد از همان موتور قیمت‌گذاری (valueAt / payoffAt):
 *   - بستن در نیمهٔ راه (نصف زمان باقی‌مانده، IV ثابت) − کارمزد بستن
 *   - بستن در نیمهٔ راه اگر IV ده واحد بالا برود (ترس بازار) − کارمزد بستن
 *   - نگه داشتن تا سررسید (ارزش ذاتی؛ بدون کارمزد بستن)
 *  پیشنهاد = گزینه‌ای که سود بیشتر یا زیان کمتر دارد. کارمزد بستن ≈ کارمزد باز کردن (تقریبی).
 *  ضرر نامحدود: نگه داشتن تا سررسید هرگز پیشنهاد نمی‌شود وقتی زیان‌ده است.
 */
import { payoffAt, valueAt } from './options';
import type { BuiltStrategy } from './optionStrategies';

export const EXIT_MOVES = [20, 10, 5, 0, -5, -10, -20] as const;

export type ExitAction = 'close-early-profit' | 'hold-profit' | 'close-early-cut' | 'hold-recover' | 'close-early-flip';

export interface ExitScenario {
  movePct: number;
  price: number;
  /** سود/زیان اگر در نیمهٔ راه بسته شود (پس از کارمزد بستن) */
  closeMidway: number;
  /** همان، اگر نوسان بازار (IV) ده واحد بالا رفته باشد */
  closeMidwayIvUp: number;
  /** سود/زیان اگر تا سررسید نگه داشته شود */
  holdToExpiry: number;
  action: ExitAction;
  /** اختلاف دلاری گزینهٔ پیشنهادی با گزینهٔ دیگر */
  edge: number;
}

export interface ExitAdvice {
  scenarios: ExitScenario[];
  /** در چند سناریو زود بستن بهتر است */
  earlyBetterCount: number;
  /** بدترین نتیجه با پیروی از پیشنهادها، در برابر بدترین نتیجهٔ «هیچ کاری نکردن» */
  worstFollowingAdvice: number;
  worstDoingNothing: number;
}

export function exitAdvice(b: BuiltStrategy, spot: number, T: number): ExitAdvice {
  const closeCost = b.fees ?? 0;
  const scenarios = EXIT_MOVES.map((movePct): ExitScenario => {
    const price = spot * (1 + movePct / 100);
    const closeMidway = valueAt(b.legs, price, T / 2) - closeCost;
    const closeMidwayIvUp = valueAt(b.legs, price, T / 2, 0.1) - closeCost;
    const holdToExpiry = payoffAt(b.legs, price);
    // ضرر نامحدود: در زیان، امید به برگشت قیمت ریسک بی‌سقف دارد → همیشه زود بستن
    const early = closeMidway >= holdToExpiry || (b.unlimitedLoss && holdToExpiry < 0);
    const best = early ? closeMidway : holdToExpiry;
    const other = early ? holdToExpiry : closeMidway;
    let action: ExitAction;
    if (early) action = best >= 0 && other < 0 ? 'close-early-flip' : best >= 0 ? 'close-early-profit' : 'close-early-cut';
    else action = best >= 0 ? 'hold-profit' : 'hold-recover';
    return { movePct, price, closeMidway, closeMidwayIvUp, holdToExpiry, action, edge: Math.abs(best - other) };
  });
  const chosen = scenarios.map((s) => (s.action.startsWith('close') ? s.closeMidway : s.holdToExpiry));
  return {
    scenarios,
    earlyBetterCount: scenarios.filter((s) => s.action.startsWith('close')).length,
    worstFollowingAdvice: Math.min(...chosen),
    worstDoingNothing: Math.min(...scenarios.map((s) => s.holdToExpiry))
  };
}

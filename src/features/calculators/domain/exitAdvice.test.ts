import { describe, it, expect } from 'vitest';
import { exitAdvice, EXIT_MOVES } from './exitAdvice';
import type { BuiltStrategy } from './optionStrategies';
import type { Leg } from './options';

const opt = (type: 'C' | 'P', side: 'buy' | 'sell', strike: number, premium: number): Leg => ({ kind: 'option', type, side, strike, qty: 1, premium, iv: 0.6 });
const built = (legs: Leg[], unlimitedLoss = false): BuiltStrategy =>
  ({ id: 'long_call', legs, qty: 1, belowMinimum: false, stats: {} as never, collateral: 0, fees: 1, unlimitedLoss, worstSpreadPct: null, minOi: null }) as BuiltStrategy;

describe('برنامهٔ خروج سناریومحور', () => {
  const T = 30 / 365;

  it('همهٔ سناریوها؛ پیشنهاد همیشه گزینهٔ بهتر است', () => {
    const adv = exitAdvice(built([opt('C', 'buy', 100, 5)]), 100, T);
    expect(adv.scenarios.map((s) => s.movePct)).toEqual([...EXIT_MOVES]);
    for (const s of adv.scenarios) {
      const best = s.action.startsWith('close') ? s.closeMidway : s.holdToExpiry;
      expect(best).toBeGreaterThanOrEqual(Math.min(s.closeMidway, s.holdToExpiry));
      expect(best).toBeCloseTo(Math.max(s.closeMidway, s.holdToExpiry), 6);
    }
    // پیروی از پیشنهاد هرگز بدتر از «کاری نکردن» نیست
    expect(adv.worstFollowingAdvice).toBeGreaterThanOrEqual(adv.worstDoingNothing);
  });

  it('خرید Call در ریزش: ارزش زمانی باقی‌مانده → زود بستن زیان را کم می‌کند', () => {
    const down = exitAdvice(built([opt('C', 'buy', 100, 5)]), 100, T).scenarios.find((s) => s.movePct === -10)!;
    expect(down.holdToExpiry).toBeCloseTo(-5, 6);
    expect(down.action).toBe('close-early-cut');
  });

  it('ضرر نامحدود و زیان‌ده: نگه داشتن تا سررسید هرگز پیشنهاد نمی‌شود', () => {
    const adv = exitAdvice(built([opt('C', 'sell', 100, 5)], true), 100, T);
    for (const s of adv.scenarios) if (s.holdToExpiry < 0) expect(s.action.startsWith('close')).toBe(true);
  });
});

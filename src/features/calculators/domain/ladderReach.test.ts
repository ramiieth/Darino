import { describe, it, expect } from 'vitest';
import { ladderReach, reachOf, touchProbability } from './ladderReach';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 20);
/** قیمت روزانه با نوسان ثابت ±۳٪ یک‌درمیان (نوسان روزانه حدود ۳٪) */
const series = (n: number, start: number, dip?: { daysAgo: number; price: number }) =>
  Array.from({ length: n }, (_, i) => {
    const daysAgo = n - 1 - i;
    const price = dip && daysAgo === dip.daysAgo ? dip.price : start * (i % 2 ? 1.03 : 1);
    return { t: NOW - daysAgo * DAY, price };
  });

describe('دسترسی‌پذیری قیمت‌های خرید پله‌ای', () => {
  it('احتمال لمس: پله نزدیک‌تر و بازهٔ طولانی‌تر محتمل‌تر؛ قیمت بالاتر از فعلی = ۱', () => {
    expect(touchProbability(100, 95, 0.03, 30)).toBeGreaterThan(touchProbability(100, 70, 0.03, 30));
    expect(touchProbability(100, 80, 0.03, 90)).toBeGreaterThan(touchProbability(100, 80, 0.03, 30));
    expect(touchProbability(100, 101, 0.03, 30)).toBe(1);
    // ۲·Φ(ln(0.8)/(0.03·√30)) ≈ ۰٫۱۶
    expect(touchProbability(100, 80, 0.03, 30)).toBeCloseTo(0.16, 1);
  });

  it('برچسب‌ها', () => {
    expect(reachOf(0.6)).toBe('near');
    expect(reachOf(0.3)).toBe('possible');
    expect(reachOf(0.1)).toBe('far');
    expect(reachOf(0.01)).toBe('very-far');
  });

  it('آخرین بار رسیدن به قیمت پله از تاریخچهٔ واقعی؛ داده کم → null', () => {
    const r = ladderReach(100, [{ price: 90, dropPct: 10 }, { price: 50, dropPct: 50 }], series(120, 100, { daysAgo: 40, price: 88 }), NOW)!;
    expect(r.steps[0].lastSeenDaysAgo).toBe(40);
    expect(r.steps[1].lastSeenDaysAgo).toBeNull();
    expect(r.low30).toBe(100);
    expect(r.low90).toBe(88);
    expect(r.steps[0].p90).toBeGreaterThan(r.steps[1].p90);
    expect(ladderReach(100, [{ price: 90, dropPct: 10 }], series(5, 100), NOW)).toBeNull();
  });
});

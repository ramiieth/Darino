import { describe, expect, it } from 'vitest';
import { DEFAULT_FORECAST_BETA, calibratedFloatingForecast } from './scenarioModels';

describe('calibratedFloatingForecast — پیش‌بینی کالیبره با بک‌تست', () => {
  it('بدون تاریخچه funding → خودِ Implied (هیچ لبه‌ای فرض نمی‌شود)', () => {
    expect(calibratedFloatingForecast({ impliedRate: 0.08, avg7d: null, avg30d: null, avg90d: null })).toBe(0.08);
  });

  it('Implied + β × (میانگین وزنی ۷/۳۰/۹۰ − Implied)', () => {
    const target = (0.2 * 0.5 + 0.1 * 0.3 + 0.1 * 0.2) / 1;
    const f = calibratedFloatingForecast({ impliedRate: 0.08, avg7d: 0.2, avg30d: 0.1, avg90d: 0.1 });
    expect(f).toBeCloseTo(0.08 + DEFAULT_FORECAST_BETA * (target - 0.08), 12);
  });

  it('β=0 → Implied ؛ β=1 → میانگین تاریخی', () => {
    const i = { impliedRate: 0.05, avg7d: 0.12, avg30d: null, avg90d: null };
    expect(calibratedFloatingForecast({ ...i, beta: 0 })).toBe(0.05);
    expect(calibratedFloatingForecast({ ...i, beta: 1 })).toBeCloseTo(0.12, 12);
  });

  it('β پیش‌فرض محافظه‌کارانه است (اکثر وزن با بازار)', () => {
    expect(DEFAULT_FORECAST_BETA).toBeGreaterThan(0);
    expect(DEFAULT_FORECAST_BETA).toBeLessThanOrEqual(0.2);
  });
});

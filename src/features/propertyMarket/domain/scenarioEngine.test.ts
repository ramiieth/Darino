/**
 * موتور سناریوی دلار — مثال‌های ضروری مأموریت (§۱۳، §۳، §۴، §۱۴)
 */
import { describe, it, expect } from 'vitest';
import { calculateUsdScenario } from './scenarioEngine';

describe('calculateUsdScenario', () => {
  it('§۱۳ — مثال ضروری: 50M @ 100K → 125K ⇒ $500 → $400 (−20%)', () => {
    const r = calculateUsdScenario({
      currentPropertyPriceTomanPerM2: 50_000_000,
      currentUsdRate: 100_000,
      futureUsdRate: 125_000
    });
    expect(r.currentUsdPrice).toBeCloseTo(500, 9);
    expect(r.futureUsdPrice).toBeCloseTo(400, 9);
    expect(r.usdChangePercent).toBeCloseTo(-20, 9);
    expect(r.scenarioBasis).toBe('constant-property');
    expect(r.propertyTomanChangePercent).toBeCloseTo(0, 9);
    expect(r.effectiveFuturePropertyPriceTomanPerM2).toBe(50_000_000);
  });

  it('§۳ — کیان‌پارس: 50M @ 100K → 120K ⇒ $500 → $416.67 (−16.67%)', () => {
    const r = calculateUsdScenario({
      currentPropertyPriceTomanPerM2: 50_000_000,
      currentUsdRate: 100_000,
      futureUsdRate: 120_000
    });
    expect(r.currentUsdPrice).toBeCloseTo(500, 9);
    expect(r.futureUsdPrice).toBeCloseTo(416.6667, 3);
    expect(r.usdChangePercent).toBeCloseTo(-16.6667, 3);
  });

  it('§۴ — رشد تومانی اما افت دلاری: 55M @ 120K ⇒ $458.33 (−8.33%)', () => {
    const r = calculateUsdScenario({
      currentPropertyPriceTomanPerM2: 50_000_000,
      currentUsdRate: 100_000,
      futureUsdRate: 120_000,
      futurePropertyPriceTomanPerM2: 55_000_000
    });
    expect(r.futureUsdPrice).toBeCloseTo(458.3333, 3);
    expect(r.usdChangePercent).toBeCloseTo(-8.3333, 3);
    expect(r.propertyTomanChangePercent).toBeCloseTo(10, 9);
    expect(r.scenarioBasis).toBe('explicit-property');
  });

  it('§۱۴ — سناریو B: آینده 55M @ 125K ⇒ $440 (−12%)', () => {
    const r = calculateUsdScenario({
      currentPropertyPriceTomanPerM2: 50_000_000,
      currentUsdRate: 100_000,
      futureUsdRate: 125_000,
      futurePropertyPriceTomanPerM2: 55_000_000
    });
    expect(r.currentUsdPrice).toBeCloseTo(500, 9);
    expect(r.futureUsdPrice).toBeCloseTo(440, 9);
    expect(r.usdChangePercent).toBeCloseTo(-12, 9);
  });

  it('نرخ آینده برابر فعلی و قیمت ثابت → تغییر صفر', () => {
    const r = calculateUsdScenario({
      currentPropertyPriceTomanPerM2: 40_000_000,
      currentUsdRate: 100_000,
      futureUsdRate: 100_000
    });
    expect(r.usdChangePercent).toBeCloseTo(0, 9);
    expect(r.futureUsdPrice).toBeCloseTo(400, 9);
  });

  it('futurePropertyPrice صفر/نامعتبر → نادیده گرفته می‌شود (سناریو ثابت)', () => {
    const r = calculateUsdScenario({
      currentPropertyPriceTomanPerM2: 50_000_000,
      currentUsdRate: 100_000,
      futureUsdRate: 125_000,
      futurePropertyPriceTomanPerM2: 0
    });
    expect(r.scenarioBasis).toBe('constant-property');
    expect(r.futureUsdPrice).toBeCloseTo(400, 9);
  });

  it('ورودی نامعتبر → خطا (هرگز خروجی جعلی)', () => {
    expect(() =>
      calculateUsdScenario({
        currentPropertyPriceTomanPerM2: 0,
        currentUsdRate: 100_000,
        futureUsdRate: 125_000
      })
    ).toThrow();
    expect(() =>
      calculateUsdScenario({
        currentPropertyPriceTomanPerM2: 50_000_000,
        currentUsdRate: -1,
        futureUsdRate: 125_000
      })
    ).toThrow();
    expect(() =>
      calculateUsdScenario({
        currentPropertyPriceTomanPerM2: 50_000_000,
        currentUsdRate: 100_000,
        futureUsdRate: NaN
      })
    ).toThrow();
  });
});

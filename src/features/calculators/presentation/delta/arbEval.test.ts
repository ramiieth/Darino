/** فارم پوینت: هزینهٔ هر ۱۰۰ هزار دلار حجم روی صرافی پوینت */
import { describe, expect, it } from 'vitest';
import { farmCostPer100k } from './arbEval';

describe('farmCostPer100k', () => {
  it('یک دور باز و بسته = ۲ × ارزش هر طرف حجم؛ زیان → هزینهٔ مثبت، سود → منفی', () => {
    // ۲۰۰۰ دلار هر طرف → ۴۰۰۰ دلار حجم؛ زیان ۲ دلار → ۵۰ دلار برای هر ۱۰۰ هزار
    expect(farmCostPer100k(-2, 2000)).toBeCloseTo(50, 9);
    expect(farmCostPer100k(4, 2000)).toBeCloseTo(-100, 9);
  });

  it('سود نامعلوم یا ارزش صفر → null', () => {
    expect(farmCostPer100k(null, 2000)).toBeNull();
    expect(farmCostPer100k(-1, 0)).toBeNull();
  });
});

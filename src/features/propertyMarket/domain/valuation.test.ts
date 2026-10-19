import { describe, it, expect } from 'vitest';
import { topPicks, valueListings, verdictOf } from './valuation';

const JY = 1405;
const l = (token: string, nb: string, year: number | null, m: number) => ({ token, neighborhoodKey: nb, yearBuilt: year, pricePerSqmToman: m * 1e6 });

describe('دستیار قیمت — مقایسه با آگهی‌های مشابه', () => {
  it('مرزها: ±۱۰٪ منصفانه، زیر ۶۰٪ مشکوک', () => {
    expect(verdictOf(0.95)).toBe('fair');
    expect(verdictOf(1.1)).toBe('fair');
    expect(verdictOf(0.85)).toBe('below');
    expect(verdictOf(1.2)).toBe('above');
    expect(verdictOf(0.5)).toBe('suspect');
  });

  it('فقط با هم‌منطقه و هم‌سال مقایسه می‌شود؛ خود آگهی جزو مشابه‌ها نیست', () => {
    const ls = [
      ...[300, 300, 300, 300].map((m, i) => l(`kp${i}`, 'kianpars-west', 1405, m)),
      l('cheap', 'kianpars-other', 1405, 240),
      l('pricey', 'kianpars-east', 1405, 380),
      // منطقهٔ ارزان‌تر با همان سال — نباید معیار کیانپارس را پایین بکشد
      ...[120, 120, 120, 120].map((m, i) => l(`gl${i}`, 'golestan', 1405, m)),
      // کیانپارس قدیمی — نباید معیار نوساز را پایین بکشد
      ...[150, 150, 150, 150].map((m, i) => l(`old${i}`, 'kianpars-west', 1390, m))
    ];
    const v = valueListings(ls, JY);
    expect(v.get('cheap')!.peerMedian).toBe(300e6);
    expect(v.get('cheap')!.verdict).toBe('below');
    expect(v.get('pricey')!.verdict).toBe('above');
    expect(v.get('kp0')!.verdict).toBe('fair');
    expect(v.get('kp0')!.basis).toBe('same-year');
  });

  it('مشابه کم → یک سال اختلاف؛ باز هم کم → قضاوت نمی‌شود', () => {
    const ls = [l('a', 'padad', 1405, 100), ...[100, 100, 100].map((m, i) => l(`b${i}`, 'padad', 1404, m)), l('c', 'padad', 1405, 100)];
    expect(valueListings(ls, JY).get('a')!.basis).toBe('near-year');
    expect(valueListings([l('x', 'padad', 1405, 100), l('y', 'padad', 1405, 100)], JY).get('x')!.verdict).toBe('unknown');
    expect(valueListings([l('n', 'padad', null, 100)], JY).get('n')!.verdict).toBe('unknown');
  });

  it('پیشنهاد برتر: ارزان‌ترین نسبت به مشابه‌ها، نه ارزان‌ترین مطلق؛ مشکوک و گران کنار می‌روند', () => {
    const ls = [
      ...[300, 300, 300, 300].map((m, i) => l(`kp${i}`, 'kianpars-west', 1405, m)),
      l('kpDeal', 'kianpars-west', 1405, 240), // ۲۰٪ زیر مشابه‌ها
      ...[120, 120, 120, 120].map((m, i) => l(`gl${i}`, 'golestan', 1405, m)),
      l('glFair', 'golestan', 1405, 115), // ارزان‌تر مطلق ولی فقط ۴٪ زیر
      l('suspect', 'golestan', 1405, 50),
      l('oneYear', 'golestan', 1404, 100)
    ];
    const v = valueListings(ls, JY);
    const picks = topPicks(ls, v, 0, JY);
    expect(picks[0].listing.token).toBe('kpDeal');
    expect(picks.map((p) => p.listing.token)).not.toContain('suspect');
    expect(picks.every((p) => p.listing.yearBuilt === 1405)).toBe(true);
  });
});

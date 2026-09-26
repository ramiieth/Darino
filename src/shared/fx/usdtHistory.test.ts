/**
 * تاریخچه روزانه تتر — پارس پاسخ واقعی بیت‌پین/والکس و نرخ روز
 */
import { describe, it, expect } from 'vitest';
import { parseBitpinBars, parseWallexHistory, rateOnDate, ratesCoverage, tehranDayKey } from './usdtHistory';

describe('usdtHistory', () => {
  it('کلید روز به وقت تهران', () => {
    // 20:30Z = نیمه‌شب تهران روز بعد
    expect(tehranDayKey(Date.parse('2025-08-23T20:30:00Z'))).toBe('2025-08-24');
    expect(tehranDayKey(Date.parse('2025-08-23T20:29:00Z'))).toBe('2025-08-23');
  });
  it('بیت‌پین get_bars (ساختار واقعی)', () => {
    const r = parseBitpinBars([
      { open: 93582.0, close: 93904.0, low: '93011', high: '94579', ts: 1755894600.0, resolution: '1d', time: 1755981000000 },
      { open: 1, close: 'x', time: 1756067400000 }
    ]);
    expect(r).toEqual({ '2025-08-24': 93904 });
  });
  it('والکس udf/history (ساختار واقعی)', () => {
    const r = parseWallexHistory({ s: 'ok', t: [1695859200, 1695945600], c: ['50023.0000000000000000', '50091.0'] });
    expect(r).toEqual({ '2023-09-28': 50023, '2023-09-29': 50091 });
    expect(parseWallexHistory({ s: 'no_data' })).toEqual({});
  });
  it('نرخ روز؛ روز خالی → تا ۵ روز قبل؛ بیشتر → null', () => {
    const rates = { '2026-01-10': 150000, '2026-01-12': 151000 };
    expect(rateOnDate(rates, Date.parse('2026-01-12T10:00:00Z'))).toBe(151000);
    expect(rateOnDate(rates, Date.parse('2026-01-11T10:00:00Z'))).toBe(150000);
    expect(rateOnDate(rates, Date.parse('2026-01-20T10:00:00Z'))).toBeNull();
    expect(ratesCoverage(rates)).toEqual({ first: '2026-01-10', last: '2026-01-12', days: 2 });
  });
});

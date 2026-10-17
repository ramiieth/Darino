/** قواعد اعلان: پاک‌سازی ورودی، برعکس‌شدن اسپرد، فاصلهٔ لیکویید لایتر/آرکوس و جلوگیری از هشدار تکراری */
import { describe, expect, it } from 'vitest';
import { arcusExposure, evaluateFunding, evaluateLiquidation, fundingMessage, lighterExposures, sanitizeRules, type FundingWatch } from './rules';

const watch: FundingWatch = { key: 'BTC:arcus>lighter', base: 'BTC', shortVenue: 'arcus', shortRef: 'BTC-USD', longVenue: 'lighter', longRef: '1', lastSign: 1 };

describe('sanitizeRules', () => {
  it('ورودی نامعتبر حذف، آستانه محدود، تکراری یکی', () => {
    const r = sanitizeRules({
      funding: [watch, watch, { ...watch, key: 'x', shortRef: '../../etc' }, { ...watch, key: 'y', longVenue: 'arcus' }, { ...watch, key: 'z', base: '<b>' }, null],
      liquidation: { enabled: false, thresholdPct: 500 }
    });
    expect(r.funding).toEqual([watch]);
    expect(r.liquidation).toEqual({ enabled: false, thresholdPct: 80 });
    expect(sanitizeRules(null)).toEqual({ funding: [], liquidation: { enabled: true, thresholdPct: 15 } });
  });
});

describe('evaluateFunding', () => {
  it('فقط وقتی علامت عوض شود خبر می‌دهد و علامت تازه را نگه می‌دارد', () => {
    const rates = new Map([['arcus:BTC-USD', 0.00001], ['lighter:1', 0.00003]]);
    const { flips, next } = evaluateFunding([watch], rates);
    expect(flips).toHaveLength(1);
    expect(flips[0].sign).toBe(-1);
    expect(flips[0].apr).toBeCloseTo(-17.52, 6);
    expect(next[0].lastSign).toBe(-1);
    expect(fundingMessage(flips[0]).title).toBe('اسپرد فاندینگ برعکس شد');
    // بار دوم با همان نرخ: خبری نیست
    expect(evaluateFunding(next, rates).flips).toHaveLength(0);
    // نرخ یکی از دو طرف نامعلوم: دست نمی‌خورد
    expect(evaluateFunding([watch], new Map([['arcus:BTC-USD', 0]])).next[0]).toBe(watch);
  });
});

describe('فاصلهٔ لیکویید', () => {
  it('لایتر: قیمت مارک از ارزش ÷ اندازه؛ آدرس دیگر و پوزیشن بسته نادیده', () => {
    const addr = '0x' + 'ab'.repeat(20);
    const e = lighterExposures('lighter-mainnet', addr, { accounts: [
      { l1_address: addr.toUpperCase().replace('0X', '0x'), account_index: 3, positions: [
        { symbol: 'BTC', sign: 1, position: '0.1', position_value: '8000', liquidation_price: '68000' },
        { symbol: 'ETH', sign: -1, position: '0', position_value: '0', liquidation_price: '0' },
        { symbol: 'SOL', sign: -1, position: '10', position_value: '1500', liquidation_price: '0' }
      ] },
      { l1_address: '0x' + 'cd'.repeat(20), account_index: 4, positions: [{ symbol: 'X', sign: 1, position: '1', position_value: '1', liquidation_price: '0.5' }] }
    ] });
    expect(e).toHaveLength(2);
    expect(e[0]).toMatchObject({ label: 'BTC Long — لایتر، حساب 3', approximate: false });
    expect(e[0].distancePct).toBeCloseTo(15, 9);
    expect(e[1].distancePct).toBeNull(); // بدون قیمت لیکویید
  });

  it('آرکوس: (ارزش حساب − مارجین نگهداری) ÷ کل ارزش پوزیشن‌ها', () => {
    const [e] = arcusExposure('0x' + 'ab'.repeat(20), 0, { equity: '1000', positions: {
      a: { marketDisplayName: 'BTC-USD', positionValueNotional: '3000' },
      b: { marketDisplayName: 'TSLA-USD', positionValueNotional: '-1000' }
    } }, new Map([['BTC-USD', 0.03], ['TSLA-USD', 0.1]]));
    // مارجین نگهداری = ۹۰ + ۱۰۰ = ۱۹۰ → (۱۰۰۰ − ۱۹۰) ÷ ۴۰۰۰ = ۲۰٫۲۵٪
    expect(e.distancePct).toBeCloseTo(20.25, 9);
    expect(e.approximate).toBe(true);
    expect(arcusExposure('0x1', 0, { equity: '10', positions: {} }, new Map())).toEqual([]);
  });

  it('هشدار، سکوت ۶ ساعته، تکرار اگر فاصله نصف شود، پاک شدن بعد از بهبود', () => {
    const H = 3600_000; const t0 = Date.UTC(2026, 9, 18);
    const exp = (d: number) => [{ key: 'k', label: 'BTC', distancePct: d, approximate: false }];
    let r = evaluateLiquidation(exp(12), 15, {}, t0);
    expect(r.alerts).toHaveLength(1);
    r = evaluateLiquidation(exp(11), 15, r.next, t0 + H);
    expect(r.alerts).toHaveLength(0);
    r = evaluateLiquidation(exp(5), 15, r.next, t0 + 2 * H);
    expect(r.alerts).toHaveLength(1); // نصف شد
    r = evaluateLiquidation(exp(5), 15, r.next, t0 + 9 * H);
    expect(r.alerts).toHaveLength(1); // ۶ ساعت گذشت
    r = evaluateLiquidation(exp(40), 15, r.next, t0 + 10 * H);
    expect(r.next).toEqual({}); // بهبود کامل
    expect(evaluateLiquidation(exp(14), 15, r.next, t0 + 10.5 * H).alerts).toHaveLength(1);
  });
});

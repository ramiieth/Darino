import { describe, expect, it } from 'vitest';
import { FLOOR_7D, SAFE_TARGET_7D, adverseExcursions, assess, buildRiskModel, liqDistancePct, liqProbability, parseCandles, type Candle } from './survival';
import { consensus } from '@/features/traders/domain/positions';

const BAR = 4 * 3_600_000;

/** گشت تصادفی قطعی (LCG) با نوسان هر کندل `vol(i)` */
function walk(n: number, vol: (i: number) => number, seed = 7): Candle[] {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
  const out: Candle[] = [];
  let px = 100;
  for (let i = 0; i < n; i++) {
    const o = px;
    px = o * Math.exp(vol(i) * gauss());
    const wick = vol(i) * Math.abs(gauss()) * 0.5;
    out.push({ t: i * BAR, o, h: Math.max(o, px) * Math.exp(wick), l: Math.min(o, px) * Math.exp(-wick), c: px });
  }
  return out;
}

describe('چک قبل از ورود', () => {
  it('فاصلهٔ لیکوئید ایزوله با مارجین نگهداری هایپرلیکوئید (نصف مارجین اولیه در حداکثر اهرم)', () => {
    expect(liqDistancePct('long', 10, 40)).toBeCloseTo(8.86, 2);
    expect(liqDistancePct('short', 10, 40)).toBeCloseTo(8.64, 2);
    expect(liqDistancePct('long', 1, 40)).toBeCloseTo(100, 5);
  });

  it('پنجرهٔ لغزان حرکت خلاف جهت با محاسبهٔ مستقیم یکی است', () => {
    const c = walk(400, () => 0.02);
    for (const side of ['long', 'short'] as const) {
      for (const h of [1, 6, 42]) {
        const fast = adverseExcursions(c, side, h);
        for (let i = 0; i < c.length; i++) {
          if (i + h >= c.length) {
            expect(fast[i]).toBeNull();
            continue;
          }
          let worst = 0;
          for (let j = i + 1; j <= i + h; j++) worst = Math.max(worst, side === 'long' ? Math.log(c[i].c / c[j].l) : Math.log(c[j].h / c[i].c));
          expect(fast[i]).toBeCloseTo(worst, 12);
        }
      }
    }
  });

  it('همان تاریخچه، نوسان امروز بالاتر ← احتمال لیکوئید بالاتر', () => {
    const n = 2400;
    const calm = buildRiskModel(walk(n, () => 0.01), 'long');
    const stormy = buildRiskModel(walk(n, (i) => (i > n - 30 ? 0.04 : 0.01)), 'long');
    const a = liqProbability(calm, 10, 40)!;
    const b = liqProbability(stormy, 10, 40)!;
    expect(b.p7d).toBeGreaterThan(a.p7d * 2);
    expect(b.p24).toBeGreaterThan(a.p24);
    expect(a.p7d).toBeGreaterThan(a.p24);
  });

  it('کف نمایش: احتمال خیلی کم «کمتر از ۲٪» است، نه صفر', () => {
    const r = assess(buildRiskModel(walk(2400, () => 0.005), 'long'), { leverage: 2, maxLeverage: 40, fundingHourly: 0.0000125 });
    expect(r.p7dFloored).toBe(true);
    expect(r.p7d).toBe(FLOOR_7D);
    expect(r.verdict).toBe('ok');
    expect(r.fundingDayPct).toBeCloseTo(0.03);
    expect(r.fundingDayMarginPct).toBeCloseTo(0.06);
  });

  it('اهرم پیشنهادی بیشترین اهرمی است که ریسک ۷ روزهٔ خامش ≤ ۵٪ است', () => {
    const model = buildRiskModel(walk(2400, () => 0.015), 'short');
    const r = assess(model, { leverage: 25, maxLeverage: 25, fundingHourly: null });
    expect(r.safeLeverage).not.toBeNull();
    const safe = r.safeLeverage!;
    expect(liqProbability(model, safe, 25)!.p7d).toBeLessThanOrEqual(SAFE_TARGET_7D);
    if (safe < 25) expect(liqProbability(model, safe + 1, 25)!.p7d).toBeGreaterThan(SAFE_TARGET_7D);
    expect(r.verdict).not.toBe('ok');
  });

  it('سناریوی آبشار: بدترین روز تاریخچه تعیین می‌کند کدام اهرم می‌سوزد', () => {
    const c = walk(2400, () => 0.01);
    c[1000] = { ...c[1000], l: c[999].c * 0.6 };
    const model = buildRiskModel(c, 'long');
    // ورود چند کندل زودتر با قیمت کمی بالاتر کمی بیشتر از ۴۰٪ را می‌بیند
    expect(model.crashPct).toBeGreaterThanOrEqual(40);
    expect(model.crashPct).toBeLessThan(45);
    expect(model.crashAt).toBeLessThan(c[1000].t);
    // ۲x با mmr ۱.۲۵٪: لیکوئید ۴۹.۴٪ > ۴۰٪ ؛ ۳x: ۳۲.۵٪
    const r3 = assess(model, { leverage: 3, maxLeverage: 40, fundingHourly: null });
    expect(r3.crashSurvives).toBe(false);
    expect(r3.crashMaxLeverage).toBe(2);
    expect(assess(model, { leverage: 2, maxLeverage: 40, fundingHourly: null }).crashSurvives).toBe(true);
  });

  it('کمتر از ۱۸۰ روز سابقه: حکم «نامشخص»، نه «امن»؛ کمتر از یک سال: هشدار سابقهٔ کوتاه', () => {
    const short = buildRiskModel(walk(600, () => 0.01), 'long');
    const r = assess(short, { leverage: 3, maxLeverage: 10, fundingHourly: 0 });
    expect(r.verdict).toBe('unknown');
    expect(r.p7d).toBeNull();
    expect(r.safeLeverage).toBeNull();
    expect(buildRiskModel(walk(1500, () => 0.01), 'long')).toMatchObject({ enough: true, shortHistory: true });
    expect(buildRiskModel(walk(2400, () => 0.01), 'long')).toMatchObject({ enough: true, shortHistory: false });
  });

  it('اهرم بالاتر از سقف بازار بریده می‌شود', () => {
    const r = assess(buildRiskModel(walk(2400, () => 0.01), 'short'), { leverage: 100, maxLeverage: 20, fundingHourly: 0.0001 });
    expect(r.leverage).toBe(20);
    expect(r.liqPct).toBeCloseTo(liqDistancePct('short', 20, 20));
    expect(r.fundingDayPct).toBeCloseTo(-0.24);
  });

  it('کندل خام هایپرلیکوئید؛ ردیف خراب کنار می‌رود', () => {
    expect(parseCandles([{ t: 1, T: 2, o: '83772.0', c: '83728.0', h: '84114.0', l: '83700.0', v: '1' }, { t: 2, o: 'x' }, { t: 3, o: '1', h: '1', l: '2', c: '1' }])).toEqual([{ t: 1, o: 83772, h: 84114, l: 83700, c: 83728 }]);
    expect(parseCandles(null)).toEqual([]);
  });
});

describe('اجماع برترها', () => {
  it('یک نهنگ به‌تنهایی «اکثراً لانگ» نمی‌سازد', () => {
    expect(consensus({ longUsd: 9e6, shortUsd: 1e6, longCount: 1, shortCount: 5 })).toBeNull();
    expect(consensus({ longUsd: 9e6, shortUsd: 1e6, longCount: 7, shortCount: 3 })).toBe('long');
    expect(consensus({ longUsd: 1e6, shortUsd: 4e6, longCount: 1, shortCount: 2 })).toBeNull();
    expect(consensus({ longUsd: 1e6, shortUsd: 4e6, longCount: 1, shortCount: 3 })).toBe('short');
    expect(consensus({ longUsd: 0, shortUsd: 0, longCount: 0, shortCount: 0 })).toBeNull();
  });
});

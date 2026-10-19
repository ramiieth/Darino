/**
 * موتور آپشن — Black-76، Payoff، Breakeven، سقف ریسک، انتخاب استراتژی و برنامهٔ خروج
 */
import { describe, expect, it } from 'vitest';
import {
  plansForTarget,
  TARGET_MOVES,
  black76,
  buildStrategy,
  chooseStrategies,
  exitPlan,
  historicalVol,
  ivRegime,
  normCdf,
  payoffAt,
  positionStats,
  probAbove,
  scenarios,
  sensitivities,
  sizeByRisk,
  type ChainOption,
  type Leg,
  type MarketInputs
} from '@/features/calculators/domain';

const opt = (type: 'C' | 'P', side: 'buy' | 'sell', strike: number, premium: number, qty = 1): Leg => ({ kind: 'option', type, side, strike, qty, premium, iv: 0.5 });

describe('Black-76 و توزیع', () => {
  it('N(0)=۰٫۵، N(۱٫۹۶)≈۰٫۹۷۵', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 7);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normCdf(-1.96)).toBeCloseTo(0.025, 3);
  });

  it('برابری Put-Call: C − P = F − K', () => {
    for (const K of [80, 100, 130]) expect(black76('C', 100, K, 0.25, 0.6) - black76('P', 100, K, 0.25, 0.6)).toBeCloseTo(100 - K, 8);
  });

  it('در سررسید یا IV صفر = ارزش ذاتی؛ احتمال بالای Forward کمتر از ۰٫۵', () => {
    expect(black76('C', 120, 100, 0, 0.5)).toBe(20);
    expect(black76('P', 120, 100, 0.1, 0)).toBe(0);
    expect(probAbove(100, 100, 0.25, 0.6)).toBeLessThan(0.5);
    expect(probAbove(100, 100, 0.25, 0.6)).toBeGreaterThan(0.4);
  });
});

describe('Payoff و آمار پوزیشن', () => {
  it('اسپرد صعودی Call ۱۰۰/۱۱۰ با هزینهٔ ۳: سود ۷، ضرر ۳، سربه‌سر ۱۰۳', () => {
    const legs = [opt('C', 'buy', 100, 5), opt('C', 'sell', 110, 2)];
    const s = positionStats(legs, 100, 0.1, 0.5);
    expect(s.netPremium).toBe(-3);
    expect(s.maxProfit).toBeCloseTo(7, 9);
    expect(s.maxLoss).toBeCloseTo(3, 9);
    expect(s.breakevens).toEqual([103]);
    expect(s.pop!).toBeGreaterThan(0);
    expect(s.pop!).toBeLessThan(1);
  });

  it('Long Call: سود نامحدود، ضرر = پرمیوم؛ Naked Short Call: ضرر نامحدود', () => {
    const lc = positionStats([opt('C', 'buy', 100, 5)], 100, 0.1, 0.5);
    expect(lc.maxProfit).toBeNull();
    expect(lc.maxLoss).toBeCloseTo(5, 9);
    expect(lc.breakevens).toEqual([105]);
    const sc = positionStats([opt('C', 'sell', 100, 5)], 100, 0.1, 0.5);
    expect(sc.maxLoss).toBeNull();
    expect(sc.maxProfit).toBeCloseTo(5, 9);
  });

  it('Iron Condor: دو سربه‌سر، ضرر محدود به عرض بال منهای اعتبار', () => {
    const legs = [opt('P', 'sell', 90, 2), opt('P', 'buy', 85, 1), opt('C', 'sell', 110, 2), opt('C', 'buy', 115, 1)];
    const s = positionStats(legs, 100, 0.1, 0.5);
    expect(s.netPremium).toBe(2);
    expect(s.maxProfit).toBeCloseTo(2, 9);
    expect(s.maxLoss).toBeCloseTo(3, 9);
    expect(s.breakevens).toEqual([88, 112]);
  });

  it('Covered Call: اسپات + فروش Call؛ سود سقف دارد', () => {
    const legs: Leg[] = [{ kind: 'spot', side: 'buy', qty: 1, entry: 100 }, opt('C', 'sell', 110, 3)];
    const s = positionStats(legs, 100, 0.1, 0.5);
    expect(s.maxProfit).toBeCloseTo(13, 9);
    expect(s.breakevens).toEqual([97]);
    expect(payoffAt(legs, 0)).toBeCloseTo(-97, 9);
  });

  it('Greeks کل: جمع با علامت؛ داده ناقص = null', () => {
    const legs: Leg[] = [
      { ...(opt('C', 'buy', 100, 5) as Extract<Leg, { kind: 'option' }>), delta: 0.5, theta: -1, vega: 2, gamma: 0.01 },
      { ...(opt('C', 'sell', 110, 2) as Extract<Leg, { kind: 'option' }>), delta: 0.3, theta: -0.6, vega: 1.5, gamma: 0.008 }
    ];
    const g = positionStats(legs, 100, 0.1, 0.5).greeks;
    expect(g.delta).toBeCloseTo(0.2, 9);
    expect(g.theta).toBeCloseTo(-0.4, 9);
    expect(positionStats([opt('C', 'buy', 100, 5)], 100, 0.1, 0.5).greeks.delta).toBeNull();
  });
});

describe('مدیریت سرمایه و بازار', () => {
  it('اندازه با سقف ریسک و گام Derive؛ کمتر از حداقل = null', () => {
    expect(sizeByRisk(100, 30, 0.1, 0.01)).toBe(3.33);
    expect(sizeByRisk(2, 30, 0.1, 0.01)).toBeNull();
  });

  it('نوسان تاریخی و قاعدهٔ IV گران/ارزان', () => {
    expect(historicalVol([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100])).toBe(0);
    expect(historicalVol([1, 2, 3])).toBeNull();
    expect(ivRegime(0.6, 0.5)).toBe('rich');
    expect(ivRegime(0.4, 0.5)).toBe('cheap');
    expect(ivRegime(0.5, 0.5)).toBe('fair');
    expect(ivRegime(null, 0.5)).toBeNull();
  });

  it('جدول انتخاب', () => {
    expect(chooseStrategies('bull', 'cheap', false, 5000, 'moderate')[0]).toBe('bull_call_spread');
    expect(chooseStrategies('bull', 'rich', false, 5000, 'moderate')[0]).toBe('bull_put_spread');
    expect(chooseStrategies('bear', 'rich', false, 5000, 'moderate')[0]).toBe('bear_call_spread');
    expect(chooseStrategies('neutral', 'rich', false, 5000, 'moderate')[0]).toBe('iron_condor');
    expect(chooseStrategies('neutral', 'rich', false, 50000, 'aggressive')).toContain('short_strangle');
    expect(chooseStrategies('neutral', 'rich', false, 5000, 'aggressive')).not.toContain('short_strangle');
    expect(chooseStrategies('bull', 'rich', false, 500, 'moderate')).not.toContain('cash_secured_put');
    expect(chooseStrategies('bear', 'fair', true, 5000, 'moderate')[0]).toBe('protective_put');
    expect(chooseStrategies('neutral', 'rich', true, 5000, 'moderate')[0]).toBe('covered_call');
    expect(chooseStrategies('unsure', 'cheap', false, 5000, 'moderate')[0]).toBe('long_strangle');
    expect(chooseStrategies('bull', 'cheap', false, 5000, 'moderate').length).toBeLessThanOrEqual(3);
  });
});

/** زنجیرهٔ ساختگی ولی سازگار: Delta و قیمت از Black-76 */
function chain(F = 2400, T = 30 / 365, iv = 0.6): ChainOption[] {
  const out: ChainOption[] = [];
  for (let K = 1600; K <= 3200; K += 100)
    for (const type of ['C', 'P'] as const) {
      const price = black76(type, F, K, T, iv);
      const s = iv * Math.sqrt(T);
      const d1 = (Math.log(F / K) + (s * s) / 2) / s;
      out.push({ name: `ETH-X-${K}-${type}`, strike: K, type, bid: price * 0.98, ask: price * 1.02, mark: price, iv, delta: type === 'C' ? normCdf(d1) : normCdf(d1) - 1, gamma: 0.0005, theta: -1, vega: 2, oi: 100, volume: 1000 });
    }
  return out;
}
const M: MarketInputs = { forward: 2400, spot: 2400, T: 30 / 365, atmIv: 0.6, minAmount: 0.1, amountStep: 0.01, takerFeeRate: 0.0003, baseFee: 0.5, feeCapRate: 0.125 };

describe('ساخت استراتژی از زنجیره', () => {
  it('Bull Call Spread: Delta ۰٫۴ و ۰٫۲؛ حداکثر ضرر ≤ سقف ریسک', () => {
    const b = buildStrategy('bull_call_spread', chain(), M, 150, 0)!;
    expect(b.legs).toHaveLength(2);
    const [buy, sell] = b.legs as Extract<Leg, { kind: 'option' }>[];
    expect(buy.side).toBe('buy');
    expect(sell.strike).toBeGreaterThan(buy.strike);
    expect(b.stats.maxLoss!).toBeLessThanOrEqual(150 + 1e-9);
    expect(b.belowMinimum).toBe(false);
    expect(b.fees!).toBeGreaterThan(0);
    expect(b.worstSpreadPct).toBeCloseTo(4, 6);
  });

  it('سرمایه برای حداقل اندازه کافی نیست → belowMinimum با اندازهٔ حداقلی', () => {
    const b = buildStrategy('bull_call_spread', chain(), M, 1, 0)!;
    expect(b.belowMinimum).toBe(true);
    expect(b.qty).toBe(0.1);
  });

  it('Cash-Secured Put: وثیقه = Strike × مقدار − پرمیوم', () => {
    const b = buildStrategy('cash_secured_put', chain(), M, 5000, 0)!;
    const put = b.legs[0] as Extract<Leg, { kind: 'option' }>;
    expect(b.collateral).toBeCloseTo(put.strike * b.qty - b.stats.netPremium, 6);
  });

  it('Covered Call با موجودی: مقدار = موجودی گرد به گام؛ بدون موجودی کافی = حداقلی', () => {
    expect(buildStrategy('covered_call', chain(), M, 100, 3.3)!.qty).toBe(3.3);
    expect(buildStrategy('covered_call', chain(), M, 100, 0.05)!.belowMinimum).toBe(true);
  });

  it('Short Strangle: ضرر نامحدود علامت می‌خورد', () => {
    expect(buildStrategy('short_strangle', chain(), M, 2000, 0)!.unlimitedLoss).toBe(true);
  });

  it('سناریوها، حساسیت و خروج', () => {
    const b = buildStrategy('iron_condor', chain(), M, 300, 0)!;
    const rows = scenarios(b, 2400, M.T);
    expect(rows.map((r) => r.movePct)).toEqual([20, 5, 0, -5, -20]);
    expect(rows[2].atExpiry).toBeCloseTo(b.stats.maxProfit!, 6);
    // +۲۰٪ = ۲۸۸۰ هنوز زیر بال خریداری‌شدهٔ Call است: زیان بین صفر و حداکثر ضرر
    expect(rows[0].atExpiry).toBeCloseTo(payoffAt(b.legs, 2880), 6);
    expect(rows[0].atExpiry).toBeLessThan(0);
    expect(rows[0].atExpiry).toBeGreaterThanOrEqual(-b.stats.maxLoss! - 1e-9);
    const sens = sensitivities(b, 2400, M.T);
    expect(sens.ivUp).toBeLessThan(0); // فروشندهٔ نوسان
    expect(sens.week).toBeGreaterThan(0); // Theta مثبت
    const x = exitPlan(b, 30);
    expect(x.takeProfitUsd).toBeCloseTo(0.5 * b.stats.maxProfit!, 9);
    expect(x.stopLossUsd).toBeCloseTo(2 * b.stats.netPremium, 9);
    expect(x.closeOrRollDaysLeft).toBe(21);
    expect(x.priceLevels.some((l) => l.label.startsWith('قیمت توافقی'))).toBe(true);
  });
});

describe('هدف سود (مستقل از سرمایهٔ کاربر)', () => {
  it('برای سود ۱۰۰۰ دلار: اندازه‌ای که سود خالص پس از کارمزد ≥ هدف شود؛ سرمایه = زیان + کارمزد', () => {
    const plans = plansForTarget(chain(), M, 1000);
    expect(plans.length).toBeGreaterThan(0);
    for (const p of plans) {
      expect(p.netMaxProfit).toBeGreaterThanOrEqual(1000 - 0.005);
      expect(p.capitalNeeded).toBeCloseTo(p.b.stats.maxLoss! + p.b.fees!, 6);
      expect(p.b.unlimitedLoss).toBe(false);
      expect(p.scenarios.map((r) => r.movePct)).toEqual([...TARGET_MOVES]);
      // یک پله کوچک‌تر به هدف نمی‌رسد (کمینه بودن اندازه)
      const perUnit = (p.b.stats.maxProfit! - p.b.fees!) / p.b.qty;
      expect(perUnit * (p.b.qty - M.amountStep)).toBeLessThan(1000 + 1e-6);
    }
    // مرتب: بیشترین احتمال سود اول
    for (let i = 1; i < plans.length; i++) expect((plans[i - 1].pop ?? -1) >= (plans[i].pop ?? -1)).toBe(true);
  });

  it('هیچ گزینه‌ای در همهٔ سناریوها سود نمی‌دهد', () => {
    for (const p of plansForTarget(chain(), M, 1000)) expect(p.scenarios.some((r) => r.net < 0)).toBe(true);
  });

  it('هدف نامعتبر → خالی', () => {
    expect(plansForTarget(chain(), M, 0)).toEqual([]);
  });
});

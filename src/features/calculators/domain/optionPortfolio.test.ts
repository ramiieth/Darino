/**
 * ترکیب چندبازاری، تجزیهٔ سود/زیان، بازه‌های سود و مونت‌کارلو
 */
import { describe, expect, it } from 'vitest';
import {
  attribute,
  betaCorr,
  betaMove,
  black76,
  buildStrategy,
  comboScenarios,
  explainAttribution,
  marketBreadth,
  replayScenarios,
  viewFromMarket,
  monteCarlo,
  normCdf,
  payoffAt,
  pnlZones,
  probMoveBeyond,
  singleCombo,
  suggestCombos,
  type ChainOption,
  type MarketInputs,
  type MarketSnap
} from '@/features/calculators/domain';

function chain(F: number, T: number, iv: number): ChainOption[] {
  const out: ChainOption[] = [];
  for (let k = 0.6; k <= 1.4 + 1e-9; k += 0.025) {
    const K = Math.round(F * k);
    for (const type of ['C', 'P'] as const) {
      const price = black76(type, F, K, T, iv);
      const s = iv * Math.sqrt(T);
      const d1 = (Math.log(F / K) + (s * s) / 2) / s;
      out.push({ name: `X-${K}-${type}`, strike: K, type, bid: price * 0.98, ask: price * 1.02, mark: price, iv, delta: type === 'C' ? normCdf(d1) : normCdf(d1) - 1, gamma: 0, theta: 0, vega: 0, oi: 500, volume: 100 });
    }
  }
  return out;
}

function snap(currency: string, F: number, iv: number, hv: number, beta = 1, corr = 0.8): MarketSnap {
  const T = 30 / 365;
  const m: MarketInputs = { forward: F, spot: F, T, atmIv: iv, minAmount: 0.01, amountStep: 0.01, takerFeeRate: 0.0003, baseFee: 0.5, feeCapRate: 0.125 };
  return { currency, spot: F, days: 30, expiry: '20261120', atmIv: iv, hv, regime: iv / hv > 1.1 ? 'rich' : iv / hv < 0.9 ? 'cheap' : 'fair', chain: chain(F, T, iv), m, beta, corr, oiUsd: 5_000_000 };
}

describe('Beta و همبستگی', () => {
  it('بازده دو برابر BTC → Beta ۲ و همبستگی ۱', () => {
    const base = [];
    const asset = [];
    let b = 100;
    let a = 10;
    for (let i = 0; i < 30; i++) {
      const r = Math.sin(i) * 0.03;
      b *= Math.exp(r);
      a *= Math.exp(2 * r);
      base.push({ t: i * 86_400_000, close: b });
      asset.push({ t: i * 86_400_000, close: a });
    }
    const x = betaCorr(base, asset)!;
    expect(x.beta).toBeCloseTo(2, 6);
    expect(x.corr).toBeCloseTo(1, 6);
    expect(betaCorr(base.slice(0, 5), asset.slice(0, 5))).toBeNull();
    expect(betaMove(0.1, 2)).toBeCloseTo(1.1 ** 2 - 1, 9);
  });
});

describe('تجزیهٔ سود و زیان', () => {
  const s = snap('ETH', 2000, 0.6, 0.5);
  const ic = buildStrategy('iron_condor', s.chain, s.m, 200, 0)!;

  it('قیمت + IV + زمان = کل؛ تا سررسید = Payoff', () => {
    const a = attribute(ic.legs, 2000, s.m.T, { move: -0.1, iv: 0.1, days: 7 });
    expect(a.price + a.vol + a.time).toBeCloseTo(a.total, 9);
    const e = attribute(ic.legs, 2000, s.m.T, { move: 0.05, iv: 0, days: Infinity });
    expect(e.total).toBeCloseTo(payoffAt(ic.legs, 2100), 9);
  });

  it('فروش نوسان: جهش IV ضرر (Vega)، گذر زمان سود (Theta)', () => {
    const up = attribute(ic.legs, 2000, s.m.T, { move: 0, iv: 0.15, days: 0 });
    expect(up.vol).toBeLessThan(0);
    expect(explainAttribution(up, 100)).toContain('IV');
    const t = attribute(ic.legs, 2000, s.m.T, { move: 0, iv: 0, days: 7 });
    expect(t.time).toBeGreaterThan(0);
    expect(explainAttribution(t, 1)).toContain('سود');
  });

  it('بازه‌های سود Iron Condor: وسط سود، دو طرف ضرر، جمع احتمال‌ها ۱', () => {
    const z = pnlZones(ic.legs, 2000, s.m.T, 0.6);
    expect(z.map((x) => x.profit)).toEqual([false, true, false]);
    expect(z.reduce((t, x) => t + x.prob!, 0)).toBeCloseTo(1, 9);
  });

  it('احتمال حرکت بیش از ±x٪', () => {
    const p10 = probMoveBeyond(0.6, 30 / 365, 10)!;
    const p30 = probMoveBeyond(0.6, 30 / 365, 30)!;
    expect(p10).toBeGreaterThan(p30);
    expect(p10).toBeLessThan(1);
    expect(probMoveBeyond(null, 1, 10)).toBeNull();
  });
});

describe('ترکیب‌های پیشنهادی', () => {
  const rich = snap('ETH', 2000, 0.8, 0.5, 1.2, 0.85);
  const rich2 = snap('SOL', 150, 0.9, 0.6, 1.4, 0.8);
  const cheap = snap('BTC', 60000, 0.4, 0.5, 1, 1);

  it('IV اکثراً گران → «بازار آرام» اول؛ نسبی نوسان: Condor روی گران و Strangle روی ارزان', () => {
    const cs = suggestCombos([rich, rich2, cheap], 150);
    expect(cs[0].id).toBe('calm');
    const pair = cs.find((c) => c.id === 'vol_pair')!;
    expect(pair.legs.map((l) => [l.currency, l.strategy.id])).toEqual([
      ['ETH', 'iron_condor'],
      ['BTC', 'long_strangle']
    ]);
    for (const c of cs) {
      expect(c.legs.every((l) => !l.strategy.unlimitedLoss)).toBe(true);
      expect(c.totalMaxLoss).toBeLessThanOrEqual(150 * c.legs.length + 1e-6);
    }
    expect(cs.find((c) => c.id === 'hedged_bull')!.legs[1].currency).toBe('SOL');
  });

  it('بازار کم‌نقد یا یک بازار → بدون ترکیب', () => {
    expect(suggestCombos([rich], 150)).toEqual([]);
    expect(suggestCombos([rich, { ...cheap, oiUsd: 1000 }], 150)).toEqual([]);
  });

  it('سناریوها: ریزش + جهش IV برای دو Condor ضرر، بدون حرکت سود؛ مونت‌کارلو تکرارپذیر', () => {
    const calm = suggestCombos([rich, rich2, cheap], 150).find((c) => c.id === 'calm')!;
    const sc = comboScenarios(calm);
    expect(sc.find((x) => x.id === 'crash')!.total.total).toBeLessThan(0);
    expect(sc.find((x) => x.id === 'mkt0')!.total.total).toBeGreaterThan(0);
    expect(sc.some((x) => x.group === 'divergence')).toBe(true);
    const a = monteCarlo(calm, 'iv')!;
    expect(monteCarlo(calm, 'iv')).toEqual(a);
    expect(a.pProfit).toBeGreaterThan(0);
    expect(a.pProfit).toBeLessThan(1);
    expect(a.worst5).toBeGreaterThanOrEqual(-calm.totalMaxLoss - 1e-6);
    // نوسان واقعی کمتر از IV (HV < IV) به نفع فروشندهٔ نوسان
    expect(monteCarlo(calm, 'hv')!.expected).toBeGreaterThan(a.expected);
  });

  it('تک‌استراتژی به‌شکل ترکیب یک‌پا: بدون سناریوی واگرایی', () => {
    const one = singleCombo(buildStrategy('long_strangle', cheap.chain, cheap.m, 150, 0)!, cheap);
    expect(comboScenarios(one).some((x) => x.group === 'divergence')).toBe(false);
  });
});

describe('دادهٔ زندهٔ بخش بازارها (فقط برای دستیار)', () => {
  const quotes = (up: number) => Array.from({ length: 100 }, (_, i) => ({ symbol: `T${i}`, price: 1, change24h: i < up ? 1 : -1, change7d: i < up ? 2 : -2, change30d: 0 }));

  it('پهنای بازار: بیش از ۶۵٪ مثبت ریسک‌پذیر، کمتر از ۳۵٪ ریسک‌گریز؛ اسنپ‌شات حساب نمی‌شود', () => {
    expect(marketBreadth(quotes(80)).mood).toBe('risk_on');
    expect(marketBreadth(quotes(20)).mood).toBe('risk_off');
    expect(marketBreadth(quotes(50)).mood).toBe('mixed');
    expect(marketBreadth(quotes(80).map((q) => ({ ...q, snapshot: true }))).mood).toBeNull();
  });

  it('دیدگاه از روند: هم‌جهت ۷ و ۳۰ روز؛ بازار ریسک‌گریز صعودی را رد می‌کند', () => {
    const q = (a: number, m: number) => ({ symbol: 'ETH', price: 1, change24h: 0, change7d: a, change30d: m });
    expect(viewFromMarket(q(5, 10), marketBreadth(quotes(50)))!.view).toBe('bull');
    expect(viewFromMarket(q(5, 10), marketBreadth(quotes(20)))!.view).toBe('unsure');
    expect(viewFromMarket(q(-6, -12), marketBreadth(quotes(50)))!.view).toBe('bear');
    expect(viewFromMarket(q(1, -2), marketBreadth(quotes(50)))!.view).toBe('neutral');
    expect(viewFromMarket(null, marketBreadth([]))).toBeNull();
  });

  it('تکرار حرکت اخیر: هر بازار تغییر خودش، تا سررسید = Payoff؛ معکوس به نقطهٔ شروع برمی‌گردد', () => {
    const e = snap('ETH', 2000, 0.8, 0.5);
    const c = singleCombo(buildStrategy('iron_condor', e.chain, e.m, 200, 0)!, e);
    const r = replayScenarios(c, [{ symbol: 'ETH', price: 2000, change24h: 1, change7d: 4, change30d: 25 }]);
    expect(r.map((x) => x.id)).toEqual(['replay-change7d-fwd', 'replay-change30d-fwd', 'replay-change30d-inv']);
    expect(r[1].total.total).toBeCloseTo(payoffAt(c.legs[0].strategy.legs, 2500), 6);
    expect(r[2].perLeg[0].move).toBeCloseTo(1 / 1.25 - 1, 9);
    expect(replayScenarios(c, [])).toEqual([]);
  });
});

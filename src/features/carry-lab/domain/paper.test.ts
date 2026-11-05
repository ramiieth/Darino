import { describe, expect, it } from 'vitest';
import { aprToHourly, carryOnBar, carryOnHour, HOUR_MS, initCarryState, liquidationDistance, simulate, type FundingPoint, type PriceBar } from './engine';
import { advanceLeg, BRAKE_RULE, needsTick, newBook, PAPER_STRATEGIES, parseHlFunding, parseHourBars, parseLighterFunding, recordTick, summarize } from './paper';

const T0 = Date.UTC(2026, 0, 1);
const btc = PAPER_STRATEGIES[0];
const pts = (from: number, n: number, rate: (i: number) => number): FundingPoint[] => Array.from({ length: n }, (_, i) => ({ hour: T0 + (from + i) * HOUR_MS, rate: rate(from + i) }));
const bars = (from: number, n: number, px: (i: number) => number = () => 100): PriceBar[] =>
  Array.from({ length: n }, (_, i) => ({ end: T0 + (from + i) * HOUR_MS, high: px(from + i), low: px(from + i), close: px(from + i) }));
const rate = (i: number) => aprToHourly(10 + 8 * Math.sin(i / 30));

describe('paper bot', () => {
  it('ادامه از وضعیت ذخیره‌شده (JSON) دقیقاً همان نتیجهٔ اجرای پیوسته را می‌دهد', () => {
    const n = 24 * 20;
    const all = pts(0, n, rate);
    const allBars = bars(0, n, (i) => 100 + 10 * Math.sin(i / 50));
    // پیوسته
    const cont = initCarryState();
    let j = 0;
    for (const p of all) {
      while (j < allBars.length && allBars[j].end <= p.hour) carryOnBar(cont, allBars[j++], btc.cost);
      carryOnHour(cont, p, BRAKE_RULE, btc.cost);
    }
    // تیک‌به‌تیک با ذخیره و بازخوانی JSON بین هر تیک
    const book = newBook(9000, {}, T0);
    for (let k = 0; k < n; k += 7) {
      const leg = JSON.parse(JSON.stringify(book.legs['btc-hl']));
      // هر تیک کمی همپوشانی دارد (تکرار باید بی‌اثر باشد)
      advanceLeg(leg, btc, all.slice(Math.max(0, k - 3), k + 7), allBars.slice(Math.max(0, k - 3), k + 7), T0 + (k + 7) * HOUR_MS);
      book.legs['btc-hl'] = leg;
    }
    expect(book.legs['btc-hl'].state.E).toBeCloseTo(cont.E, 12);
    expect(book.legs['btc-hl'].state.entries).toBe(cont.entries);
  });

  it('بک‌تست و استپر یکی‌اند', () => {
    const n = 24 * 30;
    const all = pts(0, n, rate);
    const b = bars(0, n);
    const sim = simulate(all, b, BRAKE_RULE, { ...btc.cost, perpFeePct: 0, spotFeePct: 0, slippagePct: 0 });
    const s = initCarryState();
    let j = 0;
    for (const p of all) {
      while (j < b.length && b[j].end <= p.hour) carryOnBar(s, b[j++], { ...btc.cost, perpFeePct: 0, spotFeePct: 0, slippagePct: 0 });
      carryOnHour(s, p, BRAKE_RULE, { ...btc.cost, perpFeePct: 0, spotFeePct: 0, slippagePct: 0 });
    }
    expect(sim.equity[sim.equity.length - 1]).toBeCloseTo(s.E, 12);
  });

  it('پیش‌گرم: با تاریخچهٔ ۷ روزه از اولین ساعت وارد می‌شود', () => {
    const book = newBook(9000, { 'btc-hl': pts(0, 168, () => aprToHourly(10)) }, T0);
    const leg = book.legs['btc-hl'];
    const ev = advanceLeg(leg, btc, pts(168, 3, () => aprToHourly(10)), bars(167, 4), T0 + 171 * HOUR_MS);
    expect(ev.some((e) => e.kind === 'enter')).toBe(true);
    expect(leg.state.open).toBe(true);
  });

  it('ترمز: میانگین ۷ روزهٔ منفی → خروج', () => {
    const book = newBook(9000, { 'btc-hl': pts(0, 168, () => aprToHourly(10)) }, T0);
    const leg = book.legs['btc-hl'];
    advanceLeg(leg, btc, pts(168, 2, () => aprToHourly(10)), bars(167, 3), T0 + 170 * HOUR_MS);
    const ev = advanceLeg(leg, btc, pts(170, 400, () => aprToHourly(-20)), bars(170, 400), T0 + 570 * HOUR_MS);
    expect(ev.some((e) => e.kind === 'exit')).toBe(true);
    expect(leg.state.open).toBe(false);
  });

  it('هشدار نزدیک لیکوئید با فاصلهٔ ۶ ساعته', () => {
    const book = newBook(9000, { 'btc-hl': pts(0, 168, () => aprToHourly(10)) }, T0);
    const leg = book.legs['btc-hl'];
    advanceLeg(leg, btc, pts(168, 2, () => aprToHourly(10)), bars(167, 3), T0 + 170 * HOUR_MS);
    const d = liquidationDistance(btc.cost.leverage, btc.cost.mmrPct);
    const spike = (i: number) => (i >= 171 && i <= 173 ? 100 * (1 + d * 0.85) : 100);
    const b = bars(170, 6).map((x, k) => ({ ...x, high: spike(170 + k), close: 100 }));
    const ev = advanceLeg(leg, btc, pts(170, 6, () => aprToHourly(10)), b, T0 + 176 * HOUR_MS);
    expect(ev.filter((e) => e.kind === 'near-liquidation')).toHaveLength(1);
  });

  it('needsTick و recordTick و summarize', () => {
    const book = newBook(9000, {}, T0);
    expect(needsTick(book, T0 + HOUR_MS)).toBe(true);
    for (const st of PAPER_STRATEGIES) book.legs[st.id].state.lastHour = T0 + HOUR_MS;
    expect(needsTick(book, T0 + HOUR_MS + 600_000)).toBe(false);
    expect(needsTick(book, T0 + 2 * HOUR_MS)).toBe(true);
    recordTick(book, [], T0 + HOUR_MS, []);
    const s = summarize(book, T0 + HOUR_MS);
    expect(s.totalUsd).toBeCloseTo(9000, 6);
    expect(s.annualized).toBeNull();
  });

  it('پارسرها', () => {
    expect(parseHlFunding([{ time: T0 + 5, fundingRate: '0.0001' }, { time: 'x' }])).toEqual([{ hour: T0, rate: 0.0001 }]);
    expect(parseLighterFunding({ fundings: [{ timestamp: T0 / 1000, rate: '0.01', direction: 'short' }] })).toEqual([{ hour: T0, rate: -0.0001 }]);
    expect(parseHourBars({ c: [{ t: T0, h: 2, l: 1, c: 1.5 }] })).toEqual([{ end: T0 + HOUR_MS, high: 2, low: 1, close: 1.5 }]);
    expect(parseHourBars([{ t: T0, h: '2', l: '1', c: '1.5' }])[0].close).toBe(1.5);
  });
});

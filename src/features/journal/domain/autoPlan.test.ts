import { describe, expect, it } from 'vitest';
import type { ClassifiedTrade, TriggerOrder } from './types';
import { autoOutlook, autoPlans, autoReport, fromArcusOrders, fromHlOrders, levelsFor } from './autoPlan';
import { stopDiscipline } from './audit';

const M = 60_000;
const T0 = Date.UTC(2026, 9, 20, 10);
const acc = { key: 'hl:0xabc' };

function trade(p: Partial<ClassifiedTrade> = {}): ClassifiedTrade {
  return {
    id: 'hl:0xabc|BTC|1', account: 'hl:0xabc', venue: 'hyperliquid', symbol: 'BTC', base: 'BTC', direction: 'long',
    openTime: T0, closeTime: T0 + 120 * M, open: false, truncated: false, entryPx: 100, exitPx: 96,
    maxSize: 10, maxNotional: 1000, volume: 2000, grossPnl: -40, fees: 0, funding: 0, netPnl: -40, fills: 2, liquidated: false,
    book: 'directional', bookReason: 'test', ...p
  } as ClassifiedTrade;
}
const order = (p: Partial<TriggerOrder>): TriggerOrder => ({ id: `o${Math.random()}`, account: 'hl:0xabc', symbol: 'BTC', kind: 'sl', side: 'sell', triggerPx: 95, placedAt: T0 + M, endedAt: null, status: 'open', ...p });
const full = { from: 0, why: null };

describe('برنامهٔ خودکار', () => {
  it('سفارش‌های هایپرلیکوئید: فقط استاپ و هدف، بدون اسپات', () => {
    const raw = [
      { order: { coin: 'BTC', side: 'A', triggerPx: '95', orderType: 'Stop Market', timestamp: T0, oid: 1 }, status: 'triggered', statusTimestamp: T0 + 5 * M },
      { order: { coin: 'BTC', side: 'A', triggerPx: '110', orderType: 'Take Profit Limit', timestamp: T0, oid: 2 }, status: 'open' },
      { order: { coin: 'BTC', side: 'B', limitPx: '99', orderType: 'Limit', timestamp: T0, oid: 3 }, status: 'filled' },
      { order: { coin: '@107', side: 'A', triggerPx: '1', orderType: 'Stop Market', timestamp: T0, oid: 4 }, status: 'open' }
    ];
    const o = fromHlOrders(acc, raw);
    expect(o.map((x) => [x.kind, x.side, x.triggerPx, x.endedAt])).toEqual([['sl', 'sell', 95, T0 + 5 * M], ['tp', 'sell', 110, null]]);
    const a = fromArcusOrders(acc, [{ orderId: 'x', marketDisplayName: 'ETH', side: 'BUY', tpslType: 'STOP_LOSS', triggerPrice: '2100', createdAt: String(T0 * 1000), updatedAt: String(T0 * 1000), status: 'OPEN' }]);
    expect(a[0]).toMatchObject({ kind: 'sl', side: 'buy', triggerPx: 2100, placedAt: T0, endedAt: null });
  });

  it('استاپ اولیه، هدف، استاپ دیر و دورتر شدن', () => {
    const t = trade();
    const lv = levelsFor(t, [order({ placedAt: T0 + 20 * M, triggerPx: 95 }), order({ placedAt: T0 + 40 * M, triggerPx: 92 }), order({ kind: 'tp', triggerPx: 110 })], full, T0);
    expect(lv.stop).toBe(95);
    expect(lv.target).toBe(110);
    expect(lv.meta).toMatchObject({ stopSource: 'exchange', stopLateMin: 20, finalStop: 92, stopMoved: 'wider' });
    const tighter = levelsFor(t, [order({ triggerPx: 95 }), order({ placedAt: T0 + 30 * M, triggerPx: 100 })], full, T0);
    expect(tighter.meta.stopMoved).toBe('tighter');
    expect(tighter.meta.stopLateMin).toBeNull();
  });

  it('سفارش حساب، نماد یا سمت دیگر و استاپ لغوشده قبل از ورود حساب نمی‌شود', () => {
    const t = trade();
    const lv = levelsFor(t, [order({ account: 'hl:0xdef' }), order({ symbol: 'ETH' }), order({ side: 'buy' }), order({ placedAt: T0 - 60 * M, endedAt: T0 - 30 * M })], full, T0);
    expect(lv.meta.stopSource).toBe('none');
  });

  it('لایتر یا معاملهٔ قدیمی‌تر از تاریخچهٔ سفارش‌ها → خوانده نمی‌شود (نه «بدون استاپ»)', () => {
    expect(levelsFor(trade(), [], { from: null, why: 'لایتر' }, T0).meta).toMatchObject({ stopSource: 'unreadable', unreadableWhy: 'لایتر' });
    expect(levelsFor(trade(), [], { from: T0 + M, why: null }, T0).meta.stopSource).toBe('unreadable');
  });

  it('برنامهٔ نوشته‌شده مقدم است؛ گزارش و نظم استاپ', () => {
    const a = trade({ id: 'a' }), b = trade({ id: 'b', openTime: T0 + 200 * M, closeTime: T0 + 300 * M, netPnl: 30 }), c = trade({ id: 'c', account: 'lm:1' });
    const cov = new Map([['hl:0xabc', full]]);
    const plans = autoPlans([a, b, c], new Map(), [order({})], cov, T0);
    expect(plans.get('a')!.stop).toBe(95);
    expect(plans.get('b')!.auto!.stopSource).toBe('none');
    expect(plans.get('c')!.auto!.stopSource).toBe('unreadable');
    const r = autoReport([a, b, c], plans, 10_000, 1);
    // ریسک a = ۱۰ × ۵ = ۵۰ دلار = ۰٫۵٪؛ R = −۴۰ ÷ ۵۰
    expect(r).toMatchObject({ trades: 3, readable: 2, withStop: 1, overRisk: 0, noStopNet: 30 });
    expect(r.avgRiskPct).toBeCloseTo(0.5);
    expect(r.avgR).toBeCloseTo(-0.8);
    expect(stopDiscipline([a, b, c], new Map(), plans)).toBe(50);
    const withManual = autoPlans([a], new Map([['a', plans.get('a')!]]), [], cov, T0);
    expect(withManual.size).toBe(0);
  });

  it('چشم‌انداز خودکار از کندل روزانه: روند صعودی و هم‌جهت', () => {
    const D = 86_400_000;
    const up = Array.from({ length: 120 }, (_, i) => ({ t: T0 - (120 - i) * D, o: 100 + i, h: 101 + i, l: 99 + i, c: 100.5 + i }));
    const o = autoOutlook(up, T0, 'long')!;
    expect(o).toMatchObject({ dailyBias: 'bullish', weeklyBias: 'bullish', env: 'trend', proTrend: 'y' });
    expect(autoOutlook(up, T0, 'short')!.proTrend).toBe('n');
    expect(autoOutlook(up.slice(0, 30), T0, 'long')).toBeNull();
  });
});

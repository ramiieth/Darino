import { describe, expect, it } from 'vitest';
import { buildOrderTicket, floorToStep, ticketProgress, type TicketInput } from '@/features/calculators/domain';

const leg = (o: Partial<TicketInput['long']> = {}): TicketInput['long'] => ({ venue: 'x', price: 3000, stepQty: 0.001, minQty: 0, volume24hUsd: null, ...o });
const base: TicketInput = { mode: 'open', notionalPerSide: 1000, chunks: 4, long: leg({ volume24hUsd: 5e6 }), short: leg({ price: 3006, volume24hUsd: 5e8 }) };

describe('floorToStep', () => {
  it('بدون خطای ممیز شناور', () => {
    expect(floorToStep(0.3, 0.1)).toBe(0.3);
    expect(floorToStep(0.33333, 0.001)).toBe(0.333);
    expect(floorToStep(7, 0)).toBe(7);
  });
});

describe('buildOrderTicket', () => {
  it('تعداد برابر دو طرف، گرد به گام درشت‌تر، تکه‌ها جمعشان = کل', () => {
    const t = buildOrderTicket({ ...base, short: leg({ price: 3006, stepQty: 0.01, volume24hUsd: 5e8 }) });
    expect(t.refPrice).toBe(3003);
    expect(t.step).toBe(0.01);
    expect(t.qtyPerSide).toBe(0.33); // ۱۰۰۰ ÷ ۳۰۰۳ = ۰٫۳۳۳ → ۰٫۳۳
    expect(t.chunks.map((c) => c.qty)).toEqual([0.08, 0.08, 0.08, 0.09]);
    expect(t.chunks.at(-1)!.cumQty).toBeCloseTo(0.33, 12);
    expect(t.basisPct).toBeCloseTo(0.2, 9);
    expect(t.roundingLeftoverUsd).toBeCloseTo((1000 / 3003 - 0.33) * 3003, 6);
  });

  it('پای اول = صرافی کم‌حجم‌تر؛ حجم نامعلوم → لانگ پیش‌فرض', () => {
    expect(buildOrderTicket(base)).toMatchObject({ firstLeg: 'long', firstLegByVolume: true });
    expect(buildOrderTicket({ ...base, long: leg({ volume24hUsd: 9e9 }) })).toMatchObject({ firstLeg: 'short', firstLegByVolume: true });
    expect(buildOrderTicket({ ...base, long: leg() })).toMatchObject({ firstLeg: 'long', firstLegByVolume: false });
  });

  it('هشدارها: بی‌قیمت، گرد به صفر، زیر حداقل، تکهٔ کوچک', () => {
    expect(buildOrderTicket({ ...base, long: leg({ price: null }), short: leg({ price: null }) }).warnings).toContain('noPrice');
    expect(buildOrderTicket({ ...base, notionalPerSide: 1 }).warnings).toContain('roundedToZero');
    const t = buildOrderTicket({ ...base, long: leg({ minQty: 0.1 }) });
    expect(t.warnings).toContain('chunkBelowMin');
    expect(t.maxChunks).toBe(3);
    expect(buildOrderTicket({ ...base, long: leg({ minQty: 1 }) }).warnings).toContain('belowMin');
  });

  it('بستن با تعداد مستقیم (پوزیشن فعلی)', () => {
    const t = buildOrderTicket({ ...base, mode: 'close', qtyPerSide: 0.5, chunks: 2 });
    expect(t.qtyPerSide).toBe(0.5);
    expect(t.chunks.map((c) => c.qty)).toEqual([0.25, 0.25]);
  });
});

describe('ticketProgress', () => {
  const t = buildOrderTicket({ ...base, notionalPerSide: 1200, long: leg({ price: 3000, volume24hUsd: 1 }), short: leg({ price: 3000, volume24hUsd: 2 }) }); // ۰٫۴ → ۴ × ۰٫۱
  const zero = { long: 0, short: 0 };

  it('شروع: قدم بعدی = پای اول تکهٔ ۱', () => {
    expect(ticketProgress(t, zero, zero)).toMatchObject({ doneChunks: 0, next: { side: 'long', qty: 0.1, reason: 'chunk' }, complete: false });
  });

  it('یک طرف جلوتر → اول توازن', () => {
    const p = ticketProgress(t, zero, { long: 0.1, short: 0.04 });
    expect(p.next).toEqual({ side: 'short', qty: 0.06, reason: 'rebalance' });
    expect(p.imbalancePct).toBeCloseTo(60, 6);
  });

  it('تکه‌های کامل، پوزیشن قبلی و پایان', () => {
    expect(ticketProgress(t, { long: 1, short: 1 }, { long: 1.2, short: 1.2 })).toMatchObject({ doneChunks: 2, next: { side: 'long', qty: 0.1, reason: 'chunk' } });
    expect(ticketProgress(t, zero, { long: 0.4, short: 0.4 })).toMatchObject({ doneChunks: 4, next: null, complete: true });
  });

  it('بستن: اجراشده = شروع − فعلی', () => {
    const c = buildOrderTicket({ ...base, mode: 'close', qtyPerSide: 0.4, chunks: 2 });
    const p = ticketProgress(c, { long: 0.4, short: 0.4 }, { long: 0.2, short: 0.2 });
    expect(p).toMatchObject({ doneLong: 0.2, doneShort: 0.2, doneChunks: 1, next: { reason: 'chunk', qty: 0.2 } });
  });
});

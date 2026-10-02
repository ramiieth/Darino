/** جمع‌بندی Arcus — دادهٔ مصنوعی */
import { describe, expect, it } from 'vitest';
import { allTimePnl, summarizeHistory, totalMarginUsed } from './summary';
import type { ArcusFill, ArcusFunding } from '../api/types';

const fill = (p: Partial<ArcusFill>): ArcusFill => ({
  tradeId: Math.random().toString(),
  orderId: 'o',
  marketId: 1,
  marketDisplayName: 'TEST-USD',
  side: 'BUY',
  originalSize: '1',
  size: '1',
  price: '10',
  fee: '0',
  role: 'TAKER',
  createdAt: '1800000000000000',
  ...p
});
const fund = (payment: string): ArcusFunding => ({ marketId: 1, marketDisplayName: 'TEST-USD', fundingRate: '0', size: '1', payment, time: '1800000000000000' });

describe('summarizeHistory', () => {
  it('کارمزد داخل closedPnl دوباره کم نمی‌شود', () => {
    const t = summarizeHistory([fill({ closedPnl: '-0.05', fee: '0.05' }), fill({ closedPnl: '4.95', fee: '0.05' })], []);
    expect(t.closedPnl).toBe('4.9');
    expect(t.feesInfo).toBe('0.1');
    expect(t.realized).toBe('4.9');
  });

  it('funding جدا جمع می‌شود (مثبت دریافت، منفی پرداخت)', () => {
    const t = summarizeHistory([fill({ closedPnl: '1' })], [fund('0.25'), fund('-0.75')]);
    expect(t.funding).toBe('-0.5');
    expect(t.realized).toBe('0.5');
  });

  it('جریمهٔ لیکوئید (داخل fee و نه closedPnl) فقط یک‌بار کم می‌شود؛ ADL کارمزد ندارد', () => {
    const t = summarizeHistory(
      [
        fill({ closedPnl: '-3', fee: '0.4', liquidation: { method: 'LIQUIDATION', liquidatedUser: 'x' } }),
        fill({ closedPnl: '-1', fee: '0', liquidation: { method: 'ADL', liquidatedUser: 'x' } })
      ],
      []
    );
    expect(t.liquidationFees).toBe('0.4');
    expect(t.liquidationCount).toBe(1);
    expect(t.realized).toBe('-4.4');
  });

  it('closedPnl ناموجود صفر فرض نمی‌شود و شمارش می‌شود', () => {
    const t = summarizeHistory([fill({ closedPnl: undefined })], []);
    expect(t.missingClosedPnl).toBe(1);
  });
});

describe('equity و margin', () => {
  it('PnL کل = equity − netDeposits؛ notional پوزیشن با equity جمع نمی‌شود', () => {
    expect(allTimePnl('105.5', '100')).toBe('5.5');
  });
  it('جمع marginUsed دقیق', () => {
    expect(totalMarginUsed([{ marginUsed: '0.1' }, { marginUsed: '0.2' }])).toBe('0.3');
  });
});

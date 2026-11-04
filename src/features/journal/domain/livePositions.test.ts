import { describe, expect, it } from 'vitest';
import type { Trade } from './types';
import { hlLivePositions, liveTradeId, mergeLivePositions, type LivePosition } from './livePositions';
import { autoPlans } from './autoPlan';
import { classifyTrades } from './classify';
import { DEFAULT_SETTINGS } from './defaults';

const ACC = 'lr:0xabc:3';
const live = (p: Partial<LivePosition> = {}): LivePosition => ({ account: ACC, venue: 'lighter-robinhood', symbol: 'TSLA', direction: 'long', size: 2, entry: 400, mark: 410, pnl: 20, ...p });
const trade = (p: Partial<Trade>): Trade => ({ id: 't1', account: ACC, venue: 'lighter-robinhood', symbol: 'TSLA', base: 'TSLA', direction: 'long', openTime: 1, closeTime: null, open: true, truncated: true, entryPx: null, exitPx: null, maxSize: 2, maxNotional: 0, volume: 0, grossPnl: 0, fees: null, funding: null, netPnl: 0, fills: 1, liquidated: false, ...p });

describe('پوزیشن‌های زندهٔ صرافی در ژورنال', () => {
  it('پوزیشنی که اجرای ورودش در تاریخچه نیست → معاملهٔ باز با ورود صرافی', () => {
    const out = mergeLivePositions([], [live()], 1000);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: liveTradeId(live()), open: true, entryPx: 400, maxSize: 2, fills: 0 });
  });

  it('معاملهٔ باز موجود فقط تکمیل می‌شود، تکراری ساخته نمی‌شود', () => {
    const out = mergeLivePositions([trade({})], [live()], 1000);
    expect(out).toHaveLength(1);
    expect(out[0].entryPx).toBe(400);
  });

  it('پای نوترال لایتر رابین‌هود هم برنامهٔ خودکار می‌گیرد (پوزیشن باز)', () => {
    const all = classifyTrades(mergeLivePositions([], [live()], 1000), DEFAULT_SETTINGS, new Map(), 1000);
    expect(all[0].book).toBe('neutral');
    const auto = autoPlans(all, new Map(), [{ id: 'o', account: ACC, symbol: 'TSLA', kind: 'sl', side: 'sell', triggerPx: 380, placedAt: 1, endedAt: null, status: 'open' }], new Map([[ACC, { from: 500, why: null }]]), 1000);
    expect(auto.get(all[0].id)).toMatchObject({ stop: 380, entry: 400 });
  });

  it('clearinghouseState هایپرلیکوئید', () => {
    expect(hlLivePositions('hl:0x1', 'hyperliquid', { assetPositions: [{ position: { coin: 'ETH', szi: '-1.5', entryPx: '3000', positionValue: '4350', unrealizedPnl: '150' } }, { position: { coin: 'BTC', szi: '0' } }] }))
      .toEqual([{ account: 'hl:0x1', venue: 'hyperliquid', symbol: 'ETH', direction: 'short', size: 1.5, entry: 3000, mark: 2900, pnl: 150 }]);
  });
});

/**
 * تست‌های Trading Analytics Hyperliquid
 */
import { describe, expect, it } from 'vitest';
import {
  computeTradeAnalytics,
  cumulativePnlSeries,
  dailyPnl,
  fillDirection,
  avgHoldingHours,
  type TradeAnalytics
} from '@/features/hyperliquid/domain/analytics';
import type { HlFill } from '@/features/hyperliquid/data/hyperliquidService';

const fill = (over: Partial<HlFill>): HlFill => ({
  coin: 'BTC',
  px: '60000',
  sz: '1',
  side: 'B',
  time: 1700000000000,
  startPosition: '0',
  dir: 'Open Long',
  closedPnl: '0',
  hash: '0x' + Math.random().toString(16).slice(2),
  ...over
});

describe('Hyperliquid Analytics', () => {
  it('جهت فیل‌ها (Open/Close Long/Short)', () => {
    expect(fillDirection(fill({ dir: 'Open Long', side: 'B' }))).toBe('openLong');
    expect(fillDirection(fill({ dir: 'Close Long', side: 'A' }))).toBe('closeLong');
    expect(fillDirection(fill({ dir: 'Open Short', side: 'A' }))).toBe('openShort');
    expect(fillDirection(fill({ dir: 'Close Short', side: 'B' }))).toBe('closeShort');
    // فالبک بدون dir
    expect(fillDirection(fill({ dir: '', side: 'B', startPosition: '-1' }))).toBe('openLong');
    expect(fillDirection(fill({ dir: '', side: 'B', startPosition: '2' }))).toBe('closeLong');
  });

  it('Win Rate و Profit Factor از فیل‌ها', () => {
    const fills = [
      fill({ closedPnl: '100', time: 1 }),
      fill({ closedPnl: '-50', time: 2 }),
      fill({ closedPnl: '50', time: 3 }),
      fill({ closedPnl: '0', time: 4 })
    ];
    const a = computeTradeAnalytics(fills);
    expect(a.totalTrades).toBe(4);
    expect(a.winRate).toBeCloseTo(50, 4); // ۲ برد از ۴
    expect(a.avgWin).toBeCloseTo(75, 4);
    expect(a.avgLoss).toBeCloseTo(-50, 4);
    expect(a.profitFactor).toBeCloseTo(3, 4); // 150/50
    expect(a.totalRealizedPnl).toBe(100);
  });

  it('بیشترین برد/باخت متوالی', () => {
    const fills = [
      fill({ closedPnl: '10', time: 1 }),
      fill({ closedPnl: '20', time: 2 }),
      fill({ closedPnl: '-5', time: 3 }),
      fill({ closedPnl: '7', time: 4 }),
      fill({ closedPnl: '-3', time: 5 }),
      fill({ closedPnl: '-8', time: 6 })
    ];
    const a = computeTradeAnalytics(fills);
    expect(a.maxWinStreak).toBe(2);
    expect(a.maxLossStreak).toBe(2);
  });

  it('بهترین و بدترین معامله', () => {
    const fills = [
      fill({ closedPnl: '100', coin: 'ETH', time: 5 }),
      fill({ closedPnl: '-200', coin: 'SOL', time: 6 })
    ];
    const a = computeTradeAnalytics(fills);
    expect(a.bestTrade?.pnl).toBe(100);
    expect(a.bestTrade?.coin).toBe('ETH');
    expect(a.worstTrade?.pnl).toBe(-200);
    expect(a.worstTrade?.coin).toBe('SOL');
  });

  it('فیلترهای هزینه و سود خالص', () => {
    const fills = [fill({ closedPnl: '100', fee: '10' }), fill({ closedPnl: '-50', fee: '5' })];
    const a = computeTradeAnalytics(fills);
    expect(a.totalFees).toBe(15);
    expect(a.netPnl).toBe(35); // 50 − 15
  });

  it('میانگین مدت نگهداری: Open → Close همان coin', () => {
    const H = 3_600_000;
    const fills = [
      fill({ coin: 'BTC', dir: 'Open Long', time: 1_700_000_000_000 }),
      fill({ coin: 'BTC', dir: 'Close Long', time: 1_700_000_000_000 + H }) // ۱ ساعت بعد
    ];
    expect(avgHoldingHours(fills)).toBeCloseTo(1, 4);
  });

  it('سری PnL تجمعی مرتب بر اساس زمان', () => {
    const fills = [
      fill({ closedPnl: '30', time: 3 }),
      fill({ closedPnl: '-10', time: 1 }),
      fill({ closedPnl: '20', time: 2 })
    ];
    const s = cumulativePnlSeries(fills);
    expect(s.map((x) => x.pnl)).toEqual([-10, 10, 40]);
  });

  it('توزیع بر اساس نماد و بزرگ‌ترین/کوچک‌ترین معامله', () => {
    const fills = [
      fill({ coin: 'BTC', px: '100', sz: '2' }), // 200
      fill({ coin: 'BTC', px: '100', sz: '0.5' }), // 50
      fill({ coin: 'ETH', px: '2000', sz: '1' }) // 2000
    ];
    const a = computeTradeAnalytics(fills);
    expect(a.bySymbol.find((x) => x.symbol === 'BTC')?.count).toBe(2);
    expect(a.largestTrade?.coin).toBe('ETH');
    expect(a.smallestTrade?.coin).toBe('BTC');
    expect(a.smallestTrade?.notional).toBe(50);
  });

  it('فیلدهای خالی → بدون کرش', () => {
    const a = computeTradeAnalytics([]);
    expect(a.totalTrades).toBe(0);
    expect(a.winRate).toBeNull();
    expect(a.profitFactor).toBeNull();
    expect(a.maxWinStreak).toBe(0);
  });

  it('dailyPnl گروه‌بندی روزانه', () => {
    const fills = [
      fill({ closedPnl: '10', time: new Date('2024-01-01T10:00:00Z').getTime() }),
      fill({ closedPnl: '-4', time: new Date('2024-01-01T20:00:00Z').getTime() }),
      fill({ closedPnl: '7', time: new Date('2024-01-02T10:00:00Z').getTime() })
    ];
    const d = dailyPnl(fills);
    expect(d).toHaveLength(2);
    expect(d[0].pnl).toBe(6);
    expect(d[1].pnl).toBe(7);
  });
});

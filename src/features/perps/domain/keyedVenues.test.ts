import { describe, expect, it } from 'vitest';
import { asterSnapshot, ondoSnapshot, qfexSnapshot, ASTER_INCOME_LIMIT } from './keyedVenues';
import { fromKeyed } from './perpPortfolio';

const NOW = Date.parse('2026-10-25T00:00:00Z');
const DAY = 86_400_000;

describe('اوندو پرپس', () => {
  it('ارزش، سود کل، باز/بسته و دوره‌ای از نمودار totalPnL؛ پوزیشن خنثی حذف', () => {
    const s = ondoSnapshot({
      now: NOW,
      balance: { success: true, result: { marginBalance: '5200', unrealizedPnl: '150', totalPnL: '700', realizedPnl: '600' } },
      positions: { success: true, result: [
        { market: 'AAPL-USD.P', direction: 'long', netQuantity: '10', averageEntryPrice: '230', markPrice: '245', unrealizedPnl: '150', liquidationPrice: '150' },
        { market: 'TSLA-USD.P', direction: 'neutral', netQuantity: '0' }
      ] },
      graphs: { '24h': { result: [{ totalPnL: '650' }, { totalPnL: '700' }] }, '7d': { result: [{ totalPnL: '400' }, { totalPnL: '700' }] }, '30d': null }
    });
    expect(s).toMatchObject({ venue: 'ondo', equity: 5200, unrealizedPnl: 150, allTimePnl: 700, realizedPnl: 550, periodPnl: { day: 50, week: 300, month: null } });
    expect(s.positions).toEqual([{ symbol: 'AAPL', side: 'long', size: 10, entry: 230, mark: 245, pnl: 150, liquidation: 150 }]);
  });
});

describe('کیوفکس', () => {
  it('ارزش از account-equity، سود کل = realised + unrealised + funding؛ دوره‌ای نامعلوم', () => {
    const s = qfexSnapshot({
      now: NOW,
      positions: { balance: { deposit: 1000, realised_pnl: 80, unrealised_pnl: -20, net_funding: -5, order_margin: 0, position_margin: 100, available_balance: 900, builder_rewards: 0 },
        positions: [{ symbol: 'NVDA-USD', position: -3, average_price: 180, unrealised_pnl: -20 }, { symbol: 'X-USD', position: 0 }] },
      equity: { data: [{ window_start: 'a', value: 1040 }, { window_start: 'b', value: 1055 }] }
    });
    expect(s).toMatchObject({ venue: 'qfex', equity: 1055, unrealizedPnl: -20, allTimePnl: 55, realizedPnl: 75, periodPnl: { day: null, week: null, month: null } });
    expect(s.positions).toEqual([{ symbol: 'NVDA', side: 'short', size: 3, entry: 180, mark: null, pnl: -20, liquidation: null }]);
  });
});

describe('آستر', () => {
  const account = { totalMarginBalance: '2400', totalUnrealizedProfit: '35' };
  const positions = [
    { symbol: 'BTCUSDT', positionAmt: '0.01', entryPrice: '80000', markPrice: '83500', unRealizedProfit: '35', liquidationPrice: '0', positionSide: 'BOTH' },
    { symbol: 'ETHUSDT', positionAmt: '0', positionSide: 'BOTH' },
    { symbol: 'SOLUSDT', positionAmt: '-5', entryPrice: '150', markPrice: '150', unRealizedProfit: '0', liquidationPrice: '210', positionSide: 'SHORT' }
  ];
  it('دوره‌ای از درآمد معاملاتی (بدون انتقال)؛ سود کل نامعلوم', () => {
    const incomes = [
      { incomeType: 'REALIZED_PNL', income: '20', time: NOW - 3_600_000 },
      { incomeType: 'COMMISSION', income: '-2', time: NOW - 3_600_000 },
      { incomeType: 'FUNDING_FEE', income: '-1', time: NOW - 3 * DAY },
      { incomeType: 'TRANSFER', income: '1000', time: NOW - 3 * DAY },
      { incomeType: 'REALIZED_PNL', income: '50', time: NOW - 20 * DAY }
    ];
    const s = asterSnapshot({ account, positions, incomes, now: NOW });
    expect(s).toMatchObject({ venue: 'aster', equity: 2400, unrealizedPnl: 35, allTimePnl: null, periodPnl: { day: 18, week: 17, month: 67 } });
    expect(s.positions.map((p) => [p.symbol, p.side, p.size, p.liquidation])).toEqual([['BTC', 'long', 0.01, null], ['SOL', 'short', 5, 210]]);
  });

  it('پاسخ درآمد بریده (سقف ۱۰۰۰) → بازه‌ای که پوشش کامل ندارد نامعلوم', () => {
    const incomes = Array.from({ length: ASTER_INCOME_LIMIT }, (_, i) => ({ incomeType: 'REALIZED_PNL', income: '1', time: NOW - (i % 5) * DAY }));
    const s = asterSnapshot({ account, positions: [], incomes, now: NOW });
    expect(s.periodPnl.day).not.toBeNull();
    expect(s.periodPnl.month).toBeNull();
  });
});

describe('fromKeyed', () => {
  it('خطای یک پلتفرم → کارت «دریافت نشد» بدون عدد', () => {
    expect(fromKeyed({ venue: 'ondo', error: 'HTTP 401' }, 'اوندو')).toMatchObject({ status: 'error', equity: null, allTimePnl: null, positions: [] });
    expect(fromKeyed(asterSnapshot({ account: { totalMarginBalance: '1' }, positions: [], incomes: [], now: NOW }), 'آستر')).toMatchObject({ venue: 'aster', unit: 'USDT', status: 'ready', equity: 1 });
  });
});

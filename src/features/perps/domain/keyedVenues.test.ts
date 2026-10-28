import { describe, expect, it } from 'vitest';
import { ondoSnapshot } from './keyedVenues';
import { fromKeyed } from './perpPortfolio';

const NOW = Date.parse('2026-10-25T00:00:00Z');

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

describe('fromKeyed', () => {
  it('خطای یک پلتفرم → کارت «دریافت نشد» بدون عدد', () => {
    expect(fromKeyed({ venue: 'ondo', error: 'HTTP 401' }, 'اوندو')).toMatchObject({ status: 'error', equity: null, allTimePnl: null, positions: [] });
    expect(fromKeyed(ondoSnapshot({ balance: { result: { marginBalance: '1' } }, positions: null, graphs: {}, now: NOW }), 'اوندو')).toMatchObject({ venue: 'ondo', unit: 'USDC', status: 'ready', equity: 1 });
  });
});

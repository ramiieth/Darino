import { describe, expect, it } from 'vitest';
import type { ArcusAccount, ArcusPosition } from '@/features/arcus/api/types';
import { fromArcus, fromLighter, perpTotals, positionsPnl, sumKnown } from './perpPortfolio';

const arcusPos = (o: Partial<ArcusPosition>): ArcusPosition =>
  ({ marketDisplayName: 'BTC-USD', side: 'LONG', size: '0.1', averageEntryPrice: '100000', unrealizedPnl: '25.5', markPx: '100255', ...o }) as ArcusPosition;
const arcusAcc = (equity: string, netDeposits: string) => ({ equity, netDeposits }) as ArcusAccount;

describe('perpPortfolio', () => {
  it('جمع مقادیر معلوم و پرچم ناقص', () => {
    expect(sumKnown([1, null, 2])).toEqual({ sum: 3, partial: true });
    expect(sumKnown([null])).toEqual({ sum: null, partial: true });
    expect(sumKnown([])).toEqual({ sum: null, partial: false });
  });

  it('آرکوس: سود/زیان باز، سود/زیان کل = ارزش − خالص واریز، شورت و mark صفر', () => {
    const a = fromArcus('a', 'x', arcusAcc('1200', '1000'), [arcusPos({}), arcusPos({ side: 'SHORT', size: '-2', unrealizedPnl: '-5.5', markPx: '0' })], 'ready', false);
    expect(a.unrealizedPnl).toBeCloseTo(20, 9);
    expect(a.allTimePnl).toBe(200);
    expect(a.positions[1]).toMatchObject({ side: 'short', size: 2, mark: null });
    // حساب بدون فعالیت (null) = صفر؛ هنوز دریافت‌نشده (undefined) = نامعلوم
    expect(fromArcus('a', 'x', null, [], 'ready', false)).toMatchObject({ equity: 0, unrealizedPnl: 0, allTimePnl: 0 });
    expect(fromArcus('a', 'x', undefined, null, 'loading', false)).toMatchObject({ equity: null, unrealizedPnl: null });
  });

  it('لایتر: چند زیرحساب یکی می‌شوند؛ PnL نامعلوم حدس زده نمی‌شود', () => {
    const p = { symbol: 'USO', side: 'short' as const, size: 3, entry: 145, pnl: -12.5, liquidation: 190 };
    const l = fromLighter('l', 'x', 'lighter-robinhood', [
      { index: 1, equity: 1000, available: null, assets: [], positions: [p] },
      { index: 2, equity: 250, available: null, assets: [], positions: [{ ...p, pnl: 2.5, liquidation: 0 }] }
    ], 'ready', false);
    expect(l).toMatchObject({ equity: 1250, unrealizedPnl: -10, allTimePnl: null, unit: 'USDG' });
    expect(l.positions[1].liquidation).toBeNull();
    expect(positionsPnl([{ ...p, mark: null, pnl: null }])).toBeNull();
  });

  it('جمع کل همهٔ پلتفرم‌ها', () => {
    const arcus = fromArcus('a', 'x', arcusAcc('1200', '1000'), [arcusPos({})], 'ready', false);
    const lighter = fromLighter('l', 'y', 'lighter-robinhood', [{ index: 1, equity: 500, available: null, assets: [], positions: [{ symbol: 'USO', side: 'long', size: 1, entry: 1, pnl: -5.5, liquidation: null }] }], 'ready', false);
    const t = perpTotals([arcus, lighter]);
    expect(t).toMatchObject({ equity: 1700, unrealizedPnl: 20, allTimePnl: 200, positions: 2, accounts: 2, partial: false });
    const loading = fromLighter('z', 'z', 'lighter-mainnet', null, 'loading', false);
    expect(perpTotals([arcus, lighter, loading])).toMatchObject({ equity: 1700, unrealizedPnl: 20, partial: true });
  });
});

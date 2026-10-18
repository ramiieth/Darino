/**
 * خریدهای قبلی برای برنامهٔ من — از دفتر بهای تمام‌شده، بدون تایپ
 */
import { describe, expect, it } from 'vitest';
import type { CostBook } from '@/features/cost-basis/domain/book';
import { costLotsFor } from './plannerLots';

const asset = (symbol: string) => ({ key: symbol, tokenId: symbol.toLowerCase(), symbol, name: symbol, chain: 'ethereum', contract: null, icon: null });
const book = (o: Partial<CostBook>): CostBook => ({ version: 1, asOf: 0, lots: [], migrationConfirmed: true, legacyRetired: true, ...o });

describe('costLotsFor', () => {
  it('بسته‌های همان ارز، به ترتیب زمان؛ فروش‌ها از قدیمی‌ترین کم می‌شود', () => {
    const b = book({
      lots: [
        { id: '2', asset: asset('ETH'), quantity: '2', unitCost: '2000', fee: null, at: 20, source: 'manual' },
        { id: '1', asset: asset('ETH'), quantity: '1.3', unitCost: '3000', fee: null, at: 10, source: 'manual' },
        { id: '3', asset: asset('BTC'), quantity: '1', unitCost: '60000', fee: null, at: 5, source: 'manual' }
      ],
      currentBasis: { eth: { asset: asset('ETH'), quantity: '3', total: '0', at: 30 } }
    });
    const r = costLotsFor(b, 'eth');
    expect(r.source).toBe('lots');
    expect(r.unreconciled).toBe(false);
    expect(r.lots.map((l) => [l.qty, l.unitCost])).toEqual([
      [1, 3000],
      [2, 2000]
    ]);
  });

  it('بدون بسته: یک بسته با میانگین موجودی تطبیق‌شده', () => {
    const r = costLotsFor(book({ currentBasis: { eth: { asset: asset('ETH'), quantity: '3.3', total: '9339', at: 7 } } }), 'ETH');
    expect(r.source).toBe('basis');
    expect(r.lots).toEqual([{ qty: 3.3, unitCost: 2830, at: 7, source: 'existing' }]);
  });

  it('هیچ داده‌ای: none؛ بسته بدون موجودی تطبیق‌شده: unreconciled', () => {
    expect(costLotsFor(undefined, 'ETH').source).toBe('none');
    expect(costLotsFor(book({}), 'SOL').source).toBe('none');
    const r = costLotsFor(book({ lots: [{ id: '1', asset: asset('SOL'), quantity: '10', unitCost: '150', fee: null, at: 1, source: 'manual' }] }), 'SOL');
    expect(r.unreconciled).toBe(true);
    expect(r.lots).toHaveLength(1);
  });
});

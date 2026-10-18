/**
 * تست‌های پایش پوزیشن‌های واقعی دلتا — نرمال‌سازی لایتر/آرکوس و جفت‌سازی Long/Short
 */
import { describe, expect, it } from 'vitest';
import type { ArcusPosition } from '@/features/arcus/api/types';
import type { Holding } from '@/features/custody/domain/types';
import { arcusLegs, groupDeltaPairs, lighterLegs, linkedDeltaAccounts, type DeltaAccount } from './deltaPositions';

const lighterAcc: DeltaAccount = { id: 'l', venue: 'lighter', label: 'لایتر من', address: '0xabc' };
const arcusAcc: DeltaAccount = { id: 'a', venue: 'arcus', label: 'آرکوس من', address: '0xdef', arcus: { env: 'mainnet', address: '0xdef', accountIndex: 0 } };

const position = (o: Partial<ArcusPosition>): ArcusPosition => ({
  address: '0xdef',
  accountIndex: 0,
  marketId: 1,
  marketDisplayName: 'ETH-USD',
  side: 'SHORT',
  size: '-1',
  averageEntryPrice: '3000',
  leverage: '3',
  marginMode: 'CROSS',
  borrowedCapital: '0',
  marginUsed: '1000',
  positionValueNotional: '-990',
  unrealizedPnl: '10',
  markPx: '2970',
  cumulativeFunding: { allTime: '1.5', sinceOpen: '0.75', sinceChange: '0.1' },
  ...o
});

describe('نرمال‌سازی', () => {
  it('لایتر: ارزش = مقدار × مارک، لیکویید گزارش‌شده، بدون فاندینگ خام', () => {
    const legs = lighterLegs(
      lighterAcc,
      [{ index: 2, equity: 5000, available: 1000, assets: [], positions: [{ symbol: 'ETH', side: 'long', size: 0.33, entry: 3010, pnl: -13, liquidation: 2100 }] }],
      () => 3000
    );
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ side: 'long', base: 'ETH', sub: 2, liquidation: 2100, rawFundingSinceOpen: null, unrealizedPnl: -13 });
    expect(legs[0].notional).toBeCloseTo(990, 9);
  });

  it('آرکوس: SHORT → short، ارزش قدر مطلق positionValueNotional، فاندینگ خام sinceOpen', () => {
    const [l] = arcusLegs(arcusAcc, [position({})], () => null);
    expect(l).toMatchObject({ side: 'short', base: 'ETH', notional: 990, mark: 2970, entry: 3000, liquidation: null, rawFundingSinceOpen: 0.75 });
  });
});

describe('جفت‌سازی', () => {
  it('فقط دارایی با Long و Short؛ بین دو حساب؛ بزرگ‌ترین مواجهه اول', () => {
    const legs = [
      ...lighterLegs(lighterAcc, [{ index: 0, equity: 1, available: 1, assets: [], positions: [{ symbol: 'ETH', side: 'long', size: 0.33, entry: 3000, pnl: 0, liquidation: null }, { symbol: 'SOL', side: 'long', size: 1, entry: 150, pnl: 0, liquidation: null }] }], () => 3000),
      ...arcusLegs(arcusAcc, [position({}), position({ marketDisplayName: 'BTC-USD', positionValueNotional: '-5000' })], () => null)
    ];
    const pairs = groupDeltaPairs(legs);
    expect(pairs.map((p) => p.base)).toEqual(['ETH']);
    expect(pairs[0].exposure.totalUsd).toBeCloseTo(1980, 9);
    expect(pairs[0].exposure.unbalanced).toBe(false);
  });
});

describe('لایتر رابین‌هود', () => {
  const holding = (o: Partial<Holding>): Holding => ({ id: 'h', kind: 'platform', label: 'حساب', createdAt: 0, updatedAt: 0, ...o });

  it('حساب‌های lighter-robinhood جدا از mainnet شناخته می‌شوند', () => {
    const list = linkedDeltaAccounts([
      holding({ id: 'm', platformId: 'lighter-mainnet', address: '0x1' }),
      holding({ id: 'r', platformId: 'lighter-robinhood', address: '0x2' }),
      holding({ id: 'x', platformId: 'lighter-robinhood', address: '0x3', archivedAt: 1 }),
      holding({ id: 'a', kind: 'arcus', arcus: { env: 'mainnet', address: '0x4', accountIndex: 0 } }),
      holding({ id: 't', kind: 'arcus', arcus: { env: 'testnet', address: '0x4', accountIndex: 0 } })
    ]);
    expect(list.map((a) => [a.id, a.venue])).toEqual([
      ['m', 'lighter'],
      ['r', 'lighterRh'],
      ['a', 'arcus']
    ]);
  });

  it('پوزیشن لایتر رابین‌هود برچسب صرافی خودش را می‌گیرد و با Short آرکوس جفت می‌شود', () => {
    const rh: DeltaAccount = { id: 'r', venue: 'lighterRh', label: 'لایتر رابین‌هود من', address: '0x2' };
    const legs = [
      ...lighterLegs(rh, [{ index: 0, equity: 1, available: 1, assets: [], positions: [{ symbol: 'ETH', side: 'long', size: 0.33, entry: 3000, pnl: 0, liquidation: null }] }], () => 3000),
      ...arcusLegs(arcusAcc, [position({})], () => null)
    ];
    expect(legs[0].venue).toBe('lighterRh');
    const [pair] = groupDeltaPairs(legs);
    expect(pair.legs.map((l) => l.venue).sort()).toEqual(['arcus', 'lighterRh']);
  });
});

/**
 * تست‌های اتصال حساب به ماشین‌حساب پوشش ریسک — نرمال‌سازی لایتر/آرکوس و پرکردن فرم
 */
import { describe, expect, it } from 'vitest';
import type { Holding } from '@/features/custody/domain/types';
import type { ArcusAccount, ArcusPosition } from '@/features/arcus/api/types';
import type { PerpMarket } from './perpMarkets';
import { arcusSnapshot, baseOf, hedgeFill, lighterSnapshot, linkedHedgeAccounts } from './hedgeAccounts';

const holding = (o: Partial<Holding>): Holding => ({ id: 'h', kind: 'platform', label: 'حساب', createdAt: 0, updatedAt: 0, ...o });
const market = (o: Partial<PerpMarket>): PerpMarket => ({
  venue: 'lighter',
  id: '1',
  base: 'BTC',
  display: 'BTC',
  nameFa: 'بیت‌کوین',
  category: 'crypto',
  markPrice: 100_000,
  fundingHourly: 0.0000125,
  maxLeverage: 50,
  maintenanceMarginFraction: 0.012,
  takerFeePct: 0.05,
  makerFeePct: 0,
  volume24hUsd: 1e9,
  change24hPct: 0,
  ...o
});

describe('حساب‌های قابل اتصال', () => {
  it('فقط لایتر mainnet و آرکوس mainnet، بدون بایگانی‌شده‌ها', () => {
    const list = linkedHedgeAccounts([
      holding({ id: 'l', platformId: 'lighter-mainnet', address: '0xabc' }),
      holding({ id: 'r', platformId: 'lighter', address: '0xabc' }),
      holding({ id: 'a', kind: 'arcus', arcus: { env: 'mainnet', address: '0xdef', accountIndex: 0 } }),
      holding({ id: 't', kind: 'arcus', arcus: { env: 'testnet', address: '0xdef', accountIndex: 0 } }),
      holding({ id: 'x', platformId: 'lighter-mainnet', address: '0x1', archivedAt: 5 })
    ]);
    expect(list.map((a) => [a.id, a.venue])).toEqual([
      ['l', 'lighter'],
      ['a', 'arcus']
    ]);
  });

  it('نماد پایه', () => {
    expect(baseOf('BTC-USD')).toBe('BTC');
    expect(baseOf('eth/usdc')).toBe('ETH');
    expect(baseOf('1000PEPE')).toBe('PEPE');
  });
});

describe('لایتر', () => {
  const acc = {
    index: 3,
    equity: 3_200,
    available: 1_000,
    assets: [{ symbol: 'BTC', balance: 0.1, locked: 0, margin: 0 }],
    positions: [
      { symbol: 'BTC', side: 'short' as const, size: 0.03, entry: 98_000, pnl: -60, liquidation: 190_000 },
      { symbol: 'ETH', side: 'long' as const, size: 1, entry: 3_000, pnl: 10, liquidation: null }
    ]
  };

  it('ارزش اسمی = مقدار × مارک؛ بدون مارک، قیمت ورود', () => {
    const s = lighterSnapshot(acc, (b) => (b === 'BTC' ? 100_000 : null));
    expect(s.subAccount).toBe(3);
    expect(s.shorts).toHaveLength(1);
    expect(s.shorts[0].notional).toBeCloseTo(3_000, 9);
    expect(s.longBases).toEqual(['ETH']);
    expect(s.positionCount).toBe(2);
    expect(lighterSnapshot(acc, () => null).shorts[0].notional).toBeCloseTo(2_940, 9);
  });

  it('پرکردن فرم: equity، کارمزد تیکر، فاندینگ ۸ساعته، اسپات حساب و حد لیکویید صرافی', () => {
    const s = lighterSnapshot(acc, () => 100_000);
    const f = hedgeFill(s, s.shorts[0], market({}));
    expect(f.shortNotional).toBeCloseTo(3_000, 9);
    expect(f.collateral).toBe(3_200);
    expect(f.feePct).toBe(0.05);
    // ساعتی مثبت (لانگ می‌پردازد) → Short دریافت می‌کند: ۰٫۰۰۰۰۱۲۵ × ۸ × ۱۰۰ = ۰٫۰۱٪
    expect(f.fundingPct8h).toBeCloseTo(0.01, 12);
    expect(f.spotUsd).toBeCloseTo(10_000, 9);
    expect(f.liquidationRisePct).toBeCloseTo(90, 9);
  });

  it('دادهٔ ناموجود صفر فرض نمی‌شود', () => {
    const s = lighterSnapshot({ ...acc, equity: null, assets: [] }, () => 100_000);
    const f = hedgeFill(s, { ...s.shorts[0], liquidation: null }, market({ takerFeePct: null, fundingHourly: null }));
    expect([f.collateral, f.feePct, f.fundingPct8h, f.spotUsd, f.liquidationRisePct]).toEqual([null, null, null, null, null]);
  });
});

describe('آرکوس', () => {
  const position = (o: Partial<ArcusPosition>): ArcusPosition => ({
    address: '0xdef',
    accountIndex: 0,
    marketId: 1,
    marketDisplayName: 'BTC-USD',
    side: 'SHORT',
    size: '-3',
    averageEntryPrice: '98000',
    leverage: '1',
    marginMode: 'CROSS',
    borrowedCapital: '0',
    marginUsed: '3000',
    positionValueNotional: '-3000',
    unrealizedPnl: '-60',
    markPx: '100000',
    ...o
  });
  const account = { equity: '2940.5' } as ArcusAccount;

  it('ارزش اسمی از positionValueNotional (قدر مطلق)، equity حساب، بدون قیمت لیکویید', () => {
    const s = arcusSnapshot(account, [position({}), position({ side: 'LONG', marketDisplayName: 'ETH-USD' })], 0, () => null);
    expect(s.shorts[0].notional).toBe(3_000);
    expect(s.shorts[0].mark).toBe(100_000);
    expect(s.shorts[0].liquidation).toBeNull();
    expect(s.shorts[0].marginMode).toBe('CROSS');
    expect(s.equity).toBe(2940.5);
    expect(s.longBases).toEqual(['ETH']);
    expect(s.spot).toEqual([]);
  });

  it('markPx = "0" → مارک بازار', () => {
    const s = arcusSnapshot(account, [position({ markPx: '0' })], 0, () => 99_500);
    expect(s.shorts[0].mark).toBe(99_500);
  });

  it('بدون حساب (بی‌فعالیت): equity نامعلوم', () => {
    expect(arcusSnapshot(null, [], 0, () => null).equity).toBeNull();
  });
});

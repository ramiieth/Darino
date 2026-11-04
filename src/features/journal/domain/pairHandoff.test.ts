import { describe, expect, it } from 'vitest';
import { executionOrder, guardPrice, handoffVenues, pairHandoffUrl, readPairHandoff, worstSlippageUsd } from './pairHandoff';
import type { HedgeLeg } from './hedge';

const leg = (p: Partial<HedgeLeg>): HedgeLeg => ({ venue: 'arcus', side: 'long', display: 'HOOD-USD', units: 10, price: 100, notional: 1000, feeUsd: 0.5, url: '', belowMin: false, ...p });

describe('همگام‌سازی ماشین‌حساب دلتا نوترال ↔ ژورنال', () => {
  it('رفت و برگشت لینک', () => {
    const url = pairHandoffUrl({ venues: ['arcus', 'lighterRh'], base: 'HOOD', notional: 2500, long: 'lighterRh', leverage: 3 });
    const h = readPairHandoff(new URL(url, 'https://x').searchParams);
    expect(h).toEqual({ venues: ['arcus', 'lighterRh'], base: 'HOOD', notional: 2500, long: 'lighterRh', leverage: 3 });
  });

  it('صرافی خارج از راهنما یا ورودی خراب → null یا نادیده', () => {
    expect(handoffVenues('arcus', 'ondo')).toBeNull();
    expect(readPairHandoff(new URLSearchParams('pv=arcus,ondo&pb=HOOD'))).toBeNull();
    expect(readPairHandoff(new URLSearchParams('pv=arcus,txflow&pb=<x>&pl=lighterRh'))).toMatchObject({ base: 'X', long: null });
  });

  it('قیمت سقف/کف، ترتیب اجرا و بدترین لغزش', () => {
    expect(guardPrice(leg({ side: 'long' }), 0.1)).toBeCloseTo(100.1);
    expect(guardPrice(leg({ side: 'short' }), 0.1)).toBeCloseTo(99.9);
    const a = leg({ venue: 'arcus', feeUsd: 0.2 }), b = leg({ venue: 'lighterRh', side: 'short', feeUsd: 0.5 });
    expect(executionOrder({ legs: [a, b], notional: 1000 }).map((l) => l.venue)).toEqual(['lighterRh', 'arcus']);
    expect(worstSlippageUsd({ legs: [a, b] }, 0.1)).toBeCloseTo(2);
  });
});

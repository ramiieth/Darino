import { describe, expect, it } from 'vitest';
import type { TraderPosition } from '@/features/traders/domain/positions';
import { qualityScore, booksByAddress, GOOD_SCORE } from '@/features/traders/domain/quality';
import { againstFlow, crowdRows, crowdTotals, entryGap, flowOf, steadyAgreement } from './crowd';
import { CROWDED_LONG_APR, aprOf, fundingExtremes, fundingState } from './marketSignals';

const pos = (address: string, coin: string, side: 'long' | 'short', sizeUsd: number, entryPx: number, markPx: number, steady = false): TraderPosition => ({
  address, steady, coin, side, sizeUsd, entryPx, markPx, liqPx: null, leverage: 5, upnl: 0, accountPct: null
});

describe('امتیاز ثبات تریدر', () => {
  const base = { makerLike: false, closedCount: 40, profitFactor: 2, allWins: false };

  it('ثبات بالا و افت کم امتیاز «شایسته» می‌گیرد', () => {
    const s = qualityScore({ ...base, months: 12, positiveMonths: 10, maxDrawdownPct: 15 });
    expect(s).toBeGreaterThanOrEqual(GOOD_SCORE);
  });

  it('یک ماه خوب با افت سنگین امتیاز پایین می‌گیرد', () => {
    const s = qualityScore({ ...base, months: 4, positiveMonths: 1, maxDrawdownPct: 80, profitFactor: 0.6 });
    expect(s).toBeLessThan(45);
  });

  it('مارکت‌میکر و سابقهٔ کوتاه امتیاز ندارند', () => {
    expect(qualityScore({ ...base, makerLike: true, months: 12, positiveMonths: 12, maxDrawdownPct: 5 })).toBeNull();
    expect(qualityScore({ ...base, months: 2, positiveMonths: 2, maxDrawdownPct: 5 })).toBeNull();
  });

  it('بدون معاملهٔ کافی، کیفیت معاملات نیمه حساب می‌شود نه صفر', () => {
    const few = qualityScore({ ...base, closedCount: 3, profitFactor: null, months: 12, positiveMonths: 12, maxDrawdownPct: 0 });
    expect(few).toBe(Math.round(40 + 30 + 15 + 7.5));
  });

  it('پوزیشن‌ها به تفکیک آدرس و به ترتیب اندازه', () => {
    const books = booksByAddress([pos('0xa', 'BTC', 'long', 100, 1, 1), pos('0xa', 'ETH', 'short', 300, 1, 1), pos('0xb', 'SOL', 'long', 50, 1, 1)]);
    expect(books.get('0xa')!.positions.map((p) => p.coin)).toEqual(['ETH', 'BTC']);
    expect(books.get('0xa')!.longUsd).toBe(100);
    expect(books.get('0xa')!.totalUsd).toBe(400);
  });
});

describe('ازدحام پوزیشن برترها', () => {
  it('فاصلهٔ ورود: مثبت یعنی طرف غالب در سود', () => {
    expect(entryGap('long', 100, 110)).toBeCloseTo(10);
    expect(entryGap('short', 100, 110)).toBeCloseTo(-10);
    expect(entryGap('long', null, 110)).toBeNull();
  });

  it('اجماع، نظر ثابت‌قدم‌ها و سود طرف غالب', () => {
    const rows = crowdRows([
      pos('0x1', 'BTC', 'long', 1_000_000, 90, 100, true),
      pos('0x2', 'BTC', 'long', 800_000, 95, 100, true),
      pos('0x3', 'BTC', 'long', 500_000, 100, 100),
      pos('0x4', 'BTC', 'short', 100_000, 105, 100)
    ]);
    const btc = rows[0];
    expect(btc.side).toBe('long');
    expect(btc.steadySide).toBe(null); // فقط ۲ ثابت‌قدم؛ اجماع حداقل ۳ نفر می‌خواهد
    expect(steadyAgreement(btc)).toBe('split');
    expect(btc.traders).toBe(4);
    expect(btc.entryGapPct!).toBeGreaterThan(0);
  });

  it('ثابت‌قدم‌های مخالف دیده می‌شوند', () => {
    expect(steadyAgreement({ side: 'long', steadySide: 'short', steadyCount: 4 })).toBe('disagree');
    expect(steadyAgreement({ side: 'long', steadySide: 'long', steadyCount: 4 })).toBe('agree');
    expect(steadyAgreement({ side: 'long', steadySide: null, steadyCount: 0 })).toBe('none');
  });

  it('جمع کل لانگ و شورت', () => {
    const t = crowdTotals([pos('0x1', 'BTC', 'long', 10, 1, 1), pos('0x1', 'ETH', 'short', 5, 1, 1), pos('0x2', 'BTC', 'long', 1, 1, 1)]);
    expect(t).toEqual({ longUsd: 11, shortUsd: 5, traders: 2, coins: 2 });
  });
});

describe('خلاف جریان کل', () => {
  it('جریان یک‌طرفه و بازارهای خلاف آن', () => {
    const positions = [
      ...['0x1', '0x2', '0x3'].map((a) => pos(a, 'BTC', 'short', 5_000_000, 100, 100)),
      ...['0x1', '0x2', '0x3'].map((a) => pos(a, 'ADA', 'long', 100_000, 1, 1.1))
    ];
    const flow = flowOf(crowdTotals(positions));
    expect(flow.side).toBe('short');
    expect(flow.share).toBeGreaterThan(0.9);
    expect(againstFlow(crowdRows(positions), flow.side).map((r) => r.coin)).toEqual(['ADA']);
  });

  it('کل متعادل جریانی ندارد', () => {
    expect(flowOf({ longUsd: 55, shortUsd: 45 }).side).toBeNull();
    expect(againstFlow([], null)).toEqual([]);
  });
});

describe('سیگنال‌های فاندینگ', () => {
  const m = (coin: string, apr: number, oi = 10_000_000) => ({ coin, fundingHourly: apr / (24 * 365 * 100), openInterestUsd: oi });

  it('فقط بازارهای با OI کافی و فاندینگ غیرعادی', () => {
    const r = fundingExtremes([m('A', 50), m('B', 30), m('C', 11), m('D', -8), m('E', 80, 1_000_000), m('F', -2)]);
    expect(r.crowdedLong.map((x) => x.coin)).toEqual(['A', 'B']);
    expect(r.crowdedShort.map((x) => x.coin)).toEqual(['D', 'F']);
  });

  it('مرز لانگ شلوغ دو برابر نرخ پایه است', () => {
    expect(fundingState(m('X', CROWDED_LONG_APR + 0.1).fundingHourly)).toBe('crowdedLong');
    expect(fundingState(m('X', 11).fundingHourly)).toBe('normal');
    expect(fundingState(m('X', -1).fundingHourly)).toBe('crowdedShort');
    expect(aprOf(0.0000125)).toBeCloseTo(10.95, 1);
  });
});

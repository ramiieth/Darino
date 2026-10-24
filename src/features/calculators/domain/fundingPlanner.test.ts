/**
 * تست‌های برنامه‌ریز فاندینگ — موتور (evaluatePlan) و ساخت برنامه‌ها از دادهٔ صرافی + Boros
 */
import { describe, expect, it } from 'vitest';
import { borosFeePerUsd, borosMarginPerUsd, evaluatePlan, rankPlans, type PlanBorosLock, type PlanInputs, type PlanPerpLeg, type PlanSpec } from '@/features/calculators/domain';
import { activeBoros, avgFundingApr, buildPlans, listSymbols, withSlippage, type LegData } from '@/features/calculators/data/fundingPlanner';
import type { DeltaVenue, VenueBook, VenueQuote } from '@/features/calculators/data/deltaMarkets';
import type { BorosMarket } from '@/features/boros/domain/types';

const inputs: PlanInputs = {
  capital: 10_000,
  leverage: 3,
  holdDays: 30,
  bufferPct: 10,
  borosCollateralX: 2,
  spotFeePct: 0.1,
  fallbackSlipPct: 0.05,
  transferUsd: 0,
  fundingFactor: 1
};
const leg = (o: Partial<PlanPerpLeg> = {}): PlanPerpLeg => ({ key: 'hyperliquid:ETH', venue: 'HL', side: 'short', fundingApr: 10, feePct: 0.045, slipPct: 0, maxLeverage: 25, mmf: 0.02, ...o });
// Hyperliquid ETH 27 Nov 2026 — اعداد زندهٔ API در ۲۰۲۶/۱۰/۲۳
const lock = (o: Partial<PlanBorosLock> = {}): PlanBorosLock => ({
  marketId: 1,
  side: 'short',
  fixedRate: 0.0825,
  takerFee: 0.0005,
  settleFeeRate: 0.001,
  marginFloor: 0.08,
  kIM: 0.645161,
  kMM: 0.333333,
  ytmFloor: 5 / 365,
  daysToMaturity: 34,
  locks: [0],
  ...o
});
const spec = (o: Partial<PlanSpec>): PlanSpec => ({ id: 'x', kind: 'perpPerp', perps: [], spot: false, boros: [], ...o });

describe('evaluatePlan — پرپ–پرپ', () => {
  const p = spec({ perps: [leg({ fundingApr: 12 }), leg({ side: 'long', fundingApr: 2, key: 'lighter:1', venue: 'L' })] });
  it('نوتیونال = سرمایه ÷ Σ(۱/اهرم + بافر) و درآمد = اختلاف فاندینگ', () => {
    const r = evaluatePlan(p, inputs);
    const N = 10_000 / (2 * (1 / 3 + 0.1));
    expect(r.notional).toBeCloseTo(N, 6);
    expect(r.income.floating).toBeCloseTo((N * (12 - 2) * 30) / 365 / 100, 6);
    expect(r.costs.perpFees).toBeCloseTo(2 * 2 * N * 0.00045, 6);
    expect(r.capital.total).toBeCloseTo(10_000, 6);
    expect(r.fullyLocked).toBe(false);
    expect(r.warnings).toContain('floating');
  });
  it('سناریو: فاندینگ برعکس → درآمد قرینه', () => {
    const a = evaluatePlan(p, inputs);
    const b = evaluatePlan(p, { ...inputs, fundingFactor: -1 });
    expect(b.income.floating).toBeCloseTo(-a.income.floating, 9);
  });
  it('اهرم بیش از سقف صرافی هشدار می‌دهد', () => {
    expect(evaluatePlan(p, { ...inputs, leverage: 30 }).warnings).toContain('overLeverage');
  });
  it('اسلیپیج نامعلوم → پیش‌فرض کاربر + هشدار', () => {
    const r = evaluatePlan(spec({ perps: [leg({ slipPct: null })] }), inputs);
    expect(r.costs.perpSlippage).toBeCloseTo(2 * r.notional * 0.0005, 6);
    expect(r.warnings).toContain('slipAssumed');
  });
});

describe('evaluatePlan — قفل Boros', () => {
  it('مارجین و کارمزد Boros طبق فرمول رسمی', () => {
    const b = lock();
    expect(borosMarginPerUsd(b)).toBeCloseTo(Math.max(0.0825, 0.08) * (34 / 365) * 0.645161, 12);
    expect(borosFeePerUsd(b)).toBeCloseTo((0.0005 + 0.001) * (34 / 365), 12);
  });
  it('اسپات + شورت + Short YU: درآمد = N × K × t، مستقل از فاندینگ شناور', () => {
    const p = spec({ kind: 'borosSpot', spot: true, perps: [leg({ fundingApr: 40 })], boros: [lock()] });
    const r = evaluatePlan(p, inputs);
    const factor = 1 + (1 / 3 + 0.1) + borosMarginPerUsd(lock()) * 2;
    const N = 10_000 / factor;
    expect(r.notional).toBeCloseTo(N, 6);
    expect(r.holdDays).toBe(34);
    expect(r.income.floating).toBe(0);
    expect(r.income.locked).toBeCloseTo((N * 0.0825 * 34) / 365, 6);
    expect(evaluatePlan(p, { ...inputs, fundingFactor: -1 }).net).toBeCloseTo(r.net, 9);
    expect(r.fullyLocked).toBe(true);
    expect(r.warnings).not.toContain('floating');
  });
  it('تحمل نرخ = (وثیقه − MM) ÷ YTM', () => {
    const r = evaluatePlan(spec({ perps: [leg()], boros: [lock()] }), inputs);
    const ytm = 34 / 365;
    const expected = ((2 * 0.0825 * ytm * 0.645161 - 0.0825 * ytm * 0.333333) / ytm) * 100;
    expect(r.borosRateTolerancePp).toBeCloseTo(expected, 9);
  });
  it('Long YU روی پای لانگ: پرداخت ثابت به جای شناور', () => {
    const p = spec({
      kind: 'borosPair',
      perps: [leg({ fundingApr: 9 }), leg({ side: 'long', fundingApr: 5, key: 'lighter:1' })],
      boros: [lock({ fixedRate: 0.0825 }), lock({ marketId: 2, side: 'long', fixedRate: 0.0775, locks: [1] })]
    });
    const r = evaluatePlan(p, inputs);
    expect(r.fullyLocked).toBe(true);
    expect(r.income.locked).toBeCloseTo((r.notional * (0.0825 - 0.0775) * 34) / 365, 6);
  });
});

describe('rankPlans', () => {
  it('APR بیشتر اول، null آخر', () => {
    const mk = (v: number | null) => ({ result: { netAprPct: v } as ReturnType<typeof evaluatePlan> });
    expect(rankPlans([mk(1), mk(null), mk(5)]).map((r) => r.result.netAprPct)).toEqual([5, 1, null]);
  });
});

/* ---------------- دادهٔ صرافی و Boros ---------------- */

const NOW_SEC = 1_792_800_000;
const quote = (venue: DeltaVenue, base: string, fundingHourly: number, o: Partial<VenueQuote> = {}): VenueQuote => ({
  venue,
  ref: base,
  base,
  display: base,
  nameFa: base,
  category: 'crypto',
  markPrice: 2400,
  fundingHourly,
  makerFeePct: 0.015,
  takerFeePct: 0.045,
  maxLeverage: 25,
  maintenanceMarginFraction: 0.02,
  volume24hUsd: 1e6,
  ...o
});
const legData = (q: VenueQuote): LegData => ({
  quote: q,
  currentApr: (q.fundingHourly ?? 0) * 876_000,
  avg7dApr: null,
  fundingApr: (q.fundingHourly ?? 0) * 876_000,
  basis: 'current',
  historyStatus: 'ready',
  book: { bids: [{ price: 2399, size: 100 }], asks: [{ price: 2401, size: 100 }], mid: 2400 },
  bookStatus: 'ready'
});
const market = (o: Partial<BorosMarket>): BorosMarket =>
  ({
    marketId: 1,
    status: 'GOOD',
    name: 'Hyperliquid ETH 27 Nov 2026',
    symbol: '',
    venue: 'Hyperliquid',
    asset: 'ETH',
    fundingRateSymbol: 'hyperliquid-eth',
    maturity: NOW_SEC + 34 * 86_400,
    marginFloor: 0.08,
    ytmFloor: 5 / 365,
    kIM: 0.645,
    kMM: 0.333,
    takerFee: 0.0005,
    settleFeeRate: 0.001,
    bestBid: 0.0825,
    bestAsk: 0.0831,
    floatingApr: 0.0919,
    assetMarkPrice: 2400,
    ...o
  }) as BorosMarket;

describe('avgFundingApr', () => {
  it('میانگین ساعتی ۷ روز به ٪ سالانه؛ کمتر از ۴۸ ساعت = null', () => {
    const now = 1_000 * 3_600_000;
    const pts = Array.from({ length: 100 }, (_, k) => ({ hour: now - k * 3_600_000, rate: 0.00001 }));
    expect(avgFundingApr(pts, now)).toBeCloseTo(0.00001 * 876_000, 9);
    expect(avgFundingApr(pts.slice(0, 10), now)).toBeNull();
  });
});

describe('listSymbols و activeBoros', () => {
  const empty: VenueBook = { status: 'ready', quotes: [] };
  const books = {
    arcus: empty,
    ondo: empty,
    lighterRh: empty,
    qfex: empty,
    txflow: empty,
    hyperliquid: { status: 'ready', quotes: [quote('hyperliquid', 'ETH', 0.00001), quote('hyperliquid', 'TSLA', 0, { builderDex: 'xyz', category: 'equity' })] },
    lighter: { status: 'ready', quotes: [quote('lighter', 'ETH', 0.000005)] }
  } as Record<DeltaVenue, VenueBook>;
  it('گروه‌بندی با نماد پایه، بیشترین صرافی اول، نشان Boros', () => {
    const s = listSymbols(books, [market({})], NOW_SEC);
    expect(s.map((x) => x.base)).toEqual(['ETH', 'TSLA']);
    expect(s[0].venues).toEqual(['hyperliquid', 'lighter']);
    expect(s[0].hasBoros).toBe(true);
    expect(s[1].group).toBe('equity');
    expect(s[1].hasBoros).toBe(false);
  });
  it('سررسید کمتر از یک روز و بازار غیرفعال حذف می‌شوند', () => {
    const ms = [market({}), market({ marketId: 2, maturity: NOW_SEC + 3600 }), market({ marketId: 3, status: 'PAUSED' })];
    expect(activeBoros(ms, 'eth', NOW_SEC).map((m) => m.marketId)).toEqual([1]);
  });
});

describe('buildPlans', () => {
  const hl = legData(quote('hyperliquid', 'ETH', 0.00001));
  const lt = legData({ ...quote('lighter', 'ETH', 0.000005), ref: '0' });
  const boros = [
    market({}),
    market({ marketId: 2, venue: 'Lighter', name: 'Lighter ETH 27 Nov 2026', bestAsk: 0.0775 }),
    market({ marketId: 3, venue: 'HL-GATE', name: 'ETH Spread', isSpreadMarket: true, fundingRateSymbol: 'spread-eth-hl-gate', bestBid: 0.035, floatingApr: 0.0196 })
  ];
  const plans = buildPlans([hl, lt], boros, { nowSec: NOW_SEC, feeMode: 'taker', gateFeePct: 0.05 });
  const kinds = plans.map((p) => p.spec.kind);
  it('همهٔ انواع برنامه ساخته می‌شود', () => {
    expect(kinds.filter((k) => k === 'perpPerp')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'spotPerp')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'borosSpot')).toHaveLength(2);
    // شورت HL قفل · لانگ Lighter قفل · هر دو
    expect(kinds.filter((k) => k === 'borosPair')).toHaveLength(3);
    expect(kinds.filter((k) => k === 'borosSpread')).toHaveLength(1);
  });
  it('پرپ–پرپ: شورت روی فاندینگ بیشتر', () => {
    const pp = plans.find((p) => p.spec.kind === 'perpPerp')!;
    expect(pp.spec.perps.map((l) => `${l.side}:${l.key}`)).toEqual(['short:hyperliquid:ETH', 'long:lighter:0']);
  });
  it('قفل هر دو پا: Short YU روی bid شورت، Long YU روی ask لانگ', () => {
    const both = plans.find((p) => p.spec.kind === 'borosPair' && p.spec.boros.length === 2)!;
    expect(both.spec.boros.map((b) => [b.side, b.fixedRate, b.locks])).toEqual([
      ['short', 0.0825, [0]],
      ['long', 0.0775, [1]]
    ]);
  });
  it('اسپرد: شورت HL + لانگ Gate بیرونی، هر دو پا قفل', () => {
    const sp = plans.find((p) => p.spec.kind === 'borosSpread')!;
    expect(sp.spec.perps.map((l) => [l.side, !!l.external])).toEqual([
      ['short', false],
      ['long', true]
    ]);
    expect(sp.spec.boros[0].locks).toEqual([0, 1]);
    const r = evaluatePlan(sp.spec, inputs);
    expect(r.fullyLocked).toBe(true);
    expect(r.warnings).toContain('external');
  });
  it('اسلیپیج از دفتر سفارش: شورت از bids، لانگ از asks', () => {
    const pp = plans.find((p) => p.spec.kind === 'perpPerp')!;
    const s = withSlippage(pp, 1000);
    expect(s.perps[0].slipPct).toBeCloseTo((1 / 2400) * 100, 9);
    expect(s.perps[1].slipPct).toBeCloseTo((1 / 2400) * 100, 9);
  });
  it('maker: کارمزد maker و بدون اسلیپیج', () => {
    const m = buildPlans([hl, lt], [], { nowSec: NOW_SEC, feeMode: 'maker', gateFeePct: 0.05 }).find((p) => p.spec.kind === 'perpPerp')!;
    expect(m.spec.perps.map((l) => [l.feePct, l.slipPct])).toEqual([
      [0.015, 0],
      [0.015, 0]
    ]);
  });
});

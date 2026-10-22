/**
 * تست‌های خرید دوره‌ای با پیش‌بینی (schedule) و ماشین‌حساب پرپ (perp)
 */
import { describe, expect, it } from 'vitest';
import {
  scheduleDates,
  priceFromAnchors,
  priceFromSeries,
  scheduledAmount,
  calcPlan,
  projectGrowth,
  calcPerp,
  fundingPeriods,
  perpScenarios,
  type PerpInput
} from '@/features/calculators/domain';
import { normalizeArcus, normalizeLighter, normalizeQfex, normalizeTxflow, parseTxflowCtxs, txflowFirstTier } from '@/features/calculators/data/perpMarkets';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day).getTime();

describe('scheduleDates — تاریخ‌های تقویمی', () => {
  it('ماهانه همان روز ماه است (نه ۳۰ روز ثابت)', () => {
    const ds = scheduleDates(d(2024, 1, 15), d(2024, 12, 15), 'monthly');
    expect(ds).toHaveLength(12);
    expect(new Date(ds[11]).getMonth()).toBe(11);
    expect(new Date(ds[11]).getDate()).toBe(15);
  });
  it('۳۱ام ماه در ماه کوتاه به آخرین روز می‌رود و بعد برمی‌گردد', () => {
    const ds = scheduleDates(d(2024, 1, 31), d(2024, 4, 30), 'monthly');
    expect(ds.map((t) => new Date(t).getDate())).toEqual([31, 29, 31, 30]);
  });
  it('سه‌ماهه، هفتگی و بازهٔ نامعتبر', () => {
    expect(scheduleDates(d(2024, 1, 1), d(2024, 12, 31), 'quarterly')).toHaveLength(4);
    expect(scheduleDates(d(2024, 1, 1), d(2024, 1, 29), 'weekly')).toHaveLength(5);
    expect(scheduleDates(d(2024, 2, 1), d(2024, 1, 1), 'monthly')).toEqual([]);
  });
});

describe('priceFromAnchors — درون‌یابی پیش‌بینی', () => {
  const a = [
    { date: 0, price: 100 },
    { date: 100, price: 200 }
  ];
  it('خطی بین نقاط، ثابت بیرون بازه', () => {
    expect(priceFromAnchors(a, 50)).toBe(150);
    expect(priceFromAnchors(a, -10)).toBe(100);
    expect(priceFromAnchors(a, 500)).toBe(200);
    expect(priceFromAnchors([], 5)).toBeNull();
  });
  it('ترتیب ورودی مهم نیست و قیمت نامعتبر نادیده گرفته می‌شود', () => {
    expect(priceFromAnchors([a[1], { date: 30, price: 0 }, a[0]], 25)).toBe(125);
  });
  it('سری تاریخی: آخرین نقطهٔ قبل از t', () => {
    const s = [
      { t: 10, price: 1 },
      { t: 20, price: 2 }
    ];
    expect(priceFromSeries(s, 15)).toBe(1);
    expect(priceFromSeries(s, 25)).toBe(2);
    expect(priceFromSeries(null, 25)).toBeNull();
  });
});

describe('calcPlan — DCA با قیمت و مبلغ متغیر', () => {
  it('میانگین قیمت تمام‌شده = کل پرداختی ÷ واحد؛ مبلغ متغیر', () => {
    const r = calcPlan({
      rows: [
        { date: d(2024, 1, 1), amount: 100, price: 10, priceSource: 'history' },
        { date: d(2024, 2, 1), amount: 300, price: 20, priceSource: 'forecast' }
      ],
      finalPrice: 30,
      finalDate: d(2025, 2, 1)
    });
    expect(r.totalUnits).toBe(25); // 10 + 15
    expect(r.totalInvested).toBe(400);
    expect(r.averageCost).toBe(16);
    expect(r.finalValue).toBe(750);
    expect(r.profit).toBe(350);
    expect(r.returnPct).toBe(87.5);
    expect(r.simpleAvgPrice).toBe(15);
    expect(r.xirrPct).not.toBeNull();
  });
  it('کارمزد ثابت + درصدی به بهای تمام‌شده اضافه می‌شود ولی واحد را کم نمی‌کند', () => {
    const r = calcPlan({ rows: [{ date: 0, amount: 1000, price: 100, priceSource: 'manual' }], feeFixed: 1, feePct: 0.1, finalPrice: 100, finalDate: 0 });
    expect(r.totalUnits).toBe(10);
    expect(r.totalFees).toBe(2);
    expect(r.profit).toBe(-2);
  });
  it('ردیف بدون قیمت کنار گذاشته می‌شود؛ قیمت پایان null → سود null', () => {
    const r = calcPlan({ rows: [{ date: 0, amount: 100, price: null, priceSource: 'current' }], finalPrice: null, finalDate: 0 });
    expect(r.skipped).toBe(1);
    expect(r.profit).toBeNull();
  });
  it('XIRR برای یک خرید و یک سال = بازده ساده', () => {
    const r = calcPlan({ rows: [{ date: d(2023, 1, 1), amount: 100, price: 1, priceSource: 'history' }], finalPrice: 1.1, finalDate: d(2024, 1, 1) });
    expect(r.xirrPct).toBeCloseTo(10, 4);
  });
  it('مبلغ افزایشی: رشد مرکب در هر دوره', () => {
    expect(scheduledAmount(100, 10, 0)).toBe(100);
    expect(scheduledAmount(100, 10, 2)).toBeCloseTo(121, 9);
    expect(scheduledAmount(100, 0, 5)).toBe(100);
  });
});

describe('projectGrowth — پیش‌بینی ارزش آینده', () => {
  it('بدون واریز = رشد مرکب سالانه', () => {
    const r = projectGrowth({ initial: 1000, contribution: 0, frequency: 'monthly', contributionGrowthPct: 0, annualReturnPct: 10, years: 2 });
    expect(r.finalValue).toBeCloseTo(1210, 6);
    expect(r.yearly.map((y) => y.year)).toEqual([1, 2]);
  });
  it('بازده صفر = جمع واریزها', () => {
    const r = projectGrowth({ initial: 0, contribution: 100, frequency: 'monthly', contributionGrowthPct: 0, annualReturnPct: 0, years: 1 });
    expect(r.finalValue).toBe(1200);
    expect(r.totalContributed).toBe(1200);
  });
});

describe('calcPerp — مارجین ایزوله', () => {
  const base: PerpInput = {
    margin: 1000,
    leverage: 10,
    entryPrice: 100,
    exitPrice: null,
    maintenanceMarginFraction: 0,
    feePct: 0,
    fundingRateHourly: 0,
    holdHours: 0
  };
  it('بدون MMF: لیکویید لانگ ۱۰x در \u200E-۱۰٪ و شورت در \u200E+۱۰٪', () => {
    const l = calcPerp(base, 'long');
    const s = calcPerp(base, 'short');
    expect(l.notional).toBe(10000);
    expect(l.size).toBe(100);
    expect(l.liquidationPrice).toBe(90);
    expect(s.liquidationPrice).toBe(110);
    expect(l.liquidationDistancePct).toBe(10);
  });
  it('با MMF: equity در قیمت لیکویید دقیقاً برابر مارجین نگهداری است', () => {
    const inp = { ...base, maintenanceMarginFraction: 0.02 };
    for (const side of ['long', 'short'] as const) {
      const r = calcPerp(inp, side);
      const p = r.liquidationPrice as number;
      const dir = side === 'long' ? 1 : -1;
      const equity = 1000 + r.size * (p - 100) * dir;
      expect(equity).toBeCloseTo(r.size * p * 0.02, 6);
    }
  });
  it('اهرم ۱ لانگ لیکویید نمی‌شود', () => {
    expect(calcPerp({ ...base, leverage: 1 }, 'long').liquidationPrice).toBeNull();
  });
  it('سود، کارمزد و فاندینگ (نرخ مثبت: لانگ می‌پردازد، شورت می‌گیرد)', () => {
    const inp = { ...base, exitPrice: 105, feePct: 0.05, fundingRateHourly: 0.0001, holdHours: 10 };
    const l = calcPerp(inp, 'long');
    const s = calcPerp(inp, 'short');
    expect(l.pricePnl).toBe(500);
    expect(l.openFee).toBe(5);
    expect(l.closeFee).toBeCloseTo(5.25, 9);
    expect(l.funding).toBe(10);
    expect(s.funding).toBe(-10);
    expect(l.netPnl).toBeCloseTo(500 - 5 - 5.25 - 10, 9);
    expect(l.roePct).toBeCloseTo(47.975, 6);
    expect(s.netPnl).toBeCloseTo(-500 - 5 - 5.25 + 10, 9);
  });
  it('قیمت سربه‌سر: سود خالص در آن صفر است', () => {
    const inp = { ...base, feePct: 0.05, fundingRateHourly: 0.0001, holdHours: 24 };
    for (const side of ['long', 'short'] as const) {
      const be = calcPerp(inp, side).breakEvenPrice as number;
      expect(calcPerp({ ...inp, exitPrice: be }, side).netPnl).toBeCloseTo(0, 6);
    }
  });
  it('عبور از قیمت لیکویید → زیان = کل مارجین', () => {
    const r = calcPerp({ ...base, exitPrice: 80 }, 'long');
    expect(r.liquidatedAtExit).toBe(true);
    expect(r.netPnl).toBe(-1000);
    expect(r.roePct).toBe(-100);
  });
  it('دوره‌های فاندینگ و سناریوها', () => {
    const f = fundingPeriods(0.0000125);
    expect(f.h8).toBeCloseTo(0.01, 9);
    expect(f.apr).toBeCloseTo(10.95, 9);
    const sc = perpScenarios(base, [-20, 0, 20]);
    expect(sc[0].long.liquidatedAtExit).toBe(true);
    expect(sc[2].short.liquidatedAtExit).toBe(true);
    expect(sc[1].long.netPnl).toBe(0);
  });
});

describe('نرمال‌سازی بازارهای لایتر و آرکوس', () => {
  it('لایتر: کسرهای ۱/۱۰۰۰۰ و فاندینگ ۸ساعته ÷ ۸', () => {
    const [m] = normalizeLighter(
      [{ symbol: 'BTC', market_id: 1, market_type: 'perp', status: 'active', taker_fee: '0.0000', min_initial_margin_fraction: 200, maintenance_margin_fraction: 120, mark_price: '83935.8' }],
      [
        { market_id: 1, exchange: 'binance', rate: 0.5 },
        { market_id: 1, exchange: 'lighter', rate: 0.000096 }
      ]
    );
    expect(m.maxLeverage).toBe(50);
    expect(m.maintenanceMarginFraction).toBe(0.012);
    expect(m.fundingHourly).toBeCloseTo(0.000012, 12);
    expect(m.markPrice).toBe(83935.8);
    expect(m.takerFeePct).toBe(0);
  });
  it('لایتر: بازار غیرفعال یا اسپات حذف می‌شود', () => {
    expect(normalizeLighter([{ symbol: 'X', market_id: 9, market_type: 'spot', status: 'active' }], [])).toHaveLength(0);
    expect(normalizeLighter([{ symbol: 'X', market_id: 9, market_type: 'perp', status: 'inactive' }], [])).toHaveLength(0);
  });
  it('آرکوس: فاندینگ ساعتی، اهرم = ۱ ÷ IMF، دسته', () => {
    const [m] = normalizeArcus([
      { marketDisplayName: 'NVDA-USD', marketId: 27, baseAsset: 'NVDA', type: 'PERPETUAL', status: 'ONLINE', category: 'EQUITIES', markPrice: '180.5', fundingRate: '0.0000125', initialMarginFraction: '0.05', maintenanceMarginFraction: '0.03', priceChange24h: '0.0115' }
    ]);
    expect(m.maxLeverage).toBe(20);
    expect(m.fundingHourly).toBe(0.0000125);
    expect(m.category).toBe('equity');
    expect(m.change24hPct).toBeCloseTo(1.15, 9);
    expect(m.takerFeePct).toBeNull();
    expect(m.makerFeePct).toBeNull();
  });
  it('آرکوس: کارمزد ppm حساب پایه → ٪', () => {
    const [m] = normalizeArcus([
      { marketDisplayName: 'BTC-USD', marketId: 1, baseAsset: 'BTC', markPrice: '81417.8', effectiveTakerFeePpm: 225, effectiveMakerFeePpm: 0 }
    ]);
    expect(m.takerFeePct).toBeCloseTo(0.0225, 12);
    expect(m.makerFeePct).toBe(0);
  });
});

describe('نرمال‌سازی بازارهای کیوفکس و تی‌اکس‌فلو', () => {
  it('کیوفکس: دسته از refdata، کارمزد پایهٔ هر دسته، مارجین نگهداری نامعلوم', () => {
    const [eq, fx] = normalizeQfex([
      { market: 'AAPL-USD', base: 'AAPL', category: 'EQUITY', maxLeverage: 10, markPrice: 344.05, fundingHourly: -0.0000023, volume24hUsd: 5_256_087 },
      { market: 'USD-JPY', base: 'USD', category: 'FX', maxLeverage: 50, markPrice: 150, fundingHourly: null, volume24hUsd: null }
    ]);
    expect(eq).toMatchObject({ venue: 'qfex', id: 'AAPL-USD', display: 'AAPL-USD', category: 'equity', takerFeePct: 0.1, makerFeePct: 0.05, maxLeverage: 10, fundingHourly: -0.0000023 });
    expect(eq.maintenanceMarginFraction).toBeNull();
    expect(fx.category).toBe('other');
    expect(fx.takerFeePct).toBeNull();
  });

  it('تی‌اکس‌فلو: فاندینگ درصدی ÷ ۱۰۰، قیمت مارک زنده، دسته از برچسب، بازار متوقف حذف', () => {
    const live = parseTxflowCtxs({
      channel: 'allAssetCtxs',
      data: { ctxs: [{ coin: '59', ctx: { funding: '0.00125000', markPx: '410.5' } }, { coin: 'x', ctx: { funding: '1' } }, { coin: '1', ctx: { funding: '', markPx: '0' } }] }
    });
    expect(live['59'].fundingHourly).toBeCloseTo(0.0000125, 15);
    expect(live['1']).toEqual({ fundingHourly: null, markPrice: null });
    expect(live.x).toBeUndefined();
    expect(parseTxflowCtxs({ channel: 'error', message: 'bad' })).toEqual({});

    const markets = normalizeTxflow(
      [
        { index: 1, name: 'BTC-USDC', baseCurrency: 'BTC', maxLeverage: 75 },
        { index: 59, name: 'TSLA-USDC', baseCurrency: 'TSLA', maxLeverage: 20 },
        { index: 7, name: 'OLD-USDC', baseCurrency: 'OLD', haltTrading: true }
      ],
      [
        { instrumentId: 1, dayNtlVlm: '98000000', lastPrice: '82000', prevDayPx: '80000' },
        { instrumentId: 59, dayNtlVlm: '1000', lastPrice: '400', prevDayPx: '400' }
      ],
      { l2: [{ id: 1, name: 'Stocks' }, { id: 4, name: 'Layer 1' }], instrumentTags: [{ instrumentId: 1, businessLine: 'perp', tagIds: [4] }, { instrumentId: 59, businessLine: 'perp', tagIds: [1] }] },
      live
    );
    expect(markets.map((m) => m.id)).toEqual(['1', '59']);
    const [btc, tsla] = markets;
    expect(btc).toMatchObject({ venue: 'txflow', category: 'crypto', markPrice: 82000, fundingHourly: null, volume24hUsd: 98_000_000, takerFeePct: 0.045 });
    expect(btc.change24hPct).toBeCloseTo(2.5, 9);
    expect(tsla).toMatchObject({ category: 'equity', markPrice: 410.5, maxLeverage: 20 });
    expect(tsla.fundingHourly).toBeCloseTo(0.0000125, 15);
  });

  it('تی‌اکس‌فلو: ردهٔ اول جدول مارجین همان instrument', () => {
    const body = {
      instruments: [
        { perp: { instrumentId: 99 }, marginTable: { tiers: [{ tier: 1, maxLeverage: 10, mmr: '0.1' }] } },
        { perp: { instrumentId: 59 }, marginTable: { tiers: [{ tier: 2, maxLeverage: 4, mmr: '0.1' }, { tier: 1, maxLeverage: 5, mmr: '0.05' }] } }
      ]
    };
    expect(txflowFirstTier(body, '59')).toEqual({ maxLeverage: 5, maintenanceMarginFraction: 0.05 });
    expect(txflowFirstTier(body, '1')).toBeNull();
    expect(txflowFirstTier({ instruments: [{ perp: { instrumentId: 1 }, marginTable: null }] }, '1')).toBeNull();
  });
});

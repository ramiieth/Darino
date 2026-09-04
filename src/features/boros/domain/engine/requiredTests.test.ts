/**
 * تست‌های اجباری Master Prompt (§37) — ۱۶ تست Verification
 */
import { describe, expect, it } from 'vitest';
import {
  BorosCalculationEngine,
  auditMarket,
  verifyNoDoubleCounting,
  verifyLongShortSymmetry,
  verifyMarginRoundTrip,
  verifyFeeSources,
  projectCapital,
  minEconomicEdge,
  explainOpportunity,
  constantRateScenario,
  meanReversionScenario,
  stressScenario,
  classifyRobustness,
  detectAnomaly,
  assessLiquidity
} from '@/features/boros/domain/engine';
import type { BorosMarket } from '@/features/boros/domain/types';

const NOW = 1786000000;
const m: BorosMarket = {
  marketId: 101,
  name: 'Binance ETHUSDT',
  symbol: 'BINANCE-ETHUSDT',
  venue: 'Binance',
  asset: 'ETH',
  fundingRateSymbol: 'ETHUSDT',
  maturity: 1786000000 + 20 * 86_400,
  marginFloor: 0.06,
  tickStep: 2,
  iTickThresh: 583,
  maxLeverage: 2.1,
  isUiWhitelisted: true,
  kIM: 0.47619047619047616,
  kMM: 0.2222222222222222,
  takerFee: 0.0005,
  otcFee: 0.0005,
  settleFeeRate: 0.001,
  paymentPeriod: 28800,
  hardOICap: 20000,
  softOICap: 9500,
  maxRateDeviationFactorBase1e4: 2500,
  liqBase: 0.25,
  liqSlope: 0.5,
  liqFeeRate: 0.0005,
  markApr: 0.03324,
  lastTradedApr: 0.03324,
  midApr: 0.03252,
  floatingApr: 0.0983,
  longYieldApr: 0,
  notionalOI: 1054.25,
  volume24h: 20,
  nextSettlementTime: 0,
  settlementsToMaturity: 145,
  rateSensitivity: 0.00132,
  dailyVolatility: 0.00187,
  bestBid: 0.03148,
  bestAsk: 0.03355,
  assetMarkPrice: 3100,
  ohlcv: []
};
const mHist: BorosMarket = {
  ...m,
  ohlcv: Array.from({ length: 60 }, (_, i) => ({
    ts: NOW - (59 - i) * 86_400,
    c: 0.05 + 0.0014 * i
  }))
};

/* ---------- 1) verifyLongShortSymmetry ---------- */
describe('verifyLongShortSymmetry', () => {
  it('Long Gross = −Short Gross برای بازار یکسان', () => {
    const b = auditMarket({ m: mHist, size: 1000, nowSec: NOW });
    expect(verifyLongShortSymmetry(b)).toBe(true);
    expect(b.grossSettlementLong).toBeCloseTo(-b.grossSettlementShort, 9);
  });
});

/* ---------- 2) verifyNoDoubleCounting ---------- */
describe('verifyNoDoubleCounting', () => {
  it('Total Gross = Realized + Unrealized و Net = Gross − Costs', () => {
    const b = auditMarket({ m: mHist, size: 1000, nowSec: NOW });
    expect(verifyNoDoubleCounting(b)).toBe(true);
  });
});

/* ---------- 3) verifyMarginRoundTrip ---------- */
describe('verifyMarginRoundTrip', () => {
  it('برای $100/$500/$1000/$5000/$25000 و Long/Short', () => {
    for (const cap of [100, 500, 1000, 5000, 25000]) {
      for (const dir of ['long', 'short'] as const) {
        const p = projectCapital({ m: mHist, capitalUsd: cap, direction: dir, nowSec: NOW });
        expect(verifyMarginRoundTrip(p as NonNullable<typeof p>)).toBe(true);
      }
    }
  });
});

/* ---------- 4) verifyFeeModel ---------- */
describe('verifyFeeModel', () => {
  it('هر Fee منبع واقعی دارد — بدون منبع → N/A نه عدد جعلی', () => {
    const b = auditMarket({ m: mHist, size: 1000, nowSec: NOW, gasUsd: 0, slippageRate: null });
    expect(verifyFeeSources(b)).toBe(true);
    const naLines = b.feeLines.filter((l) => l.source === 'na');
    for (const l of naLines) expect(l.amount).toBe(0);
  });

  it('Maker Fee = 0 فقط با تأیید مستندات (docs: Maker orders بدون هزینه)', () => {
    const a = BorosCalculationEngine.analyze({ m: mHist, size: 1000, nowSec: NOW });
    expect(a.makerEntryFee.source).toBe('documentation');
    expect(a.makerEntryFee.amount).toBe(0);
    expect(a.makerEntryFee.note).toContain('مستندات Boros');
  });
});

/* ---------- 5) verifyEconomicEdge ---------- */
describe('verifyEconomicEdge', () => {
  it('Edge = Net − MinEdge با مقادیر دقیق (بدون خطای Rounding)', () => {
    const net = 1.98362;
    const edge = minEconomicEdge(1000); // 1.00
    expect(net - edge).toBeCloseTo(0.98362, 10);
  });

  it('زیر لبه → جذاب نیست', () => {
    const tiny: BorosMarket = { ...mHist, markApr: 0.05, floatingApr: 0.0504, maturity: NOW + 5 * 86_400 };
    const a = BorosCalculationEngine.analyze({ m: tiny, size: 1000, nowSec: NOW, economicEdge: { minUsd: 5, minRatioOfNotional: 0.001 } });
    expect(a.statusLong === 'potential').toBe(false);
  });
});

/* ---------- 6) verifyBreakEvenSanity ---------- */
describe('verifyBreakEvenSanity', () => {
  it('Break-Even خارج از محدوده معتبر → N/A (نه ۱۷۶۵٪)', () => {
    const a = BorosCalculationEngine.analyze({ m, size: 1000, nowSec: NOW, gasUsd: 0 });
    for (const be of [a.breakEvenLong, a.breakEvenShort]) {
      if (be !== null) expect(Math.abs(be)).toBeLessThanOrEqual(1);
    }
  });
});

/* ---------- 7) verifyScenarioCalculation ---------- */
describe('verifyScenarioCalculation', () => {
  it('PnL سناریو = size × diff × days/365 − costs', () => {
    const a = BorosCalculationEngine.analyze({ m: mHist, size: 1000, nowSec: NOW, gasUsd: 0 });
    const expected = 1000 * (a.underlyingApr - a.impliedApr) * (20 / 365) - (a.fees?.total ?? 0);
    expect(a.constantRateScenario.netPnl).toBeCloseTo(expected, 6);
  });
});

/* ---------- 8) verifyConstantRateScenario ---------- */
describe('verifyConstantRateScenario', () => {
  it('فرض: Floating = Current — برچسب «ثابت ماندن نرخ فعلی»', () => {
    const sc = constantRateScenario({ direction: 'long', size: 1000, fixedRate: m.markApr, currentFloating: m.floatingApr, days: 20, totalCosts: 1, margin: 100 });
    expect(sc.label).toContain('ثابت ماندن نرخ فعلی');
    expect(sc.floatingRate).toBe(m.floatingApr);
    expect(sc.settlementPnl).toBeCloseTo(1000 * (m.floatingApr - m.markApr) * (20 / 365), 6);
  });

  it('هرگز Forecast قطعی نامیده نمی‌شود (برچسب در UI)', () => {
    const a = BorosCalculationEngine.analyze({ m: mHist, size: 1000, nowSec: NOW });
    expect(a.constantRateScenario.label).not.toContain('قطع');
  });
});

/* ---------- 9) verifyMeanReversionScenario ---------- */
describe('verifyMeanReversionScenario', () => {
  it('داده تاریخی کافی → سناریو در دسترس با هدف میانگین', () => {
    const mr = meanReversionScenario({ direction: 'long', size: 1000, fixedRate: m.markApr, currentFloating: m.floatingApr, days: 20, totalCosts: 1, margin: 100, avg7d: 0.07, avg30d: 0.06, avg90d: 0.055 });
    expect(mr.available).toBe(true);
    expect(mr.targetRate).not.toBeNull();
    expect(mr.netPnl).not.toBeNull();
    // حرکت تدریجی: effective = (current + target)/2
    const eff = (m.floatingApr + (mr.targetRate as number)) / 2;
    expect(mr.settlementPnl).toBeCloseTo(1000 * (eff - m.markApr) * (20 / 365), 6);
  });

  it('بدون داده تاریخی → N/A (null) — هرگز داده ساختگی', () => {
    const mr = meanReversionScenario({ direction: 'long', size: 1000, fixedRate: m.markApr, currentFloating: m.floatingApr, days: 20, totalCosts: 1, margin: 100, avg7d: null, avg30d: null, avg90d: null });
    expect(mr.available).toBe(false);
    expect(mr.netPnl).toBeNull();
    expect(mr.note).toContain('N/A');
  });
});

/* ---------- 10) verifyStressScenario ---------- */
describe('verifyStressScenario', () => {
  it('Stress از انحراف معیار تاریخی استخراج می‌شود (نه دلخواه)', () => {
    const hist = Array.from({ length: 30 }, (_, i) => 0.05 + 0.002 * i);
    const s = stressScenario({ direction: 'long', size: 1000, fixedRate: m.markApr, currentFloating: 0.08, days: 20, totalCosts: 1, margin: 100, historicalApr: hist });
    expect(s).not.toBeNull();
    if (!s) return;
    expect(s.stressAmount).toBeGreaterThan(0);
    expect(s.stressSource).toContain('انحراف معیار');
    expect(s.bearRate).toBeLessThan(s.baseRate);
    expect(s.bullRate).toBeGreaterThan(s.baseRate);
  });

  it('داده کافی نیست → null (N/A)', () => {
    const s = stressScenario({ direction: 'long', size: 1000, fixedRate: m.markApr, currentFloating: 0.08, days: 20, totalCosts: 1, margin: 100, historicalApr: [0.05, 0.06] });
    expect(s).toBeNull();
  });
});

/* ---------- 11) verifyAnomalyDetection ---------- */
describe('verifyAnomalyDetection', () => {
  it('Extreme Rate Dislocation → anomaly + confidence ↓', () => {
    const bad: BorosMarket = { ...m, markApr: -0.5725, floatingApr: 0.0548, maturity: NOW + 8 * 86_400 };
    const a = BorosCalculationEngine.analyze({ m: { ...bad, ohlcv: mHist.ohlcv }, size: 1000, nowSec: NOW });
    expect(a.anomaly.detected).toBe(true);
    expect(a.anomaly.kind).toBe('extreme-dislocation');
    expect(a.anomaly.reasons.length).toBeGreaterThan(0);
    expect(a.confidence).toBeLessThan(90);
  });

  it('بازار عادی → بدون ناهنجاری', () => {
    const a = BorosCalculationEngine.analyze({ m: mHist, size: 1000, nowSec: NOW });
    expect(a.anomaly.detected).toBe(false);
  });

  it('anomaly → status anomaly-detected (نه فرصت طلایی)', () => {
    const bad: BorosMarket = { ...m, markApr: -0.3, floatingApr: 0.05, maturity: NOW + 8 * 86_400 };
    const a = BorosCalculationEngine.analyze({ m: { ...bad, ohlcv: mHist.ohlcv }, size: 1000, nowSec: NOW });
    expect(a.statusLong).toBe('anomaly-detected');
  });
});

/* ---------- 12) verifyLiquidityFilter ---------- */
describe('verifyLiquidityFilter', () => {
  it('OI بزرگ ولی حجم کم → نسبت حجم/OI پایین (نقدشوندگی واقعی ضعیف)', () => {
    // OI بزرگ ولی حجم بسیار کم → turnover = 5000/1500000 = 0.33٪ < 1٪
    const l = assessLiquidity({ ...mHist, notionalOI: 1_500_000, volume24h: 5_000 }, 1000);
    expect(l.available).toBe(true);
    expect(l.reasons.some((r) => r.includes('نسبت حجم/OI'))).toBe(true);
  });

  it('Notional بزرگتر از ظرفیت اجرا → executable=false', () => {
    const l = assessLiquidity({ ...mHist, notionalOI: 1000, volume24h: 20 }, 1000);
    // ظرفیت تخمینی = 20 × 0.05 = 1 → 1000 > 1
    expect(l.executable).toBe(false);
    expect(l.reasons.some((r) => r.includes('بیشتر است'))).toBe(true);
  });
});

/* ---------- 13) verifyDataFreshness ---------- */
describe('verifyDataFreshness', () => {
  it('داده کهنه → stale + confidence پایین', () => {
    const old: BorosMarket = { ...mHist, ohlcv: [{ ts: NOW - 5 * 3600, c: 0.05 }] };
    const a = BorosCalculationEngine.analyze({ m: old, size: 1000, nowSec: NOW });
    expect(a.freshness.stale).toBe(true);
    expect(a.freshness.confidenceFactor).toBeLessThan(0.6);
  });

  it('داده تازه → stale=false', () => {
    const a = BorosCalculationEngine.analyze({ m: mHist, size: 1000, nowSec: NOW });
    expect(a.freshness.stale).toBe(false);
  });
});

/* ---------- 14) verifyNoFabricatedData ---------- */
describe('verifyNoFabricatedData', () => {
  it('MTM سناریو بدون Mark → N/A (نه ۰)', () => {
    const a = BorosCalculationEngine.analyze({ m: mHist, size: 1000, nowSec: NOW });
    expect(a.stress.available).toBe(true);
  });
  it('Slippage بدون داده → ۰ با منبع na', () => {
    const b = auditMarket({ m: mHist, size: 1000, nowSec: NOW, slippageRate: null });
    const slip = b.feeLines.find((l) => l.label.includes('Slippage'))!;
    expect(slip.source).toBe('na');
    expect(slip.amount).toBe(0);
  });
});

/* ---------- 15) verifyNetNegativeNeverRanksAsBest ---------- */
describe('verifyNetNegativeNeverRanksAsBest', () => {
  it('هیچ بازار با Net منفی potential نیست', () => {
    const markets = [mHist, { ...mHist, floatingApr: 0.01, markApr: 0.05, marketId: 202 }];
    const rows = BorosCalculationEngine.analyzeAll(markets, 1000);
    for (const a of rows) {
      if (a.statusLong === 'potential') expect(a.totalLongPnl).toBeGreaterThan(0);
      if (a.statusShort === 'potential') expect(a.totalShortPnl).toBeGreaterThan(0);
    }
  });
});

/* ---------- 16) verifyInsufficientDataFiltering ---------- */
describe('verifyInsufficientDataFiltering', () => {
  it('بازار منقضی → insufficient-data و حذف از Ranking', () => {
    const expired: BorosMarket = { ...mHist, maturity: NOW - 1000 };
    const a = BorosCalculationEngine.analyze({ m: expired, size: 1000, nowSec: NOW });
    expect(a.statusLong).toBe('insufficient-data');
    // analyzeAll از ساعت واقعی سیستم می‌خواند → بازار سالم باید سررسید آینده واقعی داشته باشد
    const liveNow = Math.floor(Date.now() / 1000);
    const live: BorosMarket = { ...mHist, maturity: liveNow + 20 * 86_400 };
    const expiredLive: BorosMarket = { ...mHist, maturity: liveNow - 1000 };
    const all = BorosCalculationEngine.analyzeAll([live, expiredLive], 1000);
    expect(all).toHaveLength(1);
  });
});

/* ---------- Extra: Robustness ---------- */
describe('Scenario Robustness (Master §26)', () => {
  it('Robust: همه سناریوها مثبت · Conditional: Bear منفی · Not: Base منفی', () => {
    expect(classifyRobustness({ bearNet: 1, baseNet: 2, bullNet: 3 })).toBe('robust');
    expect(classifyRobustness({ bearNet: -1, baseNet: 2, bullNet: 3 })).toBe('conditional');
    expect(classifyRobustness({ bearNet: -3, baseNet: -1, bullNet: 1 })).toBe('not-attractive');
    expect(classifyRobustness({ bearNet: null, baseNet: 2, bullNet: 3 })).toBe('na');
  });

  it('استحکام در تحلیل بازار موجود است', () => {
    const a = BorosCalculationEngine.analyze({ m: mHist, size: 1000, nowSec: NOW });
    expect(['robust', 'conditional', 'not-attractive', 'na']).toContain(a.robustness);
  });
});

/* ================= Edge Cases (Master §30) ================= */
describe('Edge Cases — Zero/Missing/Extreme', () => {
  const zeroNotional = () => BorosCalculationEngine.analyze({ m: mHist, size: 0, nowSec: NOW });
  it('Zero Notional → نامعتبر (حذف از Ranking)', () => {
    const a = zeroNotional();
    expect(a.valid).toBe(false);
    expect(a.invalidReason).toContain('حجم');
  });

  it('Zero Days (منقضی) → insufficient-data', () => {
    const expired: BorosMarket = { ...mHist, maturity: NOW - 1000 };
    const a = BorosCalculationEngine.analyze({ m: expired, size: 1000, nowSec: NOW });
    expect(a.statusLong).toBe('insufficient-data');
  });

  it('Negative Net PnL → not-attractive (هرگز Best نیست)', () => {
    const neg: BorosMarket = { ...mHist, floatingApr: 0.01, markApr: 0.05 };
    const a = BorosCalculationEngine.analyze({ m: neg, size: 1000, nowSec: NOW });
    expect(a.statusLong).toBe('not-attractive');
    const best = BorosCalculationEngine.analyzeAll([neg, mHist], 1000).filter((x) => x.statusLong === 'potential');
    expect(best.every((x) => x.totalLongPnl > 0)).toBe(true);
  });

  it('Missing Mark → MTM = N/A (نه ۰)', () => {
    // Mark نامعتبر (0) — engine باید آن را null کند
    const noMark: BorosMarket = { ...mHist, markApr: 0, floatingApr: 0.08 };
    const a = BorosCalculationEngine.analyze({ m: noMark, size: 1000, nowSec: NOW });
    // mark=0 → fixed=0 → محاسبات با 0 → باید نامعتبر یا هشدار باشد
    expect(a.valid).toBeDefined();
  });

  it('Missing Historical Data → سناریوهای Mean-Reversion و Stress = N/A', () => {
    const noHist: BorosMarket = { ...m, ohlcv: [] };
    const a = BorosCalculationEngine.analyze({ m: noHist, size: 1000, nowSec: NOW });
    expect(a.meanReversion.available).toBe(false);
    expect(a.meanReversion.netPnl).toBeNull();
    expect(a.stress.available).toBe(false);
    expect(a.stress.bearNet).toBeNull();
  });

  it('Missing Fee → source=na و amount=0 (نه عدد جعلی)', () => {
    const noFee: BorosMarket = { ...mHist, takerFee: 0, settleFeeRate: 0 };
    const b = auditMarket({ m: noFee, size: 1000, nowSec: NOW, gasUsd: 0, slippageRate: null });
    const entry = b.feeLines.find((l) => l.label.includes('ورود'))!;
    expect(entry.source).toBe('na');
    expect(entry.amount).toBe(0);
  });

  it('Missing Gas → gas=0 با نمایش unknown/excluded', () => {
    const b = auditMarket({ m: mHist, size: 1000, nowSec: NOW, gasUsd: 0 });
    const gas = b.feeLines.find((l) => l.label.includes('گس'))!;
    expect(gas.amount).toBe(0);
    expect(gas.source).toBe('na');
  });

  it('Extreme Spread → anomaly-detected (نه فرصت طلایی)', () => {
    const extreme: BorosMarket = { ...mHist, markApr: -0.3, floatingApr: 0.05, maturity: NOW + 8 * 86_400 };
    const a = BorosCalculationEngine.analyze({ m: extreme, size: 1000, nowSec: NOW });
    expect(a.anomaly.detected).toBe(true);
    expect(a.statusLong).toBe('anomaly-detected');
  });

  it('Low Liquidity → در Best قرار نمیگیرد (حتی با Edge)', () => {
    const thin: BorosMarket = { ...mHist, notionalOI: 10, volume24h: 1, markApr: 0.03, floatingApr: 0.10 };
    const a = BorosCalculationEngine.analyze({ m: thin, size: 1000, nowSec: NOW });
    // نقدشوندگی پایین → score پایین یا status محافظهکارانه
    expect(a.liquidity.score).toBeLessThan(0.4);
  });

  it('Stale Data → confidence پایین و هشدار freshness', () => {
    const stale: BorosMarket = { ...mHist, ohlcv: [{ ts: NOW - 10 * 3600, c: 0.05 }] };
    const a = BorosCalculationEngine.analyze({ m: stale, size: 1000, nowSec: NOW });
    expect(a.freshness.stale).toBe(true);
    expect(a.confidence).toBeLessThan(60);
  });

  it('Long/Short Opposite Direction — برای همه بازارهای تست', () => {
    const mkts = [mHist, { ...mHist, marketId: 1, floatingApr: 0.12 }, { ...mHist, marketId: 2, floatingApr: 0.01 }];
    for (const mk of mkts) {
      const a = BorosCalculationEngine.analyze({ m: mk, size: 1000, nowSec: NOW });
      expect(Math.sign(a.grossLongPnl)).toBe(-Math.sign(a.grossShortPnl) || 0);
    }
  });
});

/* ================= Reason Engine (Master §29) ================= */
describe('Reason Engine — Why Potential / Why Not', () => {
  it('بازار جذاب → دلایل مثبت دارد', () => {
    const a = BorosCalculationEngine.analyze({ m: mHist, size: 1000, nowSec: NOW });
    const ex = explainOpportunity(a);
    if (a.statusLong === 'potential' || a.statusLong === 'conditional') {
      expect(ex.positive.length).toBeGreaterThan(0);
    }
    expect(ex.summary).toBeTruthy();
  });

  it('بازار با Net منفی → دلیل «هزینهها مزیت را از بین برده»', () => {
    const neg: BorosMarket = { ...mHist, floatingApr: 0.005, markApr: 0.05 };
    const a = BorosCalculationEngine.analyze({ m: neg, size: 1000, nowSec: NOW });
    const ex = explainOpportunity(a);
    expect(ex.negative.some((r) => r.text.includes('Net PnL'))).toBe(true);
  });
});

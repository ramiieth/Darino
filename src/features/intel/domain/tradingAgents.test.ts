import { describe, expect, it } from 'vitest';
import {
  GLOBAL_COMMITTEE_MARKETS,
  buildDeterministicCommitteeBaseline,
  buildIndicatorDiagnostics,
  buildPastLessonsContext,
  coerceOptionalFloat,
  computeTechnicalSnapshot,
  computeTradeGeometry,
  getMarketVisualMeta,
  parseRatingFromText,
  rankMemoryByBm25,
  renderCompleteReportHtml,
  settleMemoryEntries,
  synthesizeFallbackCandles,
  type CommitteeMarketInput,
  type TradingMemoryEntry
} from './tradingAgents';
import type { Candle } from './survival';

function makeCandles(count: number, startPrice = 100, step = 0.5): Candle[] {
  const startTs = Date.parse('2026-06-01T00:00:00Z');
  return Array.from({ length: count }, (_, i) => {
    const base = startPrice + i * step + Math.sin(i / 3) * 2;
    return {
      t: startTs + i * 4 * 3_600_000,
      o: base - 0.5,
      h: base + 1.8,
      l: base - 1.5,
      c: base
    };
  });
}

describe('TradingAgents Domain — coerceOptionalFloat & parseRatingFromText', () => {
  it('درصدها، بازه‌ها و رشته‌های خالی را مثل _coerce_optional_float در schemas.py رد می‌کند', () => {
    expect(coerceOptionalFloat('15%')).toBeNull();
    expect(coerceOptionalFloat('۱۰٪')).toBeNull();
    expect(coerceOptionalFloat('None')).toBeNull();
    expect(coerceOptionalFloat('N/A')).toBeNull();
    expect(coerceOptionalFloat('150-160')).toBeNull();
    expect(coerceOptionalFloat('$1,234.50')).toBeCloseTo(1234.5);
    expect(coerceOptionalFloat(189.5)).toBeCloseTo(189.5);
  });

  it('فقط خط دارای برچسب Rating یا Recommendation را می‌خواند و نقل‌قول متن را نادیده می‌گیرد', () => {
    const text = [
      'Earlier someone said Consensus rating: Buy, which was too optimistic.',
      '**Rating Scale**: Buy / Overweight / Hold / Underweight / Sell',
      '**Rating**: **Underweight**',
      'We should trim exposure.'
    ].join('\n');
    expect(parseRatingFromText(text)).toBe('Underweight');
    expect(parseRatingFromText('No rating label here at all')).toBe('REVIEW');
  });
});

describe('TradingAgents Domain — کاتالوگ بازارها، لوگوها و کندل پشتیبان (رمزارز، طلا، نفت، سهام، فارکس)', () => {
  it('تمام دسته‌های رمزارز، طلا، نقره، نفت برنت/WTI، سهام بزرگ و فارکس را با لوگوی رنگی و نام فارسی پوشش می‌دهد', () => {
    expect(GLOBAL_COMMITTEE_MARKETS.length).toBeGreaterThanOrEqual(45);

    const gold = getMarketVisualMeta('xyz:GOLD');
    expect(gold.category).toBe('commodity');
    expect(gold.logoKey).toBe('XAU');
    expect(gold.nameFa).toContain('طلا');

    const brent = getMarketVisualMeta('xyz:BRENTOIL');
    expect(brent.category).toBe('commodity');
    expect(brent.logoKey).toBe('BRENTOIL');
    expect(brent.nameFa).toContain('نفت');

    const wti = getMarketVisualMeta('xyz:CL');
    expect(wti.category).toBe('commodity');
    expect(wti.logoKey).toBe('WTI');

    const nvda = getMarketVisualMeta('xyz:NVDA');
    expect(nvda.category).toBe('equity');
    expect(nvda.logoKey).toBe('NVDA');
    expect(nvda.nameFa).toContain('انویدیا');

    const eur = getMarketVisualMeta('xyz:EUR');
    expect(eur.category).toBe('fx');
    expect(eur.logoKey).toBe('EURUSD');
  });

  it('در صورت نبود کندل زنده برای سهام یا طلا/نفت، سری کندل ۱۲۰ تایی معتبر برای ۱۱ اندیکاتور می‌سازد', () => {
    const synth = synthesizeFallbackCandles(3985, 0.85, 'xyz:GOLD', 120);
    expect(synth).toHaveLength(120);
    expect(synth[synth.length - 1].c).toBeCloseTo(3985);
    const snap = computeTechnicalSnapshot(synth, 6);
    expect(snap).not.toBeNull();
    expect(snap!.rsi14).not.toBeNull();
    expect(snap!.atr14).toBeGreaterThan(0);
  });
});

describe('TradingAgents Domain — ۱۱ اندیکاتور تکنیکال، ماتریس تشخیصی و هندسه R:R', () => {
  it('تمام ۱۱ اندیکاتور (SMA50, SMA200, EMA10, MACD/Signal/Hist, RSI14, Boll, ATR14, VWMA20) و ۱۲ ردیف تشخیصی را محاسبه می‌کند', () => {
    const candles = makeCandles(240, 100, 0.4);
    const snap = computeTechnicalSnapshot(candles, 6);
    expect(snap).not.toBeNull();
    expect(snap!.barsCount).toBe(240);
    expect(snap!.close10Ema).not.toBeNull();
    expect(snap!.close50Sma).not.toBeNull();
    expect(snap!.close200Sma).not.toBeNull();
    expect(snap!.macd).not.toBeNull();
    expect(snap!.macds).not.toBeNull();
    expect(snap!.macdh).not.toBeNull();
    expect(snap!.rsi14).toBeGreaterThan(50);
    expect(snap!.bollUpper).toBeGreaterThan(snap!.bollMid!);
    expect(snap!.bollLower).toBeLessThan(snap!.bollMid!);
    expect(snap!.atr14).toBeGreaterThan(0);
    expect(snap!.vwma20).not.toBeNull();
    expect(snap!.trendRegime).toBe('bullish');

    const rows = buildIndicatorDiagnostics(snap!);
    expect(rows).toHaveLength(12);
    expect(rows.some((r) => r.key === 'close_50_sma' && r.signal === 'bullish')).toBe(true);
  });

  it('هندسه معامله (فاصله حد ضرر، فاصله هدف و نسبت R:R) را دقیق محاسبه می‌کند', () => {
    const g = computeTradeGeometry(100, 95, 112.5);
    expect(g.stopDistancePct).toBeCloseTo(5);
    expect(g.targetDistancePct).toBeCloseTo(12.5);
    expect(g.riskRewardRatio).toBeCloseTo(2.5);
  });

  it('پیش‌خوانش کمیته استاپ مبتنی بر ۲×ATR و اندازه پوزیشن متناسب با ریسک می‌سازد', () => {
    const technical = computeTechnicalSnapshot(makeCandles(240, 100, 0.5), 6)!;
    const input: CommitteeMarketInput = {
      coin: 'BTC',
      analysisDate: '2026-10-25',
      researchDepth: 2,
      technical,
      derivatives: {
        fundingAprNow: 11,
        fundingAvg7dApr: 10,
        fundingPercentile30d: 45,
        fundingRegime: 'normal',
        openInterestUsd: 500_000_000,
        volume24hUsd: 1_200_000_000,
        maxLeverage: 40,
        worstCrash24hPct: 14,
        safeLeverage7d: 5
      },
      macroRegime: { state: 'on', btcAbove200: true, breadthPct: 68 },
      portfolio: { cashUsd: 10_000, maxRiskPct: 1 }
    };
    const base = buildDeterministicCommitteeBaseline(input);
    expect(base.sentimentScore).toBeGreaterThan(6);
    expect(['Buy', 'Overweight']).toContain(base.suggestedRating);
    expect(base.atrStopLong).toBeLessThan(technical.close);
    expect(base.atrStopShort).toBeGreaterThan(technical.close);
    expect(base.recommendedSizeUsd).toBeGreaterThan(0);
    expect(base.recommendedSizeUsd).toBeLessThanOrEqual(10_000);
  });
});

describe('TradingAgents Domain — حافظه تصمیم‌ها (BM25 + Memory Log) و گزارش HTML', () => {
  it('تصمیم‌های سررسیدشده را تسویه می‌کند و درس‌های قبلی را با الگوریتم BM25 استخراج می‌کند', () => {
    const createdAt = Date.parse('2026-10-01T00:00:00Z');
    const now = Date.parse('2026-10-20T00:00:00Z');
    const entries: TradingMemoryEntry[] = [
      {
        id: '1',
        coin: 'ETH',
        analysisDate: '2026-10-01',
        createdAt,
        rating: 'Buy',
        traderAction: 'Buy',
        entryPrice: 2500,
        stopLoss: 2350,
        priceTarget: 2800,
        holdingPeriodDays: 14,
        executiveSummary: 'ورود صعودی روی حمایت',
        settledAt: null,
        settledPrice: null,
        realizedReturnPct: null,
        lesson: null
      },
      {
        id: '2',
        coin: 'BTC',
        analysisDate: '2026-10-02',
        createdAt,
        rating: 'Sell',
        traderAction: 'Sell',
        entryPrice: 90000,
        stopLoss: 92000,
        priceTarget: 85000,
        holdingPeriodDays: 14,
        executiveSummary: 'فشار نزولی در مقاومت',
        settledAt: null,
        settledPrice: null,
        realizedReturnPct: null,
        lesson: null
      }
    ];
    const { updated, newlySettledCount } = settleMemoryEntries(entries, { ETH: 2750, BTC: 88000 }, now);
    expect(newlySettledCount).toBe(2);
    expect(updated[0].settledAt).toBe(now);
    expect(updated[0].realizedReturnPct).toBeCloseTo(10);
    expect(updated[0].lesson).toContain('+10%');

    const ranked = rankMemoryByBm25(updated, 'ETH صعودی حمایت', 2);
    expect(ranked[0].coin).toBe('ETH');

    const lessons = buildPastLessonsContext(updated, 'ETH', 2, 'صعودی حمایت');
    expect(lessons).toHaveLength(2);
    expect(lessons[0]).toContain('ETH');
  });

  it('گزارش تک‌صفحه‌ای HTML را به صورت ایمن و بدون اسکریپت خارجی تولید می‌کند', () => {
    const technical = computeTechnicalSnapshot(makeCandles(60, 100, 0.2), 6)!;
    const input: CommitteeMarketInput = {
      coin: 'SOL',
      analysisDate: '2026-10-25',
      researchDepth: 1,
      technical,
      derivatives: {
        fundingAprNow: 8,
        fundingAvg7dApr: 9,
        fundingPercentile30d: 40,
        fundingRegime: 'normal',
        openInterestUsd: 100_000_000,
        volume24hUsd: 200_000_000,
        maxLeverage: 20,
        worstCrash24hPct: 18,
        safeLeverage7d: 3
      }
    };
    const html = renderCompleteReportHtml(input, {
      analysts: {
        marketReport: 'تحلیل تکنیکال <script>alert(1)</script>',
        sentimentReport: { overallBand: 'Bullish', overallScore: 7.5, confidence: 'high', narrative: 'فاندینگ متعادل' },
        newsMacroReport: 'رژیم صعودی',
        fundamentalsReport: 'نقدشوندگی بالا'
      },
      researchDebate: {
        bullHistory: 'استدلال صعودی',
        bearHistory: 'استدلال نزولی',
        researchPlan: { recommendation: 'Overweight', rationale: 'برتری صعودی', strategicActions: 'ورود پله‌ای' }
      },
      traderProposal: {
        action: 'Buy',
        reasoning: 'شکست مقاومت',
        entryPrice: 110,
        stopLoss: 104,
        takeProfit: 122,
        positionSizing: '۱۰۰۰ دلار'
      },
      riskDebate: {
        aggressiveArgument: 'شتاب قوی',
        conservativeArgument: 'مراقبت از ریزش',
        neutralArgument: 'حجم متعادل',
        portfolioDecision: {
          rating: 'Overweight',
          executiveSummary: 'افزایش تدریجی با حد ضرر مشخص',
          investmentThesis: 'هم‌سویی روند و فاندینگ',
          priceTarget: 122,
          timeHorizon: '۱۴ روز'
        }
      }
    });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

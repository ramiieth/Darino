import { describe, expect, it } from 'vitest';
import { DESK_AGENTS } from './agents';
import { runHistoricalBacktest } from './backtester';
import { PRE_TRADE_CHECKLIST_ITEMS, evaluateChecklist } from './checklist';
import { buildSixIndicatorMatrix, runTwelvePracticalFilters } from './indicatorsAndFilters';
import { analyzeMonthlyJournal } from './journal';
import { runFullAnalysisPipeline, runSingleDeskAgent } from './orchestrator';
import { parsePriceCsvText } from './parsers';
import { evaluateTradeRisk } from './riskManager';
import { runMarketScanner } from './scanner';
import type { DailyPriceBar, UploadedCodalDocument, UploadedPriceDataset } from './types';

function makeSyntheticBars(count: number, opts?: { breakoutOnLast?: boolean; volumeSpikeOnLast?: boolean; inflow3d?: boolean; nav?: number }): DailyPriceBar[] {
  const bars: DailyPriceBar[] = [];
  for (let i = 0; i < count; i++) {
    const day = String((i % 28) + 1).padStart(2, '0');
    const month = String(Math.floor(i / 28) + 1).padStart(2, '0');
    const isLast = i === count - 1;
    const isLast3 = i >= count - 3;
    const baseClose = 4000 + Math.round(Math.sin(i / 5) * 180);
    const close = isLast && opts?.breakoutOnLast ? 4500 : baseClose;
    const volume = isLast && opts?.volumeSpikeOnLast ? 3_500_000 : 1_000_000;
    bars.push({
      date: `2026-${month}-${day}`,
      open: close - 20,
      high: close + 40,
      low: close - 40,
      close,
      volume,
      tradeValueRial: volume * close,
      realBuyVolume: isLast3 && opts?.inflow3d ? 700_000 : 400_000,
      realSellVolume: isLast3 && opts?.inflow3d ? 450_000 : 500_000,
      nav: opts?.nav ?? null
    });
  }
  return bars;
}

describe('Iran Smart Trading Desk — Core Engines & Acceptance Criteria', () => {
  it('defines all 6 independent agents with non-empty system instructions and central rules', () => {
    expect(DESK_AGENTS.map((a) => a.id)).toEqual([
      'scanner',
      'fundamental',
      'bull',
      'bear',
      'risk_manager',
      'backtester'
    ]);
    for (const a of DESK_AGENTS) {
      expect(a.systemInstruction).toContain('هیچ عدد، قیمت، خبر');
      expect(a.allowedPermissions.length).toBeGreaterThan(0);
    }
  });

  it('parses valid TSETMC CSV files and rejects incomplete/invalid files', () => {
    const validCsv = [
      'تاریخ,اولین,بیشترین,کمترین,پایانی,حجم,خرید حقیقی,فروش حقیقی',
      '20260101,4000,4100,3950,4050,1000000,600000,400000',
      '20260102,4050,4200,4000,4150,1500000,800000,500000',
      '20260102,4050,4200,4000,4160,1600000,900000,500000'
    ].join('\n');
    const ok = parsePriceCsvText(validCsv);
    expect(ok.ok).toBe(true);
    expect(ok.bars).toHaveLength(2);
    expect(ok.duplicateDatesRemoved).toBe(1);
    expect(ok.bars[1].close).toBe(4160);

    const invalid = parsePriceCsvText('foo,bar\n1,2');
    expect(invalid.ok).toBe(false);
    expect(invalid.errors.length).toBeGreaterThan(0);
  });

  it('detects 3-day real money inflow, >2x volume spike, 20-day breakout, Codal material disclosure, and fund NAV discount', () => {
    const stockDs: UploadedPriceDataset = {
      id: 'ds-1',
      symbol: 'فولاد',
      nameFa: 'فولاد مبارکه اصفهان',
      assetType: 'stock',
      segment: 'tse',
      fileName: 'foolad.csv',
      sourceName: 'TSETMC',
      currencyUnit: 'rial',
      uploadedAt: Date.now(),
      lastBarDate: '2026-02-01',
      bars: makeSyntheticBars(30, { breakoutOnLast: true, volumeSpikeOnLast: true, inflow3d: true }),
      validationWarnings: []
    };
    const fundDs: UploadedPriceDataset = {
      id: 'ds-2',
      symbol: 'اطلس',
      nameFa: 'صندوق سهامی اطلس',
      assetType: 'fund_equity',
      segment: 'funds',
      fileName: 'atlas.csv',
      sourceName: 'TSETMC',
      currencyUnit: 'rial',
      uploadedAt: Date.now(),
      lastBarDate: '2026-02-01',
      bars: makeSyntheticBars(25, { nav: 4400 }), // close ~4000 vs NAV 4400 => discount
      validationWarnings: []
    };
    const codalDoc: UploadedCodalDocument = {
      id: 'doc-1',
      symbol: 'فولاد',
      title: 'اطلاعیه افزایش سرمایه ۲۰۰ درصدی',
      docType: 'disclosure',
      fileName: 'codal.pdf',
      reportDate: '2026-02-01',
      uploadedAt: Date.now(),
      extractedText: 'تصمیم هیئت مدیره جهت افزایش سرمایه و افشای اطلاعات بااهمیت گروه الف'
    };

    const scan = runMarketScanner({ datasets: [stockDs, fundDs], documents: [codalDoc] });
    const codes = scan.rows.map((r) => r.signalCode);
    expect(codes).toContain('real_money_inflow_3d');
    expect(codes).toContain('volume_spike_2x');
    expect(codes).toContain('breakout_20d');
    expect(codes).toContain('codal_material');
    expect(codes).toContain('fund_nav_discount');

    const emptyScan = runMarketScanner({ datasets: [], documents: [] });
    expect(emptyScan.rows).toHaveLength(0);
    expect(emptyScan.emptyMessageFa).toContain('پیدا نشد');
  });

  it('computes exact Risk Manager position size, rejects R:R < 1:2, and flags 5% liquidity, daily limit, and 20% concentration', () => {
    // ۱) رد قطعی به دلیل R:R کمتر از ۱ به ۲
    const rejected = evaluateTradeRisk({
      symbol: 'فولاد',
      assetType: 'stock',
      totalCapitalRial: 1_000_000_000,
      maxRiskPct: 1,
      entryPriceRial: 5000,
      stopLossRial: 4500, // فاصله 500
      targetPriceRial: 5700, // ریوارد 700 => R:R = 1.4 < 2
      avgDailyTradeValueRial: 50_000_000_000,
      dailyPriceLimitPct: 3,
      existingPortfolioExposurePct: 0,
      sameSectorExposurePct: 0
    });
    expect(rejected.approved).toBe(false);
    expect(rejected.verdictTitleFa).toContain('❌ رد معامله');
    expect(rejected.riskRewardRatio).toBeCloseTo(1.4, 1);

    // ۲) تأیید با حجم دقیق + هشدار صف فروش (> ۵٪) + دامنه نوسان + تمرکز (> ۲۰٪)
    const approved = evaluateTradeRisk({
      symbol: 'فولاد',
      assetType: 'stock',
      totalCapitalRial: 1_000_000_000,
      maxRiskPct: 2, // 20,000,000 ریال ریسک مجاز
      entryPriceRial: 5000,
      stopLossRial: 4600, // فاصله 400 (8% > 3% دامنه نوسان) => حجم = 50,000 سهم => ارزش 250,000,000 (25% > 20%)
      targetPriceRial: 6000, // ریوارد 1000 => R:R = 2.5 >= 2
      avgDailyTradeValueRial: 2_000_000_000, // 250M / 2B = 12.5% > 5%
      dailyPriceLimitPct: 3,
      existingPortfolioExposurePct: 0,
      sameSectorExposurePct: 0
    });
    expect(approved.approved).toBe(true);
    expect(approved.recommendedShares).toBe(50_000);
    expect(approved.riskRewardRatio).toBe(2.5);
    expect(approved.liquidityWarningFa).toBeTruthy();
    expect(approved.dailyLimitWarningFa).toBeTruthy();
    expect(approved.concentrationWarningFa).toBeTruthy();
  });

  it('executes real historical backtest, flags < 30 trades reliability warning, and compares vs Buy & Hold', () => {
    const bars = makeSyntheticBars(120);
    const res = runHistoricalBacktest({
      symbol: 'فولاد',
      fileName: 'foolad-1405.csv',
      bars,
      config: {
        strategyId: 'sma_cross',
        initialCapitalRial: 1_000_000_000,
        stopLossPct: 5,
        takeProfitPct: 12,
        roundTripCommissionPct: 1.25,
        commissionAssumptionFa: 'کارمزد استاندارد سهام بورس'
      }
    });
    expect(res.barsUsed).toBe(120);
    expect(res.equityCurve).toHaveLength(120);
    expect(res.disclaimerFa).toContain('تضمین سود در آینده نیست');
    if (res.totalTrades < 30) {
      expect(res.statisticallyReliable).toBe(false);
      expect(res.reliabilityWarningFa).toContain('کافی نیست');
    }
    expect(res.pythonCode).toContain('pd.read_csv');
  });

  it('adapts fundamental analysis for fixed-income funds (marks company P/E irrelevant) and runs full pipeline', async () => {
    const fixedFundDs: UploadedPriceDataset = {
      id: 'ds-avand',
      symbol: 'آوند',
      nameFa: 'صندوق درآمد ثابت آوند',
      assetType: 'fund_fixed_income',
      segment: 'funds',
      fileName: 'avand.csv',
      sourceName: 'TSETMC',
      currencyUnit: 'rial',
      uploadedAt: Date.now(),
      lastBarDate: '2026-03-01',
      bars: makeSyntheticBars(40, { nav: 4010 }),
      validationWarnings: []
    };

    const fundOut = await runSingleDeskAgent('fundamental', {
      symbol: 'آوند',
      nameFa: 'صندوق درآمد ثابت آوند',
      assetType: 'fund_fixed_income',
      dataset: fixedFundDs,
      documents: [],
      scannerSignals: [],
      priorRuns: {},
      useGeminiIfAvailable: false
    });
    expect(fundOut.detailsMarkdownFa).toContain('نامرتبط با نوع صندوق');

    const full = await runFullAnalysisPipeline({
      symbol: 'آوند',
      nameFa: 'صندوق درآمد ثابت آوند',
      assetType: 'fund_fixed_income',
      dataset: fixedFundDs,
      documents: [],
      scannerSignals: [],
      priorRuns: {},
      useGeminiIfAvailable: false
    });
    expect(full.report.symbol).toBe('آوند');
    expect(full.runs.fundamental).toBeTruthy();
    expect(full.runs.bull).toBeTruthy();
    expect(full.runs.bear).toBeTruthy();
  });

  it('enforces all 11 pre-trade checklist items and detects monthly journal behavioral mistakes', () => {
    expect(PRE_TRADE_CHECKLIST_ITEMS).toHaveLength(11);
    const partial = evaluateChecklist({
      symbol: 'فولاد',
      updatedAt: Date.now(),
      checks: { c1_risk_approved: true }
    });
    expect(partial.allPassed).toBe(false);
    expect(partial.missingItems).toHaveLength(10);

    const review = analyzeMonthlyJournal([
      {
        id: 'j1',
        symbol: 'فولاد',
        assetType: 'stock',
        date: '2026-11-10',
        entryPriceRial: 5000,
        exitPriceRial: 4600,
        volume: 10000,
        entryReasonFa: 'سیگنال کانال',
        fundamentalThesisFa: '',
        bullSummaryFa: '',
        bearSummaryFa: '',
        riskManagerStatus: 'rejected',
        outcome: 'loss',
        pnlRial: -4_000_000,
        pnlPct: -8,
        lessonLearnedFa: 'بدون تأیید مدیر ریسک وارد نشوم',
        personalNotesFa: '',
        checklistPassed: false,
        tags: ['ورود هیجانی / کانال', 'عدم رعایت حد ضرر'],
        createdAt: Date.now()
      }
    ]);
    expect(review.detectedPatterns.some((p) => p.code === 'ignored_risk_manager')).toBe(true);
    expect(review.detectedPatterns.some((p) => p.code === 'stop_violation')).toBe(true);
    expect(review.detectedPatterns.some((p) => p.code === 'emotional_entry')).toBe(true);
  });

  it('computes all 6 aggregated indicators (RSI, MACD, CCI, MFI, BB, ADX) and all 12 practical market filters', () => {
    const bars = makeSyntheticBars(45);
    const ds: UploadedPriceDataset = {
      id: 'ds-ind',
      symbol: 'شتبریز',
      nameFa: 'پالایش نفت تبریز',
      assetType: 'stock',
      segment: 'tse',
      fileName: 'shatabriz.csv',
      sourceName: 'TSETMC',
      currencyUnit: 'rial',
      uploadedAt: Date.now(),
      lastBarDate: '2026-03-10',
      bars,
      validationWarnings: []
    };

    const matrix = buildSixIndicatorMatrix([ds]);
    expect(matrix.map((m) => m.id)).toEqual(['RSI', 'MACD', 'CCI', 'MFI', 'BB', 'ADX']);

    const filters = runTwelvePracticalFilters({
      datasets: [ds],
      liveItems: [
        {
          id: 'live-1',
          symbol: 'شپنا',
          nameFa: 'پالایش نفت اصفهان',
          segment: 'tse',
          sectorFa: 'فرآورده‌های نفتی',
          tradeMode: 'exchange',
          noteFa: '',
          officialUrl: 'https://tsetmc.com',
          live: true,
          openPriceRial: 9800,
          highPriceRial: 10300,
          lowPriceRial: 9700,
          lastPriceRial: 10250,
          closePriceRial: 10150,
          yesterdayPriceRial: 10000,
          changePct: 2.5,
          volume: 25_000_000,
          avgVolume20d: 8_000_000,
          tradeValueBillionToman: 25.5,
          realBuyVolume: 18_000_000,
          realSellVolume: 6_000_000,
          realBuyCount: 60,
          realSellCount: 1500,
          legalBuyVolume: 1_000_000,
          legalSellVolume: 13_000_000
        }
      ]
    });

    expect(filters).toHaveLength(12);
    const suspiciousVol = filters.find((f) => f.id === 'suspicious_volume');
    const smartMoney = filters.find((f) => f.id === 'smart_money_inflow');
    const codeToCode = filters.find((f) => f.id === 'code_to_code_legal_to_real');
    const perCapita250 = filters.find((f) => f.id === 'per_capita_buy_250m');
    expect(suspiciousVol?.hits.some((h) => h.symbol === 'شپنا')).toBe(true);
    expect(smartMoney?.hits.some((h) => h.symbol === 'شپنا')).toBe(true);
    expect(codeToCode?.hits.some((h) => h.symbol === 'شپنا')).toBe(true);
    expect(perCapita250?.hits.some((h) => h.symbol === 'شپنا')).toBe(true);
  });
});

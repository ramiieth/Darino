import { describe, expect, it, vi } from 'vitest';
import { analyzeTradingAgents, sanitizeTradingAgentsResult, tradingAgentsRequestSchema, _resetGeminiDiscovery } from '../../api/_assistant';
import { computeTechnicalSnapshot, type CommitteeMarketInput } from '../../src/features/intel/domain/tradingAgents';

const candles = Array.from({ length: 80 }, (_, i) => ({
  t: Date.parse('2026-09-01T00:00:00Z') + i * 4 * 3_600_000,
  o: 2000 + i * 5,
  h: 2010 + i * 5,
  l: 1990 + i * 5,
  c: 2005 + i * 5
}));

const sampleInput: CommitteeMarketInput = {
  coin: 'ETH',
  analysisDate: '2026-10-25',
  researchDepth: 1,
  technical: computeTechnicalSnapshot(candles, 6)!,
  derivatives: {
    fundingAprNow: 10.5,
    fundingAvg7dApr: 9.2,
    fundingPercentile30d: 50,
    fundingRegime: 'normal',
    openInterestUsd: 800_000_000,
    volume24hUsd: 1_500_000_000,
    maxLeverage: 25,
    worstCrash24hPct: 16,
    safeLeverage7d: 4
  },
  macroRegime: { state: 'on', btcAbove200: true, breadthPct: 60 },
  portfolio: { cashUsd: 5000, maxRiskPct: 1 }
};

describe('tradingAgentsRequestSchema & sanitizeTradingAgentsResult', () => {
  it('ورودی معتبر را می‌پذیرد و خروجی ناقص یا دارای قیمت درصدی را ایمن‌سازی می‌کند', () => {
    const parsed = tradingAgentsRequestSchema.safeParse(sampleInput);
    expect(parsed.success).toBe(true);

    const sanitized = sanitizeTradingAgentsResult(
      {
        analysts: {
          marketReport: '  روند صعودی بالای میانگین ۵۰ دوره‌ای  ',
          sentimentReport: {
            overallBand: 'Bullish',
            overallScore: 14, // باید به ۱۰ محدود شود
            confidence: 'high',
            narrative: 'فاندینگ متعادل است'
          },
          newsMacroReport: 'بیت‌کوین بالای میانگین ۲۰۰ روزه است',
          fundamentalsReport: 'نقدشوندگی عمیق'
        },
        researchDebate: {
          bullHistory: 'استدلال صعودی',
          bearHistory: 'استدلال نزولی',
          researchPlan: {
            recommendation: 'Overweight',
            rationale: 'برتری خریداران',
            strategicActions: 'ورود با استاپ ATR'
          }
        },
        traderProposal: {
          action: 'Buy',
          reasoning: 'حمایت معتبر',
          entryPrice: '$2,400.50',
          stopLoss: '5%', // درصد نباید به عنوان قیمت سطح استاپ پذیرفته شود؛ باید به استاپ ATR برگردد
          takeProfit: 2650,
          positionSizing: '۱۰۰۰ دلار'
        },
        riskDebate: {
          aggressiveArgument: 'فرصت رشد',
          conservativeArgument: 'مراقب نوسان باشید',
          neutralArgument: 'ورود پله‌ای',
          portfolioDecision: {
            rating: 'Overweight',
            executiveSummary: 'افزایش وزن مشروط به حد ضرر',
            investmentThesis: 'ساختار قیمت و رژیم کلان هم‌سو هستند',
            priceTarget: 'N/A', // باید به takeProfit برگردد
            timeHorizon: '۱۴ روز'
          }
        }
      },
      sampleInput
    );

    expect(sanitized.analysts.sentimentReport.overallScore).toBe(10);
    expect(sanitized.traderProposal.entryPrice).toBeCloseTo(2400.5);
    // استاپ 5% رد شده و جایگزین با استاپ ATR شده است
    expect(sanitized.traderProposal.stopLoss).not.toBe(5);
    expect(sanitized.traderProposal.stopLoss).toBeLessThan(sampleInput.technical.close);
    expect(sanitized.riskDebate.portfolioDecision.rating).toBe('Overweight');
    expect(sanitized.riskDebate.portfolioDecision.priceTarget).toBe(2650);
  });

  it('در صورت timeout یک یا همه مدل‌ها، بعد از امتحان مدل‌های جایگزین گزارش کامل ۴ مرحله‌ای را بدون خطا برمی‌گرداند', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GEMINI_MODEL = 'gemini-3.8-flash';
    _resetGeminiDiscovery();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const triedModels: string[] = [];
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => {
      const url = String(u);
      if (/\/models\?/.test(url)) {
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }
      triedModels.push(url.split('/models/')[1].split(':')[0]);
      const e = new Error('The operation was aborted due to timeout');
      e.name = 'TimeoutError';
      throw e;
    });

    try {
      const report = await analyzeTradingAgents(sampleInput);
      // همه مدل‌های زنجیره امتحان شده‌اند
      expect(new Set(triedModels).size).toBe(4);
      // به جای خطای تایم‌اوت، گزارش کامل ۴ مرحله‌ای از موتور کمی بومی برگردانده شده است
      expect(report.analysts.marketReport).toContain('ETH');
      expect(report.researchDebate.bullHistory).toContain('پژوهشگر صعودی');
      expect(report.researchDebate.bearHistory).toContain('پژوهشگر نزولی');
      expect(report.riskDebate.portfolioDecision.executiveSummary).toContain('ETH');
    } finally {
      fetchSpy.mockRestore();
      errSpy.mockRestore();
      vi.useRealTimers();
    }
  }, 20_000);
});

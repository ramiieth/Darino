/**
 * مدل‌های دادهٔ «میز تحلیل و معاملات هوشمند بازار سهام و صندوق‌های ایران» در دارینو
 */
import type { IranFundSubtype, IranMarketSegment } from '@/features/markets/data/iranMarketCatalog';

export type DeskAgentId = 'scanner' | 'fundamental' | 'bull' | 'bear' | 'risk_manager' | 'backtester';

export type DeskAssetType = 'stock' | 'fund_equity' | 'fund_fixed_income' | 'fund_mixed' | 'fund_index' | 'fund_gold' | 'fund_pension' | 'commodity';

export interface DailyPriceBar {
  /** تاریخ میلادی یا شمسی نرمال‌شده (مرتب صعودی) */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** آخرین قیمت معامله (در صورت وجود) */
  last?: number | null;
  volume: number;
  /** ارزش معاملات روز به ریال */
  tradeValueRial: number;
  /** تعداد معاملات */
  tradeCount?: number | null;
  /** حجم یا ارزش خرید حقیقی */
  realBuyVolume?: number | null;
  /** حجم یا ارزش فروش حقیقی */
  realSellVolume?: number | null;
  /** حجم خرید حقوقی */
  legalBuyVolume?: number | null;
  /** حجم فروش حقوقی */
  legalSellVolume?: number | null;
  /** ارزش خالص دارایی (NAV) — اختصاصی صندوق‌ها */
  nav?: number | null;
  /** دامنه نوسان روزانه (درصد، مثلاً 3 یا 5 یا 10) */
  dailyLimitPct?: number | null;
  /** آیا روز صف خرید/فروش بوده؟ */
  queueStatus?: 'buy_queue' | 'sell_queue' | 'normal' | null;
}

export interface UploadedPriceDataset {
  id: string;
  symbol: string;
  nameFa: string;
  assetType: DeskAssetType;
  segment: IranMarketSegment;
  fundSubtype?: IranFundSubtype;
  fileName: string;
  sourceName: string;
  currencyUnit: 'rial' | 'toman';
  uploadedAt: number;
  lastBarDate: string;
  bars: DailyPriceBar[];
  validationWarnings: string[];
}

export interface UploadedCodalDocument {
  id: string;
  symbol: string;
  title: string;
  docType: 'monthly_report' | 'financial_statement' | 'disclosure' | 'fund_report';
  fileName: string;
  reportDate: string;
  uploadedAt: number;
  /** متن استخراج‌شده یا واردشده توسط کاربر (به‌عنوان دادهٔ غیرقابل اجرا تلقی می‌شود) */
  extractedText: string;
  /** شاخص‌های اختیاری استخراج‌شده/تأییدشده توسط کاربر */
  metrics?: {
    sales6mGrowthYoYPct?: number | null;
    grossMarginPct?: number | null;
    netMarginPct?: number | null;
    pe?: number | null;
    sectorAvgPe?: number | null;
    navRial?: number | null;
    marketPriceRial?: number | null;
    aumBillionToman?: number | null;
    expenseRatioPct?: number | null;
    topHoldingsConcentrationPct?: number | null;
    fixedIncomeBankSharePct?: number | null;
    annualizedReturnPct?: number | null;
  };
}

export type SignalStrength = 'weak' | 'medium' | 'strong';

export interface ScannerSignalRow {
  symbol: string;
  nameFa: string;
  assetType: DeskAssetType;
  signalTitleFa: string;
  signalCode: 'real_money_inflow_3d' | 'volume_spike_2x' | 'breakout_20d' | 'codal_material' | 'fund_nav_discount' | 'fund_nav_bubble' | 'fund_liquidity_surge';
  exactValueFa: string;
  strength: SignalStrength;
  sourceName: string;
  dataDate: string;
  formulaFa: string;
}

export interface ScannerResult {
  executedAt: number;
  scannedSymbolsCount: number;
  rows: ScannerSignalRow[];
  emptyMessageFa: string | null;
  missingDataNotes: string[];
}

export interface RiskManagerInput {
  symbol: string;
  assetType: DeskAssetType;
  totalCapitalRial: number;
  maxRiskPct: number; // 1 or 2
  entryPriceRial: number;
  stopLossRial: number;
  targetPriceRial: number;
  avgDailyTradeValueRial: number | null;
  dailyPriceLimitPct: number;
  existingPortfolioExposurePct: number;
  sameSectorExposurePct: number;
  /** آیا دیدگاه بدبین قوی‌تر از خوشبین تشخیص داده شده؟ */
  bearStrongerThanBull?: boolean;
}

export interface RiskManagerResult {
  approved: boolean;
  verdictTitleFa: string;
  verdictBadge: 'approved' | 'rejected';
  allowedRiskRial: number;
  stopDistanceRial: number;
  stopDistancePct: number;
  recommendedShares: number;
  positionValueRial: number;
  portfolioWeightPct: number;
  riskRewardRatio: number;
  avgDailyVolumeSharePct: number | null;
  liquidityWarningFa: string | null;
  dailyLimitWarningFa: string | null;
  concentrationWarningFa: string | null;
  rejectionReasons: string[];
  warnings: string[];
  formulasFa: string[];
}

export type BacktestStrategyId = 'sma_cross' | 'breakout_20d' | 'rsi_rebound' | 'volume_breakout';

export interface BacktestConfig {
  strategyId: BacktestStrategyId;
  initialCapitalRial: number;
  stopLossPct: number;
  takeProfitPct: number | null;
  /** کارمزد رفت و برگشت (درصد؛ مثلاً 1.25 برای سهام یا 0.23 برای صندوق ETF — صریح و بدون اختراع) */
  roundTripCommissionPct: number;
  commissionAssumptionFa: string;
  fastSmaPeriod?: number;
  slowSmaPeriod?: number;
  breakoutLookback?: number;
  rsiBuyLevel?: number;
  rsiSellLevel?: number;
}

export interface BacktestTradeRecord {
  index: number;
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  shares: number;
  exitReasonFa: string;
  grossPnlRial: number;
  commissionRial: number;
  netPnlRial: number;
  netReturnPct: number;
}

export interface BacktestResult {
  executedAt: number;
  symbol: string;
  fileName: string;
  strategyVersion: string;
  config: BacktestConfig;
  barsUsed: number;
  startDate: string;
  endDate: string;
  totalTrades: number;
  statisticallyReliable: boolean;
  reliabilityWarningFa: string | null;
  winRatePct: number;
  avgWinPct: number;
  avgLossPct: number;
  maxDrawdownPct: number;
  totalReturnPct: number;
  buyAndHoldReturnPct: number;
  excessVsBuyHoldPct: number;
  totalCommissionRial: number;
  finalEquityRial: number;
  equityCurve: { date: string; equity: number; buyHoldEquity: number }[];
  trades: BacktestTradeRecord[];
  assumptionsFa: string[];
  disclaimerFa: string;
  pythonCode: string;
}

export interface AgentRunOutput {
  agentId: DeskAgentId;
  symbol: string;
  executedAt: number;
  provider: 'gemini' | 'deterministic';
  sufficientData: boolean;
  summaryFa: string;
  detailsMarkdownFa: string;
  dataSources: string[];
  missingData: string[];
  /** متادیتای اختیاری برای مقایسه خوشبین/بدبین یا اتصال به مدیر ریسک */
  meta?: {
    strengthScore?: number;
    suggestedEntry?: number | null;
    suggestedStop?: number | null;
    suggestedTarget?: number | null;
  };
}

export type FinalDeskVerdict =
  | 'opportunity_to_review'
  | 'needs_more_data'
  | 'high_risk'
  | 'rejected_by_risk_manager'
  | 'insufficient_for_valid_analysis';

export interface IntegratedAnalysisReport {
  id: string;
  symbol: string;
  nameFa: string;
  assetType: DeskAssetType;
  createdAt: number;
  dataSources: string[];
  dataSufficiencyFa: string;
  scannerSignals: ScannerSignalRow[];
  fundamental: AgentRunOutput | null;
  bull: AgentRunOutput | null;
  bear: AgentRunOutput | null;
  bearOutweighsBull: boolean;
  risk: RiskManagerResult | null;
  backtest: BacktestResult | null;
  uncertainties: string[];
  finalVerdict: FinalDeskVerdict;
  finalVerdictLabelFa: string;
  executiveSummaryFa: string;
}

export interface PreTradeChecklistState {
  symbol: string;
  updatedAt: number;
  checks: Record<string, boolean>;
}

export interface IranJournalEntry {
  id: string;
  symbol: string;
  assetType: DeskAssetType;
  date: string;
  entryPriceRial: number;
  exitPriceRial: number | null;
  volume: number;
  entryReasonFa: string;
  fundamentalThesisFa: string;
  bullSummaryFa: string;
  bearSummaryFa: string;
  riskManagerStatus: 'approved' | 'rejected' | 'not_run';
  outcome: 'open' | 'win' | 'loss' | 'breakeven';
  pnlRial: number | null;
  pnlPct: number | null;
  lessonLearnedFa: string;
  personalNotesFa: string;
  checklistPassed: boolean;
  tags: string[];
  createdAt: number;
}

export interface MonthlyJournalReview {
  monthLabel: string;
  totalEntries: number;
  closedEntries: number;
  winRatePct: number | null;
  totalPnlRial: number;
  detectedPatterns: { code: string; severity: 'warn' | 'loss' | 'gain'; titleFa: string; detailFa: string }[];
}

export interface IranDeskPersistedState {
  datasets: UploadedPriceDataset[];
  documents: UploadedCodalDocument[];
  agentRuns: Record<string, Partial<Record<DeskAgentId, AgentRunOutput>>>;
  reports: IntegratedAnalysisReport[];
  backtests: BacktestResult[];
  journal: IranJournalEntry[];
  checklists: Record<string, PreTradeChecklistState>;
}

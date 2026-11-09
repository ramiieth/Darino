/**
 * موتور بومی «کمیته چندایجنتی معامله» (TradingAgents) در دارینو
 *
 * بازنویسی ۱۰۰٪ بومی و بدون وابستگی پایتون از معماری و منطق مخزن TauricResearch/TradingAgents:
 *   ۱) تیم تحلیلگران (۴ نقش موازی):
 *      - تحلیلگر تکنیکال بازار (۱۱ اندیکاتور: SMA50, SMA200, EMA10, MACD, Signal, Hist, RSI14, Boll Mid/Upper/Lower, ATR14, VWMA20)
 *      - تحلیلگر احساسات و ازدحام (SentimentBand شش‌سطحی + نمره ۰ تا ۱۰ + سطح اطمینان low/medium/high)
 *      - تحلیلگر رژیم بازار و اقتصاد کلان (وضعیت BTC نسبت به SMA200، پهنای بازار، فاندینگ ۳۰ روزه)
 *      - تحلیلگر بنیادی و ساختار نقدشوندگی (حجم ۲۴ ساعته، قراردادهای باز OI، نسبت حجم به OI و عمق بازار)
 *   ۲) تیم پژوهشگران (مناظره Bull در برابر Bear + حکم ۵ سطحی مدیر پژوهش ResearchPlan)
 *   ۳) ایجنت معامله‌گر (TraderProposal: جهت Buy/Hold/Sell، نقطه ورود، حد ضرر مبتنی بر ATR و اندازه پوزیشن)
 *   ۴) کمیته مدیریت ریسک (۳ مناظره: تهاجمی، محافظه‌کار، خنثی) + حکم نهایی ۵ سطحی مدیر پرتفولیو (PortfolioDecision)
 *   ۵) حافظه تصمیم‌ها و تسویه خودکار (Memory Log & Point-in-Time Settlement) + گزارش تک‌صفحه‌ای HTML
 *
 * Pure — مشترک بین سرور و کلاینت؛ بدون هیچ فراخوانی شبکه یا اجرای دستور سیستمی.
 */

import type { Candle } from './survival.js';

// ─── ۱) انواع رتبه‌بندی و اسکیمای خروجی (معادل schemas.py و rating.py) ─────────

export const PORTFOLIO_RATINGS = ['Buy', 'Overweight', 'Hold', 'Underweight', 'Sell'] as const;
export type PortfolioRating = (typeof PORTFOLIO_RATINGS)[number];

export const TRADER_ACTIONS = ['Buy', 'Hold', 'Sell'] as const;
export type TraderAction = (typeof TRADER_ACTIONS)[number];

export const SENTIMENT_BANDS = [
  'Bullish',
  'Mildly Bullish',
  'Neutral',
  'Mixed',
  'Mildly Bearish',
  'Bearish'
] as const;
export type SentimentBand = (typeof SENTIMENT_BANDS)[number];

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export const RATING_FA: Record<
  PortfolioRating,
  { label: string; short: string; actionHint: string; tone: 'gain' | 'warn' | 'loss' | 'neutral'; direction: 1 | 0 | -1 }
> = {
  Buy: {
    label: 'ورود صعودی قوی (Buy)',
    short: 'خرید قوی',
    actionHint: 'کفهٔ شواهد صعودی با اختلاف معنادار سنگین‌تر است؛ ورود یا افزایش پوزیشن با رعایت حد ضرر.',
    tone: 'gain',
    direction: 1
  },
  Overweight: {
    label: 'افزایش تدریجی وزن (Overweight)',
    short: 'افزایش وزن',
    actionHint: 'چشم‌انداز مثبت است اما ریسک‌هایی وجود دارد؛ ورود پله‌ای یا با حجم محتاطانه‌تر.',
    tone: 'gain',
    direction: 1
  },
  Hold: {
    label: 'نگه‌داری / صبر (Hold)',
    short: 'نگه‌داری / صبر',
    actionHint: 'شواهد صعودی و نزولی متوازن است یا داده برای ورود جهت‌دار کافی نیست؛ فعلاً بدون اقدام جدید.',
    tone: 'neutral',
    direction: 0
  },
  Underweight: {
    label: 'کاهش وزن و سیو سود (Underweight)',
    short: 'کاهش وزن',
    actionHint: 'ریسک‌های نزولی در حال غلبه هستند؛ کاهش حجم پوزیشن یا تنگ کردن حد ضرر.',
    tone: 'warn',
    direction: -1
  },
  Sell: {
    label: 'خروج / پرهیز از خرید (Sell)',
    short: 'خروج / شورت',
    actionHint: 'کفهٔ استدلال‌های نزولی و ریسک غالب است؛ خروج از پوزیشن لانگ یا بررسی سناریوی نزولی.',
    tone: 'loss',
    direction: -1
  }
};

export const TRADER_ACTION_FA: Record<TraderAction, { label: string; tone: 'gain' | 'neutral' | 'loss' }> = {
  Buy: { label: 'پیشنهاد خرید / لانگ (Buy)', tone: 'gain' },
  Hold: { label: 'پیشنهاد صبر و نگه‌داری (Hold)', tone: 'neutral' },
  Sell: { label: 'پیشنهاد فروش / شورت (Sell)', tone: 'loss' }
};

export const SENTIMENT_BAND_FA: Record<SentimentBand, { label: string; tone: 'gain' | 'warn' | 'loss' | 'neutral' }> = {
  Bullish: { label: 'کاملاً صعودی', tone: 'gain' },
  'Mildly Bullish': { label: 'ملایم صعودی', tone: 'gain' },
  Neutral: { label: 'خنثی', tone: 'neutral' },
  Mixed: { label: 'متناقض (دوگانه)', tone: 'warn' },
  'Mildly Bearish': { label: 'ملایم نزولی', tone: 'warn' },
  Bearish: { label: 'کاملاً نزولی', tone: 'loss' }
};

export const CONFIDENCE_FA: Record<ConfidenceLevel, string> = {
  high: 'بالا (داده کامل)',
  medium: 'متوسط',
  low: 'پایین (داده محدود)'
};

const NULLISH_FLOAT = new Set(['', 'none', 'n/a', 'na', 'null', 'nil', '-', 'tbd', 'unknown', 'نامشخص']);

/**
 * معادل دقیق `_coerce_optional_float` در `tradingagents/agents/schemas.py`:
 * رشتهٔ خالی، درصد («15%»)، بازه («150-160») یا متن مبهم را به `null` تبدیل می‌کند تا
 * یک درصد اشتباهی به عنوان قیمت سطح استاپ تفسیر نشود؛ قیمت فرمت‌شده («$1,234.50») را به عدد تبدیل می‌کند.
 */
export function coerceOptionalFloat(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || NULLISH_FLOAT.has(text.toLowerCase()) || text.endsWith('%') || text.endsWith('٪')) {
    return null;
  }
  const cleaned = text.replace(/,/g, '').replace(/^[$\u20ac\u00a3\u00a5]+/, '').trim();
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const RATING_MAP: Record<string, PortfolioRating> = {
  buy: 'Buy',
  overweight: 'Overweight',
  hold: 'Hold',
  underweight: 'Underweight',
  sell: 'Sell'
};

/**
 * معادل دقیق `parse_rating` در `tradingagents/agents/rating.py`:
 * فقط خطی را می‌خواند که با برچسب صریح `Rating:` یا `Recommendation:` شروع شده باشد تا
 * جمله‌های نقل‌قول‌شده در متن (مثل «Consensus rating: Buy») به اشتباه حکم نهایی نشوند.
 */
export function parseRatingFromText(text: string | null | undefined): PortfolioRating | 'REVIEW' {
  if (!text) return 'REVIEW';
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/rating\s*(scale|options|legend)/i.test(line)) continue;
    const match = /^(?:[-*#>\s]*)\*{0,2}(?:final\s+)?(?:rating|recommendation)\*{0,2}\s*[:\-\u2010-\u2015]\s*\*{0,2}([A-Za-z]+)\*{0,2}/i.exec(line);
    if (match) {
      const normalized = RATING_MAP[match[1].toLowerCase()];
      if (normalized) return normalized;
    }
  }
  return 'REVIEW';
}

// ─── ۲) محاسبه ۱۱ اندیکاتور تکنیکال (معادل market_analyst.py و stockstats) ────

export interface TechnicalSnapshot {
  barsCount: number;
  asOfTimestamp: number;
  close: number;
  high24h: number;
  low24h: number;
  change24hPct: number | null;
  change7dPct: number | null;
  change30dPct: number | null;
  /** Moving Averages */
  close10Ema: number | null;
  close50Sma: number | null;
  close200Sma: number | null;
  /** MACD (12, 26, 9) */
  macd: number | null;
  macds: number | null;
  macdh: number | null;
  /** Momentum: Wilder RSI (14) */
  rsi14: number | null;
  /** Volatility: Bollinger Bands (20, 2) & Wilder ATR (14) */
  bollMid: number | null;
  bollUpper: number | null;
  bollLower: number | null;
  atr14: number | null;
  atrPct: number | null;
  /** Volume/Activity Weighted Moving Average (20) */
  vwma20: number | null;
  /** سطوح حمایت و مقاومت اخیر (۲۰ کندل و ۵۰ کندل) */
  support20: number | null;
  resistance20: number | null;
  support50: number | null;
  resistance50: number | null;
  /** خلاصه وضعیت روند برای تزریق به پرامپت ایجنت‌ها */
  trendRegime: 'bullish' | 'bearish' | 'sideways';
}

function calcSma(values: number[], period: number): number | null {
  if (values.length < period || period <= 0) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

function calcEmaSeries(values: number[], period: number): number[] {
  if (!values.length || period <= 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

function calcWilderRsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calcWilderAtr(candles: Candle[], period = 14): number | null {
  if (candles.length <= period) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].c;
    const tr = Math.max(c.h - c.l, Math.abs(c.h - prevClose), Math.abs(c.l - prevClose));
    trs.push(tr);
  }
  if (trs.length < period) return null;
  let atr = 0;
  for (let i = 0; i < period; i++) atr += trs[i];
  atr /= period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

/**
 * محاسبه Snapshot تأییدشده تکنیکال از روی کندل‌های ۴ ساعته یا روزانه
 * (معادل `get_verified_market_snapshot` و `get_indicators` در `TradingAgents`).
 */
export function computeTechnicalSnapshot(rawCandles: Candle[], barsPerDay = 6): TechnicalSnapshot | null {
  const candles = rawCandles
    .filter((k) => Number.isFinite(k.c) && k.c > 0 && k.h >= k.l && k.l > 0)
    .sort((a, b) => a.t - b.t);
  if (candles.length < 15) return null;

  const closes = candles.map((c) => c.c);
  const last = candles[candles.length - 1];
  const close = last.c;

  const last24 = candles.slice(-Math.max(1, barsPerDay));
  const high24h = Math.max(...last24.map((c) => c.h));
  const low24h = Math.min(...last24.map((c) => c.l));

  const idx24h = candles.length - 1 - barsPerDay;
  const idx7d = candles.length - 1 - 7 * barsPerDay;
  const idx30d = candles.length - 1 - 30 * barsPerDay;

  const change24hPct = idx24h >= 0 && candles[idx24h].c > 0 ? ((close - candles[idx24h].c) / candles[idx24h].c) * 100 : null;
  const change7dPct = idx7d >= 0 && candles[idx7d].c > 0 ? ((close - candles[idx7d].c) / candles[idx7d].c) * 100 : null;
  const change30dPct = idx30d >= 0 && candles[idx30d].c > 0 ? ((close - candles[idx30d].c) / candles[idx30d].c) * 100 : null;

  const ema10Series = calcEmaSeries(closes, 10);
  const close10Ema = ema10Series.length >= 10 ? ema10Series[ema10Series.length - 1] : null;
  const close50Sma = calcSma(closes, 50);
  const close200Sma = calcSma(closes, 200);

  let macd: number | null = null;
  let macds: number | null = null;
  let macdh: number | null = null;
  if (closes.length >= 26) {
    const ema12 = calcEmaSeries(closes, 12);
    const ema26 = calcEmaSeries(closes, 26);
    const macdLine = closes.map((_, i) => ema12[i] - ema26[i]);
    const signalLine = calcEmaSeries(macdLine, 9);
    macd = macdLine[macdLine.length - 1];
    macds = signalLine[signalLine.length - 1];
    macdh = macd - macds;
  }

  const rsi14 = calcWilderRsi(closes, 14);

  let bollMid: number | null = null;
  let bollUpper: number | null = null;
  let bollLower: number | null = null;
  if (closes.length >= 20) {
    bollMid = calcSma(closes, 20)!;
    const slice20 = closes.slice(-20);
    const variance = slice20.reduce((acc, v) => acc + (v - bollMid!) ** 2, 0) / 20;
    const std = Math.sqrt(variance);
    bollUpper = bollMid + 2 * std;
    bollLower = bollMid - 2 * std;
  }

  const atr14 = calcWilderAtr(candles, 14);
  const atrPct = atr14 !== null && close > 0 ? (atr14 / close) * 100 : null;

  // VWMA (20): وزن‌دهی با دامنه نوسان و بدنه کندل به‌عنوان پروکسی فعالیت در کندل‌های بدون حجم، یا حجم واقعی
  let vwma20: number | null = null;
  if (candles.length >= 20) {
    const slice20 = candles.slice(-20);
    let weightedSum = 0;
    let weightTotal = 0;
    for (const bar of slice20) {
      const typical = (bar.h + bar.l + bar.c) / 3;
      const weight = Math.max(bar.h - bar.l, bar.c * 0.0005);
      weightedSum += typical * weight;
      weightTotal += weight;
    }
    vwma20 = weightTotal > 0 ? weightedSum / weightTotal : close;
  }

  const slice20 = candles.slice(-Math.min(20, candles.length));
  const slice50 = candles.slice(-Math.min(50, candles.length));
  const support20 = Math.min(...slice20.map((c) => c.l));
  const resistance20 = Math.max(...slice20.map((c) => c.h));
  const support50 = Math.min(...slice50.map((c) => c.l));
  const resistance50 = Math.max(...slice50.map((c) => c.h));

  let trendRegime: TechnicalSnapshot['trendRegime'] = 'sideways';
  if (close50Sma !== null) {
    const above50 = close > close50Sma * 1.005;
    const below50 = close < close50Sma * 0.995;
    const above200 = close200Sma === null ? above50 : close > close200Sma;
    const below200 = close200Sma === null ? below50 : close < close200Sma;
    if (above50 && above200) trendRegime = 'bullish';
    else if (below50 && below200) trendRegime = 'bearish';
  }

  return {
    barsCount: candles.length,
    asOfTimestamp: last.t,
    close,
    high24h,
    low24h,
    change24hPct,
    change7dPct,
    change30dPct,
    close10Ema,
    close50Sma,
    close200Sma,
    macd,
    macds,
    macdh,
    rsi14,
    bollMid,
    bollUpper,
    bollLower,
    atr14,
    atrPct,
    vwma20,
    support20,
    resistance20,
    support50,
    resistance50,
    trendRegime
  };
}

// ─── ۳) ورودی و خروجی کامل کمیته ایجنت‌ها (۴ مرحله TradingAgents) ─────────────

export interface CommitteeMarketInput {
  coin: string;
  analysisDate: string;
  researchDepth: 1 | 2 | 3;
  technical: TechnicalSnapshot;
  derivatives: {
    fundingAprNow: number | null;
    fundingAvg7dApr: number | null;
    fundingPercentile30d: number | null;
    fundingRegime: string;
    openInterestUsd: number | null;
    volume24hUsd: number | null;
    maxLeverage: number | null;
    worstCrash24hPct: number | null;
    safeLeverage7d: number | null;
  };
  macroRegime?: {
    state: 'on' | 'off' | 'unknown';
    btcAbove200: boolean | null;
    breadthPct: number | null;
  } | null;
  topTradersConsensus?: {
    longUsd: number;
    shortUsd: number;
    tradersCount: number;
  } | null;
  portfolio?: {
    cashUsd: number | null;
    maxRiskPct: number;
    currentHoldingUsd?: number | null;
  } | null;
  pastLessons?: string[];
}

export interface TradingAgentsReport {
  analysts: {
    marketReport: string;
    sentimentReport: {
      overallBand: SentimentBand;
      overallScore: number;
      confidence: ConfidenceLevel;
      narrative: string;
    };
    newsMacroReport: string;
    fundamentalsReport: string;
  };
  researchDebate: {
    bullHistory: string;
    bearHistory: string;
    researchPlan: {
      recommendation: PortfolioRating;
      rationale: string;
      strategicActions: string;
    };
  };
  traderProposal: {
    action: TraderAction;
    reasoning: string;
    entryPrice: number | null;
    stopLoss: number | null;
    takeProfit: number | null;
    positionSizing: string;
  };
  riskDebate: {
    aggressiveArgument: string;
    conservativeArgument: string;
    neutralArgument: string;
    portfolioDecision: {
      rating: PortfolioRating;
      executiveSummary: string;
      investmentThesis: string;
      priceTarget: number | null;
      timeHorizon: string;
    };
  };
}

/**
 * پیش‌خوانش کمی و قاعده‌محور (Deterministic Pre-Read) قبل از فراخوانی LLM یا به عنوان پایهٔ عددی:
 * سطوح ورود و استاپ را دقیقاً بر اساس `ATR` و حمایت/مقاومت اخیر محاسبه می‌کند (منطق `trader.py` #1167).
 */
export function buildDeterministicCommitteeBaseline(input: CommitteeMarketInput): {
  sentimentBand: SentimentBand;
  sentimentScore: number;
  confidence: ConfidenceLevel;
  suggestedAction: TraderAction;
  suggestedRating: PortfolioRating;
  atrStopLong: number | null;
  atrStopShort: number | null;
  atrTargetLong: number | null;
  atrTargetShort: number | null;
  recommendedSizeUsd: number | null;
} {
  const { technical: t, derivatives: d, macroRegime, topTradersConsensus, portfolio } = input;
  let score = 5;

  if (t.close50Sma !== null) score += t.close > t.close50Sma ? 0.9 : -0.9;
  if (t.close200Sma !== null) score += t.close > t.close200Sma ? 1.1 : -1.1;
  if (t.macdh !== null) score += t.macdh > 0 ? 0.6 : -0.6;
  if (t.rsi14 !== null) {
    if (t.rsi14 > 72) score -= 0.5;
    else if (t.rsi14 < 28) score += 0.5;
    else if (t.rsi14 >= 52) score += 0.4;
    else if (t.rsi14 <= 48) score -= 0.4;
  }
  if (macroRegime?.state === 'on') score += 0.8;
  else if (macroRegime?.state === 'off') score -= 0.8;

  if (topTradersConsensus && topTradersConsensus.longUsd + topTradersConsensus.shortUsd > 0) {
    const total = topTradersConsensus.longUsd + topTradersConsensus.shortUsd;
    const longRatio = topTradersConsensus.longUsd / total;
    if (longRatio >= 0.65) score += 0.7;
    else if (longRatio <= 0.35) score -= 0.7;
  }

  if (d.fundingPercentile30d !== null) {
    if (d.fundingPercentile30d >= 92) score -= 0.5; // ازدحام بیش‌ازحد لانگ‌ها
    else if (d.fundingAprNow !== null && d.fundingAprNow < 0 && t.trendRegime === 'bullish') score += 0.5;
  }

  const clampedScore = Math.round(Math.min(10, Math.max(0, score)) * 10) / 10;

  let sentimentBand: SentimentBand = 'Neutral';
  if (clampedScore >= 6.8) sentimentBand = 'Bullish';
  else if (clampedScore >= 5.6) sentimentBand = 'Mildly Bullish';
  else if (clampedScore <= 3.2) sentimentBand = 'Bearish';
  else if (clampedScore <= 4.4) sentimentBand = 'Mildly Bearish';
  else if (t.trendRegime !== 'sideways' && macroRegime?.state === 'off') sentimentBand = 'Mixed';

  const hasFullData = t.barsCount >= 200 && d.fundingPercentile30d !== null && d.openInterestUsd !== null;
  const confidence: ConfidenceLevel = hasFullData ? 'high' : t.barsCount >= 50 ? 'medium' : 'low';

  let suggestedRating: PortfolioRating = 'Hold';
  let suggestedAction: TraderAction = 'Hold';
  if (clampedScore >= 7.2) {
    suggestedRating = 'Buy';
    suggestedAction = 'Buy';
  } else if (clampedScore >= 5.8) {
    suggestedRating = 'Overweight';
    suggestedAction = 'Buy';
  } else if (clampedScore <= 2.8) {
    suggestedRating = 'Sell';
    suggestedAction = 'Sell';
  } else if (clampedScore <= 4.2) {
    suggestedRating = 'Underweight';
    suggestedAction = 'Sell';
  }

  const atr = t.atr14 ?? t.close * 0.025;
  const atrStopLong = Math.max(0, Number((t.close - 2 * atr).toPrecision(6)));
  const atrStopShort = Number((t.close + 2 * atr).toPrecision(6));
  const atrTargetLong = Number((t.close + 3.5 * atr).toPrecision(6));
  const atrTargetShort = Math.max(0, Number((t.close - 3.5 * atr).toPrecision(6)));

  let recommendedSizeUsd: number | null = null;
  if (portfolio?.cashUsd && portfolio.cashUsd > 0 && portfolio.maxRiskPct > 0) {
    const riskDollars = (portfolio.cashUsd * portfolio.maxRiskPct) / 100;
    const stopDistanceRatio = Math.max(0.01, (2 * atr) / t.close);
    recommendedSizeUsd = Math.min(portfolio.cashUsd, Math.round(riskDollars / stopDistanceRatio));
  }

  return {
    sentimentBand,
    sentimentScore: clampedScore,
    confidence,
    suggestedAction,
    suggestedRating,
    atrStopLong,
    atrStopShort,
    atrTargetLong,
    atrTargetShort,
    recommendedSizeUsd
  };
}

// ─── ۴) حافظه تصمیم‌ها و تسویه خودکار (معادل tradingagents/memory/log.py و settlement.py) ─

export interface TradingMemoryEntry {
  id: string;
  coin: string;
  analysisDate: string;
  createdAt: number;
  rating: PortfolioRating;
  traderAction: TraderAction;
  entryPrice: number;
  stopLoss: number | null;
  priceTarget: number | null;
  holdingPeriodDays: number;
  executiveSummary: string;
  /** فیلدهای تسویه (Settlement) که در اجراهای بعدی با قیمت روز پر می‌شوند */
  settledAt: number | null;
  settledPrice: number | null;
  realizedReturnPct: number | null;
  lesson: string | null;
}

const DAY_MS = 86_400_000;

/**
 * تسویه خودکار تصمیم‌های قبلی از روی قیمت فعلی بازار (معادل `settle_pending` در `settlement.py`):
 * بازده واقعی را در جهت حکم (`Buy/Overweight` = +1، `Sell/Underweight` = -1، `Hold` = 0) می‌سنجد
 * و یک درس یک‌خطی برای تزریق به مدیر پرتفولیو تولید می‌کند.
 */
export function settleMemoryEntries(
  entries: TradingMemoryEntry[],
  livePrices: Record<string, number>,
  now = Date.now()
): { updated: TradingMemoryEntry[]; newlySettledCount: number } {
  let newlySettledCount = 0;
  const updated = entries.map((entry) => {
    const currentPx = livePrices[entry.coin];
    if (!currentPx || !(currentPx > 0) || !(entry.entryPrice > 0)) return entry;
    const elapsedDays = (now - entry.createdAt) / DAY_MS;
    const due = elapsedDays >= entry.holdingPeriodDays;
    if (entry.settledAt !== null && !due) return entry;

    const rawReturnPct = ((currentPx - entry.entryPrice) / entry.entryPrice) * 100;
    const dir = RATING_FA[entry.rating].direction;
    const directionalEdgePct = dir === 0 ? -Math.abs(rawReturnPct) * 0.25 : rawReturnPct * dir;
    const roundedRaw = Math.round(rawReturnPct * 100) / 100;

    let outcomeLabel = 'خنثی';
    if (dir !== 0) {
      outcomeLabel = directionalEdgePct >= 1 ? 'موفق و هم‌جهت با بازار' : directionalEdgePct <= -1 ? 'خلاف جهت حرکت بازار' : 'بدون حرکت معنادار';
    } else {
      outcomeLabel = Math.abs(rawReturnPct) <= 4 ? 'صبر درست در بازار کم‌دامنه' : 'جا ماندن از حرکت بزرگ قیمت';
    }

    const lesson = `تصمیم ${entry.rating} روی ${entry.coin} در تاریخ ${entry.analysisDate} (ورود ${entry.entryPrice}): تغییر قیمت ${roundedRaw >= 0 ? '+' : ''}${roundedRaw}% (${outcomeLabel}).`;

    if (due && entry.settledAt === null) {
      newlySettledCount++;
      return {
        ...entry,
        settledAt: now,
        settledPrice: currentPx,
        realizedReturnPct: roundedRaw,
        lesson
      };
    }

    return {
      ...entry,
      settledPrice: currentPx,
      realizedReturnPct: roundedRaw,
      lesson
    };
  });

  return { updated, newlySettledCount };
}

/**
 * استخراج درس‌های قبلی برای همان نماد و سایر نمادها جهت تزریق به پرامپت مدیر پرتفولیو
 * (معادل `past_context` در `portfolio_manager.py`).
 */
export function buildPastLessonsContext(entries: TradingMemoryEntry[], coin: string, maxItems = 5): string[] {
  const withLessons = entries.filter((e) => e.lesson && e.realizedReturnPct !== null);
  const sameCoin = withLessons.filter((e) => e.coin === coin).slice(0, 3);
  const otherCoins = withLessons.filter((e) => e.coin !== coin).slice(0, Math.max(0, maxItems - sameCoin.length));
  return [...sameCoin, ...otherCoins].map((e) => e.lesson!);
}

// ─── ۵) خروجی گزارش تک‌صفحه‌ای HTML (معادل tradingagents/report_html.py) ────────

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * تولید فایل HTML خودکفا و آفلاین از گزارش کامل کمیته ایجنت‌ها
 * (معادل `complete_report.html` در نسخه v0.6.0 مخزن `TradingAgents` — بدون هیچ اسکریپت یا منبع خارجی).
 */
export function renderCompleteReportHtml(
  input: CommitteeMarketInput,
  report: TradingAgentsReport
): string {
  const pm = report.riskDebate.portfolioDecision;
  const ratingMeta = RATING_FA[pm.rating];
  const tp = report.traderProposal;
  const rp = report.researchDebate.researchPlan;
  const sr = report.analysts.sentimentReport;

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>گزارش کمیته ایجنت‌های دارینو — ${escapeHtml(input.coin)} (${escapeHtml(input.analysisDate)})</title>
<style>
  :root { color-scheme: light dark; --bg: #0f172a; --card: #1e293b; --ink: #f8fafc; --muted: #94a3b8; --accent: #14b8a6; --border: #334155; }
  @media (prefers-color-scheme: light) { :root { --bg: #f8fafc; --card: #ffffff; --ink: #0f172a; --muted: #475569; --accent: #0f766e; --border: #e2e8f0; } }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--ink); line-height: 1.8; padding: 24px; }
  .container { max-width: 960px; margin: 0 auto; }
  header, section { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 20px 24px; margin-bottom: 18px; }
  h1, h2, h3 { margin-top: 0; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; background: rgba(20,184,166,0.15); color: var(--accent); font-weight: 700; font-size: 14px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 12px; }
  .stat { padding: 12px; border-radius: 12px; border: 1px solid var(--border); }
  .stat-label { font-size: 12px; color: var(--muted); }
  .stat-value { font-size: 16px; font-weight: 700; margin-top: 4px; }
  p { white-space: pre-wrap; margin: 8px 0; }
  footer { font-size: 12px; color: var(--muted); text-align: center; margin-top: 24px; }
</style>
</head>
<body>
<div class="container">
  <header>
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
      <h1>گزارش کمیته ایجنت‌ها (TradingAgents) — <span dir="ltr">${escapeHtml(input.coin)}</span></h1>
      <span class="badge">${escapeHtml(ratingMeta.label)}</span>
    </div>
    <p style="color:var(--muted);font-size:13px;">تاریخ تحلیل: ${escapeHtml(input.analysisDate)} · قیمت مرجع: <span dir="ltr">${input.technical.close}</span> دلار · عمق مناظره: ${input.researchDepth} دور</p>
    <div class="grid">
      <div class="stat"><div class="stat-label">حکم نهایی مدیر پرتفولیو</div><div class="stat-value">${escapeHtml(ratingMeta.short)} (${escapeHtml(pm.rating)})</div></div>
      <div class="stat"><div class="stat-label">پیشنهاد ایجنت معامله‌گر</div><div class="stat-value">${escapeHtml(TRADER_ACTION_FA[tp.action].label)}</div></div>
      <div class="stat"><div class="stat-label">نقطه ورود / حد ضرر</div><div class="stat-value" dir="ltr">${tp.entryPrice ?? '—'} / ${tp.stopLoss ?? '—'}</div></div>
      <div class="stat"><div class="stat-label">هدف قیمتی / افق زمانی</div><div class="stat-value">${pm.priceTarget ?? '—'} · ${escapeHtml(pm.timeHorizon)}</div></div>
    </div>
  </header>

  <section>
    <h2>۱. حکم نهایی مدیر پرتفولیو (Portfolio Manager)</h2>
    <p><strong>خلاصه مدیریتی:</strong> ${escapeHtml(pm.executiveSummary)}</p>
    <p><strong>تز سرمایه‌گذاری:</strong> ${escapeHtml(pm.investmentThesis)}</p>
  </section>

  <section>
    <h2>۲. پیشنهاد ایجنت معامله‌گر (Trader Agent)</h2>
    <p><strong>استدلال معامله‌گر:</strong> ${escapeHtml(tp.reasoning)}</p>
    <p><strong>اندازه پوزیشن پیشنهادی:</strong> ${escapeHtml(tp.positionSizing)}</p>
  </section>

  <section>
    <h2>۳. مناظره تیم پژوهشگران (Bull vs. Bear) و حکم مدیر پژوهش</h2>
    <h3>پژوهشگر صعودی (Bull Researcher)</h3>
    <p>${escapeHtml(report.researchDebate.bullHistory)}</p>
    <h3>پژوهشگر نزولی (Bear Researcher)</h3>
    <p>${escapeHtml(report.researchDebate.bearHistory)}</p>
    <h3>جمع‌بندی مدیر پژوهش (${escapeHtml(rp.recommendation)})</h3>
    <p>${escapeHtml(rp.rationale)}</p>
    <p><strong>گام‌های راهبردی:</strong> ${escapeHtml(rp.strategicActions)}</p>
  </section>

  <section>
    <h2>۴. مناظره کمیته مدیریت ریسک (۳ دیدگاه)</h2>
    <h3>تحلیلگر ریسک تهاجمی (Aggressive)</h3>
    <p>${escapeHtml(report.riskDebate.aggressiveArgument)}</p>
    <h3>تحلیلگر ریسک محافظه‌کار (Conservative)</h3>
    <p>${escapeHtml(report.riskDebate.conservativeArgument)}</p>
    <h3>تحلیلگر ریسک خنثی و متوازن (Neutral)</h3>
    <p>${escapeHtml(report.riskDebate.neutralArgument)}</p>
  </section>

  <section>
    <h2>۵. گزارش‌های ۴ تحلیلگر تخصصی (Analyst Team)</h2>
    <h3>تحلیلگر تکنیکال بازار (۱۱ اندیکاتور)</h3>
    <p>${escapeHtml(report.analysts.marketReport)}</p>
    <h3>تحلیلگر احساسات و ازدحام (${escapeHtml(SENTIMENT_BAND_FA[sr.overallBand].label)} — نمره ${sr.overallScore}/10)</h3>
    <p>${escapeHtml(sr.narrative)}</p>
    <h3>تحلیلگر رژیم بازار و اقتصاد کلان</h3>
    <p>${escapeHtml(report.analysts.newsMacroReport)}</p>
    <h3>تحلیلگر بنیادی و ساختار نقدشوندگی</h3>
    <p>${escapeHtml(report.analysts.fundamentalsReport)}</p>
  </section>

  <footer>
    این گزارش پژوهشی و آموزشی توسط معماری چندایجنتی TradingAgents در وب‌اپلیکیشن دارینو تولید شده است و توصیه مالی یا سیگنال قطعی خرید و فروش نیست.
  </footer>
</div>
</body>
</html>`;
}

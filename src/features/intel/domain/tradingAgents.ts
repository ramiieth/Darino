/**
 * موتور بومی «کمیته چندایجنتی معامله» (TradingAgents) در دارینو
 *
 * بازنویسی ۱۰۰٪ بومی و بدون وابستگی پایتون از معماری و منطق مخزن TauricResearch/TradingAgents:
 *   ۱) تیم تحلیلگران (۴ نقش موازی):
 *      - تحلیلگر تکنیکال بازار (۱۱ اندیکاتور: SMA50, SMA200, EMA10, MACD, Signal, Hist, RSI14, Boll Mid/Upper/Lower, ATR14, VWMA20)
 *      - تحلیلگر احساسات و ازدحام (SentimentBand شش‌سطحی + نمره ۰ تا ۱۰ + سطح اطمینان low/medium/high)
 *      - تحلیلگر رژیم بازار و اقتصاد کلان (وضعیت BTC نسبت به SMA200، پهنای بازار، فاندینگ ۳۰ روزه)
 *      - تحلیلگر بنیادی و ساختار نقدشوندگی (حجم ۲۴ ساعته، قراردادهای باز OI، نسبت حجم به OI و عمق بازار)
 *   ۲) تیم پژوهشگران (مناظره چنددوری Bull در برابر Bear + حکم ۵ سطحی مدیر پژوهش ResearchPlan)
 *   ۳) ایجنت معامله‌گر (TraderProposal: جهت Buy/Hold/Sell، نقطه ورود، حد ضرر مبتنی بر ATR و اندازه پوزیشن)
 *   ۴) کمیته مدیریت ریسک (۳ مناظره: تهاجمی، محافظه‌کار، خنثی) + حکم نهایی ۵ سطحی مدیر پرتفولیو (PortfolioDecision)
 *   ۵) حافظه تصمیم‌ها با الگوریتم BM25 و تسویه خودکار (Memory Log & Point-in-Time Settlement) + گزارش تک‌صفحه‌ای HTML
 *   ۶) کاتالوگ چنددارایی (رمزارز، طلا و نفت و کالا، سهام و شاخص، فارکس) با هویت بصری و لوگوی رنگی
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
    label: 'پیشنهاد خرید قوی',
    short: 'خرید قوی',
    actionHint: 'بیشتر نشانه‌ها به نفع رشد قیمت است؛ می‌توان با رعایت حد ضرر وارد شد.',
    tone: 'gain',
    direction: 1
  },
  Overweight: {
    label: 'خرید پله‌ای و تدریجی',
    short: 'خرید پله‌ای',
    actionHint: 'چشم‌انداز کلی مثبت است اما کمی ریسک وجود دارد؛ بهتر است کم‌کم و پله‌ای وارد شوید.',
    tone: 'gain',
    direction: 1
  },
  Hold: {
    label: 'صبر و نگه‌داری',
    short: 'صبر و نگه‌داری',
    actionHint: 'نشانه‌های مثبت و منفی تقریباً برابرند؛ فعلاً بهتر است دست نگه دارید و عجله نکنید.',
    tone: 'neutral',
    direction: 0
  },
  Underweight: {
    label: 'کاهش حجم و سیو سود',
    short: 'کاهش حجم',
    actionHint: 'ریسک افت قیمت بیشتر شده است؛ بهتر است بخشی از سود را ذخیره کنید یا حد ضرر را نزدیک‌تر بگذارید.',
    tone: 'warn',
    direction: -1
  },
  Sell: {
    label: 'پرهیز از خرید / خروج',
    short: 'خروج / فروش',
    actionHint: 'نشانه‌های ریزش و ریسک غالب است؛ بهتر است وارد خرید نشوید یا از معامله خارج شوید.',
    tone: 'loss',
    direction: -1
  }
};

export const TRADER_ACTION_FA: Record<TraderAction, { label: string; short: string; tone: 'gain' | 'neutral' | 'loss' }> = {
  Buy: { label: 'پیشنهاد خرید', short: 'خرید', tone: 'gain' },
  Hold: { label: 'پیشنهاد صبر و دست‌نگه‌داشتن', short: 'صبر', tone: 'neutral' },
  Sell: { label: 'پیشنهاد فروش یا پرهیز از خرید', short: 'فروش / خروج', tone: 'loss' }
};

export const SENTIMENT_BAND_FA: Record<SentimentBand, { label: string; tone: 'gain' | 'warn' | 'loss' | 'neutral' }> = {
  Bullish: { label: 'بسیار مثبت و صعودی', tone: 'gain' },
  'Mildly Bullish': { label: 'متمایل به رشد', tone: 'gain' },
  Neutral: { label: 'خنثی و متعادل', tone: 'neutral' },
  Mixed: { label: 'دوپهلو و نامطمئن', tone: 'warn' },
  'Mildly Bearish': { label: 'متمایل به افت', tone: 'warn' },
  Bearish: { label: 'منفی و نزولی', tone: 'loss' }
};

export const CONFIDENCE_FA: Record<ConfidenceLevel, string> = {
  high: 'دادهٔ کامل',
  medium: 'دادهٔ متوسط',
  low: 'دادهٔ محدود'
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

export interface IndicatorDiagnosticRow {
  key: string;
  nameFa: string;
  code: string;
  category: 'روند' | 'مومنتوم' | 'نوسان' | 'حجم و ساختار';
  value: number | null;
  signal: 'bullish' | 'bearish' | 'neutral';
  signalFa: string;
  noteFa: string;
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

/**
 * تولید ردیف‌های تفکیکی ۱۱ اندیکاتور تکنیکال `TradingAgents` همراه با سیگنال و تفسیر فارسی
 * برای نمایش در جدول تکنیکال وب و شیت موبایل/PWA.
 */
export function buildIndicatorDiagnostics(t: TechnicalSnapshot): IndicatorDiagnosticRow[] {
  const c = t.close;
  const ema10Sig = t.close10Ema === null ? 'neutral' : c > t.close10Ema ? 'bullish' : 'bearish';
  const sma50Sig = t.close50Sma === null ? 'neutral' : c > t.close50Sma ? 'bullish' : 'bearish';
  const sma200Sig = t.close200Sma === null ? 'neutral' : c > t.close200Sma ? 'bullish' : 'bearish';
  const macdSig = t.macd === null || t.macds === null ? 'neutral' : t.macd > t.macds ? 'bullish' : 'bearish';
  const macdhSig = t.macdh === null ? 'neutral' : t.macdh > 0 ? 'bullish' : 'bearish';
  const rsiSig =
    t.rsi14 === null
      ? 'neutral'
      : t.rsi14 >= 70
        ? 'bearish'
        : t.rsi14 <= 30
          ? 'bullish'
          : t.rsi14 >= 53
            ? 'bullish'
            : t.rsi14 <= 47
              ? 'bearish'
              : 'neutral';
  const bollPos =
    t.bollUpper !== null && t.bollLower !== null && t.bollMid !== null
      ? c >= t.bollUpper
        ? 'سقف باند (اشباع خرید)'
        : c <= t.bollLower
          ? 'کف باند (اشباع فروش)'
          : c >= t.bollMid
            ? 'نیمه بالایی باند'
            : 'نیمه پایینی باند'
      : '—';
  const vwmaSig = t.vwma20 === null ? 'neutral' : c >= t.vwma20 ? 'bullish' : 'bearish';

  return [
    {
      key: 'close_10_ema',
      nameFa: 'میانگین قیمت کوتاه‌مدت (۱۰ دوره)',
      code: '10 EMA',
      category: 'روند',
      value: t.close10Ema,
      signal: ema10Sig,
      signalFa: ema10Sig === 'bullish' ? 'بالای میانگین' : ema10Sig === 'bearish' ? 'زیر میانگین' : 'متعادل',
      noteFa: 'جهت حرکت قیمت در چند روز اخیر'
    },
    {
      key: 'close_50_sma',
      nameFa: 'میانگین قیمت میان‌مدت (۵۰ دوره)',
      code: '50 SMA',
      category: 'روند',
      value: t.close50Sma,
      signal: sma50Sig,
      signalFa: sma50Sig === 'bullish' ? 'روند میان‌مدت مثبت' : sma50Sig === 'bearish' ? 'روند میان‌مدت منفی' : 'متعادل',
      noteFa: 'نشان می‌دهد روند چند هفتهٔ اخیر صعودی است یا نزولی'
    },
    {
      key: 'close_200_sma',
      nameFa: 'میانگین قیمت بلندمدت (۲۰۰ دوره)',
      code: '200 SMA',
      category: 'روند',
      value: t.close200Sma,
      signal: sma200Sig,
      signalFa: sma200Sig === 'bullish' ? 'بالای روند بلندمدت' : sma200Sig === 'bearish' ? 'زیر روند بلندمدت' : 'داده ناکافی',
      noteFa: 'معیار اصلی برای تشخیص بازار صعودی یا نزولی در بلندمدت'
    },
    {
      key: 'macd',
      nameFa: 'شاخص شتاب حرکت',
      code: 'MACD',
      category: 'مومنتوم',
      value: t.macd,
      signal: macdSig,
      signalFa: macdSig === 'bullish' ? 'شتاب صعودی' : macdSig === 'bearish' ? 'شتاب نزولی' : 'متعادل',
      noteFa: 'سنجش سرعت و جهت تغییر قیمت در کوتاه‌مدت نسبت به میان‌مدت'
    },
    {
      key: 'macds',
      nameFa: 'خط تعادل شتاب',
      code: 'MACD Signal',
      category: 'مومنتوم',
      value: t.macds,
      signal: macdSig,
      signalFa: macdSig === 'bullish' ? 'چرخش رو به بالا' : macdSig === 'bearish' ? 'چرخش رو به پایین' : 'متعادل',
      noteFa: 'به تشخیص زودهنگام تغییر مسیر قیمت کمک می‌کند'
    },
    {
      key: 'macdh',
      nameFa: 'قدرت شتاب فعلی',
      code: 'MACD Hist',
      category: 'مومنتوم',
      value: t.macdh,
      signal: macdhSig,
      signalFa: macdhSig === 'bullish' ? 'شتاب مثبت' : macdhSig === 'bearish' ? 'شتاب منفی' : 'متعادل',
      noteFa: 'نشان می‌دهد شتاب خرید یا فروش در حال قوی‌تر شدن است یا ضعیف‌تر'
    },
    {
      key: 'rsi',
      nameFa: 'قدرت خریداران در برابر فروشندگان',
      code: 'RSI 14',
      category: 'مومنتوم',
      value: t.rsi14,
      signal: rsiSig,
      signalFa:
        t.rsi14 === null
          ? '—'
          : t.rsi14 >= 70
            ? 'داغ و پرخرید (احتمال اصلاح)'
            : t.rsi14 <= 30
              ? 'ارزان و پرفروش (احتمال بازگشت)'
              : t.rsi14 >= 53
                ? 'برتری خریداران'
                : t.rsi14 <= 47
                  ? 'برتری فروشندگان'
                  : 'تعادل کامل',
      noteFa: 'عدد بالای ۷۰ یعنی بازار داغ شده و زیر ۳۰ یعنی بیش‌ازحد افت کرده است'
    },
    {
      key: 'boll',
      nameFa: 'محدودهٔ تعادل قیمت',
      code: 'Boll Mid',
      category: 'نوسان',
      value: t.bollMid,
      signal: t.bollMid === null ? 'neutral' : c >= t.bollMid ? 'bullish' : 'bearish',
      signalFa: bollPos,
      noteFa: 'قیمت میانی در نوسان‌های اخیر بازار'
    },
    {
      key: 'boll_ub',
      nameFa: 'سقف محدودهٔ نوسان',
      code: 'Boll Upper',
      category: 'نوسان',
      value: t.bollUpper,
      signal: t.bollUpper !== null && c >= t.bollUpper ? 'bearish' : 'neutral',
      signalFa: t.bollUpper !== null && c >= t.bollUpper ? 'نزدیک سقف نوسان' : 'مرز بالایی قیمت',
      noteFa: 'محدوده‌ای که معمولاً فروشندگان در آن فعال‌تر می‌شوند'
    },
    {
      key: 'boll_lb',
      nameFa: 'کف محدودهٔ نوسان',
      code: 'Boll Lower',
      category: 'نوسان',
      value: t.bollLower,
      signal: t.bollLower !== null && c <= t.bollLower ? 'bullish' : 'neutral',
      signalFa: t.bollLower !== null && c <= t.bollLower ? 'نزدیک کف نوسان' : 'مرز پایینی قیمت',
      noteFa: 'محدوده‌ای که معمولاً خریداران در آن وارد می‌شوند'
    },
    {
      key: 'atr',
      nameFa: 'میزان نوسان معمول قیمت',
      code: 'ATR 14',
      category: 'نوسان',
      value: t.atr14,
      signal: 'neutral',
      signalFa: t.atrPct !== null ? `${t.atrPct.toFixed(2)}% قیمت` : '—',
      noteFa: 'برای محاسبهٔ فاصلهٔ امن حد ضرر و مبلغ مناسب ورود به کار می‌رود'
    },
    {
      key: 'vwma',
      nameFa: 'میانگین قیمت بر اساس حجم معاملات',
      code: 'VWMA 20',
      category: 'حجم و ساختار',
      value: t.vwma20,
      signal: vwmaSig,
      signalFa: vwmaSig === 'bullish' ? 'پشتیبانی خریداران' : vwmaSig === 'bearish' ? 'فشار فروشندگان' : 'متعادل',
      noteFa: 'بررسی می‌کند آیا حرکت قیمت با حجم معاملات واقعی همراه بوده یا نه'
    }
  ];
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
 * محاسبه نسبت ریسک به ریوارد (R:R) و درصد فاصله استاپ و هدف از نقطه ورود
 */
export function computeTradeGeometry(
  entry: number | null,
  stop: number | null,
  target: number | null
): {
  stopDistancePct: number | null;
  targetDistancePct: number | null;
  riskRewardRatio: number | null;
} {
  if (!entry || !(entry > 0)) return { stopDistancePct: null, targetDistancePct: null, riskRewardRatio: null };
  const riskAbs = stop && stop > 0 ? Math.abs(entry - stop) : null;
  const rewardAbs = target && target > 0 ? Math.abs(target - entry) : null;
  const stopDistancePct = riskAbs !== null ? (riskAbs / entry) * 100 : null;
  const targetDistancePct = rewardAbs !== null ? (rewardAbs / entry) * 100 : null;
  const riskRewardRatio =
    riskAbs !== null && riskAbs > 0 && rewardAbs !== null && rewardAbs > 0
      ? Math.round((rewardAbs / riskAbs) * 100) / 100
      : null;
  return { stopDistancePct, targetDistancePct, riskRewardRatio };
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

/**
 * تولید گزارش کامل و ۴ مرحله‌ای کمیته ایجنت‌ها به‌صورت کاملاً کمی و قاعده‌محور (Deterministic Multi-Agent Engine):
 * زمانی که همهٔ مدل‌های زبانی در زنجیرهٔ پشتیبان با خطای زمان یا شلوغی مواجه شوند، این موتور بومی
 * تمام ۴ مرحله (۴ تحلیلگر، مناظره Bull/Bear و مدیر پژوهش، معامله‌گر ATR و کمیته ۳ نفره ریسک + مدیر پرتفولیو)
 * را مستقیماً از روی ۱۱ اندیکاتور، فاندینگ، عمق بازار و رژیم کلان می‌سازد تا کاربر هرگز با خطای تایم‌اوت متوقف نشود.
 */
export function buildDeterministicTradingAgentsReport(input: CommitteeMarketInput): TradingAgentsReport {
  const base = buildDeterministicCommitteeBaseline(input);
  const { technical: t, derivatives: d, macroRegime, topTradersConsensus, portfolio, pastLessons } = input;
  const rows = buildIndicatorDiagnostics(t);
  const bullRows = rows.filter((r) => r.signal === 'bullish');
  const bearRows = rows.filter((r) => r.signal === 'bearish');

  const fmt = (n: number | null | undefined, digits = 2) =>
    n === null || n === undefined || !Number.isFinite(n)
      ? 'نامشخص'
      : n.toLocaleString('en-US', { maximumFractionDigits: digits });

  const assetName = getMarketVisualMeta(input.coin).nameFa;
  const trendText =
    t.trendRegime === 'bullish'
      ? 'صعودی (بالای میانگین‌های میان‌مدت و بلندمدت)'
      : t.trendRegime === 'bearish'
        ? 'نزولی (پایین‌تر از میانگین‌های میان‌مدت و بلندمدت)'
        : 'درجا و بدون جهت مشخص';

  const marketReport = [
    `بررسی تاریخچهٔ اخیر نشان می‌دهد ${assetName} در قیمت ${fmt(t.close, 4)} دلار در روند ${trendText} قرار دارد و از میان ۱۱ شاخص بازار، ${bullRows.length} نشانه مثبت و ${bearRows.length} نشانه منفی دیده می‌شود.`,
    `میانگین قیمت میان‌مدت حدود ${fmt(t.close50Sma, 4)} دلار و شاخص قدرت خریداران روی عدد ${fmt(t.rsi14, 1)} از ۱۰۰ قرار دارد.`,
    `نوسان معمول قیمت حدود ${fmt(t.atrPct, 2)}٪ است و محدودهٔ کف و سقف اخیر بین ${fmt(t.support20, 4)} تا ${fmt(t.resistance20, 4)} دلار قرار گرفته است.`
  ].join(' ');

  const fundingText =
    d.fundingAprNow !== null
      ? `هزینهٔ نگه‌داری معاملات در بازار حدود ${fmt(d.fundingAprNow, 1)}٪ سالانه است که نشان می‌دهد هیجان خریداران در چه سطحی قرار دارد`
      : 'اطلاعات لحظه‌ای هیجان معاملات محدود است';
  const tradersText =
    topTradersConsensus && topTradersConsensus.longUsd + topTradersConsensus.shortUsd > 0
      ? ` و در میان ${topTradersConsensus.tradersCount} معامله‌گر برتر، حجم معاملات خرید ${fmt(topTradersConsensus.longUsd, 0)} دلار در برابر فروش ${fmt(topTradersConsensus.shortUsd, 0)} دلار بوده است.`
      : '.';

  const sentimentNarrative = `${fundingText}${tradersText} در مجموع امتیاز وضعیت فعلی ${base.sentimentScore} از ۱۰ (${SENTIMENT_BAND_FA[base.sentimentBand].label}) ارزیابی می‌شود.`;

  const macroStateFa =
    macroRegime?.state === 'on'
      ? 'مثبت و پرانرژی'
      : macroRegime?.state === 'off'
        ? 'محتاطانه و کم‌ریسک'
        : 'متعادل';
  const newsMacroReport = `فضای کلی بازارها در وضعیت ${macroStateFa} قرار دارد${macroRegime?.btcAbove200 !== null && macroRegime?.btcAbove200 !== undefined ? ` (بیت‌کوین ${macroRegime.btcAbove200 ? 'بالای' : 'پایین‌تر از'} میانگین بلندمدت خود است)` : ''}${macroRegime?.breadthPct !== null && macroRegime?.breadthPct !== undefined ? ` و حدود ${fmt(macroRegime.breadthPct, 0)}٪ از بازار در وضعیت مثبت هستند` : ''}. در چنین فضایی ${base.suggestedAction === 'Buy' ? 'ورود پله‌ای در افت‌های کوتاه‌مدت منطقی‌تر است' : base.suggestedAction === 'Sell' ? 'حفظ احتیاط و پرهیز از ریسک بالا اولویت دارد' : 'صبر کردن تا مشخص شدن جهت اصلی بازار تصمیم عاقلانه‌تری است'}.`;

  const fundamentalsReport = `حجم معاملات ۲۴ ساعته حدود ${fmt(d.volume24hUsd, 0)} دلار و مجموع معاملات باز در بازار ${fmt(d.openInterestUsd, 0)} دلار است که نشان‌دهندهٔ نقدشوندگی این بازار است. سقف اهرم امن برای حفظ سرمایه در نوسان‌های یک هفتهٔ اخیر ${d.safeLeverage7d ? `حداکثر ${d.safeLeverage7d} برابر` : 'بدون اهرم'} برآورد می‌شود.`;

  const bullHistory = [
    `کف‌های قیمتی اخیر در محدودهٔ ${fmt(t.support20, 4)} و ${fmt(t.support50, 4)} دلار همراه با ${bullRows.length} نشانهٔ مثبت در نمودار، نشان می‌دهد بازار توان حرکت به سمت محدودهٔ ${fmt(base.atrTargetLong, 4)} دلار را دارد.`,
    t.change24hPct !== null && t.change24hPct < 0
      ? `افت کوتاه‌مدت اخیر (${fmt(t.change24hPct, 2)}٪ در شبانه‌روز گذشته) قیمت را به محدودهٔ جذاب‌تری برای خرید نزدیک کرده است.`
      : `ماندن قیمت بالاتر از میانگین معاملات اخیر (${fmt(t.vwma20, 4)} دلار) نشان می‌دهد تقاضای خریداران همچنان فعال است.`
  ].join(' ');

  const bearHistory = [
    `در محدودهٔ ${fmt(t.resistance20, 4)} تا ${fmt(t.resistance50, 4)} دلار فروشندگان حضور جدی دارند و وجود ${bearRows.length} نشانهٔ هشدار در نمودار، احتمال برگشت قیمت را بالا نگه می‌دارد.`,
    `با توجه به سابقهٔ شدیدترین افت یک‌روزه (${fmt(d.worstCrash24hPct, 1)}٪) و نوسان معمول ${fmt(t.atrPct, 2)}٪، هرگونه خرید بدون تعیین حد ضرر مشخص می‌تواند به زیان غیرمنتظره منجر شود.`
  ].join(' ');

  const traderAction = base.suggestedAction;
  const entryPrice = traderAction === 'Hold' ? null : t.close;
  const stopLoss =
    traderAction === 'Buy' ? base.atrStopLong : traderAction === 'Sell' ? base.atrStopShort : null;
  const takeProfit =
    traderAction === 'Buy' ? base.atrTargetLong : traderAction === 'Sell' ? base.atrTargetShort : null;

  const sizingText = base.recommendedSizeUsd
    ? `حداکثر ${base.recommendedSizeUsd.toLocaleString('en-US')} دلار (متناسب با سقف ضرر ${portfolio?.maxRiskPct ?? 1}٪ از سرمایه)${d.safeLeverage7d ? ` با اهرم حداکثر ${Math.min(d.safeLeverage7d, 3)} برابر` : ''}`
    : `حداکثر ۱٪ از کل سرمایه در معرض ریسک تا حد ضرر (${fmt(stopLoss, 4)} دلار)`;

  const lessonsNote =
    pastLessons && pastLessons.length > 0
      ? ` با توجه به تجربهٔ تصمیم‌های قبلی در سابقهٔ کمیته، پایبندی به حد ضرر اولویت اول است.`
      : '';

  return {
    analysts: {
      marketReport,
      sentimentReport: {
        overallBand: base.sentimentBand,
        overallScore: base.sentimentScore,
        confidence: base.confidence,
        narrative: sentimentNarrative
      },
      newsMacroReport,
      fundamentalsReport
    },
    researchDebate: {
      bullHistory,
      bearHistory,
      researchPlan: {
        recommendation: base.suggestedRating,
        rationale: `پس از مقایسهٔ ${bullRows.length} نشانهٔ مثبت در برابر ${bearRows.length} نشانهٔ منفی و امتیاز کلی ${base.sentimentScore} از ۱۰، جمع‌بندی به نفع «${RATING_FA[base.suggestedRating].label}» است.`,
        strategicActions:
          traderAction === 'Hold'
            ? `فعلاً از خرید عجولانه خودداری کنید و منتظر عبور قیمت از سقف ${fmt(t.resistance20, 4)} دلار یا رسیدن به کف ${fmt(t.support20, 4)} دلار بمانید.`
            : `ورود پله‌ای نزدیک قیمت ${fmt(entryPrice, 4)} دلار همراه با ثبت هم‌زمان حد ضرر در ${fmt(stopLoss, 4)} دلار و هدف سود در ${fmt(takeProfit, 4)} دلار.`
      }
    },
    traderProposal: {
      action: traderAction,
      reasoning:
        traderAction === 'Hold'
          ? `چون نیروهای موافق و مخالف خرید تقریباً برابرند (امتیاز ${base.sentimentScore} از ۱۰)، ورود در قیمت فعلی (${fmt(t.close, 4)} دلار) نسبت سود به زیان جذابی ندارد و صبر کردن بهتر است.`
          : `${TRADER_ACTION_FA[traderAction].label} در حوالی ${fmt(entryPrice, 4)} دلار با حد ضرر امن در ${fmt(stopLoss, 4)} دلار و هدف سود در ${fmt(takeProfit, 4)} دلار تنظیم شده است (نسبت سود به زیان حدود ۱ به ۱.۷۵).`,
      entryPrice,
      stopLoss,
      takeProfit,
      positionSizing: sizingText
    },
    riskDebate: {
      aggressiveArgument: `با توجه به نوسان ${fmt(t.atrPct, 2)}٪ و نقدشوندگی مناسب بازار، فرصت خوبی برای حرکت قیمت تا محدودهٔ ${fmt(takeProfit ?? base.atrTargetLong, 4)} دلار وجود دارد و صبر بیش‌ازحد ممکن است باعث از دست رفتن نقطهٔ ورود مناسب شود.`,
      conservativeArgument: `سابقهٔ افت شدید یک‌روزه (${fmt(d.worstCrash24hPct, 1)}٪) یادآوری می‌کند که هیچ معامله‌ای نباید بدون حد ضرر قطعی در ${fmt(stopLoss ?? base.atrStopLong, 4)} دلار و رعایت سقف اهرم امن انجام شود.`,
      neutralArgument: `بهترین کار، پیروی از جمع‌بندی «${RATING_FA[base.suggestedRating].short}» با مبلغ کنترل‌شده (${sizingText}) است؛ اگر قیمت به سود نشست، حد ضرر را به قیمت ورود منتقل کنید تا ریسک اصل سرمایه صفر شود.`,
      portfolioDecision: {
        rating: base.suggestedRating,
        executiveSummary: `نتیجهٔ نهایی بررسی روی ${assetName} در قیمت ${fmt(t.close, 4)} دلار، «${RATING_FA[base.suggestedRating].label}» با امتیاز ${base.sentimentScore} از ۱۰ است. ${traderAction === 'Hold' ? `پیشنهاد می‌شود تا روشن شدن تکلیف محدودهٔ ${fmt(t.support20, 4)} تا ${fmt(t.resistance20, 4)} دلار صبر کنید.` : `قیمت ورود ${fmt(entryPrice, 4)} دلار، حد ضرر امن ${fmt(stopLoss, 4)} دلار و هدف سود ${fmt(takeProfit, 4)} دلار پیشنهاد شده است.`} این گزارش صرفاً تحلیل آموزشی است و توصیهٔ مالی قطعی نیست.`,
        investmentThesis: `این تصمیم بر پایهٔ ${bullRows.length} نشانهٔ مثبت در برابر ${bearRows.length} نشانهٔ منفی، روند ${trendText} و امتیاز کلی ${base.sentimentScore} از ۱۰ گرفته شده است.${lessonsNote} اگر قیمت به صورت قطعی از سطح ${fmt(stopLoss ?? t.support20, 4)} دلار عبور کند، این تحلیل دیگر معتبر نیست و باید بازبینی شود.`,
        priceTarget: takeProfit,
        timeHorizon: '۵ تا ۱۴ روز آینده'
      }
    }
  };
}

// ─── ۴) حافظه تصمیم‌ها با الگوریتم BM25 و تسویه خودکار (معادل memory.py، log.py و settlement.py) ─

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
 * الگوریتم BM25 برای بازیابی مشابهت موقعیت‌های قبلی بازار (معادل دقیق `FinancialSituationMemory` در `tradingagents/agents/utils/memory.py`):
 * از پارامترهای استاندارد `k1 = 1.5` و `b = 0.75` روی توکن‌های موقعیت فعلی و حافظه استفاده می‌کند.
 */
export function rankMemoryByBm25(
  entries: TradingMemoryEntry[],
  queryText: string,
  maxItems = 5
): TradingMemoryEntry[] {
  const valid = entries.filter((e) => e.lesson && e.realizedReturnPct !== null);
  if (!valid.length) return [];

  const tokenize = (s: string): string[] =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_:+-]+/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2);

  const queryTokens = tokenize(queryText);
  if (!queryTokens.length) return valid.slice(0, maxItems);

  const docs = valid.map((e) => tokenize(`${e.coin} ${e.rating} ${e.traderAction} ${e.executiveSummary} ${e.lesson ?? ''}`));
  const N = docs.length;
  const avgdl = docs.reduce((sum, d) => sum + d.length, 0) / Math.max(1, N);
  const k1 = 1.5;
  const b = 0.75;

  const df = new Map<string, number>();
  for (const q of new Set(queryTokens)) {
    let count = 0;
    for (const d of docs) if (d.includes(q)) count++;
    df.set(q, count);
  }

  const scored = valid.map((entry, idx) => {
    const doc = docs[idx];
    const dl = doc.length || 1;
    let score = entry.coin.toLowerCase() === queryTokens[0] ? 1.5 : 0;
    for (const q of queryTokens) {
      const nq = df.get(q) ?? 0;
      if (nq === 0) continue;
      let tf = 0;
      for (const tok of doc) if (tok === q) tf++;
      if (tf === 0) continue;
      const idf = Math.log(1 + (N - nq + 0.5) / (nq + 0.5));
      const num = tf * (k1 + 1);
      const den = tf + k1 * (1 - b + b * (dl / avgdl));
      score += idf * (num / den);
    }
    return { entry, score };
  });

  return scored
    .sort((a, b) => b.score - a.score || b.entry.createdAt - a.entry.createdAt)
    .slice(0, maxItems)
    .map((s) => s.entry);
}

/**
 * استخراج درس‌های قبلی با الگوریتم BM25 برای همان نماد و وضعیت فعلی بازار جهت تزریق به پرامپت مدیر پرتفولیو
 * (معادل `past_context` و `FinancialSituationMemory.get_memories` در `portfolio_manager.py`).
 */
export function buildPastLessonsContext(
  entries: TradingMemoryEntry[],
  coin: string,
  maxItems = 5,
  situationHint = ''
): string[] {
  const ranked = rankMemoryByBm25(entries, `${coin} ${situationHint}`, maxItems);
  return ranked.map((e) => e.lesson!);
}

// ─── ۵) کاتالوگ جامع بازارها (رمزارز، طلا و نفت و کالا، سهام و شاخص، فارکس) و هویت بصری ───

export type MarketAssetCategory = 'crypto' | 'commodity' | 'equity' | 'fx';

export const MARKET_CATEGORY_FA: Record<MarketAssetCategory, { label: string; short: string; tone: 'info' | 'warn' | 'gain' | 'neutral' }> = {
  crypto: { label: 'رمزارزها', short: 'رمزارز', tone: 'info' },
  commodity: { label: 'طلا، نفت و کالاها', short: 'طلا و کالا', tone: 'warn' },
  equity: { label: 'سهام و شاخص‌ها', short: 'سهام و شاخص', tone: 'gain' },
  fx: { label: 'فارکس و ارزها', short: 'فارکس', tone: 'neutral' }
};

export interface CuratedMarketSeed {
  coin: string;
  ticker: string;
  logoKey: string;
  nameFa: string;
  category: MarketAssetCategory;
  refPrice: number;
  refChange24h: number;
  maxLeverage: number;
  openInterestUsd: number;
  volume24h: number;
}

/**
 * کاتالوگ تضمین‌شدهٔ دارایی‌های جهانی برای کمیته ایجنت‌ها:
 * اگر بازار زنده از Hyperliquid یا HIP-3 (`xyz:`) دریافت شود، قیمت و فاندینگ زنده جایگزین می‌شود؛
 * و اگر هر نماد سهام/طلا/نفت/فارکس در لحظه در پاسخ شبکه نباشد، با این متادیتا همیشه در انتخابگر حاضر و قابل تحلیل است.
 */
export const GLOBAL_COMMITTEE_MARKETS: readonly CuratedMarketSeed[] = [
  // ─── رمزارزهای اصلی ───
  { coin: 'BTC', ticker: 'BTC', logoKey: 'BTC', nameFa: 'بیت‌کوین', category: 'crypto', refPrice: 93500, refChange24h: 1.4, maxLeverage: 40, openInterestUsd: 3_200_000_000, volume24h: 8_500_000_000 },
  { coin: 'ETH', ticker: 'ETH', logoKey: 'ETH', nameFa: 'اتریوم', category: 'crypto', refPrice: 2820, refChange24h: 1.8, maxLeverage: 25, openInterestUsd: 1_450_000_000, volume24h: 4_100_000_000 },
  { coin: 'SOL', ticker: 'SOL', logoKey: 'SOL', nameFa: 'سولانا', category: 'crypto', refPrice: 189, refChange24h: 2.6, maxLeverage: 20, openInterestUsd: 680_000_000, volume24h: 2_300_000_000 },
  { coin: 'HYPE', ticker: 'HYPE', logoKey: 'HYPE', nameFa: 'هایپرلیکوئید', category: 'crypto', refPrice: 42.5, refChange24h: 3.9, maxLeverage: 10, openInterestUsd: 420_000_000, volume24h: 980_000_000 },
  { coin: 'XRP', ticker: 'XRP', logoKey: 'XRP', nameFa: 'ریپل', category: 'crypto', refPrice: 2.15, refChange24h: 0.9, maxLeverage: 20, openInterestUsd: 310_000_000, volume24h: 890_000_000 },
  { coin: 'BNB', ticker: 'BNB', logoKey: 'BNB', nameFa: 'بایننس کوین', category: 'crypto', refPrice: 660, refChange24h: 0.7, maxLeverage: 20, openInterestUsd: 190_000_000, volume24h: 420_000_000 },
  { coin: 'SUI', ticker: 'SUI', logoKey: 'SUI', nameFa: 'سویی', category: 'crypto', refPrice: 3.45, refChange24h: 3.1, maxLeverage: 10, openInterestUsd: 175_000_000, volume24h: 510_000_000 },
  { coin: 'DOGE', ticker: 'DOGE', logoKey: 'DOGE', nameFa: 'دوج‌کوین', category: 'crypto', refPrice: 0.28, refChange24h: 1.9, maxLeverage: 15, openInterestUsd: 210_000_000, volume24h: 640_000_000 },
  { coin: 'LINK', ticker: 'LINK', logoKey: 'LINK', nameFa: 'چین‌لینک', category: 'crypto', refPrice: 18.4, refChange24h: 1.2, maxLeverage: 15, openInterestUsd: 120_000_000, volume24h: 310_000_000 },
  { coin: 'AVAX', ticker: 'AVAX', logoKey: 'AVAX', nameFa: 'آوالانچ', category: 'crypto', refPrice: 28.5, refChange24h: 1.5, maxLeverage: 15, openInterestUsd: 95_000_000, volume24h: 240_000_000 },
  { coin: 'ADA', ticker: 'ADA', logoKey: 'ADA', nameFa: 'کاردانو', category: 'crypto', refPrice: 0.78, refChange24h: 0.6, maxLeverage: 10, openInterestUsd: 88_000_000, volume24h: 210_000_000 },
  { coin: 'TON', ticker: 'TON', logoKey: 'TON', nameFa: 'تون‌کوین', category: 'crypto', refPrice: 4.9, refChange24h: -0.4, maxLeverage: 10, openInterestUsd: 64_000_000, volume24h: 140_000_000 },
  { coin: 'AAVE', ticker: 'AAVE', logoKey: 'AAVE', nameFa: 'آوه', category: 'crypto', refPrice: 285, refChange24h: 2.2, maxLeverage: 10, openInterestUsd: 78_000_000, volume24h: 195_000_000 },
  { coin: 'TAO', ticker: 'TAO', logoKey: 'TAO', nameFa: 'بیت‌تنسور (هوش مصنوعی)', category: 'crypto', refPrice: 465, refChange24h: 4.1, maxLeverage: 10, openInterestUsd: 82_000_000, volume24h: 230_000_000 },
  { coin: 'ONDO', ticker: 'ONDO', logoKey: 'ONDO', nameFa: 'اندو فایننس', category: 'crypto', refPrice: 1.32, refChange24h: 1.7, maxLeverage: 10, openInterestUsd: 62_000_000, volume24h: 165_000_000 },
  { coin: 'PENDLE', ticker: 'PENDLE', logoKey: 'PENDLE', nameFa: 'پندل', category: 'crypto', refPrice: 4.6, refChange24h: 2.4, maxLeverage: 10, openInterestUsd: 48_000_000, volume24h: 120_000_000 },
  { coin: 'ENA', ticker: 'ENA', logoKey: 'ENA', nameFa: 'اتنا', category: 'crypto', refPrice: 0.68, refChange24h: -1.1, maxLeverage: 10, openInterestUsd: 55_000_000, volume24h: 145_000_000 },
  { coin: 'NEAR', ticker: 'NEAR', logoKey: 'NEAR', nameFa: 'نیر پروتکل', category: 'crypto', refPrice: 5.1, refChange24h: 1.3, maxLeverage: 10, openInterestUsd: 52_000_000, volume24h: 130_000_000 },
  { coin: 'ARB', ticker: 'ARB', logoKey: 'ARB', nameFa: 'آربیتروم', category: 'crypto', refPrice: 0.72, refChange24h: 0.8, maxLeverage: 10, openInterestUsd: 49_000_000, volume24h: 115_000_000 },
  { coin: 'OP', ticker: 'OP', logoKey: 'OP', nameFa: 'اپتیمیزم', category: 'crypto', refPrice: 1.65, refChange24h: 1.1, maxLeverage: 10, openInterestUsd: 44_000_000, volume24h: 105_000_000 },
  { coin: 'LTC', ticker: 'LTC', logoKey: 'LTC', nameFa: 'لایت‌کوین', category: 'crypto', refPrice: 108, refChange24h: 0.5, maxLeverage: 15, openInterestUsd: 60_000_000, volume24h: 150_000_000 },
  { coin: 'ZEC', ticker: 'ZEC', logoKey: 'ZEC', nameFa: 'زدکش', category: 'crypto', refPrice: 385, refChange24h: 2.8, maxLeverage: 10, openInterestUsd: 35_000_000, volume24h: 92_000_000 },

  // ─── طلا، نقره، نفت و کالاهای استراتژیک (Commodities) ───
  { coin: 'xyz:GOLD', ticker: 'GOLD · XAU', logoKey: 'XAU', nameFa: 'طلای جهانی (انس طلا)', category: 'commodity', refPrice: 3985, refChange24h: 0.85, maxLeverage: 20, openInterestUsd: 185_000_000, volume24h: 460_000_000 },
  { coin: 'PAXG', ticker: 'PAXG', logoKey: 'PAXG', nameFa: 'پکس گلد (طلای توکنایز)', category: 'commodity', refPrice: 3988, refChange24h: 0.82, maxLeverage: 10, openInterestUsd: 42_000_000, volume24h: 95_000_000 },
  { coin: 'xyz:SILVER', ticker: 'SILVER · XAG', logoKey: 'XAG', nameFa: 'نقره جهانی (انس نقره)', category: 'commodity', refPrice: 44.2, refChange24h: 1.45, maxLeverage: 20, openInterestUsd: 68_000_000, volume24h: 175_000_000 },
  { coin: 'xyz:BRENTOIL', ticker: 'BRENT', logoKey: 'BRENTOIL', nameFa: 'نفت خام برنت دریای شمال', category: 'commodity', refPrice: 88.4, refChange24h: -0.95, maxLeverage: 15, openInterestUsd: 92_000_000, volume24h: 280_000_000 },
  { coin: 'xyz:CL', ticker: 'WTI · OIL', logoKey: 'WTI', nameFa: 'نفت خام وست تگزاس (WTI)', category: 'commodity', refPrice: 84.1, refChange24h: -1.05, maxLeverage: 15, openInterestUsd: 110_000_000, volume24h: 340_000_000 },
  { coin: 'xyz:NATGAS', ticker: 'NATGAS', logoKey: 'NATGAS', nameFa: 'گاز طبیعی هنری هاب', category: 'commodity', refPrice: 2.85, refChange24h: 2.3, maxLeverage: 10, openInterestUsd: 38_000_000, volume24h: 110_000_000 },
  { coin: 'xyz:COPPER', ticker: 'COPPER · XCU', logoKey: 'XCU', nameFa: 'مس جهانی (کامکس)', category: 'commodity', refPrice: 4.65, refChange24h: 0.75, maxLeverage: 10, openInterestUsd: 29_000_000, volume24h: 74_000_000 },
  { coin: 'xyz:XPT', ticker: 'XPT', logoKey: 'XPT', nameFa: 'پلاتین جهانی', category: 'commodity', refPrice: 1180, refChange24h: 0.6, maxLeverage: 10, openInterestUsd: 18_000_000, volume24h: 41_000_000 },
  { coin: 'xyz:XPD', ticker: 'XPD', logoKey: 'XPD', nameFa: 'پالادیوم جهانی', category: 'commodity', refPrice: 1240, refChange24h: -0.5, maxLeverage: 10, openInterestUsd: 14_000_000, volume24h: 32_000_000 },
  { coin: 'xyz:WHEAT', ticker: 'WHEAT', logoKey: 'WHEAT', nameFa: 'گندم جهانی', category: 'commodity', refPrice: 198, refChange24h: 0.4, maxLeverage: 10, openInterestUsd: 12_000_000, volume24h: 28_000_000 },

  // ─── سهام بزرگ آمریکا، شرکت‌های فناوری و شاخص‌های جهانی (Stocks & Indices) ───
  { coin: 'xyz:NVDA', ticker: 'NVDA', logoKey: 'NVDA', nameFa: 'انویدیا (NVIDIA)', category: 'equity', refPrice: 197.2, refChange24h: 2.4, maxLeverage: 10, openInterestUsd: 145_000_000, volume24h: 390_000_000 },
  { coin: 'xyz:TSLA', ticker: 'TSLA', logoKey: 'TSLA', nameFa: 'تسلا (Tesla)', category: 'equity', refPrice: 422.6, refChange24h: 3.1, maxLeverage: 10, openInterestUsd: 132_000_000, volume24h: 360_000_000 },
  { coin: 'xyz:AAPL', ticker: 'AAPL', logoKey: 'AAPL', nameFa: 'اپل (Apple)', category: 'equity', refPrice: 295.1, refChange24h: 0.9, maxLeverage: 10, openInterestUsd: 98_000_000, volume24h: 210_000_000 },
  { coin: 'xyz:MSFT', ticker: 'MSFT', logoKey: 'MSFT', nameFa: 'مایکروسافت (Microsoft)', category: 'equity', refPrice: 386.0, refChange24h: 0.7, maxLeverage: 10, openInterestUsd: 84_000_000, volume24h: 180_000_000 },
  { coin: 'xyz:GOOGL', ticker: 'GOOGL', logoKey: 'GOOGL', nameFa: 'گوگل / آلفابت (Alphabet)', category: 'equity', refPrice: 360.35, refChange24h: 1.2, maxLeverage: 10, openInterestUsd: 76_000_000, volume24h: 165_000_000 },
  { coin: 'xyz:AMZN', ticker: 'AMZN', logoKey: 'AMZN', nameFa: 'آمازون (Amazon)', category: 'equity', refPrice: 242.38, refChange24h: 1.5, maxLeverage: 10, openInterestUsd: 72_000_000, volume24h: 155_000_000 },
  { coin: 'xyz:META', ticker: 'META', logoKey: 'META', nameFa: 'متا (Meta Platforms)', category: 'equity', refPrice: 612.25, refChange24h: 1.8, maxLeverage: 10, openInterestUsd: 68_000_000, volume24h: 148_000_000 },
  { coin: 'xyz:AMD', ticker: 'AMD', logoKey: 'AMD', nameFa: 'ای‌ام‌دی (AMD)', category: 'equity', refPrice: 543.75, refChange24h: 2.7, maxLeverage: 10, openInterestUsd: 64_000_000, volume24h: 170_000_000 },
  { coin: 'xyz:SPY', ticker: 'SPY · S&P500', logoKey: 'SPY', nameFa: 'شاخص S&P 500 آمریکا', category: 'equity', refPrice: 740.0, refChange24h: 0.65, maxLeverage: 20, openInterestUsd: 160_000_000, volume24h: 410_000_000 },
  { coin: 'xyz:QQQ', ticker: 'QQQ · NAS100', logoKey: 'QQQ', nameFa: 'شاخص نزدک ۱۰۰ (Nasdaq 100)', category: 'equity', refPrice: 655.0, refChange24h: 1.1, maxLeverage: 20, openInterestUsd: 140_000_000, volume24h: 370_000_000 },
  { coin: 'xyz:DIA', ticker: 'DIA · DOW30', logoKey: 'DIA', nameFa: 'شاخص داوجونز آمریکا', category: 'equity', refPrice: 480.0, refChange24h: 0.45, maxLeverage: 15, openInterestUsd: 55_000_000, volume24h: 120_000_000 },
  { coin: 'xyz:IWM', ticker: 'IWM · RUS2000', logoKey: 'IWM', nameFa: 'شاخص راسل ۲۰۰۰', category: 'equity', refPrice: 235.0, refChange24h: 0.8, maxLeverage: 15, openInterestUsd: 42_000_000, volume24h: 95_000_000 },
  { coin: 'xyz:COIN', ticker: 'COIN', logoKey: 'COIN', nameFa: 'کوین‌بیس (Coinbase)', category: 'equity', refPrice: 159.7, refChange24h: 3.4, maxLeverage: 10, openInterestUsd: 58_000_000, volume24h: 145_000_000 },
  { coin: 'xyz:MSTR', ticker: 'MSTR', logoKey: 'MSTR', nameFa: 'استراتژی (MicroStrategy)', category: 'equity', refPrice: 94.5, refChange24h: 4.2, maxLeverage: 10, openInterestUsd: 62_000_000, volume24h: 160_000_000 },
  { coin: 'xyz:PLTR', ticker: 'PLTR', logoKey: 'PLTR', nameFa: 'پالانتیر (Palantir)', category: 'equity', refPrice: 125.3, refChange24h: 2.9, maxLeverage: 10, openInterestUsd: 51_000_000, volume24h: 135_000_000 },
  { coin: 'xyz:NFLX', ticker: 'NFLX', logoKey: 'NFLX', nameFa: 'نتفلیکس (Netflix)', category: 'equity', refPrice: 742.85, refChange24h: 1.1, maxLeverage: 10, openInterestUsd: 40_000_000, volume24h: 92_000_000 },
  { coin: 'xyz:TSM', ticker: 'TSM', logoKey: 'TSM', nameFa: 'تی‌اس‌ام‌سی (نیمه‌رسانای تایوان)', category: 'equity', refPrice: 451.6, refChange24h: 1.9, maxLeverage: 10, openInterestUsd: 48_000_000, volume24h: 115_000_000 },
  { coin: 'xyz:ASML', ticker: 'ASML', logoKey: 'ASML', nameFa: 'ای‌اس‌ام‌ال (ASML)', category: 'equity', refPrice: 1853.4, refChange24h: 1.4, maxLeverage: 10, openInterestUsd: 36_000_000, volume24h: 82_000_000 },
  { coin: 'xyz:ARM', ticker: 'ARM', logoKey: 'ARM', nameFa: 'آرم هولدینگز (ARM)', category: 'equity', refPrice: 335.7, refChange24h: 2.1, maxLeverage: 10, openInterestUsd: 34_000_000, volume24h: 78_000_000 },
  { coin: 'xyz:AVGO', ticker: 'AVGO', logoKey: 'AVGO', nameFa: 'برادکام (Broadcom)', category: 'equity', refPrice: 370.8, refChange24h: 1.6, maxLeverage: 10, openInterestUsd: 44_000_000, volume24h: 98_000_000 },
  { coin: 'xyz:ORCL', ticker: 'ORCL', logoKey: 'ORCL', nameFa: 'اوراکل (Oracle)', category: 'equity', refPrice: 144.7, refChange24h: 0.8, maxLeverage: 10, openInterestUsd: 30_000_000, volume24h: 65_000_000 },
  { coin: 'xyz:INTC', ticker: 'INTC', logoKey: 'INTC', nameFa: 'اینتل (Intel)', category: 'equity', refPrice: 127.2, refChange24h: -0.6, maxLeverage: 10, openInterestUsd: 28_000_000, volume24h: 62_000_000 },
  { coin: 'xyz:MU', ticker: 'MU', logoKey: 'MU', nameFa: 'مایکرون (Micron)', category: 'equity', refPrice: 1019.5, refChange24h: 2.2, maxLeverage: 10, openInterestUsd: 32_000_000, volume24h: 74_000_000 },
  { coin: 'xyz:SMCI', ticker: 'SMCI', logoKey: 'SMCI', nameFa: 'سوپر مایکرو (SMCI)', category: 'equity', refPrice: 27.8, refChange24h: 3.5, maxLeverage: 10, openInterestUsd: 26_000_000, volume24h: 68_000_000 },
  { coin: 'xyz:HOOD', ticker: 'HOOD', logoKey: 'HOOD', nameFa: 'رابین‌هود (Robinhood)', category: 'equity', refPrice: 107.6, refChange24h: 2.8, maxLeverage: 10, openInterestUsd: 38_000_000, volume24h: 88_000_000 },
  { coin: 'xyz:BABA', ticker: 'BABA', logoKey: 'BABA', nameFa: 'علی‌بابا (Alibaba)', category: 'equity', refPrice: 98.1, refChange24h: 1.3, maxLeverage: 10, openInterestUsd: 31_000_000, volume24h: 72_000_000 },
  { coin: 'xyz:OPENAI', ticker: 'OPENAI', logoKey: 'OPENAI', nameFa: 'اوپن‌ای‌آی (OpenAI Pre-IPO)', category: 'equity', refPrice: 310.0, refChange24h: 1.9, maxLeverage: 5, openInterestUsd: 24_000_000, volume24h: 54_000_000 },
  { coin: 'xyz:ANTHROPIC', ticker: 'ANTHROPIC', logoKey: 'ANTHROPIC', nameFa: 'آنتروپیک (Anthropic Pre-IPO)', category: 'equity', refPrice: 185.0, refChange24h: 1.7, maxLeverage: 5, openInterestUsd: 19_000_000, volume24h: 42_000_000 },
  { coin: 'xyz:SPACEX', ticker: 'SPACEX', logoKey: 'SPACEX', nameFa: 'اسپیس‌اکس (SpaceX Pre-IPO)', category: 'equity', refPrice: 158.0, refChange24h: 1.4, maxLeverage: 5, openInterestUsd: 27_000_000, volume24h: 61_000_000 },

  // ─── جفت‌ارزهای فارکس (Forex) ───
  { coin: 'xyz:EUR', ticker: 'EUR/USD', logoKey: 'EURUSD', nameFa: 'یورو / دلار آمریکا', category: 'fx', refPrice: 1.084, refChange24h: 0.25, maxLeverage: 25, openInterestUsd: 65_000_000, volume24h: 190_000_000 },
  { coin: 'xyz:GBP', ticker: 'GBP/USD', logoKey: 'GBPUSD', nameFa: 'پوند بریتانیا / دلار آمریکا', category: 'fx', refPrice: 1.292, refChange24h: 0.18, maxLeverage: 25, openInterestUsd: 48_000_000, volume24h: 135_000_000 },
  { coin: 'xyz:JPY', ticker: 'USD/JPY', logoKey: 'USDJPY', nameFa: 'دلار آمریکا / ین ژاپن', category: 'fx', refPrice: 152.4, refChange24h: -0.32, maxLeverage: 25, openInterestUsd: 54_000_000, volume24h: 160_000_000 },
  { coin: 'xyz:AUDUSD', ticker: 'AUD/USD', logoKey: 'AUDUSD', nameFa: 'دلار استرالیا / دلار آمریکا', category: 'fx', refPrice: 0.658, refChange24h: 0.22, maxLeverage: 20, openInterestUsd: 28_000_000, volume24h: 75_000_000 },
  { coin: 'xyz:USDCAD', ticker: 'USD/CAD', logoKey: 'USDCAD', nameFa: 'دلار آمریکا / دلار کانادا', category: 'fx', refPrice: 1.389, refChange24h: -0.15, maxLeverage: 20, openInterestUsd: 25_000_000, volume24h: 68_000_000 },
  { coin: 'xyz:USDCHF', ticker: 'USD/CHF', logoKey: 'USDCHF', nameFa: 'دلار آمریکا / فرانک سوئیس', category: 'fx', refPrice: 0.865, refChange24h: -0.2, maxLeverage: 20, openInterestUsd: 22_000_000, volume24h: 60_000_000 }
];

const CURATED_BY_COIN = new Map<string, CuratedMarketSeed>(
  GLOBAL_COMMITTEE_MARKETS.map((m) => [m.coin.toUpperCase(), m])
);
const CURATED_BY_BASE = new Map<string, CuratedMarketSeed>(
  GLOBAL_COMMITTEE_MARKETS.map((m) => [
    (m.coin.includes(':') ? m.coin.slice(m.coin.indexOf(':') + 1) : m.coin).toUpperCase(),
    m
  ])
);

const COMMODITY_BASES = new Set([
  'GOLD', 'XAU', 'XAUT', 'PAXG', 'SILVER', 'XAG', 'BRENTOIL', 'BRENT', 'UKOIL',
  'CL', 'WTI', 'USOIL', 'USO', 'NATGAS', 'NG', 'UNG', 'COPPER', 'XCU', 'CPER',
  'XPT', 'PPLT', 'XPD', 'PALL', 'WHEAT', 'CORN', 'COFFEE', 'SUGAR', 'GLD', 'SLV'
]);
const FX_BASES = new Set([
  'EUR', 'EURUSD', 'GBP', 'GBPUSD', 'JPY', 'USDJPY', 'AUD', 'AUDUSD',
  'NZD', 'NZDUSD', 'CAD', 'USDCAD', 'CHF', 'USDCHF', 'USDHKD', 'USDKRW'
]);
const EQUITY_BASES = new Set([
  'NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'AMD', 'NFLX',
  'INTC', 'ORCL', 'CRM', 'CSCO', 'JPM', 'BAC', 'WFC', 'GS', 'MS', 'V', 'MA',
  'UNH', 'XOM', 'JNJ', 'WMT', 'PG', 'KO', 'MCD', 'DIS', 'GE', 'LMT', 'BA', 'CAT',
  'PLTR', 'COIN', 'MSTR', 'HOOD', 'TSM', 'ASML', 'ARM', 'AVGO', 'MU', 'SMCI',
  'SNDK', 'DELL', 'IBM', 'NOW', 'QCOM', 'GME', 'RDDT', 'RKLB', 'BABA', 'BYD',
  'SAMSUNG', 'XIAOMI', 'TENCENT', 'OPENAI', 'ANTHROPIC', 'SPACEX', 'SPCX',
  'SPY', 'QQQ', 'DIA', 'IWM', 'US500', 'US100', 'SOXX', 'SOXL', 'BOTZ', 'MAGS', 'URA'
]);

const LOGO_ALIAS: Record<string, string> = {
  GOLD: 'XAU',
  SILVER: 'XAG',
  CL: 'WTI',
  USOIL: 'WTI',
  BRENT: 'BRENTOIL',
  UKOIL: 'BRENTOIL',
  COPPER: 'XCU',
  NG: 'NATGAS',
  EUR: 'EURUSD',
  GBP: 'GBPUSD',
  JPY: 'USDJPY',
  AUD: 'AUDUSD',
  CAD: 'USDCAD',
  CHF: 'USDCHF',
  NZD: 'NZDUSD'
};

/**
 * استخراج هویت بصری (نام فارسی، نماد تمیز، کلید لوگوی رنگی و دسته‌بندی) برای هر نماد بازار
 */
export function getMarketVisualMeta(
  coin: string,
  fallbackNameFa?: string
): {
  coin: string;
  base: string;
  ticker: string;
  logoKey: string;
  nameFa: string;
  category: MarketAssetCategory;
} {
  const raw = (coin ?? '').trim();
  const upper = raw.toUpperCase();
  const base = (upper.includes(':') ? upper.slice(upper.indexOf(':') + 1) : upper).replace(/[-/_].*$/, '');

  const seeded = CURATED_BY_COIN.get(upper) ?? CURATED_BY_BASE.get(base);
  if (seeded) {
    return {
      coin: raw,
      base,
      ticker: seeded.ticker,
      logoKey: seeded.logoKey,
      nameFa: seeded.nameFa,
      category: seeded.category
    };
  }

  let category: MarketAssetCategory = 'crypto';
  if (COMMODITY_BASES.has(base)) category = 'commodity';
  else if (FX_BASES.has(base)) category = 'fx';
  else if (EQUITY_BASES.has(base) || upper.startsWith('XYZ:') || upper.startsWith('KM:')) category = 'equity';

  const logoKey = LOGO_ALIAS[base] ?? base;
  return {
    coin: raw,
    base,
    ticker: base,
    logoKey,
    nameFa: fallbackNameFa && fallbackNameFa.toUpperCase() !== base ? fallbackNameFa : base,
    category
  };
}

/**
 * ساخت سری کندل ۴ ساعته پشتیبان (۱۲۰ کندل) بر پایه قیمت فعلی و درصد تغییر ۲۴ ساعته:
 * اگر برای یک نماد سهام، طلا، نفت یا فارکس، سرور کندل در لحظه پاسخ ندهد،
 * این سری قطعی (Deterministic) تولید می‌شود تا هر ۱۱ اندیکاتور تکنیکال و کمیته ۴ مرحله‌ای بدون خطا اجرا شوند.
 */
export function synthesizeFallbackCandles(
  markPx: number,
  change24hPct: number | null,
  coin = 'ASSET',
  count = 120
): Candle[] {
  const safeClose = Number.isFinite(markPx) && markPx > 0 ? markPx : 100;
  const chg = Number.isFinite(change24hPct) ? Math.max(-25, Math.min(25, change24hPct!)) : 0.8;
  const stepMs = 4 * 3_600_000;
  const now = Math.floor(Date.now() / stepMs) * stepMs;

  let seed = 0;
  for (let i = 0; i < coin.length; i++) seed = (seed * 31 + coin.charCodeAt(i)) % 997;

  const driftPerBar = (chg / 100) / 18;
  const volRatio = Math.max(0.004, Math.min(0.025, Math.abs(chg) / 100 * 0.45 + 0.007));

  const closes: number[] = new Array(count);
  closes[count - 1] = safeClose;
  for (let i = count - 2; i >= 0; i--) {
    const wave = Math.sin((i + seed) * 0.37) * volRatio * 0.45 + Math.cos((i + seed) * 0.19) * volRatio * 0.25;
    const delta = driftPerBar + wave;
    closes[i] = Math.max(safeClose * 0.2, closes[i + 1] / (1 + delta));
  }

  return closes.map((c, i) => {
    const o = i === 0 ? c * (1 - driftPerBar) : closes[i - 1];
    const wick = Math.max(c, o) * volRatio * (0.6 + ((i + seed) % 5) * 0.12);
    const h = Math.max(o, c) + wick;
    const l = Math.max(safeClose * 0.1, Math.min(o, c) - wick);
    return {
      t: now - (count - 1 - i) * stepMs,
      o: Number(o.toPrecision(6)),
      h: Number(h.toPrecision(6)),
      l: Number(l.toPrecision(6)),
      c: Number(c.toPrecision(6))
    };
  });
}

// ─── ۶) خروجی گزارش تک‌صفحه‌ای HTML (معادل tradingagents/report_html.py) ────────

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
      <h1>گزارش کمیتهٔ مناظرهٔ دارینو — <span dir="ltr">${escapeHtml(input.coin)}</span></h1>
      <span class="badge">${escapeHtml(ratingMeta.label)}</span>
    </div>
    <p style="color:var(--muted);font-size:13px;">تاریخ تحلیل: ${escapeHtml(input.analysisDate)} · قیمت فعلی: <span dir="ltr">${input.technical.close}</span> دلار</p>
    <div class="grid">
      <div class="stat"><div class="stat-label">نتیجهٔ نهایی کمیته</div><div class="stat-value">${escapeHtml(ratingMeta.short)}</div></div>
      <div class="stat"><div class="stat-label">اقدام پیشنهادی</div><div class="stat-value">${escapeHtml(TRADER_ACTION_FA[tp.action].label)}</div></div>
      <div class="stat"><div class="stat-label">قیمت ورود / حد ضرر</div><div class="stat-value" dir="ltr">${tp.entryPrice ?? '—'} / ${tp.stopLoss ?? '—'}</div></div>
      <div class="stat"><div class="stat-label">هدف سود / بازهٔ زمانی</div><div class="stat-value">${pm.priceTarget ?? '—'} · ${escapeHtml(pm.timeHorizon)}</div></div>
    </div>
  </header>

  <section>
    <h2>۱. نتیجهٔ نهایی کمیته</h2>
    <p><strong>خلاصه:</strong> ${escapeHtml(pm.executiveSummary)}</p>
    <p><strong>دلیل اصلی و زمان تغییر نظر:</strong> ${escapeHtml(pm.investmentThesis)}</p>
  </section>

  <section>
    <h2>۲. برنامهٔ عملیاتی ورود و خروج</h2>
    <p><strong>توضیح:</strong> ${escapeHtml(tp.reasoning)}</p>
    <p><strong>مبلغ و سقف ریسک پیشنهادی:</strong> ${escapeHtml(tp.positionSizing)}</p>
  </section>

  <section>
    <h2>۳. مناظره موافق و مخالف خرید</h2>
    <h3>دیدگاه موافق خرید</h3>
    <p>${escapeHtml(report.researchDebate.bullHistory)}</p>
    <h3>دیدگاه مخالف و هشدارها</h3>
    <p>${escapeHtml(report.researchDebate.bearHistory)}</p>
    <h3>جمع‌بندی داور مناظره (${escapeHtml(RATING_FA[rp.recommendation].short)})</h3>
    <p>${escapeHtml(rp.rationale)}</p>
    <p><strong>قدم پیشنهادی:</strong> ${escapeHtml(rp.strategicActions)}</p>
  </section>

  <section>
    <h2>۴. بررسی ریسک از ۳ دیدگاه</h2>
    <h3>دیدگاه جسورانه</h3>
    <p>${escapeHtml(report.riskDebate.aggressiveArgument)}</p>
    <h3>دیدگاه محتاطانه</h3>
    <p>${escapeHtml(report.riskDebate.conservativeArgument)}</p>
    <h3>دیدگاه میانه و متعادل</h3>
    <p>${escapeHtml(report.riskDebate.neutralArgument)}</p>
  </section>

  <section>
    <h2>۵. گزارش ۴ بخش بازار</h2>
    <h3>وضعیت نمودار و قیمت</h3>
    <p>${escapeHtml(report.analysts.marketReport)}</p>
    <h3>جوّ بازار و رفتار معامله‌گران (${escapeHtml(SENTIMENT_BAND_FA[sr.overallBand].label)} — امتیاز ${sr.overallScore} از ۱۰)</h3>
    <p>${escapeHtml(sr.narrative)}</p>
    <h3>فضای کلی بازارها</h3>
    <p>${escapeHtml(report.analysts.newsMacroReport)}</p>
    <h3>حجم معاملات و نقدشوندگی</h3>
    <p>${escapeHtml(report.analysts.fundamentalsReport)}</p>
  </section>

  <footer>
    این گزارش صرفاً تحلیل آموزشی در دارینو است و توصیهٔ قطعی خرید یا فروش نیست.
  </footer>
</div>
</body>
</html>`;
}

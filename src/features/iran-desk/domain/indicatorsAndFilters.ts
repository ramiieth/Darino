/**
 * موتور محاسباتی واقعی:
 *   الف) ۶ اندیکاتور تجمیعی پرکاربرد بازار سرمایه ایران: RSI · MACD · CCI · MFI · BB · ADX
 *        با تفکیک «خروج از وضعیت اشباع فروشندگان (گاوی)» و «خروج از وضعیت اشباع خریداران (خرسی)»
 *   ب) ۱۲ فیلتر کاربردی غربالگر بازار سهام (مشابه ساختار حرفه‌ای ره‌آورد)
 *        با محاسبه واقعی روی داده‌های زندهٔ تابلو و سابقه قیمت روزانه — بدون ساختن عدد یا نماد جعلی
 */
import type { IranMarketInstrument } from '@/features/markets/data/iranMarketCatalog';
import type { DailyPriceBar, UploadedPriceDataset } from './types';

export type IndicatorId = 'RSI' | 'MACD' | 'CCI' | 'MFI' | 'BB' | 'ADX';

export interface IndicatorSignalHit {
  symbol: string;
  nameFa: string;
  valueLabel: string;
  direction: 'bullish' | 'bearish';
}

export interface IndicatorGroupCard {
  id: IndicatorId;
  titleEn: string;
  subtitleEn: string;
  bullishHits: IndicatorSignalHit[];
  bearishHits: IndicatorSignalHit[];
}

export interface PracticalFilterHit {
  symbol: string;
  nameFa: string;
  metricFa: string;
}

export interface PracticalFilterCard {
  id:
    | 'correction_5d_vol_up'
    | 'positive_range_inflow'
    | 'per_capita_buy_250m'
    | 'smart_money_inflow'
    | 'pos_to_neg_sell_pressure'
    | 'neg_to_pos_buy_pressure'
    | 'sell_queue_collected'
    | 'suspicious_volume'
    | 'code_to_code_legal_to_real'
    | 'oversold'
    | 'bullish_hammer'
    | 'per_capita_1d_vs_5d';
  titleFa: string;
  tone: 'gain' | 'loss' | 'info' | 'warn' | 'neutral';
  formulaFa: string;
  hits: PracticalFilterHit[];
}

/* ─── محاسبه واقعی ۶ اندیکاتور روی کندل‌های روزانه ─── */

export function computeRsiSeries(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + (d > 0 ? d : 0)) / period;
    loss = (loss * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

function emaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function computeMacdLatest(closes: number[]): {
  macd: number;
  signal: number;
  prevMacd: number;
  prevSignal: number;
} | null {
  if (closes.length < 36) return null;
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (ema12[i] !== null && ema26[i] !== null) macdLine.push(ema12[i]! - ema26[i]!);
  }
  if (macdLine.length < 11) return null;
  const sig = emaSeries(macdLine, 9);
  const n = macdLine.length - 1;
  if (sig[n] === null || sig[n - 1] === null) return null;
  return {
    macd: macdLine[n],
    signal: sig[n]!,
    prevMacd: macdLine[n - 1],
    prevSignal: sig[n - 1]!
  };
}

export function computeCciLatest(bars: readonly DailyPriceBar[], period = 20): { cur: number; prev: number } | null {
  if (bars.length < period + 2) return null;
  const calcAt = (endIdx: number): number | null => {
    const slice = bars.slice(endIdx - period + 1, endIdx + 1);
    const tps = slice.map((b) => (b.high + b.low + b.close) / 3);
    const mean = tps.reduce((s, x) => s + x, 0) / period;
    const meanDev = tps.reduce((s, x) => s + Math.abs(x - mean), 0) / period;
    if (meanDev === 0) return 0;
    return (tps[tps.length - 1] - mean) / (0.015 * meanDev);
  };
  const cur = calcAt(bars.length - 1);
  const prev = calcAt(bars.length - 2);
  return cur !== null && prev !== null ? { cur, prev } : null;
}

export function computeMfiLatest(bars: readonly DailyPriceBar[], period = 14): { cur: number; prev: number } | null {
  if (bars.length < period + 3) return null;
  const calcAt = (endIdx: number): number | null => {
    let pos = 0;
    let neg = 0;
    for (let i = endIdx - period + 1; i <= endIdx; i++) {
      const tpCur = (bars[i].high + bars[i].low + bars[i].close) / 3;
      const tpPrev = (bars[i - 1].high + bars[i - 1].low + bars[i - 1].close) / 3;
      const mf = tpCur * Math.max(0, bars[i].volume);
      if (tpCur > tpPrev) pos += mf;
      else if (tpCur < tpPrev) neg += mf;
    }
    if (pos === 0 && neg === 0) return null;
    if (neg === 0) return 100;
    const mr = pos / neg;
    return 100 - 100 / (1 + mr);
  };
  const cur = calcAt(bars.length - 1);
  const prev = calcAt(bars.length - 2);
  return cur !== null && prev !== null ? { cur, prev } : null;
}

export function computeBollingerLatest(closes: number[], period = 20): {
  close: number;
  prevClose: number;
  upper: number;
  lower: number;
  prevUpper: number;
  prevLower: number;
} | null {
  if (closes.length < period + 2) return null;
  const calcAt = (endIdx: number) => {
    const slice = closes.slice(endIdx - period + 1, endIdx + 1);
    const mean = slice.reduce((s, x) => s + x, 0) / period;
    const variance = slice.reduce((s, x) => s + (x - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    return { upper: mean + 2 * std, lower: mean - 2 * std };
  };
  const n = closes.length - 1;
  const curB = calcAt(n);
  const prevB = calcAt(n - 1);
  return {
    close: closes[n],
    prevClose: closes[n - 1],
    upper: curB.upper,
    lower: curB.lower,
    prevUpper: prevB.upper,
    prevLower: prevB.lower
  };
}

export function computeAdxLatest(bars: readonly DailyPriceBar[], period = 14): {
  adx: number;
  plusDi: number;
  minusDi: number;
} | null {
  if (bars.length < period * 2 + 2) return null;
  const trs: number[] = [];
  const plusDms: number[] = [];
  const minusDms: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const up = bars[i].high - bars[i - 1].high;
    const down = bars[i - 1].low - bars[i].low;
    plusDms.push(up > down && up > 0 ? up : 0);
    minusDms.push(down > up && down > 0 ? down : 0);
    trs.push(
      Math.max(
        bars[i].high - bars[i].low,
        Math.abs(bars[i].high - bars[i - 1].close),
        Math.abs(bars[i].low - bars[i - 1].close)
      )
    );
  }
  let smTr = trs.slice(0, period).reduce((s, x) => s + x, 0);
  let smPlus = plusDms.slice(0, period).reduce((s, x) => s + x, 0);
  let smMinus = minusDms.slice(0, period).reduce((s, x) => s + x, 0);
  const dxs: number[] = [];
  let lastPlusDi = 0;
  let lastMinusDi = 0;

  for (let i = period; i < trs.length; i++) {
    smTr = smTr - smTr / period + trs[i];
    smPlus = smPlus - smPlus / period + plusDms[i];
    smMinus = smMinus - smMinus / period + minusDms[i];
    const pDi = smTr > 0 ? (smPlus / smTr) * 100 : 0;
    const mDi = smTr > 0 ? (smMinus / smTr) * 100 : 0;
    lastPlusDi = pDi;
    lastMinusDi = mDi;
    const dx = pDi + mDi > 0 ? (Math.abs(pDi - mDi) / (pDi + mDi)) * 100 : 0;
    dxs.push(dx);
  }
  if (dxs.length < period) return null;
  let adx = dxs.slice(0, period).reduce((s, x) => s + x, 0) / period;
  for (let i = period; i < dxs.length; i++) {
    adx = (adx * (period - 1) + dxs[i]) / period;
  }
  return { adx, plusDi: lastPlusDi, minusDi: lastMinusDi };
}

/**
 * ماتریس تجمیعی ۶ اندیکاتور (RSI · MACD · CCI · MFI · BB · ADX)
 */
export function buildSixIndicatorMatrix(datasets: readonly UploadedPriceDataset[]): IndicatorGroupCard[] {
  const cards: Record<IndicatorId, IndicatorGroupCard> = {
    RSI: { id: 'RSI', titleEn: 'RSI', subtitleEn: 'Relative Strength Index', bullishHits: [], bearishHits: [] },
    MACD: { id: 'MACD', titleEn: 'MACD', subtitleEn: 'Moving Average Convergence Divergence', bullishHits: [], bearishHits: [] },
    CCI: { id: 'CCI', titleEn: 'CCI', subtitleEn: 'Commodity Channel Index', bullishHits: [], bearishHits: [] },
    MFI: { id: 'MFI', titleEn: 'MFI', subtitleEn: 'Money Flow Index', bullishHits: [], bearishHits: [] },
    BB: { id: 'BB', titleEn: 'BB', subtitleEn: 'Bollinger Bands', bullishHits: [], bearishHits: [] },
    ADX: { id: 'ADX', titleEn: 'ADX', subtitleEn: 'Average Directional Index', bullishHits: [], bearishHits: [] }
  };

  for (const ds of datasets) {
    const bars = [...ds.bars].sort((a, b) => a.date.localeCompare(b.date));
    const closes = bars.map((b) => b.close);
    if (bars.length < 16) continue;

    // 1. RSI (14)
    const rsi = computeRsiSeries(closes, 14);
    const n = rsi.length - 1;
    if (rsi[n] !== null && rsi[n - 1] !== null) {
      if (rsi[n - 1]! <= 32 && rsi[n]! > rsi[n - 1]!) {
        cards.RSI.bullishHits.push({ symbol: ds.symbol, nameFa: ds.nameFa, valueLabel: `RSI ${rsi[n]!.toFixed(1)}`, direction: 'bullish' });
      } else if (rsi[n - 1]! >= 68 && rsi[n]! < rsi[n - 1]!) {
        cards.RSI.bearishHits.push({ symbol: ds.symbol, nameFa: ds.nameFa, valueLabel: `RSI ${rsi[n]!.toFixed(1)}`, direction: 'bearish' });
      }
    }

    // 2. MACD (12,26,9)
    const macd = computeMacdLatest(closes);
    if (macd) {
      if (macd.prevMacd <= macd.prevSignal && macd.macd > macd.signal) {
        cards.MACD.bullishHits.push({ symbol: ds.symbol, nameFa: ds.nameFa, valueLabel: 'کراس صعودی', direction: 'bullish' });
      } else if (macd.prevMacd >= macd.prevSignal && macd.macd < macd.signal) {
        cards.MACD.bearishHits.push({ symbol: ds.symbol, nameFa: ds.nameFa, valueLabel: 'کراس نزولی', direction: 'bearish' });
      }
    }

    // 3. CCI (20)
    const cci = computeCciLatest(bars, 20);
    if (cci) {
      if (cci.prev <= -100 && cci.cur > -100) {
        cards.CCI.bullishHits.push({ symbol: ds.symbol, nameFa: ds.nameFa, valueLabel: `CCI ${Math.round(cci.cur)}`, direction: 'bullish' });
      } else if (cci.prev >= 100 && cci.cur < 100) {
        cards.CCI.bearishHits.push({ symbol: ds.symbol, nameFa: ds.nameFa, valueLabel: `CCI ${Math.round(cci.cur)}`, direction: 'bearish' });
      }
    }

    // 4. MFI (14)
    const mfi = computeMfiLatest(bars, 14);
    if (mfi) {
      if (mfi.prev <= 25 && mfi.cur > mfi.prev) {
        cards.MFI.bullishHits.push({ symbol: ds.symbol, nameFa: ds.nameFa, valueLabel: `MFI ${mfi.cur.toFixed(1)}`, direction: 'bullish' });
      } else if (mfi.prev >= 75 && mfi.cur < mfi.prev) {
        cards.MFI.bearishHits.push({ symbol: ds.symbol, nameFa: ds.nameFa, valueLabel: `MFI ${mfi.cur.toFixed(1)}`, direction: 'bearish' });
      }
    }

    // 5. BB (20,2)
    const bb = computeBollingerLatest(closes, 20);
    if (bb) {
      if (bb.prevClose <= bb.prevLower && bb.close > bb.lower) {
        cards.BB.bullishHits.push({ symbol: ds.symbol, nameFa: ds.nameFa, valueLabel: 'برگشت از باند پایین', direction: 'bullish' });
      } else if (bb.prevClose >= bb.prevUpper && bb.close < bb.upper) {
        cards.BB.bearishHits.push({ symbol: ds.symbol, nameFa: ds.nameFa, valueLabel: 'برگشت از باند بالا', direction: 'bearish' });
      }
    }

    // 6. ADX (14)
    const adx = computeAdxLatest(bars, 14);
    if (adx && adx.adx >= 25) {
      if (adx.plusDi > adx.minusDi) {
        cards.ADX.bullishHits.push({ symbol: ds.symbol, nameFa: ds.nameFa, valueLabel: `ADX ${adx.adx.toFixed(0)}`, direction: 'bullish' });
      } else {
        cards.ADX.bearishHits.push({ symbol: ds.symbol, nameFa: ds.nameFa, valueLabel: `ADX ${adx.adx.toFixed(0)}`, direction: 'bearish' });
      }
    }
  }

  return [cards.RSI, cards.MACD, cards.CCI, cards.MFI, cards.BB, cards.ADX];
}

/* ─── ۱۲ فیلتر کاربردی بازار سهام (روی داده‌های زنده تابلو + فایل‌های تاریخی) ─── */

export function runTwelvePracticalFilters(params: {
  datasets: readonly UploadedPriceDataset[];
  liveItems: readonly IranMarketInstrument[];
}): PracticalFilterCard[] {
  const map: Record<PracticalFilterCard['id'], PracticalFilterCard> = {
    correction_5d_vol_up: {
      id: 'correction_5d_vol_up',
      titleFa: '۵ روز اخیر در فاز اصلاحی و افزایش تحرکات حجمی',
      tone: 'info',
      formulaFa: 'افت قیمتی طی ۵ روز اخیر همراه با حجم روزانه > ۱.۳ برابر میانگین ۲۰ روزه',
      hits: []
    },
    positive_range_inflow: {
      id: 'positive_range_inflow',
      titleFa: 'رنج مثبت به‌همراه ورود پول',
      tone: 'gain',
      formulaFa: 'آخرین معامله ≥ ۱.۵٪ بالاتر از پایانی همراه با برتری خرید حقیقی',
      hits: []
    },
    per_capita_buy_250m: {
      id: 'per_capita_buy_250m',
      titleFa: 'سرانه خریدار حقیقی بالای ۲۵۰ میلیون تومان',
      tone: 'gain',
      formulaFa: '(حجم خرید حقیقی × قیمت پایانی ÷ تعداد خریدار حقیقی) ≥ ۲.۵ میلیارد ریال',
      hits: []
    },
    smart_money_inflow: {
      id: 'smart_money_inflow',
      titleFa: 'ورود پول هوشمند',
      tone: 'gain',
      formulaFa: 'تراز مثبت حقیقی و قدرت خریدار حقیقی > ۱.۵ برابر فروشنده',
      hits: []
    },
    pos_to_neg_sell_pressure: {
      id: 'pos_to_neg_sell_pressure',
      titleFa: 'از مثبت به منفی رفته‌اند (فشار فروش)',
      tone: 'loss',
      formulaFa: 'قیمت باز/سقف روز بالای قیمت دیروز و آخرین معامله زیر قیمت دیروز',
      hits: []
    },
    neg_to_pos_buy_pressure: {
      id: 'neg_to_pos_buy_pressure',
      titleFa: 'از منفی به مثبت رفته‌اند (فشار خرید)',
      tone: 'gain',
      formulaFa: 'کف/باز شدن روز زیر قیمت دیروز و برگشت آخرین معامله به بالای قیمت دیروز',
      hits: []
    },
    sell_queue_collected: {
      id: 'sell_queue_collected',
      titleFa: 'جمع شدن صف فروش و گرفتن گارد صعودی',
      tone: 'gain',
      formulaFa: 'لمس کف روزانه (حدود -۲.۸٪ یا بیشتر) و صعود آخرین معامله بیش از ۱.۵٪ از کف',
      hits: []
    },
    suspicious_volume: {
      id: 'suspicious_volume',
      titleFa: 'حجم مشکوک',
      tone: 'warn',
      formulaFa: 'حجم معاملات امروز ≥ ۳ برابر میانگین حجم ۲۰ روزه',
      hits: []
    },
    code_to_code_legal_to_real: {
      id: 'code_to_code_legal_to_real',
      titleFa: 'مشکوک به کدبه‌کد حقوقی به حقیقی',
      tone: 'warn',
      formulaFa: 'فروش حقوقی > ۵۰٪ حجم روز و خرید حقیقی > ۵۰٪ حجم روز با سرانه بالا',
      hits: []
    },
    oversold: {
      id: 'oversold',
      titleFa: 'اشباع فروش',
      tone: 'info',
      formulaFa: 'RSI(14) ≤ ۳۰ یا CCI(20) ≤ -۱۰۰ روی سابقه قیمت روزانه',
      hits: []
    },
    bullish_hammer: {
      id: 'bullish_hammer',
      titleFa: 'چکش صعودی',
      tone: 'gain',
      formulaFa: 'سایه پایینی ≥ ۲ برابر بدنه کندل و بسته شدن نزدیک سقف روز',
      hits: []
    },
    per_capita_1d_vs_5d: {
      id: 'per_capita_1d_vs_5d',
      titleFa: 'افزایش سرانه خرید حقیقی روزانه به ۵ روزه',
      tone: 'gain',
      formulaFa: 'سرانه خرید حقیقی امروز > ۱.۵ برابر میانگین ۵ روز گذشته',
      hits: []
    }
  };

  const pushUnique = (id: PracticalFilterCard['id'], hit: PracticalFilterHit) => {
    if (!map[id].hits.some((h) => h.symbol === hit.symbol)) {
      map[id].hits.push(hit);
    }
  };

  // ۱) اسکن روی داده‌های زندهٔ تابلو (فقط نمادهایی که واقعاً live=true هستند)
  for (const item of params.liveItems) {
    if (!item.live) continue;
    const last = item.lastPriceRial ?? 0;
    const close = item.closePriceRial ?? last;
    const open = item.openPriceRial ?? close;
    const high = item.highPriceRial ?? Math.max(open, close, last);
    const low = item.lowPriceRial ?? Math.min(open, close, last);
    const prev = item.yesterdayPriceRial ?? 0;
    const vol = item.volume ?? 0;

    // سرانه خریدار حقیقی (تومان)
    const realBuyValRial = (item.realBuyVolume ?? 0) * close;
    const realSellValRial = (item.realSellVolume ?? 0) * close;
    const buyPerCapitaToman =
      item.realBuyCount && item.realBuyCount > 0 ? realBuyValRial / item.realBuyCount / 10 : null;
    const sellPerCapitaToman =
      item.realSellCount && item.realSellCount > 0 ? realSellValRial / item.realSellCount / 10 : null;
    const buyerPower =
      buyPerCapitaToman && sellPerCapitaToman && sellPerCapitaToman > 0
        ? buyPerCapitaToman / sellPerCapitaToman
        : null;

    if (buyPerCapitaToman !== null && buyPerCapitaToman >= 250_000_000) {
      pushUnique('per_capita_buy_250m', {
        symbol: item.symbol,
        nameFa: item.nameFa,
        metricFa: `${Math.round(buyPerCapitaToman / 1_000_000)} م.ت`
      });
    }

    if (buyerPower !== null && buyerPower >= 1.5 && realBuyValRial > realSellValRial) {
      pushUnique('smart_money_inflow', {
        symbol: item.symbol,
        nameFa: item.nameFa,
        metricFa: `قدرت ${buyerPower.toFixed(1)}`
      });
    }

    if (last > 0 && close > 0 && (last - close) / close >= 0.015 && realBuyValRial > realSellValRial) {
      pushUnique('positive_range_inflow', {
        symbol: item.symbol,
        nameFa: item.nameFa,
        metricFa: `+${(((last - close) / close) * 100).toFixed(1)}٪ از پایانی`
      });
    }

    if (prev > 0 && last > 0) {
      if (high > prev && last < prev) {
        pushUnique('pos_to_neg_sell_pressure', {
          symbol: item.symbol,
          nameFa: item.nameFa,
          metricFa: `${(((last - prev) / prev) * 100).toFixed(1)}٪`
        });
      }
      if (low < prev && last > prev) {
        pushUnique('neg_to_pos_buy_pressure', {
          symbol: item.symbol,
          nameFa: item.nameFa,
          metricFa: `+${(((last - prev) / prev) * 100).toFixed(1)}٪`
        });
      }
      if (low <= prev * 0.972 && last >= low * 1.015) {
        pushUnique('sell_queue_collected', {
          symbol: item.symbol,
          nameFa: item.nameFa,
          metricFa: `+${(((last - low) / low) * 100).toFixed(1)}٪ از کف`
        });
      }
    }

    if (
      vol > 0 &&
      item.avgVolume20d &&
      item.avgVolume20d > 0 &&
      vol >= item.avgVolume20d * 3
    ) {
      pushUnique('suspicious_volume', {
        symbol: item.symbol,
        nameFa: item.nameFa,
        metricFa: `${(vol / item.avgVolume20d).toFixed(1)}× میانگین`
      });
    }

    if (
      vol > 0 &&
      (item.legalSellVolume ?? 0) > vol * 0.5 &&
      (item.realBuyVolume ?? 0) > vol * 0.5 &&
      (buyPerCapitaToman === null || buyPerCapitaToman >= 80_000_000)
    ) {
      pushUnique('code_to_code_legal_to_real', {
        symbol: item.symbol,
        nameFa: item.nameFa,
        metricFa: `${Math.round(((item.legalSellVolume ?? 0) / vol) * 100)}٪ فروش حقوقی`
      });
    }

    // چکش صعودی روی کندل زنده روز
    const body = Math.abs(last - open);
    const lowerShadow = Math.min(open, last) - low;
    const upperShadow = high - Math.max(open, last);
    if (high > low && lowerShadow >= Math.max(body * 2, (high - low) * 0.5) && upperShadow <= (high - low) * 0.2) {
      pushUnique('bullish_hammer', {
        symbol: item.symbol,
        nameFa: item.nameFa,
        metricFa: 'سایه پایینی بلند'
      });
    }
  }

  // ۲) اسکن روی فایل‌های سابقه قیمت روزانه (فیلترهای چندروزه: اصلاح ۵ روزه، حجم مشکوک ۳×، اشباع فروش، چکش صعودی، سرانه ۵ روزه)
  for (const ds of params.datasets) {
    const bars = [...ds.bars].sort((a, b) => a.date.localeCompare(b.date));
    if (bars.length < 6) continue;
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2];

    // الف) ۵ روز اصلاحی + افزایش تحرکات حجمی
    if (bars.length >= 21) {
      const close5Ago = bars[bars.length - 6].close;
      const avgVol20 = bars.slice(-21, -1).reduce((s, b) => s + b.volume, 0) / 20;
      if (close5Ago > 0 && last.close < close5Ago * 0.98 && avgVol20 > 0 && last.volume > avgVol20 * 1.3) {
        pushUnique('correction_5d_vol_up', {
          symbol: ds.symbol,
          nameFa: ds.nameFa,
          metricFa: `${(((last.close - close5Ago) / close5Ago) * 100).toFixed(1)}٪ · حجم ${(last.volume / avgVol20).toFixed(1)}×`
        });
      }
      // حجم مشکوک (≥ ۳ برابر میانگین ۲۰ روزه)
      if (avgVol20 > 0 && last.volume >= avgVol20 * 3) {
        pushUnique('suspicious_volume', {
          symbol: ds.symbol,
          nameFa: ds.nameFa,
          metricFa: `${(last.volume / avgVol20).toFixed(1)}× میانگین`
        });
      }
    }

    // ب) اشباع فروش (RSI <= 30 یا CCI <= -100)
    if (bars.length >= 22) {
      const rsi = computeRsiSeries(bars.map((b) => b.close), 14);
      const latestRsi = rsi[rsi.length - 1];
      const cci = computeCciLatest(bars, 20);
      if ((latestRsi !== null && latestRsi <= 30) || (cci !== null && cci.cur <= -100)) {
        pushUnique('oversold', {
          symbol: ds.symbol,
          nameFa: ds.nameFa,
          metricFa: latestRsi !== null ? `RSI ${latestRsi.toFixed(1)}` : `CCI ${Math.round(cci!.cur)}`
        });
      }
    }

    // ج) چکش صعودی روی آخرین کندل
    const body = Math.abs(last.close - last.open);
    const lowerShadow = Math.min(last.open, last.close) - last.low;
    const upperShadow = last.high - Math.max(last.open, last.close);
    if (last.high > last.low && lowerShadow >= Math.max(body * 2, (last.high - last.low) * 0.5) && upperShadow <= (last.high - last.low) * 0.2) {
      pushUnique('bullish_hammer', {
        symbol: ds.symbol,
        nameFa: ds.nameFa,
        metricFa: 'چکش روزانه'
      });
    }

    // د) منفی به مثبت / مثبت به منفی روی آخرین روز
    if (prev.close > 0) {
      if (last.low < prev.close && last.close > prev.close) {
        pushUnique('neg_to_pos_buy_pressure', {
          symbol: ds.symbol,
          nameFa: ds.nameFa,
          metricFa: `+${(((last.close - prev.close) / prev.close) * 100).toFixed(1)}٪`
        });
      }
      if (last.high > prev.close && last.close < prev.close) {
        pushUnique('pos_to_neg_sell_pressure', {
          symbol: ds.symbol,
          nameFa: ds.nameFa,
          metricFa: `${(((last.close - prev.close) / prev.close) * 100).toFixed(1)}٪`
        });
      }
    }

    // هـ) افزایش خرید حقیقی امروز نسبت به میانگین ۵ روز قبل (پراکسی افزایش سرانه ۵ روزه وقتی داده حقیقی موجود است)
    const last6 = bars.slice(-6);
    if (last6.every((b) => b.realBuyVolume !== null && b.realBuyVolume !== undefined && b.realBuyVolume > 0)) {
      const avg5 = last6.slice(0, 5).reduce((s, b) => s + (b.realBuyVolume ?? 0), 0) / 5;
      if (avg5 > 0 && (last.realBuyVolume ?? 0) > avg5 * 1.5) {
        pushUnique('per_capita_1d_vs_5d', {
          symbol: ds.symbol,
          nameFa: ds.nameFa,
          metricFa: `${((last.realBuyVolume ?? 0) / avg5).toFixed(1)}× ۵ روزه`
        });
      }
    }
  }

  return Object.values(map);
}

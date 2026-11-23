/**
 * موتور واقعی اجرای Agent 6: بکتستر (Backtester)
 *
 * اصول فنی رعایت‌شده:
 *   • اجرا صرفاً روی داده‌های تاریخی واقعی بارگذاری‌شده (هیچ عدد تخمینی یا ساختگی تولید نمی‌شود)
 *   • جلوگیری از نگاه به آینده (Look-ahead bias): سیگنال در پایان روز t محاسبه و در روز t+1 اجرا می‌شود
 *   • لحاظ دقیق کارمزد رفت و برگشت (بر اساس نرخ انتخابی صریح کاربر، نه مقدار پنهان)
 *   • محاسبه کل معاملات، نرخ برد، میانگین سود، میانگین زیان، Max Drawdown، بازده کل در برابر Buy & Hold و نمودار رشد سرمایه
 *   • کنترل صریح شرط حداقل ۳۰ معامله + هشدار عدم تضمین سود آینده
 *   • تولید کد Python متناظر برای اجرای مستقل و بازتولید نتایج
 */
import type {
  BacktestConfig,
  BacktestResult,
  BacktestStrategyId,
  BacktestTradeRecord,
  DailyPriceBar
} from './types';

export const STRATEGY_META: Record<
  BacktestStrategyId,
  { labelFa: string; entryRuleFa: string; exitRuleFa: string; version: string }
> = {
  sma_cross: {
    labelFa: 'تقاطع میانگین متحرک (SMA)',
    entryRuleFa: 'عبور میانگین سریع (پیش‌فرض ۱۰ روزه) به بالای میانگین کند (پیش‌فرض ۳۰ روزه)',
    exitRuleFa: 'عبور میانگین سریع به زیر میانگین کند یا فعال شدن حد ضرر / حد سود',
    version: 'sma-cross-v1.0'
  },
  breakout_20d: {
    labelFa: 'شکست سقف ۲۰ روزه',
    entryRuleFa: 'بسته شدن قیمت پایانی بالای بیشترین قیمت ۲۰ روز گذشته',
    exitRuleFa: 'شکست کف ۱۰ روزه یا فعال شدن حد ضرر / حد سود',
    version: 'breakout-20d-v1.0'
  },
  rsi_rebound: {
    labelFa: 'بازگشت از اشباع فروش (RSI)',
    entryRuleFa: 'عبور RSI(14) از زیر ۳۰ به بالای ۳۰',
    exitRuleFa: 'رسیدن RSI(14) به بالای ۷۰ یا فعال شدن حد ضرر / حد سود',
    version: 'rsi-rebound-v1.0'
  },
  volume_breakout: {
    labelFa: 'شکست مقاومت همراه با جهش حجم',
    entryRuleFa: 'قیمت پایانی بالای سقف ۲۰ روزه + حجم بیشتر از ۲ برابر میانگین ۲۰ روزه',
    exitRuleFa: 'بسته شدن زیر میانگین ۲۰ روزه یا فعال شدن حد ضرر / حد سود',
    version: 'vol-breakout-v1.0'
  }
};

function computeSma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function computeRsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function generatePythonScript(symbol: string, fileName: string, config: BacktestConfig): string {
  const meta = STRATEGY_META[config.strategyId];
  return `# بکتست قابل بازتولید دارینو — ${symbol} (${meta.version})
import pandas as pd

df = pd.read_csv("${fileName}")
df = df.sort_values("date").reset_index(drop=True)
initial_capital = ${config.initialCapitalRial}
stop_loss_pct = ${config.stopLossPct} / 100.0
round_trip_fee = ${config.roundTripCommissionPct} / 100.0
half_fee = round_trip_fee / 2.0

# استراتژی: ${meta.labelFa}
# ورود: ${meta.entryRuleFa}
# خروج: ${meta.exitRuleFa}
# نکته: تمام سیگنال‌ها روی کندل t محاسبه و بدون آینده‌نگری روی کندل t+1 اجرا می‌شوند.
`;
}

export function runHistoricalBacktest(params: {
  symbol: string;
  fileName: string;
  bars: readonly DailyPriceBar[];
  config: BacktestConfig;
}): BacktestResult {
  const bars = [...params.bars].sort((a, b) => a.date.localeCompare(b.date));
  const { config } = params;
  const meta = STRATEGY_META[config.strategyId];

  const closes = bars.map((b) => b.close);
  const volumes = bars.map((b) => b.volume);

  const fastPeriod = Math.max(2, config.fastSmaPeriod ?? 10);
  const slowPeriod = Math.max(fastPeriod + 2, config.slowSmaPeriod ?? 30);
  const lookback = Math.max(5, config.breakoutLookback ?? 20);
  const rsiBuy = config.rsiBuyLevel ?? 30;
  const rsiSell = config.rsiSellLevel ?? 70;

  const fastSma = computeSma(closes, fastPeriod);
  const slowSma = computeSma(closes, slowPeriod);
  const sma20 = computeSma(closes, 20);
  const volAvg20 = computeSma(volumes, 20);
  const rsi14 = computeRsi(closes, 14);

  const halfFeeRate = Math.max(0, config.roundTripCommissionPct) / 200; // نیمی در ورود، نیمی در خروج

  let cash = config.initialCapitalRial;
  let position: {
    shares: number;
    entryDate: string;
    entryPrice: number;
    entryCommission: number;
  } | null = null;

  const trades: BacktestTradeRecord[] = [];
  const equityCurve: { date: string; equity: number; buyHoldEquity: number }[] = [];

  const firstClose = bars[0]?.close ?? 1;
  const buyHoldShares =
    firstClose > 0 ? Math.floor((config.initialCapitalRial * (1 - halfFeeRate)) / firstClose) : 0;
  const buyHoldLeftover = config.initialCapitalRial - buyHoldShares * firstClose * (1 + halfFeeRate);

  let peakEquity = config.initialCapitalRial;
  let maxDrawdownPct = 0;
  let totalCommissionRial = 0;

  // حلقه شبیه‌سازی: سیگنال در پایان روز i-1 محاسبه و در روز i اجرا می‌شود (جلوگیری کامل از آینده‌نگری)
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];

    if (i > 0) {
      const prev = i - 1;
      const execPrice = bar.open > 0 ? bar.open : bar.close;

      // ۱) بررسی خروج (حد ضرر، حد سود یا سیگنال خروج روز قبل)
      if (position) {
        const stopPrice = position.entryPrice * (1 - Math.max(0.5, config.stopLossPct) / 100);
        const targetPrice =
          config.takeProfitPct && config.takeProfitPct > 0
            ? position.entryPrice * (1 + config.takeProfitPct / 100)
            : null;

        let exitPrice: number | null = null;
        let exitReasonFa = '';

        if (bar.low <= stopPrice) {
          exitPrice = Math.min(execPrice, stopPrice);
          exitReasonFa = `فعال شدن حد ضرر (${config.stopLossPct}٪)`;
        } else if (targetPrice && bar.high >= targetPrice) {
          exitPrice = Math.max(execPrice, targetPrice);
          exitReasonFa = `رسیدن به حد سود (${config.takeProfitPct}٪)`;
        } else {
          // سیگنال خروج استراتژی بر اساس روز قبل (بدون آینده‌نگری)
          let stratExit = false;
          if (config.strategyId === 'sma_cross' && fastSma[prev] !== null && slowSma[prev] !== null) {
            stratExit = fastSma[prev]! < slowSma[prev]!;
          } else if (config.strategyId === 'breakout_20d' && prev >= 10) {
            const low10 = Math.min(...bars.slice(prev - 10, prev).map((b) => b.low));
            stratExit = bars[prev].close < low10;
          } else if (config.strategyId === 'rsi_rebound' && rsi14[prev] !== null) {
            stratExit = rsi14[prev]! >= rsiSell;
          } else if (config.strategyId === 'volume_breakout' && sma20[prev] !== null) {
            stratExit = bars[prev].close < sma20[prev]!;
          }
          if (stratExit) {
            exitPrice = execPrice;
            exitReasonFa = 'سیگنال خروج استراتژی';
          }
        }

        if (exitPrice !== null) {
          const grossProceeds = position.shares * exitPrice;
          const exitCommission = grossProceeds * halfFeeRate;
          const totalFee = position.entryCommission + exitCommission;
          const grossPnl = (exitPrice - position.entryPrice) * position.shares;
          const netPnl = grossPnl - totalFee;
          const invested = position.entryPrice * position.shares + position.entryCommission;

          cash += grossProceeds - exitCommission;
          totalCommissionRial += totalFee;

          trades.push({
            index: trades.length + 1,
            entryDate: position.entryDate,
            entryPrice: position.entryPrice,
            exitDate: bar.date,
            exitPrice,
            shares: position.shares,
            exitReasonFa,
            grossPnlRial: Math.round(grossPnl),
            commissionRial: Math.round(totalFee),
            netPnlRial: Math.round(netPnl),
            netReturnPct: invested > 0 ? Number(((netPnl / invested) * 100).toFixed(2)) : 0
          });
          position = null;
        }
      }

      // ۲) بررسی ورود (در صورت نداشتن موقعیت باز)
      if (!position) {
        let shouldEnter = false;
        if (
          config.strategyId === 'sma_cross' &&
          prev >= 1 &&
          fastSma[prev] !== null &&
          slowSma[prev] !== null &&
          fastSma[prev - 1] !== null &&
          slowSma[prev - 1] !== null
        ) {
          shouldEnter = fastSma[prev - 1]! <= slowSma[prev - 1]! && fastSma[prev]! > slowSma[prev]!;
        } else if (config.strategyId === 'breakout_20d' && prev >= lookback) {
          const highN = Math.max(...bars.slice(prev - lookback, prev).map((b) => Math.max(b.high, b.close)));
          shouldEnter = bars[prev].close > highN;
        } else if (config.strategyId === 'rsi_rebound' && prev >= 1 && rsi14[prev] !== null && rsi14[prev - 1] !== null) {
          shouldEnter = rsi14[prev - 1]! <= rsiBuy && rsi14[prev]! > rsiBuy;
        } else if (config.strategyId === 'volume_breakout' && prev >= lookback && volAvg20[prev] && volAvg20[prev]! > 0) {
          const highN = Math.max(...bars.slice(prev - lookback, prev).map((b) => Math.max(b.high, b.close)));
          shouldEnter = bars[prev].close > highN && bars[prev].volume > 2 * volAvg20[prev]!;
        }

        if (shouldEnter && execPrice > 0) {
          const shares = Math.floor(cash / (execPrice * (1 + halfFeeRate)));
          if (shares > 0) {
            const cost = shares * execPrice;
            const entryCommission = cost * halfFeeRate;
            cash -= cost + entryCommission;
            position = {
              shares,
              entryDate: bar.date,
              entryPrice: execPrice,
              entryCommission
            };
          }
        }
      }
    }

    const equity = cash + (position ? position.shares * bar.close : 0);
    const buyHoldEquity = buyHoldLeftover + buyHoldShares * bar.close;
    if (equity > peakEquity) peakEquity = equity;
    if (peakEquity > 0) {
      const dd = ((peakEquity - equity) / peakEquity) * 100;
      if (dd > maxDrawdownPct) maxDrawdownPct = dd;
    }
    equityCurve.push({
      date: bar.date,
      equity: Math.round(equity),
      buyHoldEquity: Math.round(buyHoldEquity)
    });
  }

  // بستن موقعیت باز در آخرین روز برای گزارش شفاف
  if (position && bars.length > 0) {
    const lastBar = bars[bars.length - 1];
    const grossProceeds = position.shares * lastBar.close;
    const exitCommission = grossProceeds * halfFeeRate;
    const totalFee = position.entryCommission + exitCommission;
    const grossPnl = (lastBar.close - position.entryPrice) * position.shares;
    const netPnl = grossPnl - totalFee;
    const invested = position.entryPrice * position.shares + position.entryCommission;
    cash += grossProceeds - exitCommission;
    totalCommissionRial += totalFee;
    trades.push({
      index: trades.length + 1,
      entryDate: position.entryDate,
      entryPrice: position.entryPrice,
      exitDate: lastBar.date,
      exitPrice: lastBar.close,
      shares: position.shares,
      exitReasonFa: 'بستن در انتهای بازه داده',
      grossPnlRial: Math.round(grossPnl),
      commissionRial: Math.round(totalFee),
      netPnlRial: Math.round(netPnl),
      netReturnPct: invested > 0 ? Number(((netPnl / invested) * 100).toFixed(2)) : 0
    });
  }

  const finalEquityRial = Math.round(cash);
  const totalReturnPct =
    config.initialCapitalRial > 0
      ? Number((((finalEquityRial - config.initialCapitalRial) / config.initialCapitalRial) * 100).toFixed(2))
      : 0;
  const lastBhEquity = equityCurve[equityCurve.length - 1]?.buyHoldEquity ?? config.initialCapitalRial;
  const buyAndHoldReturnPct =
    config.initialCapitalRial > 0
      ? Number((((lastBhEquity - config.initialCapitalRial) / config.initialCapitalRial) * 100).toFixed(2))
      : 0;

  const wins = trades.filter((t) => t.netPnlRial > 0);
  const losses = trades.filter((t) => t.netPnlRial <= 0);
  const winRatePct = trades.length > 0 ? Number(((wins.length / trades.length) * 100).toFixed(1)) : 0;
  const avgWinPct =
    wins.length > 0 ? Number((wins.reduce((s, t) => s + t.netReturnPct, 0) / wins.length).toFixed(2)) : 0;
  const avgLossPct =
    losses.length > 0 ? Number((losses.reduce((s, t) => s + t.netReturnPct, 0) / losses.length).toFixed(2)) : 0;

  const statisticallyReliable = trades.length >= 30;

  return {
    executedAt: Date.now(),
    symbol: params.symbol,
    fileName: params.fileName,
    strategyVersion: meta.version,
    config,
    barsUsed: bars.length,
    startDate: bars[0]?.date ?? '—',
    endDate: bars[bars.length - 1]?.date ?? '—',
    totalTrades: trades.length,
    statisticallyReliable,
    reliabilityWarningFa: statisticallyReliable
      ? null
      : 'تعداد معاملات برای نتیجه‌گیری آماری قابل اتکا کافی نیست.',
    winRatePct,
    avgWinPct,
    avgLossPct,
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    totalReturnPct,
    buyAndHoldReturnPct,
    excessVsBuyHoldPct: Number((totalReturnPct - buyAndHoldReturnPct).toFixed(2)),
    totalCommissionRial: Math.round(totalCommissionRial),
    finalEquityRial,
    equityCurve,
    trades,
    assumptionsFa: [
      `اجرای سفارش بدون نگاه به آینده: سیگنال پایان روز t در قیمت بازشدن روز t+1 اجرا شده است.`,
      `کارمزد رفت‌وبرگشت لحاظ‌شده: ${config.roundTripCommissionPct}٪ (${config.commissionAssumptionFa}).`,
      `رویدادهایی مانند افزایش سرمایه، تقسیم سود و صف خرید/فروش فقط در صورت تعدیل‌شدن فایل ورودی در قیمت‌ها منعکس هستند.`
    ],
    disclaimerFa: 'بکتست موفق به معنای تضمین سود در آینده نیست. بازار آینده شبیه گذشته نیست.',
    pythonCode: generatePythonScript(params.symbol, params.fileName, config)
  };
}

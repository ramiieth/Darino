/**
 * Trading Analytics — شاخص‌های محاسبه‌شده از داده‌های عمومی userFills (نه از API)
 * همه توابع Pure و قابل تست
 */
import type { HlFill } from '@/features/hyperliquid/data/hyperliquidService';

export interface TradeAnalytics {
  /** تعداد معاملات (فیل‌ها) */
  totalTrades: number;
  /** نرخ برد = معاملات سودده / کل */
  winRate: number | null;
  /** میانگین سود هر معامله سودده */
  avgWin: number | null;
  /** میانگین زیان هر معامله زیان‌ده */
  avgLoss: number | null;
  /** نسبت سود به زیان (Profit Factor) = مجموع سود / مجموع زیان */
  profitFactor: number | null;
  /** مجموع سود محقق‌شده (بدون هزینه) */
  totalRealizedPnl: number;
  /** مجموع هزینه‌ها */
  totalFees: number;
  /** خالص سود = مجموع سود − هزینه */
  netPnl: number;
  /** بیشترین برد متوالی */
  maxWinStreak: number;
  /** بیشترین باخت متوالی */
  maxLossStreak: number;
  /** بهترین معامله */
  bestTrade: { pnl: number; coin: string; time: number } | null;
  /** بدترین معامله */
  worstTrade: { pnl: number; coin: string; time: number } | null;
  /** میانگین مدت نگهداری (ساعت) — از فاصله Open تا Close همان coin */
  avgHoldingHours: number | null;
  /** توزیع Long/Short */
  longCount: number;
  shortCount: number;
  /** توزیع بر اساس نماد */
  bySymbol: { symbol: string; count: number; pnl: number }[];
  /** بزرگ‌ترین معامله (حجم × قیمت) */
  largestTrade: { notional: number; coin: string } | null;
  /** کوچک‌ترین معامله */
  smallestTrade: { notional: number; coin: string } | null;
}

/** تشخیص جهت فیل: Open Long / Open Short / Close Long / Close Short */
export function fillDirection(fill: HlFill): 'openLong' | 'openShort' | 'closeLong' | 'closeShort' {
  const dir = fill.dir ?? '';
  const side = fill.side;
  if (dir === 'Open Long') return 'openLong';
  if (dir === 'Open Short') return 'openShort';
  if (dir === 'Close Long') return 'closeLong';
  if (dir === 'Close Short') return 'closeShort';
  // فالبک: از روی side و startPosition
  if (side === 'B') {
    const start = parseFloat(fill.startPosition ?? '0');
    return start <= 0 ? 'openLong' : 'closeLong';
  }
  const start = parseFloat(fill.startPosition ?? '0');
  return start >= 0 ? 'openShort' : 'closeShort';
}

/** میانگین مدت نگهداری: برای هر Close، آخرین Open همان coin قبل از آن */
export function avgHoldingHours(fills: HlFill[]): number | null {
  const opens: { coin: string; time: number }[] = [];
  const holds: number[] = [];
  for (const f of fills) {
    const dir = fillDirection(f);
    if (dir === 'openLong' || dir === 'openShort') {
      opens.push({ coin: f.coin, time: f.time });
    } else if (dir === 'closeLong' || dir === 'closeShort') {
      // آخرین Open همان coin قبل از این Close
      let best: { time: number } | null = null;
      for (const o of opens) {
        if (o.coin === f.coin && o.time <= f.time) {
          if (!best || o.time > best.time) best = o;
        }
      }
      if (best) holds.push((f.time - best.time) / 3_600_000);
    }
  }
  if (holds.length === 0) return null;
  return holds.reduce((a, b) => a + b, 0) / holds.length;
}

/** محاسبه همه شاخص‌ها از فیل‌ها */
export function computeTradeAnalytics(fills: HlFill[]): TradeAnalytics {
  const wins: number[] = [];
  const losses: number[] = [];
  let winStreak = 0;
  let lossStreak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let bestTrade: { pnl: number; coin: string; time: number } | null = null;
  let worstTrade: { pnl: number; coin: string; time: number } | null = null;
  let largest: { notional: number; coin: string } | null = null;
  let smallest: { notional: number; coin: string } | null = null;
  const bySymbolMap = new Map<string, { count: number; pnl: number }>();
  let longCount = 0;
  let shortCount = 0;
  let totalFees = 0;
  let totalRealized = 0;

  for (const f of fills) {
    const pnl = parseFloat(f.closedPnl ?? '0') || 0;
    const fee = parseFloat(f.fee ?? '0') || 0;
    totalRealized += pnl;
    totalFees += fee;
    totalFees; // برای netPnl

    const dir = fillDirection(f);
    if (dir === 'openLong' || dir === 'closeLong') longCount++;
    else shortCount++;

    const notional = Math.abs(parseFloat(f.px) * parseFloat(f.sz));

    if (pnl > 0) {
      wins.push(pnl);
      winStreak++;
      lossStreak = 0;
      maxWinStreak = Math.max(maxWinStreak, winStreak);
      if (!bestTrade || pnl > bestTrade.pnl) bestTrade = { pnl, coin: f.coin, time: f.time };
    } else if (pnl < 0) {
      losses.push(pnl);
      lossStreak++;
      winStreak = 0;
      maxLossStreak = Math.max(maxLossStreak, lossStreak);
      if (!worstTrade || pnl < worstTrade.pnl) worstTrade = { pnl, coin: f.coin, time: f.time };
    } else {
      winStreak = 0;
      lossStreak = 0;
    }

    if (!largest || notional > largest.notional) largest = { notional, coin: f.coin };
    if (!smallest || notional < smallest.notional) smallest = { notional, coin: f.coin };

    const rec = bySymbolMap.get(f.coin) ?? { count: 0, pnl: 0 };
    rec.count++;
    rec.pnl += pnl;
    bySymbolMap.set(f.coin, rec);
  }

  const bySymbol = [...bySymbolMap.entries()]
    .map(([symbol, v]) => ({ symbol, count: v.count, pnl: v.pnl }))
    .sort((a, b) => b.count - a.count);

  const totalTrades = fills.length;
  const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : null;
  const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : null;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : null;
  const sumWin = wins.reduce((a, b) => a + b, 0);
  const sumLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const profitFactor = sumLoss > 0 ? sumWin / sumLoss : sumWin > 0 ? Infinity : null;

  return {
    totalTrades,
    winRate,
    avgWin,
    avgLoss,
    profitFactor,
    totalRealizedPnl: totalRealized,
    totalFees,
    netPnl: totalRealized - totalFees,
    maxWinStreak,
    maxLossStreak,
    bestTrade,
    worstTrade,
    avgHoldingHours: avgHoldingHours(fills),
    longCount,
    shortCount,
    bySymbol,
    largestTrade: largest,
    smallestTrade: smallest
  };
}

/** سری PnL تجمعی (برای نمودار رشد) */
export function cumulativePnlSeries(fills: HlFill[]): { t: number; pnl: number }[] {
  const sorted = [...fills].sort((a, b) => a.time - b.time);
  let acc = 0;
  return sorted.map((f) => {
    acc += parseFloat(f.closedPnl ?? '0') || 0;
    return { t: f.time, pnl: acc };
  });
}

/** PnL روزانه (برای نمودار/کارت) */
export function dailyPnl(fills: HlFill[]): { date: string; pnl: number }[] {
  const map = new Map<string, number>();
  for (const f of fills) {
    const d = new Date(f.time).toISOString().slice(0, 10);
    map.set(d, (map.get(d) ?? 0) + (parseFloat(f.closedPnl ?? '0') || 0));
  }
  return [...map.entries()].map(([date, pnl]) => ({ date, pnl })).sort((a, b) => a.date.localeCompare(b.date));
}

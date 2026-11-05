/**
 * اسپرد فاندینگ بین دو صرافی — دو پای پرپ با اندازهٔ برابر و جهت مخالف
 *
 *   اسپرد s = نرخ A − نرخ B (کسری ساعتی، مثبت = لانگ می‌پردازد)
 *   جهت +۱: شورت A / لانگ B → درآمد s · ناشنال      جهت −۱: شورت B / لانگ A → درآمد −s · ناشنال
 *   سرمایهٔ C نصف‌نصف مارجین دو صرافی → ناشنال N = C·L/2
 *
 * هر ساعت (مثل کری، بدون نگاه به آینده):
 *   ۱. کندل‌های بسته‌شده: لیکوئید پای شورت با بیشترین قیمت و پای لانگ با کمترین قیمت؛
 *      بعد ریبالانس اگر قیمت از باند گذشته باشد (بستن/باز کردن بخشی از دو پا + انتقال مارجین بین صرافی‌ها)
 *   ۲. تصمیم با میانگین اسپرد تسویه‌شدهٔ قبل از این ساعت؛ جهت = علامت میانگین
 *        always     همیشه باز در جهت میانگین ۷ روز (بعد از ۷ روز گرم شدن)
 *        threshold  ورود اگر |میانگین| ≥ آستانه، ماندن تا وقتی میانگین در جهت پوزیشن > آستانهٔ خروج
 *      عوض شدن جهت = بستن هر دو پا و باز کردن برعکس (دو بار هزینه)
 *   ۳. فاندینگ دو پا برای همین ساعت
 *
 * ساعت‌هایی که فقط یکی از دو صرافی فاندینگ دارد کنار می‌روند. قیمت هر دو پا یکی فرض شده (کندل یک صرافی).
 */
import {
  aprToHourly,
  cleanFunding,
  DAY_MS,
  evaluateRuns,
  gridConfigs,
  toRun,
  type Breakdown,
  type FundingPoint,
  type PriceBar,
  type Rule,
  type SimResult,
  type Study
} from './engine.js';

export interface SpreadCost {
  leverage: number;
  /** مارجین نگهداری (٪) — سخت‌گیرانه‌ترِ دو صرافی */
  mmrPct: number;
  feeAPct: number;
  feeBPct: number;
  slippagePct: number;
  /** هزینهٔ جابه‌جایی مارجین بین صرافی‌ها (٪ مبلغ منتقل‌شده) */
  transferPct: number;
  hurdleApr: number;
  idleEarnsHurdle: boolean;
}

export const ALWAYS_LOOKBACK_H = 168;

export interface SpreadPoint {
  hour: number;
  /** نرخ A − نرخ B */
  spread: number;
}

export function alignSpreadSeries(a: readonly FundingPoint[], b: readonly FundingPoint[]): SpreadPoint[] {
  const mb = new Map(cleanFunding(b).map((p) => [p.hour, p.rate]));
  return cleanFunding(a).flatMap((p) => {
    const rb = mb.get(p.hour);
    return rb === undefined ? [] : [{ hour: p.hour, spread: p.rate - rb }];
  });
}

/** فاصلهٔ لیکوئید یک پا با مارجین N/L و مارجین نگهداری mmr */
const liqDist = (leverage: number, mmrPct: number) => Math.max(0, (1 / leverage - mmrPct / 100) / (1 + mmrPct / 100));

export function simulateSpread(series: readonly SpreadPoint[], prices: readonly PriceBar[], rule: Rule, cost: SpreadCost): SimResult {
  const bars = [...prices].sort((x, y) => x.end - y.end);
  const legCost = (cost.feeAPct + cost.feeBPct + 2 * cost.slippagePct) / 100;
  const transfer = cost.transferPct / 100;
  const mmr = cost.mmrPct / 100;
  const rLiq = liqDist(cost.leverage, cost.mmrPct);
  const band = rLiq / 2;
  const idleHourly = aprToHourly(cost.hurdleApr);
  const nFrac = cost.leverage / 2;

  const isThreshold = rule.kind === 'threshold';
  const lookback = isThreshold ? Math.max(1, Math.round(rule.lookbackH)) : ALWAYS_LOOKBACK_H;
  const entryRate = isThreshold ? aprToHourly(rule.entryApr) : 0;
  const exitRate = isThreshold ? aprToHourly(rule.exitApr) : 0;

  let E = 1;
  let dir: 0 | 1 | -1 = 0;
  let Q = 0;
  let ref = 0;
  let price: number | null = null;
  let j = 0;
  let windowSum = 0;
  const br: Breakdown = { funding: 0, idle: 0, tradingFees: 0, rebalance: 0, liquidation: 0 };
  let entries = 0;
  const entryTimes: number[] = [];
  const liquidations: number[] = [];
  let peakLiqUse = 0;
  let hoursIn = 0;
  let negativeHoursIn = 0;
  const days: number[] = [];
  const equity: number[] = [];
  let curDay: number | null = null;
  const pushDay = (day: number) => {
    if (days.length && days[days.length - 1] === day) equity[equity.length - 1] = E;
    else {
      days.push(day);
      equity.push(E);
    }
  };
  const close = (p: number) => {
    const c = Q * p * legCost;
    E -= c;
    br.tradingFees -= c;
    dir = 0;
    Q = 0;
  };

  for (let i = 0; i < series.length; i++) {
    const t = series[i].hour;
    const day = Math.floor(t / DAY_MS) * DAY_MS;
    if (curDay !== null && day !== curDay) pushDay(curDay);
    curDay = day;

    while (j < bars.length && bars[j].end <= t) {
      const bar = bars[j++];
      const low = bar.low ?? bar.close;
      if (dir !== 0 && rLiq > 0) {
        const up = bar.high / ref - 1;
        const down = 1 - low / ref;
        peakLiqUse = Math.max(peakLiqUse, Math.min(1, Math.max(up, down) / rLiq));
        if (up >= rLiq || down >= rLiq) {
          // پای ضررده مارجین نگهداری‌اش را از دست می‌دهد؛ پای دیگر با هزینهٔ معامله بسته می‌شود
          const pL = up >= rLiq ? ref * (1 + rLiq) : ref * (1 - rLiq);
          const loss = Q * pL * mmr + (Q * pL * legCost) / 2;
          E -= loss;
          br.liquidation -= loss;
          liquidations.push(bar.end);
          dir = 0;
          Q = 0;
        } else if (Math.abs(bar.close / ref - 1) >= band) {
          const target = (E * nFrac) / bar.close;
          const c = Math.abs(target - Q) * bar.close * legCost + Q * Math.abs(bar.close - ref) * transfer;
          E -= c;
          br.rebalance -= c;
          Q = (E * nFrac) / bar.close;
          ref = bar.close;
        }
      }
      price = bar.close;
    }

    if (price !== null && i >= lookback) {
      const avg = windowSum / lookback;
      const sign: 1 | -1 = avg >= 0 ? 1 : -1;
      let want: 0 | 1 | -1;
      if (!isThreshold) want = avg === 0 ? dir : sign;
      else if (dir !== 0) want = dir * avg > exitRate ? dir : Math.abs(avg) >= entryRate ? sign : 0;
      else want = Math.abs(avg) >= entryRate ? sign : 0;
      if (want !== dir) {
        if (dir !== 0) close(price);
        if (want !== 0) {
          const N = E * nFrac;
          const c = N * legCost;
          E -= c;
          br.tradingFees -= c;
          Q = N / price;
          ref = price;
          dir = want;
          entries++;
          entryTimes.push(t);
        }
      }
    }

    const s = series[i].spread;
    if (dir !== 0 && price !== null) {
      const f = Q * price * dir * s;
      E += f;
      br.funding += f;
      hoursIn++;
      if (dir * s < 0) negativeHoursIn++;
    } else if (cost.idleEarnsHurdle) {
      const y = E * idleHourly;
      E += y;
      br.idle += y;
    }

    windowSum += s;
    if (i - lookback >= 0) windowSum -= series[i - lookback].spread;
  }

  if (dir !== 0 && price !== null) close(price);
  if (curDay !== null) pushDay(curDay);
  return { days, equity, breakdown: br, entries, entryTimes, liquidations, peakLiqUse, hoursIn, hoursTotal: series.length, negativeHoursIn };
}

/** همان ۲۵ قانون و همان داور کری (پیش‌رونده، DSR، پایداری، لیکوئید) */
export function runSpreadStudy(a: readonly FundingPoint[], b: readonly FundingPoint[], prices: readonly PriceBar[], cost: SpreadCost, priorTrials = 0): Study {
  const series = alignSpreadSeries(a, b);
  return evaluateRuns(
    gridConfigs().map((g) => toRun(g, simulateSpread(series, prices, g.rule, cost), cost.hurdleApr)),
    cost.hurdleApr,
    priorTrials
  );
}

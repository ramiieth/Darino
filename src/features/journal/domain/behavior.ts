/**
 * کالبدشکافی رفتاری — الگوهایی که فقط با کنار هم گذاشتن معاملات در زمان دیده می‌شوند
 * هر الگو فقط وقتی گزارش می‌شود که داده پشتش باشد، و همیشه با هزینهٔ دلاری‌اش.
 *
 *  ۱ معاملهٔ انتقامی   ۲ نگه‌داشتن ضررده   ۳ روزهای شلوغ (Tilt)   ۴ اعتمادبه‌نفس بعد از برد
 *  ۵ اندازه بعد از رشته   ۶ ساعت و روز هفته   ۷ نماد   ۸ لانگ/شورت   ۹ تگ «چرا»
 *  ۱۰ نظم استاپ   ۱۱ پرمعاملگی   ۱۲ تناقض یادداشت با نتیجه
 * به‌علاوهٔ «فرض خلاف واقع»ها برای رتبه‌بندی دلاری (سقف زیان، حذف معاملات بعد از N در روز).
 */
import type { ClassifiedTrade, TradeNote } from './types';
import { dayKey, hourOf, mean, median, weekdayOf, WEEKDAY_FA } from './time';
import { isScratch, scratchFloorOf, type PlannedRisk } from './metrics';

export interface Bucket {
  key: string;
  label: string;
  n: number;
  net: number;
  expectancy: number;
  winRate: number | null;
  /** KEEP / FIX / DELETE */
  verdict: 'keep' | 'fix' | 'delete' | 'thin';
}

export interface Leak {
  id: string;
  title: string;
  /** هزینهٔ دلاری (مثبت = پولی که از دست رفته) */
  cost: number;
  detail: string;
  fix: string;
  /** قانون سخت برگرفته از دادهٔ خود کاربر */
  rule: string;
  n: number;
}

export interface Behavior {
  revenge: { n: number; fasterShare: number | null; medianGapMs: number | null; postLossGapMs: number | null; sizeRatio: number | null; winRate: number | null; baseWinRate: number | null; cost: number } | null;
  holding: { winMs: number | null; lossMs: number | null; ratio: number | null; longLosers: number; cost: number } | null;
  tilt: { days: string[]; threshold: number; tiltNet: number; normalNet: number; tiltPerTrade: number | null; normalPerTrade: number | null } | null;
  postWin: { n: number; winRate: number | null; baseWinRate: number | null; sizeRatio: number | null } | null;
  sizing: { afterWins: number | null; afterLosses: number | null } | null;
  byHour: Bucket[];
  byWeekday: Bucket[];
  bySymbol: Bucket[];
  byDirection: Bucket[];
  byTag: Bucket[];
  byTagPreOnly: Bucket[];
  stops: { planned: number; violations: number; excess: number } | null;
  overtrading: { buckets: Bucket[]; capN: number; netIfCapped: number; delta: number } | null;
  contradictions: { tradeId: string; quote: string; net: number }[];
  capLosers: { cap: number; netIfCapped: number; delta: number } | null;
  leaks: Leak[];
}

function bucket(key: string, label: string, ts: readonly ClassifiedTrade[], floor: number, minN = 3): Bucket {
  const n = ts.length;
  const net = ts.reduce((s, t) => s + t.netPnl, 0);
  const decisive = ts.filter((t) => !isScratch(t, floor));
  const wins = decisive.filter((t) => t.netPnl > 0).length;
  const expectancy = n ? net / n : 0;
  const verdict = n < minN ? 'thin' : expectancy > 0 ? 'keep' : net < 0 && expectancy < 0 && wins / Math.max(1, decisive.length) < 0.4 ? 'delete' : 'fix';
  return { key, label, n, net, expectancy, winRate: decisive.length ? (wins / decisive.length) * 100 : null, verdict };
}

function groupBy(ts: readonly ClassifiedTrade[], key: (t: ClassifiedTrade) => string | null): Map<string, ClassifiedTrade[]> {
  const m = new Map<string, ClassifiedTrade[]>();
  for (const t of ts) {
    const k = key(t);
    if (k === null) continue;
    const g = m.get(k);
    if (g) g.push(t);
    else m.set(k, [t]);
  }
  return m;
}

const CONFIDENT = /(مطمئن|تمیز|قوی|عالی|قطعی|بی‌نقص|ستاپ خوب|clean|conviction|sure|perfect|a\+|high confidence)/i;
const fmt = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 })}`;

export function analyzeBehavior(
  input: readonly ClassifiedTrade[],
  opts: { tz: string; notes: ReadonlyMap<string, TradeNote>; risks: ReadonlyMap<string, PlannedRisk> }
): Behavior {
  const trades = [...input].sort((a, b) => a.openTime - b.openTime);
  const floor = scratchFloorOf(trades);
  const isWin = (t: ClassifiedTrade) => !isScratch(t, floor) && t.netPnl > 0;
  const isLoss = (t: ClassifiedTrade) => !isScratch(t, floor) && t.netPnl < 0;
  const leaks: Leak[] = [];
  const baseWins = trades.filter((t) => !isScratch(t, floor));
  const baseWinRate = baseWins.length ? (baseWins.filter((t) => t.netPnl > 0).length / baseWins.length) * 100 : null;
  const meanSize = mean(trades.map((t) => t.maxNotional).filter((x) => x > 0));

  // فاصلهٔ هر معامله از بستن معاملهٔ قبلی (در همان دفتر)
  const gaps: number[] = [];
  const prevOf = new Map<ClassifiedTrade, ClassifiedTrade>();
  for (let i = 1; i < trades.length; i++) {
    // آخرین معامله‌ای که قبل از باز شدن این یکی بسته شده
    let j = i - 1;
    while (j >= 0 && (trades[j].closeTime ?? Infinity) > trades[i].openTime) j--;
    if (j < 0) continue;
    prevOf.set(trades[i], trades[j]);
    gaps.push(trades[i].openTime - (trades[j].closeTime as number));
  }
  const medianGap = median(gaps);

  /* ۱ — انتقامی */
  let revenge: Behavior['revenge'] = null;
  const postLoss = trades.filter((t) => { const p = prevOf.get(t); return p && isLoss(p); });
  if (postLoss.length >= 3 && medianGap !== null) {
    const faster = postLoss.filter((t) => t.openTime - (prevOf.get(t)!.closeTime as number) < medianGap);
    const decisive = postLoss.filter((t) => !isScratch(t, floor));
    const cost = -Math.min(0, faster.reduce((s, t) => s + t.netPnl, 0));
    revenge = {
      n: postLoss.length,
      fasterShare: (faster.length / postLoss.length) * 100,
      medianGapMs: medianGap,
      postLossGapMs: median(postLoss.map((t) => t.openTime - (prevOf.get(t)!.closeTime as number))),
      sizeRatio: meanSize ? (mean(postLoss.map((t) => t.maxNotional)) ?? 0) / meanSize : null,
      winRate: decisive.length ? (decisive.filter((t) => t.netPnl > 0).length / decisive.length) * 100 : null,
      baseWinRate,
      cost
    };
    if (cost > 0 && faster.length >= 2) {
      const mins = Math.max(15, Math.round(medianGap / 60_000));
      leaks.push({
        id: 'revenge',
        title: 'ورود سریع بعد از ضرر (معاملهٔ انتقامی)',
        cost,
        n: faster.length,
        detail: `${faster.length} معامله زودتر از فاصلهٔ معمول شما (${mins} دقیقه) بعد از یک ضرر باز شده و جمعاً ${fmt(-cost)} نتیجه داده.`,
        fix: 'بعد از هر ضرر، تا پایان فاصلهٔ معمولتان وارد نشوید.',
        rule: `تا ${mins} دقیقه بعد از بستن معاملهٔ ضررده، معاملهٔ تازه ممنوع.`
      });
    }
  }

  /* ۲ — نگه‌داشتن ضررده */
  let holding: Behavior['holding'] = null;
  const winHold = mean(trades.filter(isWin).map((t) => (t.closeTime ?? 0) - t.openTime));
  const lossHold = mean(trades.filter(isLoss).map((t) => (t.closeTime ?? 0) - t.openTime));
  if (winHold !== null && lossHold !== null && trades.filter(isWin).length >= 3 && trades.filter(isLoss).length >= 3) {
    const medWin = median(trades.filter(isWin).map((t) => (t.closeTime ?? 0) - t.openTime)) ?? winHold;
    const longLosers = trades.filter((t) => isLoss(t) && (t.closeTime ?? 0) - t.openTime > 2 * medWin);
    const avgShortLoss = mean(trades.filter((t) => isLoss(t) && (t.closeTime ?? 0) - t.openTime <= 2 * medWin).map((t) => t.netPnl));
    // فرض خلاف واقع: ضرردهٔ طولانی اگر مثل ضرردهٔ کوتاه بسته می‌شد
    const cost = avgShortLoss === null ? 0 : Math.max(0, longLosers.reduce((s, t) => s + (avgShortLoss - t.netPnl), 0));
    holding = { winMs: winHold, lossMs: lossHold, ratio: winHold > 0 ? lossHold / winHold : null, longLosers: longLosers.length, cost };
    if (cost > 0 && longLosers.length >= 2 && holding.ratio !== null && holding.ratio > 1.5) {
      leaks.push({
        id: 'holding',
        title: 'ضرردهٔ طولانی‌تر از سودده نگه داشته می‌شود',
        cost,
        n: longLosers.length,
        detail: `ضرردهٔ شما به‌طور میانگین ${holding.ratio.toFixed(1)} برابر سودده باز می‌ماند؛ ${longLosers.length} ضررده بیش از دو برابر زمان معمول یک سودده باز ماند.`,
        fix: 'برای هر معامله سقف زمانی بگذارید؛ اگر تا آن زمان به هدف نرسید، ببندید.',
        rule: `هر معامله‌ای که بعد از ${Math.max(1, Math.round((2 * medWin) / 3_600_000))} ساعت هنوز در ضرر است بسته می‌شود.`
      });
    }
  }

  /* ۳ — روزهای شلوغ */
  let tilt: Behavior['tilt'] = null;
  const byDay = groupBy(trades, (t) => dayKey(t.openTime, opts.tz));
  const counts = [...byDay.values()].map((g) => g.length);
  const medCount = median(counts);
  if (byDay.size >= 5 && medCount !== null) {
    const threshold = Math.max(4, Math.ceil(medCount * 2));
    const tiltDays = [...byDay.entries()].filter(([, g]) => g.length >= threshold);
    const tiltTrades = tiltDays.flatMap(([, g]) => g);
    const tiltSet = new Set(tiltTrades);
    const normal = trades.filter((t) => !tiltSet.has(t));
    const tiltNet = tiltTrades.reduce((s, t) => s + t.netPnl, 0);
    tilt = {
      days: tiltDays.map(([k]) => k),
      threshold,
      tiltNet,
      normalNet: normal.reduce((s, t) => s + t.netPnl, 0),
      tiltPerTrade: tiltTrades.length ? tiltNet / tiltTrades.length : null,
      normalPerTrade: normal.length ? normal.reduce((s, t) => s + t.netPnl, 0) / normal.length : null
    };
    if (tiltNet < 0 && tiltDays.length >= 1) {
      leaks.push({
        id: 'tilt',
        title: 'روزهای پرمعامله (Tilt)',
        cost: -tiltNet,
        n: tiltTrades.length,
        detail: `${tiltDays.length} روز با ${threshold} معامله یا بیشتر، جمعاً ${fmt(tiltNet)}؛ در روزهای عادی هر معامله ${fmt(tilt.normalPerTrade ?? 0)} نتیجه داده.`,
        fix: 'سقف تعداد معامله در روز بگذارید.',
        rule: `حداکثر ${Math.max(2, threshold - 1)} معامله در روز.`
      });
    }
  }

  /* ۴ — بعد از برد بزرگ */
  let postWin: Behavior['postWin'] = null;
  const winVals = trades.filter(isWin).map((t) => t.netPnl).sort((a, b) => a - b);
  if (winVals.length >= 4) {
    const big = winVals[Math.floor(winVals.length * 0.75)];
    const after = trades.filter((t) => { const p = prevOf.get(t); return p && isWin(p) && p.netPnl >= big; });
    if (after.length >= 3) {
      const d = after.filter((t) => !isScratch(t, floor));
      postWin = {
        n: after.length,
        winRate: d.length ? (d.filter((t) => t.netPnl > 0).length / d.length) * 100 : null,
        baseWinRate,
        sizeRatio: meanSize ? (mean(after.map((t) => t.maxNotional)) ?? 0) / meanSize : null
      };
    }
  }

  /* ۵ — اندازه بعد از رشته */
  let sizing: Behavior['sizing'] = null;
  if (meanSize && trades.length >= 8) {
    const afterW: number[] = [], afterL: number[] = [];
    for (let i = 2; i < trades.length; i++) {
      const [a, b] = [trades[i - 2], trades[i - 1]];
      if (isWin(a) && isWin(b)) afterW.push(trades[i].maxNotional);
      if (isLoss(a) && isLoss(b)) afterL.push(trades[i].maxNotional);
    }
    sizing = { afterWins: afterW.length >= 2 ? (mean(afterW) ?? 0) / meanSize : null, afterLosses: afterL.length >= 2 ? (mean(afterL) ?? 0) / meanSize : null };
    if (sizing.afterLosses !== null && sizing.afterLosses > 1.3) {
      const after = trades.filter((_, i) => i >= 2 && isLoss(trades[i - 2]) && isLoss(trades[i - 1]));
      const net = after.reduce((s, t) => s + t.netPnl, 0);
      if (net < 0) {
        leaks.push({
          id: 'sizing',
          title: 'بزرگ‌کردن حجم بعد از ضررهای پشت‌سرهم',
          cost: -net,
          n: after.length,
          detail: `بعد از دو ضرر پیاپی، اندازهٔ معامله ${sizing.afterLosses.toFixed(1)} برابر معمول بوده و ${fmt(net)} نتیجه داده.`,
          fix: 'بعد از دو ضرر پیاپی، حجم را نصف کنید، نه دو برابر.',
          rule: 'بعد از دو ضرر پیاپی، اندازهٔ معاملهٔ بعدی حداکثر نصف اندازهٔ معمول.'
        });
      }
    }
  }

  /* ۶ ۷ ۸ ۹ — سطل‌ها */
  const toBuckets = (m: Map<string, ClassifiedTrade[]>, label: (k: string) => string) =>
    [...m.entries()].map(([k, g]) => bucket(k, label(k), g, floor)).sort((a, b) => a.expectancy - b.expectancy);
  const byHour = toBuckets(groupBy(trades, (t) => String(hourOf(t.openTime, opts.tz))), (k) => `ساعت ${k}`).sort((a, b) => Number(a.key) - Number(b.key));
  const byWeekday = toBuckets(groupBy(trades, (t) => String(weekdayOf(t.openTime, opts.tz))), (k) => WEEKDAY_FA[Number(k)]).sort((a, b) => ((Number(a.key) + 1) % 7) - ((Number(b.key) + 1) % 7));
  const bySymbol = toBuckets(groupBy(trades, (t) => t.base), (k) => k);
  const byDirection = toBuckets(groupBy(trades, (t) => t.direction), (k) => (k === 'long' ? 'لانگ' : 'شورت'));
  const tagMap = new Map<string, ClassifiedTrade[]>();
  const tagPre = new Map<string, ClassifiedTrade[]>();
  for (const t of trades) {
    const note = opts.notes.get(t.id);
    for (const tag of note?.whyTags ?? []) {
      (tagMap.get(tag) ?? tagMap.set(tag, []).get(tag)!).push(t);
      if (note?.whyTaggedBeforeClose) (tagPre.get(tag) ?? tagPre.set(tag, []).get(tag)!).push(t);
    }
  }
  const byTag = toBuckets(tagMap, (k) => k);
  const byTagPreOnly = toBuckets(tagPre, (k) => k);

  const worstOf = (bs: Bucket[], id: string, what: (b: Bucket) => string, rule: (b: Bucket) => string) => {
    // سطلی که تقریباً همهٔ معاملات در آن است «نشتی» نیست، خودِ کل نتیجه است — باید چیزی برای مقایسه باشد
    const comparable = bs.filter((b) => b.verdict !== 'thin');
    if (comparable.length < 2) return;
    const w = comparable.filter((b) => b.net < 0 && b.n <= trades.length * 0.8).sort((a, b) => a.net - b.net)[0];
    if (!w) return;
    leaks.push({ id: `${id}:${w.key}`, title: what(w), cost: -w.net, n: w.n, detail: `${w.n} معامله، جمعاً ${fmt(w.net)}، هر معامله به‌طور میانگین ${fmt(w.expectancy)}.`, fix: rule(w), rule: rule(w) });
  };
  worstOf(byHour, 'hour', (b) => `${b.label} پول می‌برد`, (b) => `در ${b.label} (به وقت محلی) معامله باز نکنید.`);
  worstOf(byWeekday, 'weekday', (b) => `${b.label}ها پول می‌برد`, (b) => `${b.label}ها معامله باز نکنید یا حجم را نصف کنید.`);
  worstOf(bySymbol, 'symbol', (b) => `نماد ${b.label} مدام ضرر می‌دهد`, (b) => `${b.label} را تا مرور ماه بعد از فهرست معامله حذف کنید.`);
  if (byDirection.length === 2 && byDirection.every((b) => b.verdict !== 'thin')) worstOf(byDirection, 'direction', (b) => `سمت ${b.label} سمت دیگر را خرج می‌کند`, (b) => `${b.label} فقط با برنامهٔ ثبت‌شده و نصف حجم.`);
  worstOf(byTagPreOnly.length ? byTagPreOnly : byTag, 'tag', (b) => `ورود «${b.label}» ضرر می‌دهد`, (b) => `ورود «${b.label}» را از برنامه حذف کنید.`);

  /* ۱۰ — نظم استاپ (فقط معاملات دارای برنامه با استاپ) */
  let stops: Behavior['stops'] = null;
  const withRisk = trades.filter((t) => opts.risks.has(t.id));
  if (withRisk.length) {
    const viol = withRisk.filter((t) => t.netPnl < -1.1 * opts.risks.get(t.id)!.riskUsd);
    const excess = viol.reduce((s, t) => s + (-t.netPnl - opts.risks.get(t.id)!.riskUsd), 0);
    stops = { planned: withRisk.length, violations: viol.length, excess };
    if (excess > 0) {
      leaks.push({
        id: 'stops',
        title: 'زیان بیشتر از استاپ برنامه (استاپ جابه‌جا یا رعایت نشد)',
        cost: excess,
        n: viol.length,
        detail: `${viol.length} از ${withRisk.length} معاملهٔ برنامه‌دار بیش از ۱۱۰٪ ریسک برنامه زیان داده‌اند؛ اضافهٔ زیان ${fmt(-excess)}.`,
        fix: 'استاپ را هنگام ورود در صرافی ثبت کنید و هرگز دورتر نبرید.',
        rule: 'استاپ همراه سفارش ورود ثبت می‌شود و فقط به سمت سود جابه‌جا می‌شود.'
      });
    }
  }

  /* ۱۱ — پرمعاملگی: اگر فقط N معاملهٔ اول هر روز گرفته می‌شد */
  let overtrading: Behavior['overtrading'] = null;
  if (byDay.size >= 5) {
    const label = (c: number) => (c >= 5 ? '5+' : c >= 3 ? '3-4' : String(c));
    const LABEL_FA: Record<string, string> = { '1': 'روزهای تک‌معامله', '2': 'روزهای ۲ معامله‌ای', '3-4': 'روزهای ۳ تا ۴ معامله‌ای', '5+': 'روزهای ۵ معامله یا بیشتر' };
    const m = new Map<string, ClassifiedTrade[]>();
    for (const g of byDay.values()) {
      const k = label(g.length);
      (m.get(k) ?? m.set(k, []).get(k)!).push(...g);
    }
    const order = ['1', '2', '3-4', '5+'];
    const buckets = [...m.entries()].map(([k, g]) => bucket(k, LABEL_FA[k], g, floor)).sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    const capN = 2;
    const capped = [...byDay.values()].flatMap((g) => [...g].sort((a, b) => a.openTime - b.openTime).slice(0, capN));
    const netAll = trades.reduce((s, t) => s + t.netPnl, 0);
    const netIfCapped = capped.reduce((s, t) => s + t.netPnl, 0);
    overtrading = { buckets, capN, netIfCapped, delta: netIfCapped - netAll };
    if (overtrading.delta > 0 && !leaks.some((l) => l.id === 'tilt')) {
      leaks.push({
        id: 'overtrading',
        title: 'معاملات اضافه در یک روز',
        cost: overtrading.delta,
        n: trades.length - capped.length,
        detail: `اگر فقط ${capN} معاملهٔ اول هر روز گرفته می‌شد، نتیجه ${fmt(netIfCapped)} بود به‌جای ${fmt(netAll)}.`,
        fix: `بعد از ${capN} معامله در روز، پلتفرم را ببندید.`,
        rule: `حداکثر ${capN} معامله در روز.`
      });
    }
  }

  /* ۱۲ — تناقض یادداشت با نتیجه */
  const contradictions = trades
    .flatMap((t) => {
      const note = opts.notes.get(t.id)?.note?.trim();
      return note && CONFIDENT.test(note) && isLoss(t) ? [{ tradeId: t.id, quote: note.slice(0, 160), net: t.netPnl }] : [];
    })
    .slice(0, 10);

  /* فرض خلاف واقع: سقف زیان به اندازهٔ میانگین سود */
  let capLosers: Behavior['capLosers'] = null;
  const avgWin = mean(trades.filter(isWin).map((t) => t.netPnl));
  if (avgWin && trades.filter(isLoss).length >= 3) {
    const netAll = trades.reduce((s, t) => s + t.netPnl, 0);
    const netIfCapped = trades.reduce((s, t) => s + (t.netPnl < -avgWin ? -avgWin : t.netPnl), 0);
    capLosers = { cap: avgWin, netIfCapped, delta: netIfCapped - netAll };
    if (capLosers.delta > 0) {
      leaks.push({
        id: 'cap-losers',
        title: 'زیان‌های بزرگ‌تر از میانگین سود',
        cost: capLosers.delta,
        n: trades.filter((t) => t.netPnl < -avgWin).length,
        detail: `اگر هر زیان به اندازهٔ میانگین سود شما (${fmt(avgWin)}) محدود می‌شد، نتیجه ${fmt(netIfCapped)} بود به‌جای ${fmt(netAll)}.`,
        fix: `ریسک هر معامله را طوری بچینید که زیان از ${fmt(avgWin)} بیشتر نشود.`,
        rule: `سقف زیان هر معامله ${fmt(Math.round(avgWin))}؛ اندازه از فاصلهٔ استاپ حساب می‌شود.`
      });
    }
  }

  // هم‌پوشانی: «سقف زیان» و «نظم استاپ» یک مشکل‌اند؛ دومی دقیق‌تر است
  const dedup = leaks.filter((l) => !(l.id === 'cap-losers' && leaks.some((x) => x.id === 'stops')));
  dedup.sort((a, b) => b.cost - a.cost);

  return { revenge, holding, tilt, postWin, sizing, byHour, byWeekday, bySymbol, byDirection, byTag, byTagPreOnly, stops, overtrading, contradictions, capLosers, leaks: dedup };
}

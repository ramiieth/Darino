/**
 * دفتر دلتا نوترال — معیارهای فارم پوینت، فاندینگ و حجم (نه معیارهای جهت‌دار)
 *
 *   برای این دفتر «نرخ برد» معنا ندارد. سؤال‌ها این‌هاست:
 *     • چقدر حجم ساختم (برای پوینت/ایردراپ) و هر ۱ میلیون دلار حجم چقدر برایم هزینه داشت؟
 *     • فاندینگ دریافتی، کارمزد و اختلاف قیمت پاها در مجموع چه شد؟
 *     • پوشش‌ها چقدر متعادل بودند (ریسک جهت‌دار پنهان)؟
 *   لایتر فاندینگ عمومی نمی‌دهد؛ برای حساب‌های لایتر سری روزانهٔ خود لایتر (trade_pnl شامل فاندینگ و سود باز، و حجم روزانه) جداگانه نمایش داده می‌شود.
 */
import type { ClassifiedTrade, Fill, FundingEvent, JournalAccount } from './types';
import { VENUE_COVERAGE } from './types';
import { dayKey, isoWeekKey } from './time';

export interface DailyAccountPoint {
  /** ثانیه */
  t: number;
  /** سود/زیان تجمعی معاملات طبق لایتر (شامل فاندینگ و سود باز) */
  pnl: number;
  /** حجم همان روز */
  volume: number;
}

export interface NeutralAccountStats {
  account: string;
  label: string;
  venue: JournalAccount['venue'];
  volume: number;
  fees: number | null;
  funding: number | null;
  /** سود قیمتی معاملات بستهٔ همین حساب */
  realized: number;
  /** realized − کارمزد + فاندینگ (مقادیر معلوم) */
  net: number;
  trades: number;
  openNotional: number;
  costPerMillion: number | null;
  activeDays: number;
  /** سری روزانهٔ خود پلتفرم (لایتر) در بازه */
  platform: { pnlChange: number | null; volume: number | null; days: number } | null;
}

export interface HedgeGroup {
  id: string;
  base: string;
  legs: ClassifiedTrade[];
  start: number;
  end: number | null;
  open: boolean;
  grossNotional: number;
  /** |جمع ارزش اسمی علامت‌دار| ÷ ارزش اسمی ناخالص — صفر = کاملاً متعادل */
  imbalancePct: number | null;
  net: number;
  funding: number | null;
  fees: number | null;
  days: number;
  apr: number | null;
}

export interface NeutralBook {
  accounts: NeutralAccountStats[];
  hedges: HedgeGroup[];
  unpaired: ClassifiedTrade[];
  totals: { volume: number; fees: number; funding: number; fundingPartial: boolean; net: number; costPerMillion: number | null };
  /** جمع سری روزانهٔ خود پلتفرم (لایتر) در بازه: حجم و تغییر سود/زیان (شامل فاندینگ و سود باز) */
  platform: { volume: number; pnlChange: number; accounts: number; costPerMillion: number | null } | null;
  weeklyVolume: { week: string; byVenue: Record<string, number>; total: number }[];
  dailyNet: { day: string; net: number }[];
}

export function neutralBook(input: {
  trades: readonly ClassifiedTrade[];
  fills: readonly Fill[];
  funding: readonly FundingEvent[];
  accounts: readonly JournalAccount[];
  /** حساب‌هایی که نقششان نوترال است (حتی اگر در بازه معامله‌ای نداشته باشند) */
  neutralKeys: readonly string[];
  platformDaily: ReadonlyMap<string, DailyAccountPoint[]>;
  from: number;
  tz: string;
  now?: number;
}): NeutralBook {
  const now = input.now ?? Date.now();
  const neutralAccounts = new Set([...input.neutralKeys, ...input.trades.map((t) => t.account)]);
  const inRange = (t: number) => t >= input.from;
  const fills = input.fills.filter((f) => neutralAccounts.has(f.account) && inRange(f.time));
  const funding = input.funding.filter((e) => neutralAccounts.has(e.account) && inRange(e.time));
  const trades = input.trades.filter((t) => (t.closeTime ?? now) >= input.from);

  const accounts: NeutralAccountStats[] = [...neutralAccounts].map((key) => {
    const acc = input.accounts.find((a) => a.key === key);
    const fs = fills.filter((f) => f.account === key);
    const ts = trades.filter((t) => t.account === key);
    const volume = fs.reduce((s, f) => s + f.px * f.sz, 0);
    const feesKnown = fs.every((f) => f.fee !== null);
    const fees = feesKnown ? fs.reduce((s, f) => s + (f.fee ?? 0), 0) : null;
    const venue = acc?.venue ?? ts[0]?.venue ?? 'manual';
    const fundingKnown = VENUE_COVERAGE[venue].funding;
    const fund = fundingKnown ? funding.filter((e) => e.account === key).reduce((s, e) => s + e.amount, 0) : null;
    const realized = ts.filter((t) => !t.open).reduce((s, t) => s + t.grossPnl, 0);
    const net = realized - (fees ?? 0) + (fund ?? 0);
    const days = new Set(fs.map((f) => dayKey(f.time, input.tz))).size;
    const series = input.platformDaily.get(key);
    let platform: NeutralAccountStats['platform'] = null;
    if (series && series.length) {
      const pts = series.filter((p) => p.t * 1000 >= input.from).sort((a, b) => a.t - b.t);
      const before = series.filter((p) => p.t * 1000 < input.from).sort((a, b) => a.t - b.t).at(-1);
      const first = before ?? pts[0];
      const last = pts.at(-1);
      platform = { pnlChange: first && last ? last.pnl - first.pnl : null, volume: pts.reduce((s, p) => s + p.volume, 0), days: pts.length };
    }
    return {
      account: key,
      label: acc?.label ?? key,
      venue,
      volume,
      fees,
      funding: fund,
      realized,
      net,
      trades: ts.length,
      openNotional: ts.filter((t) => t.open).reduce((s, t) => s + t.maxNotional, 0),
      costPerMillion: volume > 0 ? (-net / volume) * 1e6 : null,
      activeDays: days,
      platform
    };
  });

  const groups = new Map<string, ClassifiedTrade[]>();
  const unpaired: ClassifiedTrade[] = [];
  for (const t of trades) {
    if (!t.hedgeGroup) { unpaired.push(t); continue; }
    (groups.get(t.hedgeGroup) ?? groups.set(t.hedgeGroup, []).get(t.hedgeGroup)!).push(t);
  }
  const hedges: HedgeGroup[] = [...groups.entries()].map(([id, legs]) => {
    const start = Math.min(...legs.map((l) => l.openTime));
    const open = legs.some((l) => l.open);
    const end = open ? null : Math.max(...legs.map((l) => l.closeTime ?? 0));
    const gross = legs.reduce((s, l) => s + l.maxNotional, 0);
    const signed = legs.reduce((s, l) => s + (l.direction === 'long' ? 1 : -1) * l.maxNotional, 0);
    const net = legs.reduce((s, l) => s + l.netPnl, 0);
    const fundingKnown = legs.every((l) => l.funding !== null);
    const feesKnown = legs.every((l) => l.fees !== null);
    const days = Math.max(1 / 24, ((end ?? now) - start) / 86_400_000);
    const avgNotional = gross / 2;
    return {
      id,
      base: legs[0].base,
      legs,
      start,
      end,
      open,
      grossNotional: gross,
      imbalancePct: gross > 0 ? (Math.abs(signed) / gross) * 100 : null,
      net,
      funding: fundingKnown ? legs.reduce((s, l) => s + (l.funding ?? 0), 0) : null,
      fees: feesKnown ? legs.reduce((s, l) => s + (l.fees ?? 0), 0) : null,
      days,
      apr: avgNotional > 0 && !open ? (net / avgNotional / days) * 365 * 100 : null
    };
  }).sort((a, b) => b.start - a.start);

  const weekly = new Map<string, Record<string, number>>();
  for (const f of fills) {
    const w = isoWeekKey(f.time, input.tz);
    const row = weekly.get(w) ?? {};
    row[f.venue] = (row[f.venue] ?? 0) + f.px * f.sz;
    weekly.set(w, row);
  }
  const daily = new Map<string, number>();
  for (const t of trades.filter((x) => !x.open)) {
    const d = dayKey(t.closeTime as number, input.tz);
    daily.set(d, (daily.get(d) ?? 0) + t.netPnl);
  }

  const volume = accounts.reduce((s, a) => s + a.volume, 0);
  const net = accounts.reduce((s, a) => s + a.net, 0);
  return {
    accounts: accounts.sort((a, b) => b.volume - a.volume),
    hedges,
    unpaired,
    totals: {
      volume,
      fees: accounts.reduce((s, a) => s + (a.fees ?? 0), 0),
      funding: accounts.reduce((s, a) => s + (a.funding ?? 0), 0),
      fundingPartial: accounts.some((a) => a.funding === null),
      net,
      costPerMillion: volume > 0 ? (-net / volume) * 1e6 : null
    },
    platform: (() => {
      const ps = accounts.map((a) => a.platform).filter((p): p is NonNullable<NeutralAccountStats['platform']> => !!p && p.volume !== null);
      if (!ps.length) return null;
      const v = ps.reduce((s, p) => s + (p.volume ?? 0), 0), pnl = ps.reduce((s, p) => s + (p.pnlChange ?? 0), 0);
      return { volume: v, pnlChange: pnl, accounts: ps.length, costPerMillion: v > 0 ? (-pnl / v) * 1e6 : null };
    })(),
    weeklyVolume: [...weekly.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, byVenue]) => ({ week, byVenue, total: Object.values(byVenue).reduce((s, v) => s + v, 0) })),
    dailyNet: [...daily.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, n]) => ({ day, net: n }))
  };
}

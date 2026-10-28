/**
 * پرتفوی پرپچوال — حساب‌های آرکوس، لایتر (رابین‌هود/اصلی)، هایپرلیکوئید و تی‌اکس‌فلو در یک مدل مشترک
 *
 *   سود/زیان باز حساب     = Σ سود/زیان باز پوزیشن‌ها؛ یکی نامعلوم → null (حدس زده نمی‌شود)
 *   سود/زیان کل حساب      آرکوس: ارزش − خالص واریز (مستند؛ برابر آخرین نقطهٔ perpAll)
 *                         لایتر: آخرین trade_pnl تجمعی سری /api/v1/pnl (فقط پرپ؛ اسپات جداست)
 *                         هایپرلیکوئید: آخرین نقطهٔ pnlHistory سری perpAllTime از info/portfolio
 *                         تی‌اکس‌فلو: ارزش − خالص واریز از userNonFundingLedgerUpdates (portfolio عمومی نیست)
 *   سود/زیان بسته‌شده      = سود/زیان کل − سود/زیان باز
 *                         (معاملات بسته‌شده + فاندینگ − کارمزد؛ پس از بستن همهٔ پوزیشن‌ها = سود/زیان کل)
 *   سود/زیان ۲۴ ساعت/۷/۳۰ روز
 *                         آرکوس: آخرین نقطهٔ pnlHistory سری perpDay/perpWeek/perpMonth (از صفر شروع می‌شود)
 *                         لایتر: trade_pnl اکنون − trade_pnl ابتدای بازه (حساب جدیدتر از بازه → مبنا صفر)
 *                         هایپرلیکوئید: آخرین نقطهٔ perpDay/perpWeek/perpMonth (مثل آرکوس)
 *                         تی‌اکس‌فلو: نامعلوم (سری دوره‌ای عمومی ندارد) — حدس زده نمی‌شود
 *   جمع کل               = جمع مقادیر معلوم + پرچم partial
 *   اوندو (کلید فقط‌خواندنی env): نرمال‌سازی در domain/keyedVenues؛ اینجا فقط به مدل مشترک
 * واحد حساب‌ها USDC/USDG/USDT است و ≈ ۱ دلار در نظر گرفته می‌شود.
 */
import type { ArcusAccount, ArcusPortfolio, ArcusPosition } from '@/features/arcus/api/types';
import type { LighterAccount } from './model';
import type { KeyedSnapshot, KeyedVenue } from './keyedVenues';

export type PerpVenue = 'arcus' | 'lighter-robinhood' | 'lighter-mainnet' | 'hyperliquid' | 'txflow' | 'ondo';
export type PerpStatus = 'loading' | 'ready' | 'error';
export type PnlPeriod = 'day' | 'week' | 'month';
export const PNL_PERIODS: readonly PnlPeriod[] = ['day', 'week', 'month'];
export type PeriodPnl = Record<PnlPeriod, number | null>;
const NO_PERIODS: PeriodPnl = { day: null, week: null, month: null };

export interface PerpVenuePosition {
  symbol: string;
  side: 'long' | 'short';
  size: number | null;
  entry: number | null;
  mark: number | null;
  pnl: number | null;
  liquidation: number | null;
}

export const PERP_VENUE_NAME: Record<PerpVenue, string> = {
  arcus: 'آرکوس',
  'lighter-robinhood': 'لایتر رابین‌هود',
  'lighter-mainnet': 'لایتر',
  hyperliquid: 'هایپرلیکوئید',
  txflow: 'تی‌اکس‌فلو',
  ondo: 'اوندو پرپس'
};

export interface PerpVenueAccount {
  id: string;
  venue: PerpVenue;
  label: string;
  /** آدرس عمومی حساب (برای لینک کارنامه در میز معامله) */
  address?: string;
  unit: 'USDC' | 'USDG' | 'USDT';
  equity: number | null;
  unrealizedPnl: number | null;
  allTimePnl: number | null;
  /** سود/زیان کل − باز */
  realizedPnl: number | null;
  periodPnl: PeriodPnl;
  positions: PerpVenuePosition[];
  status: PerpStatus;
  stale: boolean;
  /** پیام کوتاه خطای سرویس (فقط حساب‌های کلیددار؛ بدون کلید یا هدر) */
  error?: string;
}

export interface PerpTotals {
  equity: number | null;
  unrealizedPnl: number | null;
  allTimePnl: number | null;
  realizedPnl: number | null;
  periodPnl: PeriodPnl;
  positions: number;
  accounts: number;
  /** حداقل یک مقدار نامعلوم از جمع کنار گذاشته شده */
  partial: boolean;
}

/** سری trade_pnl تجمعی یک زیرحساب لایتر: [زمان ثانیه، مقدار] — خروجی op=lighter-pnl */
export interface LighterPnlSeries {
  hourly: [number, number][];
  daily: [number, number][];
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);

/** جمع مقادیر معلوم؛ null فقط وقتی هیچ مقداری معلوم نیست */
export function sumKnown(values: readonly (number | null)[]): { sum: number | null; partial: boolean } {
  const known = values.filter((v): v is number => v !== null);
  return { sum: known.length ? known.reduce((a, b) => a + b, 0) : null, partial: known.length !== values.length };
}

/** جمع سخت‌گیرانه: یک مقدار نامعلوم → کل نامعلوم */
const sumAll = (values: readonly (number | null)[]) => (values.some((v) => v === null) ? null : values.reduce<number>((a, b) => a + (b as number), 0));

export function positionsPnl(positions: readonly PerpVenuePosition[]): number | null {
  return sumAll(positions.map((p) => p.pnl));
}

/** آخرین نقطهٔ pnlHistory سری‌های perpDay/perpWeek/perpMonth آرکوس */
export function arcusPeriodPnl(portfolio: ArcusPortfolio | null | undefined): PeriodPnl {
  if (!portfolio || !Array.isArray(portfolio.data)) return NO_PERIODS;
  const last = (name: string) => {
    const series = portfolio.data.find(([n]) => n === name)?.[1]?.pnlHistory;
    return Array.isArray(series) && series.length ? num(series[series.length - 1][1]) : null;
  };
  return { day: last('perpDay'), week: last('perpWeek'), month: last('perpMonth') };
}

const WINDOW_S: Record<PnlPeriod, number> = { day: 86400, week: 7 * 86400, month: 30 * 86400 };

/** سود/زیان کل و دوره‌ای یک زیرحساب لایتر از سری تجمعی trade_pnl */
export function lighterSeriesPnl(s: LighterPnlSeries, nowSec: number): { allTime: number | null } & PeriodPnl {
  const all = [...s.hourly, ...s.daily];
  if (!all.length) return { allTime: null, ...NO_PERIODS };
  const latest = all.reduce((a, b) => (b[0] > a[0] ? b : a))[1];
  const change = (period: PnlPeriod) => {
    const series = period === 'month' ? s.daily : s.hourly;
    if (!series.length) return null;
    const start = nowSec - WINDOW_S[period];
    const before = series.filter(([t]) => t <= start);
    // سری از ایجاد حساب شروع می‌شود: نقطه‌ای پیش از بازه نیست → حساب در همین بازه ساخته شده (مبنا صفر)
    return latest - (before.length ? before[before.length - 1][1] : 0);
  };
  return { allTime: latest, day: change('day'), week: change('week'), month: change('month') };
}

export function fromArcus(
  id: string,
  label: string,
  account: ArcusAccount | null | undefined,
  positions: readonly ArcusPosition[] | null | undefined,
  status: PerpStatus,
  stale: boolean,
  portfolio?: ArcusPortfolio | null
): PerpVenueAccount {
  const rows: PerpVenuePosition[] = (positions ?? []).flatMap((p) => {
    const size = num(p.size);
    if (size === 0) return [];
    const mark = num(p.markPx);
    return [{
      symbol: p.marketDisplayName,
      side: p.side === 'SHORT' ? 'short' as const : 'long' as const,
      size: size === null ? null : Math.abs(size),
      entry: num(p.averageEntryPrice),
      mark: mark === 0 ? null : mark,
      pnl: num(p.unrealizedPnl),
      liquidation: null
    }];
  });
  // حساب بدون فعالیت (404 مستند) = ارزش صفر
  const equity = account === null ? 0 : num(account?.equity);
  const deposits = account === null ? 0 : num(account?.netDeposits);
  const unrealizedPnl = positions ? positionsPnl(rows) : null;
  const allTimePnl = diff(equity, deposits);
  return {
    id,
    venue: 'arcus',
    label,
    unit: 'USDC',
    equity,
    unrealizedPnl,
    allTimePnl,
    realizedPnl: diff(allTimePnl, unrealizedPnl),
    periodPnl: account === null ? { day: 0, week: 0, month: 0 } : arcusPeriodPnl(portfolio),
    positions: rows,
    status,
    stale
  };
}

/**
 * یک آدرس لایتر می‌تواند چند زیرحساب داشته باشد → یکی شده در یک کارت.
 * pnl هم‌ترتیب با accounts است؛ سری نامعلوم یک زیرحساب → جمع آن مقدار نامعلوم.
 */
export function fromLighter(
  id: string,
  label: string,
  venue: 'lighter-robinhood' | 'lighter-mainnet',
  accounts: readonly LighterAccount[] | null,
  status: PerpStatus,
  stale: boolean,
  pnl: readonly (LighterPnlSeries | null | undefined)[] = [],
  nowSec = Date.now() / 1000
): PerpVenueAccount {
  const rows: PerpVenuePosition[] = (accounts ?? []).flatMap((a) =>
    a.positions.map((p) => ({ symbol: p.symbol, side: p.side, size: p.size, entry: p.entry, mark: p.mark ?? null, pnl: p.pnl, liquidation: p.liquidation || null }))
  );
  const equity = accounts ? sumKnown(accounts.map((a) => a.equity)) : null;
  const unrealizedPnl = accounts ? positionsPnl(rows) : null;
  // آدرس بدون حساب = همه صفر
  const per = (accounts ?? []).map((_, i) => (pnl[i] ? lighterSeriesPnl(pnl[i]!, nowSec) : null));
  const pick = (k: 'allTime' | PnlPeriod) => (accounts ? sumAll(per.map((p) => (p ? p[k] : null))) : null);
  const allTimePnl = pick('allTime');
  return {
    id,
    venue,
    label,
    unit: venue === 'lighter-mainnet' ? 'USDC' : 'USDG',
    equity: equity && !equity.partial ? equity.sum : null,
    unrealizedPnl,
    allTimePnl,
    realizedPnl: diff(allTimePnl, unrealizedPnl),
    periodPnl: { day: pick('day'), week: pick('week'), month: pick('month') },
    positions: rows,
    status,
    stale
  };
}

/** clearinghouseState هایپرلیکوئید و تی‌اکس‌فلو (API سازگار) — فقط فیلدهای لازم */
export interface HlLikeState {
  marginSummary?: { accountValue?: string };
  assetPositions?: { position: { coin: string; szi: string; entryPx?: string | null; positionValue?: string; unrealizedPnl?: string; liquidationPx?: string | null } }[];
}
/** info/portfolio هایپرلیکوئید: [[نام سری، {pnlHistory: [زمان، مقدار][]}]] */
export type HlPortfolioSeries = [string, { pnlHistory?: [number, string][] }][];
/** userNonFundingLedgerUpdates: فقط واریز/برداشت با مبلغ USDC */
export interface LedgerUpdate { time: number; delta?: { type?: string; usdc?: string; fee?: string } }

/** آخرین نقطهٔ سری‌های پرپ portfolio هایپرلیکوئید */
export function hlPortfolioPnl(portfolio: HlPortfolioSeries | null | undefined): { allTime: number | null } & PeriodPnl {
  const series = new Map(Array.isArray(portfolio) ? portfolio : []);
  const last = (name: string) => {
    const h = series.get(name)?.pnlHistory;
    return Array.isArray(h) && h.length ? num(h[h.length - 1][1]) : null;
  };
  return { allTime: last('perpAllTime'), day: last('perpDay'), week: last('perpWeek'), month: last('perpMonth') };
}

/**
 * خالص واریز از دفتر غیرفاندینگ. هر نوع رویدادی جز واریز/برداشت (انتقال داخلی، زیرحساب، اسپات…)
 * مبنا را نامعلوم می‌کند → null؛ حدس زده نمی‌شود.
 */
export function ledgerNetDeposits(ledger: readonly LedgerUpdate[] | null | undefined): number | null {
  if (!Array.isArray(ledger)) return null;
  let net = 0;
  for (const u of ledger) {
    const type = u?.delta?.type;
    const usdc = num(u?.delta?.usdc);
    if (usdc === null) return null;
    if (type === 'deposit') net += usdc;
    else if (type === 'withdraw') net -= usdc + (num(u.delta?.fee) ?? 0);
    else return null;
  }
  return net;
}

/**
 * حساب هایپرلیکوئید یا تی‌اکس‌فلو از clearinghouseState (+ portfolio برای هایپرلیکوئید، + دفتر واریز برای تی‌اکس‌فلو)
 * state === null یعنی دریافت نشده؛ حساب بدون فعالیت ارزش صفر و فهرست خالی برمی‌گرداند.
 */
export function fromHlLike(
  id: string,
  label: string,
  venue: 'hyperliquid' | 'txflow',
  address: string,
  state: HlLikeState | null | undefined,
  status: PerpStatus,
  stale: boolean,
  extra: { portfolio?: HlPortfolioSeries | null; ledger?: readonly LedgerUpdate[] | null } = {}
): PerpVenueAccount {
  const rows: PerpVenuePosition[] = (state?.assetPositions ?? []).flatMap((ap) => {
    const p = ap?.position;
    const szi = num(p?.szi);
    if (!p || !szi) return [];
    const value = num(p.positionValue);
    const liq = num(p.liquidationPx);
    return [{
      symbol: String(p.coin).replace(/[-/]USDC$/, ''),
      side: szi > 0 ? 'long' as const : 'short' as const,
      size: Math.abs(szi),
      entry: num(p.entryPx),
      mark: value !== null ? Math.abs(value / szi) : null,
      pnl: num(p.unrealizedPnl),
      liquidation: liq && liq > 0 ? liq : null
    }];
  });
  const equity = state ? num(state.marginSummary?.accountValue) : null;
  const unrealizedPnl = state ? positionsPnl(rows) : null;
  let allTimePnl: number | null = null;
  let periodPnl: PeriodPnl = NO_PERIODS;
  if (venue === 'hyperliquid') {
    const p = hlPortfolioPnl(extra.portfolio);
    allTimePnl = p.allTime;
    periodPnl = { day: p.day, week: p.week, month: p.month };
  } else {
    allTimePnl = diff(equity, ledgerNetDeposits(extra.ledger));
  }
  return {
    id,
    venue,
    label,
    address,
    unit: 'USDC',
    equity,
    unrealizedPnl,
    allTimePnl,
    realizedPnl: diff(allTimePnl, unrealizedPnl),
    periodPnl,
    positions: rows,
    status,
    stale
  };
}

/** پاسخ op=keyed-perps → حساب؛ خطای یک پلتفرم کارت «دریافت نشد» می‌سازد، نه عدد */
export function fromKeyed(r: KeyedSnapshot | { venue: KeyedVenue; error: string }, label: string): PerpVenueAccount {
  if ('error' in r) {
    return { id: `keyed:${r.venue}`, venue: r.venue, label, unit: 'USDC', equity: null, unrealizedPnl: null, allTimePnl: null, realizedPnl: null, periodPnl: NO_PERIODS, positions: [], status: 'error', stale: false, error: r.error };
  }
  return {
    id: `keyed:${r.venue}`,
    venue: r.venue,
    label,
    unit: 'USDC',
    equity: r.equity,
    unrealizedPnl: r.unrealizedPnl,
    allTimePnl: r.allTimePnl,
    realizedPnl: r.realizedPnl,
    periodPnl: r.periodPnl,
    positions: r.positions,
    status: 'ready',
    stale: false
  };
}

/** نام پروتکل هر صرافی در دارایی‌های کیف پول Zerion (اگر Zerion همان حساب را به‌عنوان موقعیت دیفای نشان بدهد) */
const ZERION_PROTOCOL: Partial<Record<PerpVenue, RegExp>> = {
  hyperliquid: /hyperliquid/i,
  'lighter-mainnet': /lighter/i,
  'lighter-robinhood': /lighter/i,
  txflow: /txflow/i
};

export interface PerpInNetWorth {
  /** جمع ارزش حساب‌هایی که به ارزش کل دارایی اضافه می‌شوند */
  equity: number | null;
  accounts: PerpVenueAccount[];
  /** حساب‌هایی که چون کیف پول متصل همان موجودی را نشان می‌دهد، دوباره شمرده نشدند */
  duplicates: PerpVenueAccount[];
  /** حسابی هنوز دریافت نشده یا ارزشش نامعلوم است */
  partial: boolean;
}

/**
 * حساب‌های پرپ در ارزش کل دارایی (آرکوس جدا؛ ارزشش از قبل در جمع کیف پول‌ها و آرکوس هست).
 * اگر آدرس حساب همان کیف پول متصل باشد و Zerion موقعیتی از همان پروتکل نشان بدهد، دوباره شمرده نمی‌شود.
 */
export function perpInNetWorth(
  accounts: readonly PerpVenueAccount[],
  wallets: readonly { address: string; protocols: readonly (string | null)[] }[]
): PerpInNetWorth {
  const duplicate = (a: PerpVenueAccount) => {
    const re = ZERION_PROTOCOL[a.venue];
    const w = a.address && re ? wallets.find((x) => x.address.toLowerCase() === a.address!.toLowerCase()) : undefined;
    return !!w && w.protocols.some((p) => !!p && re!.test(p));
  };
  const counted = accounts.filter((a) => a.venue !== 'arcus' && !duplicate(a));
  const { sum, partial } = sumKnown(counted.map((a) => (a.status === 'ready' ? a.equity : null)));
  return { equity: sum, accounts: counted, duplicates: accounts.filter((a) => a.venue !== 'arcus' && duplicate(a)), partial };
}

export function perpTotals(accounts: readonly PerpVenueAccount[]): PerpTotals {
  const equity = sumKnown(accounts.map((a) => a.equity));
  const upnl = sumKnown(accounts.map((a) => a.unrealizedPnl));
  const allTime = sumKnown(accounts.map((a) => a.allTimePnl));
  const realized = sumKnown(accounts.map((a) => a.realizedPnl));
  const periods = PNL_PERIODS.map((k) => [k, sumKnown(accounts.map((a) => a.periodPnl[k]))] as const);
  return {
    equity: equity.sum,
    unrealizedPnl: upnl.sum,
    allTimePnl: allTime.sum,
    realizedPnl: realized.sum,
    periodPnl: Object.fromEntries(periods.map(([k, v]) => [k, v.sum])) as PeriodPnl,
    positions: accounts.reduce((n, a) => n + a.positions.length, 0),
    accounts: accounts.length,
    partial: [equity, upnl, allTime, realized, ...periods.map(([, v]) => v)].some((v) => v.partial)
  };
}

/**
 * پرتفوی پرپچوال — حساب‌های آرکوس و لایتر (رابین‌هود/اصلی) در یک مدل مشترک
 *
 *   سود/زیان باز حساب   = Σ سود/زیان باز پوزیشن‌ها؛ یکی نامعلوم → null (حدس زده نمی‌شود)
 *   سود/زیان کل حساب    = ارزش حساب − خالص واریز   (فقط وقتی پلتفرم خالص واریز می‌دهد؛ آرکوس)
 *   جمع کل             = جمع مقادیر معلوم + پرچم partial
 * واحد حساب‌ها USDC/USDG است و ≈ ۱ دلار در نظر گرفته می‌شود.
 */
import type { ArcusAccount, ArcusPosition } from '@/features/arcus/api/types';
import type { LighterAccount } from './model';

export type PerpVenue = 'arcus' | 'lighter-robinhood' | 'lighter-mainnet';
export type PerpStatus = 'loading' | 'ready' | 'error';

export interface PerpVenuePosition {
  symbol: string;
  side: 'long' | 'short';
  size: number | null;
  entry: number | null;
  mark: number | null;
  pnl: number | null;
  liquidation: number | null;
}

export interface PerpVenueAccount {
  id: string;
  venue: PerpVenue;
  label: string;
  unit: 'USDC' | 'USDG';
  equity: number | null;
  unrealizedPnl: number | null;
  allTimePnl: number | null;
  positions: PerpVenuePosition[];
  status: PerpStatus;
  stale: boolean;
}

export interface PerpTotals {
  equity: number | null;
  unrealizedPnl: number | null;
  allTimePnl: number | null;
  positions: number;
  accounts: number;
  /** حداقل یک مقدار نامعلوم از جمع کنار گذاشته شده */
  partial: boolean;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** جمع مقادیر معلوم؛ null فقط وقتی هیچ مقداری معلوم نیست */
export function sumKnown(values: readonly (number | null)[]): { sum: number | null; partial: boolean } {
  const known = values.filter((v): v is number => v !== null);
  return { sum: known.length ? known.reduce((a, b) => a + b, 0) : null, partial: known.length !== values.length };
}

export function positionsPnl(positions: readonly PerpVenuePosition[]): number | null {
  return positions.some((p) => p.pnl === null) ? null : positions.reduce((s, p) => s + (p.pnl as number), 0);
}

export function fromArcus(
  id: string,
  label: string,
  account: ArcusAccount | null | undefined,
  positions: readonly ArcusPosition[] | null | undefined,
  status: PerpStatus,
  stale: boolean
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
  return {
    id,
    venue: 'arcus',
    label,
    unit: 'USDC',
    equity,
    unrealizedPnl: positions ? positionsPnl(rows) : null,
    allTimePnl: equity !== null && deposits !== null ? equity - deposits : null,
    positions: rows,
    status,
    stale
  };
}

/** یک آدرس لایتر می‌تواند چند زیرحساب داشته باشد → یکی شده در یک کارت */
export function fromLighter(
  id: string,
  label: string,
  venue: 'lighter-robinhood' | 'lighter-mainnet',
  accounts: readonly LighterAccount[] | null,
  status: PerpStatus,
  stale: boolean
): PerpVenueAccount {
  const rows: PerpVenuePosition[] = (accounts ?? []).flatMap((a) =>
    a.positions.map((p) => ({ symbol: p.symbol, side: p.side, size: p.size, entry: p.entry, mark: null, pnl: p.pnl, liquidation: p.liquidation || null }))
  );
  const equity = accounts ? sumKnown(accounts.map((a) => a.equity)) : null;
  return {
    id,
    venue,
    label,
    unit: venue === 'lighter-mainnet' ? 'USDC' : 'USDG',
    equity: equity && !equity.partial ? equity.sum : null,
    unrealizedPnl: accounts ? positionsPnl(rows) : null,
    allTimePnl: null,
    positions: rows,
    status,
    stale
  };
}

export function perpTotals(accounts: readonly PerpVenueAccount[]): PerpTotals {
  const equity = sumKnown(accounts.map((a) => a.equity));
  const upnl = sumKnown(accounts.map((a) => a.unrealizedPnl));
  // سود/زیان کل فقط روی حساب‌هایی که پلتفرم خالص واریز می‌دهد؛ نبودنش partial نیست
  const allTime = sumKnown(accounts.filter((a) => a.venue === 'arcus').map((a) => a.allTimePnl));
  return {
    equity: equity.sum,
    unrealizedPnl: upnl.sum,
    allTimePnl: allTime.sum,
    positions: accounts.reduce((n, a) => n + a.positions.length, 0),
    accounts: accounts.length,
    partial: equity.partial || upnl.partial || allTime.partial
  };
}

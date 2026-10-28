/**
 * حساب‌های پرپچوال با کلید API فقط‌خواندنی (اوندو پرپس) — نرمال‌سازی پاسخ خام به یک مدل
 *
 *   اوندو:  ارزش = marginBalance · سود کل = totalPnL · بسته‌شده = realizedPnl
 *           دوره‌ای = totalPnL آخر − اول نمودار portfolio/summary/graph (24h/7d/30d)
 * مقدار نامعلوم null می‌ماند؛ هرگز صفر جایگزین نمی‌شود. Pure — مشترک سرور (api/_keyedPerps.ts) و تست.
 */

export type KeyedVenue = 'ondo';

export interface KeyedPosition {
  symbol: string;
  side: 'long' | 'short';
  size: number | null;
  entry: number | null;
  mark: number | null;
  pnl: number | null;
  liquidation: number | null;
}

export interface KeyedSnapshot {
  venue: KeyedVenue;
  equity: number | null;
  unrealizedPnl: number | null;
  allTimePnl: number | null;
  realizedPnl: number | null;
  periodPnl: { day: number | null; week: number | null; month: number | null };
  positions: KeyedPosition[];
  fetchedAt: number;
}

type Raw = Record<string, unknown>;
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const rows = (v: unknown): Raw[] => (Array.isArray(v) ? v.filter((x): x is Raw => !!x && typeof x === 'object') : []);

/* ---------------- اوندو ---------------- */

export function ondoSnapshot(input: { balance: unknown; positions: unknown; graphs: Partial<Record<'24h' | '7d' | '30d', unknown>>; now?: number }): KeyedSnapshot {
  const b = ((input.balance as Raw)?.result ?? {}) as Raw;
  const positions: KeyedPosition[] = rows((input.positions as Raw)?.result)
    .filter((p) => p.direction === 'long' || p.direction === 'short')
    .map((p) => {
      const qty = num(p.netQuantity);
      const liq = num(p.liquidationPrice);
      return {
        symbol: String(p.market ?? '').replace(/-USD\.P$/, ''),
        side: p.direction as 'long' | 'short',
        size: qty === null ? null : Math.abs(qty),
        entry: num(p.averageEntryPrice),
        mark: num(p.markPrice),
        pnl: num(p.unrealizedPnl),
        liquidation: liq && liq > 0 ? liq : null
      };
    });
  const change = (g: unknown) => {
    const pts = rows((g as Raw)?.result).map((p) => num(p.totalPnL));
    return pts.length >= 1 && pts.every((x) => x !== null) ? (pts[pts.length - 1] as number) - (pts[0] as number) : null;
  };
  return {
    venue: 'ondo',
    equity: num(b.marginBalance),
    unrealizedPnl: num(b.unrealizedPnl),
    allTimePnl: num(b.totalPnL),
    realizedPnl: num(b.totalPnL) !== null && num(b.unrealizedPnl) !== null ? num(b.totalPnL)! - num(b.unrealizedPnl)! : null,
    periodPnl: { day: change(input.graphs['24h']), week: change(input.graphs['7d']), month: change(input.graphs['30d']) },
    positions,
    fetchedAt: input.now ?? Date.now()
  };
}

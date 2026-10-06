/** Public-data adapters; equity and position notional are deliberately separate. */
export interface PerpMarket { symbol: string; price: number | null; change: number | null; }
export interface PerpPosition { symbol: string; side: 'long' | 'short'; size: number; entry: number | null; pnl: number | null; liquidation: number | null; }
export interface LighterAccount { index: number; equity: number | null; available: number | null; positions: PerpPosition[]; }
export const numeric = (v: unknown): number | null => {
  if ((typeof v !== 'number' && typeof v !== 'string') || String(v).trim() === '') return null;
  const n = Number(v); return Number.isFinite(n) ? n : null;
};
type Row = Record<string, unknown>;
const row = (v: unknown): Row => v && typeof v === 'object' && !Array.isArray(v) ? v as Row : {};
const rows = (v: unknown): Row[] => Array.isArray(v) ? v.map(row) : [];
export function lighterMarkets(payload: unknown): PerpMarket[] {
  return rows(row(payload).order_book_details).filter(m => m.status === 'active' && row(m.market_config).hidden !== true).map(m => ({ symbol: String(m.symbol ?? ''), price: numeric(m.mark_price), change: numeric(m.daily_price_change) })).filter(m => m.symbol);
}
export function ondoMarkets(payload: unknown, prices: unknown): PerpMarket[] {
  const marks = row(row(prices).result);
  return rows(row(row(row(payload).result).perps).tradingPairs).map(m => ({symbol: String(m.market ?? ''), price: numeric(row(marks[String(m.market)]).markPrice), change: null})).filter(m => m.symbol);
}
export function lighterAccounts(payload: unknown, address: string): LighterAccount[] {
  const seen = new Set<number>();
  return rows(row(payload).accounts).filter(a => {
    const index = numeric(a.account_index ?? a.index);
    if (String(a.l1_address).toLowerCase() !== address.toLowerCase() || index === null || !Number.isSafeInteger(index) || index < 0 || seen.has(index)) return false;
    seen.add(index); return true;
  }).map(a => ({index: Number(a.account_index ?? a.index), equity: numeric(a.total_asset_value), available: numeric(a.available_balance), positions: rows(a.positions).flatMap(p => {
    const size = numeric(p.position); if (size === null || size <= 0 || ![1, -1].includes(Number(p.sign))) return [];
    return [{symbol: String(p.symbol ?? ''), side: Number(p.sign) === -1 ? 'short' as const : 'long' as const, size, entry: numeric(p.avg_entry_price), pnl: numeric(p.unrealized_pnl), liquidation: numeric(p.liquidation_price)}];
  })}));
}

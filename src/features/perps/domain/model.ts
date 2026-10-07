/** Public-data adapters; equity and position notional are deliberately separate. */
export interface PerpMarket { symbol: string; name?:string; price: number | null; change: number | null; logo?:string|null;quote?:string; }
export interface PerpPosition { symbol: string; side: 'long' | 'short'; size: number; entry: number | null; pnl: number | null; liquidation: number | null; }
export interface LighterAccount { index: number; equity: number | null; available: number | null; positions: PerpPosition[]; assets:LighterSpotAsset[]; }
export interface LighterSpotAsset {symbol:string;balance:number|null;locked:number|null;margin:number|null}
export const numeric = (v: unknown): number | null => {
  if ((typeof v !== 'number' && typeof v !== 'string') || String(v).trim() === '') return null;
  const n = Number(v); return Number.isFinite(n) ? n : null;
};
type Row = Record<string, unknown>;
const row = (v: unknown): Row => v && typeof v === 'object' && !Array.isArray(v) ? v as Row : {};
const rows = (v: unknown): Row[] => Array.isArray(v) ? v.map(row) : [];
export function lighterMarkets(payload: unknown,kind:'perp'|'spot'='perp'): PerpMarket[] {
  const metadata=rows(row(payload).tokens);
  return rows(row(payload)[kind==='spot'?'spot_order_book_details':'order_book_details']).filter(m => m.status === 'active' && row(m.market_config).hidden !== true).map(m => ({ symbol: String(m.symbol ?? ''), ...lighterMetadata(m,metadata), price: numeric(kind==='spot'?m.last_trade_price:m.mark_price), change: numeric(m.daily_price_change),...(kind==='spot'?{quote:String(m.symbol??'').split(/[\/_]/)[1]||'USDC'}:{}) })).filter(m => m.symbol);
}
function lighterMetadata(m:Row,metadata:Row[]){
 const symbol=String(m.symbol??''),scaled=symbol.replace(/^1000/,'k');
 const token=metadata.find(t=>String(t.symbol).toLowerCase()===symbol.toLowerCase()||String(t.symbol).toLowerCase()===scaled.toLowerCase());
 if(!token)return {};
 const logo=typeof token.logo==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(token.logo)&&/^(svg|png|webp)$/.test(String(token.logo_extension))?`https://assets.lighter.xyz/fe/token/${token.logo}.${token.logo_extension}`:undefined;
 return {...(typeof token.name==='string'?{name:token.name}:{}),...(logo?{logo}:{})};
}
export function ondoMarkets(payload: unknown, prices: unknown): PerpMarket[] {
  const marks = row(row(prices).result);
  return rows(row(row(row(payload).result).perps).tradingPairs).map(m => ({symbol: String(m.market ?? ''), ...(typeof m.longName==='string'?{name:m.longName}:{}), price: numeric(row(marks[String(m.market)]).markPrice), change: null,...(typeof m.logoUrl==='string'?{logo:m.logoUrl}:{})})).filter(m => m.symbol);
}
export function lighterAccounts(payload: unknown, address: string): LighterAccount[] {
  const seen = new Set<number>();
  return rows(row(payload).accounts).filter(a => {
    const index = numeric(a.account_index ?? a.index);
    if (String(a.l1_address).toLowerCase() !== address.toLowerCase() || index === null || !Number.isSafeInteger(index) || index < 0 || seen.has(index)) return false;
    seen.add(index); return true;
  }).map(a => ({index: Number(a.account_index ?? a.index), equity: numeric(a.total_asset_value), available: numeric(a.available_balance), assets:rows(a.assets).map(t=>({symbol:String(t.symbol??''),balance:numeric(t.balance),locked:numeric(t.locked_balance),margin:numeric(t.margin_balance)})).filter(t=>t.symbol&&[t.balance,t.locked,t.margin].some(v=>v!==null&&v>0)), positions: rows(a.positions).flatMap(p => {
    const size = numeric(p.position); if (size === null || size <= 0 || ![1, -1].includes(Number(p.sign))) return [];
    return [{symbol: String(p.symbol ?? ''), side: Number(p.sign) === -1 ? 'short' as const : 'long' as const, size, entry: numeric(p.avg_entry_price), pnl: numeric(p.unrealized_pnl), liquidation: numeric(p.liquidation_price)}];
  })}));
}

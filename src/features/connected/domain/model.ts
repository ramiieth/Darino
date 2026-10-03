/** Read-only provider data; never written into the accounting ledger. */
export interface ChainInfo { id: string; name: string; icon: string | null; positions: boolean; transactions: boolean }
export interface LivePosition {
  id: string; tokenId: string; chain: string; contract: string | null; name: string; symbol: string;
  icon: string | null; quantity: string | null; value: number | null; price: number | null;
  type: string; protocol: string | null; protocolIcon: string | null; group: string | null;
  receipt: string | null; displayable: boolean; spam: boolean; verified?: boolean;
}
export interface WalletSnapshot { address: string; fetchedAt: number; total: number | null; change: number | null; positions: LivePosition[]; chains: ChainInfo[]; complete: boolean; unpriced: number; detailsError?: string; stale?: boolean; retryAt?: number }
export interface TransactionTransfer {
  direction: string; symbol: string; quantity: string | null; value: number | null; address: string | null; icon: string | null;
  verified?:boolean; spam?:boolean; chain?:string; tokenId?: string; name?: string; contract?: string | null; price?: number | null; sender?: string; recipient?: string; actId?: string;
}
export interface WalletTransaction { spam?:boolean; id: string; hash: string; chain: string; type: string; status: string; minedAt: string; fee: number | null; transfers: TransactionTransfer[]; from?: string; to?: string; protocol?: string; protocolIcon?: string | null; method?: string; acts?: {id:string;type:string;protocol:string;contract:string}[]; feeToken?: TransactionTransfer; approvals?:TransactionTransfer[] }
export interface TransactionPage { rows: WalletTransaction[]; next: string | null; fetchedAt: number }
export const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
export const str = (v: unknown): string => typeof v === 'string' ? v : '';
export const finite = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
export function validAddress(v: string): boolean {
  if (/^0x[a-fA-F0-9]{40}$/.test(v)) return true;
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) return false;
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n; for(const ch of v) n = n * 58n + BigInt(alphabet.indexOf(ch));
  let bytes = 0; while(n > 0n) { bytes++; n >>= 8n; }
  const zeros = v.match(/^1*/)?.[0].length ?? 0;
  return bytes + zeros === 32;
}
export function addressKey(v: string): string { return v.startsWith('0x') ? v.toLowerCase() : v; }
export function normalizePosition(v: unknown): LivePosition {
  const r = obj(v), a = obj(r.attributes), f = obj(a.fungible_info), q = obj(a.quantity);
  const chain = str(obj(obj(obj(r.relationships).chain).data).id);
  const implementation = arr(f.implementations).map(obj).find(i => i.chain_id === chain);
  const receipt = obj(obj(a.receipt).fungible_info);
  return { id: str(r.id), tokenId: str(f.id), chain, contract: str(implementation?.address) || null,
    name: str(f.name) || str(a.name), symbol: str(f.symbol), icon: str(obj(f.icon).url) || null,
    quantity: str(q.numeric) || (str(q.int) && typeof q.decimals === 'number' ? decimalQuantity(str(q.int), q.decimals) : null),
    value: finite(a.value), price: finite(a.price), type: str(a.position_type), protocol: str(a.protocol) || null,
    protocolIcon: str(obj(obj(a.application_metadata).icon).url) || null, group: str(a.group_id) || null,
    receipt: str(receipt.id) || null, displayable: obj(a.flags).displayable !== false, verified: obj(f.flags).verified === true, spam: obj(a.flags).is_trash === true || obj(f.flags).is_trash === true || obj(f.flags).is_spam === true };
}
function decimalQuantity(raw: string, decimals: number): string | null {
  if (!/^\d+$/.test(raw) || !Number.isInteger(decimals) || decimals < 0 || decimals > 80) return null;
  if (!decimals) return raw;
  const v = raw.padStart(decimals + 1, '0'); return `${v.slice(0,-decimals)}.${v.slice(-decimals)}`;
}
/** Display receipt rows only once; official portfolio total remains authoritative. */
export function deduplicatePositions(rows: LivePosition[]): LivePosition[] {
  const receipts = new Set(rows.filter(p => p.type !== 'wallet' && p.receipt).map(p => `${p.chain}:${p.receipt}`));
  const seen = new Set<string>();
  return rows.filter(p => { if (!p.id || seen.has(p.id)) return false; seen.add(p.id); return p.displayable && !p.spam && !(p.type === 'wallet' && receipts.has(`${p.chain}:${p.tokenId}`)); });
}
export function normalizeTransaction(v: unknown): WalletTransaction {
  const r = obj(v), a = obj(r.attributes), fee = obj(a.fee), app = obj(a.application_metadata);
  const chain = str(obj(obj(obj(r.relationships).chain).data).id);
  const transfer = (value: unknown): TransactionTransfer => {
    const t = obj(value), f = obj(t.fungible_info), q = obj(t.quantity);
    const implementation = arr(f.implementations).map(obj).find(i => i.chain_id === chain);
    return { verified:obj(f.flags).verified===true, spam:obj(t.flags).is_trash===true||obj(f.flags).is_trash===true||obj(f.flags).is_spam===true, chain, direction:str(t.direction), symbol:str(f.symbol), name:str(f.name), tokenId:str(f.id),
      contract:str(implementation?.address) || null, price:finite(t.price),
      quantity:str(q.numeric) || (str(q.int) && typeof q.decimals === 'number' ? decimalQuantity(str(q.int),q.decimals) : null),
      value:finite(t.value), sender:str(t.sender), recipient:str(t.recipient), actId:str(t.act_id),
      address:str(t.spender)||(t.direction === 'in' ? str(t.sender) : t.direction === 'out' ? str(t.recipient) : '') || null,
      icon:str(obj(f.icon).url) || null };
  };
  return {spam:obj(a.flags).is_trash===true,id:str(r.id),hash:str(a.hash),chain,type:str(a.operation_type),status:str(a.status),minedAt:str(a.mined_at),fee:finite(fee.value),
    from:str(a.sent_from),to:str(a.sent_to),protocol:str(app.name),protocolIcon:str(obj(app.icon).url) || null,method:str(obj(app.method).name),
    acts:arr(a.acts).map(v => {const x=obj(v),m=obj(x.application_metadata);return {id:str(x.id),type:str(x.type),protocol:str(m.name),contract:str(m.contract_address)};}),
    feeToken:Object.keys(fee).length ? transfer(fee) : undefined, approvals:arr(a.approvals).map(transfer), transfers:arr(a.transfers).map(transfer)};
}

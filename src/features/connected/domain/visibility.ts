import { safeLogoSrc } from '../../../shared/lib/logoSources';
import Decimal from 'decimal.js';
import { ASSETS } from '../../custody/domain/catalog';
import type { LivePosition, TransactionTransfer, WalletSnapshot, WalletTransaction } from './model';

/** Display policy only. Raw history remains available to FIFO and bridge reconciliation. */
type Token = { tokenId?:string;chain:string;contract?:string|null;symbol:string;icon?:string|null;verified?:boolean;spam?:boolean };
export function catalogToken(t:Token) {
 const contract=t.contract?.toLowerCase();
 const native=!contract||/^0x0{40}$/.test(contract)||/^0xe{40}$/.test(contract);
 return ASSETS.find(a=>a.networkId===t.chain&&(native?!a.contract&&a.symbol===t.symbol&&(t.verified===true||t.tokenId===a.coingeckoId||t.tokenId===a.id||t.tokenId===a.symbol.toLowerCase()):a.contract?.toLowerCase()===contract));
}
export function tokenLogo(t:Token):string|null {return safeLogoSrc(catalogToken(t)?.logo ?? t.icon);}
export function trustedToken(t:Token):boolean {return !t.spam && (!!catalogToken(t)||t.verified===true) && !!tokenLogo(t);}
export function robinhoodGas(t:Token):boolean {const local=catalogToken(t);return t.chain==='robinhood'&&local?.symbol==='ETH'&&!local.contract;}
export function visiblePosition(p:LivePosition):boolean {
 if(!p.displayable||!trustedToken(p))return false;
 try{if(!p.quantity||!new Decimal(p.quantity).isFinite()||new Decimal(p.quantity).lte(0))return false;}catch{return false;}
 return robinhoodGas(p)||(p.value!==null&&Number.isFinite(p.value)&&Math.abs(p.value)>=2);
}
export function visiblePositions(positions:LivePosition[]):LivePosition[] {return positions.filter(visiblePosition).sort((a,b)=>Math.abs(b.value??0)-Math.abs(a.value??0));}
export function visibleWalletValue(data:WalletSnapshot):number|null {
 const rows=visiblePositions(data.positions);
 if(!data.complete&&!rows.length)return null;
 return rows.reduce((sum,p)=>sum.plus(p.value??0),new Decimal(0)).toNumber();
}
export function visibleTransfer(t:TransactionTransfer,chain:string):boolean {return trustedToken({...t,chain:t.chain??chain});}
export function visibleTransaction(tx:WalletTransaction):boolean {
 if(tx.spam)return false;
 if(!tx.transfers.length)return true; // Genuine approvals/contract calls have no asset flow.
 const transfers=tx.transfers.filter(t=>visibleTransfer(t,tx.chain));
 if(!transfers.length)return false;
 // Dust poisoning is an incoming transfer, never the outgoing leg of a swap or a gas fee.
 if(tx.type==='receive'&&transfers.every(t=>t.direction==='in')) {
  if(transfers.every(t=>{try{return (t.value!==null&&t.value>=0&&t.value<=0.000001)||(t.quantity!==null&&new Decimal(t.quantity).isFinite()&&new Decimal(t.quantity).gte(0)&&new Decimal(t.quantity).lte('0.000001'));}catch{return false;}}))return false;
 }
 return true;
}

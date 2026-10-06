import { yieldTokenIdentity } from '../../../shared/domain/yieldTokenIdentity';
import { safeLogoSrc } from '../../../shared/lib/logoSources';
import Decimal from 'decimal.js';
import { ASSETS } from '../../custody/domain/catalog';
import type { LivePosition, TransactionTransfer, WalletSnapshot, WalletTransaction } from './model';

/** Display policy only. Raw history remains available to FIFO and bridge reconciliation. */
type Token = { tokenId?:string;chain:string;contract?:string|null;symbol:string;icon?:string|null;verified?:boolean;spam?:boolean };
export function catalogToken(t:Token) {
 const contract=t.chain==='solana'?t.contract:t.contract?.toLowerCase();
 const native=!contract||/^0x0{40}$/.test(contract)||/^0xe{40}$/.test(contract);
 return ASSETS.find(a=>a.networkId===t.chain&&(native?!a.contract&&a.symbol===t.symbol&&(t.verified===true||t.tokenId===a.coingeckoId||t.tokenId===a.id||t.tokenId===a.symbol.toLowerCase()):(t.chain==='solana'?a.contract:a.contract?.toLowerCase())===contract));
}
const reviewedTokens:Record<string,string>={bitcoin:'/logos/token-btc.png',btc:'/logos/token-btc.png',weth:'/logos/token-weth.png',hyperliquid:'/logos/token-hype.jpg',hype:'/logos/token-hype.jpg','global-dollar':'/logos/token-usdg.png'};
export function tokenLogo(t:Token):string|null {return safeLogoSrc(catalogToken(t)?.logo ?? (t.verified===true&&t.tokenId?reviewedTokens[t.tokenId]:null) ?? t.icon);}
export function trustedToken(t:Token):boolean {return !t.spam && (!!catalogToken(t)||t.verified===true) && !!tokenLogo(t);}
export function robinhoodGas(t:Token):boolean {const local=catalogToken(t);return t.chain==='robinhood'&&local?.symbol==='ETH'&&!local.contract;}
/** Pendle receipts are shown above $4 for YT and above $2 for PT/LP.
 * A symbol alone is insufficient: require a contract and provider identity too.
 */
export function yieldTokenPosition(p:LivePosition):boolean {
 return !!p.contract && !!yieldTokenIdentity(p.symbol,p.name) &&
  (p.verified===true || /pendle/i.test(p.protocol??'') || /pendle|yield token|principal token|liquidity provider|^(YT|PT|LP)[-\s]/i.test(p.name));
}
export function visiblePosition(p:LivePosition):boolean {
 if(!p.displayable||p.spam)return false;
 const yieldToken=yieldTokenPosition(p);
 if(!yieldToken&&!trustedToken(p))return false;
 try{if(!p.quantity||!new Decimal(p.quantity).isFinite()||new Decimal(p.quantity).lte(0))return false;}catch{return false;}
 if(yieldToken)return p.value!==null&&Number.isFinite(p.value)&&p.value>(/^YT(?:$|[-\s])/i.test(p.symbol)?4:2);
 return robinhoodGas(p)||(p.value!==null&&Number.isFinite(p.value)&&Math.abs(p.value)>=2);
}
export function visiblePositions(positions:LivePosition[]):LivePosition[] {return positions.filter(visiblePosition).sort((a,b)=>Math.abs(b.value??0)-Math.abs(a.value??0));}
function positiveQuantity(quantity:string):boolean {try{const value=new Decimal(quantity);return value.isFinite()&&value.gt(0);}catch{return false;}}
export function visibleWalletValue(data:WalletSnapshot):number|null {
 const rows=visiblePositions(data.positions);
 if(data.positions.some(p=>(p.chain==='bitcoin'||robinhoodGas(p))&&p.displayable&&trustedToken(p)&&p.value===null&&p.quantity&&positiveQuantity(p.quantity)))return null;
 if(!data.complete&&!rows.length)return null;
 return rows.reduce((sum,p)=>sum.plus(p.value??0),new Decimal(0)).toNumber();
}
export function visibleTransfer(t:TransactionTransfer,chain:string):boolean {return trustedToken({...t,chain:t.chain??chain});}
export function visibleTransaction(tx:WalletTransaction):boolean {
 if(tx.spam)return false;
 const flows=tx.transfers.length?tx.transfers:tx.approvals??[];
 if(!flows.length)return true; // Genuine approvals/contract calls have no asset flow.
 const transfers=flows.filter(t=>visibleTransfer(t,tx.chain));
 if(!transfers.length)return false;
 // Dust poisoning is an incoming transfer, never the outgoing leg of a swap or a gas fee.
 if(tx.type==='receive'&&transfers.every(t=>t.direction==='in')) {
  if(transfers.every(t=>{try{return (t.value!==null&&t.value>=0&&t.value<0.01)||(t.value===null&&t.price!=null&&t.price>=0&&t.quantity!==null&&new Decimal(t.quantity).times(t.price).gte(0)&&new Decimal(t.quantity).times(t.price).lt('0.01'))||(t.quantity!==null&&new Decimal(t.quantity).isFinite()&&new Decimal(t.quantity).gte(0)&&new Decimal(t.quantity).lte('0.000001'));}catch{return false;}}))return false;
 }
 return true;
}

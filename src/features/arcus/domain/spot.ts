import type { LivePosition,WalletTransaction } from '@/features/connected/domain/model';
export interface SpotToken {address:string;wrappedTokenAddress:string|null;symbol:string;name:string;decimals:number;source:string;verified:boolean}
// Published by arcus-xyz/arcus-spot-sdk/src/chains.ts; read-only identification, never a transaction target.
const contracts=new Set(['0x4262efbd176f02824af27010bea218429c33c7e8','0x006102b16a04c20306a28b652745d3973d7d24fa','0x6d56ab475069b7e93886b3d3f06c5435b87ba158']);
export function spotPositions(positions:LivePosition[],tokens:SpotToken[]) {const allowed=new Set(tokens.flatMap(t=>[t.address.toLowerCase(),...(t.wrappedTokenAddress?[t.wrappedTokenAddress.toLowerCase()]:[])]));return positions.filter(p=>p.chain==='robinhood'&&p.type==='wallet'&&!!p.contract&&allowed.has(p.contract.toLowerCase()));}
export function spotTransaction(tx:WalletTransaction) {return tx.chain==='robinhood'&&(contracts.has(tx.to?.toLowerCase()??'')||tx.acts?.some(a=>contracts.has(a.contract.toLowerCase()))||/\barcus\b/i.test(tx.protocol??''));}

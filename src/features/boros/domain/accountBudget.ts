import { CROSS, type BorosAccountSnapshot } from '@/shared/boros/account';
import type { BorosMarket } from './types';
export function accountAnalysisScope(data:BorosAccountSnapshot|null){return data?JSON.stringify([data.root,data.accountId,data.balances,data.positions,data.orders]):'';}
export type CapitalMode='real'|'hypothetical';
/** Available margin belongs to a collateral zone, never the dollar total of all zones. */
export function accountBudget(data:BorosAccountSnapshot|null,stale:boolean,market:BorosMarket,marginMode='cross') {
 const balance=data?.balances.find(b=>b.tokenId===market.tokenId&&b.marketId===(marginMode==='cross'?CROSS:market.marketId));
 const price=data?.assets.find(a=>a.tokenId===market.tokenId)?.priceUsd;
 const valid=!!data&&!stale&&!!balance&&balance.freeMargin!==null&&balance.margin!==null&&price!==null&&price!==undefined&&Number.isFinite(price)&&price>0;
 return {available:valid,budgetUsd:valid?Math.max(0,balance!.freeMargin!)*price!:null,freeCollateral:valid?Math.max(0,balance!.freeMargin!):null,cash:balance?.cash??null,currentMargin:balance?.margin??null,price:price??null,handle:balance?.handle??null,
  identity:JSON.stringify([data?.root,data?.accountId,balance?.handle,balance?.cash,balance?.freeMargin,balance?.margin,data?.positions,data?.orders]),scope:accountAnalysisScope(data)};
}
export function sameCollateralMarkets(markets:BorosMarket[],selected:BorosMarket,mode:CapitalMode){return mode==='real'?markets.filter(m=>m.tokenId===selected.tokenId):markets;}

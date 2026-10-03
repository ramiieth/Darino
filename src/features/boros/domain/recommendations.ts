import { FeeCalculator } from './engine/fees';
import { MarginCalculator } from './engine/margin';
import { analyzeEntry } from './entryAnalysis';
import type { BorosMarket } from './types';
export const MAX_PREVIEW_CHECKS=8;
export type EntryCosts={feesUsd:number|null;gasUsd:number|null;slippageUsd:number|null};
export function recommendationCosts(m:BorosMarket,size:number,costs:EntryCosts,modelFees:boolean,nowSec=Math.floor(Date.now()/1000)):EntryCosts {
 return {...costs,feesUsd:modelFees&&costs.feesUsd!==null?costs.feesUsd+FeeCalculator.calc({m,size,unitPriceUsd:m.collateralPriceUsd,nowSec}).total:costs.feesUsd};
}
/** Alternatives, each using the same budget. Never a simultaneous allocation. */
export function entryCandidates(markets:BorosMarket[],tokenId:number,capitalUsd:number,allocationPct:number,maxDays:number,costs:EntryCosts,nowSec=Math.floor(Date.now()/1000)){
 if(![capitalUsd,allocationPct,maxDays].every(Number.isFinite)||capitalUsd<=0||allocationPct<=0||allocationPct>100||maxDays<=0||Object.values(costs).some(v=>v===null||!Number.isFinite(v)||v<0))return [];
 return markets.flatMap(m=>{
  const days=(m.maturity-nowSec)/86400,price=m.collateralPriceUsd;
  if(m.tokenId!==tokenId||!m.isUiWhitelisted||m.status!=='GOOD'||days<=0||days>maxDays||!price||price<=0)return [];
  const margin=MarginCalculator.calcMarket(m,1,m.markApr,nowSec)*price;
  const perYu=FeeCalculator.calc({m,size:1,unitPriceUsd:price,nowSec}).total;
  const fraction=allocationPct/100;
  const sizeYu=fraction*(capitalUsd-costs.feesUsd!-costs.gasUsd!-costs.slippageUsd!)/(margin+fraction*perYu);
  if(!Number.isFinite(sizeYu)||sizeYu<=0)return [];
  return (['long','short'] as const).flatMap(direction=>{
   const result=analyzeEntry({m,direction,sizeYu,capitalUsd,entryRate:m.markApr,floatingRate:m.floatingApr,...recommendationCosts(m,sizeYu,costs,true,nowSec),nowSec});
   return result&&(result.state==='positive'||result.state==='conditional')&&result.liquidity.available&&result.liquidity.executable?[{m,direction,sizeYu,result}]:[];
  });
 }).sort((a,b)=>(b.result.net??-Infinity)-(a.result.net??-Infinity)||a.m.maturity-b.m.maturity);
}
export function distinctBest<T extends {candidate:{m:BorosMarket};net:number|null;adverse:number|null}>(rows:T[],limit=3):T[]{
 const seen=new Set<number>();
 return [...rows].sort((a,b)=>(b.net??-Infinity)-(a.net??-Infinity)||a.candidate.m.maturity-b.candidate.m.maturity||(b.adverse??-Infinity)-(a.adverse??-Infinity)).filter(r=>{if(seen.has(r.candidate.m.marketId))return false;seen.add(r.candidate.m.marketId);return true;}).slice(0,limit);
}

/** Reserve any immediate mark-to-entry loss; do not spend hypothetical MTM gains. */
export function previewBudgetRemaining(capitalUsd:number,additionalMarginUsd:number,costsUsd:number,markToEntryUsd:number){
 return capitalUsd-additionalMarginUsd-costsUsd+Math.min(0,markToEntryUsd);
}

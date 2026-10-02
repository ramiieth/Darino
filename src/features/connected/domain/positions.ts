import Decimal from 'decimal.js';
import type { LivePosition } from './model';
import { visiblePositions } from './visibility';
export interface PositionRow extends LivePosition {legs:LivePosition[];networks:string[]}
export function positionRows(positions:LivePosition[],groupByToken=false):PositionRow[] {
 const rows=new Map<string,PositionRow>();
 for(const p of visiblePositions(positions)) {
  const key=groupByToken&&p.type==='wallet'?(p.tokenId?`token:${p.tokenId}`:`${p.chain}:${p.contract??p.id}`):p.id;
  const old=rows.get(key);
  if(!old){rows.set(key,{...p,id:key,legs:[p],networks:[p.chain]});continue;}
  const quantity=new Decimal(old.quantity??0).plus(p.quantity??0).toString();
  const value=old.value===null||p.value===null?null:new Decimal(old.value).plus(p.value).toNumber();
  rows.set(key,{...old,quantity,value,price:value!==null&&new Decimal(quantity).gt(0)?new Decimal(value).div(quantity).toNumber():null,legs:[...old.legs,p],networks:[...new Set([...old.networks,p.chain])]});
 }
 return [...rows.values()].sort((a,b)=>Math.abs(b.value??0)-Math.abs(a.value??0));
}

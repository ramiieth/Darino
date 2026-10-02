import { arr,obj,finite } from './model.js';
export const CHART_PERIODS=['hour','day','week','month','year','max'] as const;
export type ChartPeriod=typeof CHART_PERIODS[number];
export interface WalletChart {points:[number,number][];fetchedAt:number}
export function normalizeChart(body:unknown):WalletChart {
 const points=new Map<number,number>();
 for(const raw of arr(obj(obj(obj(body).data).attributes).points).slice(0,2000)) {
  const [time,value]=arr(raw),t=finite(time),v=finite(value);
  if(t!==null&&t>0&&t<1e11&&v!==null&&v>=0)points.set(t*1000,v);
 }
 return {points:[...points].sort((a,b)=>a[0]-b[0]),fetchedAt:Date.now()};
}

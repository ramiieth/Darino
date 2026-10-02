import type { Activity } from './activity';
import { visibleTransaction } from './visibility';
export interface ActivityFilters {search:string;kind:string;asset:string;date:string}
export function filterActivities(rows:Activity[],filters:ActivityFilters):Activity[] {
 const search=filters.search.trim().toLowerCase();
 return rows.filter(r=>{
  if(r.tx&&!visibleTransaction(r.tx))return false;
  if(filters.kind!=='all'&&r.kind!==filters.kind)return false;
  if(filters.asset!=='all'&&![...r.tx?.transfers??[],...r.tx?.approvals??[]].some(t=>`${t.chain??r.tx?.chain}:${t.tokenId||t.contract||t.symbol}`===filters.asset))return false;
  if(filters.date&&(!Number.isFinite(r.at)||new Date(r.at).toLocaleDateString('en-CA')!==filters.date))return false;
  return !search||[r.label,r.kind,r.tx?.hash,r.tx?.protocol,r.tx?.chain,r.tx?.from,r.tx?.to,...[...r.tx?.transfers??[],...r.tx?.approvals??[]].flatMap(t=>[t.symbol,t.name,t.address,t.contract,t.sender,t.recipient])??[]].join(' ').toLowerCase().includes(search);
 }).sort((a,b)=>b.at-a.at||a.key.localeCompare(b.key));
}
export function activityDay(at:number):string {return Number.isFinite(at)&&at>0?new Date(at).toLocaleDateString('fa-IR',{year:'numeric',month:'long',day:'numeric'}):'زمان نامشخص';}

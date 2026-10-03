import Decimal from 'decimal.js';
import {useEffect,useState} from 'react';
import {usePublishInsight} from '@/shared/assistant/insights';
import {useBorosAccount,previewBorosOrder,accountIsStale} from '../data/useBorosAccount';
import {packAccount,toX18,CROSS,type OfficialPreview} from '@/shared/boros/account';
import {accountBudget} from '../domain/accountBudget';
import {analyzeEntry,scanEntries} from '../domain/entryAnalysis';
import type {BorosMarket,BorosDirection} from '../domain/types';
import {Surface} from '@/shared/components/ui/GlassCard';
import {MoneyValue,PercentValue} from '@/shared/components/ui/FinancialValue';
import {MarketIdentity} from './MarketIdentity';
import {Button} from '@/shared/components/ui/Button';
type Candidate=ReturnType<typeof scanEntries>[number];
type Verified={candidate:Candidate;quote:OfficialPreview;net:number|null;adverse:number|null;remaining:number};
export function VerifiedOpportunities({candidates,market,marginMode,capitalUsd,riskPct,costs,onSelect}:{candidates:Candidate[];market:BorosMarket;marginMode:string;capitalUsd:number;riskPct:number;costs:{feesUsd:number|null;gasUsd:number|null;slippageUsd:number|null};onSelect:(m:BorosMarket,d:BorosDirection,size:number,quote:OfficialPreview)=>void}){
 const account=useBorosAccount();const budget=accountBudget(account.data,accountIsStale(account),market,marginMode);
 const [state,setState]=useState<{key:string;rows:Verified[];loading:boolean;failed:number}>({key:'',rows:[],loading:false,failed:0});
 const [tick,setTick]=useState(0);useEffect(()=>{const t=setInterval(()=>setTick(n=>n+1),10000);return()=>clearInterval(t);},[]);void tick;
 const eligible=candidates.filter(c=>c.m.tokenId===market.tokenId&&c.result.liquidity.available&&c.result.liquidity.executable);
 const [revision,setRevision]=useState(0);
 const key=JSON.stringify([revision,budget.identity,marginMode,capitalUsd,riskPct,costs,eligible.slice(0,3).map(c=>[c.m.marketId,c.direction,c.sizeYu,c.m.snapshotAt])]);
 useEffect(()=>{
  let cancelled=false;const valid=budget.available&&capitalUsd>0&&Number.isFinite(riskPct)&&riskPct>=0&&riskPct<=100&&Object.values(costs).every(v=>v!==null&&Number.isFinite(v)&&v>=0);
  if(!valid){setState({key,rows:[],loading:false,failed:0});return;}
  const timer=setTimeout(()=>{setState({key,rows:[],loading:true,failed:0});void (async()=>{
   const rows:Verified[]=[];let failed=0;
   // Bound official calls to three ranked, collateral-compatible candidates per input set.
   for(const c of eligible.slice(0,3)){
    if(cancelled)break;
    const current=useBorosAccount.getState();if(accountIsStale(current)||accountBudget(current.data,false,market,marginMode).identity!==budget.identity)break;
    try{
     const q=await previewBorosOrder({marketAcc:packAccount(current.root,current.accountId,c.m.tokenId!,marginMode==='cross'?CROSS:c.m.marketId),marketId:c.m.marketId,side:c.direction==='long'?0:1,size:toX18(new Decimal(c.sizeYu).toFixed(18,Decimal.ROUND_DOWN)),tif:2,slippage:.005});
     if(!q.success||q.matchedApr===null||q.margin===null||q.matchedSize===null){failed++;continue;}
     const b=accountBudget(current.data,false,c.m,marginMode);if(!b.available||b.currentMargin===null||b.price===null){failed++;continue;}
     const a=analyzeEntry({m:c.m,direction:c.direction,sizeYu:q.matchedSize,capitalUsd,entryRate:q.matchedApr,floatingRate:c.m.floatingApr,...costs});
     const remaining=capitalUsd-Math.max(0,q.margin-b.currentMargin)*b.price-(a?.costs??Infinity);
     if(!a||a.state==='unavailable'||a.state==='incomplete'||a.net===null||a.net<=0||a.scenarioMin===null||a.scenarioMin< -capitalUsd*riskPct/100||remaining<0){failed++;continue;}
     rows.push({candidate:c,quote:q,net:a.net,adverse:a.scenarioMin,remaining});
    }catch{failed++;}
   }
   if(!cancelled)setState({key,rows:rows.sort((a,b)=>(b.adverse??-Infinity)-(a.adverse??-Infinity)||(b.net??0)-(a.net??0)),loading:false,failed});
  })();},700);
  return()=>{cancelled=true;clearTimeout(timer);};
 },[key]);
 const rows=state.key===key&&budget.available?state.rows.filter(r=>Date.now()-r.quote.fetchedAt<60000):[];
 usePublishInsight('borosVerifiedCandidates','پیشنهاد با حساب واقعی',rows[0]?{marketId:rows[0].candidate.m.marketId,long:Number(rows[0].candidate.direction==='long'),capitalUsd,sizeYu:rows[0].quote.matchedSize,entryApr:rows[0].quote.matchedApr,marginAfterCollateral:rows[0].quote.margin,liquidationApr:rows[0].quote.liquidationApr,projectedNetUsd:rows[0].net,adverseNetUsd:rows[0].adverse,remainingUsd:rows[0].remaining,maxLossPct:riskPct}:null,'simulation','partial',rows[0]?.quote.fetchedAt,budget.scope);
 return <Surface className="p-4 space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold">پیشنهاد با حساب واقعی</h3><Button size="sm" variant="ghost" disabled={!budget.available||state.loading} onClick={()=>setRevision(n=>n+1)}>بازبینی پیشنهادها</Button></div><p className="text-xs text-muted">پیش‌نمایش رسمی؛ سود و هزینه‌ها همچنان برآوردند. سفارش ارسال نمی‌شود.</p>{state.key===key&&state.loading?<p className="text-sm text-muted">بررسی گزینه‌ها با حساب شما…</p>:!rows.length?<p className="text-sm text-muted">{budget.available?'گزینهٔ قابل تأیید با هزینه‌ها و حد زیان فعلی یافت نشد.':'دادهٔ تازهٔ حساب و مارجین آزاد لازم است.'}</p>:rows.map((r,i)=><div key={r.candidate.m.marketId+':'+r.candidate.direction} className="rounded-2xl border border-divider p-3 space-y-3"><div className="flex flex-wrap justify-between gap-2"><MarketIdentity market={r.candidate.m} compact/><span className="text-xs text-muted">{i===0?'گزینهٔ برتر · ':''}{r.candidate.direction==='long'?'لانگ':'شورت'} فاندینگ</span></div><div className="grid grid-cols-2 gap-3 text-xs"><div>خالص پایه <MoneyValue value={r.net} signed tone="auto"/></div><div>سناریوی نامساعد <MoneyValue value={r.adverse} signed tone="auto"/></div><div>مارجین پس از ورود <MoneyValue value={r.quote.margin===null?null:r.quote.margin*budget.price!}/></div><div>نرخ لیکوییدشدن <PercentValue value={r.quote.liquidationApr===null?null:r.quote.liquidationApr*100} tone="none"/></div></div><Button size="sm" variant="outline" onClick={()=>onSelect(r.candidate.m,r.candidate.direction,r.quote.matchedSize!,r.quote)}>انتخاب برای بررسی</Button></div>)}</Surface>;
}

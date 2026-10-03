import Decimal from 'decimal.js';
import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {useAssistantInsights} from '@/shared/assistant/insights';
import {useBorosAccount,previewBorosOrder,accountIsStale} from '../data/useBorosAccount';
import {packAccount,toX18,CROSS,type OfficialPreview} from '@/shared/boros/account';
import {accountBudget} from '../domain/accountBudget';
import {analyzeEntry,scanEntries} from '../domain/entryAnalysis';
import {distinctBest,MAX_PREVIEW_CHECKS,recommendationCosts,previewBudgetRemaining,type EntryCosts} from '../domain/recommendations';
import type {BorosMarket,BorosDirection} from '../domain/types';
import {Surface} from '@/shared/components/ui/GlassCard';
import {MoneyValue,PercentValue,QuantityValue} from '@/shared/components/ui/FinancialValue';
import {MarketIdentity} from './MarketIdentity';
import {borosAssetName,borosVenueName} from './borosLabels';
import {Button,buttonClass} from '@/shared/components/ui/Button';
type Candidate=ReturnType<typeof scanEntries>[number];
export type EntrySelection={marketId:number;direction:BorosDirection;sizeYu:number;quote:OfficialPreview;identity:string;marginMode:string;costs:EntryCosts;extraEntranceUsd?:number|null};
type Verified={candidate:Candidate;quote:OfficialPreview;net:number;adverse:number;remaining:number;costs:EntryCosts};
export function VerifiedOpportunities({candidates,market,marginMode,capitalUsd,riskPct,costs,modelFees=false,onSelect}:{candidates:Candidate[];market:BorosMarket;marginMode:string;capitalUsd:number;riskPct:number;costs:EntryCosts;modelFees?:boolean;onSelect:(selection:EntrySelection)=>void}){
 const account=useBorosAccount();const budget=accountBudget(account.data,accountIsStale(account),market,marginMode);
 const eligible=candidates.filter(c=>c.m.tokenId===market.tokenId&&c.result.liquidity.available&&c.result.liquidity.executable);
 const key=JSON.stringify([budget.identity,marginMode,capitalUsd,riskPct,costs,modelFees,eligible.map(c=>[c.m.marketId,c.direction,c.sizeYu,c.m.snapshotAt])]);
 const [requested,setRequested]=useState('');
 const [state,setState]=useState<{key:string;rows:Verified[];loading:boolean;failed:number;checked:number;limited:boolean}>({key:'',rows:[],loading:false,failed:0,checked:0,limited:false});
 const [tick,setTick]=useState(0);useEffect(()=>{const t=setInterval(()=>setTick(n=>n+1),5000);return()=>clearInterval(t);},[]);void tick;
 const valid=budget.available&&capitalUsd>0&&Number.isFinite(riskPct)&&riskPct>=0&&riskPct<=100&&Object.values(costs).every(v=>v!==null&&Number.isFinite(v)&&v>=0);
 useEffect(()=>{
  let cancelled=false;
  if(!valid||!requested.startsWith(key+'|'))return;
  setState({key,rows:[],loading:true,failed:0,checked:0,limited:false});
  void(async()=>{
   const rows:Verified[]=[];let failed=0,checked=0,limited=false;
   for(const c of eligible.slice(0,MAX_PREVIEW_CHECKS)){
    if(cancelled)break;
    const current=useBorosAccount.getState();if(accountIsStale(current)||accountBudget(current.data,false,market,marginMode).identity!==budget.identity)break;
    checked++;
    try{
     const handle=packAccount(current.root,current.accountId,c.m.tokenId!,marginMode==='cross'?CROSS:c.m.marketId);
     const q=await previewBorosOrder({marketAcc:handle,marketId:c.m.marketId,side:c.direction==='long'?0:1,size:toX18(new Decimal(c.sizeYu).toFixed(18,Decimal.ROUND_DOWN)),tif:2,slippage:.005});
     if(cancelled)break;
     if(!q.success||q.handle!==handle||q.liquidationApr===null||q.matchedApr===null||q.margin===null||q.matchedSize===null||q.matchedSize<=0||q.marketId!==c.m.marketId||q.side!==c.direction||Date.now()-q.fetchedAt>=60000){failed++;continue;}
     const b=accountBudget(current.data,false,c.m,marginMode);if(!b.available||b.currentMargin===null||b.price===null){failed++;continue;}
     const candidateCosts=recommendationCosts(c.m,q.matchedSize,costs,modelFees);
     const a=analyzeEntry({m:c.m,direction:c.direction,sizeYu:q.matchedSize,capitalUsd,entryRate:q.matchedApr,floatingRate:c.m.floatingApr,...candidateCosts});
     const remaining=previewBudgetRemaining(capitalUsd,Math.max(0,q.margin-b.currentMargin)*b.price,a?.costs??Infinity,a?.preview.expectedMtm??-Infinity);
     if(!a||a.state==='unavailable'||a.state==='incomplete'||a.net===null||a.net<=0||a.scenarioMin===null||a.scenarioMin< -capitalUsd*riskPct/100||remaining<0){failed++;continue;}
     rows.push({candidate:c,quote:q,net:a.net,adverse:a.scenarioMin,remaining,costs:candidateCosts});
    }catch(e){failed++;if((e as {status?:number}).status===429){limited=true;break;}}
   }
   if(!cancelled)setState({key,rows:distinctBest(rows.filter(r=>Date.now()-r.quote.fetchedAt<60000)),loading:false,failed,checked,limited});
  })();
  return()=>{cancelled=true;};
 // Inputs are serialized so equal account refreshes do not spend more API calls.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key,requested,valid]);
 const rows=state.key===key&&budget.available?state.rows.filter(r=>Date.now()-r.quote.fetchedAt<60000):[];
 const packed=JSON.stringify(rows.map((r,i)=>({name:`${borosAssetName(r.candidate.m.asset)} · ${borosVenueName(r.candidate.m.venue)} · ${r.candidate.direction==='long'?'لانگ':'شورت'}`,kind:'borosVerifiedCandidates',source:'simulation' as const,status:'partial' as const,asOf:r.quote.fetchedAt,metrics:{rank:i+1,marketId:r.candidate.m.marketId,long:Number(r.candidate.direction==='long'),capitalUsd,sizeYu:r.quote.matchedSize,entryApr:r.quote.matchedApr,floatingApr:r.candidate.m.floatingApr,marginAfterCollateral:r.quote.margin,liquidationApr:r.quote.liquidationApr,projectedNetUsd:r.net,adverseNetUsd:r.adverse,remainingUsd:r.remaining,maxLossPct:riskPct,daysToMaturity:Math.max(0,(r.candidate.m.maturity-Date.now()/1000)/86400),feesUsd:r.costs.feesUsd,gasUsd:r.costs.gasUsd,slippageUsd:r.costs.slippageUsd,checkedCandidates:state.checked,eligibleCandidates:eligible.length,alternatives:1}})));
 useEffect(()=>{
  // A fresh detail panel must not erase the recommendations used to reach it.
  if(state.key||!budget.available)useAssistantInsights.getState().put('borosVerifiedCandidates',JSON.parse(packed),budget.scope);
 },[packed,budget.scope,state.key,budget.available]);
 const loading=state.key===key&&state.loading;
 return <Surface className="p-4 md:p-5 space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-base font-bold">سه پیشنهاد ورود با حساب من</h3><p className="mt-1 text-xs text-muted">بیشترین سود تخمینی میان گزینه‌های بررسی‌شده · هر کارت یک انتخاب مستقل</p></div><Button size="sm" disabled={!valid||loading||!eligible.length} loading={loading} onClick={()=>setRequested(key+'|'+Date.now())}>بررسی پیشنهادها</Button></div>
 {!valid?<p className="text-xs text-muted">موجودی تازه، هزینه‌های مشخص و حد زیان معتبر لازم است.</p>:!eligible.length?<p className="text-xs text-muted">در این بازهٔ سررسید، گزینهٔ اولیهٔ مناسب یافت نشد.</p>:loading?<p role="status" className="text-sm text-muted">در حال گرفتن پیش‌نمایش رسمی گزینه‌ها…</p>:!rows.length?<p className="text-xs text-muted">{state.key===key?'پیشنهاد معتبر باقی نمانده است؛ هزینه، ریسک یا زمان اعتبار پیش‌نمایش را بررسی کنید.':'برای دریافت پیشنهادها، «بررسی پیشنهادها» را بزنید.'}</p>:<>
 <div className="grid gap-3 lg:grid-cols-3">{rows.map((r,i)=><article key={r.candidate.m.marketId} className={`min-w-0 rounded-2xl border p-4 space-y-4 ${i===0?'border-accent/30 bg-accent/5':'border-divider'}`}><div className="flex flex-wrap justify-between gap-2"><MarketIdentity market={r.candidate.m} compact/><span className="text-xs text-accent">{r.candidate.direction==='long'?'لانگ نرخ':'شورت نرخ'}</span></div><div><p className="text-xs text-muted">سود خالص تخمینی تا سررسید</p><MoneyValue digits={2} value={r.net} signed tone="auto" className="mt-1 text-xl font-bold"/></div><dl className="grid grid-cols-2 gap-3 text-xs"><div><dt className="mb-1 text-muted">تا سررسید</dt><dd><QuantityValue value={(r.candidate.m.maturity-Date.now()/1000)/86400} digits={1} unit="روز"/></dd></div><div><dt className="mb-1 text-muted">سناریوی نامساعد</dt><dd><MoneyValue digits={2} value={r.adverse} signed tone="auto"/></dd></div><div><dt className="mb-1 text-muted">مارجین پس از سفارش</dt><dd><MoneyValue digits={2} value={r.quote.margin===null?null:r.quote.margin*budget.price!}/></dd></div><div><dt className="mb-1 text-muted">نرخ لیکوییدشدن · API</dt><dd><PercentValue value={r.quote.liquidationApr===null?null:r.quote.liquidationApr*100} tone="none"/></dd></div></dl><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>onSelect({marketId:r.candidate.m.marketId,direction:r.candidate.direction,sizeYu:r.quote.matchedSize!,quote:r.quote,identity:budget.identity,marginMode,costs:r.costs,extraEntranceUsd:modelFees?costs.feesUsd:undefined})}>جزئیات ورود</Button><Link className={buttonClass('ghost','sm')} to={`/assistant?borosMarket=${r.candidate.m.marketId}`}>توضیح دستیار</Link></div></article>)}</div><p className="text-[11px] leading-6 text-muted">سود با فرض نرخ شناور و قیمت فعلی وثیقه است. پیش‌نمایش رسمی سفارش اجراشده نیست؛ این گزینه‌ها را با یک موجودی هم‌زمان باز نکنید.</p></>}
 {state.key===key&&!loading&&<p className="text-[11px] text-muted">{new Intl.NumberFormat('fa-IR').format(state.checked)} پیش‌نمایش از {new Intl.NumberFormat('fa-IR').format(eligible.length)} گزینهٔ اولیه بررسی شد؛ حداکثر {new Intl.NumberFormat('fa-IR').format(MAX_PREVIEW_CHECKS)} بررسی در هر نوبت.{state.limited?' محدودیت سرویس؛ بعداً بازبینی کنید.':''}</p>}
 </Surface>;
}

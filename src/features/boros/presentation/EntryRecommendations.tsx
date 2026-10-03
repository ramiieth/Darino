import {useEffect,useMemo,useState} from 'react';
import {useBorosAccount,refreshBorosAccount,accountIsStale} from '../data/useBorosAccount';
import {accountBudget} from '../domain/accountBudget';
import {entryCandidates} from '../domain/recommendations';
import type {BorosMarket} from '../domain/types';
import {VerifiedOpportunities,type EntrySelection} from './VerifiedOpportunities';
import {Surface} from '@/shared/components/ui/GlassCard';
import {Field,Input,Select} from '@/shared/components/ui/Input';
import {Button} from '@/shared/components/ui/Button';
import {MoneyValue} from '@/shared/components/ui/FinancialValue';
import {Disclosure} from '@/shared/components/ui/Disclosure';
import {normalizeDecimalInput} from '@/features/cost-basis/presentation/decimalInput';
import {tokenName} from '@/features/connected/presentation/identity';
const number=(s:string)=>/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)&&Number.isFinite(Number(s))?Number(s):null;
export function EntryRecommendations({markets,onSelect,onAccount}:{markets:BorosMarket[];onSelect:(entry:EntrySelection)=>void;onAccount:()=>void}){
 const account=useBorosAccount();const [selected,setSelected]=useState('');
 const [days,setDays]=useState('30'),[allocation,setAllocation]=useState('50'),[risk,setRisk]=useState('10'),[gas,setGas]=useState(''),[entrance,setEntrance]=useState('');
 useEffect(()=>{void refreshBorosAccount();const timer=setInterval(()=>{if(document.visibilityState==='visible')void refreshBorosAccount();},30000);return()=>clearInterval(timer);},[]);
 const zones=[...new Map(markets.filter(m=>m.tokenId!==undefined&&m.status==='GOOD').map(m=>[String(m.tokenId),m])).values()];
 const fallback=zones.find(m=>accountBudget(account.data,accountIsStale(account),m).available)||zones[0];
 const market=zones.find(m=>String(m.tokenId)===selected)||fallback;
 const budget=market?accountBudget(account.data,accountIsStale(account),market):null;
 const costs={feesUsd:number(entrance),gasUsd:number(gas),slippageUsd:0};
 const candidates=useMemo(()=>market&&budget?.available?entryCandidates(markets,market.tokenId!,budget.budgetUsd!,number(allocation)??0,Number(days),costs):[],[markets,market,budget?.available,budget?.budgetUsd,allocation,days,gas,entrance]);
 const input=(label:string,value:string,set:(v:string)=>void,suffix:string,placeholder?:string)=><Field label={label}><Input dir="ltr" inputMode="decimal" value={value} onChange={e=>set(normalizeDecimalInput(e.target.value))} suffix={suffix} placeholder={placeholder}/></Field>;
 return <div className="space-y-4"><Surface variant="focal" className="p-4 md:p-5 space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-bold">پیشنهاد ورود با حساب من</h2><p className="mt-2 text-xs leading-6 text-muted">۱. بودجه و سررسید را مشخص کنید · ۲. پیشنهادها را بررسی کنید · ۳. یک گزینه را پیش‌نمایش بگیرید</p></div><Button size="sm" variant="outline" onClick={onAccount}>حساب من</Button></div><div className="grid gap-4 sm:grid-cols-2"><Field label="وثیقه"><Select value={market?.tokenId??''} onChange={e=>setSelected(e.target.value)}>{zones.map(m=><option key={m.tokenId} value={m.tokenId}>{tokenName(m.collateralSymbol??m.asset)}</option>)}</Select></Field><div><p className="text-xs text-muted">مارجین آزاد همین وثیقه · حساب واقعی</p><MoneyValue value={budget?.budgetUsd} digits={2} className="mt-2 text-xl font-bold" state={accountIsStale(account)?'stale':'ready'}/></div></div>{!account.root?<p className="text-xs text-muted">آدرس عمومی بوروس را در «حساب من» ثبت کنید.</p>:!budget?.available?<p className="text-xs text-muted">موجودی تازهٔ وثیقه لازم است. <button className="min-h-11 text-accent" onClick={()=>void refreshBorosAccount(true)}>تازه‌سازی حساب</button></p>:null}</Surface>
 <Surface className="p-4 md:p-5 space-y-4"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="سررسید مطلوب"><Select value={days} onChange={e=>setDays(e.target.value)}>{[7,30,60,90].map(n=><option key={n} value={n}>تا {new Intl.NumberFormat('fa-IR').format(n)} روز</option>)}</Select></Field>{input('تخصیص مارجین',allocation,setAllocation,'٪')}{input('حد زیان سناریوی نامساعد',risk,setRisk,'٪ بودجه')}{input('گس کل دوره',gas,setGas,'دلار','مقدار برآوردی؛ صفر باید صریح باشد')}{input('هزینهٔ ورود اضافی هر بازار',entrance,setEntrance,'دلار','مقدار مشخص در بوروس؛ صفر باید صریح باشد')}</div><Disclosure summary="هزینه‌ها چگونه محاسبه می‌شوند؟"><p className="py-2 text-xs leading-6 text-muted">کارمزد معامله و تسویه برای حجم و سررسید هر بازار جدا محاسبه می‌شود. نگهداری تا سررسید فرض شده است؛ خروج زودتر نیاز به بررسی تازه دارد. هزینهٔ ورود اضافی و گس، فرض‌های شما هستند. اثر اجرای نرخ از پیش‌نمایش رسمی گرفته می‌شود و دوباره به‌عنوان لغزش دلاری کسر نمی‌شود. حد زیان، فیلتر سناریو است و تضمین سقف زیان نیست.</p></Disclosure></Surface>
 {market&&<VerifiedOpportunities candidates={candidates.filter(c=>c.result.scenarioMin!==null&&c.result.scenarioMin>= -(budget?.budgetUsd??0)*(number(risk)??-1)/100)} market={market} marginMode="cross" capitalUsd={budget?.budgetUsd??0} riskPct={number(risk)??NaN} costs={costs} modelFees onSelect={onSelect}/>}
 </div>;
}

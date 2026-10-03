import { useEffect, useRef, useState } from 'react';
import { useBorosAccount, hydrateBorosAccount, previewBorosOrder, accountIsStale } from '../data/useBorosAccount';
import { accountBudget } from '../domain/accountBudget';
import { quoteUsable, QUOTE_TTL_MS } from '../domain/quoteValidity';
import { orderPreview } from '../domain/preview';
import { packAccount, toX18, CROSS, type OfficialPreview } from '@/shared/boros/account';
import { usePublishInsight } from '@/shared/assistant/insights';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { Metric, MetricGrid, PercentValue, MoneyValue, QuantityValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { normalizeDecimalInput } from '@/features/cost-basis/presentation/decimalInput';
import { assetDisplayName } from '@/shared/i18n/assetDisplayName';
import { toFaDigits } from '@/shared/utils/formatters';
import type { BorosDirection, BorosMarket } from '../domain/types';
import { HttpError } from '@/repositories/remoteClient';
const label=(fa:string,en:string)=><span className="flex flex-col gap-1"><span>{fa}</span><bdi dir="ltr" className="text-[10px] font-normal text-muted">{en}</bdi></span>;
export function OfficialPreviewPanel({market,direction,size,onApply,marginMode,onMarginMode,appliedQuote}:{market:BorosMarket;direction:BorosDirection;size:string;appliedQuote?:OfficialPreview|null;marginMode?:string;onMarginMode?:(mode:string)=>void;onApply?:(preview:OfficialPreview)=>void}) {
 const s=useBorosAccount();const [localMode,setLocalMode]=useState('cross');const mode=marginMode??localMode;const setMode=onMarginMode??setLocalMode;
 const [slippage,setSlippage]=useState('0.5');const [result,setResult]=useState<OfficialPreview|null>(null);const [error,setError]=useState<string|null>(null);const [loading,setLoading]=useState(false);
 const budget=accountBudget(s.data,accountIsStale(s),market,mode);
 const identity=[budget.identity,s.root,s.accountId,market.marketId,market.tokenId,direction,Number(size),mode,slippage].join(':');
 const liveIdentity=useRef(identity);liveIdentity.current=identity;
 const [resultIdentity,setResultIdentity]=useState('');const [now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{if(appliedQuote){setResult(appliedQuote);setResultIdentity(identity);}},[appliedQuote]);
 const shown=resultIdentity===identity?result:null;
 const valid=quoteUsable(shown,shown?.handle===budget.handle,budget.available,market.marketId,direction,Number(size),market.maturity,now)?shown:null;
 const price=budget.price;const unit=assetDisplayName(market.collateralSymbol??market.asset).name;
 const model=orderPreview({m:market,direction,notional:valid?.matchedSize??Number(size),availableCollateral:budget.freeCollateral,collateralPriceUsd:price,fixedApr:valid?.matchedApr??market.markApr,underlyingApr:market.floatingApr,nowSec:Math.floor(now/1000)});
 useEffect(()=>{void hydrateBorosAccount();},[]);
 usePublishInsight('borosOfficialPreview','پیش‌نمایش رسمی بوروس',valid?{marketId:valid.marketId,requestedSizeYu:valid.requestedSize,matchedSizeYu:valid.matchedSize,matchedApr:valid.matchedApr,marginCollateral:valid.margin,liquidationApr:valid.liquidationApr,priceImpact:valid.priceImpact,success:Number(valid.success),collateralPriceUsd:price}:null,'simulation','partial',valid?.fetchedAt,budget.scope);
 const preview=async()=>{
  setError(null);setLoading(true);
  try {
   if(market.tokenId===undefined||market.status!=='GOOD'||market.maturity*1000<=Date.now()||!budget.available||slippage.trim()===''||!Number.isFinite(Number(slippage)))throw new Error('invalid');
   const requestedIdentity=identity;const startedRoot=s.root+':'+s.accountId;
   const p=await previewBorosOrder({marketAcc:packAccount(s.root,s.accountId,market.tokenId,mode==='cross'?CROSS:market.marketId),marketId:market.marketId,side:direction==='long'?0:1,size:toX18(size),tif:2,slippage:Number(slippage)/100});
   if(liveIdentity.current!==requestedIdentity||useBorosAccount.getState().root+':'+useBorosAccount.getState().accountId!==startedRoot)return;
   setResult(p);setResultIdentity(identity);setNow(Date.now());
   if(quoteUsable(p,p.handle===budget.handle,budget.available,market.marketId,direction,p.matchedSize??0,market.maturity))onApply?.(p);
  }catch(e){setError(e instanceof HttpError?e.code??'پیش‌نمایش دریافت نشد':'مقادیر پیش‌نمایش معتبر نیست');}finally{setLoading(false);}
 };
 const fixed=shown?.matchedApr??null;
 return <Surface className="p-4 md:p-5 space-y-4 border-accent/20">
  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold">پیش‌نمایش رسمی ورود</h3><span className="text-xs text-muted" role="status">{valid?`اعتبار قیمت: ${toFaDigits(Math.max(0,Math.ceil((QUOTE_TTL_MS-(now-valid.fetchedAt))/1000)))} ثانیه`:shown?'قیمت منقضی شده':'قیمت اجرا دریافت نشده'}</span></div>
  {!s.root?<p className="text-xs text-muted">ابتدا آدرس را در «حساب من» ثبت کنید.</p>:<>
   <div className="grid grid-cols-2 gap-3"><Field label="مارجین"><Select value={mode} onChange={e=>setMode(e.target.value)}><option value="cross">مشترک · Cross</option><option value="isolated">جدا · Isolated</option></Select></Field><Field label="حد لغزش نرخ"><Input dir="ltr" inputMode="decimal" value={slippage} suffix="٪" onChange={e=>setSlippage(normalizeDecimalInput(e.target.value))}/></Field></div>
   <Button size="sm" className="w-full sm:w-auto" onClick={()=>void preview()} disabled={loading||!budget.available||market.status!=='GOOD'||market.maturity*1000<=now||market.tokenId===undefined||Number(size)<=0||!Number.isFinite(Number(size))||slippage.trim()===''||Number(slippage)<0||Number(slippage)>50}>{loading?'در حال بررسی…':shown?'تازه‌سازی قیمت اجرا':'دریافت قیمت اجرا'}</Button>
  </>}
  {error&&<Notice tone="warn">{error}</Notice>}
  <div className="grid grid-cols-2 gap-3">
   <div className="min-w-0 rounded-2xl bg-negative/5 border border-negative/15 p-3 space-y-2">{label('پرداخت شما','Pay')}<PercentValue value={direction==='long'?fixed===null?null:fixed*100:market.floatingApr*100} signed={false} tone="none" state={shown&&!valid?'stale':'ready'} className="text-xl font-bold"/><p className="text-xs text-muted">{direction==='long'?'ثابت · Fixed':'شناور · Floating'}</p></div>
   <div className="min-w-0 rounded-2xl bg-positive/5 border border-positive/15 p-3 space-y-2">{label('دریافت شما','Receive')}<PercentValue value={direction==='short'?fixed===null?null:fixed*100:market.floatingApr*100} signed={false} tone="none" state={shown&&!valid?'stale':'ready'} className="text-xl font-bold"/><p className="text-xs text-muted">{direction==='short'?'ثابت · Fixed':'شناور · Floating'}</p></div>
  </div>
  <MetricGrid cols={2}>
   <Metric label={label('حساسیت به تغییر ۱ واحد درصد نرخ','Rate Sensitivity')} value={<QuantityValue value={model?.rateSensitivityAsset} unit={unit}/>} sub={<MoneyValue value={model?.rateSensitivityUsd}/>}/>
   <Metric label={label('نرخ لیکوییدشدن پس از ورود','Liquidation Implied APR')} value={<PercentValue value={shown?.liquidationApr==null?null:shown.liquidationApr*100} tone="none" state={shown&&!valid?'stale':'ready'}/>} sub="بر مبنای نرخ مارک؛ قیمت توکن نیست"/>
   <Metric label={label('مارجین پس از سفارش','Margin Required')} value={<QuantityValue value={shown?.margin} unit={unit}/>} sub={<MoneyValue value={shown?.margin!=null&&price!=null?shown.margin*price:null}/>}/>
   <Metric label={label('کارمزد معامله · تخمینی','Fees')} value={<QuantityValue value={model?.fees.entryFee!=null&&price?model.fees.entryFee/price:null} unit={unit}/>} sub={<MoneyValue value={model?.fees.entryFee}/>}/>
   <Metric label={label('اثر نرخ اجرای سفارش','Slippage · Est.')} value={<PercentValue value={shown?.priceImpact==null?null:Math.abs(shown.priceImpact)*100} tone="none" state={shown&&!valid?'stale':'ready'}/>} sub={<>حد انتخاب‌شده: <PercentValue value={Number(slippage)} tone="none"/></>}/>
   <Metric label={label('حجم اجرای پیش‌نمایش','Notional Size')} value={<QuantityValue value={shown?.matchedSize} unit="واحد بازده"/>}/>
  </MetricGrid>
  {shown&&!valid&&<Notice tone="stale">اعداد قبلی فقط برای مرور باقی مانده‌اند؛ برای محاسبه با نرخ رسمی، قیمت را تازه‌سازی کنید.</Notice>}
  {valid&&<Notice tone="info">نرخ اجرای رسمی در محاسبه استفاده شد؛ هیچ سفارشی ارسال نشده است.</Notice>}
  {shown&&!shown.success&&<Notice tone="warn">پیش‌نمایش ورود موفق نیست؛ موجودی، مارجین یا نقدشوندگی را بررسی کنید.</Notice>}
  <p className="text-xs leading-6 text-muted">کارمزد بالا فقط معامله است؛ هزینهٔ ورود به بازار، تسویه و گس در برآورد خالص جدا لحاظ می‌شوند.</p>
 </Surface>;
}

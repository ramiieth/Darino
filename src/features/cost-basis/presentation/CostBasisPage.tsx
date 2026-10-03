import { costSummary, COST_STATUS } from '../domain/summary';
import { normalizeDecimalInput,purchaseDecimal } from './decimalInput';
import { Sheet } from '@/shared/components/ui/Sheet';
import { SmartDateField } from '@/shared/components/ui/SmartDateField';
import { parseIsoToTs,formatGregorianIso } from '@/shared/utils/jalali';
import { AssetValue } from '@/features/connected/presentation/AssetValue';
import { AssetPicker,type AssetOption } from '@/features/connected/presentation/AssetPicker';
import { toFaDigits } from '@/shared/utils/formatters';
import { tokenQuantity } from '@/features/connected/presentation/identity';
import { useState } from 'react';
import Decimal from 'decimal.js';
import { Plus,RefreshCw,Check } from 'lucide-react';
import { Page,PageHeader } from '@/shared/components/layout/Page';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Field,Input } from '@/shared/components/ui/Input';
import { Badge } from '@/shared/components/ui/Badge';
import { Notice } from '@/shared/components/ui/StateViews';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { TokenLogo } from '@/shared/components/ui/EntityLogo';
import { useCustodySync } from '@/features/custody/data/sync';
import { getPref,savePref,useCustodyStore } from '@/features/custody/data/repository';
import { useCustody } from '@/features/custody/data/useCustody';
import { useConnectedPortfolio } from '@/features/connected/data/useConnectedPortfolio';
import { useActivity } from '@/features/connected/data/useActivity';
import { refreshTransactions } from '@/features/connected/data/store';
import { chainIdentity,tokenName } from '@/features/connected/presentation/identity';
import { dateTime,providerError } from '@/features/connected/presentation/ConnectedPage';
import type { FifoLot } from '@/features/accounting/domain/types';
import { COST_PREF,decimalPositive,type CostBook,type CostLot } from '../domain/book';
import { previewLegacy,retireLegacy } from '../data/legacy';
export default function CostBasisPage() {
 useCustodySync();useCustodyStore();const custody=useCustody(),p=useConnectedPortfolio();const activity=useActivity(p);
 const book=getPref<CostBook>(COST_PREF)?.value;
 const [legacy,setLegacy]=useState<FifoLot[]|null>(null),[bindings,setBindings]=useState<Record<number,string>>({}),[legacyFees,setLegacyFees]=useState<Record<number,string>>({});
 const [saved,setSaved]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const [formOpen,setFormOpen]=useState(false),[removeConfirm,setRemoveConfirm]=useState(false);
 const [editing,setEditing]=useState<string|null>(null);
 const [key,setKey]=useState(''),[qty,setQty]=useState(''),[price,setPrice]=useState(''),[fee,setFee]=useState('0'),[date,setDate]=useState(new Date().toISOString().slice(0,10));
 const summary=costSummary(p,book,activity.links);
 const assets=summary.rows;
 const eligibleLegacy=legacy?.filter(l=>assets.some(a=>a.asset.symbol.toUpperCase()===l.asset.toUpperCase()))??[];
 const archivedLegacy=legacy?.filter(l=>!eligibleLegacy.includes(l))??[];
 const assetOptions:AssetOption[]=assets.map(a=>({...a.asset,icon:a.asset.icon,quantity:a.quantity.toString(),value:a.priced?a.value.toNumber():null,networks:[...a.chains]}));
 const coveredHistory=!!book&&p.wallets.every(w=>!!w.state?.historyLoaded&&!w.state.historyError&&(!w.state.next||w.state.history.some(tx=>Date.parse(tx.minedAt)<=book.asOf)));
 const result=summary.result;
 async function act(fn:()=>Promise<void>){setBusy(true);setError(null);try{await fn();}catch(e){setError(providerError(e));}finally{setBusy(false);}}
 async function importOld(){const rows=await previewLegacy(custody.assetById);setLegacy(rows);setLegacyFees(Object.fromEntries(rows.filter(r=>r.legacyFee!==null).map(r=>[r.id,r.legacyFee!])));setBindings({});}
 async function confirmOld(){
  if(legacy===null)return;
  if(!p.wallets.length||p.wallets.some(w=>!w.state?.data?.complete))throw Error('ابتدا موجودی کیف پول را دریافت کنید');
  const lots:CostLot[]=eligibleLegacy.map(l=>{const chosen=assets.find(a=>a.asset.key===bindings[l.id]);if(!chosen)throw Error('برای هر خرید، دارایی واقعی را انتخاب کنید');return {id:`legacy:${l.id}`,asset:chosen.asset,quantity:String(l.qty),unitCost:legacyFees[l.id]&&/^\d+(\.\d+)?$/.test(legacyFees[l.id])?new Decimal(l.unitCost).plus(new Decimal(legacyFees[l.id]).div(l.qty)).toString():String(l.unitCost),fee:legacyFees[l.id]&&/^\d+(\.\d+)?$/.test(legacyFees[l.id])?legacyFees[l.id]:null,at:l.openedAt,source:'legacy-remaining-cost'};});
  await retireLegacy({version:1,asOf:book?.asOf??Date.now(),lots:[...(book?.lots??[]).filter(l=>!lots.some(n=>n.id===l.id)),...lots],archivedPurchases:[...(book?.archivedPurchases??[]).filter(l=>!archivedLegacy.some(n=>`legacy:${n.id}`===l.id)),...archivedLegacy.map(l=>({id:`legacy:${l.id}`,symbol:l.asset,quantity:String(l.qty),unitCost:String(l.unitCost),fee:legacyFees[l.id]??null,at:l.openedAt}))],migrationConfirmed:true,legacyRetired:false});setLegacy(null);setSaved(true);
 }
 async function add(){
  const asset=assets.find(a=>a.asset.key===key)?.asset,quantity=purchaseDecimal(qty),unitPrice=purchaseDecimal(price),purchaseFee=fee.trim()===''?null:purchaseDecimal(fee,true);
  if(!asset)throw Error('دارایی را انتخاب کنید');
  if(quantity===null)throw Error('مقدار خرید باید عدد مثبت باشد؛ مثلاً ۰.۶۵');
  if(unitPrice===null)throw Error('قیمت خرید باید عدد مثبت باشد');
  if(fee.trim()!==''&&purchaseFee===null)throw Error('کارمزد باید صفر یا عدد مثبت باشد');
  if(!Number.isFinite(Date.parse(date)))throw Error('تاریخ خرید را انتخاب کنید');
  if(formatGregorianIso(parseIsoToTs(date)!)>formatGregorianIso(book?.asOf??Date.now()))throw Error('تاریخ خرید پس از مبنای محاسبه است');
  const lot:CostLot={id:editing??crypto.randomUUID(),asset,quantity,unitCost:new Decimal(unitPrice).plus(new Decimal(purchaseFee??0).div(quantity)).toString(),fee:purchaseFee,at:Math.min(parseIsoToTs(date)!,book?.asOf??Date.now()),source:'user-confirmed'};
  await savePref(COST_PREF,{...(book??{version:1,asOf:Date.now(),migrationConfirmed:false,legacyRetired:false}),lots:[...(book?.lots??[]).filter(l=>l.id!==editing),lot]});setQty('');setPrice('');setFee('0');setEditing(null);setFormOpen(false);setSaved(true);
 }
 function start(assetKey=''){setEditing(null);setKey(assetKey);setQty('');setPrice('');setFee('0');setDate(formatGregorianIso(Math.min(book?.asOf??Date.now(),Date.now())));setError(null);setRemoveConfirm(false);setFormOpen(true);}
 const walletCovered=summary.walletCovered;
 return <Page><PageHeader title="سوابق خرید و سود و زیان" actions={<div className="flex gap-2"><Button variant="ghost" loading={busy} icon={<RefreshCw/>} aria-label="به‌روزرسانی سود و زیان" onClick={()=>void act(async()=>{await p.refresh();for(const w of p.wallets)await refreshTransactions(w.holding.address!);})}/><Button icon={<Plus/>} disabled={!assets.length} onClick={()=>start()}>ثبت خرید</Button></div>}/>
 {saved&&<Notice tone="success">بهای خرید ذخیره شد؛ نتیجه در داشبورد نمایش داده می‌شود.</Notice>}
 {error&&!formOpen&&<Notice tone="warn">{error}</Notice>}
 {!book?.legacyRetired&&<Surface className="p-4"><details open={legacy!==null}><summary className="cursor-pointer text-sm font-semibold">خریدهای قبلی</summary><div className="mt-4 space-y-4">{book?.migrationConfirmed?<Button loading={busy} onClick={()=>void act(()=>retireLegacy(book))}>تکمیل انتقال</Button>:legacy===null?<Button loading={busy} onClick={()=>void act(importOld)}>بررسی خریدهای قبلی</Button>:<><ul className="space-y-3">{eligibleLegacy.map(l=><li key={l.id} className="grid gap-3 rounded-xl bg-surface-2 p-3 sm:grid-cols-2"><div><bdi dir="rtl">{toFaDigits(l.qty)} {tokenName(l.asset)}</bdi><p className="text-xs text-muted">{dateTime(l.openedAt)} · <MoneyValue value={l.unitCost}/></p></div><Field label="دارایی"><AssetPicker label="تطبیق با دارایی واقعی" options={assetOptions} value={bindings[l.id]??''} onChange={v=>setBindings(s=>({...s,[l.id]:v}))}/></Field><Field label="کارمزد · دلار"><Input dir="ltr" type="text" inputMode="decimal" autoComplete="off" spellCheck={false} placeholder="نامشخص" value={legacyFees[l.id]??''} onChange={e=>setLegacyFees(x=>({...x,[l.id]:normalizeDecimalInput(e.target.value)}))}/></Field></li>)}</ul>{!legacy.length&&<p className="text-xs text-muted">خرید قبلی یافت نشد.</p>}<Button loading={busy} icon={<Check/>} disabled={eligibleLegacy.some(l=>!bindings[l.id])} onClick={()=>void act(confirmOld)}>تأیید انتقال</Button></>}</div></details></Surface>}
 <div className="grid min-w-0 gap-4 lg:grid-cols-2">{assets.map(a=>{
  const chain=chainIdentity(a.asset.chain),v=a.valuation;
  const {issues,ready,stale,pnl}=a;const known=v.covered!=='0';
  return <Surface key={a.asset.key} className="min-w-0 space-y-4 p-4 md:p-5"><div className="flex min-w-0 items-start gap-3"><TokenLogo logo={a.asset.icon} symbol={a.asset.symbol} name={tokenName(a.asset.symbol,a.asset.name)} networkLogo={a.chains.size===1?chain.logo:undefined} networkName={a.chains.size===1?chain.name:undefined} size={36}/><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">{tokenName(a.asset.symbol,a.asset.name)}</h2><p className="mt-1 text-xs text-muted">{[...a.chains].map(id=>chainIdentity(id).name).join(' · ')}</p><bdi dir="rtl" className="mt-1 block break-words text-xs text-muted">{tokenQuantity(a.quantity.toString())} {tokenName(a.asset.symbol)}</bdi></div><AssetValue value={a.priced?a.value.toNumber():null} className="max-w-[45%] text-end" primaryClassName="text-sm"/></div>
 <div className="grid grid-cols-2 gap-3 rounded-xl bg-surface-2 p-3"><div className="min-w-0"><p className="mb-2 text-[11px] text-muted">{v.unknown!=='0'?'بهای خریدِ مشخص':'بهای خرید'}</p><MoneyValue value={a.basis} className="break-words text-sm"/></div><div className="min-w-0"><p className="mb-2 text-[11px] text-muted">{v.unknown!=='0'?'سودِ بخش مشخص':'سود و زیان باز'}</p><MoneyValue value={pnl} signed tone="auto" className="break-words text-sm"/></div></div>
 <div className="flex flex-wrap items-center justify-between gap-2"><Badge tone={a.status==='ready'?'gain':'warn'}>{COST_STATUS[a.status as keyof typeof COST_STATUS]}</Badge><Button size="sm" variant="ghost" onClick={()=>start(a.asset.key)}>ثبت بهای خرید</Button></div>
 {issues.length>0&&<p className="text-xs text-warn">{issues[0].reason}</p>}
 {known&&<details className="border-t border-divider pt-3 text-xs"><summary className="cursor-pointer text-muted">خریدها</summary><ul className="mt-2 divide-y divide-divider">{result?.lots.filter(l=>l.asset.key===a.asset.key&&decimalPositive(l.quantity)).map(l=><li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><span>{dateTime(l.at)}</span><bdi dir="rtl">{tokenQuantity(l.quantity)} {tokenName(l.asset.symbol)}</bdi><MoneyValue value={Number(l.unitCost)}/>{book?.lots.some(x=>x.id===l.id)&&<Button size="sm" variant="ghost" onClick={()=>{const raw=book.lots.find(x=>x.id===l.id)!;setEditing(raw.id);setKey(raw.asset.key);setQty(raw.quantity);setPrice(new Decimal(raw.unitCost).minus(new Decimal(raw.fee??0).div(raw.quantity)).toString());setFee(raw.fee??'');setDate(formatGregorianIso(raw.at));setError(null);setRemoveConfirm(false);setFormOpen(true);}}>اصلاح</Button>}</li>)}</ul>{issues.map(i=><p key={i.key} className="my-2 text-warn">{i.reason}</p>)}</details>}
 </Surface>;
 })}</div>{!assets.length&&<Surface className="p-6 text-center text-sm text-muted">دارایی قابل محاسبه‌ای موجود نیست.</Surface>}
 {book&&<Surface className="space-y-3 p-4"><div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="text-sm font-semibold">سود و زیان فروش‌ها</h2><MoneyValue value={coveredHistory&&!result?.issues.length?Number(result?.realized):null} signed tone="auto"/></div><details className="text-xs text-muted"><summary className="cursor-pointer">بازه و وضعیت محاسبه</summary><p className="mt-3">از {dateTime(book.asOf)}</p>{p.wallets.filter(w=>!walletCovered(w)).map(w=><div key={w.holding.id} className="mt-2 flex flex-wrap items-center justify-between gap-2"><span>{w.holding.label} · تاریخچه ناقص</span>{w.state?.next&&<Button size="sm" variant="outline" loading={w.state.historyLoading} onClick={()=>void refreshTransactions(w.holding.address!,true)}>دریافت قدیمی‌تر</Button>}</div>)}{result?.issues.map(i=><p key={i.key} className="mt-2 text-warn">{i.reason}</p>)}</details></Surface>}
 {!!book?.archivedPurchases?.length&&<Surface className="p-4"><details className="text-xs"><summary className="cursor-pointer text-muted">خریدهای بایگانی‌شده</summary>{book.archivedPurchases.map(l=><div key={l.id} className="mt-3 flex flex-wrap justify-between gap-2"><span>{tokenName(l.symbol,l.symbol)} · {dateTime(l.at)}</span><MoneyValue value={Number(l.unitCost)}/></div>)}</details></Surface>}
 <Sheet open={formOpen} onClose={()=>{if(!busy)setFormOpen(false);}} title={editing?'اصلاح خرید':'ثبت بهای خرید'}><form onSubmit={e=>{e.preventDefault();void act(add);}} className="space-y-4"><Field label="رمزارز"><AssetPicker options={assetOptions} value={key} onChange={setKey}/></Field><div className="grid grid-cols-2 gap-3"><Field label="مقدار خرید"><Input dir="ltr" type="text" inputMode="decimal" autoComplete="off" spellCheck={false} value={qty} onChange={e=>setQty(normalizeDecimalInput(e.target.value))}/></Field><Field label="قیمت هر واحد · دلار"><Input dir="ltr" type="text" inputMode="decimal" autoComplete="off" spellCheck={false} value={price} onChange={e=>setPrice(normalizeDecimalInput(e.target.value))}/></Field></div><Field label="کارمزد · دلار"><Input dir="ltr" type="text" inputMode="decimal" autoComplete="off" spellCheck={false} value={fee} onChange={e=>setFee(normalizeDecimalInput(e.target.value))}/></Field><SmartDateField compact label="تاریخ خرید" max={book?.asOf??Date.now()} value={parseIsoToTs(date)} onChange={ts=>setDate(ts===null?'':formatGregorianIso(ts))}/>{error&&<Notice tone="warn">{error}</Notice>}{editing&&<Button type="button" variant="ghost" className="w-full" loading={busy} onClick={()=>{if(!removeConfirm){setRemoveConfirm(true);return;}void act(async()=>{if(!book)return;await savePref(COST_PREF,{...book,lots:book.lots.filter(l=>l.id!==editing)});setFormOpen(false);setEditing(null);});}}>{removeConfirm?'تأیید حذف خرید':'حذف خرید'}</Button>}<Button type="submit" className="w-full" loading={busy} disabled={!key||!qty||!price}>{editing?'ذخیرهٔ اصلاح':'ثبت خرید'}</Button></form></Sheet>
 </Page>;
}

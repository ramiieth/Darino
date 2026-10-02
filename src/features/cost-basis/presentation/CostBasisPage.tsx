import { SmartDateField } from '@/shared/components/ui/SmartDateField';
import { parseIsoToTs,formatGregorianIso } from '@/shared/utils/jalali';
import { AssetValue } from '@/features/connected/presentation/AssetValue';
import { AssetPicker,type AssetOption } from '@/features/connected/presentation/AssetPicker';
import { visiblePositions,tokenLogo,trustedToken } from '@/features/connected/domain/visibility';
import { toFaDigits } from '@/shared/utils/formatters';
import { tokenQuantity } from '@/features/connected/presentation/identity';
import { useMemo,useState } from 'react';
import Decimal from 'decimal.js';
import { Plus,RefreshCw,Check,BookOpen } from 'lucide-react';
import { Page,PageHeader } from '@/shared/components/layout/Page';
import { Surface,Section } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Field,Input,Select } from '@/shared/components/ui/Input';
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
import { COST_PREF,costAsset,assetKey,decimalPositive,replayCost,valueCost,verifiedCash,type CostBook,type CostLot } from '../domain/book';
import { previewLegacy,retireLegacy } from '../data/legacy';
export default function CostBasisPage() {
 useCustodySync();useCustodyStore();const custody=useCustody(),p=useConnectedPortfolio();const activity=useActivity(p);
 const book=getPref<CostBook>(COST_PREF)?.value;
 const [legacy,setLegacy]=useState<FifoLot[]|null>(null),[bindings,setBindings]=useState<Record<number,string>>({}),[legacyFees,setLegacyFees]=useState<Record<number,string>>({});
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const [editing,setEditing]=useState<string|null>(null);
 const [key,setKey]=useState(''),[qty,setQty]=useState(''),[price,setPrice]=useState(''),[fee,setFee]=useState('0'),[date,setDate]=useState(new Date().toISOString().slice(0,10));
 const assets=useMemo(()=>{
  const grouped=new Map<string,{asset:ReturnType<typeof costAsset>;quantity:Decimal;value:Decimal;priced:boolean;price:number|null;chains:Set<string>}>();
  for(const wallet of p.wallets) for(const pos of visiblePositions(wallet.state?.data?.positions??[])) {
   if(pos.type!=='wallet'||(!pos.tokenId&&!pos.contract)||!pos.quantity||!decimalPositive(pos.quantity)||verifiedCash(pos.chain,pos.contract))continue;
   const k=assetKey(pos),old=grouped.get(k);
   if(old){old.quantity=old.quantity.plus(pos.quantity);old.chains.add(pos.chain);if(pos.value===null)old.priced=false;else old.value=old.value.plus(pos.value);}
   else grouped.set(k,{asset:{...costAsset(pos),icon:tokenLogo(pos)},quantity:new Decimal(pos.quantity),value:new Decimal(pos.value??0),priced:pos.value!==null,price:pos.price,chains:new Set([pos.chain])});
  }
  return [...grouped.values()].map(a=>({...a,price:a.priced?a.value.div(a.quantity).toNumber():null}));
 },[p.wallets]);
 const allPositions=p.wallets.flatMap(w=>w.state?.data?.positions??[]).filter(x=>x.type==='wallet'&&trustedToken(x)&&x.quantity&&decimalPositive(x.quantity));
 const eligibleLegacy=legacy?.filter(l=>assets.some(a=>a.asset.symbol.toUpperCase()===l.asset.toUpperCase()))??[];
 const archivedLegacy=legacy?.filter(l=>!eligibleLegacy.includes(l))??[];
 const assetOptions:AssetOption[]=assets.map(a=>({...a.asset,icon:a.asset.icon,quantity:a.quantity.toString(),value:a.priced?a.value.toNumber():null,networks:[...a.chains]}));
 const coveredHistory=!!book&&p.wallets.every(w=>!!w.state?.historyLoaded&&!w.state.historyError&&(!w.state.next||w.state.history.some(tx=>Date.parse(tx.minedAt)<=book.asOf)));
 const result=book?replayCost(book,coveredHistory?p.wallets.flatMap(w=>w.state?.history??[]):[],activity.links):null;
 async function act(fn:()=>Promise<void>){setBusy(true);setError(null);try{await fn();}catch(e){setError(providerError(e));}finally{setBusy(false);}}
 async function importOld(){const rows=await previewLegacy(custody.assetById);setLegacy(rows);setLegacyFees(Object.fromEntries(rows.filter(r=>r.legacyFee!==null).map(r=>[r.id,r.legacyFee!])));setBindings({});}
 async function confirmOld(){
  if(legacy===null)return;
  const lots:CostLot[]=eligibleLegacy.map(l=>{const chosen=assets.find(a=>a.asset.key===bindings[l.id]);if(!chosen)throw Error('برای هر خرید، دارایی واقعی را انتخاب کنید');return {id:`legacy:${l.id}`,asset:chosen.asset,quantity:String(l.qty),unitCost:legacyFees[l.id]&&/^\d+(\.\d+)?$/.test(legacyFees[l.id])?new Decimal(l.unitCost).plus(new Decimal(legacyFees[l.id]).div(l.qty)).toString():String(l.unitCost),fee:legacyFees[l.id]&&/^\d+(\.\d+)?$/.test(legacyFees[l.id])?legacyFees[l.id]:null,at:l.openedAt,source:'legacy-remaining-cost'};});
  await retireLegacy({version:1,asOf:Date.now(),lots,archivedPurchases:archivedLegacy.map(l=>({id:`legacy:${l.id}`,symbol:l.asset,quantity:String(l.qty),unitCost:String(l.unitCost),fee:legacyFees[l.id]??null,at:l.openedAt})),migrationConfirmed:true,legacyRetired:false});setLegacy(null);
 }
 async function add(){
  const asset=assets.find(a=>a.asset.key===key)?.asset;if(!asset||!decimalPositive(qty)||!decimalPositive(price)||!/^\d+(\.\d+)?$/.test(fee)||!Number.isFinite(Date.parse(date)))throw Error('دارایی، مقدار، قیمت، تاریخ و کارمزد معتبر وارد کنید');
  if(book&&Date.parse(date)>book.asOf)throw Error('این ثبت برای بهای خرید اولیه است؛ خریدهای پس از تاریخ مبنا از تراکنش‌ها دریافت می‌شوند');
  const lot:CostLot={id:editing??crypto.randomUUID(),asset,quantity:qty,unitCost:new Decimal(price).plus(new Decimal(fee).div(qty)).toString(),fee,at:Date.parse(date),source:'user-confirmed'};
  await savePref(COST_PREF,{...(book??{version:1,asOf:Date.now(),migrationConfirmed:false,legacyRetired:false}),lots:[...(book?.lots??[]).filter(l=>l.id!==editing),lot]});setQty('');setPrice('');setFee('0');setEditing(null);
 }
 return <Page><PageHeader title="سابقهٔ خرید و سود و زیان" subtitle="بهای خرید و FIFO؛ موجودی از کیف پول" eyebrow={<BookOpen className="h-5 w-5 text-accent"/>} actions={<Button variant="outline" loading={busy} icon={<RefreshCw/>} onClick={()=>void act(async()=>{await p.refresh();for(const w of p.wallets)await refreshTransactions(w.holding.address!);})}>به‌روزرسانی</Button>}/>
 {error&&<Notice tone="warn">{error}</Notice>}
 {p.stale&&<Notice tone="warn">بعضی داده‌های کیف پول قدیمی هستند.</Notice>}
 {!book?.legacyRetired&&<Section title="انتقال اطلاعات خرید قبلی" id="cost-migration"><Surface className="space-y-4 p-4"><p className="text-sm leading-7 text-muted">فقط هزینهٔ خرید رمزارزهای باقی‌مانده منتقل می‌شود. نقد دستی و دفتر عمومی کنار گذاشته می‌شوند.</p>{book?.migrationConfirmed?<Button loading={busy} onClick={()=>void act(()=>retireLegacy(book))}>تکمیل انتقال محفوظ</Button>:legacy===null?<Button loading={busy} onClick={()=>void act(importOld)}>بررسی خریدهای قبلی</Button>:<><ul className="space-y-3">{eligibleLegacy.map(l=><li key={l.id} className="grid gap-3 rounded-field bg-surface-2 p-3 sm:grid-cols-2"><div><bdi dir="ltr">{toFaDigits(l.qty)} {l.asset}</bdi><p className="text-xs text-muted">{dateTime(l.openedAt)} · قیمت خرید <MoneyValue value={l.unitCost}/></p></div><Field label="تطبیق با دارایی واقعی"><AssetPicker label="تطبیق با دارایی واقعی" options={assetOptions} value={bindings[l.id]??''} onChange={v=>setBindings(s=>({...s,[l.id]:v}))}/></Field><Field label="کارمزد این مقدار · دلار"><Input dir="ltr" inputMode="decimal" placeholder="نامشخص" value={legacyFees[l.id]??''} onChange={e=>setLegacyFees(x=>({...x,[l.id]:e.target.value}))}/></Field></li>)}</ul>{archivedLegacy.length>0&&<p className="text-xs leading-6 text-muted">بهای خرید {toFaDigits(archivedLegacy.length)} دستهٔ فاقد دارایی قابل نمایش، فقط در سابقه محفوظ می‌ماند و وارد محاسبه یا انتخاب رمزارز نمی‌شود.</p>}{!legacy.length&&<p className="text-sm text-muted">خرید قبلی قابل انتقال یافت نشد.</p>}<Button loading={busy} icon={<Check/>} disabled={eligibleLegacy.some(l=>!bindings[l.id])} onClick={()=>void act(confirmOld)}>تأیید انتقال و کنارگذاشتن دفتر قدیمی</Button></>}</Surface></Section>}
 <Section title="دارایی‌ها و بهای خرید" id="cost-assets"><Surface className="p-4"><ul className="divide-y divide-divider">{assets.map(a=>{const chain=chainIdentity(a.asset.chain),v=valueCost(result?.lots.filter(l=>l.asset.key===a.asset.key)??[],a.quantity.toString(),a.price,allPositions.filter(x=>assetKey(x)===a.asset.key).reduce((s,x)=>s.plus(x.quantity!),new Decimal(0)).toString());return <li key={a.asset.key} className="space-y-3 py-4"><div className="flex items-start gap-3"><TokenLogo logo={a.asset.icon} symbol={a.asset.symbol} name={tokenName(a.asset.symbol,a.asset.name)} networkLogo={chain.logo} networkName={chain.name}/><div className="min-w-0 flex-1"><p className="font-semibold">{tokenName(a.asset.symbol,a.asset.name)} <bdi className="text-xs text-muted">{a.asset.symbol}</bdi></p><p className="text-xs text-muted">{[...a.chains].map(id=>chainIdentity(id).name).join(' · ')}</p><bdi dir="ltr" className="break-all text-sm">{tokenQuantity(a.quantity.toString())} {a.asset.symbol}</bdi></div><AssetValue value={a.priced?a.value.toNumber():null} className="text-end" primaryClassName="text-sm"/></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div><p className="text-xs text-muted">هزینهٔ خریدِ مقدار پوشش‌داده‌شده</p><MoneyValue value={v.covered==='0'||result?.issues.length?null:v.basis}/></div><div><p className="text-xs text-muted">سود و زیان بازِ مقدار پوشش‌داده‌شده</p><MoneyValue value={!coveredHistory||result?.issues.length||p.stale?null:v.pnl} signed tone="auto"/></div></div>{v.unknown!=='0'&&<Badge tone="warn">بهای خرید {tokenQuantity(v.unknown)} واحد نامشخص</Badge>}{v.excess!=='0'&&<Notice tone="warn">مقدار خریدها از موجودی فعلی بیشتر است؛ فروش یا انتقال‌های قبلی را بررسی کنید.</Notice>}</li>;})}</ul>{!assets.length&&<p className="py-4 text-sm text-muted">ابتدا کیف پول دارای رمزارز را متصل کنید.</p>}</Surface></Section>
 <Section title="تکمیل بهای خرید اولیه" id="cost-add"><Surface className="space-y-4 p-4"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="رمزارز"><AssetPicker options={assetOptions} value={key} onChange={setKey}/></Field><Field label="مقدار خرید"><Input dir="ltr" inputMode="decimal" value={qty} onChange={e=>setQty(e.target.value)}/></Field><Field label="قیمت هر واحد · دلار"><Input dir="ltr" inputMode="decimal" value={price} onChange={e=>setPrice(e.target.value)}/></Field><Field label="کارمزد کل خرید · دلار"><Input dir="ltr" inputMode="decimal" value={fee} onChange={e=>setFee(e.target.value)}/></Field><div><SmartDateField label="تاریخ خرید" max={book?.asOf} value={date?parseIsoToTs(date):null} onChange={ts=>setDate(ts===null?'':formatGregorianIso(ts))} compact/></div></div><Button loading={busy} icon={<Plus/>} disabled={!book?.legacyRetired||!key||!qty||!price} onClick={()=>void act(add)}>{editing?'ذخیرهٔ اصلاح خرید':'ثبت بهای خرید'}</Button><p className="text-xs text-muted">خریدهای اولیه تا تاریخ مبنا؛ موجودی کیف پول تغییر نمی‌کند.</p></Surface></Section>
 {book&&<Section title="فروش‌ها و موارد نیازمند بررسی" id="cost-history"><Surface className="space-y-3 p-4"><p className="text-xs text-muted">از مبنای {dateTime(book.asOf)}؛ سود تاریخیِ پیش از این مبنا محاسبه نمی‌شود.</p><MoneyValue value={coveredHistory&&!result?.issues.length?Number(result?.realized):null} signed tone="auto"/>{!coveredHistory&&<Notice tone="warn">تاریخچهٔ بازه کامل نیست؛ برای محاسبه، تراکنش‌های قدیمی‌تر را نیز دریافت کنید.</Notice>}{result?.issues.map(i=><p key={i.key} className="break-all text-xs text-warn">{i.reason} · <bdi dir="ltr">{i.key}</bdi></p>)}<details><summary className="cursor-pointer text-sm text-accent">دسته‌های خرید</summary><ul className="divide-y divide-divider">{result?.lots.filter(l=>assets.some(a=>a.asset.key===l.asset.key)).map(l=><li key={l.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{tokenName(l.asset.symbol,l.asset.name)} · {dateTime(l.at)}</span><bdi dir="ltr">{tokenQuantity(l.quantity)} {l.asset.symbol}</bdi><MoneyValue value={Number(l.unitCost)}/>{book.lots.some(x=>x.id===l.id)&&<Button size="sm" variant="ghost" onClick={()=>{const raw=book.lots.find(x=>x.id===l.id)!;setEditing(raw.id);setKey(raw.asset.key);setQty(raw.quantity);setPrice(new Decimal(raw.unitCost).minus(new Decimal(raw.fee??0).div(raw.quantity)).toString());setFee(raw.fee??'');setDate(new Date(raw.at).toISOString().slice(0,10));document.getElementById('cost-add-title')?.scrollIntoView({behavior:'smooth'});}}>اصلاح</Button>}</li>)}</ul></details></Surface></Section>}
 </Page>;
}

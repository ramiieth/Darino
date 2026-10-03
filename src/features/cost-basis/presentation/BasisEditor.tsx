import { useState } from 'react';
import Decimal from 'decimal.js';
import { Sheet } from '@/shared/components/ui/Sheet';
import { Field, Input } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { TokenLogo } from '@/shared/components/ui/EntityLogo';
import { Metric, MetricGrid, MoneyValue, QuantityValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { AssetValue } from '@/features/connected/presentation/AssetValue';
import { chainIdentity, tokenName } from '@/features/connected/presentation/identity';
import { getPref, savePref } from '@/features/custody/data/repository';
import { COST_PREF, type CostBook } from '../domain/book';
import { reconcileBasis } from '../domain/currentBasis';
import { costSummary } from '../domain/summary';
import { normalizeDecimalInput, purchaseDecimal } from './decimalInput';
export function BasisEditor({ row, onClose }: { row: ReturnType<typeof costSummary>['rows'][number]; onClose: () => void }) {
 const [total,setTotal] = useState(row.current?.quantity === row.quantity.toString() ? row.current.total : row.status === 'ready' && row.basis !== null ? String(row.basis) : '');
 const [busy,setBusy] = useState(false), [error,setError] = useState<string|null>(null);
 const parsed = purchaseDecimal(total,true);
 const average = parsed !== null ? new Decimal(parsed).div(row.quantity).toNumber() : null;
 async function save() {
  setError(null); if(parsed===null){setError('بهای تمام‌شده باید صفر یا عدد مثبت باشد');return;}
  if(row.stale||row.sources.some(w=>!w.state?.data?.complete)){setError('ابتدا موجودی کیف پول را به‌روز کنید');return;}
  setBusy(true);try{await savePref(COST_PREF,reconcileBasis(getPref<CostBook>(COST_PREF)?.value,row.asset,row.quantity.toString(),parsed,Date.now()));onClose();}catch{setError('ذخیرهٔ بهای خرید انجام نشد؛ دوباره تلاش کنید');}finally{setBusy(false);}
 }
 return <Sheet open onClose={()=>{if(!busy)onClose();}} title="بهای تمام‌شده" variant="panel"><form className="space-y-5" onSubmit={e=>{e.preventDefault();void save();}}>
  <div className="flex items-center gap-3"><TokenLogo logo={row.asset.icon} symbol={row.asset.symbol} name={tokenName(row.asset.symbol)} size={36} networkLogo={row.chains.size===1?chainIdentity(row.asset.chain).logo:undefined} networkName={row.chains.size===1?chainIdentity(row.asset.chain).name:undefined}/><div><h3 className="font-bold">{tokenName(row.asset.symbol,row.asset.name)}</h3><p className="text-xs text-muted">{[...row.chains].map(c=>chainIdentity(c).name).join(' · ')}</p></div></div>
  <MetricGrid cols={2}><Metric label="موجودی فعلی" value={<QuantityValue value={row.quantity.toNumber()} unit={tokenName(row.asset.symbol)}/>} size="sm"/><Metric label="قیمت روز" value={<MoneyValue value={row.price}/>} size="sm"/><Metric label="ارزش روز" value={<AssetValue value={row.priced?row.value.toNumber():null}/>} size="sm"/><Metric label="میانگین خرید خودکار" value={<MoneyValue value={average}/>} size="sm"/></MetricGrid>
  <Field label="بهای تمام‌شده · دلار"><Input dir="ltr" inputMode="decimal" value={total} autoFocus onChange={e=>setTotal(normalizeDecimalInput(e.target.value))}/></Field>
  <p className="text-xs leading-6 text-muted">هزینهٔ همین موجودی باقی‌مانده، شامل کارمزد خرید؛ خریدهای فروخته‌شده را حساب نکنید.</p>
  {error&&<Notice tone="warn">{error}</Notice>}
  <Button type="submit" className="w-full" loading={busy} disabled={parsed===null||row.stale}>تأیید بهای تمام‌شده</Button>
  <details className="border-t border-divider pt-3 text-xs"><summary className="min-h-11 cursor-pointer text-muted">سوابق محفوظ</summary>{getPref<CostBook>(COST_PREF)?.value?.lots.filter(l=>l.asset.key===row.asset.key).map(l=><div key={l.id} className="flex flex-wrap justify-between gap-2 py-2"><span>{new Date(l.at).toLocaleDateString('fa-IR')}</span><QuantityValue value={Number(l.quantity)}/><MoneyValue value={Number(l.unitCost)}/></div>)}{[...(getPref<CostBook>(COST_PREF)?.value?.basisHistory??[]),...(row.current?[row.current]:[])].filter(b=>b.asset.key===row.asset.key).map((b,i)=><div key={i} className="flex flex-wrap justify-between gap-2 py-2"><span>{new Date(b.at).toLocaleDateString('fa-IR')} · تطبیق موجودی</span><QuantityValue value={Number(b.quantity)}/><MoneyValue value={Number(b.total)}/></div>)}<p className="mt-2 text-muted">ثبت هزینهٔ موجودی فعلی، تاریخچهٔ خریدهای قدیمی را تغییر نمی‌دهد.</p></details>
 </form></Sheet>;
}

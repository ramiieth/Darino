import Decimal from 'decimal.js';
import { useState } from 'react';
import { BasisEditor } from './BasisEditor';
import { Button } from '@/shared/components/ui/Button';
import { useCustodyStore, getPref } from '@/features/custody/data/repository';
import type { ConnectedPortfolio } from '@/features/connected/data/useConnectedPortfolio';
import type { ActivityLink } from '@/features/connected/domain/activity';
import { AssetValue } from '@/features/connected/presentation/AssetValue';
import { chainIdentity, tokenName } from '@/features/connected/presentation/identity';
import { Surface } from '@/shared/components/ui/GlassCard';
import { TokenLogo } from '@/shared/components/ui/EntityLogo';
import { MoneyValue, PercentValue, QuantityValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { Badge } from '@/shared/components/ui/Badge';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { COST_STATUS } from '../domain/summary';
import { allSourceCostSummary } from '../domain/allSources';
import { useCostSources } from '../data';
import { PlatformPositions } from './PlatformPositions';
import { COST_PREF, type CostBook } from '../domain/book';
function CostQuantity({value,unit}:{value:Decimal;unit?:string}) {
 const small=value.gt(0)&&value.lt('.01');
 return <span title={value.toString()}>{small&&<span className="text-xs text-muted">کمتر از </span>}<QuantityValue digits={2} value={small ? 0.01 : value.toDecimalPlaces(2,Decimal.ROUND_DOWN).toNumber()} unit={unit}/></span>;
}
export function CostSummaryPanel({ portfolio, links }: { portfolio: ConnectedPortfolio; links: ActivityLink[] }) {
 useCustodyStore();
 const [selected,setSelected]=useState<string|null>(null);
 const book=getPref<CostBook>(COST_PREF)?.value;
 const {boros,extraWallets}=useCostSources(portfolio);
 const { rows,result,walletCovered } = allSourceCostSummary(portfolio,book,links,boros,extraWallets);
 const identity = (row: typeof rows[number]) => <div className="flex min-w-0 items-center gap-3"><TokenLogo logo={row.asset.icon} symbol={row.asset.symbol} name={tokenName(row.asset.symbol, row.asset.name)} size={34} networkLogo={row.chains.size === 1 ? chainIdentity(row.asset.chain).logo : undefined} networkName={row.chains.size === 1 ? chainIdentity(row.asset.chain).name : undefined} /><div className="min-w-0"><span className="block text-sm font-semibold">{tokenName(row.asset.symbol, row.asset.name)}</span><span className="mt-1 block text-[11px] text-muted">{row.sourceLabel} · {[...row.chains].map(c => chainIdentity(c).name).join(' · ')}</span></div></div>;
 const state = (row: typeof rows[number]) => row.status === 'confirmation' ? <div className="space-y-1"><Badge tone="neutral">بهای ذخیره‌شده</Badge><button type="button" className="block min-h-11 text-xs text-brand-500" onClick={()=>setSelected(row.asset.key)}>{row.stale?'بررسی هزینه و موجودی':'تأیید همین هزینه'}</button></div> : row.status !== 'ready' ? <span title={row.issues[0]?.reason}><Badge tone="warn">{COST_STATUS[row.status as keyof typeof COST_STATUS]}</Badge></span> : null;
 const gain = (row: typeof rows[number]) => {
  const value=row.pnl??row.estimatedPnl;
  const reason=row.status==='confirmation'?'تأیید بهای خرید':row.status==='missing'?'ثبت بهای خرید':row.status==='mismatch'?'تطبیق موجودی':!row.priced?'در انتظار قیمت':row.stale?'در انتظار به‌روزرسانی':'بررسی بهای خرید';
  if(value===null)return <button type="button" className="cost-unavailable min-h-11 text-brand-500" onClick={()=>setSelected(row.asset.key)}>{reason}</button>;
  const estimate=row.pnl===null;
  const times=row.provider==='wallet'?row.holdingSources.map(w=>w.state?.data?.fetchedAt).filter((t):t is number=>!!t):row.provider==='boros'?[boros.data?.fetchedAt??0]:[];
  const at=times.length?Math.min(...times):0;
  return <div className="flex flex-col gap-1" title={estimate&&at?`برآورد بر پایهٔ آخرین دریافت: ${new Date(at).toLocaleString('fa-IR')}`:undefined}><MoneyValue digits={2} value={value} signed tone="auto" state={row.stale?'stale':'ready'}/><PercentValue value={row.basis!==null&&row.basis>0?value/row.basis*100:null} className="text-xs"/>{estimate&&<span className="text-[10px] text-muted">{row.stale?'برآورد ذخیره‌شده':'برآورد موجودی فعلی'}</span>}{row.valuation.unknown !== '0' && <span className="text-[10px] text-muted">فقط بخش دارای بهای خرید</span>}</div>;
 };
 return <Surface as="section" aria-labelledby="dashboard-cost-title" className="cost-summary min-w-0 p-4 md:p-5">
  <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id="dashboard-cost-title" className="text-base font-bold">بهای خرید و سود و زیان</h2><span className="text-xs text-muted">کیف پول · آرکوس · بوروس</span></div>
  {boros.error&&<Notice tone="warn">بوروس: {boros.error}</Notice>}
  {boros.loading&&!boros.data&&<p className="text-xs text-muted mb-3">در حال دریافت موجودی بوروس…</p>}
  {!rows.length ? <p className="text-sm text-muted">دارایی قابل محاسبه‌ای موجود نیست.</p> : <>
   <div className="hidden xl:block"><table className="data-table cost-table w-full"><caption className="sr-only">بهای خرید موجودی باقی‌مانده و سود و زیان باز رمزارزها</caption><colgroup>{[20,10,10,10,11,15,10,6,8].map((width,i)=><col key={i} style={{width:width+'%'}}/>)}</colgroup><thead><tr>{['دارایی', 'موجودی', 'قیمت فعلی', 'میانگین خرید', 'بهای تمام‌شده', 'ارزش روز', 'سود/زیان', 'سهم', 'ویرایش'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.asset.key}><td><button type="button" className="min-h-11 text-start" onClick={()=>setSelected(row.asset.key)} aria-label={`بهای خرید ${tokenName(row.asset.symbol)}`}>{identity(row)}</button><div className="mt-2">{state(row)}</div></td><td><CostQuantity value={row.quantity} /></td><td><MoneyValue digits={2} value={row.price} />{row.provider==='arcus'&&<span className="block text-[10px] text-muted">واحد حساب</span>}</td><td><MoneyValue digits={2} value={row.avgCost} /></td><td><MoneyValue digits={2} value={row.basis} />{row.valuation.unknown !== '0' && row.basis !== null && <span className="block text-[10px] text-muted">بخش مشخص</span>}</td><td><AssetValue moneyDigits={2} stale={row.stale} value={row.priced ? row.value.toNumber() : null} primaryClassName="text-sm" /></td><td>{gain(row)}</td><td>{row.share===null ? <span className="cost-unavailable" title="سهم تا دریافت مجموع کامل و قابل تطبیق محاسبه نمی‌شود">—</span> : <PercentValue value={row.share} signed={false} tone="none" />}</td><td><Button size="sm" variant="ghost" onClick={()=>setSelected(row.asset.key)} aria-label={`ویرایش بهای خرید ${tokenName(row.asset.symbol)} · ${row.sourceLabel}`}>ویرایش</Button></td></tr>)}</tbody></table></div>
   <div className="divide-y divide-divider xl:hidden">{rows.map(row => <article key={row.asset.key} className="space-y-4 py-4 first:pt-0 last:pb-0"><div className="flex items-start justify-between gap-3"><button type="button" className="min-h-11 text-start" onClick={()=>setSelected(row.asset.key)} aria-label={`بهای خرید ${tokenName(row.asset.symbol)}`}>{identity(row)}</button><div className="max-w-[45%] text-end text-xs"><CostQuantity value={row.quantity} unit={tokenName(row.asset.symbol)} /></div></div><div className="grid grid-cols-2 gap-4"><div><p className="mb-1 text-[11px] text-muted">ارزش روز</p><AssetValue moneyDigits={2} stale={row.stale} value={row.priced ? row.value.toNumber() : null} primaryClassName="text-base font-bold" /></div><div className="text-end"><p className="mb-1 text-[11px] text-muted">سود و زیان باز</p>{gain(row)}</div></div>{state(row)}<Disclosure summary="بهای خرید و جزئیات"><dl className="grid grid-cols-2 gap-x-4 gap-y-4 py-2 text-sm">{[{ label: row.provider==='arcus'?'واحد حساب':'قیمت فعلی', value: <MoneyValue digits={2} value={row.price} /> }, { label: 'میانگین خرید', value: <MoneyValue digits={2} value={row.avgCost} /> }, { label: row.valuation.unknown !== '0' ? 'بهای بخش مشخص' : 'بهای تمام‌شده', value: <MoneyValue digits={2} value={row.basis} /> }, { label: 'سهم پرتفولیو', value: row.share===null ? <span className="cost-unavailable" title="سهم تا دریافت مجموع کامل و قابل تطبیق محاسبه نمی‌شود">—</span> : <PercentValue value={row.share} signed={false} tone="none" /> }].map(item => <div key={item.label} className="min-w-0"><dt className="mb-1 text-[11px] text-muted">{item.label}</dt><dd className="break-words">{item.value}</dd></div>)}</dl>{row.valuation.unknown !== '0'&&<p className="text-xs text-muted">مقدار بدون بهای خرید: <CostQuantity value={new Decimal(row.valuation.unknown)} unit={tokenName(row.asset.symbol)}/></p>}{row.issues.length>0&&<p className="mt-2 text-xs text-warn">{row.issues[0].reason}</p>}</Disclosure><Button size="sm" variant="outline" onClick={()=>setSelected(row.asset.key)} aria-label={`ویرایش بهای خرید ${tokenName(row.asset.symbol)} · ${row.sourceLabel}`}>ویرایش بهای خرید</Button></article>)}</div>
  </>}
 <PlatformPositions portfolio={portfolio} boros={boros}/>
 {book&&<Disclosure summary="سود فروش‌ها و سوابق"><MoneyValue digits={2} value={!Object.keys(book.currentBasis??{}).length&&portfolio.wallets.length>0&&portfolio.wallets.every(walletCovered)&&!portfolio.stale&&!result?.issues.length?Number(result?.realized):null} signed tone="auto"/><p className="mt-2 text-xs text-muted">فقط فروش‌های دارای تاریخچه و بهای خرید مشخص؛ تطبیق موجودی امروز، سود فروش‌های گذشته را بازسازی نمی‌کند.</p></Disclosure>}
 {selected&&rows.find(r=>r.asset.key===selected)&&<BasisEditor key={selected} row={rows.find(r=>r.asset.key===selected)!} onClose={()=>setSelected(null)}/>}
 </Surface>;
}

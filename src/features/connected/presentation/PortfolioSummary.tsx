import { NetworkPicker } from './NetworkPicker';
import { AssetValue } from './AssetValue';
import { WalletBalanceChart } from './WalletBalanceChart';
import { useState } from 'react';
import Decimal from 'decimal.js';
import { Link,useSearchParams } from 'react-router-dom';
import { TransferReview } from './TransferReview';
import { refreshTransactions } from '../data/store';
import { RefreshCw,Wallet,Sparkles,ArrowLeft,Layers } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { Badge } from '@/shared/components/ui/Badge';
import { Notice } from '@/shared/components/ui/StateViews';
import { Button,buttonClass } from '@/shared/components/ui/Button';
import { PositionsList } from './PositionsList';
import { ActivityExplorer } from './ActivityExplorer';
import { ActivityList } from './ActivityList';
import { ProtocolBadge } from './ProtocolBadge';
import { visiblePositions,visibleTransaction } from '../domain/visibility';
import { useActivity } from '../data/useActivity';
import type { ConnectedPortfolio } from '../data/useConnectedPortfolio';
import type { LivePosition } from '../domain/model';
export function PortfolioSummary({portfolio:p}:{portfolio:ConnectedPortfolio}) {
 const [params,setParams]=useSearchParams();const tab=params.get('view')==='activity'?'activity':'assets';const setTab=(value:'assets'|'activity')=>setParams(previous=>{const next=new URLSearchParams(previous);if(value==='activity')next.set('view','activity');else next.delete('view');return next;},{replace:true,preventScrollReset:true});const [network,setNetwork]=useState('all'),[group,setGroup]=useState<'token'|'platform'>('token');const activity=useActivity(p);
 const chains=[...new Map(p.wallets.flatMap(w=>w.state?.data?.chains??[]).map(c=>[c.id,c])).values()];
 const grouped=new Map<string,LivePosition>();
 for(const w of p.wallets)for(const position of visiblePositions(w.state?.data?.positions??[])) {
  const id=position.type==='wallet'?`${position.chain}:${position.contract??position.tokenId}`:`${w.holding.id}:${position.id}`;const old=grouped.get(id);
  grouped.set(id,old?{...old,quantity:new Decimal(old.quantity??0).plus(position.quantity??0).toString(),value:old.value===null||position.value===null?null:new Decimal(old.value).plus(position.value).toNumber()}:{...position,id});
 }
 const positions=[...grouped.values()],networks=[...new Set(positions.map(x=>x.chain))];
 const snapshot={address:'',fetchedAt:Date.now(),total:p.total,change:null,positions:positions.filter(x=>network==='all'||x.chain===network),chains,complete:p.wallets.every(w=>w.state?.data?.complete),unpriced:0};
 const walletValue=p.wallets.some(w=>w.value!==null)?p.wallets.reduce((s,w)=>s.plus(w.value??0),new Decimal(0)).toNumber():null;
 const realArcus=p.arcus.filter(s=>s.holding.arcus!.env==='mainnet');const arcusValue=realArcus.some(s=>s.value!==null)?realArcus.reduce((s,a)=>s.plus(a.value??0),new Decimal(0)).toNumber():null;
 const filteredActivity=activity.rows.filter(r=>(network==='all'||r.tx?.chain===network)&&(!r.tx||visibleTransaction(r.tx)));
 const walletError=p.wallets.map(w=>w.state?.error).find(Boolean);
 const activityError=p.wallets.map(w=>w.state?.historyError).find(Boolean);
 const activityBusy=p.wallets.some(w=>!w.state?.historyLoaded&&!w.state?.historyError);
 const platformGroups=new Map<string,LivePosition[]>();
 for(const position of snapshot.positions){const id=position.type==='wallet'?'wallet':position.protocol??position.type;platformGroups.set(id,[...(platformGroups.get(id)??[]),position]);}
 return <><Surface variant="focal" className="native-portfolio-hero overflow-hidden p-5 md:p-7">
 <div className="flex flex-wrap items-start justify-between gap-4">
 <div className="flex min-w-0 max-w-full items-center gap-3 md:gap-5"><span className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent sm:flex"><Layers className="h-8 w-8" aria-hidden/></span><div className="min-w-0"><p className="text-sm text-muted">ارزش دارایی‌های متصل</p><AssetValue value={p.total} stale={p.stale} inline className="mt-2" primaryClassName="text-3xl font-bold md:text-5xl"/><div className="mt-2 flex flex-wrap gap-2">{p.partial&&<Badge tone="warn">مجموع ناقص</Badge>}{p.stale&&<Badge tone="warn">دادهٔ قدیمی</Badge>}</div></div></div>
 <Button variant="ghost" size="sm" aria-label="به‌روزرسانی پرتفولیو" icon={<RefreshCw/>} loading={p.loading} onClick={()=>void p.refresh()}>به‌روزرسانی</Button>
 </div>
 <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-divider pt-4"><div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted"><span className="inline-flex flex-wrap items-baseline gap-2">کیف پول‌ها<MoneyValue value={walletValue}/></span>{realArcus.length>0&&<span className="inline-flex flex-wrap items-baseline gap-2">پرپچوال آرکوس<MoneyValue value={arcusValue}/></span>}</div><nav aria-label="دسترسی‌های پرتفولیو" className="flex flex-wrap gap-2"><Link to="/wallets" className={buttonClass('outline','sm')}><Wallet/>مدیریت کیف پول‌ها</Link><Link to="/assistant" className={buttonClass('outline','sm')}><Sparkles/>دستیار</Link><Link to="/accounting" className={buttonClass('ghost','sm')}>خرید و سود و زیان</Link></nav></div>
 </Surface>
 {walletError&&<p role="status" className="text-xs leading-6 text-warn">{walletError}</p>}
 {p.partial&&<Notice tone="warn">برخی منابع یا جزئیات دریافت نشده‌اند.</Notice>}{!p.wallets.length&&!p.arcus.length&&<Notice>یک کیف پول یا حساب آرکوس اضافه کنید.</Notice>}
 <section aria-label="پرتفولیو" id="portfolio-assets" className="min-w-0 space-y-5">
 <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-divider pb-3"><div role="tablist" aria-label="نمای پرتفولیو" className="flex gap-5">{([['assets','دارایی‌ها'],['activity','تراکنش‌ها']] as const).map(([id,label])=><button key={id} type="button" role="tab" id={`portfolio-tab-${id}`} aria-selected={tab===id} aria-controls={`portfolio-panel-${id}`} tabIndex={tab===id?0:-1} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'assets':e.key==='End'?'activity':tab==='assets'?'activity':'assets';setTab(next);document.getElementById('portfolio-tab-'+next)?.focus();}}} onClick={()=>setTab(id)} className={`min-h-11 border-b-2 px-1 py-3 text-sm font-semibold ${tab===id?'border-accent text-accent':'border-transparent text-muted'}`}>{label}</button>)}</div><div className="w-full sm:w-56"><NetworkPicker value={network} onChange={setNetwork} chains={chains} ids={networks}/></div></div>
 <div role="tabpanel" id={`portfolio-panel-${tab}`} aria-labelledby={`portfolio-tab-${tab}`}>
 {tab==='assets'?<div className="portfolio-dashboard-grid grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
 <Surface className="min-w-0 p-4 md:p-5"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-base font-bold"><span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent"><Wallet className="h-5 w-5" aria-hidden/></span>دارایی‌های کیف پول</h2><div className="flex rounded-full bg-surface-2 p-1" role="group" aria-label="گروه‌بندی دارایی‌ها">{([['token','بر اساس توکن'],['platform','بر اساس پلتفرم']] as const).map(([id,label])=><button key={id} type="button" aria-pressed={group===id} onClick={()=>setGroup(id)} className={`min-h-10 rounded-full px-3 text-[11px] font-semibold transition-colors ${group===id?'bg-card text-ink shadow-sm':'text-muted'}`}>{label}</button>)}</div></div>
 <WalletBalanceChart portfolio={p} network={network}/>
 {group==='token'?<PositionsList data={snapshot} groupByToken/>:platformGroups.size?[...platformGroups].map(([id,rows])=><section key={id} className="mb-5 last:mb-0"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider pb-3"><h3 className="text-sm font-semibold">{id==='wallet'?'کیف پول':rows[0].protocol?<ProtocolBadge name={rows[0].protocol} logo={rows[0].protocolIcon} size={22}/>:'پوزیشن‌های شبکه‌ای'}</h3><AssetValue value={rows.some(r=>r.value===null)?null:rows.reduce((sum,r)=>sum.plus(r.value??0),new Decimal(0)).toNumber()} className="text-end" primaryClassName="text-xs"/></div><PositionsList data={{...snapshot,positions:rows}} groupByToken/></section>):<PositionsList data={snapshot}/>}
 <details className="mt-4 border-t border-divider pt-3 text-xs text-muted"><summary className="cursor-pointer">مبنای نمایش</summary><p className="mt-2 leading-6">مجموع دارایی‌های قابل نمایش و ارزش حساب اصلی آرکوس؛ اسپم و موجودی زیر ۲ دلار پنهان است. اتریوم رابین‌هود برای کارمزد حفظ می‌شود.</p></details></Surface>
 <Surface as="aside" aria-labelledby="portfolio-recent-title" className="portfolio-recent min-w-0 p-4 md:p-5"><h2 id="portfolio-recent-title" className="mb-3 text-base font-bold">فعالیت‌های اخیر</h2>{filteredActivity.length?<ActivityList preview rows={filteredActivity.slice(0,5)} links={activity.links} addresses={p.wallets.map(w=>w.holding.address!)} chains={chains}/>:<p className="py-6 text-xs leading-6 text-muted">{activityError??(activityBusy?'در حال دریافت تراکنش‌ها…':'تراکنش قابل نمایش یافت نشد.')}</p>}<button type="button" onClick={()=>setTab('activity')} className="mt-4 flex min-h-11 w-full items-center justify-between rounded-xl bg-surface-2 px-3 text-xs font-semibold text-ink">نمایش همهٔ تراکنش‌ها<ArrowLeft className="h-4 w-4" aria-hidden/></button></Surface>
 </div>:<><ActivityExplorer rows={filteredActivity} links={activity.links} addresses={p.wallets.map(w=>w.holding.address!)} chains={chains}/>{p.wallets.map(w=><div key={w.holding.id} className="mt-3 space-y-2">{w.state?.historyError&&<Notice tone="warn">{w.state.historyError}</Notice>}{w.state?.next&&<Button size="sm" variant="outline" loading={w.state.historyLoading} onClick={()=>void refreshTransactions(w.holding.address!,true)}>تراکنش‌های قدیمی‌تر · {w.holding.label}</Button>}</div>)}{p.arcus.map(a=>(a.state?.history.transfers.error||a.state?.history.transfers.data?.complete===false)&&<Notice key={a.holding.id} tone="warn">تاریخچهٔ {a.holding.label} کامل دریافت نشده است.</Notice>)}<div className="mt-5"><TransferReview activity={activity} chains={chains}/></div></>}
 </div></section>
 </>;
}

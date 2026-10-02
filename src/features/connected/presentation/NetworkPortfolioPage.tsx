import { visiblePositions,visibleTransaction } from '../domain/visibility';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers,RefreshCw,Link2 } from 'lucide-react';
import { Page,PageHeader } from '@/shared/components/layout/Page';
import { Section,Surface } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Field,Select } from '@/shared/components/ui/Input';
import { LogoImage } from '@/shared/components/ui/EntityLogo';
import { Notice } from '@/shared/components/ui/StateViews';
import { useCustodySync } from '@/features/custody/data/sync';
import { savePref } from '@/features/custody/data/repository';
import { useConnectedPortfolio } from '../data/useConnectedPortfolio';
import { useActivity,ACTIVITY_LINKS } from '../data/useActivity';
import { refreshTransactions } from '../data/store';
import { validateLink,type ActivityLink } from '../domain/activity';
import { PositionsList } from './PositionsList';
import { ActivityList } from './ActivityList';
import { chainIdentity } from './identity';
import { dateTime,providerError } from './ConnectedPage';
export default function NetworkPortfolioPage(){
 useCustodySync();const p=useConnectedPortfolio(),activity=useActivity(p);
 const [network,setNetwork]=useState('all'),[kind,setKind]=useState<ActivityLink['kind']>('bridge'),[from,setFrom]=useState(''),[to,setTo]=useState(''),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
 const chains=[...new Map(p.wallets.flatMap(w=>w.state?.data?.chains??[]).map(c=>[c.id,c])).values()];
 const shownActivity=activity.rows.filter(r=>!r.tx||visibleTransaction(r.tx));
 const available=[...new Set(p.wallets.flatMap(w=>visiblePositions(w.state?.data?.positions??[]).map(x=>x.chain)??[]))];
 async function link(){setBusy(true);setError(null);try{const problem=validateLink(activity.rows.find(r=>r.key===from),activity.rows.find(r=>r.key===to),kind);if(problem)throw Error(problem);if(activity.links.some(l=>[l.from,l.to].includes(from)||[l.from,l.to].includes(to)))throw Error('این رویداد قبلاً به یک انتقال مرتبط شده است');await savePref(ACTIVITY_LINKS,[...activity.links.filter(l=>!l.proof),{id:crypto.randomUUID(),from,to,kind,at:Date.now()}]);setFrom('');setTo('');}catch(e){setError(providerError(e));}finally{setBusy(false);}}
 return <Page><PageHeader title="دارایی‌ها و فعالیت شبکه‌ای" subtitle="کیف پول‌ها، سواپ، بریج و انتقال" eyebrow={<Layers className="h-5 w-5 text-accent"/>} actions={<Button variant="outline" icon={<RefreshCw/>} onClick={()=>void p.refresh()}>به‌روزرسانی</Button>}/>
 {!p.wallets.length&&<Notice>یک آدرس عمومی متصل کنید. <Link className="text-accent" to="/wallets">افزودن کیف پول</Link></Notice>}
 <div className="flex flex-wrap gap-2"><Button size="sm" variant={network==='all'?'primary':'outline'} onClick={()=>setNetwork('all')}>همهٔ شبکه‌ها</Button>{available.map(id=>{const n=chainIdentity(id,chains);return <Button key={id} size="sm" variant={network===id?'primary':'outline'} onClick={()=>setNetwork(id)}><LogoImage src={n.logo} label={n.name} size={20} square/>{n.name}</Button>;})}</div>
 {p.wallets.map(w=>w.state?.data&&<Section key={w.holding.id} title={w.holding.label} id={`network-${w.holding.id}`}><Surface className="p-4">{w.stale&&<Notice tone="warn">آخرین دادهٔ موفق نمایش داده می‌شود.</Notice>}<PositionsList data={{...w.state.data,positions:w.state.data.positions.filter(x=>network==='all'||x.chain===network)}}/></Surface></Section>)}
 <Section title="فعالیت واقعی" id="network-activity"><ActivityList rows={shownActivity.filter(r=>network==='all'||r.tx?.chain===network)} links={activity.links} addresses={p.wallets.map(w=>w.holding.address!)} chains={chains}/>{p.arcus.map(a=><div key={a.holding.id}>{a.state?.history.transfers.error&&<Notice tone="warn">تاریخچهٔ واریز/برداشت {a.holding.label} دریافت نشد.</Notice>}{a.state?.history.transfers.data&&!a.state.history.transfers.data.complete&&<Notice tone="warn">تاریخچهٔ {a.holding.label} کامل نیست.</Notice>}</div>)}{!shownActivity.length&&<p className="text-sm text-muted">در انتظار دریافت فعالیت‌ها…</p>}{p.wallets.map(w=><div key={w.holding.id} className="space-y-2">{w.state?.historyError&&<Notice tone="warn">{w.state.historyError}</Notice>}{w.state?.next&&<Button size="sm" variant="outline" loading={w.state.historyLoading} onClick={()=>void refreshTransactions(w.holding.address!,true)}>فعالیت‌های قدیمی‌تر · {w.holding.label}</Button>}</div>)}</Section>
 <Surface className="p-4"><details><summary className="cursor-pointer text-sm font-semibold text-accent">تطبیق انتقال‌های نیازمند بررسی</summary><div className="mt-4 space-y-4"><p className="text-xs leading-6 text-muted">دو سمت بریج، یا برداشت/واریز آرکوس و کیف پول را مرتبط کنید. این تأیید موجودی را تغییر نمی‌دهد.</p>{error&&<Notice tone="warn">{error}</Notice>}<div className="grid gap-4 sm:grid-cols-3"><Field label="نوع ارتباط"><Select value={kind} onChange={e=>setKind(e.target.value as ActivityLink['kind'])}><option value="bridge">بریج کیف پول</option><option value="bridge_swap">بریج همراه تبدیل دارایی</option><option value="arcus_withdrawal">برداشت آرکوس به کیف پول</option><option value="arcus_deposit">واریز کیف پول به آرکوس</option></Select></Field>{([['from','رویداد مبدأ'],['to','رویداد مقصد']] as const).map(([side,label])=><Field key={side} label={label}><Select value={side==='from'?from:to} onChange={e=>side==='from'?setFrom(e.target.value):setTo(e.target.value)}><option value="">انتخاب رویداد</option>{shownActivity.filter(r=>['confirmed','APPLIED'].includes(r.status)).map(r=><option key={r.key} value={r.key}>{r.label} · {r.tx?chainIdentity(r.tx.chain,chains).name:r.kind==='WITHDRAWAL'?'برداشت آرکوس':'واریز آرکوس'} · {dateTime(r.at)} · {(r.tx?.hash??r.key).slice(-8)}</option>)}</Select></Field>)}</div><Button loading={busy} disabled={!from||!to} icon={<Link2/>} onClick={()=>void link()}>تأیید ارتباط</Button>{activity.links.filter(l=>!l.proof).map(l=><div key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted"><span>{l.kind==='bridge'||l.kind==='bridge_swap'?'بریج':l.kind==='arcus_withdrawal'?'برداشت آرکوس':'واریز آرکوس'} · {dateTime(l.at)}</span><Button size="sm" variant="ghost" onClick={()=>void savePref(ACTIVITY_LINKS,activity.links.filter(x=>x.id!==l.id)).catch(e=>setError(providerError(e)))}>حذف ارتباط</Button></div>)}</div></details></Surface>
 </Page>;
}

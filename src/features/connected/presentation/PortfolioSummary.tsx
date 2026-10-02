import { AssetValue } from './AssetValue';
import { WalletBalanceChart } from './WalletBalanceChart';
import { useState } from 'react';
import Decimal from 'decimal.js';
import { Link } from 'react-router-dom';
import { RefreshCw,Wallet,Sparkles,ArrowLeft } from 'lucide-react';
import { Section,Surface } from '@/shared/components/ui/GlassCard';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { LogoImage } from '@/shared/components/ui/EntityLogo';
import { Badge } from '@/shared/components/ui/Badge';
import { Notice } from '@/shared/components/ui/StateViews';
import { Button,buttonClass } from '@/shared/components/ui/Button';
import { PositionsList } from './PositionsList';
import { ActivityExplorer } from './ActivityExplorer';
import { chainIdentity } from './identity';
import { visiblePositions,visibleTransaction } from '../domain/visibility';
import { useActivity } from '../data/useActivity';
import type { ConnectedPortfolio } from '../data/useConnectedPortfolio';
import type { LivePosition } from '../domain/model';
export function PortfolioSummary({portfolio:p}:{portfolio:ConnectedPortfolio}) {
 const [network,setNetwork]=useState('all'),[tab,setTab]=useState<'assets'|'activity'>('assets');const activity=useActivity(p);
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
 return <><Surface variant="focal" className="native-portfolio-hero overflow-hidden p-4 md:p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm text-muted">ارزش دارایی‌های متصل</p><AssetValue value={p.total} stale={p.stale} inline className="mt-2" primaryClassName="text-3xl font-bold md:text-4xl"/></div><Button variant="ghost" size="sm" aria-label="به‌روزرسانی پرتفولیو" icon={<RefreshCw/>} onClick={()=>void p.refresh()}>به‌روزرسانی</Button></div><div className="mt-3 flex flex-wrap gap-2">{p.partial&&<Badge tone="warn">مجموع ناقص</Badge>}{p.stale&&<Badge tone="warn">دادهٔ قدیمی</Badge>}</div><div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-divider pt-3"><div className="flex items-center gap-2"><p className="text-xs text-muted">کیف پول‌ها</p><MoneyValue value={walletValue}/></div><div className="flex items-center gap-2"><p className="text-xs text-muted">پرپچوال آرکوس</p><MoneyValue value={arcusValue}/></div></div><div className="mt-3 flex flex-wrap gap-2"><Link to="/wallets" className={buttonClass('primary','sm')}><Wallet/>کیف پول‌ها</Link><Link to="/assistant" className={buttonClass('outline','sm')}><Sparkles/>دستیار</Link><Link to="/accounting" className={buttonClass('outline','sm')}>خرید و سود و زیان</Link></div><details className="mt-2 text-xs text-muted"><summary className="cursor-pointer">مبنای نمایش</summary><p className="mt-2 leading-6">مجموع دارایی‌های قابل نمایش و ارزش حساب اصلی آرکوس؛ اسپم و موجودی زیر ۲ دلار پنهان است. اتریوم رابین‌هود برای کارمزد حفظ می‌شود.</p></details></Surface>
 {p.partial&&<Notice tone="warn">برخی منابع یا جزئیات دریافت نشده‌اند.</Notice>}{!p.wallets.length&&!p.arcus.length&&<Notice>یک کیف پول یا حساب آرکوس اضافه کنید.</Notice>}
 <Section title="پرتفولیو" id="portfolio-assets"><div role="tablist" aria-label="نمای پرتفولیو" className="mb-4 flex gap-5 border-b border-divider">{([['assets','دارایی‌ها'],['activity','تراکنش‌ها']] as const).map(([id,label])=><button key={id} type="button" role="tab" id={`portfolio-tab-${id}`} aria-selected={tab===id} aria-controls={`portfolio-panel-${id}`} tabIndex={tab===id?0:-1} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'assets':e.key==='End'?'activity':tab==='assets'?'activity':'assets';setTab(next);document.getElementById('portfolio-tab-'+next)?.focus();}}} onClick={()=>setTab(id)} className={`border-b-2 px-1 py-3 text-sm font-semibold ${tab===id?'border-accent text-accent':'border-transparent text-muted'}`}>{label}</button>)}</div>
 <div role="tabpanel" id={`portfolio-panel-${tab}`} aria-labelledby={`portfolio-tab-${tab}`}>
 {tab==='assets'?<><div className="mb-3 flex flex-wrap gap-2"><Button size="sm" variant={network==='all'?'primary':'outline'} onClick={()=>setNetwork('all')}>همهٔ شبکه‌ها</Button>{networks.map(id=>{const n=chainIdentity(id,chains);return <Button key={id} size="sm" variant={network===id?'primary':'outline'} onClick={()=>setNetwork(id)}><LogoImage src={n.logo} label={n.name} size={18}/>{n.name}</Button>;})}</div><Surface className="p-4"><WalletBalanceChart portfolio={p} network={network}/><PositionsList data={snapshot} groupByToken/></Surface></>:<><ActivityExplorer compact rows={activity.rows.filter(r=>network==='all'||r.tx?.chain===network)} links={activity.links} addresses={p.wallets.map(w=>w.holding.address!)} chains={chains}/><Link to="/holdings" className="mt-4 inline-flex items-center gap-2 text-sm text-accent">همهٔ تراکنش‌ها<ArrowLeft className="h-4 w-4"/></Link></>}
 </div></Section>
 <Section title="حساب‌ها" id="portfolio-sources"><div className="grid gap-3 md:grid-cols-2">{p.wallets.map(s=><Link key={s.holding.id} to="/wallets" className="native-wallet-card flex items-center gap-3 rounded-card border border-divider bg-card p-4"><LogoImage src="/logos/platform-zerion.png" label="زریون" size={32} square/><span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.holding.label}</span><AssetValue value={s.value} stale={s.stale} className="text-end" primaryClassName="text-sm"/></Link>)}{p.arcus.map(s=><Link key={s.holding.id} to="/arcus" className="native-wallet-card flex flex-wrap items-center gap-3 rounded-card border border-divider bg-card p-4"><LogoImage src="/logos/platform-arcus.png" label="آرکوس" size={32} square/><span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.holding.label}</span>{s.holding.arcus!.env==='testnet'&&<Badge tone="warn">آزمایشی</Badge>}<AssetValue value={s.value} stale={s.stale} className="text-end" primaryClassName="text-sm"/></Link>)}</div></Section></>;
}

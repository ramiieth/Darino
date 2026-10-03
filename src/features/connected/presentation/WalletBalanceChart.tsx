import { useEffect,useState } from 'react';
import { Chart as ChartJS,LineElement,PointElement,CategoryScale,LinearScale,Tooltip,Filler,type ChartOptions } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Button } from '@/shared/components/ui/Button';
import { Select } from '@/shared/components/ui/Input';
import { Notice } from '@/shared/components/ui/StateViews';
import { MoneyValue,PercentValue } from '@/shared/components/ui/FinancialValue';
import { fmtUSD } from '@/shared/utils/formatters';
import { baseChartOptions,cssColor } from '@/shared/design/chartTheme';
import { fetchJson } from '@/repositories/remoteClient';
import { visiblePositions } from '../domain/visibility';
import type { ChartPeriod,WalletChart } from '../domain/chart';
import type { ConnectedPortfolio } from '../data/useConnectedPortfolio';
import { providerError } from './ConnectedPage';
ChartJS.register(LineElement,PointElement,CategoryScale,LinearScale,Tooltip,Filler);
const periods:[ChartPeriod,string][]=[['hour','۱ ساعت'],['day','۱ روز'],['week','۱ هفته'],['month','۱ ماه'],['year','۱ سال'],['max','همه']];
const memory=new Map<string,WalletChart>();
export function WalletBalanceChart({portfolio,network}:{portfolio:ConnectedPortfolio;network:string}) {
 const [period,setPeriod]=useState<ChartPeriod>('day'),[walletId,setWalletId]=useState(''),[data,setData]=useState<WalletChart|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const wallet=portfolio.wallets.find(w=>w.holding.id===walletId)??portfolio.wallets[0];
 const tokens=visiblePositions(wallet?.state?.data?.positions??[]).filter(p=>p.type==='wallet'&&p.chain!=='bitcoin'&&(network==='all'||p.chain===network));
 const ids=[...new Set(tokens.map(p=>p.tokenId).filter(Boolean))].sort();
 const supported=ids.length>0&&ids.length<=25&&tokens.every(p=>p.tokenId);
 const key=wallet&&supported?wallet.holding.address+'|'+period+'|'+network+'|'+ids.join(','):'';
 useEffect(()=>{let stopped=false;setError(null);setData(null);setBusy(false);if(!key)return;const hit=memory.get(key);if(hit&&Date.now()-hit.fetchedAt<1800000){setData(hit);return;}
 setBusy(true);void fetchJson<WalletChart>('/api/integrations?op=chart&address='+encodeURIComponent(wallet!.holding.address!)+'&period='+period+'&ids='+encodeURIComponent(ids.join(','))+(network==='all'?'':'&chain='+encodeURIComponent(network))).then(value=>{if(!stopped){if(memory.size>=100)memory.delete(memory.keys().next().value!);memory.set(key,value);setData(value);}}).catch(e=>{if(!stopped)setError(providerError(e));}).finally(()=>{if(!stopped)setBusy(false);});return()=>{stopped=true;};
 // The immutable request key owns lifecycle, not response or hook object references.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key,wallet?.state?.data?.fetchedAt]);
 if(!wallet)return null;
 const points=data?.points??[],delta=points.length>1?points[points.length-1][1]-points[0][1]:null;
 const percent=delta!==null&&points[0][1]>0?delta/points[0][1]*100:null;
 const color=cssColor(delta!==null&&delta<0?'loss':'gain');
 const labels=points.map(([at])=>new Date(at).toLocaleString('fa-IR',period==='hour'||period==='day'?{hour:'2-digit',minute:'2-digit'}:{month:'short',day:'numeric'}));
 const base=baseChartOptions() as ChartOptions<'line'>;
 return <div className="mb-5 space-y-3 border-b border-divider pb-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold">روند کیف پول</p><div className="mt-1 flex flex-wrap items-center gap-2"><PercentValue value={percent} className="text-xs"/><MoneyValue value={delta} signed tone="auto" className="text-xs"/></div></div>{portfolio.wallets.length>1?<div className="max-w-full"><Select aria-label="کیف پول نمودار" value={wallet.holding.id} onChange={e=>setWalletId(e.target.value)}>{portfolio.wallets.map(w=><option key={w.holding.id} value={w.holding.id}>{w.holding.label}</option>)}</Select></div>:<span className="text-xs text-muted">{wallet.holding.label}</span>}</div>
 {error&&<Notice tone="warn">{error}</Notice>}{!supported&&<p className="py-4 text-xs text-muted">نمودار برای این مجموعهٔ دارایی در دسترس نیست.</p>}{busy&&<div className="skeleton h-48 rounded-field" aria-label="دریافت نمودار"/>}{!busy&&data&&points.length<2&&<p className="py-6 text-xs text-muted">دادهٔ کافی برای نمودار دریافت نشد.</p>}{!busy&&points.length>1&&<div className="relative h-48 min-w-0 w-full overflow-hidden md:h-60" role="img" aria-label={`نمودار ارزش کیف پول ${wallet.holding.label}؛ ${periods.find(p=>p[0]===period)?.[1]}`}><Line style={{maxWidth:'100%'}} data={{labels,datasets:[{label:'ارزش کیف پول',data:points.map(p=>p[1]),borderColor:color,backgroundColor:color,borderWidth:2,pointRadius:0,pointHoverRadius:4,tension:0.15,fill:false}]}} options={{...base,animation:false,maintainAspectRatio:false,plugins:{...base.plugins,legend:{display:false},tooltip:{...base.plugins?.tooltip,callbacks:{label:ctx=>fmtUSD(ctx.parsed.y)}}},scales:{x:{display:false},y:{display:false}}}}/></div>}
 <div className="flex flex-wrap gap-1" aria-label="بازهٔ نمودار">{periods.map(([id,label])=><Button key={id} size="sm" variant={period===id?'primary':'ghost'} aria-pressed={period===id} onClick={()=>setPeriod(id)}>{label}</Button>)}</div></div>;
}

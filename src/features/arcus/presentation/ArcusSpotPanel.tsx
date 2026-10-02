import { ArcusSpotAssets } from './ArcusSpotAssets';
import { useEffect,useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { Section,Surface } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { LogoImage } from '@/shared/components/ui/EntityLogo';
import { Notice } from '@/shared/components/ui/StateViews';
import { fetchJson } from '@/repositories/remoteClient';
import { useConnectedStore,refreshWallet,refreshTransactions } from '@/features/connected/data/store';
import { addressKey } from '@/features/connected/domain/model';
import { ActivityList } from '@/features/connected/presentation/ActivityList';
import { walletActivities } from '@/features/connected/domain/activity';
import { providerError } from '@/features/connected/presentation/ConnectedPage';
import { chainIdentity } from '@/features/connected/presentation/identity';
import { spotPositions,spotTransaction,type SpotToken } from '../domain/spot';
export function ArcusSpotPanel({address,env}:{address:string;env:'mainnet'|'testnet'}) {
 const [tokens,setTokens]=useState<SpotToken[]|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
 const wallet=useConnectedStore(s=>s.wallets[addressKey(address)]);
 async function refresh(force=false){if(env!=='mainnet')return;setBusy(true);setError(null);try{const catalog=await fetchJson<{tokens:SpotToken[]}>('/api/integrations?op=arcus-spot');setTokens(catalog.tokens);await refreshWallet(address,force);await refreshTransactions(address);}catch(e){setError(providerError(e));}finally{setBusy(false);}}
 useEffect(()=>{void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},300000);return()=>clearInterval(timer);},[address,env]);
 const positions=spotPositions(wallet?.data?.positions??[],tokens??[]),chain=chainIdentity('robinhood',wallet?.data?.chains);
 if(env==='testnet')return <Notice>اسپات این صفحه مربوط به شبکهٔ اصلی است؛ دادهٔ آزمایشی وارد پرتفولیو نمی‌شود.</Notice>;
 return <div className="space-y-5"><Surface className="native-wallet-card flex flex-wrap items-center justify-between gap-3 p-4"><div className="flex items-center gap-3"><LogoImage src="/logos/platform-arcus.png" label="آرکوس" size={32} square/><div><p className="font-semibold">اسپات آرکوس</p><p className="inline-flex items-center gap-2 text-xs text-muted"><LogoImage src={chain.logo} label={chain.name} size={18}/>{chain.name} · توکن‌های کیف پول</p></div></div><Button loading={busy} variant="outline" icon={<RefreshCw/>} onClick={()=>void refresh(true)}>به‌روزرسانی</Button></Surface>
 {error&&<Notice tone="warn">{error}</Notice>}{wallet?.error&&<Notice tone="warn">{wallet.error}</Notice>}
 <Section title="دارایی‌های اسپات" id="arcus-spot-assets"><Surface className="native-wallet-card p-4">{wallet?.data&&tokens?<><ArcusSpotAssets positions={positions} chains={wallet.data.chains}/></>:<p className="text-sm text-muted">در انتظار دریافت فهرست و موجودی…</p>}<details className="mt-3 text-xs text-muted"><summary className="cursor-pointer py-2">مبنای موجودی</summary><p className="mt-2 leading-6">موجودی کیف پول از زریون، فهرست توکن‌ها از آرکوس؛ به اعتبار پرپچوال اضافه نمی‌شود.</p></details><Link className="mt-3 inline-block text-sm text-accent" to="/wallets">اتصال کیف پول به مجموع داشبورد</Link></Surface></Section>
 <Section title="فعالیت روتر اسپات" id="arcus-spot-history"><ActivityList rows={walletActivities([{address,label:'کیف پول آرکوس',history:(wallet?.history??[]).filter(spotTransaction)}])} chains={wallet?.data?.chains}/>{wallet?.historyLoaded&&!wallet.history.some(spotTransaction)&&<p className="text-sm text-muted">فعالیت شناسایی‌شده‌ای در تاریخچهٔ دریافت‌شده یافت نشد.</p>}{wallet?.historyError&&<Notice tone="warn">{wallet.historyError}</Notice>}{wallet?.next&&<Button variant="outline" loading={wallet.historyLoading} onClick={()=>void refreshTransactions(address,true)}>فعالیت‌های قدیمی‌تر</Button>}</Section></div>;
}

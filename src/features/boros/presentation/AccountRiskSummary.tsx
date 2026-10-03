import type { BorosAccountSnapshot } from '@/shared/boros/account';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Notice } from '@/shared/components/ui/StateViews';
import { Metric,MetricGrid,MoneyValue } from '@/shared/components/ui/FinancialValue';
import { tokenName } from '@/features/connected/presentation/identity';
export function AccountRiskSummary({account,stale}:{account:BorosAccountSnapshot;stale:boolean}){
 const positions=account.positions.filter(p=>!p.matured);
 const zones=account.balances.filter(b=>positions.some(p=>p.handle===b.handle));
 return <Surface className="p-4 space-y-4"><h3 className="text-sm font-bold">وضعیت وثیقه و ریسک پوزیشن‌ها</h3>{stale||account.partial?<Notice tone="stale">دادهٔ حساب قدیمی یا ناقص است؛ وضعیت فعلی ریسک قابل تأیید نیست.</Notice>:null}{!positions.length?<p className="text-xs text-muted">در دادهٔ دریافت‌شده پوزیشن فعال ثبت نشده است.</p>:<>
 {zones.map(b=>{const asset=account.assets.find(a=>a.tokenId===b.tokenId),price=asset?.priceUsd;const usd=(v:number|null)=>v!==null&&price!=null&&price>0?v*price:null;const maintenance=b.equity!==null&&b.maintenanceBuffer!==null&&b.equity-b.maintenanceBuffer>=0?b.equity-b.maintenanceBuffer:null;
 return <div key={b.handle} className="space-y-3 border-t border-divider pt-3"><p className="text-xs font-semibold">{tokenName(asset?.symbol??'')} · {b.marketId===0xffffff?'وثیقهٔ مشترک':'وثیقهٔ جدا'}</p>{!stale&&!account.partial&&b.maintenanceBuffer!==null&&b.maintenanceBuffer<=0&&<Notice tone="warn">حاشیهٔ مارجین نگهداری کافی نیست؛ دادهٔ حساب خطر لیکوییدشدن را نشان می‌دهد.</Notice>}{b.maintenanceBuffer===null&&<Notice tone="stale">حاشیهٔ نگهداری این وثیقه دریافت نشده است.</Notice>}<MetricGrid cols={3}><Metric size="sm" label="ارزش خالص وثیقه" value={<MoneyValue value={usd(b.equity)} state={stale?'stale':'ready'}/>}/><Metric size="sm" label="مارجین نگهداری" value={<MoneyValue value={usd(maintenance)} state={stale?'stale':'ready'}/>}/><Metric size="sm" label="حاشیهٔ باقی‌ماندهٔ نگهداری" value={<MoneyValue value={usd(b.maintenanceBuffer)} signed tone="auto" state={stale?'stale':'ready'}/>}/></MetricGrid>
</div>;})}
 {positions.some(p=>!zones.some(b=>b.handle===p.handle))&&<Notice tone="stale">وثیقهٔ بعضی پوزیشن‌ها دریافت نشده است؛ ریسک آن‌ها قابل تأیید نیست.</Notice>}
 <p className="text-xs leading-6 text-muted">آستانه به نرخ مارک مربوط است؛ قیمت رمزارز نیست. پوزیشن‌های وثیقهٔ مشترک را جدا از یکدیگر امن فرض نکنید.</p></>}<p className="text-xs text-muted">زمان دادهٔ حساب: {account.syncedAt===null?'نامشخص':new Date(account.syncedAt).toLocaleString('fa-IR')}</p></Surface>;
}

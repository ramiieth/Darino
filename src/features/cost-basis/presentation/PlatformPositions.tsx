import type { ConnectedPortfolio } from '@/features/connected/data/useConnectedPortfolio';
import type { BorosAccountSnapshot } from '@/shared/boros/account';
import { useBorosStore } from '@/features/boros/data/useBoros';
import { platformPositions } from '../domain/platformPositions';
import { TokenLogo } from '@/shared/components/ui/EntityLogo';
import { Metric,MetricGrid,MoneyValue,PercentValue,QuantityValue } from '@/shared/components/ui/FinancialValue';
import { tokenName,chainIdentity } from '@/features/connected/presentation/identity';
import { Badge } from '@/shared/components/ui/Badge';
import { arcusVenues, usePlatformPerpVenues } from '@/features/perps/data/usePerpVenues';
import { netDeposit, perpTotals, type PerpVenueAccount } from '@/features/perps/domain/perpPortfolio';
export function PlatformPositions({portfolio,boros}:{portfolio:ConnectedPortfolio;boros:{data:BorosAccountSnapshot|null;stale:boolean}}){
 const markets=useBorosStore(s=>s.markets);const lighter=usePlatformPerpVenues();const rows=platformPositions(portfolio,boros,markets,lighter);
 const accounts=[...arcusVenues(portfolio.arcus),...lighter];if(!rows.length&&!accounts.length)return null;
 return <>{accounts.length>0&&<PerpAccounts accounts={accounts}/>}{rows.length>0&&<section className="mt-5 border-t border-divider pt-4" aria-label="پوزیشن‌های واقعی"><h3 className="text-sm font-semibold">پوزیشن‌های واقعی</h3><p className="text-[11px] text-muted mt-2">مقادیر حساب؛ حجم قرارداد به موجودی رمزارز اضافه نمی‌شود.</p><div className="grid gap-3 mt-3 lg:grid-cols-2">{rows.map(r=>{const n=chainIdentity(r.chain);return <article key={r.key} className="min-w-0 rounded-xl border border-divider p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 min-w-0"><TokenLogo logo={r.logo} symbol={r.symbol} name={tokenName(r.symbol)} networkLogo={n.logo} networkName={n.name} size={32}/><div><p className="text-sm font-semibold">{tokenName(r.symbol)}</p><p className="text-[11px] text-muted mt-1">{r.source}</p></div></div><Badge tone={r.stale?'warn':'neutral'}>{r.side}{r.stale?' · ذخیره‌شده':''}</Badge></div><MetricGrid cols={2} className="mt-4"><Metric size="sm" label="حجم قرارداد" value={<QuantityValue value={r.size} unit={r.rate?'واحد بازده':tokenName(r.symbol)}/>}/><Metric size="sm" label="سود تحقق‌نیافته" value={<MoneyValue value={r.pnl} signed tone="auto"/>}/><Metric size="sm" label={r.rate?'نرخ ثابت ورود':'قیمت ورود'} value={r.rate?<PercentValue value={r.entry} tone="none"/>:<MoneyValue value={r.entry}/>}/><Metric size="sm" label={r.rate?'نرخ مارک':'قیمت مارک'} value={r.rate?<PercentValue value={r.mark} tone="none"/>:<MoneyValue value={r.mark}/>}/></MetricGrid></article>;})}</div></section>}</>;
}

/**
 * حساب‌های پرپ در «بهای خرید و سود و زیان»: بهای خرید هر حساب = سرمایهٔ خالص واریزی (ارزش − سود/زیان کل)،
 * سود و زیان = کل (باز + بسته‌شده)؛ همهٔ صرافی‌ها (آرکوس، لایتر رابین‌هود/اصلی، هایپرلیکوئید، تی‌اکس‌فلو، آستر، کیوفکس، اوندو)
 */
function PerpAccounts({accounts}:{accounts:PerpVenueAccount[]}){
 const t=perpTotals(accounts);const deposit=accounts.every(a=>netDeposit(a)!==null)?accounts.reduce((s,a)=>s+netDeposit(a)!,0):null;
 return <section className="mt-5 border-t border-divider pt-4" aria-label="حساب‌های پرپ"><h3 className="text-sm font-semibold">حساب‌های پرپ</h3><p className="text-[11px] text-muted mt-2">بهای خرید هر حساب = سرمایهٔ واریزی خالص (ارزش امروز منهای سود و زیان کل).{t.partial?' برخی عددها هنوز دریافت نشده‌اند.':''}</p>
 <MetricGrid cols={4} className="mt-3"><Metric size="sm" label="ارزش کل حساب‌ها" value={<MoneyValue value={t.equity}/>}/><Metric size="sm" label="سرمایهٔ واریزی" value={<MoneyValue value={deposit}/>}/><Metric size="sm" label="سود و زیان کل" value={<MoneyValue value={t.allTimePnl} signed tone="auto"/>}/><Metric size="sm" label="سود و زیان باز" value={<MoneyValue value={t.unrealizedPnl} signed tone="auto"/>}/></MetricGrid>
 <div className="mt-3 overflow-x-auto"><table className="data-table is-compact"><thead><tr><th>حساب</th><th className="col-num">ارزش</th><th className="col-num">سرمایهٔ واریزی</th><th className="col-num">سود و زیان کل</th><th className="col-num">باز</th><th className="col-num">بسته‌شده</th></tr></thead>
 <tbody>{accounts.map(a=><tr key={a.id}><td><span className="font-semibold">{a.label}</span>{a.status!=='ready'&&<span className="ms-1 text-2xs text-muted">{a.status==='loading'?'در حال دریافت':'خطا'}</span>}{a.stale&&<span className="ms-1 text-2xs text-warn">ذخیره‌شده</span>}</td><td className="col-num"><MoneyValue value={a.equity}/></td><td className="col-num"><MoneyValue value={netDeposit(a)}/></td><td className="col-num"><MoneyValue value={a.allTimePnl} signed tone="auto"/></td><td className="col-num"><MoneyValue value={a.unrealizedPnl} signed tone="auto"/></td><td className="col-num"><MoneyValue value={a.realizedPnl} signed tone="auto"/></td></tr>)}</tbody></table></div></section>;
}

import type { ConnectedPortfolio } from '@/features/connected/data/useConnectedPortfolio';
import type { BorosAccountSnapshot } from '@/shared/boros/account';
import { useBorosStore } from '@/features/boros/data/useBoros';
import { platformPositions } from '../domain/platformPositions';
import { TokenLogo } from '@/shared/components/ui/EntityLogo';
import { Metric,MetricGrid,MoneyValue,PercentValue,QuantityValue } from '@/shared/components/ui/FinancialValue';
import { tokenName,chainIdentity } from '@/features/connected/presentation/identity';
import { Badge } from '@/shared/components/ui/Badge';
export function PlatformPositions({portfolio,boros}:{portfolio:ConnectedPortfolio;boros:{data:BorosAccountSnapshot|null;stale:boolean}}){
 const markets=useBorosStore(s=>s.markets);const rows=platformPositions(portfolio,boros,markets);if(!rows.length)return null;
 return <section className="mt-5 border-t border-divider pt-4" aria-label="پوزیشن‌های واقعی"><h3 className="text-sm font-semibold">پوزیشن‌های واقعی</h3><p className="text-[11px] text-muted mt-2">مقادیر حساب؛ حجم قرارداد به موجودی رمزارز اضافه نمی‌شود.</p><div className="grid gap-3 mt-3 lg:grid-cols-2">{rows.map(r=>{const n=chainIdentity(r.chain);return <article key={r.key} className="min-w-0 rounded-xl border border-divider p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 min-w-0"><TokenLogo logo={r.logo} symbol={r.symbol} name={tokenName(r.symbol)} networkLogo={n.logo} networkName={n.name} size={32}/><div><p className="text-sm font-semibold">{tokenName(r.symbol)}</p><p className="text-[11px] text-muted mt-1">{r.source}</p></div></div><Badge tone={r.stale?'warn':'neutral'}>{r.side}{r.stale?' · ذخیره‌شده':''}</Badge></div><MetricGrid cols={2} className="mt-4"><Metric size="sm" label="حجم قرارداد" value={<QuantityValue value={r.size} unit={r.rate?'واحد بازده':tokenName(r.symbol)}/>}/><Metric size="sm" label="سود تحقق‌نیافته" value={<MoneyValue value={r.pnl} signed tone="auto"/>}/><Metric size="sm" label={r.rate?'نرخ ثابت ورود':'قیمت ورود'} value={r.rate?<PercentValue value={r.entry} tone="none"/>:<MoneyValue value={r.entry}/>}/><Metric size="sm" label={r.rate?'نرخ مارک':'قیمت مارک'} value={r.rate?<PercentValue value={r.mark} tone="none"/>:<MoneyValue value={r.mark}/>}/></MetricGrid></article>;})}</div></section>;
}

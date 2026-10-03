import { useState } from 'react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Button } from '@/shared/components/ui/Button';
import { Field, Select } from '@/shared/components/ui/Input';
import { Metric, MetricGrid, PercentValue, QuantityValue } from '@/shared/components/ui/FinancialValue';
import { Badge } from '@/shared/components/ui/Badge';
import type { Tone } from '@/shared/components/ui/Badge';
import type { BorosDirection, BorosMarket } from '../domain/types';
import { CapitalPlanner } from './CapitalPlanner';
import { MarketIdentity } from './MarketIdentity';
import { borosAssetName } from './borosLabels';
export const STATUS_LABEL: Record<string, string> = { potential: 'فرصت بالقوه', conditional: 'فرصت مشروط', 'not-attractive': 'جذاب نیست', 'insufficient-data': 'داده ناکافی', 'anomaly-detected': 'ناهنجاری نرخ' };
export const STATUS_TONE: Record<string, Tone> = { potential: 'gain', conditional: 'info', 'not-attractive': 'warn', 'insufficient-data': 'neutral', 'anomaly-detected': 'loss' };
export function OpportunitiesTab({ markets,onInspect,onRecommend }: { markets: BorosMarket[];onInspect?:(marketId:number,direction?:BorosDirection)=>void;onRecommend?:()=>void }) {
  const [asset, setAsset] = useState('all');
  return <div className="space-y-6">
    <Surface variant="focal" className="p-4 md:p-5 space-y-2"><h2 className="text-base font-bold">فهرست بازارهای بوروس</h2><p className="text-xs leading-6 text-muted">دارایی، پلتفرم و سررسید را مقایسه کنید؛ سپس نرخ اجرا و مارجین را با حساب خودتان پیش‌نمایش بگیرید. اختلاف نرخ به‌تنهایی فرصت قطعی نیست.</p>{onRecommend&&<Button size="sm" variant="outline" onClick={onRecommend}>پیشنهاد با موجودی حساب من</Button>}</Surface>
    <section className="space-y-4" aria-label="بازارهای بوروس">
      <div className="flex flex-wrap items-end justify-between gap-4"><h2 className="text-base font-bold">بازارها</h2><Field label="دارایی"><Select value={asset} onChange={e => setAsset(e.target.value)}><option value="all">همه دارایی‌ها</option>{[...new Set(markets.map(m => m.asset))].map(value => <option key={value} value={value}>{borosAssetName(value)}</option>)}</Select></Field></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{markets.filter(m => asset === 'all' || m.asset === asset).map(m => <Surface key={m.marketId} className="boros-market-card p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><MarketIdentity market={m} /><Badge tone={m.status === 'GOOD' ? 'gain' : 'warn'}>{m.status === 'GOOD' ? 'فعال' : 'ورود بسته'}</Badge></div>
        <MetricGrid cols={2}><Metric size="sm" label="نرخ مارک" value={<PercentValue value={m.markApr * 100} signed={false} tone="none" />} /><Metric size="sm" label="نرخ شناور" value={<PercentValue value={m.floatingApr * 100} signed={false} tone="none" />} /><Metric size="sm" label="اختلاف شناور و مارک" value={<PercentValue value={(m.floatingApr - m.markApr) * 100} />} /><Metric size="sm" label="تا سررسید" value={<QuantityValue value={Math.max(0, (m.maturity * 1000 - Date.now()) / 86400000)} digits={1} unit="روز" />} /></MetricGrid>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider pt-3"><span className="text-xs text-muted">{m.floatingApr>m.markApr?'شناور بالاتر از مارک':m.floatingApr<m.markApr?'شناور پایین‌تر از مارک':'نرخ‌ها برابرند'}</span><Button size="sm" variant="outline" onClick={()=>onInspect?.(m.marketId)} disabled={m.status!=='GOOD'}>بررسی ورود</Button></div>
      </Surface>)}</div>
    </section>
    <Disclosure summary="برآورد فرضی با سرمایه دلاری"><div className="pt-4"><CapitalPlanner markets={markets} /></div></Disclosure>
  </div>;
}

import { useBorosAccount } from '../data/useBorosAccount';
import type { EntrySelection } from './VerifiedOpportunities';
import { useEffect, useRef, useState } from 'react';
import { normalizeDecimalInput } from '@/features/cost-basis/presentation/decimalInput';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Metric, MetricGrid, PercentValue, QuantityValue } from '@/shared/components/ui/FinancialValue';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { OrderPreviewPanel } from './OrderPreviewPanel';
import { MarketIdentity } from './MarketIdentity';
import { borosAssetName, borosVenueName } from './borosLabels';
import type { BorosDirection, BorosMarket } from '../domain/types';
import { RateHistory } from './RateHistory';
export function SimulatorTab({ markets,initial }: { markets: BorosMarket[];initial?:{marketId:number;direction:BorosDirection;entry?:EntrySelection} }) {
  const account=useBorosAccount();
  const preferred=markets.find(m=>account.data?.balances.some(b=>b.tokenId===m.tokenId&&b.freeMargin!==null&&b.freeMargin>0))??markets[0];
  const chosen=useRef(!!initial);
  const [marketId, setMarketId] = useState(initial?.marketId ?? preferred?.marketId ?? 0);
  const [marketChanged,setMarketChanged]=useState(false);
  const [entry,setEntry]=useState(initial?.entry);
  const [direction, setDirection] = useState<BorosDirection>(initial?.direction??'long');
  const [fixedRateInput, setFixedRateInput] = useState('');
  const fixedRate = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(fixedRateInput) ? Number(fixedRateInput) / 100 : null;
  const market = markets.find(m => m.marketId === marketId);
  useEffect(()=>{if(preferred&&(!markets.some(m=>m.marketId===marketId)||(!chosen.current&&account.data))){if(marketId!==0&&!markets.some(m=>m.marketId===marketId))setMarketChanged(true);setEntry(undefined);setFixedRateInput('');setMarketId(preferred.marketId);if(account.data)chosen.current=true;}},[markets,marketId,preferred,account.data]);
  if (!market) return <EmptyState message="بازار فعالی موجود نیست" />;
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,480px)] items-start">
    <div className="min-w-0 space-y-4">
    <Surface className="p-4 md:p-5 space-y-3">
      {marketChanged&&<Notice tone="warn">بازار قبلی دیگر برای ورود فعال نیست؛ بازار انتخاب‌شده تغییر کرده است.</Notice>}
      <h3 className="font-bold text-sm">بازار و جهت معامله</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="بازار"><Select value={market.marketId} onChange={e => { chosen.current=true;setMarketChanged(false);setEntry(undefined);setMarketId(Number(e.target.value)); setFixedRateInput(''); }}>{markets.map(m => <option key={m.marketId} value={m.marketId}>{borosAssetName(m.asset)} · {borosVenueName(m.venue)} · {new Date(m.maturity * 1000).toLocaleDateString('fa-IR')}</option>)}</Select></Field>
        <div><p className="mb-1.5 text-xs font-semibold text-muted">جهت نرخ</p><SegmentedControl label="جهت" fill value={direction} onChange={v=>{setEntry(undefined);setDirection(v);}} options={[{ value: 'long', label: 'لانگ نرخ' }, { value: 'short', label: 'شورت نرخ' }]} /></div>
      </div>
      <MarketIdentity market={market} compact />
      <MetricGrid cols={3} className="!grid-cols-3 border-t border-divider pt-3"><Metric label="نرخ مارک" value={<PercentValue value={market.markApr * 100} signed={false} tone="none" />} /><Metric label="نرخ شناور" value={<PercentValue value={market.floatingApr * 100} signed={false} tone="none" />} /><Metric label="تا سررسید" value={<QuantityValue value={Math.max(0,(market.maturity-Date.now()/1000)/86400)} digits={1} unit="روز"/>}/></MetricGrid>
      <Disclosure summary="تغییر نرخ ورود فرضی"><div className="py-3"><Field label="نرخ ثابت فرضی"><Input dir="ltr" inputMode="decimal" value={fixedRateInput} onChange={e => setFixedRateInput(normalizeDecimalInput(e.target.value))} suffix="٪" placeholder="پیش‌فرض: نرخ مارک" /></Field></div></Disclosure>
    </Surface>
    <Disclosure summary="نمودار و تاریخچهٔ نرخ"><RateHistory market={market} /></Disclosure>
    </div>
    <OrderPreviewPanel key={`${market.marketId}:${direction}`} entry={entry} market={market} direction={direction} fixedRate={fixedRate} underlyingApr={market.floatingApr} collateralPriceUsd={market.collateralPriceUsd ?? 0} markets={markets} onSelectMarket={(id, side, selected) => { setEntry(selected);setMarketId(id); setDirection(side); setFixedRateInput(''); }} />
  </div>;
}

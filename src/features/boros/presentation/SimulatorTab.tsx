import { useState } from 'react';
import { normalizeDecimalInput } from '@/features/cost-basis/presentation/decimalInput';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Metric, MetricGrid, PercentValue } from '@/shared/components/ui/FinancialValue';
import { EmptyState } from '@/shared/components/ui/StateViews';
import { OrderPreviewPanel } from './OrderPreviewPanel';
import { MarketIdentity } from './MarketIdentity';
import { borosAssetName, borosVenueName } from './borosLabels';
import type { BorosDirection, BorosMarket } from '../domain/types';
import { RateHistory } from './RateHistory';
export function SimulatorTab({ markets }: { markets: BorosMarket[] }) {
  const [marketId, setMarketId] = useState(markets[0]?.marketId ?? 0);
  const [direction, setDirection] = useState<BorosDirection>('long');
  const [fixedRateInput, setFixedRateInput] = useState('');
  const fixedRate = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(fixedRateInput) ? Number(fixedRateInput) / 100 : null;
  const market = markets.find(m => m.marketId === marketId) ?? markets[0];
  if (!market) return <EmptyState message="بازار فعالی موجود نیست" />;
  return <div className="space-y-5">
    <Surface className="p-4 md:p-5 space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="بازار"><Select value={market.marketId} onChange={e => { setMarketId(Number(e.target.value)); setFixedRateInput(''); }}>{markets.map(m => <option key={m.marketId} value={m.marketId}>{borosAssetName(m.asset)} · {borosVenueName(m.venue)} · {new Date(m.maturity * 1000).toLocaleDateString('fa-IR')}</option>)}</Select></Field>
        <div><p className="mb-1.5 text-xs font-semibold text-muted">جهت نرخ</p><SegmentedControl label="جهت" fill value={direction} onChange={setDirection} options={[{ value: 'long', label: 'لانگ' }, { value: 'short', label: 'شورت' }]} /></div>
      </div>
      <MarketIdentity market={market} />
      <MetricGrid cols={3} className="border-t border-divider pt-4"><Metric label="نرخ مارک" value={<PercentValue value={market.markApr * 100} signed={false} tone="none" />} /><Metric label="نرخ شناور" value={<PercentValue value={market.floatingApr * 100} signed={false} tone="none" />} /><Metric label="نرخ ورود سناریو" value={<PercentValue value={(fixedRate ?? market.markApr) * 100} signed={false} tone="none" />} /></MetricGrid>
      <Disclosure summary="تغییر نرخ ورود فرضی"><div className="py-3"><Field label="نرخ ثابت فرضی"><Input dir="ltr" inputMode="decimal" value={fixedRateInput} onChange={e => setFixedRateInput(normalizeDecimalInput(e.target.value))} suffix="٪" placeholder="پیش‌فرض: نرخ مارک" /></Field></div></Disclosure>
    </Surface>
    <OrderPreviewPanel key={`${market.marketId}:${direction}`} market={market} direction={direction} fixedRate={fixedRate} underlyingApr={market.floatingApr} collateralPriceUsd={market.collateralPriceUsd ?? 0} markets={markets} onSelectMarket={(id, side) => { setMarketId(id); setDirection(side); setFixedRateInput(''); }} />
    <RateHistory market={market} />
  </div>;
}

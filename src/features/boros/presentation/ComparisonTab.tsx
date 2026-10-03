import { useState } from 'react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { Metric, MetricGrid, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { EmptyState } from '@/shared/components/ui/StateViews';
import { normalizeDecimalInput } from '@/features/cost-basis/presentation/decimalInput';
import { MarginCalculator } from '../domain/engine/margin';
import { FeeCalculator } from '../domain/engine/fees';
import type { BorosMarket } from '../domain/types';
import { borosAssetName } from './borosLabels';
import { MarketIdentity } from './MarketIdentity';
export function ComparisonTab({ markets }: { markets: BorosMarket[] }) {
  const [asset, setAsset] = useState('ETH');
  const [size, setSize] = useState('1000');
  const assets = [...new Set(markets.map(m => m.asset))];
  const current = assets.includes(asset) ? asset : assets[0];
  const valid = /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(size) && Number(size) > 0 && Number.isFinite(Number(size));
  const now = Math.floor(Date.now() / 1000);
  return <div className="space-y-5">
    <Surface className="p-4 md:p-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="دارایی"><Select value={current} onChange={e => setAsset(e.target.value)}>{assets.map(a => <option key={a} value={a}>{borosAssetName(a)}</option>)}</Select></Field><Field label="ارزش اسمی مشترک"><Input inputMode="decimal" dir="ltr" suffix="دلار" value={size} onChange={e => setSize(normalizeDecimalInput(e.target.value))} /></Field></div><p className="mt-3 text-xs text-muted">این مبلغ ارزش اسمی قرارداد است؛ سرمایه یا مارجین شما نیست.</p></Surface>
    {!valid ? <EmptyState message="ارزش اسمی معتبر وارد کنید" /> : <div className="grid gap-4 lg:grid-cols-2">{markets.filter(m => m.asset === current).map(m => {
      const price = m.collateralPriceUsd;
      const yu = price && price > 0 ? Number(size) / price : null;
      const fees = yu != null ? FeeCalculator.calc({ m, size: yu, unitPriceUsd: price, nowSec: now }) : null;
      const margin = yu != null && price ? MarginCalculator.calcMarket(m, yu, m.markApr, now) * price : null;
      const gross = Number(size) * (m.floatingApr - m.markApr) * Math.max(0, m.maturity - now) / (365 * 86400);
      return <Surface key={m.marketId} className="p-4 md:p-5 space-y-4"><MarketIdentity market={m} /><MetricGrid cols={2}><Metric size="sm" label="مارک" value={<PercentValue value={m.markApr * 100} signed={false} tone="none" />} /><Metric size="sm" label="شناور" value={<PercentValue value={m.floatingApr * 100} signed={false} tone="none" />} /><Metric size="sm" label="مارجین تخمینی" value={<MoneyValue value={margin} />} /><Metric size="sm" label="کارمزد پروتکل" value={<MoneyValue value={fees?.total} />} /><Metric size="sm" label="ناخالص لانگ تا سررسید" value={<MoneyValue value={gross} signed tone="auto" />} /><Metric size="sm" label="ناخالص شورت تا سررسید" value={<MoneyValue value={-gross} signed tone="auto" />} /></MetricGrid><p className="text-xs leading-6 text-muted">نرخ شناور ثابت و ورود در مارک فرض شده؛ گس، ورود به بازار و اثر اجرای سفارش لحاظ نشده‌اند.</p></Surface>;
    })}</div>}
  </div>;
}

import { useEffect, useMemo, useState } from 'react';
import { Sparkles, ArrowDownLeft } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Field, Input } from '@/shared/components/ui/Input';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Metric, MetricGrid, MoneyValue, PercentValue, QuantityValue } from '@/shared/components/ui/FinancialValue';
import { normalizeDecimalInput } from '@/features/cost-basis/presentation/decimalInput';
import { usePublishInsight } from '@/shared/assistant/insights';
import { planCapital, recommendCapital } from '../domain/capitalPlan';
import type { BorosMarket } from '../domain/types';
import { MarketIdentity } from './MarketIdentity';
import { OrderPreviewPanel } from './OrderPreviewPanel';
import { borosAssetName, borosVenueName } from './borosLabels';
const number = (s: string) => /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s) && Number.isFinite(Number(s)) ? Number(s) : null;
export function CapitalPlanner({ markets }: { markets: BorosMarket[] }) {
  const [capital, setCapital] = useState('');
  const [allocation, setAllocation] = useState('50');
  const [gas, setGas] = useState('');
  const [entrance, setEntrance] = useState('');
  const [impact, setImpact] = useState('');
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => { const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30000); return () => clearInterval(timer); }, []);
  const input = { capitalUsd: number(capital) ?? 0, allocationPct: number(allocation) ?? 0, gasUsd: number(gas), entranceUsd: number(entrance), impactPoints: number(impact) };
  const rows = useMemo(() => planCapital(markets, input, now), [markets, capital, allocation, gas, entrance, impact, now]);
  const best = recommendCapital(rows);
  const detail = rows.find(row => `${row.m.marketId}:${row.direction}` === selected);
  usePublishInsight('borosCapitalPlan', best ? `بیشترین خالص تخمینی · ${borosAssetName(best.m.asset)} · ${borosVenueName(best.m.venue)} · ${best.direction === 'long' ? 'لانگ' : 'شورت'}` : 'برنامه سرمایه بوروس', best ? { marketId: best.m.marketId, capitalUsd: input.capitalUsd, allocationPct: input.allocationPct, directionSign: best.direction === 'long' ? 1 : -1, sizeYu: best.sizeYu, markApr: best.m.markApr, assumedExecutionApr: best.entryRate, floatingApr: best.m.floatingApr, impactPoints: best.impactPoints, projectedNetUsd: best.result.net, costsUsd: best.result.costs, marginUsd: best.result.margin, adverseNetUsd: best.result.scenarioMin, estimatedLiquidationApr: best.result.threshold.rate, daysToMaturity: best.result.preview.daysToMaturity } : null, 'simulation');
  const field = (label: string, value: string, setter: (s: string) => void, suffix: string, placeholder = '') => <Field label={label}><Input dir="ltr" inputMode="decimal" value={value} onChange={e => setter(normalizeDecimalInput(e.target.value))} suffix={suffix} placeholder={placeholder} /></Field>;
  const complete = input.capitalUsd > 0 && input.allocationPct > 0 && input.allocationPct <= 100 && input.gasUsd != null && input.entranceUsd != null && input.impactPoints != null;
  return <div className="space-y-5">
    <div className="boros-planner-grid">
      <Surface className="boros-plan-input p-4 md:p-5 space-y-5">
        <div><h2 className="text-base font-bold">برنامه سرمایه</h2><p className="mt-1 text-xs text-muted">مقایسهٔ مستقل بازارها تا سررسید</p></div>
        <div className="grid grid-cols-2 gap-4">
          {field('سرمایه دلاری', capital, setCapital, 'دلار')}
          {field('تخصیص مارجین', allocation, setAllocation, '٪')}
          {field('گس کل دوره', gas, setGas, 'دلار', 'صفر یا هزینه موردنظر')}
          {field('ورود به بازار', entrance, setEntrance, 'دلار', 'صفر یا هزینه موردنظر')}
        </div>
        {field('اثر نامطلوب اجرای نرخ', impact, setImpact, '', 'واحد درصد؛ مثلاً ۰.۲۲')}
        <p className="text-xs leading-6 text-muted">هزینهٔ نامعلوم را صفر فرض نمی‌کنیم. نرخ ورود فرضی از مارک و اثر اجرای واردشده ساخته می‌شود؛ قیمت قطعی سفارش نیست.</p>
      </Surface>
      <Surface variant="focal" className="boros-best-card p-5 md:p-6">
        <div className="flex items-center gap-2 text-sm font-bold text-accent"><Sparkles size={18} />بیشترین خالص تخمینی</div>
        {best ? <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><MarketIdentity market={best.m} /><Badge tone={best.direction === 'long' ? 'gain' : 'info'}>{best.direction === 'long' ? 'لانگ نرخ' : 'شورت نرخ'}</Badge></div>
          <div className="my-5"><MoneyValue value={best.result.net} signed tone="auto" className="text-3xl font-extrabold md:text-4xl" /><p className="mt-2 text-xs text-muted">تا سررسید · <QuantityValue value={best.result.preview.daysToMaturity} digits={1} unit="روز" /></p></div>
          <MetricGrid cols={3} className="border-t border-divider pt-4">
            <Metric size="sm" label="مارجین" value={<MoneyValue value={best.result.margin} />} />
            <Metric size="sm" label="هزینه کل فرضی" value={<MoneyValue value={best.result.costs} />} />
            <Metric size="sm" label="سناریوی نامطلوب" value={<MoneyValue value={best.result.scenarioMin} signed tone="auto" />} />
          </MetricGrid>
          <p className="mt-4 text-xs leading-6 text-muted">نرخ شناور فعلی ثابت فرض شده؛ عمق اجرای سفارش تأیید نشده و سود تضمین‌شده نیست. هر گزینه تمام سرمایهٔ واردشده را جداگانه در نظر می‌گیرد.</p>
          <Button className="mt-4" size="sm" onClick={() => setSelected(`${best.m.marketId}:${best.direction}`)}>بررسی این سناریو <ArrowDownLeft size={16} /></Button>
        </> : <div className="flex min-h-[240px] flex-col justify-center gap-3"><h3 className="text-lg font-bold">{complete ? 'گزینهٔ مثبت قابل پیشنهاد پیدا نشد' : 'سرمایه و هزینه‌ها را وارد کنید'}</h3><p className="text-sm leading-7 text-muted">{complete ? 'دادهٔ تازه، نقدشوندگی و مارجین بررسی می‌شوند؛ صرفاً اختلاف نرخ مثبت کافی نیست.' : 'مارجین، کارمزد هر بازار و خالص دلاری با فرض‌های شما محاسبه می‌شود.'}</p></div>}
      </Surface>
    </div>
    {rows.length > 0 && <Disclosure summary="مقایسهٔ سناریوها و هزینه‌ها">
      <div className="grid gap-3 py-4 md:grid-cols-2">
        {rows.slice(0, 12).map(row => <Surface key={`${row.m.marketId}:${row.direction}`} variant="subtle" className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><MarketIdentity market={row.m} compact /><Badge tone="neutral">{row.direction === 'long' ? 'لانگ' : 'شورت'}</Badge></div>
          <MetricGrid cols={2}><Metric size="sm" label="خالص فرضی" value={<MoneyValue value={row.result.net} signed tone="auto" />} /><Metric size="sm" label="نرخ ورود فرضی" value={<PercentValue value={row.entryRate * 100} signed={false} tone="none" />} /><Metric size="sm" label="کارمزد پروتکل" value={<MoneyValue value={row.fees.total} />} /><Metric size="sm" label="لیکویید ضمنی تخمینی" value={<PercentValue value={row.result.threshold.rate == null ? null : row.result.threshold.rate * 100} signed={false} tone="none" />} /></MetricGrid>
          <p className="text-xs text-muted">{row.result.liquidity.available && row.result.liquidity.executable ? 'نقدشوندگی اولیه مناسب؛ اجرای کامل تأیید نشده' : 'نقدشوندگی کافی تأیید نشده'}</p>
          <Button variant="outline" size="sm" onClick={() => setSelected(`${row.m.marketId}:${row.direction}`)}>تحلیل ورود</Button>
        </Surface>)}
      </div>
    </Disclosure>}
    {detail && <section className="space-y-4" aria-label="سناریوی انتخاب‌شده"><div className="flex flex-wrap items-center justify-between gap-3"><MarketIdentity market={detail.m} /><Button variant="ghost" size="sm" onClick={() => setSelected(null)}>بستن</Button></div><OrderPreviewPanel key={`${selected}:${capital}:${allocation}:${gas}:${entrance}:${impact}`} market={detail.m} direction={detail.direction} fixedRate={detail.entryRate} underlyingApr={detail.m.floatingApr} collateralPriceUsd={detail.m.collateralPriceUsd!} initial={{ sizeYu: detail.sizeYu, capitalUsd: input.capitalUsd, feesUsd: detail.fees.total + detail.entranceUsd, gasUsd: detail.gasUsd, slippageUsd: 0 }} /></section>}
  </div>;
}

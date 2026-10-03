import type { OfficialPreview } from '@/shared/boros/account';
import { OfficialPreviewPanel } from './OfficialPreviewPanel';
import { usePublishInsight } from '@/shared/assistant/insights';
/** Manual pre-entry assumptions; no signing, trading or account connection. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { assetDisplayName } from '@/shared/i18n/assetDisplayName';
import { normalizeDecimalInput } from '@/features/cost-basis/presentation/decimalInput';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Badge } from '@/shared/components/ui/Badge';
import { KeyValueList, Metric, MetricGrid, MoneyValue, PercentValue, QuantityValue } from '@/shared/components/ui/FinancialValue';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { analyzeEntry, scanEntries, sizeFromBudget } from '../domain/entryAnalysis';
import { borosAssetName, borosVenueName } from './borosLabels';
import type { BorosDirection, BorosMarket } from '../domain/types';

const optionalNumber = (s: string) => /^\d+(?:\.\d*)?$|^\.\d+$/.test(s) ? Number(s) : null;
const STATE_FA = { unavailable: 'داده تازه یا بازار فعال در دسترس نیست', incomplete: 'هزینه‌ها را تکمیل کنید', underfunded: 'سرمایه کافی نیست', negative: 'سود پایه مثبت نیست', positive: 'سناریوهای بررسی‌شده مثبت‌اند', conditional: 'فرصت مشروط' };

export function OrderPreviewPanel({ market, direction, fixedRate, underlyingApr, collateralPriceUsd, markets = [], onSelectMarket, initial }: {
  market: BorosMarket; direction: BorosDirection; fixedRate: number | null; underlyingApr: number; collateralPriceUsd: number;
  initial?: { sizeYu: number; capitalUsd: number; feesUsd: number; gasUsd: number; slippageUsd: number };
  markets?: BorosMarket[];
  onSelectMarket?: (marketId: number, direction: BorosDirection) => void;
}) {
  const [notional, setNotional] = useState(initial ? String(initial.sizeYu) : '2');
  const [quote,setQuote]=useState<OfficialPreview|null>(null);
  const quoted=quote&&quote.marketId===market.marketId&&quote.side===direction&&quote.matchedSize===Number(notional)&&Date.now()-quote.fetchedAt<180000?quote:null;
  const effectiveRate=quoted?.matchedApr??fixedRate;
  useEffect(()=>{if(!quote)return;const t=setTimeout(()=>setQuote(null),Math.max(0,180000-(Date.now()-quote.fetchedAt)));return()=>clearTimeout(t);},[quote]);
  const [collateral, setCollateral] = useState(initial ? String(initial.capitalUsd) : '');
  const [capitalUnit, setCapitalUnit] = useState(initial ? 'usd' : 'asset');
  const [gas, setGas] = useState(initial ? String(initial.gasUsd) : '');
  const [slippage, setSlippage] = useState(initial ? String(initial.slippageUsd) : '');
  const [fees, setFees] = useState(initial ? String(initial.feesUsd) : '');
  const [margin, setMargin] = useState('');
  const [allocation, setAllocation] = useState('50');
  const [floating, setFloating] = useState('');
  const collateralName = assetDisplayName(market.collateralSymbol ?? market.asset).name;
  const capitalUsd = (optionalNumber(collateral) ?? 0) * (capitalUnit === 'asset' ? collateralPriceUsd : 1);
  const previousSymbol = useRef(market.collateralSymbol);
  useEffect(() => {
    if (previousSymbol.current !== market.collateralSymbol && capitalUnit === 'asset') setCollateral('');
    previousSymbol.current = market.collateralSymbol;
  }, [market.collateralSymbol, capitalUnit]);
  const costInputs = { gasUsd: optionalNumber(gas), feesUsd: optionalNumber(fees), slippageUsd: optionalNumber(slippage) };
  const completeCosts = Object.values(costInputs).every(v => v !== null);
  const costsSum = Object.values(costInputs).reduce<number>((a, v) => a + (v ?? 0), 0);
  const assumedFloating = floating.trim() === '' ? underlyingApr : /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(floating) ? Number(floating) / 100 : NaN;
  const analysis = useMemo(() => analyzeEntry({ m: market, direction, sizeYu: optionalNumber(notional) ?? 0, capitalUsd, entryRate: effectiveRate ?? market.markApr, floatingRate: assumedFloating, ...costInputs, marginUsd: margin === '' ? null : optionalNumber(margin) ?? NaN }), [market, direction, notional, capitalUsd, effectiveRate, assumedFloating, gas, fees, slippage, margin]);
  usePublishInsight('borosEntry', `${borosAssetName(market.asset)} · ${borosVenueName(market.venue)} · ${direction === 'long' ? 'لانگ' : 'شورت'}`, analysis ? { marketId: market.marketId, capitalUsd, sizeYu: optionalNumber(notional), entryApr: effectiveRate ?? market.markApr, floatingApr: assumedFloating, marginRequiredUsd: analysis.margin, feesUsd: costInputs.feesUsd, gasUsd: costInputs.gasUsd, slippageUsd: costInputs.slippageUsd, projectedNetUsd: analysis.net, capitalRemainingUsd: analysis.capitalRemaining, adverseNetUsd: analysis.scenarioMin, favorableNetUsd: analysis.scenarioMax, breakEvenFloatingApr: analysis.breakEvenFloating, roiCapitalPct: analysis.roiCapital } : null, 'simulation', analysis?.state === 'unavailable' ? 'stale' : analysis?.state === 'incomplete' ? 'partial' : 'ready');
  const candidates = useMemo(() => scanEntries(markets, capitalUsd, optionalNumber(allocation) ?? 0, costInputs), [markets, capitalUsd, allocation, gas, fees, slippage]);
  const autoSize = () => {
    const size = sizeFromBudget(market, capitalUsd, optionalNumber(allocation) ?? 0, costsSum, Math.floor(Date.now() / 1000), effectiveRate ?? market.markApr);
    if (size != null && size > 0) { setNotional(String(Number(size.toFixed(8)))); setMargin(''); }
  };
  const field = (label: string, value: string, setValue: (v: string) => void, suffix: string, placeholder?: string) => <Field label={label}><Input dir="ltr" inputMode="decimal" value={value} onChange={e => setValue(normalizeDecimalInput(e.target.value))} suffix={suffix} placeholder={placeholder} /></Field>;

  return <div className="space-y-4">
    <Notice tone="info">تحلیل پیش از ورود؛ نرخ مارک، قیمت اجرای سفارش نیست.</Notice>
    <Surface className="p-4 md:p-5 space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {field('حجم واحد بازده', notional, setNotional, '')}
        {field(capitalUnit === 'asset' ? 'وثیقه موجود' : 'سرمایه', collateral, setCollateral, capitalUnit === 'asset' ? collateralName : 'دلار')}
        <Field label="واحد سرمایه"><Select value={capitalUnit} onChange={e => { setCollateral(''); setCapitalUnit(e.target.value); }}><option value="asset">{collateralName}</option><option value="usd">دلار</option></Select></Field>
        {field('تخصیص مارجین', allocation, setAllocation, '٪')}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted">{direction === 'long' ? 'لانگ' : 'شورت'} · نرخ ورود <PercentValue value={(effectiveRate ?? market.markApr) * 100} signed={false} tone="none" /></span>
        <Button size="sm" variant="outline" onClick={autoSize} disabled={!completeCosts || capitalUsd <= 0}>محاسبه حجم با سرمایه</Button>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {field('مجموع کارمزدها', fees, setFees, 'دلار', 'شامل ورود به بازار')}
        {field('هزینه لغزش', slippage, setSlippage, 'دلار', 'صفر در صورت نبود هزینه')}
        {field('گس', gas, setGas, 'دلار')}
      </div>
      <Disclosure summary="فرض‌های تکمیلی">
        <div className="grid grid-cols-2 gap-4 py-3">
          {field('مارجین اعلام‌شده در بوروس', margin, setMargin, 'دلار', 'اختیاری')}
          {field('نرخ شناور فرضی', floating, setFloating, '٪', String(Number((underlyingApr * 100).toFixed(3))))}
        </div>
        <p className="pb-2 text-xs text-muted">واحد بازده، حجم قرارداد است؛ وثیقه توکن جدا می‌ماند. کارمزدها برای کل دوره‌اند؛ گس و لغزش جدا حساب می‌شوند. لغزشِ لحاظ‌شده در نرخ ورود را دوباره وارد نکنید.</p>
      </Disclosure>
    </Surface>

    <OfficialPreviewPanel market={market} direction={direction} size={notional} onApply={p=>{setQuote(p);setNotional(String(p.matchedSize));setSlippage('0');}} />
    {quoted&&<Notice tone="info">حجم و نرخ اجرای پیش‌نمایش در سناریو استفاده شد؛ لغزش در نرخ لحاظ شده و هزینه کامل همچنان باید مشخص باشد.</Notice>}

    {!analysis ? <EmptyState message="سرمایه و حجم معتبر وارد کنید." /> : <>
      <Surface variant="focal" className="p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-semibold text-muted">خالص سناریوی سررسید</p><p className="mt-2 text-3xl font-bold"><MoneyValue value={analysis.net} signed tone="auto" /></p></div>
          <Badge tone={analysis.state === 'positive' ? 'gain' : analysis.state === 'negative' || analysis.state === 'underfunded' ? 'loss' : 'neutral'}>{STATE_FA[analysis.state]}</Badge>
        </div>
        <MetricGrid cols={3} className="mt-5 border-t border-divider pt-4">
          <Metric label={margin === '' ? "مارجین موردنیاز" : "مارجین واردشده"} value={<MoneyValue value={analysis.margin} />} sub={<QuantityValue value={analysis.margin / collateralPriceUsd} unit={collateralName} />} />
          <Metric label="مارجین آزاد فرضی" value={<MoneyValue value={analysis.capitalRemaining} signed tone="auto" />} />
          <Metric label="بازده کل سرمایه" value={<PercentValue value={analysis.roiCapital} />} />
        </MetricGrid>
      </Surface>
      <Surface className="px-4 md:px-5"><KeyValueList rows={[
        { label: 'تسویه تا سررسید (فرض نرخ ثابت)', value: <MoneyValue value={analysis.preview.expectedSettlementPnl} signed tone="auto" /> },
        { label: 'کارمزد محاسبه‌شده بدون هزینه ورود به بازار', value: <MoneyValue value={analysis.estimatedFees} /> },
        { label: 'نرخ شناور سربه‌سر', value: <PercentValue value={analysis.breakEvenFloating === null ? null : analysis.breakEvenFloating * 100} signed={false} tone="none" /> },
        { label: 'ارزش روز نسبت به ورود', value: <MoneyValue value={analysis.preview.expectedMtm} signed tone="auto" /> },
        { label: 'هزینه کل واردشده', value: <MoneyValue value={analysis.costs} /> },
        { label: 'سناریوی بدبینانه', value: <MoneyValue value={analysis.scenarioMin} signed tone="auto" /> },
        { label: 'سناریوی خوش‌بینانه', value: <MoneyValue value={analysis.scenarioMax} signed tone="auto" /> },
        { label: 'نرخ ضمنی لیکوییدشدن', value: <PercentValue value={analysis.threshold.rate === null ? null : analysis.threshold.rate * 100} signed={false} tone="none" />, hint: 'برآورد تحلیلی برای یک پوزیشن با وثیقه جدا' },
        { label: 'ظرفیت حجم تخمینی بازار', value: <QuantityValue value={analysis.liquidity.available ? analysis.liquidity.estimatedMaxExecutable / collateralPriceUsd : null} unit="واحد بازده" /> },
        { label: 'فاصله مارک تا آستانه', value: <QuantityValue value={analysis.threshold.rate === null ? null : Math.abs(market.markApr - analysis.threshold.rate) * 100} unit="واحد درصد" /> }
      ]} /></Surface>
      <p className="px-1 text-xs leading-6 text-muted">آستانه تحلیلی با کسر هزینه‌های واردشده و وضعیت فعلی محاسبه می‌شود؛ تسویه بعدی، تغییر وثیقه و پوزیشن‌های دیگر لحاظ نشده‌اند. سود دلاری با قیمت فعلی وثیقه است؛ سناریوها بازه اطمینان آماری نیستند. ظرفیت حجم، تأیید اجرای سفارش نیست.</p>
      {analysis.threshold.state === 'unsafe' && <Notice tone="warn">در فرض فعلی، ارزش پوزیشن از مارجین نگهداری کمتر است.</Notice>}
    </>}

    <Surface className="p-4 md:p-5">
      <h3 className="text-sm font-bold">فرصت‌ها با این سرمایه</h3>
      <p className="mt-1 text-xs text-muted">مقایسه با نرخ مارک و هزینه‌های یکسانِ واردشده؛ پیش از ورود، هزینه هر بازار را جدا بررسی کنید.</p>
      {candidates.length === 0 ? <p className="py-4 text-sm text-muted">{completeCosts ? 'فرصت مثبت با داده تازه و سرمایه کافی یافت نشد.' : 'سرمایه، تخصیص و هر سه هزینه را وارد کنید؛ صفر باید صریح وارد شود.'}</p> : <div className="mt-3 divide-y divide-divider">
        {candidates.slice(0, 5).map(c => <button type="button" key={`${c.m.marketId}-${c.direction}`} onClick={() => { setCapitalUnit('usd'); setCollateral(String(capitalUsd)); setNotional(String(Number(c.sizeYu.toFixed(8)))); setMargin(''); setFloating(''); onSelectMarket?.(c.m.marketId, c.direction); }} className="w-full flex items-center justify-between gap-3 py-3 text-start min-w-0">
          <div className="min-w-0"><p className="text-sm font-semibold">{borosAssetName(c.m.asset)} · {borosVenueName(c.m.venue)}</p><p className="mt-1 text-xs text-muted">{c.direction === 'long' ? 'لانگ' : 'شورت'} · {new Date(c.m.maturity * 1000).toLocaleDateString('fa-IR')} · {STATE_FA[c.result.state]}</p></div>
          <span className="shrink-0 text-sm"><MoneyValue value={c.result.net} signed tone="auto" /></span>
        </button>)}
      </div>}
    </Surface>
  </div>;
}

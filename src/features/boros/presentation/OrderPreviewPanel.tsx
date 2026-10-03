import { useBorosPlan } from './useBorosPlan';
import type { PreviewDraft } from '../domain/workflow';
import { quoteUsable } from '../domain/quoteValidity';
import { MarginCalculator } from '../domain/engine/margin';
import { FeeCalculator } from '../domain/engine/fees';
import { previewBudgetRemaining } from '../domain/recommendations';
import { useBorosAccount,refreshBorosAccount,accountIsStale } from '../data/useBorosAccount';
import { accountBudget,type CapitalMode } from '../domain/accountBudget';
import { type EntrySelection } from './VerifiedOpportunities';
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
import { analyzeEntry } from '../domain/entryAnalysis';
import { borosAssetName, borosVenueName } from './borosLabels';
import type { BorosDirection, BorosMarket } from '../domain/types';

const optionalNumber = (s: string) => /^\d+(?:\.\d*)?$|^\.\d+$/.test(s) ? Number(s) : null;
const STATE_FA = { unavailable: 'داده تازه یا بازار فعال در دسترس نیست', incomplete: 'هزینه‌ها را تکمیل کنید', underfunded: 'سرمایه کافی نیست', negative: 'سود پایه مثبت نیست', positive: 'سناریوهای بررسی‌شده مثبت‌اند', conditional: 'فرصت مشروط' };

export function OrderPreviewPanel({ market, direction, fixedRate, underlyingApr, collateralPriceUsd, markets = [], onSelectMarket, initial,entry,draft,active=true,onMarkets }: {
  market: BorosMarket; direction: BorosDirection; fixedRate: number | null; underlyingApr: number; collateralPriceUsd: number;
  entry?:EntrySelection;draft?:PreviewDraft;active?:boolean;onMarkets?:()=>void;
  initial?: { sizeYu: number; capitalUsd: number; feesUsd: number; gasUsd: number; slippageUsd: number };
  markets?: BorosMarket[];
  onSelectMarket?: (marketId: number, direction: BorosDirection,entry?:EntrySelection) => void;
}) {
  const account=useBorosAccount();
  const plan=useBorosPlan();const mode=plan.mode;const setMode=(v:CapitalMode)=>plan.update({mode:v});
  const [marginMode,setMarginMode]=useState(entry?.marginMode??'cross');const risk=plan.risk;const setRisk=(v:string)=>plan.update({risk:v});
  useEffect(()=>{if(active&&market.tokenId!==undefined)plan.update({selected:String(market.tokenId)});},[active,market.tokenId]);
  const budget=accountBudget(account.data,accountIsStale(account),market,marginMode);
  useEffect(()=>{if(mode!=='real'||!active)return;const refresh=()=>{if(document.visibilityState==='visible')void refreshBorosAccount();};refresh();const t=setInterval(refresh,30000);return()=>clearInterval(t);},[mode,active]);
  const [notional, setNotional] = useState(entry?String(entry.sizeYu):draft?String(draft.sizeYu):initial ? String(initial.sizeYu) : '2');
  const [quote,setQuote]=useState<OfficialPreview|null>(entry?.quote??null);
  const quoteScope=useRef(entry?entry.identity+':'+entry.marginMode:'');
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
  const quoted=quoteUsable(quote,quote?.handle===budget.handle&&quoteScope.current===budget.identity+':'+marginMode,mode==='real'&&budget.available,market.marketId,direction,Number(notional),market.maturity,now)?quote:null;
  const effectiveRate=quoted?.matchedApr??fixedRate;
  const officialMarginUsd=quoted?.margin!=null&&budget.currentMargin!==null&&budget.price!==null?Math.max(0,quoted.margin-budget.currentMargin)*budget.price:null;

  const collateral=plan.capital;const setCollateral=(v:string)=>plan.update({capital:v});
  const capitalUnit=plan.capitalUnit;const setCapitalUnit=(v:string)=>plan.update({capitalUnit:v as 'usd'|'asset'});
  const gas=plan.gas;const setGas=(v:string)=>plan.update({gas:v});
  const [slippage, setSlippage] = useState(entry?String(entry.costs.slippageUsd??''):draft?String(draft.costs.slippageUsd??''):initial ? String(initial.slippageUsd) : '0');
  const extraFeeForEntry=(e:EntrySelection)=>e.extraEntranceUsd??(e.costs.feesUsd===null?'':Math.max(0,e.costs.feesUsd-FeeCalculator.calc({m:market,size:e.sizeYu,unitPriceUsd:collateralPriceUsd,nowSec:Math.floor(e.quote.fetchedAt/1000)}).total));
  const fees=plan.entrance;const setFees=(v:string)=>plan.update({entrance:v});
  useEffect(()=>{if(draft){setMode(draft.mode);setNotional(String(draft.sizeYu));setGas(String(draft.costs.gasUsd??''));setFees(String(draft.costs.feesUsd??''));if(draft.mode==='hypothetical'){setCapitalUnit('usd');setCollateral(String(draft.capitalUsd));}}else if(initial){setMode('hypothetical');setCapitalUnit('usd');setCollateral(String(initial.capitalUsd));setGas(String(initial.gasUsd));setFees(String(Math.max(0,initial.feesUsd-FeeCalculator.calc({m:market,size:initial.sizeYu,unitPriceUsd:collateralPriceUsd,nowSec:Math.floor(Date.now()/1000)}).total)));}},[draft,initial]);
  const [margin, setMargin] = useState('');
  const allocation=plan.allocation;const setAllocation=(v:string)=>plan.update({allocation:v});
  const [floating, setFloating] = useState('');
  useEffect(()=>{if(!entry)return;setMode('real');setMarginMode(entry.marginMode);setNotional(String(entry.sizeYu));quoteScope.current=entry.identity+':'+entry.marginMode;setQuote(entry.quote);setGas(String(entry.costs.gasUsd??''));setFees(String(extraFeeForEntry(entry)));setSlippage(String(entry.costs.slippageUsd??''));},[entry]);
  const collateralName = assetDisplayName(market.collateralSymbol ?? market.asset).name;
  const manualCapitalUsd = (optionalNumber(collateral) ?? 0) * (capitalUnit === 'asset' ? collateralPriceUsd : 1);
  const capitalUsd=mode==='real'?(budget.budgetUsd??0):manualCapitalUsd;
  const previousSymbol = useRef(market.collateralSymbol);
  useEffect(() => {
    if (previousSymbol.current !== market.collateralSymbol && capitalUnit === 'asset') setCollateral('');
    previousSymbol.current = market.collateralSymbol;
  }, [market.collateralSymbol, capitalUnit]);
  const protocolFees=FeeCalculator.calc({m:market,size:optionalNumber(notional)??0,unitPriceUsd:collateralPriceUsd,nowSec:Math.floor(now/1000)});
  const additionalFee=optionalNumber(fees);
  const costInputs = { gasUsd: optionalNumber(gas), feesUsd: additionalFee===null?null:additionalFee+protocolFees.total, slippageUsd: optionalNumber(slippage) };
  const completeCosts = Object.values(costInputs).every(v => v !== null);
  const costsSum = Object.values(costInputs).reduce<number>((a, v) => a + (v ?? 0), 0);

  const assumedFloating = floating.trim() === '' ? underlyingApr : /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(floating) ? Number(floating) / 100 : NaN;
  const analysis = useMemo(() => analyzeEntry({ m: market, direction, sizeYu: optionalNumber(notional) ?? 0, capitalUsd, entryRate: effectiveRate ?? market.markApr, floatingRate: assumedFloating, ...costInputs, nowSec:Math.floor(now/1000), marginUsd: mode==='real'||margin === '' ? null : optionalNumber(margin) ?? NaN }), [market, direction, notional, capitalUsd, effectiveRate, assumedFloating, gas, fees, slippage, margin, mode,now]);
  const officialRemaining=officialMarginUsd!==null&&completeCosts&&analysis?previewBudgetRemaining(capitalUsd,officialMarginUsd,costsSum,analysis.preview.expectedMtm):null;
  usePublishInsight('borosEntry', `${mode==='real'?'بودجهٔ واقعی':'سرمایهٔ فرضی'} · ${borosAssetName(market.asset)} · ${borosVenueName(market.venue)} · ${direction === 'long' ? 'لانگ' : 'شورت'}`, analysis ? { realAccountBudget:Number(mode==='real'), marketId: market.marketId, capitalUsd, sizeYu: optionalNumber(notional), entryApr: effectiveRate ?? market.markApr, floatingApr: assumedFloating, marginRequiredUsd: officialMarginUsd??analysis.margin, feesUsd: costInputs.feesUsd, quoteVerified:Number(!!quoted), liquidationApr:quoted?.liquidationApr??null, payApr:direction==='long'?(effectiveRate??market.markApr):assumedFloating, receiveApr:direction==='long'?assumedFloating:(effectiveRate??market.markApr), gasUsd: costInputs.gasUsd, slippageUsd: costInputs.slippageUsd, projectedNetUsd: analysis.net, capitalRemainingUsd: officialRemaining??analysis.capitalRemaining, adverseNetUsd: analysis.scenarioMin, favorableNetUsd: analysis.scenarioMax, breakEvenFloatingApr: analysis.breakEvenFloating, roiCapitalPct: analysis.roiCapital } : null, 'simulation', analysis?.state === 'unavailable' ? 'stale' : analysis?.state === 'incomplete' ? 'partial' : 'ready',mode==='real'?account.data?.syncedAt??undefined:undefined,mode==='real'?budget.scope:undefined);
  const autoSize = () => {
    const pct=optionalNumber(allocation)??0;
    if(pct<=0||pct>100||!completeCosts)return;
    const fraction=pct/100,time=Math.floor(Date.now()/1000);
    const perMargin=Math.max(MarginCalculator.calcMarket(market,1,effectiveRate??market.markApr,time),MarginCalculator.calcMarket(market,1,market.markApr,time))*collateralPriceUsd;
    const perFees=FeeCalculator.calc({m:market,size:1,unitPriceUsd:collateralPriceUsd,nowSec:time}).total;
    const size=fraction*Math.max(0,capitalUsd-(additionalFee??0)-(costInputs.gasUsd??0)-(costInputs.slippageUsd??0))/(perMargin+fraction*perFees);
    if (size != null && size > 0) { setNotional(String(Number(size.toFixed(8)))); setMargin(''); }
  };
  const field = (label: string, value: string, setValue: (v: string) => void, suffix: string, placeholder?: string) => <Field label={label}><Input dir="ltr" inputMode="decimal" value={value} onChange={e => setValue(normalizeDecimalInput(e.target.value))} suffix={suffix} placeholder={placeholder} /></Field>;

  return <div className="space-y-4">
    <Surface className="p-3 space-y-3"><div className="grid grid-cols-2 gap-2" role="group" aria-label="مبنای سرمایه بوروس"><Button size="sm" variant={mode==='real'?'primary':'outline'} onClick={()=>{setMode('real');setQuote(null);setMargin('');}}>حساب واقعی</Button><Button size="sm" variant={mode==='hypothetical'?'primary':'outline'} onClick={()=>{setMode('hypothetical');setQuote(null);setMargin('');}}>سناریوی فرضی</Button></div>{mode==='real'?<div className="space-y-2"><div className="flex flex-wrap justify-between gap-2 text-sm"><span>موجودی آزاد برای معامله <span dir="ltr" className="text-xs text-muted">Available to Trade</span></span><div className="flex flex-col items-end gap-1"><QuantityValue value={budget.freeCollateral} unit={collateralName}/><span className="text-xs text-muted"><MoneyValue value={budget.budgetUsd}/></span></div></div><Button size="sm" variant="ghost" onClick={()=>void refreshBorosAccount(true)} disabled={account.loading}>تازه‌سازی حساب</Button>{!budget.available&&<Notice tone="warn">حساب را متصل یا تازه‌سازی کنید؛ بودجهٔ فرضی جایگزین موجودی واقعی نمی‌شود.</Notice>}<p className="text-xs text-muted">بودجه با برداشت و تغییر حساب به‌روز می‌شود؛ سود آینده برآورد است.</p></div>:<p className="text-xs text-muted">سرمایهٔ دستی مستقل از موجودی بوروس؛ برداشت، این سناریو را تغییر نمی‌دهد.</p>}</Surface>
    <Surface className="p-4 md:p-5 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {field('حجم واحد بازده', notional, setNotional, '')}
        {mode==='hypothetical'&&field(capitalUnit === 'asset' ? 'وثیقه موجود' : 'سرمایه', collateral, setCollateral, capitalUnit === 'asset' ? collateralName : 'دلار')}
        {mode==='hypothetical'&&<Field label="واحد سرمایه"><Select value={capitalUnit} onChange={e => { setCollateral(''); setCapitalUnit(e.target.value); }}><option value="asset">{collateralName}</option><option value="usd">دلار</option></Select></Field>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted">{direction === 'long' ? 'لانگ' : 'شورت'} · نرخ ورود <PercentValue value={(effectiveRate ?? market.markApr) * 100} signed={false} tone="none" /></span>
        <Button size="sm" variant="outline" onClick={autoSize} disabled={!completeCosts || capitalUsd <= 0}>محاسبه حجم با سرمایه</Button>
      </div>
      <Disclosure summary="هزینه‌ها و فرض‌های سناریو">
        <div className="grid gap-4 sm:grid-cols-2 py-3">
          {field('هزینهٔ ورود اضافی', fees, setFees, 'دلار', 'اگر پرداخت نمی‌شود: صفر')}
          {field('گس کل دوره', gas, setGas, 'دلار', 'هزینهٔ ورود و برداشت')}
          {field('هزینهٔ اضافی خارج از نرخ اجرا', slippage, setSlippage, 'دلار', 'لغزش نرخ را دوباره وارد نکنید')}
          {field('نرخ شناور فرضی', floating, setFloating, '٪', String(Number((underlyingApr * 100).toFixed(3))))}
          {field('تخصیص مارجین', allocation, setAllocation, '٪')}
          {field('حد زیان سناریوی نامساعد',risk,setRisk,'٪ سرمایه')}
          {mode==='hypothetical'&&field('مارجین اعلام‌شده در بوروس', margin, setMargin, 'دلار', 'اختیاری')}
        </div>
        <p className="pb-2 text-xs leading-6 text-muted">کارمزد معامله و تسویه خودکار محاسبه می‌شود. هزینهٔ ورود اضافی و گس را مشخص کنید؛ صفر را فقط در صورت نبود هزینه وارد کنید. حد زیان، فیلتر پیشنهادهاست و سفارش توقف زیان نیست.</p>
      </Disclosure>
    </Surface>

    {mode==='real'&&<OfficialPreviewPanel appliedQuote={quoted} marginMode={marginMode} onMarginMode={v=>{setMarginMode(v);setQuote(null);}} market={market} direction={direction} size={notional} onApply={p=>{quoteScope.current=budget.identity+':'+marginMode;setQuote(p);setNotional(String(p.matchedSize));}} />}
    {quote&&!quoted&&<Notice tone="stale">پیش‌نمایش قبلی اعتبار ندارد؛ پس از تغییر موجودی، حجم یا گذشت یک دقیقه قیمت را تازه‌سازی کنید.</Notice>}
    {quoted&&<p className="text-xs text-muted px-1">نرخ اجرای رسمی در محاسبه استفاده شد؛ این پیش‌نمایش معاملهٔ بازشده نیست.</p>}

    {completeCosts&&(officialRemaining!==null?officialRemaining<0:analysis?.state==='underfunded')&&<Notice tone="warn">بودجه پس از مارجین و هزینه‌ها کافی نیست؛ حجم یا هزینه‌ها را بازبینی کنید.</Notice>}
    {mode==='hypothetical'&&analysis&&<Surface className="p-4 space-y-4"><h3 className="text-sm font-bold">پیش‌نمایش فرضی · مستقل از حساب</h3><MetricGrid cols={2}><Metric label={direction==='long'?'پرداخت ثابت · Pay Fixed':'پرداخت شناور · Pay Floating'} value={<PercentValue value={(direction==='long'?analysis.preview.fixedApr:assumedFloating)*100} tone="none"/>}/><Metric label={direction==='long'?'دریافت شناور · Receive Floating':'دریافت ثابت · Receive Fixed'} value={<PercentValue value={(direction==='long'?assumedFloating:analysis.preview.fixedApr)*100} tone="none"/>}/><Metric label="حساسیت به تغییر ۱ واحد درصد نرخ" value={<QuantityValue value={analysis.preview.rateSensitivityAsset} unit={collateralName}/>} sub={<MoneyValue value={analysis.preview.rateSensitivityUsd}/>}/><Metric label="نرخ لیکوییدشدن · تخمین تک‌پوزیشن" value={<PercentValue value={analysis.threshold.rate===null?null:analysis.threshold.rate*100} tone="none"/>}/></MetricGrid></Surface>}
    {!analysis ? <EmptyState message={mode==='real'?budget.available?'مارجین آزاد این وثیقه کافی نیست یا حجم معتبر نیست.':'دادهٔ تازهٔ حساب لازم است.':'سرمایه و حجم معتبر وارد کنید.'} /> : <>
      <Surface variant="focal" className="p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-semibold text-muted">{analysis.net===null?'تسویهٔ تخمینی قبل از هزینه‌ها':analysis.net<0?'زیان تخمینی تا سررسید':'سود تخمینی تا سررسید'}</p><p className="mt-2 text-3xl font-bold"><MoneyValue value={analysis.net??analysis.preview.expectedSettlementPnl} signed tone="auto" /></p></div>
          <Badge tone={analysis.state === 'positive' ? 'gain' : analysis.state === 'negative' || analysis.state === 'underfunded' ? 'loss' : 'neutral'}>{quoted?'نرخ اجرای رسمی':mode==='real'?'نرخ ورود فرضی':STATE_FA[analysis.state]}</Badge>
        </div>
        <p className="mt-3 text-xs leading-6 text-muted">با فرض ثابت‌ماندن نرخ شناور و قیمت وثیقه تا سررسید؛ سود و زیان فعلی حساب نیست.{!completeCosts?' برای نتیجهٔ خالص، هزینه‌ها را تکمیل کنید.':''}{mode==='real'&&!quoted?' نرخ ورود فعلاً فرضی است؛ قیمت رسمی را دریافت کنید.':''}</p>
        <MetricGrid cols={3} className="mt-5 border-t border-divider pt-4">
          <Metric label={officialMarginUsd!==null?"مارجین افزوده · API":margin === '' ? "مارجین تخمینی" : "مارجین واردشده"} value={<MoneyValue value={officialMarginUsd??analysis.margin} />} sub={<QuantityValue value={(officialMarginUsd??analysis.margin) / collateralPriceUsd} unit={collateralName} />} />
          <Metric label={mode==='real'?'ماندهٔ بودجهٔ برآوردی':'مارجین آزاد فرضی'} value={<MoneyValue value={officialRemaining??analysis.capitalRemaining} signed tone="auto" />} />
          <Metric label="بازده کل سرمایه" value={<PercentValue value={analysis.roiCapital} />} />
        </MetricGrid>
      </Surface>
      <Disclosure summary="این عدد چگونه حساب شد؟"><Surface className="px-4 md:px-5"><KeyValueList rows={[
        { label: 'تسویه تا سررسید (فرض نرخ ثابت)', value: <MoneyValue value={analysis.preview.expectedSettlementPnl} signed tone="auto" /> },
        { label: 'کارمزد معامله · محاسبه از داده بازار', value: <MoneyValue value={protocolFees.entryFee} /> },
        { label: 'کارمزد تسویه تا سررسید · تخمینی', value: <MoneyValue value={protocolFees.settlementCost} /> },
        { label: 'هزینهٔ ورود اضافی · ورودی شما', value: <MoneyValue value={additionalFee} /> },
        { label: 'گس کل دوره · ورودی شما', value: <MoneyValue value={costInputs.gasUsd} /> },
        { label: 'هزینهٔ اضافی خارج از نرخ اجرا · ورودی شما', value: <MoneyValue value={costInputs.slippageUsd} /> },
        { label: 'حجم استفاده‌شده', value: <QuantityValue value={Number(notional)} unit="واحد بازده"/> },
        { label: 'نرخ پرداخت', value: <PercentValue value={(direction==='long'?(effectiveRate??market.markApr):assumedFloating)*100} tone="none"/> },
        { label: 'نرخ دریافت', value: <PercentValue value={(direction==='long'?assumedFloating:(effectiveRate??market.markApr))*100} tone="none"/> },
        { label: 'مدت تا سررسید', value: <QuantityValue value={analysis.preview.daysToMaturity} digits={1} unit="روز"/> },
        { label: 'منبع نرخ ورود', value: quoted?'پیش‌نمایش رسمی بوروس':'فرض نرخ ورود' },
        { label: 'زمان دریافت نرخ', value: quoted?.fetchedAt||market.snapshotAt?new Date(quoted?.fetchedAt??market.snapshotAt!).toLocaleString('fa-IR'):'نامشخص' },
        { label: 'کارمزد محاسبه‌شده بدون هزینه ورود به بازار', value: <MoneyValue value={analysis.estimatedFees} /> },
        { label: 'نرخ شناور سربه‌سر', value: <PercentValue value={analysis.breakEvenFloating === null ? null : analysis.breakEvenFloating * 100} signed={false} tone="none" /> },
        { label: 'ارزش روز نسبت به ورود', value: <MoneyValue value={analysis.preview.expectedMtm} signed tone="auto" /> },
        { label: 'هزینه کل واردشده', value: <MoneyValue value={analysis.costs} /> },
        { label: 'سناریوی بدبینانه', value: <MoneyValue value={analysis.scenarioMin} signed tone="auto" /> },
        { label: 'سناریوی خوش‌بینانه', value: <MoneyValue value={analysis.scenarioMax} signed tone="auto" /> },
        { label: 'نرخ ضمنی لیکوییدشدن', value: <PercentValue value={mode==='real'?(quoted?.liquidationApr==null?null:quoted.liquidationApr*100):analysis.threshold.rate === null ? null : analysis.threshold.rate * 100} signed={false} tone="none" />, hint: mode==='real'?'فقط پاسخ پیش‌نمایش رسمی حساب':'برآورد تحلیلی برای یک پوزیشن با وثیقه جدا' },
        { label: 'ظرفیت حجم تخمینی بازار', value: <QuantityValue value={analysis.liquidity.available ? analysis.liquidity.estimatedMaxExecutable / collateralPriceUsd : null} unit="واحد بازده" /> },
        { label: 'فاصله مارک تا آستانه', value: <QuantityValue value={mode==='real'?quoted?.liquidationApr==null?null:Math.abs(market.markApr-quoted.liquidationApr)*100:analysis.threshold.rate === null ? null : Math.abs(market.markApr - analysis.threshold.rate) * 100} unit="واحد درصد" /> }
      ]} /></Surface>
      <p className="px-1 text-xs leading-6 text-muted">آستانه تحلیلی با کسر هزینه‌های واردشده و وضعیت فعلی محاسبه می‌شود؛ تسویه بعدی، تغییر وثیقه و پوزیشن‌های دیگر لحاظ نشده‌اند. سود دلاری با قیمت فعلی وثیقه است؛ سناریوها بازه اطمینان آماری نیستند. ظرفیت حجم، تأیید اجرای سفارش نیست.</p>
      </Disclosure>
      {completeCosts&&(officialRemaining!==null?officialRemaining<0:analysis?.state==='underfunded')&&<Notice tone="warn">بودجه پس از مارجین و هزینه‌ها کافی نیست؛ حجم یا هزینه‌ها را بازبینی کنید.</Notice>}
    {mode==='hypothetical'&&analysis.threshold.state === 'unsafe' && <Notice tone="warn">در فرض فعلی، ارزش پوزیشن از مارجین نگهداری کمتر است.</Notice>}
    </>}

    {onMarkets&&<Button size="sm" variant="outline" onClick={onMarkets}>بازگشت به بازارها و پیشنهادها</Button>}
  </div>;
}

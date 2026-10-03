import {useBorosAccount} from '../data/useBorosAccount';
import {accountAnalysisScope} from '../domain/accountBudget';
import {useAssistantInsights} from '@/shared/assistant/insights';
import { useEffect, useState } from 'react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Metric, MetricGrid, MoneyValue, PercentValue,QuantityValue } from '@/shared/components/ui/FinancialValue';
import { Button } from '@/shared/components/ui/Button';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Notice } from '@/shared/components/ui/StateViews';
import { compareWithBudget,type PreviewDraft } from '../domain/workflow';
import type { EntryCosts } from '../domain/recommendations';
import type { BorosDirection, BorosMarket } from '../domain/types';
import { borosAssetName, borosVenueName } from './borosLabels';
import { MarketIdentity } from './MarketIdentity';
import { MarketWarnings } from './MarketWarnings';
export function ComparisonTab({markets,capitalUsd,allocationPct,costs,mode,onInspect,active=true}:{markets:BorosMarket[];capitalUsd:number;allocationPct:number;costs:EntryCosts;mode:'real'|'hypothetical';active?:boolean;onInspect:(marketId:number,direction:BorosDirection,draft:PreviewDraft)=>void}){
 const account=useBorosAccount();
 const [direction,setDirection]=useState<BorosDirection>('long');
 const packed=JSON.stringify(markets.map(m=>{const r=compareWithBudget(m,direction,capitalUsd,allocationPct,costs);return {name:`مقایسه · ${borosAssetName(m.asset)} · ${borosVenueName(m.venue)} · ${direction==='long'?'لانگ':'شورت'}`,kind:'borosComparison',source:'simulation' as const,status:!r||r.result.state==='unavailable'?'stale' as const:'partial' as const,asOf:m.snapshotAt??null,metrics:{marketId:m.marketId,realAccountBudget:Number(mode==='real'),capitalUsd,sizeYu:r?.sizeYu??null,quoteVerified:0,entryApr:m.markApr,floatingApr:m.floatingApr,projectedNetUsd:r?.result.net??null,adverseNetUsd:r?.result.scenarioMin??null,marginUsd:r?.result.margin??null,costsUsd:r?.result.costs??null,daysToMaturity:r?.result.preview.daysToMaturity??null,alternatives:1}};}));
 const scope=mode==='real'?accountAnalysisScope(account.data):undefined;
 useEffect(()=>{if(active)useAssistantInsights.getState().put('borosComparison',JSON.parse(packed),scope);},[packed,scope,active]);
 return <Surface className="p-4 space-y-4"><h3 className="font-bold">مقایسهٔ گزینه‌های انتخاب‌شده</h3><p className="text-xs leading-6 text-muted">بودجه و هزینه‌ها یکسان‌اند؛ حجم قرارداد هر بازار جدا محاسبه می‌شود. نرخ ورود فعلاً مارک است؛ قیمت رسمی نیست.</p><SegmentedControl label="جهت مقایسه" fill value={direction} onChange={setDirection} options={[{value:'long',label:'لانگ نرخ'},{value:'short',label:'شورت نرخ'}]}/>
 <div className="grid gap-3 xl:grid-cols-3">{markets.map(m=>{const row=compareWithBudget(m,direction,capitalUsd,allocationPct,costs);return <article key={m.marketId} className="min-w-0 rounded-2xl border border-divider p-3 space-y-3"><MarketIdentity market={m} compact/><MarketWarnings market={m}/>{!row?<Notice tone="warn">بودجه و هزینه‌های معتبر یا دادهٔ کافی برای این بازار لازم است.</Notice>:<><MetricGrid cols={2}><Metric size="sm" label="تا سررسید" value={<QuantityValue value={row.result.preview.daysToMaturity} digits={1} unit="روز"/>}/><Metric size="sm" label="حجم قرارداد" value={<QuantityValue value={row.sizeYu} digits={4} unit="واحد بازده"/>}/><Metric size="sm" label="پرداخت" value={<PercentValue value={(direction==='long'?m.markApr:m.floatingApr)*100} tone="none"/>}/><Metric size="sm" label="دریافت" value={<PercentValue value={(direction==='long'?m.floatingApr:m.markApr)*100} tone="none"/>}/><Metric size="sm" label="مارجین تخمینی" value={<MoneyValue value={row.result.margin}/>}/><Metric size="sm" label="هزینهٔ تخمینی کل" value={<MoneyValue value={row.result.costs}/>}/><Metric size="sm" label="خالص تخمینی تا سررسید" value={<MoneyValue value={row.result.net} signed tone="auto"/>}/><Metric size="sm" label="سناریوی نامساعد" value={<MoneyValue value={row.result.scenarioMin} signed tone="auto"/>}/></MetricGrid><p className="text-xs text-muted">با فرض ثابت‌ماندن نرخ شناور و قیمت وثیقه؛ آستانهٔ رسمی لیکوییدشدن هنوز دریافت نشده است.</p><Button size="sm" variant="outline" className="w-full" disabled={row.result.state==='unavailable'} onClick={()=>onInspect(m.marketId,direction,{mode,capitalUsd,sizeYu:row.sizeYu,costs})}>پیش‌نمایش همین حجم</Button></>}</article>;})}</div></Surface>;
}

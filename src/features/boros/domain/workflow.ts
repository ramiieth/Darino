import type { EntryCosts } from './recommendations';
import type { BorosDirection, BorosMarket } from './types';
import { MarginCalculator } from './engine/margin';
import { FeeCalculator } from './engine/fees';
import { analyzeEntry } from './entryAnalysis';
import { recommendationCosts } from './recommendations';
export type PreviewDraft={mode:'real'|'hypothetical';capitalUsd:number;sizeYu:number;costs:EntryCosts};
/** Compare alternatives using one collateral budget and one cost policy, not equal notional. */
export function compareWithBudget(m:BorosMarket,direction:BorosDirection,capitalUsd:number,allocationPct:number,costs:EntryCosts,nowSec=Math.floor(Date.now()/1000)){
 const price=m.collateralPriceUsd;
 if(!price||price<=0||!Number.isFinite(capitalUsd)||capitalUsd<=0||!Number.isFinite(allocationPct)||allocationPct<=0||allocationPct>100||m.status!=='GOOD'||m.maturity<=nowSec||!m.isUiWhitelisted||Object.values(costs).some(v=>v===null||!Number.isFinite(v)||v<0))return null;
 const fraction=allocationPct/100;
 const perMargin=MarginCalculator.calcMarket(m,1,m.markApr,nowSec)*price;
 const perFees=FeeCalculator.calc({m,size:1,unitPriceUsd:price,nowSec}).total;
 const sizeYu=fraction*(capitalUsd-costs.feesUsd!-costs.gasUsd!-costs.slippageUsd!)/(perMargin+fraction*perFees);
 if(!Number.isFinite(sizeYu)||sizeYu<=0)return null;
 const result=analyzeEntry({m,direction,sizeYu,capitalUsd,entryRate:m.markApr,floatingRate:m.floatingApr,...recommendationCosts(m,sizeYu,costs,true,nowSec),nowSec});
 return result?{m,direction,sizeYu,result}:null;
}
export type MarketWarning={tone:'warn'|'stale';text:string};
/** Indicators, never a liquidation probability or an execution guarantee. */
export function marketWarnings(m:BorosMarket,now=Date.now()):MarketWarning[]{
 if(m.snapshotAt==null||now-m.snapshotAt>300_000||now<m.snapshotAt-60_000)return[{tone:'stale',text:'دادهٔ بازار تازه نیست؛ بررسی مجدد لازم است'}];
 const out:MarketWarning[]=[];
 if(m.dailyVolatility===null||!Number.isFinite(m.dailyVolatility))out.push({tone:'stale',text:'دادهٔ نوسان در دسترس نیست'});
 else if(m.dailyVolatility>.015)out.push({tone:'warn',text:'نوسان نرخ بالاست'});
 if(![m.volume24h,m.notionalOI,m.bestBid,m.bestAsk].every(Number.isFinite)||m.volume24h<=0||m.notionalOI<=0||m.bestAsk<m.bestBid)out.push({tone:'stale',text:'نقدشوندگی تأیید نشده است'});
 else if(m.volume24h/m.notionalOI<.01)out.push({tone:'warn',text:'گردش معاملات پایین است؛ اجرای حجم را بررسی کنید'});
 if(m.maturity*1000-now<=3*86400000)out.push({tone:'warn',text:'سررسید نزدیک است'});
 return out;
}

import { useState } from 'react';
import { LogoImage,safeLogoSrc } from '@/shared/components/ui/EntityLogo';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { ASSET_NAME_FA } from '@/shared/i18n/assetDisplayName';
import { persianTicker } from '@/shared/domain/yieldTokenIdentity';
import lighterLogos from '../domain/lighterLogoSeed.json';
const names:Record<string,string>={
 USO:'صندوق نفت آمریکا',WTI:'نفت وست تگزاس',BRENT:'نفت برنت',NATGAS:'گاز طبیعی',COPPER:'مس',GLD:'صندوق طلا',SLV:'صندوق نقره',
 LIT:'لایتر',ANTHROPIC:'آنتروپیک',OPENAI:'اوپن‌ای‌آی',SPCX:'اسپیس‌اکس',SMCI:'سوپر مایکرو',IREN:'آیرن',LUNR:'اینتویتیو ماشینز',BABA:'علی‌بابا',MU:'مایکرون',SKHY:'اس‌کی هاینیکس',SKHYNIX:'اس‌کی هاینیکس',VVV:'ونیس',CRCL:'سرکل',SOXL:'صندوق نیمه‌رسانا سه‌برابر',AI:'سی‌تری ای‌آی',SHEIN:'شین',ORCL:'اوراکل',SOFI:'سوفای',SNDK:'سندیسک',QBTS:'دی‌ویو',ASTS:'ای‌اس‌تی اسپیس‌موبایل',BE:'بلوم انرژی',CASHCAT:'کش‌کت',TSM:'نیمه‌رسانای تایوان',CRWV:'کورویو',USELESS:'یوزلس',CLSK:'کلین‌اسپارک',SGOV:'صندوق اوراق خزانهٔ کوتاه‌مدت',WULF:'تراولف',PONS:'پونز',RGTI:'ریگتی',AMC:'ای‌ام‌سی',USAR:'یو‌اس‌ای رِر ارث',ANSEM:'انسم',PUMP:'پامپ',
 ADBE:'ادوبی',ARM:'آرم',AVGO:'برادکام',BB:'بلک‌بری',BMNR:'بیت‌ماین',CBRS:'سربراس',CELH:'سلسیوس',CXMT:'چانگ‌شین',DKNG:'درفت‌کینگز',GLW:'کورنینگ',HOOD:'رابین‌هود',IBM:'آی‌بی‌ام',LITE:'لومنتوم',MINIMAX:'مینی‌مکس',MRNA:'مدرنا',MRVL:'مارول',NBIS:'نبیوس',NOK:'نوکیا',OKLO:'اوکلو',PURR:'هایپرلیکویید استراتژیز',RDDT:'ردیت',SMSN:'سامسونگ',TTWO:'تیک‌تو',UNITREE:'یونیتری',ZHIPU:'ژیپو',DRAM:'صندوق حافظهٔ راند‌هیل',EWY:'صندوق کرهٔ جنوبی',KORU:'صندوق کرهٔ جنوبی سه‌برابر',URNM:'صندوق معدن‌کاران اورانیوم',IBB:'صندوق زیست‌فناوری',US100:'شاخص آمریکا ۱۰۰',US500:'شاخص آمریکا ۵۰۰',VXX:'شاخص نوسان کوتاه‌مدت',USDJPY:'دلار آمریکا / ین ژاپن',EURUSD:'یورو / دلار آمریکا'
};
export const marketBase=(symbol:string)=>symbol.split(/[-/]/)[0].replace(/\.P$/i,'');
export function marketAssetName(symbol:string){const base=marketBase(symbol);return names[base]??ASSET_NAME_FA[base]??persianTicker(base);}
export function MarketAssetLogo({symbol,logo,size=32}:{symbol:string;logo?:string|null;size?:number}){
 const base=marketBase(symbol),[failed,setFailed]=useState<string|null>(null);
 const url=safeLogoSrc(logo)??(lighterLogos as Record<string,string>)[base]??safeLogoSrc(`https://assets.lighter.xyz/fe/token/${base.toLowerCase()}.png`);
 return url&&failed!==url?<span className="inline-flex shrink-0 overflow-hidden rounded-full bg-white" style={{width:size,height:size}}><img src={url} alt={marketAssetName(symbol)} width={size} height={size} loading="lazy" referrerPolicy="no-referrer" className="object-contain" onError={()=>setFailed(url)}/></span>:<AssetLogo fallbackLabel={marketAssetName(symbol)} symbol={base} kind={ASSET_NAME_FA[base]&&['BTC','ETH','SOL','HYPE','XRP','SUI','ZEC','NEAR','ENA','ONDO'].includes(base)?'crypto':'tradfi'} size={size}/>;
}
export function MarketAssetIdentity({symbol,logo,robinhood=false}:{symbol:string;logo?:string|null;robinhood?:boolean}){
 return <div className="flex min-w-0 items-center gap-3"><span className="relative shrink-0"><MarketAssetLogo symbol={symbol} logo={logo}/>{robinhood&&<span className="absolute -bottom-1 -end-1 rounded-full bg-card p-px"><LogoImage src="/logos/chain-4663.svg" label="رابین‌هود" size={15}/></span>}</span><div className="min-w-0"><p className="font-semibold">{marketAssetName(symbol)}</p>{marketAssetName(symbol)!==persianTicker(symbol)&&<p dir="rtl" title={symbol} className="mt-1 text-xs text-muted">{persianTicker(symbol)}</p>}</div></div>;
}

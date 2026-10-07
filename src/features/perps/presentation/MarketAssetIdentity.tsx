import { useState } from 'react';
import { LogoImage,safeLogoSrc } from '@/shared/components/ui/EntityLogo';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { ASSET_NAME_FA } from '@/shared/i18n/assetDisplayName';
import { persianTicker } from '@/shared/domain/yieldTokenIdentity';
import lighterLogos from '../domain/lighterLogoSeed.json';
export {marketBase,marketAssetName} from '../domain/marketNames';
import {marketBase,marketAssetName} from '../domain/marketNames';
export function MarketAssetLogo({symbol,logo,size=32}:{symbol:string;logo?:string|null;size?:number}){
 const base=marketBase(symbol),[failed,setFailed]=useState<string|null>(null);
 const url=safeLogoSrc(logo)??(lighterLogos as Record<string,string>)[base]??safeLogoSrc(`https://assets.lighter.xyz/fe/token/${base.toLowerCase()}.png`);
 return url&&failed!==url?<span className="inline-flex shrink-0 overflow-hidden rounded-full bg-white" style={{width:size,height:size}}><img src={url} alt={marketAssetName(symbol)} width={size} height={size} loading="lazy" referrerPolicy="no-referrer" className="object-contain" onError={()=>setFailed(url)}/></span>:<AssetLogo fallbackLabel={marketAssetName(symbol)} symbol={base} kind={ASSET_NAME_FA[base]&&['BTC','ETH','SOL','HYPE','XRP','SUI','ZEC','NEAR','ENA','ONDO'].includes(base)?'crypto':'tradfi'} size={size}/>;
}
export function MarketAssetIdentity({symbol,name,logo,robinhood=false}:{symbol:string;name?:string;logo?:string|null;robinhood?:boolean}){
 return <div className="flex min-w-0 items-center gap-3"><span className="relative shrink-0"><MarketAssetLogo symbol={symbol} logo={logo}/>{robinhood&&<span className="absolute -bottom-1 -end-1 rounded-full bg-card p-px"><LogoImage src="/logos/chain-4663.svg" label="رابین‌هود" size={15}/></span>}</span><div className="min-w-0"><p className="break-words font-semibold" dir="auto">{marketAssetName(symbol,name)}</p>{marketAssetName(symbol,name)!==persianTicker(symbol)&&<p dir="rtl" title={symbol} className="mt-1 text-xs text-muted">{persianTicker(symbol)}</p>}</div></div>;
}

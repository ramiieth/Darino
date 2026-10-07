import { safeLogoSrc } from '../lib/logoSources.js';
export interface PendleLogo {chainId:number;contract:string;kind:'YT'|'PT'|'LP';logo:string;underlying:string}
export function pendleMarketLogos(rows:unknown[]):PendleLogo[] {
 return rows.flatMap(value=>{
  const m=value as Record<string,unknown>;if(!m||typeof m!=='object')return [];
  const chainId=Number(m.chainId),logo=safeLogoSrc(typeof m.icon==='string'?m.icon:null);
  if(!Number.isSafeInteger(chainId)||chainId<=0||!logo)return [];
  return (['YT','PT','LP'] as const).flatMap(kind=>{
   const raw=String(kind==='LP'?m.address:m[kind.toLowerCase()]??'');
   const contract=raw.replace(new RegExp('^'+chainId+'-'),'').toLowerCase();
   return /^0x[a-f0-9]{40}$/.test(contract)?[{chainId,contract,kind,logo,underlying:String(m.name??'')}]:[];
  });
 });
}

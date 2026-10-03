import { toFaDigits } from '@/shared/utils/formatters';
import { safeLogoSrc } from '@/shared/lib/logoSources';
import { CHAIN_NAME_FA,llamaChainLogo } from '@/features/custody/data/chainDirectory';
import { protocolNames,identityKey,retiredProtocols,retiredChains } from './names';
import type { ChainInfo } from '../model';
export interface ProtocolIdentity {slug:string;name:string;nameFa:string;logo:string;aliases:string[];tvl:number}
export interface DirectoryMetadata {fetchedAt:number;chains:ChainInfo[];protocols:ProtocolIdentity[];blockedProtocols:string[];blockedChains:string[]}
export function stopped(value:Record<string,unknown>){return !!value.deadFrom||value.disabled===true||value.deprecated===true||['shutdown','sunset','inactive','discontinued'].includes(String(value.status??'').toLowerCase());}
const chainIds:Record<string,string>={BSC:'binance-smart-chain','OP Mainnet':'optimism','Hyperliquid L1':'hyperliquid','Hyperliquid':'hyperevm','zkSync Era':'zksync-era','Gnosis':'xdai','World Chain':'world','Robinhood Chain':'robinhood','Plume Mainnet':'plume'};
export function normalizeMetadata(protocols:unknown,chains:unknown,at=Date.now()):DirectoryMetadata {
 const protocolRows:ProtocolIdentity[]=[],blockedProtocols=new Set(retiredProtocols),blockedChains=new Set(retiredChains);
 for(const raw of Array.isArray(protocols)?protocols:[]){if(!raw||typeof raw!=='object')continue;const r=raw as Record<string,unknown>;const name=String(r.name??''),slug=String(r.slug??'');if(!name||name.length>100||!/^[-a-z0-9.]{1,100}$/.test(slug) )continue;
 const keys=[identityKey(slug),identityKey(name),identityKey(String(r.parentProtocol??'').replace(/^parent#/,'')),identityKey(slug.replace(/-v\d+.*$/,''))];
 if(stopped(r)||keys.some(k=>retiredProtocols.has(k))){blockedProtocols.add(identityKey(slug));blockedProtocols.add(identityKey(name));continue;}
 const key=keys.find(k=>protocolNames[k]),logo=safeLogoSrc(typeof r.logo==='string'?r.logo:null);if(!key||!logo)continue;
 const aliases=[...new Set([identityKey(slug),identityKey(name),key,...(r.parentProtocol?[identityKey(String(r.parentProtocol).replace(/^parent#/,''))]:[])])];
 protocolRows.push({slug,name,nameFa:protocolNames[key]+((name.match(/\bv\s*(\d+)\b/i)??slug.match(/-v(\d+)(?:-|$)/i))?` · نسخهٔ ${toFaDigits((name.match(/\bv\s*(\d+)\b/i)??slug.match(/-v(\d+)(?:-|$)/i))![1])}`:''),logo,aliases,tvl:typeof r.tvl==='number'&&Number.isFinite(r.tvl)?r.tvl:0});
 }
 const chainRows:ChainInfo[]=[];
 for(const raw of Array.isArray(chains)?chains:[]){if(!raw||typeof raw!=='object')continue;const r=raw as Record<string,unknown>,name=String(r.name??''),key=identityKey(name);if(stopped(r)||retiredChains.has(key)){blockedChains.add(key);blockedChains.add(identityKey(chainIds[name]??name.toLowerCase().replace(/\s+/g,'-')));continue;}if(!CHAIN_NAME_FA[name]||typeof r.tvl!=='number'||r.tvl<=0)continue;
 const id=chainIds[name]??name.toLowerCase().replace(/\s+/g,'-');if(!/^[-a-z0-9]{1,60}$/.test(id))continue;chainRows.push({id,name:CHAIN_NAME_FA[name],icon:llamaChainLogo(name),positions:false,transactions:false});
 }
 return {fetchedAt:at,chains:chainRows,protocols:protocolRows.sort((a,b)=>b.tvl-a.tvl),blockedProtocols:[...blockedProtocols],blockedChains:[...blockedChains]};
}
export function findProtocol(value:string,metadata:DirectoryMetadata){const key=identityKey(value);if(metadata.blockedProtocols.includes(key))return null;return metadata.protocols.find(p=>identityKey(p.slug)===key||identityKey(p.name)===key)??metadata.protocols.find(p=>p.aliases.includes(key))??null;}

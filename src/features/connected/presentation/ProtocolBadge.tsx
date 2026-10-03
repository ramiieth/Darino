import { useEffect } from 'react';
import { LogoImage } from '@/shared/components/ui/EntityLogo';
import { safeLogoSrc } from '@/shared/lib/logoSources';
import { useDirectoryStore,ensureDirectory } from '../data/directory';
import { findProtocol } from '../domain/directory/model';
import { identityKey } from '../domain/directory/names';
import { platformName } from './identity';
export function ProtocolBadge({name,logo,size=16}:{name:string;logo?:string|null;size?:number}){
 const metadata=useDirectoryStore(s=>s.metadata);useEffect(()=>{void ensureDirectory();},[]);
 if(metadata.blockedProtocols.includes(identityKey(name)))return null;
 const known=findProtocol(name,metadata);return <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 align-middle"><LogoImage src={known?.logo??safeLogoSrc(logo)} label={known?.nameFa??platformName(name)} size={size}/><span className="truncate text-[11px]">{known?.nameFa??platformName(name)}</span></span>;
}

import { yieldTokenIdentity } from '@/shared/domain/yieldTokenIdentity';
export function YieldTokenLabel({symbol,name}:{symbol:string;name?:string}){
 const identity=yieldTokenIdentity(symbol,name);if(!identity)return null;
 const tone=identity.kind==='YT'?'bg-violet-500/15 text-violet-600 dark:text-violet-300':identity.kind==='PT'?'bg-teal-500/15 text-teal-600 dark:text-teal-300':'bg-blue-500/15 text-blue-600 dark:text-blue-300';
 return <span className="inline-flex max-w-full flex-wrap items-center gap-2" data-yield-label={identity.kind} title={symbol}><span className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold ${tone}`}>{identity.kindFa}</span>{identity.underlyingFa&&<span className="min-w-0 break-words">{identity.underlyingFa}</span>}</span>;
}
export function YieldTokenMaturity({symbol,name}:{symbol:string;name?:string}){
 const identity=yieldTokenIdentity(symbol,name);if(!identity)return null;
 return <span data-yield-maturity={identity.maturity??undefined}>سررسید {identity.maturityFa??'نامشخص'}</span>;
}

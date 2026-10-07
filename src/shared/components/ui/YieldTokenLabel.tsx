import { yieldTokenIdentity } from '@/shared/domain/yieldTokenIdentity';
export function YieldTokenLabel({symbol,name}:{symbol:string;name?:string}){
 const identity=yieldTokenIdentity(symbol,name);if(!identity)return null;
 return <span dir="ltr" className="block max-w-full truncate text-right font-semibold" data-yield-label={identity.kind} title={symbol}>{identity.underlying}</span>;
}
export function YieldTokenMaturity({symbol,name}:{symbol:string;name?:string}){
 const identity=yieldTokenIdentity(symbol,name);if(!identity)return null;
 return <span data-yield-maturity={identity.maturity??undefined}>سررسید {identity.maturityFa??'نامشخص'}</span>;
}

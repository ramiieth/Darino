import { fetchJson } from '@/repositories/remoteClient';
export type LighterNetwork='mainnet'|'robinhood';
export const LIGHTER_PLATFORM:Record<LighterNetwork,string>={mainnet:'lighter-mainnet',robinhood:'lighter-robinhood'};
/** یک query برای حساب لایتر — صفحهٔ لایتر و داشبورد یک کش مشترک دارند */
export const lighterAccountQuery=(address:string,network:LighterNetwork)=>({
 queryKey:[network==='mainnet'?'lighter-mainnet-account':'lighter-robinhood-account',address.toLowerCase()],
 queryFn:()=>fetchJson<unknown>(`/api/integrations?op=${network==='mainnet'?'lighter-mainnet-account':'lighter-account'}&address=${encodeURIComponent(address)}`,{timeoutMs:15000}),
 staleTime:30000,refetchInterval:30000,retry:1
});
/** سری سود/زیان معاملات یک زیرحساب (ساعتی ۷ روز + روزانه ۳۱ روز) */
export const lighterPnlQuery=(index:number,network:LighterNetwork)=>({
 queryKey:['lighter-pnl',network,index],
 queryFn:()=>fetchJson<{hourly:[number,number][];daily:[number,number][]}>(`/api/integrations?op=${network==='mainnet'?'lighter-mainnet-pnl':'lighter-pnl'}&index=${index}`,{timeoutMs:15000}),
 staleTime:60000,refetchInterval:60000,retry:1
});

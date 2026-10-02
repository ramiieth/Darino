import { obj,str,arr } from '../src/features/connected/domain/model.js';
import { ProviderError } from './_zerion.js';
export interface SpotToken {address:string;wrappedTokenAddress:string|null;symbol:string;name:string;decimals:number;source:string;verified:boolean}
let cache:{at:number;tokens:SpotToken[]}|null=null;
export async function getSpotTokens():Promise<{tokens:SpotToken[];fetchedAt:number}> {
 if(cache&&Date.now()-cache.at<1200000)return {tokens:cache.tokens,fetchedAt:cache.at};
 const response=await fetch('https://router.spot.arcus.xyz/v1/tokens',{headers:process.env.ARCUS_SPOT_API_KEY?{'X-Api-Key':process.env.ARCUS_SPOT_API_KEY}:{},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new ProviderError(response.status===429?429:502,response.status===401||response.status===403?'دسترسی فهرست اسپات آرکوس نیازمند تنظیم کلید سرویس است':'فهرست اسپات آرکوس دریافت نشد');
 const data:unknown=await response.json();
 if(!Array.isArray(data))throw new ProviderError(502,'پاسخ فهرست اسپات معتبر نیست');
 const tokens=arr(data).map(obj).filter(t=>t.chainId===4663&&/^0x[0-9a-fA-F]{40}$/.test(str(t.address))).map(t=>({address:str(t.address).toLowerCase(),wrappedTokenAddress:/^0x[0-9a-fA-F]{40}$/.test(str(t.wrappedTokenAddress))?str(t.wrappedTokenAddress).toLowerCase():null,symbol:str(t.symbol),name:str(t.name),decimals:typeof t.decimals==='number'?t.decimals:18,source:str(t.source),verified:t.verified===true}));
 cache={at:Date.now(),tokens};return {tokens,fetchedAt:cache.at};
}

import { create } from 'zustand';
import { fetchJson, HttpError } from '@/repositories/remoteClient';
import { settingGet, settingSet, settingDeletePrefix } from '@/shared/lib/db';
import { accountSnapshotSchema, officialPreviewSchema, rootSchema, type BorosAccountSnapshot, type OfficialPreview, type previewRequestSchema } from '@/shared/boros/account';
import type { z } from 'zod';
const PREFIX='boros.account.v1:';
export const useBorosAccount = create<{root:string;accountId:number;hydrated:boolean;data:BorosAccountSnapshot|null;loading:boolean;error:string|null;retryAt:number}>(()=>({root:'',accountId:0,hydrated:false,data:null,loading:false,error:null,retryAt:0}));
let generation=0;
let hydration:Promise<void>|null=null;
const writes=new Set<Promise<void>>();
function save(key:string,value:unknown) {const job=settingSet(PREFIX+key,value);writes.add(job);void job.finally(()=>writes.delete(job));return job;}
export function hydrateBorosAccount():Promise<void>{
 if(useBorosAccount.getState().hydrated)return Promise.resolve();
 if(hydration)return hydration;
 const gen=generation;
 hydration=(async()=>{
  const prefs=await settingGet<{root:string;accountId:number}|null>(PREFIX+'selected',null);
  if(gen!==generation)return;
  if(prefs&&rootSchema.safeParse(prefs.root).success&&Number.isInteger(prefs.accountId)&&prefs.accountId>=0&&prefs.accountId<=255){
   const root=rootSchema.parse(prefs.root);const raw=await settingGet(PREFIX+root+':'+prefs.accountId,null);const parsed=accountSnapshotSchema.safeParse(raw);
   if(gen!==generation)return;
   useBorosAccount.setState({root,accountId:prefs.accountId,data:parsed.success&&parsed.data.root===root&&parsed.data.accountId===prefs.accountId?parsed.data:null});
  }
  if(gen===generation)useBorosAccount.setState({hydrated:true});
 })().finally(()=>{hydration=null;});return hydration;
}
export async function selectBorosAccount(value:string,accountId=0){
 const root=rootSchema.parse(value);if(!Number.isInteger(accountId)||accountId<0||accountId>255)throw new Error('حساب معتبر نیست');
 generation++;useBorosAccount.setState({root,accountId,data:null,loading:false,error:null,retryAt:0,hydrated:true});
 await save('selected',{root,accountId});await refreshBorosAccount();
}
export async function refreshBorosAccount(force=false):Promise<void>{
 await hydrateBorosAccount();const s=useBorosAccount.getState();const gen=generation;
 if(!s.root||s.loading||Date.now()<s.retryAt||(!force&&s.data&&Date.now()-s.data.fetchedAt<60000))return;
 useBorosAccount.setState({loading:true});
 try{
  const raw=await fetchJson<unknown>(`/api/borosAccount?root=${s.root}&accountId=${s.accountId}`,{timeoutMs:58000});const data=accountSnapshotSchema.parse(raw);
  if(gen!==generation)return;if(data.root!==s.root||data.accountId!==s.accountId)throw new Error('حساب دریافت‌شده مطابقت ندارد');
  useBorosAccount.setState({data,loading:false,error:null,retryAt:0});await save(s.root+':'+s.accountId,data);
 }catch(e){if(gen===generation)useBorosAccount.setState({loading:false,error:e instanceof HttpError?e.code??'دریافت داده انجام نشد':'پاسخ حساب معتبر نیست',retryAt:e instanceof HttpError&&e.status===429?Date.now()+Math.max(60,e.retryAfter)*1000:0});}
}
export async function previewBorosOrder(body:z.infer<typeof previewRequestSchema>):Promise<OfficialPreview>{
 return officialPreviewSchema.parse(await fetchJson('/api/borosAccount',{method:'POST',body,timeoutMs:45000}));
}
export function accountIsStale(s:ReturnType<typeof useBorosAccount.getState>,now=Date.now()) {return !!s.data && (!!s.error||now-s.data.fetchedAt>180000||s.data.fetchedAt-now>60000||s.data.syncedAt===null||now-s.data.syncedAt>180000||s.data.syncedAt-now>60000);}
export async function clearBorosAccount(){generation++;useBorosAccount.setState({root:'',accountId:0,hydrated:true,data:null,loading:false,error:null,retryAt:0});await Promise.allSettled([...writes]);await settingDeletePrefix(PREFIX);}

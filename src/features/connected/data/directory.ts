import { create } from 'zustand';
import { fetchJson } from '@/repositories/remoteClient';
import seed from '../domain/directory/seed.json';
import { normalizeMetadata,type DirectoryMetadata } from '../domain/directory/model';
import { settingGet,settingSet } from '@/shared/lib/db';
export const useDirectoryStore=create<{metadata:DirectoryMetadata}>(()=>({metadata:normalizeMetadata(seed.protocols,seed.chains,seed.fetchedAt)}));
let running:Promise<void>|null=null,checked=0;
export async function ensureDirectory(){
 if(running)return running;if(Date.now()-checked<86400000)return;checked=Date.now();
 running=(async()=>{const cached=await settingGet<{protocols:unknown;chains:unknown;fetchedAt:number}|null>('public.llama-directory.v1',null);if(cached && cached.fetchedAt>=seed.fetchedAt){useDirectoryStore.setState({metadata:normalizeMetadata(cached.protocols,cached.chains,cached.fetchedAt)});if(Date.now()-cached.fetchedAt<86400000)return;}
 try{const raw=await fetchJson<{protocols:unknown;chains:unknown;fetchedAt:number}>('/api/integrations?op=directory',{timeoutMs:18000});if(!Array.isArray(raw.protocols)||!Array.isArray(raw.chains))return;const metadata=normalizeMetadata(raw.protocols,raw.chains,raw.fetchedAt);useDirectoryStore.setState({metadata});await settingSet('public.llama-directory.v1',raw);}catch{/* The reviewed bundled metadata remains available offline. */}})();
 try{await running;}finally{running=null;}
}

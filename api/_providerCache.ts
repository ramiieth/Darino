import { createHash } from 'node:crypto';
import { db,isDbConfigured } from './_neon.js';
let cleanupAt=0;
const memory=new Map<string,{payload:unknown;expiresAt:number}>();
export function providerCacheKey(path:string) {return createHash('sha256').update((process.env.ZERION_API_KEY??'')+'\0'+path).digest('hex');}
export async function readProviderCache<T>(key:string,fresh=false):Promise<T|null> {
 const hit=memory.get(key);if(!fresh&&hit&&hit.expiresAt>Date.now())return hit.payload as T;
 if(!isDbConfigured())return hit&&hit.expiresAt>Date.now()?hit.payload as T:null;
 try {const rows=await db()`SELECT "payload", "expiresAt" FROM "providerCache" WHERE "key"=${key} AND "expiresAt">${Date.now()} LIMIT 1`;if(!rows[0])return null;const entry={payload:rows[0].payload,expiresAt:Number(rows[0].expiresAt)};remember(key,entry);return entry.payload as T;}catch{return null;}
}
function remember(key:string,entry:{payload:unknown;expiresAt:number}){if(memory.size>=300)memory.delete(memory.keys().next().value!);memory.set(key,entry);}
export async function writeProviderCache(key:string,payload:unknown,ttl:number) {
 const expiresAt=Date.now()+ttl;remember(key,{payload,expiresAt});if(!isDbConfigured())return false;
 try {await db()`INSERT INTO "providerCache" ("key","payload","expiresAt") VALUES (${key},${JSON.stringify(payload)}::jsonb,${expiresAt}) ON CONFLICT ("key") DO UPDATE SET "payload"=EXCLUDED."payload", "expiresAt"=EXCLUDED."expiresAt"`;if(Date.now()-cleanupAt>300000){cleanupAt=Date.now();await db()`DELETE FROM "providerCache" WHERE "expiresAt"<${Date.now()}`; }return true;}catch{return false;/* Cache failure must not replace valid provider data. */}
}

// Successful wallet snapshots survive credential rotation; raw quota/cache stays key-scoped.
export function walletSnapshotKey(userId:string,address:string) {
 return createHash('sha256').update('zerion-wallet-v2\0'+userId+'\0'+address).digest('hex');
}
// Atomically reserve a request slot across Vercel instances using the existing cache table.
// No table migration, credentials or wallet data are stored in the lease payload.
export async function reserveProviderSlot(key:string,now:number,deadline:number,spacing=550):Promise<number|null> {
 if(!isDbConfigured())return now;
 try {
  const rows=await db()`INSERT INTO "providerCache" ("key","payload","expiresAt")
   SELECT ${key}, '{"lease":true}'::jsonb, ${now+spacing} WHERE ${now+spacing}<=${deadline}
   ON CONFLICT ("key") DO UPDATE SET "expiresAt"=GREATEST("providerCache"."expiresAt",${now})+${spacing}
   WHERE GREATEST("providerCache"."expiresAt",${now})+${spacing}<=${deadline}
   RETURNING "expiresAt"`;
  return rows[0]?Number(rows[0].expiresAt)-spacing:null;
 }catch{return now;} // Existing in-instance queue remains the fallback when storage is unavailable.
}

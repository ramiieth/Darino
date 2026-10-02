import { createHash } from 'node:crypto';
import { db,isDbConfigured } from './_neon.js';
let cleanupAt=0;
const memory=new Map<string,{payload:unknown;expiresAt:number}>();
export function providerCacheKey(path:string) {return createHash('sha256').update((process.env.ZERION_API_KEY??'')+'\0'+path).digest('hex');}
export async function readProviderCache<T>(key:string):Promise<T|null> {
 const hit=memory.get(key);if(hit&&hit.expiresAt>Date.now())return hit.payload as T;
 if(!isDbConfigured())return null;
 try {const rows=await db()`SELECT "payload", "expiresAt" FROM "providerCache" WHERE "key"=${key} AND "expiresAt">${Date.now()} LIMIT 1`;if(!rows[0])return null;const entry={payload:rows[0].payload,expiresAt:Number(rows[0].expiresAt)};remember(key,entry);return entry.payload as T;}catch{return null;}
}
function remember(key:string,entry:{payload:unknown;expiresAt:number}){if(memory.size>=300)memory.delete(memory.keys().next().value!);memory.set(key,entry);}
export async function writeProviderCache(key:string,payload:unknown,ttl:number) {
 const expiresAt=Date.now()+ttl;remember(key,{payload,expiresAt});if(!isDbConfigured())return;
 try {await db()`INSERT INTO "providerCache" ("key","payload","expiresAt") VALUES (${key},${JSON.stringify(payload)}::jsonb,${expiresAt}) ON CONFLICT ("key") DO UPDATE SET "payload"=EXCLUDED."payload", "expiresAt"=EXCLUDED."expiresAt"`;if(Date.now()-cleanupAt>300000){cleanupAt=Date.now();await db()`DELETE FROM "providerCache" WHERE "expiresAt"<${Date.now()}`;}}catch{/* Cache failure must not replace valid provider data. */}
}

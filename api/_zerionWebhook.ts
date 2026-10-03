import type {IncomingMessage,ServerResponse} from 'node:http';
import {verify,createHash} from 'node:crypto';
import {z} from 'zod';
import {readProviderCache,writeProviderCache,providerCacheKey} from './_providerCache.js';
import {isDbConfigured,json} from './_neon.js';
import {validAddress,addressKey} from '../src/features/connected/domain/model.js';
export const config={api:{bodyParser:false}};
const payloadSchema=z.object({data:z.object({attributes:z.object({address:z.string().max(80)}),relationships:z.object({subscription:z.object({data:z.object({id:z.string()}).optional(),id:z.string().optional()})}).optional()}),included:z.array(z.object({type:z.string(),attributes:z.object({hash:z.string().max(160).optional(),status:z.string().optional(),deleted:z.boolean().optional(),flags:z.object({is_trash:z.boolean().optional()}).optional()}),relationships:z.object({chain:z.object({data:z.object({id:z.string()}).optional(),id:z.string().optional()})}).optional()})).max(100)});
/** Verify against an independently trusted Zerion certificate, never a header-selected URL. */
export default async function handler(req:IncomingMessage,res:ServerResponse){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){json(res,405,{error:'method_not_allowed'});return;}
 const certificate=process.env.ZERION_WEBHOOK_CERTIFICATE_PEM?.replace(/\\n/g,'\n');
 const wallets=(process.env.ZERION_WEBHOOK_WALLETS??'').split(',').map(s=>addressKey(s.trim())).filter(Boolean);
 if(!certificate||!wallets.length||!isDbConfigured()){json(res,503,{error:'webhook_not_configured'});return;}
 try{
  const timestamp=typeof req.headers['x-timestamp']==='string'?req.headers['x-timestamp']:'';
  const signature=typeof req.headers['x-signature']==='string'?req.headers['x-signature']:'';
  if(!signature||signature.length>2048||!Number.isFinite(Date.parse(timestamp))||Math.abs(Date.now()-Date.parse(timestamp))>300000){json(res,401,{error:'invalid_signature'});return;}
  const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=b.length;if(size>262144){json(res,413,{error:'payload_too_large'});return;}chunks.push(b);}
  const raw=Buffer.concat(chunks);
  const signed=Buffer.concat([Buffer.from(timestamp+'\n'),raw,Buffer.from('\n')]);
  if(!verify('RSA-SHA256',signed,certificate,Buffer.from(signature,'base64'))){json(res,401,{error:'invalid_signature'});return;}
  const data=payloadSchema.parse(JSON.parse(raw.toString('utf8')));const address=addressKey(data.data.attributes.address);
  if(!validAddress(address)||!wallets.includes(address)){json(res,200,{accepted:false});return;}
  let changed=false;
  for(const tx of data.included){
   if(tx.type!=='transactions'||tx.attributes.flags?.is_trash===true||(!tx.attributes.deleted&&tx.attributes.status!=='confirmed')||!tx.attributes.hash)continue;
   const chain=tx.relationships?.chain?.data?.id??tx.relationships?.chain?.id??'';if(!chain)continue;
   const id=createHash('sha256').update(address+'\0'+chain+'\0'+tx.attributes.hash+'\0'+String(!!tx.attributes.deleted)).digest('hex');
   const key=providerCacheKey('event:'+id);if(await readProviderCache(key,true))continue;
   // Write invalidation before dedup receipt. Failed persistent writes must be retried.
   if(!await writeProviderCache(providerCacheKey('activity:'+address),{at:Date.now()},30*86400000))throw new Error('cache_write_failed');
   if(!await writeProviderCache(key,{seen:true},30*86400000))throw new Error('cache_write_failed');changed=true;
  }
  json(res,200,{accepted:true,changed});
 }catch(e){json(res,e instanceof z.ZodError||e instanceof SyntaxError?400:503,{error:'webhook_not_processed'});}
}

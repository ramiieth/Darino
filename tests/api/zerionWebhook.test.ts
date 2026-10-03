// @vitest-environment node
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {generateKeyPairSync,sign} from 'node:crypto';
import {Readable} from 'node:stream';
import type {IncomingMessage,ServerResponse} from 'node:http';
const storage=vi.hoisted(()=>new Map());
vi.mock('../../api/_neon',()=>({isDbConfigured:()=>true,json:(res:any,status:number,body:any)=>{res.statusCode=status;res.end(JSON.stringify(body));}}));
vi.mock('../../api/_providerCache',()=>({providerCacheKey:(s:string)=>s,readProviderCache:async(k:string)=>storage.get(k)??null,writeProviderCache:async(k:string,v:unknown)=>{storage.set(k,v);return true;}}));
import handler from '../../api/_zerionWebhook';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});const address='0x'+'ab'.repeat(20);
beforeEach(()=>{storage.clear();vi.stubEnv('ZERION_WEBHOOK_CERTIFICATE_PEM',publicKey.export({type:'spki',format:'pem'}).toString());vi.stubEnv('ZERION_WEBHOOK_WALLETS',address);});
afterEach(()=>vi.unstubAllEnvs());
async function send(options:{spam?:boolean;deleted?:boolean;bad?:boolean;old?:boolean;foreign?:boolean}={}){
 const body=JSON.stringify({data:{attributes:{address:options.foreign?'0x'+'cd'.repeat(20):address}},included:[{type:'transactions',attributes:{hash:'0x'+'aa'.repeat(32),status:'confirmed',deleted:!!options.deleted,flags:{is_trash:!!options.spam}},relationships:{chain:{id:'ethereum'}}}]});
 const timestamp=new Date(Date.now()-(options.old?600000:0)).toISOString();const signature=sign('RSA-SHA256',Buffer.from(timestamp+'\n'+body+'\n'),privateKey).toString('base64');
 const req=Readable.from([Buffer.from(body)]) as unknown as IncomingMessage;Object.assign(req,{method:'POST',headers:{'x-timestamp':timestamp,'x-signature':options.bad?'bad':signature,'x-certificate-url':'http://127.0.0.1/private'}});
 const res={statusCode:0,setHeader:vi.fn(),end:vi.fn()};await handler(req,res as unknown as ServerResponse);return {status:res.statusCode,body:JSON.parse(res.end.mock.calls[0][0])};
}
it('valid signed events invalidate only the allowed wallet and deduplicate confirmations, but not rollbacks',async()=>{expect((await send()).body.changed).toBe(true);expect((await send()).body.changed).toBe(false);expect((await send({deleted:true})).body.changed).toBe(true);expect(storage.has('activity:'+address)).toBe(true);});
it('rejects tampered/stale messages and ignores unknown wallets/spam without fetching any certificate URL',async()=>{const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);expect((await send({bad:true})).status).toBe(401);expect((await send({old:true})).status).toBe(401);expect((await send({foreign:true})).body.accepted).toBe(false);expect((await send({spam:true})).body.changed).toBe(false);expect(storage.size).toBe(0);expect(fetcher).not.toHaveBeenCalled();vi.unstubAllGlobals();});
it('does not enable webhooks without an independently configured certificate',async()=>{vi.stubEnv('ZERION_WEBHOOK_CERTIFICATE_PEM','');expect((await send()).status).toBe(503);});

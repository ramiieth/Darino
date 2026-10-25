import type { IncomingMessage, ServerResponse } from 'node:http';
import { requireSession } from './_authCore.js';
import { z } from 'zod';
import { rootSchema, previewRequestSchema, unpackAccount, CROSS } from '../src/shared/boros/account.js';
import { readBorosAccount, readBorosPreview, readBorosHistory, BorosReadError } from './_borosAccount.js';
const querySchema=z.object({root:rootSchema,accountId:z.coerce.number().int().min(0).max(255).default(0),view:z.enum(['order-history','trade-history']).optional()});
export default async function handler(req:IncomingMessage,res:ServerResponse):Promise<void>{
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','private, no-store');
 const method=req.method??'GET';
 if(method!=='GET'&&method!=='POST'){res.statusCode=405;res.setHeader('Allow','GET, POST');res.end(JSON.stringify({error:'method_not_allowed'}));return;}
 if(!await requireSession(req,res))return;
 try {
  if(method==='GET'){
   const url=new URL(req.url??'/', 'http://localhost');const {root,accountId,view}=querySchema.parse(Object.fromEntries(url.searchParams));
   const data=view?await readBorosHistory(root,accountId,view):await readBorosAccount(root,accountId);res.statusCode=200;res.end(JSON.stringify(data));return;
  }
  let raw='';for await(const part of req){raw+=part.toString();if(raw.length>4096)throw new Error('body too large');}
  const body=previewRequestSchema.parse(JSON.parse(raw));const h=unpackAccount(body.marketAcc);
  if(h.marketId!==CROSS&&h.marketId!==body.marketId)throw new Error('market mismatch');
  const data=await readBorosPreview(body);res.statusCode=200;res.end(JSON.stringify(data));
 }catch(e){
  const invalid=e instanceof z.ZodError || (e instanceof Error&&['body too large','market mismatch'].includes(e.message)) || e instanceof SyntaxError;
  res.statusCode=invalid?400:e instanceof BorosReadError?e.status:502;
  if(res.statusCode===429)res.setHeader('Retry-After','60');
  res.end(JSON.stringify({error:invalid?'درخواست معتبر نیست':e instanceof BorosReadError?e.message:'پاسخ معتبر از بوروس دریافت نشد'}));
 }
}

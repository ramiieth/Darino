import zerionWebhook from './_zerionWebhook.js';
import { isBitcoinAddress } from '../src/features/connected/domain/bitcoinAddress.js';
import { getBitcoinWallet,getBitcoinTransactions } from './_bitcoin.js';
import { getDirectory } from './_directory.js';
/** One authenticated read-only endpoint for wallet data and Gemini analysis. No credentials reach the client. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { requireSession } from './_authCore.js';
import { json, readBody } from './_neon.js';
import { validPublicAddress } from '../src/features/connected/domain/model.js';
import { zerionQuota,walletActivityAt, getWallet, getTransactions, getPnl, getBalanceChart, ProviderError } from './_zerion.js';
import { lookupBridge } from './_bridge.js';
import { getPerpsRead } from './_perpsRead.js';
import { getSpotTokens } from './_arcusSpot.js';
import { analyze, analysisSchema } from './_assistant.js';
export const config={api:{bodyParser:false}};
const limits = new Map<string, { start: number; count: number }>();
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET','POST'].includes(req.method ?? '')) { json(res,405,{ error: 'روش درخواست مجاز نیست' }); return; }
  const webhookUrl=new URL(req.url??'/', 'https://darino.local');
  if(webhookUrl.searchParams.get('op')==='zerion-webhook'){await zerionWebhook(req,res);return;}
  const auth = await requireSession(req, res); if (!auth) return;
  const u = new URL(req.url ?? '/', 'https://darino.local');
  const op = u.searchParams.get('op') ?? 'status';
  if (op === 'status' && req.method === 'GET') { json(res,200,{ zerion: !!process.env.ZERION_API_KEY, gemini: !!process.env.GEMINI_API_KEY,quota:await zerionQuota(),webhookConfigured:!!process.env.ZERION_WEBHOOK_CERTIFICATE_PEM&&!!process.env.ZERION_WEBHOOK_WALLETS }); return; }
  // Isolate limits per account and operation; no model retry that could duplicate billing.
  const k = `${auth.userId}:${op}`; const now = Date.now();
  const old = limits.get(k); const limit = old && now - old.start < 60000 ? old : { start: now, count: 0 };
  if (++limit.count > (op === 'analyze' ? 4 : 30)) { res.setHeader('Retry-After','60'); json(res,429,{ error:'درخواست‌های زیادی ارسال شده؛ یک دقیقه بعد تلاش کنید' }); return; }
  if (limits.size > 1000) limits.clear(); limits.set(k,limit);
  try {
    if (req.method === 'POST' && op === 'analyze') {
      const parsed = analysisSchema.safeParse(await readBody(req));
      if (!parsed.success) { json(res,400,{ error:'اطلاعات تحلیل کامل یا معتبر نیست' }); return; }
      json(res,200,{ answer: await analyze(parsed.data), provider:'gemini', generatedAt:Date.now() }); return;
    }
    if(op==='wallet-events'&&req.method==='GET'){const addresses=(u.searchParams.get('addresses')??'').split(',').filter(Boolean);if(addresses.length>30||!(await Promise.all(addresses.map(validPublicAddress))).every(Boolean)){json(res,400,{error:'آدرس معتبر نیست'});return;}const budget=await zerionQuota();json(res,200,{refreshAfterMs:budget&&budget.level!=='normal'?budget.walletMs:60000,events:Object.fromEntries(await Promise.all(addresses.map(async a=>[a.startsWith('0x')?a.toLowerCase():a,await walletActivityAt(a)])))});return;}
    if(op==='bridge-proof' && req.method==='GET') {json(res,200,{proofs:await lookupBridge(u.searchParams.get('provider')??'',u.searchParams.get('hash')??'')});return;}
    if(op==='directory' && req.method==='GET'){json(res,200,await getDirectory());return;}
    if(['lighter-markets','lighter-account','ondo-markets'].includes(op) && req.method==='GET'){json(res,200,await getPerpsRead(op,u.searchParams.get('address')?.trim()??''));return;}
    if(op==='arcus-spot' && req.method==='GET') {json(res,200,await getSpotTokens());return;}
    if (req.method !== 'GET' || !['wallet','transactions','pnl','chart'].includes(op)) { json(res,400,{ error:'درخواست ناشناخته' }); return; }
    const address = u.searchParams.get('address')?.trim() ?? '';
    if (!await validPublicAddress(address)) { json(res,400,{ error:'آدرس عمومی معتبر نیست' }); return; }
    if(isBitcoinAddress(address)){if(op==='wallet')json(res,200,await getBitcoinWallet(address.toLowerCase().startsWith('bc1')?address.toLowerCase():address,auth.userId,u.searchParams.get('refresh')==='1'));else if(op==='transactions')json(res,200,await getBitcoinTransactions(address.toLowerCase().startsWith('bc1')?address.toLowerCase():address,u.searchParams.get('next')??undefined));else json(res,400,{error:'این داده برای بیت‌کوین در دسترس نیست'});return;}
    const data = op === 'chart' ? await getBalanceChart(address,auth.userId,u.searchParams.get('period')??'day',(u.searchParams.get('ids')??'').split(',').filter(Boolean),u.searchParams.get('chain')??'') : op === 'wallet' ? await getWallet(address, auth.userId, u.searchParams.get('refresh') === '1') : op === 'pnl' ? await getPnl(address) : await getTransactions(address, u.searchParams.get('next') ?? undefined);
    json(res,200,data);
  } catch (e) {
    const status = e instanceof ProviderError ? e.status : 502;
    if (e instanceof ProviderError && e.retryAfter) res.setHeader('Retry-After',String(e.retryAfter));
    json(res,status,{ error:e instanceof ProviderError ? e.message : 'ارتباط با سرویس برقرار نشد' });
  }
}

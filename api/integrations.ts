import { getPendleLogos } from './_pendleLogos.js';
import zerionWebhook from './_zerionWebhook.js';
import { isBitcoinAddress } from '../src/features/connected/domain/bitcoinAddress.js';
import { getBitcoinWallet,getBitcoinTransactions } from './_bitcoin.js';
import { getDirectory } from './_directory.js';
/** One authenticated read-only endpoint for wallet data and Gemini analysis. No credentials reach the client. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { requireSession } from './_authCore.js';
import { db, isDbConfigured, json, readBody } from './_neon.js';
import { ensureSchema } from './_schema.js';
import { ALERT_OPS, handleAlertsOp, neonAlertsStore, runTick, verifyTickKey } from './_alerts.js';
import { validPublicAddress } from '../src/features/connected/domain/model.js';
import { zerionQuota,walletActivityAt, getWallet, getTransactions, getPnl, getBalanceChart, ProviderError } from './_zerion.js';
import { lookupBridge } from './_bridge.js';
import { getPerpsRead, getLighterPnl, getOndoPublicMarkets, getOndoFundingHistory, getOndoDepth, getQfexPublicMarkets, getQfexFundingHistory, getQfexDepth } from './_perpsRead.js';
import { getSpotTokens } from './_arcusSpot.js';
import { analyze, analysisSchema, analyzeDelta, analyzeOptions, analyzePlan, optionsAnalysisSchema } from './_assistant.js';
import { DERIVE_OPS, getDerive } from './_derive.js';
import { searchDigikala, digikalaProduct } from './_digikala.js';
import { DK_SORT_IDS, type DkSort } from '../src/features/shopping/digikala/domain/types.js';
import { shopAsk } from './_shop.js';
import { relayEndpoint } from './_shopRelay.js';
import { fetchImage } from './_shopHttp.js';
export const config={api:{bodyParser:false}};
const limits = new Map<string, { start: number; count: number }>();
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET','POST'].includes(req.method ?? '')) { json(res,405,{ error: 'روش درخواست مجاز نیست' }); return; }
  const webhookUrl=new URL(req.url??'/', 'https://darino.local');
  if(webhookUrl.searchParams.get('op')==='zerion-webhook'){await zerionWebhook(req,res);return;}
  // The Mac bridge authenticates with SHOP_RELAY_KEY (not a user session) and can only claim/submit Snappfood search jobs.
  if(webhookUrl.searchParams.get('op')==='shop-relay'){await relayEndpoint(req,res);return;}
  // Public market data only (fees, margin, mark prices) for the calculators — no account, address or credential.
  // بررسی دوره‌ای اعلان‌ها (GitHub Actions): بدون نشست، فقط با کلید زمان‌بند؛ پاسخ فقط شمارش‌ها
  if(webhookUrl.searchParams.get('op')==='alerts-tick'){
    if(req.method!=='POST'){json(res,405,{error:'روش درخواست مجاز نیست'});return;}
    res.setHeader('Cache-Control','no-store');
    try{
      if(!isDbConfigured()){json(res,503,{error:'پایگاه داده تنظیم نشده'});return;}
      const sql=db(); if(!(await ensureSchema(sql))){json(res,503,{error:'پایگاه داده آماده نیست'});return;}
      const store=neonAlertsStore(sql); const key=req.headers['x-alerts-key'];
      if(!(await verifyTickKey(store,typeof key==='string'?key:undefined))){json(res,401,{error:'کلید زمان‌بند معتبر نیست'});return;}
      json(res,200,await runTick(store));
    }catch{json(res,500,{error:'بررسی انجام نشد'});}
    return;
  }
  const publicOndo=webhookUrl.searchParams.get('op');
  if((publicOndo==='ondo-perps-history'||publicOndo==='ondo-perps-depth')&&req.method==='GET'){const market=webhookUrl.searchParams.get('market')??'';try{res.setHeader('Cache-Control',publicOndo==='ondo-perps-history'?'public, max-age=300, s-maxage=600':'public, max-age=10, s-maxage=15');json(res,200,publicOndo==='ondo-perps-history'?await getOndoFundingHistory(market):await getOndoDepth(market));}catch(e){res.setHeader('Cache-Control','no-store');json(res,e instanceof ProviderError?e.status:502,{error:e instanceof ProviderError?e.message:'ارتباط با سرویس برقرار نشد'});}return;}
  if(publicOndo?.startsWith('qfex-perps-')&&req.method==='GET'){const market=webhookUrl.searchParams.get('market')??'';try{const load=publicOndo==='qfex-perps-public'?getQfexPublicMarkets:publicOndo==='qfex-perps-history'?()=>getQfexFundingHistory(market):publicOndo==='qfex-perps-depth'?()=>getQfexDepth(market):null;if(!load){json(res,400,{error:'درخواست ناشناخته'});return;}res.setHeader('Cache-Control',publicOndo==='qfex-perps-history'?'public, max-age=300, s-maxage=600':publicOndo==='qfex-perps-depth'?'public, max-age=10, s-maxage=15':'public, max-age=30, s-maxage=30');json(res,200,await load());}catch(e){res.setHeader('Cache-Control','no-store');json(res,e instanceof ProviderError?e.status:502,{error:e instanceof ProviderError?e.message:'ارتباط با سرویس برقرار نشد'});}return;}
  if(webhookUrl.searchParams.get('op')==='ondo-perps-public'&&req.method==='GET'){try{res.setHeader('Cache-Control','public, max-age=30, s-maxage=60');json(res,200,await getOndoPublicMarkets());}catch(e){res.setHeader('Cache-Control','no-store');json(res,e instanceof ProviderError?e.status:502,{error:e instanceof ProviderError?e.message:'ارتباط با سرویس برقرار نشد'});}return;}
  const auth = await requireSession(req, res); if (!auth) return;
  const u = new URL(req.url ?? '/', 'https://darino.local');
  const op = u.searchParams.get('op') ?? 'status';
  if (op === 'status' && req.method === 'GET') { json(res,200,{ zerion: !!process.env.ZERION_API_KEY, gemini: !!process.env.GEMINI_API_KEY,quota:await zerionQuota(),webhookConfigured:!!process.env.ZERION_WEBHOOK_CERTIFICATE_PEM&&!!process.env.ZERION_WEBHOOK_WALLETS }); return; }
  // Isolate limits per account and operation; no model retry that could duplicate billing.
  const k = `${auth.userId}:${op}`; const now = Date.now();
  const old = limits.get(k); const limit = old && now - old.start < 60000 ? old : { start: now, count: 0 };
  if (++limit.count > (op === 'analyze' || op === 'analyze-options' || op === 'analyze-plan' || op === 'analyze-delta' ? 4 : op === 'shop-ask' ? 12 : op === 'shop-img' ? 240 : 30)) { res.setHeader('Retry-After','60'); json(res,429,{ error:'درخواست‌های زیادی ارسال شده؛ یک دقیقه بعد تلاش کنید' }); return; }
  if (limits.size > 1000) limits.clear(); limits.set(k,limit);
  try {
    if ((ALERT_OPS as readonly string[]).includes(op)) {
      if (!isDbConfigured()) { json(res,503,{ error:'پایگاه داده تنظیم نشده' }); return; }
      const [status, body] = await handleAlertsOp(neonAlertsStore(db()), op, req.method ?? 'GET', auth.userId, () => readBody(req));
      json(res,status,body); return;
    }
    if (req.method === 'POST' && op === 'analyze') {
      const parsed = analysisSchema.safeParse(await readBody(req));
      if (!parsed.success) { json(res,400,{ error:'اطلاعات تحلیل کامل یا معتبر نیست' }); return; }
      json(res,200,{ answer: await analyze(parsed.data), provider:'gemini', generatedAt:Date.now() }); return;
    }
    if(op==='wallet-events'&&req.method==='GET'){const addresses=(u.searchParams.get('addresses')??'').split(',').filter(Boolean);if(addresses.length>30||!(await Promise.all(addresses.map(validPublicAddress))).every(Boolean)){json(res,400,{error:'آدرس معتبر نیست'});return;}const budget=await zerionQuota();json(res,200,{refreshAfterMs:budget&&budget.level!=='normal'?budget.walletMs:60000,events:Object.fromEntries(await Promise.all(addresses.map(async a=>[a.startsWith('0x')?a.toLowerCase():a,await walletActivityAt(a)])))});return;}
    if(op==='bridge-proof' && req.method==='GET') {json(res,200,{proofs:await lookupBridge(u.searchParams.get('provider')??'',u.searchParams.get('hash')??'')});return;}
    if (req.method === 'POST' && op === 'analyze-delta') {
      const parsed = optionsAnalysisSchema.safeParse(await readBody(req));
      if (!parsed.success) { json(res,400,{ error:'اطلاعات وضعیت دلتا نوترال کامل یا معتبر نیست' }); return; }
      json(res,200,{ answer: await analyzeDelta(parsed.data), provider:'gemini', generatedAt:Date.now() }); return;
    }
    if (req.method === 'POST' && op === 'analyze-plan') {
      const parsed = optionsAnalysisSchema.safeParse(await readBody(req));
      if (!parsed.success) { json(res,400,{ error:'اطلاعات برنامه کامل یا معتبر نیست' }); return; }
      json(res,200,{ answer: await analyzePlan(parsed.data), provider:'gemini', generatedAt:Date.now() }); return;
    }
    if (req.method === 'POST' && op === 'analyze-options') {
      const parsed = optionsAnalysisSchema.safeParse(await readBody(req));
      if (!parsed.success) { json(res,400,{ error:'اطلاعات تحلیل آپشن کامل یا معتبر نیست' }); return; }
      json(res,200,{ answer: await analyzeOptions(parsed.data), provider:'gemini', generatedAt:Date.now() }); return;
    }
    if((DERIVE_OPS as readonly string[]).includes(op) && req.method==='GET'){json(res,200,await getDerive(op,u.searchParams));return;}
    if(op==='pendle-logos' && req.method==='GET'){json(res,200,await getPendleLogos());return;}
    if(op==='directory' && req.method==='GET'){json(res,200,await getDirectory());return;}
    if(['lighter-markets','lighter-account','lighter-mainnet-markets','lighter-mainnet-account','ondo-markets'].includes(op) && req.method==='GET'){json(res,200,await getPerpsRead(op,u.searchParams.get('address')?.trim()??''));return;}
    if(['lighter-pnl','lighter-mainnet-pnl'].includes(op) && req.method==='GET'){json(res,200,await getLighterPnl(op,u.searchParams.get('index')?.trim()??''));return;}
    if(op==='arcus-spot' && req.method==='GET') {json(res,200,await getSpotTokens());return;}
    if(op==='shop-img' && req.method==='GET'){const img=await fetchImage(u.searchParams.get('u')??'');res.statusCode=200;res.setHeader('Content-Type',img.type);res.setHeader('Cache-Control','private, max-age=86400');res.setHeader('X-Content-Type-Options','nosniff');res.end(img.body);return;}
    if(op==='shop-ask' && req.method==='GET'){const q=(u.searchParams.get('q')??'').trim();const home=u.searchParams.get('home')??'';if(q.length<3||q.length>300||(home&&!/^[a-z-]{2,30}$/.test(home))){json(res,400,{error:'درخواست را در ۳ تا ۳۰۰ حرف بنویسید'});return;}json(res,200,await shopAsk(q,home||null));return;}
    if(op==='dk-search' && req.method==='GET'){const q=(u.searchParams.get('q')??'').trim().slice(0,80);const page=Math.min(Math.max(Number(u.searchParams.get('page'))||1,1),20);const sort=u.searchParams.get('sort')??'relevant';if(q.length<2||!Object.hasOwn(DK_SORT_IDS,sort)){json(res,400,{error:'عبارت جستجو یا مرتب‌سازی معتبر نیست'});return;}json(res,200,await searchDigikala(q,page,sort as DkSort));return;}
    if(op==='dk-product' && req.method==='GET'){const id=Number(u.searchParams.get('id'));if(!Number.isSafeInteger(id)||id<1){json(res,400,{error:'شناسهٔ کالا معتبر نیست'});return;}json(res,200,await digikalaProduct(id));return;}
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

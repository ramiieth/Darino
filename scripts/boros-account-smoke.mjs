/** Synthetic read-only UI QA; all external traffic is blocked. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL??'http://127.0.0.1:5173';
const root='0x1111111111111111111111111111111111111111';const handle=root+'000002ffffff';
const now=Date.now();const snapshot={root,accountId:0,fetchedAt:now,syncedAt:now,assets:[{tokenId:2,symbol:'WETH',priceUsd:2000,logo:'/logos/token-eth.svg'}],balances:[{handle,tokenId:2,marketId:0xffffff,cash:1,equity:1.1,margin:.2,freeMargin:.9,maintenanceBuffer:1}],positions:[{handle,marketId:128,tokenId:2,side:'long',size:2,fixedApr:.05,unrealized:.02,realizedTrade:.01,settlement:.03,liquidationApr:.15,matured:false}],settlements:[{id:'s1',marketId:128,tokenId:2,at:now,kind:'settlement',amount:.029,fee:.001,rate:.07}],transfers:[{id:'d1',marketId:null,tokenId:2,at:now,kind:'wallet→cross_account · success',amount:1,fee:null,rate:null}],orders:[{id:'o1',marketId:128,side:'short',size:.65,rate:.08,margin:.02}],partial:false,historyComplete:true,errors:[]};
let quota=false,previewBody;const errors=[];
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());if(u.origin!==base)return route.abort();
  if(u.pathname==='/api/borosAccount'){
   if(route.request().method()==='POST'){previewBody=route.request().postDataJSON();return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({fetchedAt:Date.now(),handle,marketId:128,side:'long',requestedSize:.65,matchedSize:.65,matchedApr:.08,margin:.02,liquidationApr:.12,priceImpact:.001,status:'FILLED',success:true})});}
   return route.fulfill({status:quota?429:200,contentType:'application/json',body:JSON.stringify(quota?{error:'سهمیه بوروس محدود است'}:snapshot)});
  }
  if(u.pathname.startsWith('/api/')||u.pathname.includes('-api'))return route.fulfill({status:503,contentType:'application/json',body:'{}'});
  return route.continue();
 });
 await page.goto(base);
 await page.evaluate(async()=>{
  const React=(await import('/node_modules/.vite/deps/react.js')).default;const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  const {default:BorosDashboard}=await import('/src/features/boros/presentation/BorosDashboard.tsx');
  const transformed=await(await fetch('/src/features/boros/presentation/BorosDashboard.tsx')).text();const path=transformed.match(/from ["']([^"']*\/useBoros\.ts[^"']*)["']/)[1];const {useBorosStore}=await import(path);
  const {mapMarket}=await import('/src/features/boros/data/borosService.ts');const {borosRaw}=await import('/tests/fixtures/boros.ts');const m={...mapMarket(borosRaw,Date.now()),marketId:128,tokenId:2,maturity:Date.now()/1000+19*86400,collateralSymbol:'WETH',collateralPriceUsd:2000,assetMarkPrice:2000};
  useBorosStore.setState({markets:[m],loading:true,loadedAt:Date.now(),stale:false});
  const host=document.createElement('div');host.id='boros-account-qa';host.dir='rtl';host.style.cssText='position:fixed;inset:0;z-index:9999;background:rgb(var(--c-canvas));padding:20px;overflow:auto';document.body.append(host);createRoot(host).render(React.createElement(BorosDashboard));window.__qaMarket=m;
 });
 const host=page.locator('#boros-account-qa');await host.getByRole('tab',{name:'حساب من',exact:true}).click();await host.getByLabel('آدرس حساب بوروس').fill(root);await host.getByRole('button',{name:'مشاهده حساب',exact:true}).click();await host.getByText('لانگ فاندینگ',{exact:true}).waitFor();
 assert((await host.innerText()).includes('۲,۲۰۰'));await host.getByText('سفارش‌های باز',{exact:true}).click();await host.getByText('تسویه‌ها و انتقال‌ها',{exact:true}).click();
 for(const dark of [false,true]){await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});const fit=await host.evaluate(e=>({scroll:e.scrollWidth,client:e.clientWidth}));if(fit.scroll>fit.client+1)console.log(JSON.stringify(await host.evaluate(el=>[...el.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>innerWidth+1||e.getBoundingClientRect().left< -1).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent?.slice(0,80),width:e.getBoundingClientRect().width,left:e.getBoundingClientRect().left})).slice(0,20))));assert(fit.scroll<=fit.client+1,JSON.stringify({width,dark,...fit}));}}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/darino-boros-account-mobile.png'});
 quota=true;await host.getByRole('button',{name:'به‌روزرسانی',exact:true}).click();await host.getByText('داده ذخیره‌شده',{exact:true}).waitFor();assert((await host.innerText()).includes('۲,۲۰۰'));
 await page.evaluate(async()=>{
  const React=(await import('/node_modules/.vite/deps/react.js')).default;const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;const {OfficialPreviewPanel}=await import('/src/features/boros/presentation/OfficialPreviewPanel.tsx');const host=document.createElement('div');host.id='official-preview-qa';host.dir='rtl';host.style.cssText='position:fixed;inset:0;z-index:10000;background:rgb(var(--c-canvas));padding:20px;overflow:auto';document.body.append(host);createRoot(host).render(React.createElement(OfficialPreviewPanel,{market:window.__qaMarket,direction:'long',size:'0.65'}));
 });
 const preview=page.locator('#official-preview-qa');await preview.getByRole('button',{name:'بررسی با حساب واقعی',exact:true}).click();await preview.getByText('پیش‌نمایش پذیرفته شد؛ هیچ سفارشی ارسال نشده است.',{exact:true}).waitFor();assert.equal(previewBody.size,'650000000000000000');assert.equal(previewBody.tif,2);assert.equal(previewBody.slippage,.005);assert((await preview.innerText()).includes('۴۰.۰۰'));
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});const fit=await preview.evaluate(e=>({scroll:e.scrollWidth,client:e.clientWidth}));assert(fit.scroll<=fit.client+1,JSON.stringify({width,...fit}));}
 assert.deepEqual(errors,[]);console.log('PASS: account, quota retention, official preview x18, 320/390/1440, light/dark, touch');
}finally{await browser.close();}

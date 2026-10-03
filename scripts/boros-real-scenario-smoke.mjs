import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL??'http://127.0.0.1:5173';const root='0x1111111111111111111111111111111111111111';let requests=0;
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==base)return route.abort();if(u.pathname==='/api/borosAccount'&&route.request().method()==='POST'){requests++;const b=route.request().postDataJSON();return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({fetchedAt:Date.now(),handle:b.marketAcc,marketId:b.marketId,side:b.side===0?'long':'short',requestedSize:Number(BigInt(b.size))/1e18,matchedSize:Number(BigInt(b.size))/1e18,matchedApr:.08,margin:.005,liquidationApr:.01,priceImpact:.001,status:'FILLED',success:true})});}if(u.pathname.startsWith('/api/')||u.pathname.includes('-api'))return route.fulfill({status:503,body:'{}',contentType:'application/json'});return route.continue();});
 await page.goto(base);await page.evaluate(async(root)=>{
  const React=(await import('/node_modules/.vite/deps/react.js')).default;const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  const {OrderPreviewPanel}=await import('/src/features/boros/presentation/OrderPreviewPanel.tsx');const {useBorosAccount}=await import('/src/features/boros/data/useBorosAccount.ts');
  const {mapMarket}=await import('/src/features/boros/data/borosService.ts');const {borosRaw}=await import('/tests/fixtures/boros.ts');const now=Date.now();
  const m={...mapMarket(borosRaw,now),marketId:128,tokenId:2,asset:'ETH',venue:'Hyperliquid',collateralSymbol:'WETH',collateralPriceUsd:2000,maturity:now/1000+30*86400,status:'GOOD',markApr:.08,floatingApr:.12,kIM:.5,kMM:.06,marginFloor:.06,ytmFloor:5/365,volume24h:10000,isUiWhitelisted:true,fundingHistory:Array.from({length:30},(_,i)=>({ts:now/1000-(30-i)*86400,c:.12+i/10000}))};
  const d={root,accountId:0,fetchedAt:now,syncedAt:now,assets:[{tokenId:2,symbol:'WETH',priceUsd:2000,logo:null}],balances:[{handle:root+'000002ffffff',tokenId:2,marketId:0xffffff,cash:.021,equity:.021,margin:0,freeMargin:.021,maintenanceBuffer:.021}],positions:[],orders:[],settlements:[],transfers:[],partial:false,historyComplete:true,errors:[],gasBalanceUsd:1.3};
  useBorosAccount.setState({root,accountId:0,data:d,hydrated:true,error:null});
  const host=document.createElement('div');host.id='real-scenario-qa';host.dir='rtl';host.style.cssText='position:fixed;inset:0;z-index:9999;background:rgb(var(--c-canvas));padding:16px;overflow:auto';document.body.append(host);
  createRoot(host).render(React.createElement(OrderPreviewPanel,{market:m,direction:'long',fixedRate:.08,underlyingApr:.12,collateralPriceUsd:2000,markets:[m,{...m,marketId:999,tokenId:1}],initial:{sizeYu:1,capitalUsd:100,feesUsd:1,gasUsd:.2,slippageUsd:.3}}));
  window.__account=useBorosAccount;window.__snapshot=d;
 },root);
 const host=page.locator('#real-scenario-qa');await host.getByRole('button',{name:'حساب واقعی',exact:true}).click();await host.getByText('پیشنهاد با حساب واقعی',{exact:true}).waitFor();assert((await host.innerText()).includes('۴۲.۰۰'));
 await host.getByRole('button',{name:'انتخاب برای بررسی',exact:true}).first().waitFor({timeout:10000});assert(requests>0&&requests<=3);
 for(const dark of [false,true]){await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});const fit=await host.evaluate(e=>({scroll:e.scrollWidth,client:e.clientWidth}));assert(fit.scroll<=fit.client+1,JSON.stringify({width,dark,...fit}));}}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/darino-boros-real-scenario-mobile.png',fullPage:false});
 await page.evaluate(()=>{const d=structuredClone(window.__snapshot);d.balances[0].cash=0;d.balances[0].freeMargin=0;window.__account.setState({data:{...d,fetchedAt:Date.now(),syncedAt:Date.now()},error:null});});await host.getByRole('button',{name:'انتخاب برای بررسی',exact:true}).waitFor({state:'hidden'});assert(!(await host.innerText()).includes('۴۲.۰۰'));
 await host.getByRole('button',{name:'سناریوی فرضی',exact:true}).click();await host.getByLabel('سرمایه',{exact:true}).waitFor();assert.equal(await host.getByLabel('سرمایه',{exact:true}).inputValue(),'100');assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: real collateral budget, bounded official previews, compatible markets, withdrawal invalidation, independent hypothetical capital, 320/390/768/1440 light/dark/touch.');
}finally{await browser.close();}

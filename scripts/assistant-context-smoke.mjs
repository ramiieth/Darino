/** Isolated browser QA with mocked providers: never sends real wallets or credentials. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({channel:'chrome'});
const page = await browser.newPage({viewport:{width:390,height:844}});
const errors=[]; page.on('pageerror',e => errors.push({url:page.url(),stack:e.stack}));
const address = '0x'+'ab'.repeat(20); let failWallet=false;let quotaWallet=false; let analysisBody;
const snapshot={address,fetchedAt:Date.now(),total:1300,change:20,complete:true,unpriced:0,chains:[{id:'ethereum',name:'Ethereum',icon:null}],positions:[{id:'eth',tokenId:'eth',chain:'ethereum',contract:null,name:'Ether',symbol:'ETH',icon:'/logos/token-eth.svg',quantity:'0.300000000000000001',value:1200,price:4000,type:'wallet',protocol:null,protocolIcon:null,group:null,receipt:null,displayable:true,spam:false,verified:true},{id:'weth',tokenId:'weth',chain:'robinhood',contract:'0x'+'11'.repeat(20),name:'Wrapped Ether',symbol:'WETH',icon:'/logos/token-weth.png',quantity:'2',value:100,price:50,type:'wallet',protocol:null,protocolIcon:null,group:null,receipt:null,displayable:true,spam:false,verified:true}]};
snapshot.positions.push(
 {...snapshot.positions[0],id:'dust-base',chain:'base',quantity:'0.0003',value:1.2},
 {...snapshot.positions[0],id:'gas-robinhood',chain:'robinhood',quantity:'0.0002',value:0.8},
 {...snapshot.positions[0],id:'counterfeit',tokenId:'fake-usdt',symbol:'USDT',name:'جعلی آزمایشی',contract:'0x'+'99'.repeat(20),value:9999,icon:'/logos/token-usdt.svg',verified:false},
 {...snapshot.positions[0],id:'no-logo',tokenId:'nologo',symbol:'NOLOGO',contract:'0x'+'77'.repeat(20),value:30,icon:null,verified:false},
 {...snapshot.positions[0],id:'trash',tokenId:'trash',symbol:'SPAM',value:300,spam:true}
);
snapshot.total=11331;
await page.route('**/*',async route => {
 const u=new URL(route.request().url());
 if(u.hostname==='api.arcus.xyz') { const account={address,accountIndex:0,netQuoteBalance:'500',equity:'500',freeCollateral:'500',netDeposits:'500',pendingDeposits:'0',pendingWithdrawals:'0',positions:{},sequenceNumber:1};return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(u.pathname==='/v1/account'?account:[])}); }
 if(u.origin!==base&&u.hostname!=='api.llama.fi') return route.abort();
 if(u.hostname!=='api.llama.fi'&&!u.pathname.startsWith('/api/') && !u.pathname.includes('-api')) return route.continue();
 let body={configured:false}; let status=200;
 if(u.hostname==='api.llama.fi') {if(u.pathname==='/v2/chains')body=[{name:'Ethereum',tvl:20000000},{name:'Base',tvl:5000000},{name:'Blast',tvl:9000000},{name:'Solana',tvl:8000000}];else if(u.pathname==='/protocols')body=[{name:'Aave V3',slug:'aave-v3',tvl:15000000,change_7d:2.3,chain:'Ethereum',logo:'https://icons.llama.fi/aave-v3.jpg'},{name:'Multichain',slug:'multichain',tvl:10000,deadFrom:123}];else body=Array.from({length:31},(_,i)=>({date:Math.floor(Date.now()/1000)-(30-i)*86400,tvl:10000000+i*100000}));}
 else if(u.pathname==='/api/auth') {
  const op=u.searchParams.get('op');
  if(op==='sessions') body={sessions:[],recentlyEnded:[]};
  else if(op==='passkeys') body={passkeys:[]};
  else if(op==='events') body={events:[]};
  else body={available:true,authenticated:true,session:{id:'qa',label:'QA',createdAt:Date.now(),stepUpFresh:true}};
 }
 else if(u.pathname==='/api/usdt') body={ok:true,source:'wallex',priceToman:150000,tradedAt:Date.now(),fetchedAt:Date.now()};
 else if(u.pathname==='/api/accounting') body={configured:false,accounts:[],entries:[],lots:[],events:[]};
 else if(u.pathname==='/api/custody') body={configured:false,records:[]};
 else if(u.pathname==='/api/integrations') {
  const op=u.searchParams.get('op');
  if(op==='wallet') {body=quotaWallet?{error:'سهمیهٔ روزانهٔ زریون تمام شده'}:failWallet?{error:'خطای آزمایشی اتصال'}:snapshot;status=quotaWallet?429:failWallet?502:200;}
  else if(op==='transactions') body={rows:[{id:'dust-receipt',hash:'0xdust',chain:'ethereum',type:'receive',status:'confirmed',minedAt:new Date().toISOString(),fee:0,transfers:[{direction:'in',symbol:'ETH',tokenId:'ethereum',quantity:'0.000001',value:0.004,address:null,icon:'/logos/token-eth.svg',verified:true}]},{id:'spam-receipt',hash:'0xspam',chain:'ethereum',type:'receive',status:'confirmed',minedAt:new Date().toISOString(),fee:0,spam:true,transfers:[]},{id:'stable-dust-1',hash:'0xstable1',chain:'arbitrum',type:'receive',status:'confirmed',minedAt:new Date().toISOString(),fee:0,transfers:[{direction:'in',symbol:'USDT0',tokenId:'usdt0',quantity:'0.000014',value:0.000014,contract:'0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',address:null,icon:'/logos/token-usdt0.svg',verified:true}]},{id:'stable-dust-2',hash:'0xstable2',chain:'arbitrum',type:'receive',status:'confirmed',minedAt:new Date().toISOString(),fee:0,transfers:[{direction:'in',symbol:'USDT0',tokenId:'usdt0',quantity:'0.0001',value:0.0001,contract:'0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',address:null,icon:'/logos/token-usdt0.svg',verified:true}]},{id:'t1',protocol:'Uniswap V3',protocolIcon:null,hash:'0xtest',chain:'ethereum',type:'receive',status:'confirmed',minedAt:new Date().toISOString(),fee:0.1,transfers:[{direction:'in',symbol:'ETH',quantity:'0.1',value:400,address:'0x'+'cd'.repeat(20),icon:'/logos/token-eth.svg',verified:true,tokenId:'ethereum'}]}],next:null,fetchedAt:Date.now()};
  else if(op==='chart') body={points:[[Date.now()-86400000,1310],[Date.now()-72000000,1320],[Date.now()-36000000,1270],[Date.now(),1300.8]],fetchedAt:Date.now()};
  else if(op==='arcus-spot') body={tokens:[{address:'0x'+'11'.repeat(20),wrappedTokenAddress:null,symbol:'WETH',name:'Wrapped Ether',decimals:18,source:'arcus',verified:true}],fetchedAt:Date.now()};
  else if(op==='pnl') body={data:{attributes:{realized_gain:10,unrealized_gain:20,total_fee:1}}};
  else if(op==='analyze') {analysisBody=route.request().postDataJSON();body={answer:'تحلیل آزمایشی فارسی: تمرکز دارایی را بررسی کنید.',generatedAt:Date.now()};}
  else body={zerion:true,gemini:true};
 } else {body={error:'provider mocked'};status=503;}
 await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
});
const fits=async()=>{ const widths=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,outside:[...document.querySelectorAll('main *')].filter(e=>(e.getBoundingClientRect().right>innerWidth+1||e.getBoundingClientRect().left < -1) && ![...function*(e){while(e.parentElement && e.parentElement.tagName!=='MAIN'){e=e.parentElement;yield e;}}(e)].some(a=>['auto','hidden','scroll','clip'].includes(getComputedStyle(a).overflowX))).slice(0,12).map(e=>({tag:e.tagName,text:e.textContent?.slice(0,70),class:e.className}))})); if(widths.scroll>widths.width+1) await page.screenshot({path:'/tmp/darino-overflow.png',fullPage:true}); assert(widths.scroll<=widths.width+1,JSON.stringify({url:page.url(),...widths})); };

try {
 await page.goto(base+'/#/assistant');
 await page.getByRole('heading',{name:'دستیار پرتفولیو',exact:true}).waitFor();
 await page.getByRole('button',{name:'فرصت‌های بوروس',exact:true}).click();
 await page.waitForTimeout(3500);
 await page.evaluate(async()=>{
  const code=await (await fetch('/src/features/connected/assistant/context.ts')).text();
  const moduleUrl=(file)=>{const re=new RegExp('from "([^" ]*'+file.replaceAll('.','\\.')+'(?:\\?[^" ]*)?)"');const m=code.match(re);if(!m)throw Error('Missing module '+file);return m[1];};
  const {usePerfStore}=await import(moduleUrl('useTopPerformers.ts'));
  const {useBorosStore}=await import(moduleUrl('useBoros.ts'));
  const {useMarketsStore}=await import(moduleUrl('store.ts'));
  const now=Date.now();
  usePerfStore.setState({coins:[{symbol:'ETH',id:'ethereum',nameFa:'اتریوم',kind:'crypto',price:3000,marketCap:1e9},{symbol:'BTC',id:'bitcoin',nameFa:'بیت‌کوین',kind:'crypto',price:60000,marketCap:2e9}],perf1d:{ETH:1,BTC:-1},perf7d:{ETH:2,BTC:-2},perf30:{ETH:3,BTC:-3},perf60:{ETH:4,BTC:-4},perf90:{ETH:5,BTC:-5},loadedAt:now,loading:true,stale:false,historyDone:true});
  const m={marketId:123,asset:'ETH',venue:'Hyperliquid',maturity:now/1000+19*86400,markApr:.08,floatingApr:.1,assetMarkPrice:3000,collateralSymbol:'ETH',collateralPriceUsd:3000,marginFloor:.08,ytmFloor:5/365,kIM:.65,kMM:.5,takerFee:.0005,settleFeeRate:.002,openInterest:1000000,volume24h:1000000,paymentPeriod:28800,dailyVolatility:.01,status:'GOOD',snapshotAt:now,ohlcv:[],fundingHistory:Array.from({length:30},(_,i)=>({ts:now/1000-(30-i)*86400,c:.06+i*.002}))};
  useBorosStore.setState({markets:[m],loadedAt:now,loading:true,stale:false});
  useMarketsStore.setState({lastSyncAt:{crypto_top_200:now,ondo_tokenized:now,xstocks:now}});
 });
 const send=page.getByRole('button',{name:'ارسال برای تحلیل',exact:true});
 assert(await send.isEnabled(),'market analysis must work without any wallet');
 await send.click();
 await page.getByText('تحلیل آزمایشی فارسی: تمرکز دارایی را بررسی کنید.',{exact:true}).waitFor({timeout:25000}).catch(async e=>{ console.log(JSON.stringify({text:await page.locator('main').innerText(),errors,request:!!analysisBody})); throw e; });
 assert(analysisBody.context.app,'server-bound request must include all-app data');
 assert(analysisBody.context.app.sections.find(s=>s.key==='boros').rows.some(r=>r.metrics.projectedGrossUsd>0));
 assert.equal(analysisBody.context.app.rankings.find(r=>r.period==='90d'&&r.universe==='all').mostProfit[0].symbol,'ETH');
 assert.equal(analysisBody.context.app.rankings.find(r=>r.period==='90d'&&r.universe==='all').leastLoss[0].symbol,'BTC');
 assert.equal(analysisBody.context.total,null);
 assert.equal(analysisBody.context.app.sections.length,17);
 await page.locator('summary').filter({hasText:'داده‌های مبنای پاسخ'}).click();
 for(const theme of ['light','dark']) {
  await page.evaluate(t=>document.documentElement.classList.toggle('dark',t==='dark'),theme);
  for(const width of [320,390,1440]) {await page.setViewportSize({width,height:900});await fits();}
 }
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'/tmp/darino-assistant-context-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS: actual assistant request includes Boros, five return periods, 17 sections; no-wallet public analysis; 320/390/1440 light/dark layouts. Providers and Gemini are mocked; no real keys or accounts.');
} finally { await browser.close(); }

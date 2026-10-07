/** Isolated browser QA with mocked providers: never sends real wallets or credentials. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({channel:'chrome'});
const page = await browser.newPage({viewport:{width:390,height:844}});
page.setDefaultTimeout(15000);
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
snapshot.positions.push(...['YT','PT'].map((kind,i)=>({...snapshot.positions[0],id:kind,tokenId:kind,contract:'0x'+String(i+2).repeat(40),name:kind+'-sUSDat-30DEC2026',symbol:kind+'-sUSDat-30DEC2026',quantity:'1234567.890123',value:i?100:4.01,price:i?10:0.401,icon:'/logos/token-usdc.svg',verified:false,protocol:'Pendle'})));
snapshot.total=11435.01;
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
const fits=async()=>{
 const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,outside:[...document.querySelectorAll('main *')].filter(e=>{const r=e.getBoundingClientRect();return r.right>innerWidth+1||r.left<-1;}).slice(0,12).map(e=>({tag:e.tagName,text:e.textContent?.slice(0,80),class:e.getAttribute('class'),width:e.getBoundingClientRect().width,left:e.getBoundingClientRect().left}))}));
 if(dimensions.scroll>dimensions.width+1)await page.screenshot({path:'/tmp/darino-yield-overflow.png',fullPage:false});
 assert(dimensions.scroll<=dimensions.width+1,'horizontal overflow at '+page.url()+' '+JSON.stringify(dimensions));
};
try {
 console.log('Checking wallets');
 await page.goto(base+'/#/wallets');
 await page.getByRole('heading',{name:'مدیریت کیف پول‌ها',exact:true}).waitFor();
 await page.getByRole('button',{name:'افزودن کیف پول',exact:true}).click();
 await page.getByPlaceholder('مثلاً کیف پول اصلی').fill('کیف آزمایشی');
 await page.getByPlaceholder('0x…',{exact:true}).fill(address);
 await page.getByRole('button',{name:'افزودن',exact:true}).click();
 await page.getByRole('button',{name:'مدیریت کیف آزمایشی',exact:true}).waitFor();
 await fits();
 await page.getByLabel('جست‌وجوی کیف پول').fill('ناموجود');
 await page.getByText('کیف پولی با این نام یا آدرس پیدا نشد.',{exact:true}).waitFor();
 await page.getByLabel('جست‌وجوی کیف پول').fill('');
 for(const width of [390,1440]) {
  await page.setViewportSize({width,height:1000});
  await fits();
  await page.screenshot({path:`/tmp/darino-wallets-redesign-${width}.png`,fullPage:true});
 }
 console.log('Checking dashboard');
 await page.evaluate(()=>location.hash='#/dashboard');
 await page.locator('[data-yield-label="YT"]').first().waitFor();
 await page.locator('[data-yield-label="PT"]').first().waitFor();
 for(const kind of ['YT','PT']) {
  const mark=page.locator(`[data-yield-token="${kind}"]`).first();
  await mark.waitFor();
  const logo=mark;
  assert.equal(await logo.locator(`[data-yield-logo-badge="${kind}"]`).innerText(),kind);
  assert.equal(await logo.locator('.token-network-badge img').getAttribute('src'),'/logos/chain-1.svg');
  assert.equal(await logo.locator('.entity-logo img').first().getAttribute('src'),'/logos/token-usdc.svg');
 }
 for(const width of [390,768,1440]) {
  await page.setViewportSize({width,height:844});await page.waitForTimeout(300);await fits();
  const rows=page.locator('.positions-grid').filter({has:page.locator('[data-yield-label]')});
  assert(await rows.count()>0);
  for(const row of await rows.all()) {
   const label=row.locator('[data-yield-label]');assert.equal(await label.innerText(),'sUSDat');
   const qty=row.locator('.positions-quantity');assert(!/[A-Za-z]|وای|پی/.test(await qty.innerText()));
   assert.equal(await qty.evaluate(e=>getComputedStyle(e.firstElementChild).whiteSpace),'nowrap');
   const containerWide=await row.evaluate(e=>e.closest('.positions-list-container').getBoundingClientRect().width>=640);
   if(containerWide)assert.equal(await qty.evaluate(e=>getComputedStyle(e).paddingInlineStart),'0px');
  }
  await page.locator('[data-yield-token="YT"]').first().scrollIntoViewIfNeeded();
  await page.screenshot({path:`/tmp/darino-pendle-compact-${width}.png`,fullPage:false});
 }

 assert.equal(await page.locator('#eth-scenario-title,#whatif-title,#movers-title').count(),0);
 await fits();
 console.log('Checking market-performance');
 await page.evaluate(()=>location.hash='#/market-performance');
 await page.getByRole('heading',{name:'عملکرد بازار',exact:true}).waitFor();
 assert.equal(await page.locator('#whatif-title,#eth-scenario-title').count(),0);
 assert.equal(await page.locator('#movers-title').count(),1);
 for(const label of ['۱ روزه','۷ روزه','۳۰ روزه','۶۰ روزه','۹۰ روزه'])await page.locator('section').filter({has:page.locator('#movers-title')}).getByRole('radio',{name:label,exact:true}).click();
 await page.setViewportSize({width:390,height:844});await fits();
 console.log('Checking simulation');
 await page.evaluate(()=>location.hash='#/simulation');
 await page.getByRole('heading',{name:'مقدار تتر شبیه‌سازی',exact:true}).waitFor();
 await page.getByLabel('از ۱ ژانویهٔ ۲۰۲۵',{exact:true}).fill('۱۰۰۰');
 await page.getByLabel('از ۱ ژوئیهٔ ۲۰۲۶',{exact:true}).fill('۲۰۰۰');
 await page.getByRole('button',{name:'ذخیره و بازمحاسبه',exact:true}).click();
 await page.getByText('سرمایه‌های دستی ذخیره و سناریوها بازمحاسبه شدند',{exact:true}).waitFor();
 await fits();
 await page.reload();
 await page.getByRole('heading',{name:'مقدار تتر شبیه‌سازی',exact:true}).waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('input')].some(i=>i.value==='1000')&&[...document.querySelectorAll('input')].some(i=>i.value==='2000'));
 assert.equal(await page.locator('#whatif-title').count(),1);
 assert.equal(await page.locator('#movers-title').count(),0);
 await fits();
 await page.screenshot({path:'/tmp/darino-simulation-manual-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS: module separation, valued YT/PT, wallet redesign, Persian USDT inputs and persistence; mobile/desktop without overflow');
} finally {await browser.close();}

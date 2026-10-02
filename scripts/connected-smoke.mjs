/** Isolated browser QA with mocked providers: never sends real wallets or credentials. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({channel:'chrome'});
const page = await browser.newPage({viewport:{width:390,height:844}});
const errors=[]; page.on('pageerror',e => errors.push({url:page.url(),stack:e.stack}));
const address = '0x'+'ab'.repeat(20); let failWallet=false; let analysisBody;
const snapshot={address,fetchedAt:Date.now(),total:1300,change:20,complete:true,unpriced:0,chains:[{id:'ethereum',name:'Ethereum',icon:null}],positions:[{id:'eth',tokenId:'eth',chain:'ethereum',contract:null,name:'Ether',symbol:'ETH',icon:'/logos/token-eth.png',quantity:'0.300000000000000001',value:1200,price:4000,type:'wallet',protocol:null,protocolIcon:null,group:null,receipt:null,displayable:true,spam:false},{id:'weth',tokenId:'weth',chain:'robinhood',contract:'0x'+'11'.repeat(20),name:'Wrapped Ether',symbol:'WETH',icon:'/logos/token-eth.png',quantity:'2',value:100,price:50,type:'wallet',protocol:null,protocolIcon:null,group:null,receipt:null,displayable:true,spam:false}]};
await page.route('**/*',async route => {
 const u=new URL(route.request().url());
 if(u.hostname==='api.arcus.xyz') { const account={address,accountIndex:0,netQuoteBalance:'500',equity:'500',freeCollateral:'500',netDeposits:'500',pendingDeposits:'0',pendingWithdrawals:'0',positions:{},sequenceNumber:1};return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(u.pathname==='/v1/account'?account:[])}); }
 if(u.origin!==base) return route.abort();
 if(!u.pathname.startsWith('/api/') && !u.pathname.includes('-api')) return route.continue();
 let body={configured:false}; let status=200;
 if(u.pathname==='/api/auth') {
  const op=u.searchParams.get('op');
  if(op==='sessions') body={sessions:[],recentlyEnded:[]};
  else if(op==='passkeys') body={passkeys:[]};
  else if(op==='events') body={events:[]};
  else body={available:true,authenticated:true,session:{id:'qa',label:'QA',createdAt:Date.now(),stepUpFresh:true}};
 }
 else if(u.pathname==='/api/accounting') body={configured:false,accounts:[],entries:[],lots:[],events:[]};
 else if(u.pathname==='/api/custody') body={configured:false,records:[]};
 else if(u.pathname==='/api/integrations') {
  const op=u.searchParams.get('op');
  if(op==='wallet') {body=failWallet?{error:'خطای آزمایشی اتصال'}:snapshot;status=failWallet?502:200;}
  else if(op==='transactions') body={rows:[{id:'t1',hash:'0xtest',chain:'ethereum',type:'receive',status:'confirmed',minedAt:new Date().toISOString(),fee:0.1,transfers:[{direction:'in',symbol:'ETH',quantity:'0.1',value:400,address:'0x'+'cd'.repeat(20),icon:'/logos/token-eth.png'}]}],next:null,fetchedAt:Date.now()};
  else if(op==='arcus-spot') body={tokens:[{address:'0x'+'11'.repeat(20),wrappedTokenAddress:null,symbol:'WETH',name:'Wrapped Ether',decimals:18,source:'arcus',verified:true}],fetchedAt:Date.now()};
  else if(op==='pnl') body={data:{attributes:{realized_gain:10,unrealized_gain:20,total_fee:1}}};
  else if(op==='analyze') {analysisBody=route.request().postDataJSON();body={answer:'تحلیل آزمایشی فارسی: تمرکز دارایی را بررسی کنید.',generatedAt:Date.now()};}
  else body={zerion:true,gemini:true};
 } else {body={error:'provider mocked'};status=503;}
 await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
});
const fits=async()=>{ const widths=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,outside:[...document.querySelectorAll('main *')].filter(e=>(e.getBoundingClientRect().right>innerWidth+1||e.getBoundingClientRect().left < -1) && ![...function*(e){while(e.parentElement && e.parentElement.tagName!=='MAIN'){e=e.parentElement;yield e;}}(e)].some(a=>['auto','hidden','scroll','clip'].includes(getComputedStyle(a).overflowX))).slice(0,12).map(e=>({tag:e.tagName,text:e.textContent?.slice(0,70),class:e.className}))})); if(widths.scroll>widths.width+1) await page.screenshot({path:'/tmp/darino-overflow.png',fullPage:true}); assert(widths.scroll<=widths.width+1,JSON.stringify({url:page.url(),...widths})); };
try {
 await page.goto(base+'/#/wallets');
 await page.getByRole('heading',{name:'کیف پول‌های متصل',exact:true}).waitFor();
 await page.getByPlaceholder('مثلاً کیف پول اصلی').fill('کیف آزمایشی');
 await page.getByPlaceholder('0x…',{exact:true}).fill(address);
 await page.getByRole('button',{name:'دریافت پیش‌نمایش'}).click();
 await page.getByRole('heading',{name:'پیش‌نمایش دارایی‌ها'}).waitFor();
 await fits(); await page.screenshot({path:'/tmp/darino-wallet-preview.png',fullPage:true});
 await page.getByRole('button',{name:'تأیید و اتصال'}).click();
 await page.getByRole('heading',{name:'دارایی‌های کیف آزمایشی'}).waitFor();
 await page.getByRole('button',{name:'دریافت / به‌روزرسانی'}).click();
 await page.getByText('تأییدشده',{exact:true}).waitFor();
 await fits();
 failWallet=true; await page.getByRole('button',{name:'به‌روزرسانی',exact:true}).click();
 await page.getByText('خطای آزمایشی اتصال',{exact:true}).first().waitFor();
 assert(/[1۱][,٬][3۳][0۰][0۰]/.test(await page.locator('main').innerText()),'last successful balance lost');
 failWallet=false;
 await page.evaluate(()=>location.hash='#/assistant');
 await page.getByRole('heading',{name:'دستیار پرتفولیو',exact:true}).waitFor();
 await page.getByPlaceholder('پرتفولیوی من را تحلیل کن…').fill('ریسک من چقدر است؟');
 await page.getByRole('button',{name:'ارسال برای تحلیل'}).click();
 await page.getByText('تحلیل آزمایشی فارسی: تمرکز دارایی را بررسی کنید.',{exact:true}).waitFor();
 assert(!JSON.stringify(analysisBody).includes(address),'wallet address sent to AI');
 assert.equal(analysisBody.context.total,1300);
 await fits(); await page.screenshot({path:'/tmp/darino-assistant-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 await page.waitForTimeout(400); await page.screenshot({path:'/tmp/darino-assistant-desktop.png',fullPage:false}); await fits();
 await page.evaluate(()=>location.hash='#/simulation');
 await page.getByRole('heading',{name:'سرمایهٔ دستی شبیه‌سازی'}).waitFor();
 assert.equal(await page.getByText('خودکار از حسابداری',{exact:true}).count(),0);
 await page.evaluate(()=>location.hash='#/dashboard');
 await page.getByText('ارزش دارایی‌های متصل',{exact:true}).waitFor(); await fits();
 assert.equal(await page.locator('a[href="#/pendle"],a[href="#/loop"]').count(),0);
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>location.hash='#/accounting');
 await page.getByRole('heading',{name:'سابقهٔ خرید و سود و زیان',exact:true}).waitFor();
 await page.getByRole('button',{name:'به‌روزرسانی',exact:true}).click();
 await page.getByRole('button',{name:'بررسی خریدهای قبلی'}).click();
 await page.getByText('خرید قبلی قابل انتقال یافت نشد.').waitFor();
 await page.getByRole('button',{name:'تأیید انتقال و کنارگذاشتن دفتر قدیمی'}).click();
 await page.getByRole('button',{name:'بررسی خریدهای قبلی'}).waitFor({state:'hidden'});
 const costSection=page.getByRole('region',{name:'تکمیل بهای خرید اولیه'});
 await costSection.locator('select').selectOption('fungible:eth');
 await costSection.locator('input').nth(0).fill('0.300000000000000001');
 await costSection.locator('input').nth(1).fill('2000');
 await page.getByRole('button',{name:'ثبت بهای خرید',exact:true}).click();
 await page.getByText('دسته‌های خرید',{exact:true}).waitFor();
 await fits();await page.screenshot({path:'/tmp/darino-cost-mobile.png',fullPage:true});
 await page.evaluate(()=>location.hash='#/holdings');
 await page.getByRole('heading',{name:'دارایی‌ها و فعالیت شبکه‌ای',exact:true}).waitFor();await fits();
 await page.screenshot({path:'/tmp/darino-network-mobile.png',fullPage:true});
 await page.evaluate(()=>location.hash='#/arcus');
 await page.getByRole('button',{name:'افزودن زیرحساب آرکوس',exact:true}).click();
 const arcusForm=page.getByRole('dialog');
 await arcusForm.getByLabel('نام',{exact:true}).fill('آرکوس آزمایشی');
 await arcusForm.getByLabel('آدرس عمومی کیف پول',{exact:true}).fill(address);
 await arcusForm.getByLabel('شمارهٔ زیرحساب',{exact:true}).fill('0');
 await arcusForm.getByRole('button',{name:'ذخیره',exact:true}).click();
 await page.getByRole('tab',{name:'اسپات',exact:true}).click();
 await page.getByText('منبع موجودی: زریون · فهرست توکن: آرکوس').waitFor();
 assert.equal(await page.getByText('WETH',{exact:true}).count()>0,true);await fits();
 await page.screenshot({path:'/tmp/darino-spot-mobile.png',fullPage:true});
 const routes=['/','/dashboard','/wallets','/assistant','/simulation','/defi','/boros','/accounting','/holdings','/arcus','/calculators','/vehicle','/realestate','/security'];
 for(const theme of ['light','dark']) {
 await page.evaluate(t => document.documentElement.classList.toggle('dark',t==='dark'),theme);
 for(const width of [320,390,1440]) {
  await page.setViewportSize({width,height:900});
  for(const path of routes) {
   await page.evaluate(p => location.hash='#'+p,path);
   await page.waitForTimeout(180);
   await fits();
   assert(await page.locator('main h1').count(),`page failed to render: ${path}`);
  }
 }
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: preview → confirmation → transactions → stale retention → AI privacy → manual simulation → cost migration → purchase cost → network activity → Arcus spot; 14 routes at 320/390/1440px fit in light and dark themes.');
} finally {await browser.close();}

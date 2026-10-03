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
 await page.goto(base+'/#/wallets');
 await page.getByRole('heading',{name:'مدیریت کیف پول‌ها',exact:true}).waitFor();
 await page.getByRole('button',{name:'افزودن کیف پول',exact:true}).click();
 await page.getByPlaceholder('مثلاً کیف پول اصلی').fill('کیف آزمایشی');
 await page.getByPlaceholder('0x…',{exact:true}).fill(address);
 await page.getByRole('button',{name:'افزودن',exact:true}).click();
 await page.getByRole('button',{name:'مدیریت کیف آزمایشی',exact:true}).waitFor();
 assert.equal(await page.locator('main canvas').count(),0);assert.equal(await page.locator('main').getByText('اتریوم',{exact:true}).count(),0);assert.equal(await page.getByRole('heading',{name:'تراکنش‌های واقعی'}).count(),0);
 await fits();await page.screenshot({path:'/tmp/darino-wallet-management-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'مدیریت کیف آزمایشی',exact:true}).click();
 const walletSheet=page.getByRole('dialog',{name:'کیف آزمایشی',exact:true});await walletSheet.getByRole('button',{name:'تغییر نام',exact:true}).click();await walletSheet.getByLabel('نام کیف پول').fill('کیف آزمایشی جدید');await walletSheet.getByRole('button',{name:'ذخیرهٔ نام',exact:true}).click();await page.getByRole('dialog',{name:'کیف آزمایشی جدید',exact:true}).waitFor();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'مدیریت کیف آزمایشی جدید',exact:true}).click();await page.getByRole('dialog',{name:'کیف آزمایشی جدید',exact:true}).getByRole('button',{name:'تغییر نام',exact:true}).click();await page.getByLabel('نام کیف پول').fill('کیف آزمایشی');await page.getByRole('button',{name:'ذخیرهٔ نام',exact:true}).click();await page.keyboard.press('Escape');
 await page.evaluate(()=>location.hash='#/dashboard');await page.getByText('ارزش دارایی‌های متصل',{exact:true}).waitFor();await page.getByRole('img',{name:'نمودار ارزش کیف پول کیف آزمایشی؛ ۱ روز'}).waitFor();
 assert.equal(await page.getByText('جعلی آزمایشی',{exact:false}).count(),0);
 failWallet=true;await page.getByRole('button',{name:'به‌روزرسانی پرتفولیو',exact:true}).click();await page.getByText(/خطای آزمایشی اتصال/).first().waitFor();assert(/[1۱][,٬][3۳][0۰][0۰]/.test(await page.locator('main').innerText()),'last successful balance lost');failWallet=false;
 await page.evaluate(()=>location.hash='#/assistant');
 await page.getByRole('heading',{name:'دستیار پرتفولیو',exact:true}).waitFor();
 await page.getByPlaceholder('پرتفولیوی من را تحلیل کن…').fill('ریسک من چقدر است؟');
 await page.getByRole('button',{name:'ارسال برای تحلیل'}).click();
 await page.getByText('تحلیل آزمایشی فارسی: تمرکز دارایی را بررسی کنید.',{exact:true}).waitFor();
 assert(!JSON.stringify(analysisBody).includes(address),'wallet address sent to AI');
 assert.equal(analysisBody.context.total,1300.8);assert(!JSON.stringify(analysisBody).includes('fake-usdt'));assert(!JSON.stringify(analysisBody).includes('NOLOGO'));
 await fits(); await page.screenshot({path:'/tmp/darino-assistant-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 await page.waitForTimeout(400); await page.screenshot({path:'/tmp/darino-assistant-desktop.png',fullPage:false}); await fits();
 await page.evaluate(()=>location.hash='#/simulation');
 await page.getByRole('heading',{name:'سرمایهٔ دستی شبیه‌سازی'}).waitFor();
 assert.equal(await page.getByText('خودکار از حسابداری',{exact:true}).count(),0);
 await page.evaluate(()=>location.hash='#/dashboard');
 await page.getByText('ارزش دارایی‌های متصل',{exact:true}).waitFor();
 await page.getByRole('button',{name:'به‌روزرسانی پرتفولیو',exact:true}).click();
 await page.getByText('دادهٔ قدیمی',{exact:true}).waitFor({state:'hidden'});await fits();
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('img',{name:'نمودار ارزش کیف پول کیف آزمایشی؛ ۱ روز'}).waitFor();
 await page.getByText('≈ ۱۹۵.۱۲ میلیون تومان',{exact:true}).first().waitFor();
 await page.waitForTimeout(350);await fits();
 await page.screenshot({path:'/tmp/darino-clean-dashboard.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(450);
 const rail=page.getByRole('complementary',{name:'فعالیت‌های اخیر'});await rail.getByRole('button',{name:'جزئیات دریافت · کیف آزمایشی',exact:true}).waitFor();
 const columns=await page.evaluate(()=>{const main=document.querySelector('.portfolio-dashboard-grid')?.firstElementChild?.getBoundingClientRect(),rail=document.querySelector('.portfolio-recent')?.getBoundingClientRect();return {main:main&&{top:main.top,left:main.left,width:main.width},rail:rail&&{top:rail.top,left:rail.left,width:rail.width}};});assert(Math.abs(columns.main.top-columns.rail.top)<3,'desktop rail must align with assets');assert(columns.main.width>columns.rail.width,'chart should own wider desktop column');
 await page.getByRole('button',{name:'بر اساس پلتفرم',exact:true}).click();await fits();assert.equal(await page.getByRole('button',{name:'بر اساس پلتفرم',exact:true}).getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'بر اساس توکن',exact:true}).click();await fits();await page.waitForFunction(()=>{const c=document.querySelector('#portfolio-assets canvas');if(!c||!c.width||!c.height)return false;return c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0);});
 await page.screenshot({path:'/tmp/darino-reference-portfolio-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'نمایش همهٔ تراکنش‌ها',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#portfolio-tab-activity')?.getAttribute('aria-selected')==='true');assert.equal(await page.getByRole('tab',{name:'تراکنش‌ها',exact:true}).getAttribute('aria-selected'),'true');
 await page.locator('main').getByText('یونی‌سواپ',{exact:true}).first().waitFor();await fits();await page.screenshot({path:'/tmp/darino-clean-transactions.png',fullPage:true});
 await page.getByRole('button',{name:'جزئیات دریافت · کیف آزمایشی',exact:true}).click();
 await page.screenshot({path:'/tmp/darino-native-transaction-sheet.png',fullPage:true});
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'فیلتر تراکنش‌ها',exact:true}).click();
 await page.getByRole('dialog',{name:'فیلتر تراکنش‌ها',exact:true}).getByLabel('نوع تراکنش').selectOption('receive');
 await page.getByRole('button',{name:'نمایش نتیجه',exact:true}).click();
 await page.getByRole('searchbox',{name:'جستجوی تراکنش'}).fill('ناموجود');
 await page.getByText('تراکنش قابل نمایش یافت نشد.',{exact:true}).waitFor();
 await page.getByRole('searchbox',{name:'جستجوی تراکنش'}).fill('');
 await page.setViewportSize({width:1440,height:1000});
 await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(450);
 await page.screenshot({path:'/tmp/darino-reference-activity-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
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
 await costSection.getByRole('button',{name:'انتخاب رمزارز',exact:true}).click();
 const picker=page.getByRole('dialog',{name:'انتخاب رمزارز'});
 assert.equal(await picker.getByText('USDT',{exact:true}).count(),0);
 assert.equal(await picker.getByText('NOLOGO',{exact:true}).count(),0);
 await picker.getByRole('searchbox',{name:'جستجوی رمزارز'}).pressSequentially('اتریوم');
 assert.equal(await picker.getByRole('searchbox',{name:'جستجوی رمزارز'}).inputValue(),'اتریوم');
 assert.equal(await picker.getByRole('button',{name:'انتخاب اتر رپ شده · WETH',exact:true}).count(),0);
 await picker.getByRole('searchbox',{name:'جستجوی رمزارز'}).fill('');
 await page.screenshot({path:'/tmp/darino-asset-picker.png',fullPage:true});
 await picker.getByRole('button',{name:'انتخاب اتریوم · ETH',exact:true}).click();
 await costSection.locator('input').nth(0).fill('0.300000000000000001');
 await costSection.locator('input').nth(1).fill('2000');
 await costSection.getByRole('button',{name:'تاریخ خرید',exact:true}).click();
 const calendar=page.getByRole('dialog',{name:'تاریخ خرید',exact:true});
 await page.waitForTimeout(350);await fits();await page.screenshot({path:'/tmp/darino-jalali-calendar.png'});
 await calendar.getByRole('button',{name:'پاک‌کردن',exact:true}).click();
 await costSection.getByRole('button',{name:'تاریخ خرید',exact:true}).click();
 await page.getByRole('dialog',{name:'تاریخ خرید',exact:true}).getByRole('button',{name:'امروز',exact:true}).click();
 await page.getByRole('button',{name:'ثبت بهای خرید',exact:true}).click();
 await page.getByText('دسته‌های خرید',{exact:true}).waitFor();
 await fits();await page.screenshot({path:'/tmp/darino-cost-mobile.png',fullPage:true});
 await page.evaluate(()=>location.hash='#/holdings');await page.getByRole('tab',{name:'تراکنش‌ها',exact:true}).waitFor();assert.equal(await page.getByRole('tab',{name:'تراکنش‌ها',exact:true}).getAttribute('aria-selected'),'true');assert.equal(await page.getByRole('link',{name:'دارایی و فعالیت شبکه‌ای',exact:true}).count(),0);await page.getByText('تطبیق انتقال‌های نیازمند بررسی',{exact:true}).waitFor();await fits();
 await page.getByRole('tab',{name:'دارایی‌ها',exact:true}).click();await page.getByRole('button',{name:'انتخاب شبکه',exact:true}).click();
 const networkPicker=page.getByRole('dialog',{name:'انتخاب شبکه',exact:true});await networkPicker.getByRole('option',{name:/موناد/}).waitFor();await networkPicker.getByRole('option',{name:/پلاسما/}).waitFor();assert.equal(await networkPicker.getByRole('option',{name:/بلست/}).count(),0);await fits();await page.screenshot({path:'/tmp/darino-network-picker.png'});await networkPicker.getByRole('option',{name:/رابین‌هود/}).click();await page.getByRole('button',{name:'انتخاب شبکه',exact:true}).click();await page.getByRole('dialog',{name:'انتخاب شبکه',exact:true}).getByRole('option',{name:'همهٔ شبکه‌ها',exact:true}).click();
 await page.evaluate(()=>location.hash='#/arcus');
 await page.getByRole('button',{name:'افزودن زیرحساب آرکوس',exact:true}).click();
 const arcusForm=page.getByRole('dialog');
 await arcusForm.getByLabel('نام',{exact:true}).fill('آرکوس آزمایشی');
 await arcusForm.getByLabel('آدرس عمومی کیف پول',{exact:true}).fill(address);
 await arcusForm.getByLabel('شمارهٔ زیرحساب',{exact:true}).fill('0');
 await arcusForm.getByRole('button',{name:'ذخیره',exact:true}).click();
 await page.getByText('اعتبار تسویهٔ پرپچوال · USDG',{exact:true}).waitFor();
 await fits();await page.screenshot({path:'/tmp/darino-arcus-perp-native.png',fullPage:true});
 await page.getByRole('tab',{name:'اسپات',exact:true}).click();
 await page.getByText('مبنای موجودی',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('main')?.innerText.includes('WETH'));
 assert((await page.locator('main').innerText()).includes('WETH'));await fits();
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
 // Emulate the iOS installed-PWA signal before app modules load.
 await page.addInitScript(()=>Object.defineProperty(navigator,'standalone',{get:()=>true,configurable:true}));
 await page.evaluate(()=>location.hash='#/dashboard');await page.reload();
 await page.waitForFunction(()=>document.documentElement.dataset.installedPwa==='true');
 for(const width of [320,390]){
  await page.setViewportSize({width,height:844});
  for(const path of ['/dashboard','/wallets','/holdings']){await page.evaluate(p=>location.hash='#'+p,path);await page.waitForTimeout(350);await fits();}
 }
 await page.evaluate(()=>location.hash='#/dashboard');await page.waitForTimeout(450);
 await page.screenshot({path:'/tmp/darino-native-pwa.png',fullPage:true});
 console.log('PASS: iOS standalone PWA layouts at 320/390px.');
 quotaWallet=true;await page.evaluate(()=>location.hash='#/dashboard');await page.reload();await page.getByText('ارزش دارایی‌های متصل',{exact:true}).waitFor();await page.getByText(/سهمیهٔ روزانهٔ زریون تمام شده/).first().waitFor();assert(/[1۱][,٬][3۳][0۰][0۰]/.test(await page.locator('main').innerText()),'persisted wallet disappeared after reload and quota');await fits();console.log('PASS: cached wallet survives reload and daily quota; Monad/Plasma and Persian protocol identity present.');
 assert.deepEqual(errors,[]);
 console.log('PASS: minimal management → rename → transactions → stale retention → AI privacy → manual simulation → cost migration → purchase cost → legacy route redirect → Arcus spot; 14 routes at 320/390/1440px fit in light and dark themes.');
} finally {await browser.close();}

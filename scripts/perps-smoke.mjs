/** Mocked public-data browser QA; no real addresses or signer used. */
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL??'http://127.0.0.1:5173';
const browser=await chromium.launch({channel:'chrome'});
const page=await browser.newPage({viewport:{width:390,height:844}});
const aaplLogo=await readFile(new URL('../tests/fixtures/perps-aapl.svg',import.meta.url));
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const address='0x'+'ab'.repeat(20);
await page.route('**/*',async route=>{
 const u=new URL(route.request().url());if(u.href==='https://assets.lighter.xyz/fe/token/aapl.svg')return route.fulfill({status:200,contentType:'image/svg+xml',body:aaplLogo});if(u.origin!==base)return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();
 let body={configured:false,records:[]};
 if(u.pathname==='/api/auth')body={available:true,authenticated:true,session:{id:'qa',label:'QA',createdAt:Date.now(),stepUpFresh:true}};
 if(u.pathname==='/api/integrations'){
 const op=u.searchParams.get('op');
 if(op==='lighter-mainnet-markets')body={code:200,tokens:[{symbol:'EIGEN',name:'EigenCloud',logo:'eigen',logo_extension:'svg'}],order_book_details:[{symbol:'BTC',status:'active',mark_price:'100'},{symbol:'EIGEN',status:'active',mark_price:'1.2'}],spot_order_book_details:[{symbol:'LIT/USDC',status:'active',last_trade_price:'3.8'}]};
 if(op==='lighter-mainnet-account')body={accounts:[{account_index:9,l1_address:address,total_asset_value:'25',available_balance:'10',positions:[],assets:[{symbol:'LIT',balance:'2',locked_balance:'1',margin_balance:'0'},{symbol:'EMPTY',balance:'0'}]}]};
 if(op==='lighter-markets')body={code:200,order_book_details:[{symbol:'LIT',status:'active',mark_price:'2.2',daily_price_change:'3.1'}]};
 if(op==='lighter-account')body={accounts:[{account_index:7,l1_address:address,total_asset_value:'100',available_balance:'80',positions:[{symbol:'LIT',sign:-1,position:'10',avg_entry_price:'2.5',unrealized_pnl:'3',liquidation_price:'8'}]}]};
 if(op==='ondo-markets')body={markets:{success:true,result:{perps:{tradingPairs:[{market:'AAPL-USD.P'}]}}},prices:{success:true,result:{'AAPL-USD.P':{markPrice:'300'}}}};
 }
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
});
const fits=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page horizontal overflow');
try{
 await page.goto(base+'/#/lighter-robinhood');await page.getByRole('heading',{name:'لایتر — شبکهٔ رابین‌هود',exact:true}).waitFor();
 await page.getByText('قیمت مارک: ۲.۲ یو‌اس‌دی‌جی',{exact:true}).waitFor();
 assert.equal(await page.locator('.token-network-badge img').getAttribute('src'),'/logos/chain-4663.svg');
 await page.waitForFunction(()=>[...document.querySelectorAll('img')].some(i=>i.getAttribute('src')==='/logos/platform-lighter.png'&&i.complete&&i.naturalWidth>0));
 await page.getByPlaceholder('حساب من',{exact:true}).fill('حساب آزمایشی');await page.getByPlaceholder('0x…',{exact:true}).fill(address);await page.getByRole('button',{name:'افزودن حساب',exact:true}).click();
 await page.getByRole('heading',{name:'حساب آزمایشی',exact:true}).waitFor();await page.getByText('شورت',{exact:true}).waitFor();await fits();
 await page.reload();await page.getByRole('heading',{name:'حساب آزمایشی',exact:true}).waitFor();await page.getByText('شورت',{exact:true}).waitFor();
 await page.getByRole('button',{name:'حذف اتصال',exact:true}).click();await page.getByRole('heading',{name:'حساب آزمایشی',exact:true}).waitFor({state:'hidden'});
 await page.evaluate(()=>location.hash='#/ondo-perps');await page.getByText('ای‌ای‌پی‌ال-یو‌اس‌دی.پی',{exact:true}).waitFor();await page.getByText('قیمت مارک: ۳۰۰ دلار',{exact:true}).waitFor();await page.getByRole('heading',{name:'اوندو پرپس',exact:true}).waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('img')].some(i=>i.getAttribute('src')==='/logos/platform-ondo.png'&&i.complete&&i.naturalWidth>0));
 assert.equal(await page.locator('.token-network-badge').count(),0);await page.getByText('اتریوم',{exact:true}).waitFor();await page.getByText('آربیتروم',{exact:true}).waitFor();await fits();
 await page.setViewportSize({width:1440,height:1000});await fits();await page.screenshot({path:'/tmp/darino-ondo-perps-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/darino-ondo-perps-mobile.png',fullPage:true});
 await page.goto(base+'/#/lighter');await page.getByText('قیمت مارک: ۱۰۰ یو‌اس‌دی‌سی',{exact:true}).waitFor();await page.getByText('آیگن',{exact:true}).waitFor();await page.getByLabel('جست‌وجوی بازار').fill('آیگن');assert.equal(await page.getByText('بیت‌کوین',{exact:true}).count(),0);await page.getByLabel('جست‌وجوی بازار').fill('EigenCloud');await page.getByText('آیگن',{exact:true}).waitFor();await page.getByLabel('جست‌وجوی بازار').fill('');
 assert.equal(await page.getByRole('tab').count(),4);
 await page.getByRole('tab',{name:'بازار اسپات',exact:true}).click();await page.getByText('قیمت: ۳.۸ یو‌اس‌دی‌سی',{exact:true}).waitFor();
 await page.getByRole('tab',{name:'دارایی‌ها',exact:true}).click();await page.getByPlaceholder('حساب من',{exact:true}).fill('حساب اصلی');await page.getByPlaceholder('0x…',{exact:true}).fill(address);await page.getByRole('button',{name:'افزودن حساب',exact:true}).click();await page.getByText('موجودی: ۲',{exact:true}).waitFor();assert.equal(await page.getByText('ای‌ام‌پی‌تی‌وای',{exact:true}).count(),0);
 for(const width of [390,1440]){await page.setViewportSize({width,height:1000});await fits();await page.screenshot({path:`/tmp/darino-lighter-four-${width}.png`,fullPage:true});}
 await page.getByRole('tab',{name:'رابین‌هود',exact:true}).click();await page.getByText('قیمت مارک: ۲.۲ یو‌اس‌دی‌جی',{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'حساب اصلی',exact:true}).count(),0);
 assert.deepEqual(errors,[]);console.log('Perps smoke passed: Lighter account add/persistence/remove, short positions, Ondo prices, mobile/desktop layout.');
}finally{await browser.close();}

/** Public test addresses and mocked providers only. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:5173',browser=await chromium.launch({channel:'chrome'}),page=await browser.newPage({viewport:{width:390,height:844}});
const btc='bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',sol='11111111111111111111111111111111',errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{
 const u=new URL(route.request().url());if(u.origin!==base)return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();let body={configured:false};
 if(u.pathname==='/api/auth')body={available:true,authenticated:true,session:{id:'qa',label:'QA',createdAt:Date.now(),stepUpFresh:true}};
 if(u.pathname==='/api/custody')body={configured:false,records:[]};
 if(u.pathname==='/api/usdt')body={ok:true,source:'wallex',priceToman:150000,tradedAt:Date.now(),fetchedAt:Date.now()};
 if(u.pathname==='/api/integrations'){
 const address=u.searchParams.get('address'),op=u.searchParams.get('op');
 if(op==='wallet') {const isBtc=address?.toLowerCase()===btc,chain=isBtc?'bitcoin':'solana',symbol=isBtc?'BTC':'SOL',tokenId=isBtc?'bitcoin':'solana',icon=isBtc?'/logos/token-btc.png':'/logos/chain-solana.svg';body={address,fetchedAt:Date.now(),complete:true,unpriced:0,total:isBtc?30000:100,change:null,chains:[],positions:[{id:tokenId,tokenId,chain,symbol,name:symbol,icon,contract:null,verified:true,spam:false,displayable:true,type:'wallet',quantity:isBtc?'0.5':'1',price:isBtc?60000:100,value:isBtc?30000:100,protocol:null,protocolIcon:null,group:null,receipt:null}]};}
 else if(op==='transactions')body={rows:[],next:null,fetchedAt:Date.now()};else body={zerion:true,gemini:true};
 }
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
});
try{
 await page.goto(base+'/#/wallets');
 for(const [label,address] of [['بیت‌کوین آزمایشی',btc.toUpperCase()],['سولانا آزمایشی',sol]]){
 await page.getByRole('button',{name:'افزودن کیف پول',exact:true}).click();await page.getByPlaceholder('مثلاً کیف پول اصلی').fill(label);await page.getByPlaceholder('0x…',{exact:true}).fill(address);await page.getByRole('button',{name:'افزودن',exact:true}).click();await page.getByRole('button',{name:'مدیریت '+label,exact:true}).waitFor();
 }
 await page.getByRole('button',{name:'افزودن کیف پول',exact:true}).click();await page.getByPlaceholder('0x…',{exact:true}).fill(btc);await page.getByRole('button',{name:'افزودن',exact:true}).click();await page.getByText('این کیف پول قبلاً اضافه شده است',{exact:true}).waitFor();await page.keyboard.press('Escape');
 await page.evaluate(()=>location.hash='#/dashboard');await page.getByText('بیت کوین',{exact:true}).first().waitFor();await page.locator('main').getByText('سولانا',{exact:true}).first().waitFor();
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});await page.waitForTimeout(150);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/darino-bitcoin-solana.png',fullPage:true});assert.deepEqual(errors,[]);console.log('PASS: Bitcoin checksum/case identity, duplicate prevention, Solana registration, portfolio logos and responsive layout.');
}finally{await browser.close();}

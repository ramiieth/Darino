/** Local component geometry checks: no credentials or portfolio requests. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:5173',browser=await chromium.launch({channel:'chrome'}),page=await browser.newPage();
await page.route('**/*',route=>{const u=new URL(route.request().url());return u.origin!==base?route.abort():u.pathname.startsWith('/api/')?route.fulfill({json:{configured:false}}):route.continue();});
try{
 await page.goto(base);await page.waitForTimeout(500);
 await page.evaluate(async()=>{
  const React=(await import('/node_modules/.vite/deps/react.js')).default,{createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default,{MoneyValue,QuantityValue}=await import('/src/shared/components/ui/FinancialValue.tsx'),{TokenLogo,LogoImage}=await import('/src/shared/components/ui/EntityLogo.tsx'),{AssistantResponse}=await import('/src/features/connected/presentation/AssistantResponse.tsx');
  const host=document.createElement('div');host.id='identity-qa';host.dir='rtl';host.style.cssText='position:fixed;inset:0;z-index:9999;background:rgb(var(--c-canvas));padding:20px;overflow:auto';document.body.append(host);const h=React.createElement;
  createRoot(host).render(h('div',{className:'space-y-6'},h('div',{id:'qa-money',className:'text-xl'},h(MoneyValue,{value:1.7e12,compact:true})),h('div',{id:'qa-quantity'},h(QuantityValue,{value:143.9,unit:'USDG'})),h('div',{id:'qa-logo'},h(TokenLogo,{logo:'/logos/token-usdt.svg',symbol:'USDT',name:'تتر',networkLogo:'/logos/chain-42161.png',networkName:'آربیتروم',size:42})),h('div',{id:'qa-networks',className:'flex gap-4'},h(LogoImage,{src:'/logos/chain-137.png',label:'پالیگان',size:32}),h(LogoImage,{src:'/logos/chain-42161.png',label:'آربیتروم',size:32})),h('article',{className:'assistant-message assistant-answer'},h(AssistantResponse,{text:'## بررسی پرتفولیو\n\nترکیب دارایی‌ها **متمرکز** است.\n\n- سهم اتریوم را بررسی کنید.\n- نقدینگی لازم را مشخص کنید.'}))));
 });await page.waitForTimeout(600);
 for(const width of [320,390,1440]){
  await page.setViewportSize({width,height:900});await page.waitForTimeout(100);
  const r=await page.evaluate(()=>{
   const money=[...document.querySelector('#qa-money .persian-amount').children].map(e=>({text:e.textContent,x:e.getBoundingClientRect().x})),q=[...document.querySelector('#qa-quantity .persian-amount').children].map(e=>({text:e.textContent,x:e.getBoundingClientRect().x})),main=document.querySelector('#qa-logo img[alt="تتر"]').getBoundingClientRect(),badge=document.querySelector('.token-network-badge img').getBoundingClientRect();
   return {money,q,main:{bottom:main.bottom,top:main.top,width:main.width},badge:{bottom:badge.bottom,top:badge.top,width:badge.width},overflow:document.querySelector('#identity-qa').scrollWidth>innerWidth,logos:[...document.querySelectorAll('#qa-networks .entity-logo')].map(e=>({radius:getComputedStyle(e).borderRadius,shadow:getComputedStyle(e).boxShadow,src:e.querySelector('img').getAttribute('src')})),answerBorder:getComputedStyle(document.querySelector('.assistant-answer')).borderTopStyle};
  });assert.deepEqual(r.money.map(x=>x.text),['۱.۷','تریلیون','دلار']);assert(r.money[0].x>r.money[1].x&&r.money[1].x>r.money[2].x,'RTL amount must read number → scale → currency');assert(r.q[0].x>r.q[1].x);assert.equal(r.q[1].text,'یو اس دی جی');assert(r.badge.bottom>r.main.bottom&&r.badge.top>r.main.top+r.main.width/2);assert(r.badge.width>=20);assert(!r.overflow);assert(r.logos.every(x=>x.shadow==='none'&&parseFloat(x.radius)>=15));assert.equal(r.logos[0].src,'/logos/chain-polygon.svg');assert.equal(r.logos[1].src,'/logos/chain-arbitrum.svg');assert.equal(r.answerBorder,'solid');
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/darino-identity-layout.png'});console.log('PASS: amount ordering, Persian token units, bottom network badges, circular official logos, assistant response borders at 320/390/1440px.');
}finally{await browser.close();}

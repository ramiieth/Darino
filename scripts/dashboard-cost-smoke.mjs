/** Isolated native dashboard cost-basis QA; synthetic data, no provider/key calls. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.BASE_URL??'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome' });
try {
 const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
 const errors = []; page.on('pageerror', e => errors.push(e.message));
 await page.route('**/*', route => { const u = new URL(route.request().url()); if (u.origin !== base) return route.abort(); if (u.pathname.startsWith('/api/') || u.pathname.includes('-api')) return route.fulfill({ status: 503, body: '{}' }); return route.continue(); });
 await page.goto(base);
 await page.evaluate(async () => {
  const React = (await import('/node_modules/.vite/deps/react.js')).default;
  const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  const source = await (await fetch('/src/app/App.tsx')).text();
  const routerPath = source.match(/from ["']([^"']*react-router-dom[^"']*)["']/)[1];
  const { MemoryRouter } = await import(routerPath);
  const { CostSummaryPanel } = await import('/src/features/cost-basis/presentation/CostSummaryPanel.tsx');
  const { savePref } = await import('/src/features/custody/data/repository.ts');
  const asset = { key: 'fungible:ethereum', tokenId: 'ethereum', symbol: 'ETH', name: 'اتریوم', chain: 'ethereum', contract: null, icon: '/logos/token-eth.svg' };
  const book = { version: 1, asOf: Date.now(), migrationConfirmed: true, legacyRetired: true, lots: [{ id: 'buy', asset, quantity: '.65', unitCost: '2500', fee: '0', at: Date.now()-86400000, source: 'user-confirmed' }] };
  await savePref('cost-basis-v1', book);
  const position = { ...asset, id: 'eth', quantity: '.65', price: 3000, value: 1950, type: 'wallet', verified: true, spam: false, displayable: true };
  const p = { wallets: [{ holding: { address: '0x'+'11'.repeat(20) }, state: { data: { positions: [position], complete: true }, history: [], historyLoaded: true, historyError: null, next: null }, stale: false }], arcus: [], total: 3000, partial: false, stale: false };
  const host = document.createElement('div'); host.id = 'cost-qa'; host.dir = 'rtl'; host.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow:auto;background:rgb(var(--c-canvas));padding:20px'; document.body.append(host);
  const root = createRoot(host); window.costQA = { book, p, root, React, MemoryRouter, CostSummaryPanel, savePref };
  root.render(React.createElement(MemoryRouter, null, React.createElement(CostSummaryPanel, { portfolio:p, links:[] })));
 });
 const host = page.locator('#cost-qa'); await host.getByRole('heading', { name: 'بهای خرید و سود و زیان', exact: true }).waitFor();
 for (const theme of ['light', 'dark']) {
  await page.evaluate(t => document.documentElement.classList.toggle('dark', t === 'dark'), theme);
  for (const width of [320,390,768,1280,1440]) {
   await page.setViewportSize({width,height:900});
   assert(await host.evaluate(el=>el.scrollWidth<=el.clientWidth+1), `overflow ${width} ${theme}`);
   if(width<1280) { await host.getByText('بهای خرید و جزئیات',{exact:true}).click(); assert(await host.evaluate(el=>el.scrollWidth<=el.clientWidth+1), `expanded overflow ${width}`); await host.getByText('بهای خرید و جزئیات',{exact:true}).click(); }
  }
 }
 assert((await host.innerText()).includes('۳۲۵'),await host.innerText()); assert((await host.innerText()).includes('۲۰'));
 await page.screenshot({path:'/tmp/darino-cost-desktop.png'});
 await page.setViewportSize({width:390,height:844}); await page.screenshot({path:'/tmp/darino-cost-mobile.png'});
 // Purchase updates must reflect immediately without page refresh.
 await page.evaluate(async()=>{const q=window.costQA;await q.savePref('cost-basis-v1',{...q.book,lots:[{...q.book.lots[0],unitCost:'2000'}]});});
 await host.getByText('۶۵۰',{exact:false}).last().waitFor();
 await page.evaluate(()=>{const q=window.costQA;q.p.wallets[0].state.historyLoaded=false;q.root.render(q.React.createElement(q.MemoryRouter,null,q.React.createElement(q.CostSummaryPanel,{portfolio:q.p,links:[]})));});
 await host.getByText('تاریخچه ناقص',{exact:true}).last().waitFor();
 assert(!(await host.innerText()).includes('۶۵۰'));
 await host.getByText('بهای خرید و جزئیات',{exact:true}).click(); assert((await host.innerText()).includes('۱,۳۰۰'));
 await page.evaluate(()=>{const q=window.costQA;q.p.wallets[0].state.historyLoaded=true;q.p.wallets[0].state.data.fetchedAt=Date.now();q.root.render(q.React.createElement(q.MemoryRouter,null,q.React.createElement(q.CostSummaryPanel,{portfolio:q.p,links:[]})));});
 await host.evaluate(el=>el.style.zIndex='1');
 await host.getByRole('button',{name:'بهای خرید اتریوم',exact:true}).last().click();
 const dialog=page.getByRole('dialog',{name:'بهای تمام‌شده',exact:true});await dialog.waitFor();
 assert.equal(await dialog.getByRole('textbox').count(),1);
 await dialog.getByLabel('بهای تمام‌شده · دلار',{exact:true}).fill('۱۶۲۵');
 assert((await dialog.innerText()).includes('۲,۵۰۰'));
 for(const width of [320,390,1440]) {await page.setViewportSize({width,height:900});assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),`editor overflow ${width}`);}
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);await page.screenshot({path:'/tmp/darino-basis-editor-mobile.png'});
 await dialog.getByRole('button',{name:'تأیید بهای تمام‌شده',exact:true}).click();await dialog.waitFor({state:'hidden'});
 assert((await host.innerText()).includes('۳۲۵'));
 const preserved=await page.evaluate(async()=>{const {getPref}=await import('/src/features/custody/data/repository.ts');const b=getPref('cost-basis-v1').value;return {lots:b.lots.length,total:b.currentBasis['fungible:ethereum'].total,qty:b.currentBasis['fungible:ethereum'].quantity};});
 assert.deepEqual(preserved,{lots:1,total:'1625',qty:'0.65'});
 // Verified native ETH without provider ID remains in the dashboard, and stale data can be saved explicitly.
 await page.evaluate(()=>{const q=window.costQA;q.p.wallets[0].state.data.positions[0].tokenId='';q.p.wallets[0].stale=true;q.root.render(q.React.createElement(q.MemoryRouter,null,q.React.createElement(q.CostSummaryPanel,{portfolio:q.p,links:[]})));});
 await host.getByRole('button',{name:'بهای خرید اتریوم',exact:true}).last().click();await dialog.waitFor();
 await dialog.getByLabel('بهای تمام‌شده · دلار',{exact:true}).fill('۱۶۰۰٫۵');
 assert(await dialog.getByRole('button',{name:'تأیید بهای تمام‌شده',exact:true}).isDisabled());
 await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'تأیید بهای تمام‌شده',exact:true}).click();await dialog.waitFor({state:'hidden'});
 await host.getByText('بهای ذخیره‌شده',{exact:true}).last().waitFor();
 assert.equal(await page.evaluate(async()=>{const {getPref}=await import('/src/features/custody/data/repository.ts');return getPref('cost-basis-v1').value.currentBasis['fungible:ethereum'].total;}),'1600.5');
 await page.evaluate(()=>{const q=window.costQA;q.p.wallets[0].stale=false;q.root.render(q.React.createElement(q.MemoryRouter,null,q.React.createElement(q.CostSummaryPanel,{portfolio:q.p,links:[]})));});
 await host.getByRole('button',{name:'بهای خرید اتریوم',exact:true}).last().click();await dialog.waitFor();await dialog.getByRole('button',{name:'تأیید بهای تمام‌شده',exact:true}).click();await dialog.waitFor({state:'hidden'});
 assert.equal(await page.evaluate(async()=>{const {getPref}=await import('/src/features/custody/data/repository.ts');return !!getPref('cost-basis-v1').value.currentBasis['fungible:ethereum'].pendingBalanceConfirmation;}),false);
 // All sources are editable as holdings; derivative API entries remain separate.
 await page.evaluate(async()=>{
  const q=window.costQA;const {useBorosAccount}=await import('/src/features/boros/data/useBorosAccount.ts');const now=Date.now(),address=q.p.wallets[0].holding.address,handle=address+'000002ffffff';
  q.p.arcus=[{holding:{label:'اصلی',arcus:{address,accountIndex:0,env:'mainnet'}},state:{account:{data:{netQuoteBalance:'100',equity:'150'},fetchedAt:now,error:null},positions:{data:[{marketId:1,marketDisplayName:'ETH-USD',side:'LONG',size:'2',averageEntryPrice:'2500',markPx:'3000',unrealizedPnl:'50',marginUsed:'30'}],fetchedAt:now,error:null}},stale:false}];
  useBorosAccount.setState({hydrated:true,root:'',data:{root:address,accountId:0,fetchedAt:now,syncedAt:now,assets:[{tokenId:2,symbol:'WETH',priceUsd:3000,logo:'/logos/token-eth.svg'}],balances:[{handle,tokenId:2,marketId:0xffffff,cash:.65,equity:.85,margin:.1,freeMargin:.75,maintenanceBuffer:.8}],positions:[{handle,marketId:128,tokenId:2,side:'long',size:20,fixedApr:.08,unrealized:.01,realizedTrade:.02,settlement:.03,liquidationApr:.12,matured:false}],orders:[],settlements:[],transfers:[],partial:false,historyComplete:true,errors:[]},error:null});
  q.root.render(q.React.createElement(q.MemoryRouter,null,q.React.createElement(q.CostSummaryPanel,{portfolio:q.p,links:[]})));
 });
 await host.getByRole('button',{name:'ویرایش بهای خرید اتر رپ شده · وثیقه بوروس · مشترک',exact:true}).last().waitFor();
 for(const width of [320,390,768,1280,1440]){await page.setViewportSize({width,height:950});assert(await host.evaluate(el=>el.scrollWidth<=el.clientWidth+1),`all-source overflow ${width}`);}
 await page.setViewportSize({width:390,height:950});
 await host.getByRole('button',{name:'ویرایش بهای خرید اتر رپ شده · وثیقه بوروس · مشترک',exact:true}).last().click();await dialog.waitFor();assert((await dialog.innerText()).includes('۰.۶۵'));
 await dialog.getByLabel('بهای تمام‌شده · دلار',{exact:true}).fill('۱۶۲۵');assert((await dialog.innerText()).includes('۲,۵۰۰'));await dialog.getByRole('button',{name:'تأیید بهای تمام‌شده',exact:true}).click();await dialog.waitFor({state:'hidden'});
 const scopes=await page.evaluate(async()=>{const {getPref}=await import('/src/features/custody/data/repository.ts');const b=getPref('cost-basis-v1').value;return Object.keys(b.currentBasis);});assert(scopes.includes('fungible:ethereum'));assert(scopes.some(k=>k.startsWith('boros:')));
 await host.getByRole('button',{name:'ویرایش بهای خرید یو اس دی جی · اعتبار آرکوس · اصلی',exact:true}).last().click();await dialog.waitFor();await dialog.getByLabel('بهای تمام‌شده · دلار',{exact:true}).fill('۹۰');await dialog.getByRole('button',{name:'تأیید بهای تمام‌شده',exact:true}).click();await dialog.waitFor({state:'hidden'});
 await host.evaluate(el=>el.style.zIndex='9999');await page.setViewportSize({width:1440,height:1100});await page.screenshot({path:'/tmp/darino-all-source-cost-desktop.png'});await page.setViewportSize({width:390,height:950});await host.getByRole('button',{name:'ویرایش بهای خرید اتر رپ شده · وثیقه بوروس · مشترک',exact:true}).last().scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/darino-all-source-cost-mobile.png'});
 await host.evaluate(el=>el.style.zIndex='1');
 // Avoid silently saving a typed total against a changed API quantity.
 await host.getByRole('button',{name:'ویرایش بهای خرید اتر رپ شده · وثیقه بوروس · مشترک',exact:true}).last().click();await dialog.waitFor();
 await page.evaluate(async()=>{const {useBorosAccount}=await import('/src/features/boros/data/useBorosAccount.ts');const s=useBorosAccount.getState();useBorosAccount.setState({data:{...s.data,balances:s.data.balances.map(b=>({...b,cash:1}))}});});
 await dialog.getByText('موجودی تغییر کرده است؛ پنل را ببندید و دوباره باز کنید.',{exact:true}).waitFor();assert(await dialog.getByRole('button',{name:'تأیید بهای تمام‌شده',exact:true}).isDisabled());
 assert.deepEqual(errors,[]);
 console.log('PASS: dashboard cost rows, Persian figures, 320/390/768/1280/1440 light/dark/touch, disclosure, reactive purchase update, one-field total-basis editor, automatic average, saved old-lot preservation, history gating, scoped Arcus/Boros edits, derivative separation and balance-change guard. No live provider or installed-PWA test.');
} finally {await browser.close();}
